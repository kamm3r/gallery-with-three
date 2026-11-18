import { HeldItems } from "./ecs/gameplayTraits.ts";
import { runtimeWorld } from "./ecs/world.ts";

// Things the player carries in hand, registered by the character rig so
// world code can follow them (e.g. a flashlight beam starting at its lens).
export const heldItems = runtimeWorld.get(HeldItems)!;
