import { CameraRig } from "./ecs/gameplayTraits.ts";
import { runtimeWorld } from "./ecs/world.ts";
// Worlds can ask the player camera for a tighter over-the-shoulder framing
// (Hollow Lane does indoors, where rooms are too small for the usual high,
// distant follow camera). The player controller blends toward it each frame.
export const cameraRig = runtimeWorld.get(CameraRig)!;
