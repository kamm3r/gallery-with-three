// Planar movement model for the kinematic character controller. Pure math,
// no Rapier: the controller feeds it input and applies the result.
//
// Grounded speed and heading are steered separately (speed approaches the
// target, heading rotates toward input), so turns carve at full speed like
// Mario Odyssey instead of braking through zero. Reversing hard at speed
// skids first. Airborne keeps momentum and only steers.

export interface MovementTuning {
  walkSpeed: number;
  runSpeed: number;
  /** Ground acceleration toward target speed (m/s^2). */
  groundAccel: number;
  /** Ground braking with no input, or above target speed (m/s^2). */
  groundDecel: number;
  /** Heading turn rate on the ground (rad/s). */
  groundTurnRate: number;
  /** Input this far from the heading (rad) at speed reads as a reversal: skid. */
  skidAngle: number;
  /** Skids only start above this speed (m/s). */
  skidMinSpeed: number;
  /** Skid braking (m/s^2). */
  skidDecel: number;
  /** Airborne steering acceleration (m/s^2). */
  airAccel: number;
  /** Airborne drag with no input (m/s^2). */
  airDrag: number;
  /** Facing damping (1/s): higher snaps the body toward travel faster. */
  facingDampGround: number;
  facingDampAir: number;
}

export const MOVEMENT_DEFAULTS: MovementTuning = {
  walkSpeed: 4.8,
  runSpeed: 7.5,
  groundAccel: 34,
  groundDecel: 42,
  groundTurnRate: 11,
  skidAngle: 2.4,
  skidMinSpeed: 3.5,
  skidDecel: 55,
  airAccel: 16,
  airDrag: 1.5,
  facingDampGround: 16,
  facingDampAir: 6,
};

export interface Planar {
  x: number;
  z: number;
}

export interface PlanarStep {
  /** Unit input direction in world space, or zero for no input. */
  wish: Planar;
  maxSpeed: number;
  grounded: boolean;
  /** Skid carried over from the previous step. */
  skidding: boolean;
  dt: number;
}

export function wrapAngle(angle: number) {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

function approach(value: number, target: number, step: number) {
  return value < target ? Math.min(value + step, target) : Math.max(value - step, target);
}

/**
 * Advances planar velocity in place. Returns whether the character is
 * skidding (braking against a reversed input) after this step.
 */
export function stepPlanarVelocity(
  velocity: Planar,
  step: PlanarStep,
  tuning: MovementTuning = MOVEMENT_DEFAULTS,
) {
  const { wish, maxSpeed, grounded, dt } = step;
  const hasInput = wish.x !== 0 || wish.z !== 0;
  const speed = Math.hypot(velocity.x, velocity.z);

  if (!grounded) {
    if (!hasInput) {
      const next = Math.max(0, speed - tuning.airDrag * dt);
      const scale = speed > 0 ? next / speed : 0;
      velocity.x *= scale;
      velocity.z *= scale;
      return false;
    }
    // Steer only: never bleed momentum you already have (long jumps, rolls).
    const targetSpeed = Math.max(maxSpeed, speed);
    const dx = wish.x * targetSpeed - velocity.x;
    const dz = wish.z * targetSpeed - velocity.z;
    const gap = Math.hypot(dx, dz);
    const move = Math.min(gap, tuning.airAccel * dt);
    if (gap > 0) {
      velocity.x += (dx / gap) * move;
      velocity.z += (dz / gap) * move;
    }
    return false;
  }

  if (!hasInput) {
    const next = Math.max(0, speed - tuning.groundDecel * dt);
    const scale = speed > 0 ? next / speed : 0;
    velocity.x *= scale;
    velocity.z *= scale;
    return false;
  }

  const wishAngle = Math.atan2(wish.x, wish.z);
  if (speed < 0.05) {
    const next = Math.min(maxSpeed, tuning.groundAccel * dt);
    velocity.x = wish.x * next;
    velocity.z = wish.z * next;
    return false;
  }
  const heading = Math.atan2(velocity.x, velocity.z);
  const turn = wrapAngle(wishAngle - heading);
  const skid =
    (step.skidding && Math.abs(turn) > Math.PI / 2) ||
    (Math.abs(turn) > tuning.skidAngle && speed > tuning.skidMinSpeed);
  if (skid) {
    const next = Math.max(0, speed - tuning.skidDecel * dt);
    if (next < 0.5) {
      // Skid done: pivot and push off the new way.
      velocity.x = wish.x * next;
      velocity.z = wish.z * next;
      return false;
    }
    velocity.x *= next / speed;
    velocity.z *= next / speed;
    return true;
  }
  const maxTurn = tuning.groundTurnRate * dt;
  const nextHeading = heading + Math.max(-maxTurn, Math.min(maxTurn, turn));
  const nextSpeed = approach(
    speed,
    maxSpeed,
    (speed < maxSpeed ? tuning.groundAccel : tuning.groundDecel) * dt,
  );
  velocity.x = Math.sin(nextHeading) * nextSpeed;
  velocity.z = Math.cos(nextHeading) * nextSpeed;
  return false;
}

/** Eases yaw toward a target angle, taking the short way round. */
export function dampYaw(yaw: number, target: number, damping: number, dt: number) {
  return wrapAngle(yaw + wrapAngle(target - yaw) * (1 - Math.exp(-damping * dt)));
}
