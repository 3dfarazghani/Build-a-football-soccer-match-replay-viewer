import { PITCH } from '../data/schema.js';

const MAX_POOL_PLAYERS = 28;
const MAX_LIVE_BUFFER_FRAMES = 4500; // Keep last 3 minutes of 25 Hz live buffer

export class Timeline {
  /**
   * @param {{bufferDelay?: number, loop?: boolean, speed?: number}} [options]
   */
  constructor(options = {}) {
    this.bufferDelay = options.bufferDelay ?? 0;
    this.loop = options.loop ?? false;
    this.speed = options.speed ?? 1;
    this.playing = false;
    this.liveMode = false;

    this.frames = [];
    this.events = [];
    this._eventKeys = new Set();
    this.startTime = 0;
    this.endTime = 0;
    this.duration = 0;
    this.currentTime = 0;

    // Pre-allocated output frame & player objects to avoid per-frame GC in render loop
    this._sampledPlayers = Array.from({ length: MAX_POOL_PLAYERS }, () => ({
      id: '',
      team: 'home',
      jersey: 0,
      isGk: false,
      x: 0,
      y: 0,
    }));
    this._sampledFrame = {
      t: 0,
      ball: { x: 0, y: 0, z: PITCH.BALL_RADIUS },
      players: [],
    };
    this._bLookup = new Map();
  }

  setBufferDelay(seconds) {
    this.bufferDelay = Math.max(0, seconds);
  }

  /**
   * @param {import('../data/schema.js').MatchDataset} dataset
   * @param {{live?: boolean}} [opts]
   */
  setData(dataset, opts = {}) {
    this.liveMode = Boolean(opts.live);
    this.frames = dataset.frames ? [...dataset.frames] : [];
    this.events = [];
    this._eventKeys.clear();
    for (const ev of dataset.events || []) this.pushEvent(ev);

    this.startTime = dataset.startTime ?? 0;
    this.endTime = dataset.endTime ?? 0;
    this.duration = Math.max(0, this.endTime - this.startTime);
    this.currentTime = this.liveMode ? this.endTime : this.startTime;
  }

  pushFrame(frame) {
    if (!this.frames.length) this.startTime = frame.t;
    this.frames.push(frame);
    if (this.liveMode && this.frames.length > MAX_LIVE_BUFFER_FRAMES) {
      this.frames.shift();
      this.startTime = this.frames[0].t;
      if (this.currentTime < this.startTime) this.currentTime = this.startTime;
    }
    this.endTime = frame.t;
    this.duration = Math.max(0, this.endTime - this.startTime);
  }

  pushEvent(ev) {
    const key = `${ev.t}_${ev.type}_${ev.team}_${ev.playerId}`;
    if (this._eventKeys.has(key)) return false;
    this._eventKeys.add(key);
    this.events.push(ev);
    return true;
  }

  jumpToLiveEdge() {
    this.currentTime = this.endTime;
    this.speed = 1;
    this.playing = true;
  }

  play() {
    if (!this.liveMode && this.currentTime >= this.endTime && this.duration > 0) {
      this.currentTime = this.startTime;
    }
    this.playing = true;
  }

  pause() {
    this.playing = false;
  }

  togglePlay() {
    if (this.playing) this.pause();
    else this.play();
    return this.playing;
  }

  setSpeed(speed) {
    this.speed = Math.max(0.25, Math.min(4, speed));
  }

  seek(t) {
    this.currentTime = Math.max(this.startTime, Math.min(this.endTime, t));
  }

  step(deltaSeconds) {
    this.seek(this.currentTime + deltaSeconds);
  }

  update(dt) {
    if (!this.playing || this.frames.length < 2) return;
    this.currentTime += dt * this.speed;

    if (this.liveMode) {
      // Keep live playback locked within the buffered stream window
      if (this.currentTime > this.endTime) this.currentTime = this.endTime;
      return;
    }

    if (this.currentTime >= this.endTime) {
      if (this.loop) this.currentTime = this.startTime;
      else {
        this.currentTime = this.endTime;
        this.playing = false;
      }
    }
  }

  /**
   * Binary search + linear interpolation between adjacent 25 Hz frames.
   * @param {number} [t]
   * @returns {import('../data/schema.js').NormalizedFrame|null}
   */
  sample(t = this.currentTime) {
    const frames = this.frames;
    const count = frames.length;
    if (count === 0) return null;

    const effectiveT = Math.max(this.startTime, Math.min(this.endTime, t - this.bufferDelay));
    if (count === 1 || effectiveT <= frames[0].t) return frames[0];
    if (effectiveT >= frames[count - 1].t) return frames[count - 1];

    let lo = 0;
    let hi = count - 1;
    while (lo + 1 < hi) {
      const mid = (lo + hi) >> 1;
      if (frames[mid].t <= effectiveT) lo = mid;
      else hi = mid;
    }

    const f0 = frames[lo];
    const f1 = frames[hi];
    const span = f1.t - f0.t;
    const alpha = span > 1e-6 ? (effectiveT - f0.t) / span : 0;

    const b0 = f0.ball;
    const b1 = f1.ball;
    const outBall = this._sampledFrame.ball;
    if (Number.isFinite(b0.x) && Number.isFinite(b1.x)) {
      outBall.x = b0.x + (b1.x - b0.x) * alpha;
      outBall.y = b0.y + (b1.y - b0.y) * alpha;
      outBall.z = b0.z + (b1.z - b0.z) * alpha;
    } else if (Number.isFinite(b0.x)) {
      outBall.x = b0.x;
      outBall.y = b0.y;
      outBall.z = b0.z;
    } else {
      outBall.x = NaN;
      outBall.y = NaN;
      outBall.z = PITCH.BALL_RADIUS;
    }

    this._bLookup.clear();
    for (let i = 0; i < f1.players.length; i++) {
      this._bLookup.set(f1.players[i].id, f1.players[i]);
    }

    const outPlayers = this._sampledFrame.players;
    outPlayers.length = 0;

    for (let i = 0; i < f0.players.length && outPlayers.length < MAX_POOL_PLAYERS; i++) {
      const p0 = f0.players[i];
      const p1 = this._bLookup.get(p0.id);
      const slot = this._sampledPlayers[outPlayers.length];
      slot.id = p0.id;
      slot.team = p0.team;
      slot.jersey = p0.jersey || 0;
      slot.isGk = Boolean(p0.isGk);
      if (p1) {
        slot.x = p0.x + (p1.x - p0.x) * alpha;
        slot.y = p0.y + (p1.y - p0.y) * alpha;
      } else {
        slot.x = p0.x;
        slot.y = p0.y;
      }
      outPlayers.push(slot);
    }

    this._sampledFrame.t = effectiveT;
    return this._sampledFrame;
  }
}
