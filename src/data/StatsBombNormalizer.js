import { PITCH } from './schema.js';

const SB_LENGTH = 120;
const SB_WIDTH = 80;
const BALL_EVENT_TYPES = new Set([
  'Pass', 'Carry', 'Shot', 'Clearance', 'Dribble', 'Interception',
  'Block', 'Goal Keeper', 'Ball Recovery', 'Dispossessed', 'Miscontrol', 'Ball Receipt*',
]);

/**
 * Dedicated normalizer for StatsBomb / Hudl Open Data (events, lineups, 360 freeze frames).
 * Translates 120x80 StatsBomb coordinates into 105m x 68m centered pitch meters and
 * synthesizes continuous linear movement paths for the ball and 22 players between
 * discrete 360 freeze-frame snapshots.
 */
export class StatsBombNormalizer {
  /**
   * @param {{
   *   pitchLength?: number,
   *   pitchWidth?: number,
   *   ballRadius?: number,
   *   sampleStepSec?: number,
   *   stoppageThresholdSec?: number,
   *   transitionWindowSec?: number,
   * }} [options]
   */
  constructor(options = {}) {
    this.pitchLength = options.pitchLength ?? PITCH.LENGTH;
    this.pitchWidth = options.pitchWidth ?? PITCH.WIDTH;
    this.ballRadius = options.ballRadius ?? PITCH.BALL_RADIUS;
    this.sampleStepSec = options.sampleStepSec ?? 0.5;
    this.stoppageThresholdSec = options.stoppageThresholdSec ?? 10.0;
    this.transitionWindowSec = options.transitionWindowSec ?? 2.0;
  }

  /**
   * Translate StatsBomb 120x80 coordinates (acting-team attacks +X) to centered pitch meters.
   * Away-team coordinates are mirrored so Home always attacks +X and Away attacks -X.
   * @param {number} sx
   * @param {number} sy
   * @param {boolean} [isAway=false]
   * @returns {{x: number, y: number}}
   */
  toPitchMeters(sx, sy, isAway = false) {
    const nx = isAway ? SB_LENGTH - sx : sx;
    const ny = isAway ? SB_WIDTH - sy : sy;
    return {
      x: (nx / SB_LENGTH - 0.5) * this.pitchLength,
      y: (ny / SB_WIDTH - 0.5) * this.pitchWidth,
    };
  }

  /** @param {string} ts @returns {number} */
  parseTimestampSec(ts) {
    if (!ts) return 0;
    const parts = ts.split(':');
    return (Number(parts[0]) || 0) * 3600 + (Number(parts[1]) || 0) * 60 + (Number(parts[2]) || 0);
  }

  /** @param {Array<Object>} rawEvents @returns {Map<number, number>} */
  computePeriodOffsets(rawEvents) {
    const periodMax = new Map();
    for (const ev of rawEvents) {
      const p = ev.period || 1;
      periodMax.set(p, Math.max(periodMax.get(p) || 0, this.parseTimestampSec(ev.timestamp)));
    }
    const offsets = new Map([[1, 0]]);
    let acc = 0;
    for (const p of [...periodMax.keys()].sort((a, b) => a - b)) {
      offsets.set(p, acc);
      acc += periodMax.get(p) || 0;
    }
    return offsets;
  }

  /** @private */
  _extractStarterJerseys(lineups, homeId, awayId) {
    const byTeam = { home: [], away: [] };
    for (const teamBlock of lineups || []) {
      const key = teamBlock.team_id === homeId ? 'home' : teamBlock.team_id === awayId ? 'away' : null;
      if (!key) continue;
      const starters = (teamBlock.lineup || []).filter((p) =>
        p.positions?.some((pos) => pos.start_reason === 'Starting XI')
      );
      starters.sort((a, b) => {
        const aGk = a.positions?.some((pos) => pos.position_id === 1) ? 0 : 1;
        const bGk = b.positions?.some((pos) => pos.position_id === 1) ? 0 : 1;
        return aGk - bGk;
      });
      for (let i = 0; i < Math.min(11, starters.length); i++) {
        const num = starters[i].jersey_number;
        byTeam[key].push(num > 0 && num <= 99 ? num : i + 1);
      }
    }
    return byTeam;
  }

