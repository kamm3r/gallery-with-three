import { ResultScreen } from "./ecs/gameplayTraits.ts";
import { runtimeWorld } from "./ecs/world.ts";
export const isResultScreenActive = () => runtimeWorld.get(ResultScreen)!.active;
export function setResultScreenActive(next: boolean) {
  runtimeWorld.set(ResultScreen, { active: next });
  // Set before releasing so pointerlockchange does not open Pause.
  if (next && document.pointerLockElement) document.exitPointerLock();
}
