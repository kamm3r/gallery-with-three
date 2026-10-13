/** Something the player can lock on to: a live enemy or the active boss. */
export interface LockTarget {
  id: string;
  x: number;
  y: number;
  z: number;
  /** Where the reticle sits above the target's feet. */
  height?: number;
}

/** Targets further than this are not picked. */
export const LOCK_RANGE = 20;
/** A held lock breaks beyond this distance, or across a large height gap. */
export const LOCK_BREAK = 26;
const LOCK_HEIGHT = 4;
/** Only targets within this angle of the camera's view are picked. */
const LOCK_CONE = (70 * Math.PI) / 180;
/** A held lock survives this long out of sight before it drops. */
export const LOCK_LOST_DELAY = 2.5;
/** Horizontal mouse travel, in pixels at default sensitivity, that flicks to the next target. */
export const LOCK_FLICK = 90;
/** Pitch added to the camera per radian the target sits below eye level, while locked. */
export const LOCK_PITCH_FOLLOW = 0.6;

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/**
 * Picks the target nearest the centre of the view, weighing distance, from the player
 * at (x, y, z) looking along the camera yaw (camera forward is (-sin, -cos)).
 */
export function pickLockTarget(
  targets: readonly LockTarget[],
  x: number,
  y: number,
  z: number,
  cameraYaw: number,
  visible: (t: LockTarget) => boolean = () => true,
): LockTarget | null {
  let best: LockTarget | null = null,
    bestScore = Infinity;
  for (const t of targets) {
    if (!visible(t)) continue;
    const dx = t.x - x,
      dz = t.z - z,
      distance = Math.hypot(dx, dz);
    if (distance > LOCK_RANGE || Math.abs(t.y - y) > LOCK_HEIGHT) continue;
    const off = distance < 1 ? 0 : Math.abs(wrap(Math.atan2(-dx, -dz) - cameraYaw));
    if (off > LOCK_CONE) continue;
    const score = off * 8 + distance;
    if (score < bestScore) {
      best = t;
      bestScore = score;
    }
  }
  return best;
}

/**
 * Flicking while locked moves to the nearest visible target on that side of the
 * screen (+1 right, -1 left), judged by its bearing from the camera.
 */
export function switchLockTarget(
  targets: readonly LockTarget[],
  currentId: string,
  x: number,
  y: number,
  z: number,
  cameraYaw: number,
  side: 1 | -1,
  visible: (t: LockTarget) => boolean = () => true,
): LockTarget | null {
  // Bearing: 0 straight ahead, positive to the right of the view.
  const bearing = (t: LockTarget) => -wrap(Math.atan2(-(t.x - x), -(t.z - z)) - cameraYaw);
  const current = targets.find((t) => t.id === currentId);
  const from = current ? bearing(current) : 0;
  let best: LockTarget | null = null,
    bestTurn = Infinity;
  for (const t of targets) {
    if (t.id === currentId || !visible(t)) continue;
    if (Math.hypot(t.x - x, t.z - z) > LOCK_RANGE || Math.abs(t.y - y) > LOCK_HEIGHT) continue;
    const turn = (bearing(t) - from) * side;
    if (turn > 0.02 && turn < bestTurn) {
      best = t;
      bestTurn = turn;
    }
  }
  return best;
}

/** Whether a held lock on `target` still holds from the player's position. */
export function lockHolds(target: LockTarget | undefined, x: number, y: number, z: number) {
  return (
    target !== undefined &&
    Math.hypot(target.x - x, target.z - z) <= LOCK_BREAK &&
    Math.abs(target.y - y) <= LOCK_HEIGHT * 1.5
  );
}

/** Yaw for the camera to look from the player at the target (forward = (-sin, -cos)). */
export function lockCameraYaw(target: LockTarget, x: number, z: number) {
  return Math.atan2(-(target.x - x), -(target.z - z));
}

/** Body yaw facing the target (body +Z = (sin, cos)). */
export function lockFacingYaw(target: LockTarget, x: number, z: number) {
  return Math.atan2(target.x - x, target.z - z);
}

/** Eases an angle towards a target the short way round. */
export function dampAngle(from: number, to: number, rate: number, dt: number) {
  return from + wrap(to - from) * (1 - Math.exp(-rate * dt));
}