  /** @private */
  _createInitialSlots(team, jerseys) {
    const sign = team === 'home' ? -1 : 1;
    const prefix = team === 'home' ? 'h' : 'a';
    const anchors = [
      [48, 0], [34, -20], [36, -7], [36, 7], [34, 20],
      [18, -14], [20, 0], [18, 14], [7, -18], [5, 0], [7, 18],
    ];
    return anchors.map(([ax, ay], i) => ({
      id: `${prefix}${i}`,
      jersey: jerseys[i] || i + 1,
      team,
      isGk: i === 0,
      x: sign * ax,
      y: ay,
    }));
  }

  /** @private */
  _cloneSlots(slots) {
    return slots.map((s) => ({
      id: s.id,
      jersey: s.jersey,
      isGk: s.isGk,
      team: s.team,
      x: s.x,
      y: s.y,
    }));
  }

  /**
   * Align anonymous 360 freeze-frame coordinates to persistent team player slots by
   * goalkeeper priority followed by nearest-neighbor continuity.
   * @param {Array<Object>} freezeFrame
   * @param {boolean} eventIsAway
   * @param {Array<Object>} slots
   * @param {{x: number, y: number}|null} [actorPos=null]
   */
  matchFreezeFrame(freezeFrame, eventIsAway, slots, actorPos = null) {
    const used = new Set();
    for (const item of freezeFrame) {
      if (!item.location) continue;
      const pTeam = item.teammate ? (eventIsAway ? 'away' : 'home') : (eventIsAway ? 'home' : 'away');
      const pt = this.toPitchMeters(item.location[0], item.location[1], eventIsAway);
      let bestIdx = -1;
      let bestDist = Infinity;

      for (let pass = 0; pass < 2 && bestIdx === -1; pass++) {
        for (let i = 0; i < slots.length; i++) {
          if (used.has(i) || slots[i].team !== pTeam) continue;
          if (pass === 0 && item.keeper && !slots[i].isGk) continue;
          const d = (slots[i].x - pt.x) ** 2 + (slots[i].y - pt.y) ** 2;
          if (d < bestDist) {
            bestDist = d;
            bestIdx = i;
          }
        }
      }

      if (bestIdx >= 0) {
        used.add(bestIdx);
        slots[bestIdx].x = pt.x;
        slots[bestIdx].y = pt.y;
      }
    }

    if (actorPos) {
      const actorTeam = eventIsAway ? 'away' : 'home';
      let bestIdx = -1;
      let bestDist = Infinity;
      for (let i = 0; i < slots.length; i++) {
        if (slots[i].team !== actorTeam) continue;
        const d = (slots[i].x - actorPos.x) ** 2 + (slots[i].y - actorPos.y) ** 2;
        if (d < bestDist) {
          bestDist = d;
          bestIdx = i;
        }
      }
      if (bestIdx >= 0 && bestDist > 4) {
        slots[bestIdx].x = actorPos.x;
        slots[bestIdx].y = actorPos.y;
      }
    }
  }

