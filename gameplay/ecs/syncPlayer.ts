import { createQuery, type World } from 'koota';
import { Vector3 } from 'three';
import { PlayerPosition, PlayerView } from './traits.ts';

const players = createQuery(PlayerView);
const position = new Vector3();
export function syncPlayer(world: World) {
  let found = false;
  world.query(players).readEach(([view]) => {
    if (!view.object) return;
    view.object.getWorldPosition(position);
    world.set(PlayerPosition, { x: position.x, y: position.y, z: position.z, valid: true });
    found = true;
  });
  if (!found) world.set(PlayerPosition, { x: 1000, y: 1000, z: 1000, valid: false });
}
