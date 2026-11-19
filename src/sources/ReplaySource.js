import { PITCH } from '../data/schema.js';
import { normalizeTrackingCsvs, normalizeEventsCsv } from '../data/normalizer.js';

const DEFAULT_FILES = {
  home: '/data/Sample_Game_1_RawTrackingData_Home_Team.csv',
  away: '/data/Sample_Game_1_RawTrackingData_Away_Team.csv',
  events: '/data/Sample_Game_1_RawEventsData.csv',
};

/**
 * Generates a static 22-player kickoff formation frame for immediate Milestone 1 / pre-load display.
 * @returns {import('../data/schema.js').NormalizedFrame}
 */
export function createStaticKickoffFrame() {
  const homeCoords = [
    [-48, 0], // GK #11
    [-32, -20], [-34, -7], [-34, 7], [-32, 20],
    [-18, -14], [-20, 0], [-18, 14],
    [-7, -18], [-4, 0], [-7, 18],
  ];
  const awayCoords = [
    [48, 0], // GK #25
    [32, -20], [34, -7], [34, 7], [32, 20],
    [18, -18], [20, -6], [20, 6], [18, 18],
    [6, -7], [6, 7],
  ];

  const players = [];
  const homeIds = ['11', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10'];
  const awayIds = ['25', '15', '16', '17', '18', '19', '20', '21', '22', '23', '24'];

  homeCoords.forEach(([x, y], i) => players.push({ id: homeIds[i], team: 'home', x, y }));
  awayCoords.forEach(([x, y], i) => players.push({ id: awayIds[i], team: 'away', x, y }));

  return {
    t: 0,
    ball: { x: 0, y: 0, z: PITCH.BALL_RADIUS },
    players,
  };
}

export class ReplaySource {
  constructor(files = DEFAULT_FILES) {
    this.files = files;
  }

  /**
   * Fetch and normalize Metrica CSVs into the source-agnostic MatchDataset.
   * @param {(stage: string) => void} [onStatus]
   * @returns {Promise<import('../data/schema.js').MatchDataset>}
   */
  async load(onStatus) {
    onStatus?.('Fetching match CSV data...');
    const [homeRes, awayRes, eventsRes] = await Promise.all([
      fetch(this.files.home),
      fetch(this.files.away),
      fetch(this.files.events),
    ]);

    if (!homeRes.ok || !awayRes.ok || !eventsRes.ok) {
      throw new Error('Failed to load Metrica Sample_Game_1 CSV files from /public/data');
    }

    const [homeCsv, awayCsv, eventsCsv] = await Promise.all([
      homeRes.text(),
      awayRes.text(),
      eventsRes.text(),
    ]);

    onStatus?.('Normalizing 25 Hz tracking frames...');
    // Yield one macrotask so the status text renders before synchronous CSV scan
    await new Promise((r) => setTimeout(r, 16));

    const frames = normalizeTrackingCsvs(homeCsv, awayCsv);
    const events = normalizeEventsCsv(eventsCsv);
    const startTime = frames.length ? frames[0].t : 0;
    const endTime = frames.length ? frames[frames.length - 1].t : 0;

    return {
      frames,
      events,
      startTime,
      endTime,
      duration: Math.max(0, endTime - startTime),
    };
  }
}
