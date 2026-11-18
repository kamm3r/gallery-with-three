import { createQuery, type World } from "koota";
import { PlatformBody, PlatformMotion, SimulationTime } from "./traits.ts";

const platforms = createQuery(PlatformMotion, PlatformBody);
const position = { x: 0, y: 0, z: 0 };
const rotation = { x: 0, y: 0, z: 0, w: 1 };

/** Runs on physics steps, never render frames. */
export function updatePlatforms(world: World, delta: number) {
  const elapsed = world.get(SimulationTime)!.elapsed + delta;
  world.set(SimulationTime, { elapsed });
  world.query(platforms).readEach(([motion, view]) => {
    if (!view.body) return;
    const offset = Math.sin(elapsed * motion.speed + motion.phase) * motion.distance;
    // Move along the authored node's local axis, transformed into world space.
    // An orbit adds a circle on the local ground plane.
    const angle = elapsed * motion.orbitSpeed + motion.phase;
    const vx = (motion.axis === "x" ? offset : 0) + Math.cos(angle) * motion.orbitRadius;
    const vy = motion.axis === "y" ? offset : 0;
    const vz = (motion.axis === "z" ? offset : 0) + Math.sin(angle) * motion.orbitRadius;
    const tx = 2 * (motion.qy * vz - motion.qz * vy);
    const ty = 2 * (motion.qz * vx - motion.qx * vz);
    const tz = 2 * (motion.qx * vy - motion.qy * vx);
    position.x = motion.x + vx + motion.qw * tx + motion.qy * tz - motion.qz * ty;
    position.y = motion.y + vy + motion.qw * ty + motion.qz * tx - motion.qx * tz;
    position.z = motion.z + vz + motion.qw * tz + motion.qx * ty - motion.qy * tx;
    view.body.setNextKinematicTranslation(position);
    if (motion.spin || motion.tiltAmp) {
      // Yaw from spin composed with pitch oscillation: q = qY * qX.
      const halfSpin = (elapsed * motion.spin) / 2;
      const halfPitch = (Math.sin(elapsed * motion.tiltSpeed) * motion.tiltAmp) / 2;
      const sy = Math.sin(halfSpin);
      const cy = Math.cos(halfSpin);
      const px = Math.sin(halfPitch);
      const cx = Math.cos(halfPitch);
      const x = cy * px,
        y = sy * cx,
        z = -sy * px,
        w = cy * cx;
      rotation.x = motion.qw * x + motion.qx * w + motion.qy * z - motion.qz * y;
      rotation.y = motion.qw * y - motion.qx * z + motion.qy * w + motion.qz * x;
      rotation.z = motion.qw * z + motion.qx * y - motion.qy * x + motion.qz * w;
      rotation.w = motion.qw * w - motion.qx * x - motion.qy * y - motion.qz * z;
      view.body.setNextKinematicRotation(rotation);
    }
  });
}
