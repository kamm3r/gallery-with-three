/**
 * One-way boards: open from below, solid from above, but they only hold you
 * briefly. Stand on one for longer than the grace time without jumping and it
 * opens under you; it stays open until you have dropped clear of it.
 */

/** How far the feet may sit below the deck top and still land (skin, snap). */
export const ONE_WAY_TOLERANCE = 0.02;
/** Seconds you may stand on a board before it lets you through. */
export const ONE_WAY_GRACE = 0.9;
/** Feet within this height above the top count as standing on it. */
const STANDING_HEIGHT = 0.1;
/** Fraction of the grace time after which the board shakes as a warning. */
const WARN_FROM = 0.5;

export type OneWayBoardShape = {
  center: { x: number; y: number; z: number };
  half: { x: number; y: number; z: number };
  /** Horizontal reach of the feet beyond their centre (the capsule radius). */
  reach: number;
};

export type OneWayState = { stood: number; open: boolean };

export const newOneWayState = (): OneWayState => ({ stood: 0, open: false });

/** Advances one physics step and returns whether the board is solid. */
export function stepOneWayBoard(
  state: OneWayState,
  feet: { x: number; y: number; z: number } | null,
  board: OneWayBoardShape,
  dt: number,
) {
  const { center, half } = board;
  const top = center.y + half.y;
  if (!feet) {
    state.stood = 0;
    state.open = false;
    return false;
  }
  const over =
    Math.abs(feet.x - center.x) <= half.x + board.reach &&
    Math.abs(feet.z - center.z) <= half.z + board.reach;
  if (state.open) {
    // Stay open until the feet are below the board or off to the side.
    if (over && feet.y >= center.y - half.y - 0.05) return false;
    state.open = false;
  }
  const solid = feet.y >= top - ONE_WAY_TOLERANCE;
  const standing = solid && over && feet.y <= top + STANDING_HEIGHT;
  state.stood = standing ? state.stood + dt : 0;
  if (state.stood >= ONE_WAY_GRACE) {
    state.stood = 0;
    state.open = true;
    return false;
  }
  return solid;
}

/** 0 while safe, rising to 1 as the board is about to open. */
export function oneWayWarning(state: OneWayState) {
  const t = state.stood / ONE_WAY_GRACE;
  return t <= WARN_FROM ? 0 : (t - WARN_FROM) / (1 - WARN_FROM);
}
