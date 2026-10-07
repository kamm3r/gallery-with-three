/** Project tuning, informed by camera design references in docs/combat-camera-research.md. */
export const COMBAT_CAMERA = {
  pitch: 0.24,
  targetHeight: 1.35,
  minPitch: -0.65,
  maxPitch: 1.05,
  minZoom: 4,
  maxZoom: 10,
  recoveryHold: 0.12,
  recoveryRate: 5,
};

export function createCameraArm(distance: number) {
  return { distance, hold: 0 };
}

/** Immediate clearance correction; hold the closest distance before easing out. */
export function stepCameraArm(
  state: ReturnType<typeof createCameraArm>,
  clearance: number,
  delta: number,
) {
  if (clearance < state.distance) {
    state.distance = clearance;
    state.hold = COMBAT_CAMERA.recoveryHold;
  } else if (state.hold > 0) {
    state.hold = Math.max(0, state.hold - delta);
  } else {
    state.distance +=
      (clearance - state.distance) * (1 - Math.exp(-COMBAT_CAMERA.recoveryRate * delta));
  }
  return state.distance;
}

/** Query callbacks read JS metadata only: Rapier getters can re-enter a borrowed world. */
export function blocksCamera(collider: { parent(): { userData?: unknown } | null }) {
  const data = collider.parent()?.userData as
    | { cameraIgnore?: boolean; nonBlocking?: boolean }
    | undefined;
  return !data?.cameraIgnore && !data?.nonBlocking;
}
