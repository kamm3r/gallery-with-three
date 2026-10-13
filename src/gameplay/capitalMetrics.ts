import { soulsControllerTuning } from "./controllerTuning.ts";
import { ROLL_DURATION, rollPeakFor } from "./playerRules.ts";

/** One reference grid is one metre. Parentheses on the chart give sprint values. */
export const CAPITAL_METRICS = {
  playerHeight: 1.8,
  crouchHeight: 1.2,
  capsuleRadius: 0.42,
  walkSpeed: 2.5,
  runSpeed: 4,
  rollDistance: 2,
  pathWidth: 1.5,
  streetWidth: 4,
  stairWidth: 4,
  roomSize: 3,
  hallwayHeight: 3,
  highHallHeight: 5,
  stairHeight: 4,
  doorWidth: 2,
  doorHeight: 3.5,
} as const;

/**
 * The chart's 2.5 / 4 m/s are level-design pacing minimums. Played at those speeds a
 * sprint barely differs from a walk, so the controller jogs and sprints faster.
 * Movement and jumping follow the souls preset (quick pivots, committed jumps).
 */
export const capitalControllerTuning = {
  ...soulsControllerTuning,
  walkSpeed: 4.2,
  runSpeed: 6.6,
};

/** Metres a capital roll carries the player. */
export const CAPITAL_ROLL_DISTANCE = 4;
export const capitalPlayerProfile = {
  height: CAPITAL_METRICS.playerHeight,
  crouchHeight: CAPITAL_METRICS.crouchHeight,
  // The chart's 2 m roll is a minimum; at that length a roll barely leaves the spot.
  rollSpeed: rollPeakFor(CAPITAL_ROLL_DISTANCE, ROLL_DURATION),
};
