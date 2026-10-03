import type { Object3D } from "three";

// Things the player carries in hand, registered by the character rig so
// world code can follow them (e.g. a flashlight beam starting at its lens).
export const heldItems = {
  flashlightLens: null as Object3D | null,
  /** Whether the held flashlight's lens should glow. */
  flashlightOn: false,
};