  /**
   * Build piecewise-linear ball waypoints (t, x, y, z) across on-ball event locations and end_locations.
   * Off-ball events (e.g. Pressure, Dribbled Past) are excluded so defender coords don't pull the ball.
   * @param {Array<Object>} rawEvents
   * @param {Map<number, number>} periodOffsets
   * @param {number} awayId
   * @returns {Array<{t: number, x: number, y: number, z: number}>}
   */
  buildBallWaypoints(rawEvents, periodOffsets, awayId) {
    const waypoints = [];
    const onBallEvents = rawEvents.filter((ev) => BALL_EVENT_TYPES.has(ev.type?.name) && ev.location);

    for (let i = 0; i < onBallEvents.length; i++) {
      const ev = onBallEvents[i];
      const t = (periodOffsets.get(ev.period || 1) || 0) + this.parseTimestampSec(ev.timestamp);
      const isAway = ev.team?.id === awayId;
      const loc = this.toPitchMeters(ev.location[0], ev.location[1], isAway);
      const prev = waypoints[waypoints.length - 1];

      if (prev && t - prev.t > this.stoppageThresholdSec) {
        waypoints.push({ t: t - 0.5, x: prev.x, y: prev.y, z: prev.z });
      }

      // Skip Ball Receipt* if it lands on top of an already-scheduled Pass end waypoint
      if (!(ev.type?.name === 'Ball Receipt*' && prev && t <= prev.t + 0.05)) {
        this._pushWaypoint(waypoints, t, loc.x, loc.y, this.ballRadius);
      }

      const endRaw = ev.pass?.end_location || ev.carry?.end_location || ev.shot?.end_location;
      if (endRaw && endRaw.length >= 2) {
        const nextEv = onBallEvents[i + 1];
        const nextT = nextEv
          ? (periodOffsets.get(nextEv.period || 1) || 0) + this.parseTimestampSec(nextEv.timestamp)
          : t + 2;
        const rawDur = Math.max(0.05, Math.min(4.5, ev.duration || 0.4));
        const maxDur = nextT > t + 0.05 ? Math.min(4.5, nextT - t) : rawDur;
        const dur = Math.min(rawDur, maxDur);
        const endPos = this.toPitchMeters(endRaw[0], endRaw[1], isAway);
        const endZ = Number.isFinite(endRaw[2]) ? Math.max(this.ballRadius, endRaw[2]) : this.ballRadius;
        this._pushWaypoint(waypoints, t + dur, endPos.x, endPos.y, endZ);
      }
    }

    if (waypoints.length === 0) waypoints.push({ t: 0, x: 0, y: 0, z: this.ballRadius });
    return waypoints;
  }

  /** @private */
  _pushWaypoint(waypoints, t, x, y, z) {
    const prev = waypoints[waypoints.length - 1];
    if (prev && t <= prev.t + 1e-4) {
      prev.x = x;
      prev.y = y;
      prev.z = z;
    } else {
      waypoints.push({ t, x, y, z });
    }
  }

  /**
   * Extract discrete 360 freeze-frame snapshots (with actor fallback when 360 is absent).
   * @returns {Array<{t: number, players: Array<Object>}>}
   */
  buildSnapshots(rawEvents, threeSixty, lineups, periodOffsets, homeId, awayId) {
    const jerseys = this._extractStarterJerseys(lineups, homeId, awayId);
    const slots = [
      ...this._createInitialSlots('home', jerseys.home),
      ...this._createInitialSlots('away', jerseys.away),
    ];

    const freezeByUuid = new Map();
    for (const f of threeSixty || []) {
      if (f.event_uuid && f.freeze_frame) freezeByUuid.set(f.event_uuid, f.freeze_frame);
    }

    const snapshots = [];
    const has360 = freezeByUuid.size > 0;
    const firstT = (periodOffsets.get(rawEvents[0].period || 1) || 0) + this.parseTimestampSec(rawEvents[0].timestamp);

    for (const ev of rawEvents) {
      const t = (periodOffsets.get(ev.period || 1) || 0) + this.parseTimestampSec(ev.timestamp);
      const isAway = ev.team?.id === awayId;
      const loc = ev.location ? this.toPitchMeters(ev.location[0], ev.location[1], isAway) : null;
      const freeze = freezeByUuid.get(ev.id) || ev.shot?.freeze_frame;

      if (freeze) {
        this.matchFreezeFrame(freeze, isAway, slots, loc);
        this._pushSnapshot(snapshots, t, slots);
      } else if (!has360 && loc && (ev.team?.id === homeId || ev.team?.id === awayId)) {
        this.matchFreezeFrame([], isAway, slots, loc);
        this._pushSnapshot(snapshots, t, slots);
      }
    }

    if (snapshots.length === 0) {
      snapshots.push({ t: firstT, players: this._cloneSlots(slots) });
    } else if (snapshots[0].t > firstT + 1e-3) {
      snapshots.unshift({ t: firstT, players: this._cloneSlots(snapshots[0].players) });
    }

    const lastEv = rawEvents[rawEvents.length - 1];
    const lastT = (periodOffsets.get(lastEv.period || 1) || 0) + this.parseTimestampSec(lastEv.timestamp);
    if (snapshots[snapshots.length - 1].t < lastT - 1e-3) {
      snapshots.push({ t: lastT, players: this._cloneSlots(snapshots[snapshots.length - 1].players) });
    }
    return snapshots;
  }

