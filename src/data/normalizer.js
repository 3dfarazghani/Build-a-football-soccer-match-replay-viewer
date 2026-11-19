import { PITCH } from './schema.js';

/**
 * Convert Metrica normalized [0, 1] top-left coordinates to pitch metres centered at (0, 0).
 * @param {number} nx
 * @param {number} ny
 * @returns {{x: number, y: number}}
 */
export function metricaToPitch(nx, ny) {
  return {
    x: (nx - 0.5) * PITCH.LENGTH,
    y: (ny - 0.5) * PITCH.WIDTH,
  };
}

/**
 * Future hook: elevate ball z in a parabolic arc during shots/passes/set pieces.
 * Currently returns ground resting radius (0.11m) since Metrica CSV has 2D ball coordinates.
 * @param {number} _t
 * @param {import('./schema.js').NormalizedEvent|null} _activeEvent
 * @returns {number}
 */
export function computeBallHeight(_t, _activeEvent = null) {
  return PITCH.BALL_RADIUS;
}

function readHeaderMeta(text) {
  let pos = 0;
  const lines = [];
  for (let r = 0; r < 3; r++) {
    const nl = text.indexOf('\n', pos);
    const end = nl === -1 ? text.length : nl;
    lines.push(text.slice(pos, end).replace(/\r$/, '').split(','));
    pos = nl === -1 ? text.length : nl + 1;
  }

  const jerseyRow = lines[1];
  const labelRow = lines[2];
  const players = [];
  let ballCol = -1;

  for (let c = 3; c < labelRow.length - 1; c += 2) {
    const label = (labelRow[c] || '').trim();
    if (label === 'Ball') {
      ballCol = c;
      break;
    }
    const id = (jerseyRow[c] || '').trim() || label.replace(/^Player/i, '').trim();
    if (id) players.push({ col: c, id });
  }

  return { dataOffset: pos, players, ballCol };
}

function scanFloatRow(text, start, end, out) {
  let col = 0;
  let fieldStart = start;
  const cleanEnd = end > start && text.charCodeAt(end - 1) === 13 ? end - 1 : end;
  for (let i = start; i <= cleanEnd; i++) {
    if (i === cleanEnd || text.charCodeAt(i) === 44) {
      const slice = text.slice(fieldStart, i);
      out[col++] = slice === '' || slice === 'NaN' ? NaN : Number(slice);
      fieldStart = i + 1;
    }
  }
  return col;
}

/**
 * Parse Home + Away Metrica tracking CSV texts into source-agnostic NormalizedFrames.
 * @param {string} homeCsv
 * @param {string} awayCsv
 * @returns {import('./schema.js').NormalizedFrame[]}
 */
export function normalizeTrackingCsvs(homeCsv, awayCsv) {
  const homeMeta = readHeaderMeta(homeCsv);
  const awayMeta = readHeaderMeta(awayCsv);

  const frames = [];
  const hRow = new Float64Array(48);
  const aRow = new Float64Array(48);
  let hPos = homeMeta.dataOffset;
  let aPos = awayMeta.dataOffset;
  const hLen = homeCsv.length;
  const aLen = awayCsv.length;

  while (hPos < hLen && aPos < aLen) {
    let hNl = homeCsv.indexOf('\n', hPos);
    if (hNl === -1) hNl = hLen;
    let aNl = awayCsv.indexOf('\n', aPos);
    if (aNl === -1) aNl = aLen;

    if (hNl > hPos && aNl > aPos) {
      scanFloatRow(homeCsv, hPos, hNl, hRow);
      scanFloatRow(awayCsv, aPos, aNl, aRow);

      const t = hRow[2];
      if (Number.isFinite(t)) {
        const players = [];

        for (let i = 0; i < homeMeta.players.length; i++) {
          const meta = homeMeta.players[i];
          const nx = hRow[meta.col];
          const ny = hRow[meta.col + 1];
          if (Number.isFinite(nx) && Number.isFinite(ny)) {
            players.push({
              id: meta.id,
              team: 'home',
              x: (nx - 0.5) * PITCH.LENGTH,
              y: (ny - 0.5) * PITCH.WIDTH,
            });
          }
        }

        for (let i = 0; i < awayMeta.players.length; i++) {
          const meta = awayMeta.players[i];
          const nx = aRow[meta.col];
          const ny = aRow[meta.col + 1];
          if (Number.isFinite(nx) && Number.isFinite(ny)) {
            players.push({
              id: meta.id,
              team: 'away',
              x: (nx - 0.5) * PITCH.LENGTH,
              y: (ny - 0.5) * PITCH.WIDTH,
            });
          }
        }

        const bxNorm = homeMeta.ballCol >= 0 ? hRow[homeMeta.ballCol] : NaN;
        const byNorm = homeMeta.ballCol >= 0 ? hRow[homeMeta.ballCol + 1] : NaN;
        const ball = Number.isFinite(bxNorm) && Number.isFinite(byNorm)
          ? {
              x: (bxNorm - 0.5) * PITCH.LENGTH,
              y: (byNorm - 0.5) * PITCH.WIDTH,
              z: computeBallHeight(t),
            }
          : { x: NaN, y: NaN, z: PITCH.BALL_RADIUS };

        frames.push({ t, ball, players });
      }
    }

    hPos = hNl + 1;
    aPos = aNl + 1;
  }

  return frames;
}

function classifyEventType(rawType, rawSubtype) {
  const t = rawType.toUpperCase();
  const s = rawSubtype.toUpperCase();
  if (t === 'SHOT') return s.includes('GOAL') ? 'goal' : 'shot';
  if (t === 'PASS') return 'pass';
  if (t === 'CARD') return 'card';
  if (t === 'SET PIECE') return 'set_piece';
  if (t.includes('FAULT') || s.includes('FAULT')) return 'foul';
  return t.toLowerCase().replace(/\s+/g, '_');
}

export function normalizeEventsCsv(eventsCsv) {
  const lines = eventsCsv.split(/\r?\n/);
  const events = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    const cols = line.split(',');
    if (cols.length < 10) continue;

    const rawTeam = cols[0].trim().toLowerCase();
    const team = rawTeam === 'home' || rawTeam === 'away' ? rawTeam : 'neutral';
    const rawType = cols[1].trim();
    const subtype = cols[2].trim();
    const t = Number(cols[5]);
    if (!Number.isFinite(t)) continue;

    const playerId = cols[8].trim().replace(/^Player/i, '');
    const sx = Number(cols[10]);
    const sy = Number(cols[11]);
    const type = classifyEventType(rawType, subtype);
    const teamLabel = team === 'neutral' ? '' : team === 'home' ? 'Home' : 'Away';
    const typeLabel = type.replace(/_/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());

    events.push({
      t,
      endT: Number(cols[7]) || t,
      type,
      subtype,
      team,
      playerId,
      x: Number.isFinite(sx) ? (sx - 0.5) * PITCH.LENGTH : NaN,
      y: Number.isFinite(sy) ? (sy - 0.5) * PITCH.WIDTH : NaN,
      label: `${teamLabel} ${typeLabel}${playerId ? ` #${playerId}` : ''}`.trim(),
      period: Number(cols[3]) || 1,
    });
  }

  return events;
}
