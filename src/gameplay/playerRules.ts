export interface PortalEntryState {
  distance: number;
  grounded: boolean;
  feetHeight: number;
}

export function canEnterPortal({ distance, grounded, feetHeight }: PortalEntryState) {
  return distance < 1.15 && !grounded && feetHeight > 0.08;
}

export function getGravityScale(verticalSpeed: number, jumpHeld: boolean) {
  if (verticalSpeed < 0) return 1;
  return jumpHeld ? 22 / 30 : 38 / 30;
}

export const LEDGE_WALL_REACH = 0.85;
export const LEDGE_TOP_MIN = 0.3;
export const LEDGE_TOP_MAX = 1.75;
export const LEDGE_GRAB_MIN_FALL = -0.5;
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
export const ROLL_SPEED = 9;

// --- Downhill snap: keeps the Ecctrl hover spring glued to the ground when
// running down slopes/steps. At run speed the body outruns the spring for a
// frame or two over each edge (a 0.48m step at 7.5m/s needs ~-5m/s of descent
// that gravity alone can't supply), so isOnGround flickers and the spring
// slams back down -> visible jitter. The fix is a short "snap" window: when
// we were grounded last frame, are briefly airborne while moving, and walkable
// ground is still close below, pull down harder until the spring re-catches.

/** Snap window above the feet. Covers the tallest park step (0.48m) + float. */
export const DOWNHILL_SNAP_FEET = 0.75;
/** Don't snap when already falling fast (real falls should feel like falls). */
export const DOWNHILL_SNAP_MAX_FALL = -10;
/** cos(50 deg): walkable ceiling mirroring the controller's slopeMaxAngle. */
export const WALKABLE_NORMAL_Y = 0.64;
/** Guaranteed minimum sink speed while snapping (m/s). */
export const DOWNHILL_SNAP_MIN_SINK = -3.5;
/** Extra downward acceleration while snapping (m/s^2). */
export const DOWNHILL_SNAP_ACCEL = 25;

export interface DownhillStickState {
  wasGrounded: boolean;
  grounded: boolean;
  verticalSpeed: number;
  /** Any move input held. */
  moving: boolean;
  /** Not hanging / rolling / seated / entering / dead. */
  enabled: boolean;
  /** Feet height above walkable ground, or null when nothing is in range. */
  feetAboveGround: number | null;
  groundNormalY?: number;
}

export function shouldStickToGround(state: DownhillStickState) {
  if (!state.enabled || !state.moving) return false;
  if (!state.wasGrounded || state.grounded) return false;
  if (state.verticalSpeed > 0 || state.verticalSpeed < DOWNHILL_SNAP_MAX_FALL) return false;
  if (state.feetAboveGround === null) return false;
  if (state.feetAboveGround < 0 || state.feetAboveGround > DOWNHILL_SNAP_FEET) return false;
  if ((state.groundNormalY ?? 1) < WALKABLE_NORMAL_Y) return false;
  return true;
}

export function downhillSnapSpeed(verticalSpeed: number, delta: number) {
  return Math.min(verticalSpeed - DOWNHILL_SNAP_ACCEL * delta, DOWNHILL_SNAP_MIN_SINK);
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
