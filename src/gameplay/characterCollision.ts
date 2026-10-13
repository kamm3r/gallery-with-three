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
