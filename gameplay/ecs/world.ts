import { createWorld } from 'koota';
import { PlayerPosition, SimulationTime, VisibilityStats } from './traits.ts';

export function createRuntimeWorld() {
  return createWorld(PlayerPosition, SimulationTime, VisibilityStats);
}

// One active game canvas. View effects own entity creation and teardown.
export const runtimeWorld = createRuntimeWorld();
