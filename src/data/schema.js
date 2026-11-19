/**
 * Internal source-agnostic schema shared across normalizer, timeline, and renderer.
 * All coordinates are in pitch metres with (0, 0) at the centre spot:
 *   x in [-52.5, +52.5] along pitch length
 *   y in [-34.0, +34.0] along pitch width
 *   z >= 0 height above turf in metres
 */

export const PITCH = Object.freeze({
  LENGTH: 105,
  WIDTH: 68,
  HALF_LENGTH: 52.5,
  HALF_WIDTH: 34,
  BALL_RADIUS: 0.11,
  GOAL_WIDTH: 7.32,
  GOAL_HEIGHT: 2.44,
  GOAL_DEPTH: 2.0,
});

/**
 * @typedef {Object} BallSample
 * @property {number} x
 * @property {number} y
 * @property {number} z
 */

/**
 * @typedef {Object} PlayerSample
 * @property {string} id
 * @property {'home'|'away'} team
 * @property {number} x
 * @property {number} y
 */

/**
 * @typedef {Object} NormalizedFrame
 * @property {number} t - Match time in seconds
 * @property {BallSample} ball
 * @property {PlayerSample[]} players
 */

/**
 * @typedef {Object} NormalizedEvent
 * @property {number} t - Event start time in seconds
 * @property {number} endT - Event end time in seconds
 * @property {string} type - Normalized type: "goal"|"shot"|"pass"|"foul"|"card"|"set_piece"|...
 * @property {string} subtype - Raw subtype detail
 * @property {'home'|'away'|'neutral'} team
 * @property {string} playerId
 * @property {number} x
 * @property {number} y
 * @property {string} label
 * @property {number} period
 */

/**
 * @typedef {Object} MatchDataset
 * @property {NormalizedFrame[]} frames
 * @property {NormalizedEvent[]} events
 * @property {number} startTime
 * @property {number} endTime
 * @property {number} duration
 */
