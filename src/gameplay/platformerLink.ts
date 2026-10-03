// Shared, mutable handshake between the player controller and a Warp Room
// world. The player writes its feet sample every frame; the world asks for
// bounces and freezes the player while a death plays out.

export const SPIN_TIME = 0.45;
export const SPIN_COOLDOWN = 0.2;

export interface PlatformerLink {
  x: number;
  /** Feet height. */
  y: number;
  z: number;
  vy: number;
  grounded: boolean;
  /** Seconds left in the current spin, 0 when not spinning. */
  spinTime: number;
  spinCooldown: number;
  lastSpinPress: number;
  /** Launch speed requested by the world; the player consumes it. */
  bounce: number;
  /** Death beat: no input, death pose. */
  frozen: boolean;
}

export function createPlatformerLink(): PlatformerLink {
  return {
    x: 0,
    y: 0,
    z: 0,
    vy: 0,
    grounded: true,
    spinTime: 0,
    spinCooldown: 0,
    lastSpinPress: -1,
    bounce: 0,
    frozen: false,
  };
}
