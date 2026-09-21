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
