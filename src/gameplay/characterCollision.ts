type CollisionBody = {
  handle: number;
  userData?: unknown;
};
type SweepCollider = {
  handle: number;
  parent: () => CollisionBody | null;
};
export type PlatformCollisionData = {
  nonBlocking?: boolean;
  rideBlockingColliders?: ReadonlySet<number>;
};

/** Follow a ridden deck explicitly, but still collide with its attached walls. */
export function characterSweepAllowed(collider: SweepCollider, ridingHandle: number) {
  const body = collider.parent();
  const data = body?.userData as PlatformCollisionData | undefined;
  if (data?.nonBlocking) return false;
  return (
    body?.handle !== ridingHandle || data?.rideBlockingColliders?.has(collider.handle) === true
  );
}

type Vector = { x: number; y: number; z: number };
const toward: Vector = { x: 0, y: 0, z: 0 };

/**
 * Unit direction from the character toward an obstacle it swept into: up for
 * a ceiling, down for the floor, into a wall. Rapier 0.21 reports `normal1`
 * pointing back at the character (0.20 pointed at the obstacle);
 * tests/characterCollision.test.ts pins the convention against real Rapier.
 * The returned object is reused.
 */
export function towardObstacle(hit: { normal1: Vector }) {
  toward.x = -hit.normal1.x;
  toward.y = -hit.normal1.y;
  toward.z = -hit.normal1.z;
  return toward;
}
