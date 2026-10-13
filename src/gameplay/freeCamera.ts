import * as THREE from "three";

export const FREE_CAMERA_SPEED = 12;
export const FREE_CAMERA_KEYS = new Set([
  "KeyW",
  "KeyS",
  "KeyA",
  "KeyD",
  "KeyQ",
  "KeyE",
  "ShiftLeft",
  "ShiftRight",
  "ControlLeft",
  "ControlRight",
]);

/** Camera-relative flight, with world-up elevation and a constant diagonal speed. */
export function freeCameraMovement(
  keys: ReadonlySet<string>,
  yaw: number,
  pitch: number,
  speed: number,
  delta: number,
) {
  const forward = Number(keys.has("KeyW")) - Number(keys.has("KeyS"));
  const right = Number(keys.has("KeyD")) - Number(keys.has("KeyA"));
  const up = Number(keys.has("KeyE")) - Number(keys.has("KeyQ"));
  const movement = new THREE.Vector3(
    -Math.sin(yaw) * Math.cos(pitch) * forward + Math.cos(yaw) * right,
    Math.sin(pitch) * forward + up,
    -Math.cos(yaw) * Math.cos(pitch) * forward - Math.sin(yaw) * right,
  );
  const fast = keys.has("ShiftLeft") || keys.has("ShiftRight");
  const slow = keys.has("ControlLeft") || keys.has("ControlRight");
  return movement
    .normalize()
    .multiplyScalar(speed * (slow ? 0.2 : fast ? 4 : 1) * Math.min(0.05, Math.max(0, delta)));
}
