export interface PortalEntryState {
  distance: number;
  grounded: boolean;
  feetHeight: number;
}

export function canEnterPortal({ distance, grounded, feetHeight }: PortalEntryState) {
  return distance < 1.15 && !grounded && feetHeight > 0.08;
}

// --- Jump arc (Mario Odyssey feel). Gravity scales multiply world gravity
// (30 m/s^2). Snappy rise, a brief float at the apex while jump is held, then
// a heavy fall. Full hold peaks ~1.9m at ~0.39s; a tap cuts to ~1.1m.

export interface JumpTuning {
  /** Takeoff speed (m/s). */
  jumpSpeed: number;
  /** Rise while jump is held. */
  riseGravity: number;
  /** Rise after jump is released early: cuts the arc short (variable height). */
  cutGravity: number;
  /** Hang-time float near the apex while jump is held. */
  apexGravity: number;
  /** |vertical speed| (m/s) below which the apex float applies. */
  apexSpeed: number;
  /** Falling: heavier than the rise, which is what reads as weight. */
  fallGravity: number;
  /** Terminal fall speed (m/s). */
  fallMaxSpeed: number;
  /** Grace window after walking off an edge where jump still works (s). */
  coyoteTime: number;
  /** A press this early before landing still jumps on touchdown (s). */
  jumpBuffer: number;
}

export const JUMP_DEFAULTS: JumpTuning = {
  jumpSpeed: 11,
  riseGravity: 1.1,
  cutGravity: 2.6,
  apexGravity: 0.55,
  apexSpeed: 2,
  fallGravity: 1.75,
  fallMaxSpeed: 24,
  coyoteTime: 0.12,
  jumpBuffer: 0.12,
};

/**
 * Elden Ring / Sekiro jump: one committed arc of about 1.2m whatever the hold, no
 * apex float, airborne about half a second. Distance comes from the run-up.
 */
export const SOULS_JUMP: JumpTuning = {
  jumpSpeed: 8.5,
  riseGravity: 1,
  cutGravity: 1,
  apexGravity: 1,
  apexSpeed: 0,
  fallGravity: 1.3,
  fallMaxSpeed: 24,
  coyoteTime: 0.08,
  jumpBuffer: 0.1,
};

/**
 * @param jumping true only during a player jump's rise. Launches (jump
 * pads, platforms) never get the release cut, so they keep full height.
 */
export function getGravityScale(
  verticalSpeed: number,
  jumpHeld: boolean,
  jumping: boolean,
  tuning: JumpTuning = JUMP_DEFAULTS,
) {
  if (verticalSpeed < -tuning.fallMaxSpeed) return 0;
  if (jumpHeld && Math.abs(verticalSpeed) < tuning.apexSpeed) return tuning.apexGravity;
  if (verticalSpeed < 0) return tuning.fallGravity;
  return jumping && !jumpHeld ? tuning.cutGravity : tuning.riseGravity;
}

export interface CoyoteJumpState {
  /** Seconds since last grounded. */
  airTime: number;
  /** Already rising from a jump. */
  jumping: boolean;
  verticalSpeed: number;
}

export function canCoyoteJump(
  { airTime, jumping, verticalSpeed }: CoyoteJumpState,
  coyoteTime = JUMP_DEFAULTS.coyoteTime,
) {
  return !jumping && airTime > 0 && airTime <= coyoteTime && verticalSpeed <= 0.5;
}

export const LEDGE_WALL_REACH = 0.85;
const LEDGE_TOP_MIN = 0.3;
export const LEDGE_TOP_MAX = 1.75;
const LEDGE_GRAB_MIN_FALL = -0.5;
export const HANG_TIMEOUT = 8;

export interface LedgeGrabState {
  wallNormalY?: number;
  topNormalY?: number;
  grounded: boolean;
  verticalSpeed: number;
  wallDist: number;
  topHeight: number;
}

export function canGrabLedge({
  grounded,
  verticalSpeed,
  wallDist,
  topHeight,
  wallNormalY = 0,
  topNormalY = 1,
}: LedgeGrabState) {
  return (
    Math.abs(wallNormalY) < 0.3 &&
    topNormalY > 0.65 &&
    !grounded &&
    verticalSpeed < LEDGE_GRAB_MIN_FALL &&
    wallDist <= LEDGE_WALL_REACH &&
    topHeight >= LEDGE_TOP_MIN &&
    topHeight <= LEDGE_TOP_MAX
  );
}

// Measured from the GLB: Roll clip runs 0.917s. The state must outlive it
// or the animation gets cut off mid-roll.
export const ROLL_DURATION = 0.92;
export const ROLL_COOLDOWN = 0.9;
/**
 * Rolls burst out fast through their invincible part and slow into a short slide:
 * speed falls linearly by this share of its peak over the move.
 */
export const ROLL_FALLOFF = 0.8;
export function rollSpeedAt(peak: number, elapsed: number, duration: number) {
  return peak * (1 - ROLL_FALLOFF * Math.min(1, Math.max(0, elapsed / duration)));
}
/** The peak speed that carries a dodge `distance` metres over `duration`. */
export function rollPeakFor(distance: number, duration: number) {
  return distance / (duration * (1 - ROLL_FALLOFF / 2));
}
/** A full roll covers about four and a half metres, like the genre's medium roll. */
export const ROLL_DISTANCE = 4.5;
export const ROLL_SPEED = rollPeakFor(ROLL_DISTANCE, ROLL_DURATION);
export const BACKSTEP_DURATION = 0.4;
/** A backstep hops about a metre and a half. */
export const BACKSTEP_SPEED = rollPeakFor(1.6, BACKSTEP_DURATION);
/**
 * Roll weight, as equipment load sets it in the genre: a light roll is quick and
 * far, a heavy "fat" roll slow, short and with a thinner invincibility window.
 * Distances scale the level's medium roll.
 */
export type RollWeight = "light" | "medium" | "heavy";
export const ROLL_WEIGHTS: Record<
  RollWeight,
  { duration: number; distance: number; iframes: readonly [number, number]; cooldown: number }
> = {
  light: { duration: 0.74, distance: 1.15, iframes: [0.05, 0.5], cooldown: 0.72 },
  medium: { duration: ROLL_DURATION, distance: 1, iframes: [0.08, 0.55], cooldown: ROLL_COOLDOWN },
  heavy: { duration: 1.2, distance: 0.6, iframes: [0.12, 0.46], cooldown: 1.15 },
};
/** Invincibility windows, seconds into the move. A backstep's is short and early. */
export const ROLL_IFRAMES = [0.08, 0.55] as const;
export const BACKSTEP_IFRAMES = [0.04, 0.22] as const;
/** Late in a roll, an attack cancels its tail into a roll attack. */
export const ROLL_ATTACK_FROM = 0.6;
export function dodgeInvulnerable(
  backstep: boolean,
  elapsed: number,
  weight: RollWeight = "medium",
) {
  const [from, to] = backstep ? BACKSTEP_IFRAMES : ROLL_WEIGHTS[weight].iframes;
  return elapsed > from && elapsed < to;
}

export interface RollStartState {
  grounded: boolean;
  rolling: boolean;
  cooldownRemaining: number;
  rollPress: number;
  lastRollPress: number;
}

export function shouldStartRoll({
  grounded,
  rolling,
  cooldownRemaining,
  rollPress,
  lastRollPress,
}: RollStartState) {
  return grounded && !rolling && cooldownRemaining <= 0 && rollPress !== lastRollPress;
}

export function consumeRollPress(state: RollStartState) {
  return { start: shouldStartRoll(state), lastPress: state.rollPress };
}
