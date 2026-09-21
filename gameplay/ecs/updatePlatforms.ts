import { createQuery, type World } from 'koota';
import { PlatformBody, PlatformMotion, SimulationTime } from './traits.ts';

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
    position.x = motion.x + (motion.axis === 'x' ? offset : 0);
    position.y = motion.y + (motion.axis === 'y' ? offset : 0);
    position.z = motion.z + (motion.axis === 'z' ? offset : 0);
    view.body.setNextKinematicTranslation(position);
    if (motion.spin) {
      rotation.y = Math.sin(elapsed * motion.spin / 2);
      rotation.w = Math.cos(elapsed * motion.spin / 2);
      view.body.setNextKinematicRotation(rotation);
    }
  });
}