  /** @private */
  _pushSnapshot(snapshots, t, slots) {
    const prev = snapshots[snapshots.length - 1];
    if (prev && t <= prev.t + 1e-4) {
      prev.players = this._cloneSlots(slots);
    } else {
      snapshots.push({ t, players: this._cloneSlots(slots) });
    }
  }

  /** @private */
  _sampleBall(waypoints, cursor, t) {
    const n = waypoints.length;
    while (cursor.idx < n - 2 && waypoints[cursor.idx + 1].t < t) cursor.idx++;
    const a = waypoints[cursor.idx];
    const b = waypoints[Math.min(n - 1, cursor.idx + 1)];
    if (t <= a.t || a === b) return { x: a.x, y: a.y, z: a.z };
    if (t >= b.t) return { x: b.x, y: b.y, z: b.z };
    const alpha = (t - a.t) / (b.t - a.t);
    return {
      x: a.x + (b.x - a.x) * alpha,
      y: a.y + (b.y - a.y) * alpha,
      z: a.z + (b.z - a.z) * alpha,
    };
  }

  /** @private */
  _lerpPlayers(p0, p1, alpha) {
    if (alpha <= 0) return this._cloneSlots(p0);
    if (alpha >= 1) return this._cloneSlots(p1);
    const out = new Array(p0.length);
    for (let i = 0; i < p0.length; i++) {
      const a = p0[i];
      const b = p1[i];
      out[i] = {
        id: a.id,
        jersey: a.jersey,
        isGk: a.isGk,
        team: a.team,
        x: a.x + (b.x - a.x) * alpha,
        y: a.y + (b.y - a.y) * alpha,
      };
    }
    return out;
  }

  /**
   * Synthesize linear movement frames between discrete player snapshots while preserving
   * every ball waypoint timestamp for crisp pass/carry/shot trajectories.
   * @param {Array<{t: number, players: Array<Object>}>} snapshots
   * @param {Array<{t: number, x: number, y: number, z: number}>} ballWaypoints
   * @returns {Array<import('./schema.js').NormalizedFrame>}
   */
  synthesizeLinearPaths(snapshots, ballWaypoints) {
    const frames = [];
    const ballCursor = { idx: 0 };
    let wpIdx = 0;

    for (let s = 0; s < snapshots.length; s++) {
      const s0 = snapshots[s];
      const s1 = snapshots[s + 1];

      if (!s1) {
        const lastBallT = ballWaypoints[ballWaypoints.length - 1].t;
        const endT = Math.max(s0.t, lastBallT);
        while (wpIdx < ballWaypoints.length && ballWaypoints[wpIdx].t <= endT + 1e-4) {
          const wp = ballWaypoints[wpIdx++];
          if (wp.t >= s0.t - 1e-4) {
            frames.push({
              t: wp.t,
              ball: { x: wp.x, y: wp.y, z: wp.z },
              players: this._cloneSlots(s0.players),
            });
          }
        }
        if (!frames.length || frames[frames.length - 1].t < endT - 1e-4) {
          frames.push({
            t: endT,
            ball: this._sampleBall(ballWaypoints, ballCursor, endT),
            players: this._cloneSlots(s0.players),
          });
        }
        break;
      }

      const span = s1.t - s0.t;
      const isStoppage = span > this.stoppageThresholdSec;
      const glideStart = isStoppage ? Math.max(s0.t, s1.t - this.transitionWindowSec) : s0.t;
      const glideSpan = Math.max(1e-4, s1.t - glideStart);

      // Merge regular linear substeps and intermediate ball waypoints along [s0.t, s1.t)
      const times = [s0.t];
      while (wpIdx < ballWaypoints.length && ballWaypoints[wpIdx].t < s1.t - 1e-4) {
        const bt = ballWaypoints[wpIdx++].t;
        if (bt > s0.t + 1e-4) times.push(bt);
      }
      if (isStoppage && glideStart > s0.t + 1e-4) times.push(glideStart);
      if (this.sampleStepSec > 0) {
        for (let t = glideStart + this.sampleStepSec; t < s1.t - 1e-4; t += this.sampleStepSec) {
          times.push(t);
        }
      }

      times.sort((a, b) => a - b);
      let prevT = frames.length ? frames[frames.length - 1].t : -Infinity;
      for (let i = 0; i < times.length; i++) {
        const t = times[i];
        if (t <= prevT + 1e-4) continue;
        prevT = t;
        const alpha = t <= glideStart ? 0 : Math.min(1, (t - glideStart) / glideSpan);
        frames.push({
          t,
          ball: this._sampleBall(ballWaypoints, ballCursor, t),
          players: this._lerpPlayers(s0.players, s1.players, alpha),
        });
      }
    }

    return frames;
  }

