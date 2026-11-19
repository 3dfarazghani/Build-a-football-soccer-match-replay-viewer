export const METRICA_DATASET_INFO = Object.freeze({
  name: 'Metrica Sports Sample Game 1',
  url: 'https://github.com/metrica-sports/sample-data/tree/master/data/Sample_Game_1',
  sampleRateHz: 25,
  pitchLabel: '105m × 68m',
});

/**
 * Compute Home vs. Away match statistics up to currentTime from normalized events and frames.
 * @param {import('./schema.js').NormalizedFrame[]} frames
 * @param {import('./schema.js').NormalizedEvent[]} events
 * @param {number} currentTime
 * @param {import('./schema.js').NormalizedFrame|null} currentFrame
 */
export function computeMatchStats(frames, events, currentTime, currentFrame) {
  const stats = {
    goals: { home: 0, away: 0 },
    shots: { home: 0, away: 0 },
    shotsOnTarget: { home: 0, away: 0 },
    passes: { home: 0, away: 0 },
    setPieces: { home: 0, away: 0 },
    fouls: { home: 0, away: 0 },
    cards: { home: 0, away: 0 },
    possessionPct: { home: 50, away: 50 },
    territoryPct: { home: 50, away: 50 },
    activePlayers: { home: 0, away: 0 },
    period: 1,
  };

  for (let i = 0; i < events.length; i++) {
    const ev = events[i];
    if (ev.t > currentTime) break;
    stats.period = ev.period || stats.period;
    if (ev.team !== 'home' && ev.team !== 'away') continue;

    if (ev.type === 'goal') {
      stats.goals[ev.team] += 1;
      stats.shots[ev.team] += 1;
      stats.shotsOnTarget[ev.team] += 1;
    } else if (ev.type === 'shot') {
      stats.shots[ev.team] += 1;
      if (ev.subtype.toUpperCase().includes('ON TARGET')) {
        stats.shotsOnTarget[ev.team] += 1;
      }
    } else if (ev.type === 'pass') {
      stats.passes[ev.team] += 1;
    } else if (ev.type === 'set_piece') {
      stats.setPieces[ev.team] += 1;
    } else if (ev.type === 'foul') {
      stats.fouls[ev.team] += 1;
    } else if (ev.type === 'card') {
      stats.cards[ev.team] += 1;
    }
  }

  const totalPasses = stats.passes.home + stats.passes.away;
  if (totalPasses > 0) {
    const homePoss = Math.round((stats.passes.home / totalPasses) * 100);
    stats.possessionPct.home = homePoss;
    stats.possessionPct.away = 100 - homePoss;
  }

  // Sample ball pitch-half territory at ~1 Hz (every 25th frame) for O(1)-feel speed
  let homeHalfSamples = 0;
  let awayHalfSamples = 0;
  for (let i = 0; i < frames.length; i += 25) {
    const f = frames[i];
    if (f.t > currentTime) break;
    if (Number.isFinite(f.ball.x)) {
      if (f.ball.x >= 0) homeHalfSamples += 1;
      else awayHalfSamples += 1;
    }
  }
  const totalTerr = homeHalfSamples + awayHalfSamples;
  if (totalTerr > 0) {
    const homeTerr = Math.round((homeHalfSamples / totalTerr) * 100);
    stats.territoryPct.home = homeTerr;
    stats.territoryPct.away = 100 - homeTerr;
  }

  if (currentFrame?.players) {
    for (const p of currentFrame.players) {
      if (p.team === 'home') stats.activePlayers.home += 1;
      else if (p.team === 'away') stats.activePlayers.away += 1;
    }
  }

  return stats;
}
