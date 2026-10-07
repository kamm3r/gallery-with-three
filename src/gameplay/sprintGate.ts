import { SprintGate } from "./ecs/gameplayTraits.ts";
import { runtimeWorld } from "./ecs/world.ts";
// Worlds with stamina (Hollow Lane) switch sprinting off while the survivor
// is winded. The player controller reads this every frame.

export const isSprintAllowed = () => runtimeWorld.get(SprintGate)!.allowed;
export function setSprintAllowed(next: boolean) {
  runtimeWorld.set(SprintGate, { allowed: next });
}
