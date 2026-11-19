import { StatsBombNormalizer } from './StatsBombNormalizer.js';

export { StatsBombNormalizer };

const defaultNormalizer = new StatsBombNormalizer();

/**
 * Convenience wrapper delegating Hudl/StatsBomb normalization to StatsBombNormalizer.
 */
export function normalizeHudlMatch(matchMeta, rawEvents, threeSixty, lineups) {
  return defaultNormalizer.normalize(matchMeta, rawEvents, threeSixty, lineups);
}
