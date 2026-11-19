import { METRICA_DATASET_INFO } from '../data/matchStats.js';

function formatClock(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

const STAT_ROWS = [
  ['shots', 'Total Shots'],
  ['shotsOnTarget', 'Shots on Target'],
  ['passes', 'Passes'],
  ['possessionPct', 'Pass Share %'],
  ['territoryPct', 'Attacking Half %'],
  ['setPieces', 'Set Pieces'],
  ['fouls', 'Fouls Won'],
  ['cards', 'Cards'],
  ['activePlayers', 'On Pitch'],
];

export class StatsPanel {
  /**
   * @param {HTMLElement} container
   * @param {{onClose?: () => void}} [handlers]
   */
  constructor(container, handlers = {}) {
    this.open = false;
    this.handlers = handlers;

    this.el = document.createElement('aside');
    this.el.className = 'pointer-events-auto fixed top-16 right-4 z-20 w-[min(360px,92vw)] max-h-[calc(100vh-11rem)] overflow-y-auto hud-surface rounded-xl p-4 hidden flex-col gap-3.5';
    this.el.innerHTML = `
      <div class="flex items-center justify-between border-b border-white/10 pb-2.5">
        <div>
          <h2 class="font-display text-base font-bold tracking-wide text-slate-50">Match Info &amp; Stats</h2>
          <p data-role="sub" class="text-[11px] text-slate-400">Live match breakdown at current timestamp</p>
        </div>
        <button data-action="close" type="button" class="px-2 py-1 rounded text-xs text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer">Close</button>
      </div>

      <div class="rounded-lg bg-slate-900/80 border border-white/10 p-3 flex items-center justify-between gap-2">
        <div class="flex items-center gap-2 min-w-0">
          <span class="w-2.5 h-2.5 rounded-xs bg-rose-600 shrink-0"></span>
          <span data-role="home-name" class="text-xs font-semibold text-slate-200 truncate">Home</span>
        </div>
        <div class="text-center shrink-0">
          <div data-role="score" class="font-display text-2xl font-bold text-white font-mono-tabular leading-none">0 - 0</div>
          <div data-role="clock" class="text-[11px] text-slate-400 font-mono-tabular mt-1">1H · 00:00</div>
        </div>
        <div class="flex items-center gap-2 min-w-0">
          <span data-role="away-name" class="text-xs font-semibold text-slate-200 truncate">Away</span>
          <span class="w-2.5 h-2.5 rounded-xs bg-sky-600 shrink-0"></span>
        </div>
      </div>

      <div data-role="rows" class="flex flex-col gap-2.5">
        ${STAT_ROWS.map(([key, label]) => `
          <div data-stat="${key}" class="flex flex-col gap-1">
            <div class="flex items-center justify-between text-xs">
              <span data-home class="font-mono-tabular font-medium text-rose-300">0</span>
              <span class="text-[11px] text-slate-400">${label}</span>
              <span data-away class="font-mono-tabular font-medium text-sky-300">0</span>
            </div>
            <div class="h-1.5 w-full rounded-full bg-slate-800 overflow-hidden flex">
              <div data-bar-home class="h-full bg-rose-600 transition-all duration-200" style="width: 50%"></div>
              <div data-bar-away class="h-full bg-sky-600 transition-all duration-200" style="width: 50%"></div>
            </div>
          </div>
        `).join('')}
      </div>

      <div class="border-t border-white/10 pt-3 flex flex-col gap-1.5 text-xs">
        <div class="font-semibold text-slate-200">Data Source &amp; Stream</div>
        <div class="flex justify-between gap-3 text-slate-400">
          <span>Dataset</span>
          <span data-role="dataset-name" class="text-slate-200 text-right truncate">${METRICA_DATASET_INFO.name}</span>
        </div>
        <div class="flex justify-between gap-3 text-slate-400">
          <span>Resolution · Pitch</span>
          <span data-role="dataset-rate" class="font-mono-tabular text-slate-200">${METRICA_DATASET_INFO.sampleRateHz} Hz · ${METRICA_DATASET_INFO.pitchLabel}</span>
        </div>
        <div class="flex justify-between gap-3 text-slate-400">
          <span>Active Mode</span>
          <span data-role="mode" class="font-mono-tabular text-emerald-300">Recorded Replay</span>
        </div>
        <div class="flex justify-between gap-3 text-slate-400">
          <span>Stream Status</span>
          <span data-role="conn" class="font-mono-tabular text-slate-200">Local CSV</span>
        </div>
        <a data-role="dataset-link" href="${METRICA_DATASET_INFO.url}" target="_blank" rel="noopener noreferrer" class="mt-1 inline-flex items-center justify-between px-2.5 py-1.5 rounded-md bg-slate-800/80 hover:bg-slate-700 text-sky-300 hover:text-sky-200 transition-colors">
          <span data-role="dataset-link-label">Metrica Sample_Game_1 Repository</span>
          <span aria-hidden="true">↗</span>
        </a>
      </div>
    `;

    container.appendChild(this.el);
    this.el.querySelector('[data-action="close"]').addEventListener('click', () => {
      this.setOpen(false);
      this.handlers.onClose?.();
    });

    this.elHomeName = this.el.querySelector('[data-role="home-name"]');
    this.elAwayName = this.el.querySelector('[data-role="away-name"]');
    this.elScore = this.el.querySelector('[data-role="score"]');
    this.elClock = this.el.querySelector('[data-role="clock"]');
    this.elMode = this.el.querySelector('[data-role="mode"]');
    this.elConn = this.el.querySelector('[data-role="conn"]');
    this.elDatasetName = this.el.querySelector('[data-role="dataset-name"]');
    this.elDatasetRate = this.el.querySelector('[data-role="dataset-rate"]');
    this.elDatasetLink = this.el.querySelector('[data-role="dataset-link"]');
    this.elDatasetLinkLabel = this.el.querySelector('[data-role="dataset-link-label"]');
    this.rowEls = new Map();
    for (const [key] of STAT_ROWS) {
      const row = this.el.querySelector(`[data-stat="${key}"]`);
      this.rowEls.set(key, {
        home: row.querySelector('[data-home]'),
        away: row.querySelector('[data-away]'),
        barHome: row.querySelector('[data-bar-home]'),
        barAway: row.querySelector('[data-bar-away]'),
      });
    }
  }

  setDatasetMeta({ homeName = 'Home', awayName = 'Away', datasetName, rateLabel, url, linkLabel }) {
    this.elHomeName.textContent = homeName;
    this.elAwayName.textContent = awayName;
    if (datasetName) this.elDatasetName.textContent = datasetName;
    if (rateLabel) this.elDatasetRate.textContent = rateLabel;
    if (url) this.elDatasetLink.href = url;
    if (linkLabel) this.elDatasetLinkLabel.textContent = linkLabel;
  }

  setOpen(open) {
    this.open = open;
    this.el.classList.toggle('hidden', !open);
    this.el.classList.toggle('flex', open);
  }

  toggle() {
    this.setOpen(!this.open);
    return this.open;
  }

  setStreamInfo(modeLabel, connLabel) {
    this.elMode.textContent = modeLabel;
    this.elConn.textContent = connLabel;
  }

  update(stats, currentTime) {
    if (!this.open || !stats) return;
    this.elScore.textContent = `${stats.goals.home} - ${stats.goals.away}`;
    this.elClock.textContent = `${stats.period}H · ${formatClock(currentTime)}`;

    for (const [key] of STAT_ROWS) {
      const pair = stats[key];
      const els = this.rowEls.get(key);
      if (!pair || !els) continue;
      els.home.textContent = String(pair.home);
      els.away.textContent = String(pair.away);
      const total = pair.home + pair.away;
      const homePct = total > 0 ? (pair.home / total) * 100 : 50;
      els.barHome.style.width = `${homePct.toFixed(1)}%`;
      els.barAway.style.width = `${(100 - homePct).toFixed(1)}%`;
    }
  }
}
