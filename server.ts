import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import { WebSocketServer, WebSocket } from 'ws';
import { normalizeTrackingCsvs, normalizeEventsCsv } from './src/data/normalizer.js';

const PORT = Number(process.env.PORT) || 3000;
const TICK_MS = 40;
const INIT_HISTORY_FRAMES = 150;
const HUDL_RAW_BASE = 'https://raw.githubusercontent.com/hudl/open-data/master/data';

const DATASET_META = {
  name: 'Metrica Sports Sample Game 1',
  url: 'https://github.com/metrica-sports/sample-data/tree/master/data/Sample_Game_1',
  sampleRateHz: 25,
  pitch: '105m × 68m',
};

const hudlCache = new Map<string, unknown>();

async function fetchHudlJson(relPath: string, allowMissing = false) {
  if (hudlCache.has(relPath)) return hudlCache.get(relPath);
  const res = await fetch(`${HUDL_RAW_BASE}/${relPath}`, { signal: AbortSignal.timeout(20000) });
  if (!res.ok) {
    if (allowMissing && res.status === 404) return null;
    throw new Error(`Hudl Open Data fetch failed (${res.status}) for ${relPath}`);
  }
  const json = await res.json();
  // Cap in-memory cache size to prevent unbounded growth across many matches
  if (hudlCache.size > 40) {
    const firstKey = hudlCache.keys().next().value;
    if (firstKey) hudlCache.delete(firstKey);
  }
  hudlCache.set(relPath, json);
  return json;
}

async function loadDataset() {
  const dataDir = path.resolve(process.cwd(), 'public', 'data');
  const [homeCsv, awayCsv, eventsCsv] = await Promise.all([
    fs.readFile(path.join(dataDir, 'Sample_Game_1_RawTrackingData_Home_Team.csv'), 'utf8'),
    fs.readFile(path.join(dataDir, 'Sample_Game_1_RawTrackingData_Away_Team.csv'), 'utf8'),
    fs.readFile(path.join(dataDir, 'Sample_Game_1_RawEventsData.csv'), 'utf8'),
  ]);
  return { frames: normalizeTrackingCsvs(homeCsv, awayCsv), events: normalizeEventsCsv(eventsCsv) };
}

async function main() {
  const app = express();
  const server = http.createServer(app);
  const wss = new WebSocketServer({ noServer: true });

  const { frames, events } = await loadDataset();
  let cursor = 0;
  let nextEventIdx = 0;
  const emittedEvents: ReturnType<typeof normalizeEventsCsv> = [];

  app.get('/api/dataset-info', (_req, res) => {
    res.json({
      ...DATASET_META,
      totalFrames: frames.length,
      totalEvents: events.length,
      durationSeconds: frames.length ? frames[frames.length - 1].t : 0,
    });
  });

  app.get('/api/hudl/competitions', async (_req, res) => {
    try {
      res.json(await fetchHudlJson('competitions.json'));
    } catch (err) {
      res.status(502).json({ error: (err as Error).message });
    }
  });

  app.get('/api/hudl/matches/:compId/:seasonId', async (req, res) => {
    const { compId, seasonId } = req.params;
    if (!/^\d+$/.test(compId) || !/^\d+$/.test(seasonId)) {
      res.status(400).json({ error: 'Invalid competition or season ID' });
      return;
    }
    try {
      res.json(await fetchHudlJson(`matches/${compId}/${seasonId}.json`));
    } catch (err) {
      res.status(502).json({ error: (err as Error).message });
    }
  });

  app.get('/api/hudl/match/:matchId', async (req, res) => {
    const { matchId } = req.params;
    if (!/^\d+$/.test(matchId)) {
      res.status(400).json({ error: 'Invalid match ID' });
      return;
    }
    try {
      const [matchEvents, lineups, threeSixty] = await Promise.all([
        fetchHudlJson(`events/${matchId}.json`),
        fetchHudlJson(`lineups/${matchId}.json`, true),
        fetchHudlJson(`three-sixty/${matchId}.json`, true),
      ]);
      res.json({
        events: matchEvents,
        lineups: lineups || [],
        threeSixty: threeSixty || [],
        has360: Array.isArray(threeSixty) && threeSixty.length > 0,
      });
    } catch (err) {
      res.status(502).json({ error: (err as Error).message });
    }
  });

  if (process.env.NODE_ENV === 'production') {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => res.sendFile(path.join(distDir, 'index.html')));
  } else {
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: 'spa' });
    app.use(vite.middlewares);
  }

  server.on('upgrade', (req, socket, head) => {
    const reqUrl = new URL(req.url || '/', `http://${req.headers.host}`);
    if (reqUrl.pathname !== '/ws') return;
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
  });

  wss.on('connection', (ws) => {
    const historyStart = Math.max(0, cursor - INIT_HISTORY_FRAMES);
    const initFrames = frames.slice(historyStart, cursor + 1);
    ws.send(JSON.stringify({
      type: 'stream:init',
      frames: initFrames,
      events: emittedEvents,
      startTime: initFrames[0]?.t ?? 0,
      currentTime: frames[cursor]?.t ?? 0,
      datasetMeta: DATASET_META,
    }));
  });

  setInterval(() => {
    if (wss.clients.size === 0 || frames.length === 0) return;
    cursor += 1;
    if (cursor >= frames.length) {
      cursor = 0;
      nextEventIdx = 0;
      emittedEvents.length = 0;
      const resetPayload = JSON.stringify({
        type: 'stream:init',
        frames: [frames[0]],
        events: [],
        startTime: frames[0].t,
        currentTime: frames[0].t,
        datasetMeta: DATASET_META,
      });
      for (const c of wss.clients) if (c.readyState === WebSocket.OPEN) c.send(resetPayload);
      return;
    }

    const frame = frames[cursor];
    const framePayload = JSON.stringify({ type: 'stream:frame', frame });
    for (const c of wss.clients) if (c.readyState === WebSocket.OPEN) c.send(framePayload);

    while (nextEventIdx < events.length && events[nextEventIdx].t <= frame.t) {
      const ev = events[nextEventIdx++];
      emittedEvents.push(ev);
      const evPayload = JSON.stringify({ type: 'stream:event', event: ev });
      for (const c of wss.clients) if (c.readyState === WebSocket.OPEN) c.send(evPayload);
    }
  }, TICK_MS);

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`PitchLine 3D server listening on http://0.0.0.0:${PORT} (${frames.length} frames loaded)`);
  });
}

main().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