  /** @private */
  _classifyEvent(ev) {
    const name = (ev.type?.name || '').toLowerCase();
    if (name === 'shot') return ev.shot?.outcome?.name === 'Goal' ? 'goal' : 'shot';
    if (name === 'pass') return 'pass';
    if (name === 'foul committed' || name === 'foul won') return 'foul';
    if (name === 'bad behaviour') return 'card';
    if (name === 'carry') return 'carry';
    if (name === 'ball recovery') return 'recovery';
    return name.replace(/\s+/g, '_');
  }

  /** @private */
  _buildEvents(rawEvents, periodOffsets, homeId, awayId, homeName, awayName) {
    return rawEvents.map((ev) => {
      const p = ev.period || 1;
      const t = (periodOffsets.get(p) || 0) + this.parseTimestampSec(ev.timestamp);
      const dur = Math.max(0.15, Math.min(4.0, ev.duration || 0.4));
      const isAway = ev.team?.id === awayId;
      const team = isAway ? 'away' : ev.team?.id === homeId ? 'home' : 'neutral';
      const loc = ev.location ? this.toPitchMeters(ev.location[0], ev.location[1], isAway) : null;
      const type = this._classifyEvent(ev);
      const teamLabel = team === 'home' ? homeName : team === 'away' ? awayName : '';
      const playerName = ev.player?.name ? ` · ${ev.player.name.split(' ').pop()}` : '';
      const typeLabel = type.replace(/_/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());

      return {
        t,
        endT: t + dur,
        type,
        subtype: ev.shot?.outcome?.name || ev.pass?.type?.name || '',
        team,
        playerId: String(ev.player?.id || ''),
        x: loc ? loc.x : NaN,
        y: loc ? loc.y : NaN,
        label: `${teamLabel} ${typeLabel}${playerName}`.trim(),
        period: p,
      };
    });
  }

  /**
   * Normalize a complete StatsBomb / Hudl Open Data match into a MatchDataset.
   * @param {Object} matchMeta
   * @param {Array<Object>} rawEvents
   * @param {Array<Object>} [threeSixty=[]]
   * @param {Array<Object>} [lineups=[]]
   * @returns {import('./schema.js').MatchDataset}
   */
  normalize(matchMeta, rawEvents, threeSixty = [], lineups = []) {
    if (!Array.isArray(rawEvents) || rawEvents.length === 0) {
      throw new Error('Match contains no events');
    }

    const homeId = matchMeta.home_team?.home_team_id;
    const awayId = matchMeta.away_team?.away_team_id;
    const homeName = matchMeta.home_team?.home_team_name || 'Home';
    const awayName = matchMeta.away_team?.away_team_name || 'Away';

    const periodOffsets = this.computePeriodOffsets(rawEvents);
    const ballWaypoints = this.buildBallWaypoints(rawEvents, periodOffsets, awayId);
    const snapshots = this.buildSnapshots(rawEvents, threeSixty, lineups, periodOffsets, homeId, awayId);
    const frames = this.synthesizeLinearPaths(snapshots, ballWaypoints);
    const events = this._buildEvents(rawEvents, periodOffsets, homeId, awayId, homeName, awayName);

    const startTime = frames[0].t;
    const endTime = frames[frames.length - 1].t;
    return {
      frames,
      events,
      startTime,
      endTime,
      duration: Math.max(0, endTime - startTime),
    };
  }
}
