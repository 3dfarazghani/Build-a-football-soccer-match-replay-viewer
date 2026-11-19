import { StatsBombNormalizer } from '../data/StatsBombNormalizer.js';

export const HUDL_REPO_URL = 'https://github.com/hudl/open-data';
const HUDL_RAW_BASE = 'https://raw.githubusercontent.com/hudl/open-data/master/data';

async function fetchJsonWithFallback(proxyUrl, rawRelPath, allowMissing = false) {
  try {
    const res = await fetch(proxyUrl);
    const ct = res.headers.get('content-type') || '';
    if (res.ok && ct.includes('application/json')) {
      return await res.json();
    }
  } catch {
    // Fall through to direct GitHub raw fetch
  }

  const rawRes = await fetch(`${HUDL_RAW_BASE}/${rawRelPath}`);
  if (!rawRes.ok) {
    if (allowMissing && rawRes.status === 404) return null;
    throw new Error(`Hudl Open Data fetch failed (${rawRes.status})`);
  }
  return rawRes.json();
}

export class HudlOpenSource {
  constructor(normalizerOptions) {
    this.normalizer = new StatsBombNormalizer(normalizerOptions);
  }

  async fetchCompetitions() {
    return fetchJsonWithFallback('/api/hudl/competitions', 'competitions.json');
  }

  async fetchMatches(compId, seasonId) {
    return fetchJsonWithFallback(
      `/api/hudl/matches/${compId}/${seasonId}`,
      `matches/${compId}/${seasonId}.json`
    );
  }

  /**
   * Fetch and normalize a selected Hudl/StatsBomb match into MatchDataset.
   * @param {Object} matchMeta
   * @param {(stage: string) => void} [onStatus]
   */
  async loadMatch(matchMeta, onStatus) {
    const home = matchMeta.home_team?.home_team_name || 'Home';
    const away = matchMeta.away_team?.away_team_name || 'Away';
    onStatus?.(`Fetching ${home} vs ${away}...`);

    const id = matchMeta.match_id;
    let payload;
    try {
      const res = await fetch(`/api/hudl/match/${id}`);
      const ct = res.headers.get('content-type') || '';
      if (res.ok && ct.includes('application/json')) {
        payload = await res.json();
      }
    } catch {
      // Fall through to direct GitHub raw fetch
    }

    if (!payload) {
      const [events, lineups, threeSixty] = await Promise.all([
        fetchJsonWithFallback('', `events/${id}.json`),
        fetchJsonWithFallback('', `lineups/${id}.json`, true),
        fetchJsonWithFallback('', `three-sixty/${id}.json`, true),
      ]);
      payload = {
        events,
        lineups: lineups || [],
        threeSixty: threeSixty || [],
        has360: Array.isArray(threeSixty) && threeSixty.length > 0,
      };
    }

    onStatus?.(`Normalizing ${payload.has360 ? '360 tracking' : 'event'} frames...`);
    await new Promise((r) => setTimeout(r, 16));

    const dataset = this.normalizer.normalize(matchMeta, payload.events, payload.threeSixty, payload.lineups);
    return {
      ...dataset,
      meta: {
        homeName: home,
        awayName: away,
        has360: payload.has360,
        competition: matchMeta.competition?.competition_name || 'Hudl Open Data',
        season: matchMeta.season?.season_name || '',
        matchDate: matchMeta.match_date || '',
        finalScore: `${matchMeta.home_score ?? 0} - ${matchMeta.away_score ?? 0}`,
      },
    };
  }
}
