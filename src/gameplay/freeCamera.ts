import { vec3, type Vec3 } from "math";

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
  out: Vec3 = vec3.create(),
) {
  const forward = Number(keys.has("KeyW")) - Number(keys.has("KeyS"));
  const right = Number(keys.has("KeyD")) - Number(keys.has("KeyA"));
  const up = Number(keys.has("KeyE")) - Number(keys.has("KeyQ"));
  const sinYaw = Math.sin(yaw),
    cosYaw = Math.cos(yaw),
    level = Math.cos(pitch) * forward;
  const x = -sinYaw * level + cosYaw * right;
  const y = Math.sin(pitch) * forward + up;
  const z = -cosYaw * level - sinYaw * right;
  const fast = keys.has("ShiftLeft") || keys.has("ShiftRight");
  const slow = keys.has("ControlLeft") || keys.has("ControlRight");
  const distance = speed * (slow ? 0.2 : fast ? 4 : 1) * Math.min(0.05, Math.max(0, delta));
  // Normalize and scale in one pass, writing into the caller's reused tuple.
  const scale = distance / (Math.sqrt(x * x + y * y + z * z) || 1);
  return vec3.set(out, x * scale, y * scale, z * scale);
}

/**
 * A view from the URL (`?camera=x,y,z&look=x,y,z`) for reproducible inspection shots.
 * Yaw and pitch match the free camera's YXZ convention (yaw 0 looks down −Z).
 */
export function cameraViewFromSearch(search: string) {
  const params = new URLSearchParams(search);
  const read = (key: string) => {
    const values = params.get(key)?.split(",").map(Number);
    return values?.length === 3 && values.every(Number.isFinite)
      ? (values as [number, number, number])
      : null;
  };
  const position = read("camera"),
    look = read("look");
  if (!position) return null;
  if (!look) return { position, yaw: 0, pitch: 0 };
  const dx = look[0] - position[0],
    dy = look[1] - position[1],
    dz = look[2] - position[2];
  return {
    position,
    yaw: Math.atan2(-dx, -dz),
    pitch: Math.atan2(dy, Math.hypot(dx, dz)),
  };
}
