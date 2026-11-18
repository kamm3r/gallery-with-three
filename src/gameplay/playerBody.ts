// The player is a kinematic body, so sensors can't spot it with isDynamic()
// and can't push it with setLinvel(). It tags its rigid body instead.

export interface PlayerBodyData {
  player: true;
  /** Sets vertical speed and scales planar speed, like setLinvel on a dynamic body. */
  launch: (verticalSpeed: number, planarScale?: number) => void;
}

interface TaggedBody {
  userData?: unknown;
}

export function playerBodyData(body: TaggedBody | null | undefined): PlayerBodyData | null {
  const data = body?.userData as Partial<PlayerBodyData> | undefined;
  return data?.player === true ? (data as PlayerBodyData) : null;
}

export function isPlayerBody(body: TaggedBody | null | undefined) {
  return playerBodyData(body) !== null;
}

type CapsuleCollider = {
  translation: () => { x: number; y: number; z: number };
  shape: unknown;
  isValid?: () => boolean;
};

/**
 * The player's capsule, registered by the character controller for code that
 * runs inside a physics step (one-way boards). Rendered positions trail the
 * physics by up to a frame, which is enough to fall through a board.
 */
export const activePlayer: { collider: CapsuleCollider | null } = { collider: null };

/** The capsule's lowest point and radius in world space, or null without a player. */
export function playerFeet() {
  const collider = activePlayer.collider;
  if (!collider || collider.isValid?.() === false) return null;
  const shape = collider.shape as { halfHeight?: number; radius?: number };
  const radius = shape.radius ?? 0;
  const { x, y, z } = collider.translation();
  return { x, y: y - (shape.halfHeight ?? 0) - radius, z, radius };
}
