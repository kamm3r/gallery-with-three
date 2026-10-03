import { MOVEMENT_DEFAULTS } from "./movement";
import { JUMP_DEFAULTS } from "./playerRules";

// Character controller settings shared by every world. The playground's Leva
// panel starts from these values and passes overrides to its own player only.

export const controllerDefaults = {
  ...MOVEMENT_DEFAULTS,
  ...JUMP_DEFAULTS,
  /** Rapier `offset`: gap kept between the capsule and everything it touches (m). */
  skinWidth: 0.03,
  /** Tallest ledge walked up without jumping. Counts the skin width, so
   * 0.55 clears the park's 0.48m steps and still blocks the 0.6m curb. */
  stepHeight: 0.55,
  /** How far down the controller pulls to stay glued when descending (m). */
  snapDistance: 0.5,
  /** Steepest walkable slope (rad). */
  slopeMaxAngle: (50 * Math.PI) / 180,
  /** Mass used to shove dynamic bodies (crates, seesaw). */
  mass: 10,
};

export type ControllerTuning = typeof controllerDefaults;
