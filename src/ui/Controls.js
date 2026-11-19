function formatClock(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

const SPEEDS = [0.25, 0.5, 1, 2, 4];
const CAMS = [[1, '1 Tactical'], [2, '2 Broadcast'], [3, '3 Orbit']];

export class Controls {
  constructor(container, handlers) {
    this.handlers = handlers;
    this.collapsed = false;
    this.highlightsOpen = false;
    this.fpsVisible = false;
    this.numbersVisible = true;
    this.statsOpen = false;
    this.duration = 0;
    this.startTime = 0;
    this.seeking = false;

    this.root = document.createElement('div');
    this.root.className = 'pointer-events-none fixed inset-0 z-10 flex flex-col justify-between p-4';
    this.root.innerHTML = `
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div class="pointer-events-auto hud-surface rounded-lg px-3.5 py-2 flex flex-wrap items-center gap-3.5">
          <span class="font-display text-lg font-bold tracking-tight text-slate-50 whitespace-nowrap">PitchLine 3D</span>
          <div class="flex items-center gap-1 bg-slate-900/90 p-0.5 rounded-md border border-white/10" data-role="source-group">
            <button data-source="metrica" type="button" class="px-2.5 py-1 rounded text-[11px] font-medium bg-emerald-600 text-white cursor-pointer whitespace-nowrap">Metrica</button>
            <button data-source="hudl" type="button" class="px-2.5 py-1 rounded text-[11px] font-medium text-slate-400 hover:text-white cursor-pointer whitespace-nowrap">Hudl Data</button>
            <button data-source="live" type="button" class="px-2.5 py-1 rounded text-[11px] font-medium text-slate-400 hover:text-white cursor-pointer whitespace-nowrap">Live Feed</button>
          </div>
          <button data-action="browse-hudl" type="button" class="hidden px-2.5 py-1 rounded-md bg-sky-600/90 hover:bg-sky-500 text-[11px] font-medium text-white cursor-pointer whitespace-nowrap">Change Match</button>
          <div class="flex items-center gap-2 text-xs text-slate-300 whitespace-nowrap">
            <span class="inline-block w-2.5 h-2.5 rounded-xs bg-rose-600"></span><span data-role="home-label">Home</span>
            <span class="text-slate-500">·</span>
            <span class="inline-block w-2.5 h-2.5 rounded-xs bg-sky-600"></span><span data-role="away-label">Away</span>
            <span class="text-slate-500">·</span>
            <span data-role="status" class="text-slate-400">Initializing pitch...</span>
          </div>
        </div>
        <div class="pointer-events-auto flex items-center gap-2">
          <div data-role="fps-readout" class="hidden hud-surface rounded-lg px-2.5 py-1.5 font-mono-tabular text-xs text-emerald-300 whitespace-nowrap">-- FPS</div>
          <button data-action="toggle-fps" type="button" class="hud-surface rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-300 hover:text-white cursor-pointer whitespace-nowrap">FPS</button>
          <button data-action="toggle-numbers" type="button" class="hud-surface rounded-lg px-2.5 py-1.5 text-xs font-medium text-white bg-slate-800/80 hover:text-white cursor-pointer whitespace-nowrap"># Numbers</button>
          <button data-action="toggle-stats" type="button" class="hud-surface rounded-lg px-3 py-1.5 text-xs font-medium text-sky-300 hover:text-white cursor-pointer whitespace-nowrap">Match Info &amp; Stats</button>
        </div>
      </div>

      <div class="relative w-full flex justify-center">
        <div data-role="dock" class="pointer-events-auto hud-dock relative w-[min(980px,96vw)]">
          <button data-action="toggle-dock" type="button" class="hud-surface rounded-t-lg border-b-0 px-3 py-1 text-[11px] font-medium text-slate-300 hover:text-white absolute -top-7 left-1/2 -translate-x-1/2 cursor-pointer whitespace-nowrap">▾ Hide Controls</button>
          <div data-role="highlights-panel" class="hidden hud-surface rounded-xl mb-2 p-2.5 max-h-56 overflow-y-auto">
            <div class="flex items-center justify-between px-1 pb-2 border-b border-white/10">
              <span class="text-xs font-semibold text-slate-200">Match Highlights (Goals &amp; Shots)</span>
              <span data-role="highlights-count" class="text-xs text-slate-400 font-mono-tabular">0 events</span>
            </div>
            <div data-role="highlights-list" class="mt-1.5 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-1.5"></div>
          </div>

          <div class="hud-surface rounded-xl px-4 py-3 flex flex-col gap-2.5">
            <div class="relative flex items-center h-6">
              <div data-role="scrubber-track" class="relative w-full h-2 rounded-full bg-slate-800 cursor-pointer">
                <div data-role="scrubber-fill" class="absolute inset-y-0 left-0 rounded-full bg-emerald-500 pointer-events-none" style="width: 0%"></div>
                <div data-role="markers" class="absolute inset-0 pointer-events-auto"></div>
                <div data-role="scrubber-thumb" class="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3.5 h-3.5 rounded-full bg-white shadow pointer-events-none" style="left: 0%"></div>
              </div>
            </div>
            <div class="flex flex-wrap items-center justify-between gap-2">
              <div class="flex items-center gap-1.5">
                <button data-action="step-back" type="button" class="px-2.5 py-1.5 rounded-md bg-slate-800/80 hover:bg-slate-700 text-xs font-medium text-slate-200 cursor-pointer whitespace-nowrap">-5s</button>
                <button data-action="play-pause" type="button" class="px-3.5 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white cursor-pointer whitespace-nowrap min-w-[70px]">Play</button>
                <button data-action="step-fwd" type="button" class="px-2.5 py-1.5 rounded-md bg-slate-800/80 hover:bg-slate-700 text-xs font-medium text-slate-200 cursor-pointer whitespace-nowrap">+5s</button>
                <button data-action="live-edge" type="button" class="hidden px-2.5 py-1.5 rounded-md bg-rose-600/90 hover:bg-rose-500 text-xs font-semibold text-white cursor-pointer whitespace-nowrap">Live Edge</button>
                <span data-role="time" class="ml-2 font-mono-tabular text-xs text-slate-200 whitespace-nowrap">00:00 / 00:00</span>
              </div>
              <div class="flex items-center gap-1 bg-slate-900/90 p-0.5 rounded-lg border border-white/10" data-role="speed-group">
                ${SPEEDS.map((s) => `<button data-speed="${s}" type="button" class="px-2 py-1 rounded text-[11px] font-mono-tabular cursor-pointer whitespace-nowrap ${s === 1 ? 'bg-slate-700 text-white font-semibold' : 'text-slate-400 hover:text-white'}">${s}×</button>`).join('')}
              </div>
              <div class="flex items-center gap-1 bg-slate-900/90 p-0.5 rounded-lg border border-white/10" data-role="cam-group">
                ${CAMS.map(([m, label]) => `<button data-cam="${m}" type="button" class="px-2.5 py-1 rounded text-[11px] font-medium cursor-pointer whitespace-nowrap ${m === 2 ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'}">${label}</button>`).join('')}
              </div>
              <button data-action="toggle-highlights" type="button" class="px-3 py-1.5 rounded-md bg-slate-800/80 hover:bg-slate-700 text-xs font-medium text-amber-300 cursor-pointer whitespace-nowrap">Highlights</button>
            </div>
          </div>
        </div>
        <button data-action="show-dock" type="button" class="hidden pointer-events-auto hud-surface rounded-lg px-3.5 py-1.5 text-xs font-medium text-slate-200 hover:text-white cursor-pointer whitespace-nowrap">▴ Show Controls</button>
      </div>
    `;

    container.appendChild(this.root);
    const q = (s) => this.root.querySelector(s);
    this.el = {
      status: q('[data-role="status"]'), homeLabel: q('[data-role="home-label"]'), awayLabel: q('[data-role="away-label"]'),
      fps: q('[data-role="fps-readout"]'), dock: q('[data-role="dock"]'),
      showDock: q('[data-action="show-dock"]'), playPause: q('[data-action="play-pause"]'), time: q('[data-role="time"]'),
      track: q('[data-role="scrubber-track"]'), fill: q('[data-role="scrubber-fill"]'), thumb: q('[data-role="scrubber-thumb"]'),
      markers: q('[data-role="markers"]'), speedGroup: q('[data-role="speed-group"]'), camGroup: q('[data-role="cam-group"]'),
      srcGroup: q('[data-role="source-group"]'), browseHudl: q('[data-action="browse-hudl"]'), liveEdge: q('[data-action="live-edge"]'),
      hiPanel: q('[data-role="highlights-panel"]'), hiList: q('[data-role="highlights-list"]'), hiCount: q('[data-role="highlights-count"]'),
      numBtn: q('[data-action="toggle-numbers"]'), fpsBtn: q('[data-action="toggle-fps"]'), statsBtn: q('[data-action="toggle-stats"]'),
    };
    this._bindEvents();
  }

  _bindEvents() {
    this.root.addEventListener('click', (e) => {
      const btn = e.target.closest('button');
      if (!btn) return;
      const a = btn.dataset.action;
      if (a === 'play-pause') this.handlers.onTogglePlay?.();
      else if (a === 'step-back') this.handlers.onStep?.(-5);
      else if (a === 'step-fwd') this.handlers.onStep?.(5);
      else if (a === 'live-edge') this.handlers.onLiveEdge?.();
      else if (a === 'browse-hudl') this.handlers.onBrowseHudl?.();
      else if (a === 'toggle-dock' || a === 'show-dock') this.toggleCollapsed();
      else if (a === 'toggle-highlights') this.toggleHighlights();
      else if (a === 'toggle-numbers') this.toggleNumbers();
      else if (a === 'toggle-fps') this.toggleFps();
      else if (a === 'toggle-stats') this.handlers.onToggleStats?.();
      else if (btn.dataset.speed) this.setSpeed(Number(btn.dataset.speed));
      else if (btn.dataset.cam) this.handlers.onCameraChange?.(Number(btn.dataset.cam));
      else if (btn.dataset.source) this.handlers.onSourceChange?.(btn.dataset.source);
      else if (btn.dataset.jumpTime) this.handlers.onJumpToEvent?.(Number(btn.dataset.jumpTime));
    });

    const seekAt = (cx) => {
      if (this.duration <= 0) return;
      const r = this.el.track.getBoundingClientRect();
      this.handlers.onSeek?.(this.startTime + Math.max(0, Math.min(1, (cx - r.left) / r.width)) * this.duration);
    };
    this.el.track.addEventListener('pointerdown', (e) => {
      if (e.target.closest('[data-jump-time]')) return;
      this.seeking = true;
      this.el.track.setPointerCapture(e.pointerId);
      seekAt(e.clientX);
    });
    this.el.track.addEventListener('pointermove', (e) => { if (this.seeking) seekAt(e.clientX); });
    this.el.track.addEventListener('pointerup', () => { this.seeking = false; });
  }

  setStatus(text) { this.el.status.textContent = text; }

  setTeamNames(home = 'Home', away = 'Away') {
    this.el.homeLabel.textContent = home;
    this.el.awayLabel.textContent = away;
  }

  setSourceMode(mode) {
    const isLive = mode === 'live';
    const isHudl = mode === 'hudl';
    this.el.liveEdge.classList.toggle('hidden', !isLive);
    this.el.browseHudl.classList.toggle('hidden', !isHudl);
    this.el.speedGroup.classList.toggle('hidden', isLive);
    for (const b of this.el.srcGroup.querySelectorAll('button')) {
      const active = b.dataset.source === mode;
      const activeCls = mode === 'live' ? 'bg-rose-600 text-white' : mode === 'hudl' ? 'bg-sky-600 text-white' : 'bg-emerald-600 text-white';
      b.className = `px-2.5 py-1 rounded text-[11px] font-medium cursor-pointer whitespace-nowrap ${active ? activeCls : 'text-slate-400 hover:text-white'}`;
    }
  }

  setStatsActive(active) {
    this.statsOpen = active;
    this.el.statsBtn.classList.toggle('text-white', active);
    this.el.statsBtn.classList.toggle('bg-slate-800/80', active);
  }

  setSpeed(speed) {
    this.handlers.onSpeedChange?.(speed);
    for (const b of this.el.speedGroup.querySelectorAll('button')) {
      const active = Number(b.dataset.speed) === speed;
      b.className = `px-2 py-1 rounded text-[11px] font-mono-tabular cursor-pointer whitespace-nowrap ${active ? 'bg-slate-700 text-white font-semibold' : 'text-slate-400 hover:text-white'}`;
    }
  }

  setCameraMode(mode) {
    for (const b of this.el.camGroup.querySelectorAll('button')) {
      const active = Number(b.dataset.cam) === mode;
      b.className = `px-2.5 py-1 rounded text-[11px] font-medium cursor-pointer whitespace-nowrap ${active ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'}`;
    }
  }

  toggleCollapsed() {
    this.collapsed = !this.collapsed;
    this.el.dock.classList.toggle('is-collapsed', this.collapsed);
    this.el.showDock.classList.toggle('hidden', !this.collapsed);
  }

  toggleHighlights() {
    this.highlightsOpen = !this.highlightsOpen;
    this.el.hiPanel.classList.toggle('hidden', !this.highlightsOpen);
  }

  toggleNumbers() {
    this.numbersVisible = !this.numbersVisible;
    this.el.numBtn.classList.toggle('text-white', this.numbersVisible);
    this.el.numBtn.classList.toggle('text-slate-400', !this.numbersVisible);
    this.handlers.onToggleNumbers?.(this.numbersVisible);
  }

  toggleFps() {
    this.fpsVisible = !this.fpsVisible;
    this.el.fps.classList.toggle('hidden', !this.fpsVisible);
    this.el.fpsBtn.classList.toggle('text-white', this.fpsVisible);
  }

  updateFps(fps) {
    if (this.fpsVisible) this.el.fps.textContent = `${Math.round(fps)} FPS`;
  }

  setTimelineBounds(startTime, duration) {
    this.startTime = startTime;
    this.duration = duration;
  }

  setTimelineData(startTime, duration, events) {
    this.setTimelineBounds(startTime, duration);
    const goals = events.filter((e) => e.type === 'goal');
    const shots = events.filter((e) => e.type === 'shot');
    const cards = events.filter((e) => e.type === 'card');

    this.el.markers.innerHTML = '';
    for (const ev of [...goals, ...shots, ...cards]) {
      if (duration <= 0) continue;
      const pct = Math.max(0, Math.min(100, ((ev.t - startTime) / duration) * 100));
      const dot = document.createElement('button');
      dot.type = 'button';
      dot.dataset.jumpTime = String(ev.t);
      dot.title = `${ev.label} (${formatClock(ev.t)}) — click to jump`;
      const cls = ev.type === 'goal' ? 'bg-emerald-400 w-2.5 h-2.5 -top-0.5 z-20 rotate-45' : ev.type === 'shot' ? 'bg-amber-400 w-1.5 h-2.5 -top-0.5 z-10' : 'bg-rose-400 w-1 h-2 top-0';
      dot.className = `absolute -translate-x-1/2 rounded-xs ${cls} cursor-pointer hover:scale-125 transition-transform`;
      dot.style.left = `${pct}%`;
      this.el.markers.appendChild(dot);
    }

    this.el.hiCount.textContent = `${goals.length} goals · ${shots.length} shots`;
    this.el.hiList.innerHTML = [...goals, ...shots].map((ev) => `
      <button data-jump-time="${ev.t}" type="button" class="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-md bg-slate-800/70 hover:bg-slate-700 text-left text-xs cursor-pointer transition-colors">
        <span class="truncate ${ev.type === 'goal' ? 'text-emerald-300' : 'text-amber-300'} font-medium">${ev.label}</span>
        <span class="font-mono-tabular text-slate-400 shrink-0">${formatClock(ev.t)}</span>
      </button>
    `).join('');
  }

  updatePlayback(currentTime, playing) {
    this.el.playPause.textContent = playing ? 'Pause' : 'Play';
    const pct = this.duration > 0 ? Math.max(0, Math.min(100, ((currentTime - this.startTime) / this.duration) * 100)) : 0;
    this.el.fill.style.width = `${pct}%`;
    this.el.thumb.style.left = `${pct}%`;
    this.el.time.textContent = `${formatClock(currentTime)} / ${formatClock(this.startTime + this.duration)}`;
  }
}
