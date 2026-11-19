export class HudlBrowser {
  /**
   * @param {HTMLElement} container
   * @param {import('../sources/HudlOpenSource.js').HudlOpenSource} source
   * @param {{onSelectMatch: (m: Object) => void, onClose?: () => void}} handlers
   */
  constructor(container, source, handlers) {
    this.source = source;
    this.handlers = handlers;
    this.open = false;
    this.competitions = [];
    this.matches = [];
    this.selectedComp = null;

    this.root = document.createElement('div');
    this.root.className = 'hidden fixed inset-0 z-30 items-center justify-center p-4 bg-black/65 pointer-events-auto';
    this.root.innerHTML = `
      <div class="hud-surface rounded-xl w-[min(880px,96vw)] h-[min(580px,84vh)] flex flex-col overflow-hidden">
        <div class="flex items-center justify-between gap-4 px-5 py-3.5 border-b border-white/10">
          <div>
            <h2 class="font-display text-xl font-bold tracking-wide text-white">Hudl Open Data Browser</h2>
            <p class="text-xs text-slate-400">Live catalog from github.com/hudl/open-data · 360 tracking competitions listed first</p>
          </div>
          <button data-action="close" type="button" class="px-3 py-1.5 rounded-md bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 cursor-pointer">Close</button>
        </div>

        <div class="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-12">
          <div class="md:col-span-5 border-b md:border-b-0 md:border-r border-white/10 flex flex-col min-h-0">
            <div class="p-3 border-b border-white/10">
              <input data-role="comp-search" type="search" placeholder="Filter competitions or country..." class="w-full px-3 py-1.5 rounded-md bg-slate-900 border border-white/10 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-sky-500" />
            </div>
            <div data-role="comp-list" class="flex-1 overflow-y-auto p-2 flex flex-col gap-1"></div>
          </div>

          <div class="md:col-span-7 flex flex-col min-h-0">
            <div class="p-3 border-b border-white/10 flex items-center justify-between gap-2">
              <input data-role="match-search" type="search" placeholder="Filter teams or stage..." class="w-full px-3 py-1.5 rounded-md bg-slate-900 border border-white/10 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-sky-500" />
              <span data-role="match-count" class="font-mono-tabular text-[11px] text-slate-400 whitespace-nowrap shrink-0">0 matches</span>
            </div>
            <div data-role="match-list" class="flex-1 overflow-y-auto p-2 flex flex-col gap-1"></div>
          </div>
        </div>
      </div>
    `;

    container.appendChild(this.root);
    const q = (s) => this.root.querySelector(s);
    this.el = {
      compSearch: q('[data-role="comp-search"]'),
      compList: q('[data-role="comp-list"]'),
      matchSearch: q('[data-role="match-search"]'),
      matchList: q('[data-role="match-list"]'),
      matchCount: q('[data-role="match-count"]'),
    };
    this._bindEvents();
  }

  _bindEvents() {
    this.root.addEventListener('click', (e) => {
      if (e.target === this.root || e.target.closest('[data-action="close"]')) {
        this.hide();
        this.handlers.onClose?.();
        return;
      }
      const compBtn = e.target.closest('[data-comp-idx]');
      if (compBtn) {
        this.selectCompetition(this.filteredComps[Number(compBtn.dataset.compIdx)]);
        return;
      }
      const matchBtn = e.target.closest('[data-match-idx]');
      if (matchBtn) {
        const match = this.filteredMatches[Number(matchBtn.dataset.matchIdx)];
        if (match) {
          this.hide();
          this.handlers.onSelectMatch(match);
        }
        return;
      }
      if (e.target.closest('[data-action="retry-comps"]')) this.loadCompetitions();
    });

    this.el.compSearch.addEventListener('input', () => this._renderCompetitions());
    this.el.matchSearch.addEventListener('input', () => this._renderMatches());
  }

  async show() {
    this.open = true;
    this.root.classList.remove('hidden');
    this.root.classList.add('flex');
    if (this.competitions.length === 0) await this.loadCompetitions();
  }

  hide() {
    this.open = false;
    this.root.classList.add('hidden');
    this.root.classList.remove('flex');
  }

  async loadCompetitions() {
    this.el.compList.innerHTML = '<div class="p-4 text-xs text-slate-400">Loading Hudl competitions from GitHub...</div>';
    try {
      const list = await this.source.fetchCompetitions();
      // Prioritize competitions with StatsBomb 360 player tracking
      this.competitions = [...list].sort((a, b) => {
        const a360 = a.match_available_360 ? 1 : 0;
        const b360 = b.match_available_360 ? 1 : 0;
        if (a360 !== b360) return b360 - a360;
        return `${a.competition_name} ${b.season_name}`.localeCompare(`${b.competition_name} ${a.season_name}`);
      });
      this._renderCompetitions();
      const defaultComp = this.competitions.find((c) => c.competition_id === 43 && c.season_id === 106) || this.competitions[0];
      if (defaultComp) await this.selectCompetition(defaultComp);
    } catch (err) {
      this.el.compList.innerHTML = `
        <div class="p-4 text-xs text-rose-300 flex flex-col gap-2">
          <span>${err.message}</span>
          <button data-action="retry-comps" type="button" class="self-start px-3 py-1 rounded bg-slate-800 text-slate-200 hover:bg-slate-700 cursor-pointer">Retry</button>
        </div>
      `;
    }
  }

  async selectCompetition(comp) {
    if (!comp) return;
    this.selectedComp = comp;
    this._renderCompetitions();
    this.el.matchList.innerHTML = '<div class="p-4 text-xs text-slate-400">Loading fixtures...</div>';
    this.el.matchCount.textContent = '...';
    try {
      this.matches = await this.source.fetchMatches(comp.competition_id, comp.season_id);
      this.matches.sort((a, b) => (b.match_date || '').localeCompare(a.match_date || ''));
      this._renderMatches();
    } catch (err) {
      this.el.matchList.innerHTML = `<div class="p-4 text-xs text-rose-300">${err.message}</div>`;
    }
  }

  _renderCompetitions() {
    const q = this.el.compSearch.value.trim().toLowerCase();
    this.filteredComps = this.competitions.filter((c) =>
      `${c.competition_name} ${c.country_name} ${c.season_name}`.toLowerCase().includes(q)
    );
    if (!this.filteredComps.length) {
      this.el.compList.innerHTML = '<div class="p-4 text-xs text-slate-500">No matching competitions.</div>';
      return;
    }
    this.el.compList.innerHTML = this.filteredComps.map((c, idx) => {
      const active = this.selectedComp && c.competition_id === this.selectedComp.competition_id && c.season_id === this.selectedComp.season_id;
      const trackTag = c.match_available_360 ? '<span class="text-emerald-300 font-medium">360 Tracking</span>' : '<span class="text-slate-500">Events Only</span>';
      return `
        <button data-comp-idx="${idx}" type="button" class="w-full text-left px-3 py-2 rounded-lg transition-colors cursor-pointer ${active ? 'bg-slate-800 text-white' : 'hover:bg-slate-800/50 text-slate-300'}">
          <div class="text-xs font-semibold truncate">${c.competition_name}</div>
          <div class="text-[11px] text-slate-400 mt-0.5 flex items-center gap-1.5 truncate">
            <span>${c.country_name}</span><span>·</span><span class="font-mono-tabular">${c.season_name}</span><span>·</span>${trackTag}
          </div>
        </button>
      `;
    }).join('');
  }

  _renderMatches() {
    const q = this.el.matchSearch.value.trim().toLowerCase();
    this.filteredMatches = this.matches.filter((m) =>
      `${m.home_team?.home_team_name} ${m.away_team?.away_team_name} ${m.competition_stage?.name || ''}`.toLowerCase().includes(q)
    );
    this.el.matchCount.textContent = `${this.filteredMatches.length} matches`;
    if (!this.filteredMatches.length) {
      this.el.matchList.innerHTML = '<div class="p-4 text-xs text-slate-500">No matching fixtures.</div>';
      return;
    }
    this.el.matchList.innerHTML = this.filteredMatches.map((m, idx) => {
      const home = m.home_team?.home_team_name || 'Home';
      const away = m.away_team?.away_team_name || 'Away';
      const stage = m.competition_stage?.name || '';
      return `
        <button data-match-idx="${idx}" type="button" class="w-full text-left px-3 py-2.5 rounded-lg bg-slate-900/60 hover:bg-slate-800 border border-white/5 flex items-center justify-between gap-3 transition-colors cursor-pointer">
          <div class="min-w-0">
            <div class="text-xs font-semibold text-slate-100 truncate">${home} vs ${away}</div>
            <div class="text-[11px] text-slate-400 mt-0.5 truncate">${stage}${stage ? ' · ' : ''}<span class="font-mono-tabular">${m.match_date || ''}</span></div>
          </div>
          <div class="font-mono-tabular text-sm font-bold text-emerald-300 shrink-0">${m.home_score ?? 0} - ${m.away_score ?? 0}</div>
        </button>
      `;
    }).join('');
  }
}
