import './index.css';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { createStadium } from './scene/Stadium.js';
import { Players } from './scene/Players.js';
import { Ball } from './scene/Ball.js';
import { CameraRig } from './cameras/CameraRig.js';
import { Timeline } from './timeline/Timeline.js';
import { ReplaySource, createStaticKickoffFrame } from './sources/ReplaySource.js';
import { LiveSource } from './sources/LiveSource.js';
import { HudlOpenSource, HUDL_REPO_URL } from './sources/HudlOpenSource.js';
import { computeMatchStats, METRICA_DATASET_INFO } from './data/matchStats.js';
import { Controls } from './ui/Controls.js';
import { StatsPanel } from './ui/StatsPanel.js';
import { HudlBrowser } from './ui/HudlBrowser.js';

function detectSoftwareWebGL() {
  const probe = document.createElement('canvas').getContext('webgl2');
  if (!probe) return true;
  const ext = probe.getExtension('WEBGL_debug_renderer_info');
  const gpu = String(probe.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : probe.RENDERER));
  probe.getExtension('WEBGL_lose_context')?.loseContext();
  return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
}

const isSoftwareGl = detectSoftwareWebGL();
const appRoot = document.getElementById('app');

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b1016);
scene.fog = new THREE.FogExp2(0x0b1016, 0.0022);

const renderer = new THREE.WebGLRenderer({ antialias: !isSoftwareGl, powerPreference: 'high-performance' });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = !isSoftwareGl;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.domElement.className = 'block w-full h-full outline-none';
appRoot.appendChild(renderer.domElement);

const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
pmrem.dispose();

createStadium(scene, renderer);
const players = new Players(scene, renderer);
const ball = new Ball(scene, renderer);

const timeline = new Timeline({ bufferDelay: 0, loop: false, speed: 1 });
timeline.setData({ frames: [createStaticKickoffFrame()], events: [], startTime: 0, endTime: 0, duration: 0 });

let controls;
const cameraRig = new CameraRig(renderer, { isSoftwareGl, onModeChange: (m) => controls?.setCameraMode(m) });
const statsPanel = new StatsPanel(appRoot, { onClose: () => controls?.setStatsActive(false) });

const replaySource = new ReplaySource();
const liveSource = new LiveSource();
const hudlSource = new HudlOpenSource();
let activeMode = 'metrica';
let lastHudlMatch = null;
let switchToken = 0;

async function loadHudlMatch(matchMeta) {
  const token = ++switchToken;
  activeMode = 'hudl';
  lastHudlMatch = matchMeta;
  liveSource.disconnect();
  controls.setSourceMode('hudl');
  timeline.setBufferDelay(0);
  timeline.setSpeed(1);
  controls.setSpeed(1);

  try {
    const dataset = await hudlSource.loadMatch(matchMeta, (st) => {
      if (token === switchToken) controls.setStatus(st);
    });
    if (token !== switchToken) return;
    const { meta } = dataset;
    timeline.setData(dataset, { live: false });
    controls.setTimelineData(dataset.startTime, dataset.duration, dataset.events);
    controls.setTeamNames(meta.homeName, meta.awayName);
    controls.setStatus(`${meta.homeName} vs ${meta.awayName} · ${meta.has360 ? 'Hudl 360' : 'Events'}`);
    statsPanel.setDatasetMeta({
      homeName: meta.homeName,
      awayName: meta.awayName,
      datasetName: `${meta.competition} ${meta.season}`.trim(),
      rateLabel: `${meta.has360 ? '360 Freeze Frames' : 'Event Keyframes'} · 105m × 68m`,
      url: HUDL_REPO_URL,
      linkLabel: 'Hudl Open Data Repository',
    });
    statsPanel.setStreamInfo('Hudl Open Data', meta.has360 ? '360 + Events JSON' : 'Events JSON');
    timeline.play();
  } catch (err) {
    if (token !== switchToken) return;
    console.error(err);
    controls.setStatus('Failed to load Hudl match');
    statsPanel.setStreamInfo('Hudl Open Data', 'Fetch Error');
  }
}

const hudlBrowser = new HudlBrowser(appRoot, hudlSource, {
  onSelectMatch: (matchMeta) => loadHudlMatch(matchMeta),
  onClose: () => {
    if (activeMode === 'hudl' && !lastHudlMatch) switchSource('metrica');
  },
});

async function switchSource(mode) {
  if (mode === 'hudl') {
    activeMode = 'hudl';
    controls.setSourceMode('hudl');
    if (lastHudlMatch) await loadHudlMatch(lastHudlMatch);
    else hudlBrowser.show();
    return;
  }

  const token = ++switchToken;
  activeMode = mode;
  liveSource.disconnect();
  controls.setSourceMode(mode);
  controls.setTeamNames('Home', 'Away');
  statsPanel.setDatasetMeta({
    homeName: 'Home',
    awayName: 'Away',
    datasetName: METRICA_DATASET_INFO.name,
    rateLabel: `${METRICA_DATASET_INFO.sampleRateHz} Hz · ${METRICA_DATASET_INFO.pitchLabel}`,
    url: METRICA_DATASET_INFO.url,
    linkLabel: 'Metrica Sample_Game_1 Repository',
  });

  if (mode === 'metrica') {
    timeline.setBufferDelay(0);
    timeline.setSpeed(1);
    controls.setSpeed(1);
    statsPanel.setStreamInfo('Recorded Replay', 'Loading CSVs...');
    try {
      const dataset = await replaySource.load((st) => {
        if (token === switchToken) controls.setStatus(st);
      });
      if (token !== switchToken) return;
      timeline.setData(dataset, { live: false });
      controls.setTimelineData(dataset.startTime, dataset.duration, dataset.events);
      controls.setStatus(`Sample Game 1 · 25 Hz · ${dataset.frames.length.toLocaleString()} frames`);
      statsPanel.setStreamInfo('Recorded Replay', 'Local CSV · 25 Hz');
      timeline.play();
    } catch (err) {
      if (token !== switchToken) return;
      console.error(err);
      controls.setStatus('Static formation (CSV data missing)');
      statsPanel.setStreamInfo('Recorded Replay', 'Fallback Static');
    }
    return;
  }

  timeline.setBufferDelay(2.5);
  timeline.setSpeed(1);
  statsPanel.setStreamInfo('Live WebSocket (2.5s buffer)', 'Connecting...');
  try {
    const initDataset = await liveSource.load((st) => {
      if (token === switchToken) {
        controls.setStatus(st);
        statsPanel.setStreamInfo('Live WebSocket (2.5s buffer)', st);
      }
    });
    if (token !== switchToken) return;
    timeline.setData(initDataset, { live: true });
    controls.setTimelineData(timeline.startTime, timeline.duration, timeline.events);
    timeline.play();

    liveSource.subscribe(
      (frame) => {
        timeline.pushFrame(frame);
        controls.setTimelineBounds(timeline.startTime, timeline.duration);
      },
      (ev) => {
        if (timeline.pushEvent(ev) && (ev.type === 'goal' || ev.type === 'shot' || ev.type === 'card')) {
          controls.setTimelineData(timeline.startTime, timeline.duration, timeline.events);
        }
      },
      (st) => {
        controls.setStatus(st);
        statsPanel.setStreamInfo('Live WebSocket (2.5s buffer)', st);
      },
      (reinitDataset) => {
        timeline.setData(reinitDataset, { live: true });
        controls.setTimelineData(timeline.startTime, timeline.duration, timeline.events);
        timeline.play();
      }
    );
  } catch (err) {
    if (token !== switchToken) return;
    console.error(err);
    controls.setStatus('WebSocket unavailable — check server');
    statsPanel.setStreamInfo('Live WebSocket', 'Connection Failed');
  }
}

controls = new Controls(appRoot, {
  onTogglePlay: () => timeline.togglePlay(),
  onStep: (sec) => timeline.step(sec),
  onSeek: (t) => timeline.seek(t),
  onLiveEdge: () => timeline.jumpToLiveEdge(),
  onBrowseHudl: () => hudlBrowser.show(),
  onSpeedChange: (speed) => timeline.setSpeed(speed),
  onCameraChange: (mode) => cameraRig.setMode(mode),
  onToggleNumbers: (enabled) => players.setShowNumbers(enabled),
  onSourceChange: (mode) => {
    if (mode === 'hudl') hudlBrowser.show();
    else if (mode !== activeMode) switchSource(mode);
  },
  onToggleStats: () => controls.setStatsActive(statsPanel.toggle()),
  onJumpToEvent: (eventTime) => {
    timeline.seek(Math.max(timeline.startTime, eventTime - 3));
    timeline.play();
  },
});

if (!isSoftwareGl) renderer.compile(scene, cameraRig.camera);
switchSource('metrica');

window.addEventListener('resize', () => {
  cameraRig.onResize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
});

let contextLost = false;
renderer.domElement.addEventListener('webglcontextlost', (e) => { e.preventDefault(); contextLost = true; });
renderer.domElement.addEventListener('webglcontextrestored', () => { contextLost = false; });

window.addEventListener('keydown', (e) => {
  const tag = e.target?.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
  if (e.code === 'Space') { e.preventDefault(); timeline.togglePlay(); }
  else if (e.code === 'ArrowLeft') { e.preventDefault(); timeline.step(-5); }
  else if (e.code === 'ArrowRight') { e.preventDefault(); timeline.step(5); }
  else if (e.key === '1') cameraRig.setMode(1);
  else if (e.key === '2') cameraRig.setMode(2);
  else if (e.key === '3') cameraRig.setMode(3);
  else if (e.key === 'h' || e.key === 'H') controls.toggleCollapsed();
  else if (e.key === 'f' || e.key === 'F') controls.toggleFps();
});

let lastNow = performance.now();
let fpsAcc = 0;
let fpsFrames = 0;
let statsAcc = 0;
let frameId = 0;

function afterDraw(cb) {
  const gl = renderer.getContext();
  const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
  gl.flush();
  const poll = () => {
    const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
    if (state === gl.UNSIGNALED) frameId = window.setTimeout(poll, 5);
    else { if (sync) gl.deleteSync(sync); frameId = window.setTimeout(cb, 80); }
  };
  frameId = window.setTimeout(poll, 5);
}

function tick() {
  const now = performance.now();
  const dt = Math.min((now - lastNow) / 1000, 0.1);
  lastNow = now;
  fpsAcc += dt;
  fpsFrames += 1;
  statsAcc += dt;
  if (fpsAcc >= 0.4) {
    controls.updateFps(fpsFrames / fpsAcc);
    fpsAcc = 0;
    fpsFrames = 0;
  }

  if (!contextLost) {
    timeline.update(dt);
    const frame = timeline.sample();
    if (frame) {
      players.update(frame.players, dt, cameraRig.camera);
      ball.update(frame.ball);
      cameraRig.update(dt, frame.ball);
    } else {
      cameraRig.update(dt, null);
    }

    if (statsPanel.open && statsAcc >= 0.25) {
      statsAcc = 0;
      statsPanel.update(computeMatchStats(timeline.frames, timeline.events, timeline.currentTime, frame), timeline.currentTime);
    }

    controls.updatePlayback(timeline.currentTime, timeline.playing);
    renderer.render(scene, cameraRig.camera);
  }

  if (isSoftwareGl) afterDraw(tick);
  else frameId = requestAnimationFrame(tick);
}

tick();
