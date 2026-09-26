import assert from "node:assert/strict";
import test from "node:test";
import {
  dampYaw,
  MOVEMENT_DEFAULTS,
  stepPlanarVelocity,
  wrapAngle,
} from "../src/gameplay/movement.ts";

const dt = 1 / 60;
const run = MOVEMENT_DEFAULTS.runSpeed;

function simulate(
  velocity: { x: number; z: number },
  wish: { x: number; z: number },
  steps: number,
  grounded = true,
) {
  let skidding = false;
  let skidSteps = 0;
  for (let i = 0; i < steps; i++) {
    skidding = stepPlanarVelocity(velocity, { wish, maxSpeed: run, grounded, skidding, dt });
    if (skidding) skidSteps++;
  }
  return { velocity, skidding, skidSteps };
}

test("reaches run speed quickly from rest", () => {
  const { velocity } = simulate({ x: 0, z: 0 }, { x: 0, z: 1 }, 20);
  assert.ok(Math.abs(velocity.z - run) < 1e-6);
});

test("releasing input stops the character on the ground", () => {
  const { velocity } = simulate({ x: 0, z: run }, { x: 0, z: 0 }, 20);
  assert.equal(Math.hypot(velocity.x, velocity.z), 0);
});

test("a 90 degree turn carves without losing speed", () => {
  const velocity = { x: 0, z: run };
  let minSpeed = run;
  for (let i = 0; i < 30; i++) {
    stepPlanarVelocity(velocity, {
      wish: { x: 1, z: 0 },
      maxSpeed: run,
      grounded: true,
      skidding: false,
      dt,
    });
    minSpeed = Math.min(minSpeed, Math.hypot(velocity.x, velocity.z));
  }
  assert.ok(minSpeed > run - 1e-6);
  assert.ok(velocity.x > run * 0.99);
});

test("reversing at speed skids to a stop, then runs the new way", () => {
  const { velocity, skidSteps } = simulate({ x: 0, z: run }, { x: 0, z: -1 }, 60);
  assert.ok(skidSteps > 0);
  assert.ok(velocity.z < -run * 0.99);
});

test("air steering never bleeds existing momentum", () => {
  const fast = MOVEMENT_DEFAULTS.runSpeed + 3;
  const { velocity } = simulate({ x: 0, z: fast }, { x: 0, z: 1 }, 30, false);
  assert.ok(Math.abs(velocity.z - fast) < 1e-6);
});

test("air steering bends the arc but slower than on the ground", () => {
  const air = simulate({ x: 0, z: run }, { x: 1, z: 0 }, 10, false).velocity;
  const ground = simulate({ x: 0, z: run }, { x: 1, z: 0 }, 10, true).velocity;
  assert.ok(air.x > 0);
  assert.ok(air.x < ground.x);
});

test("yaw damping takes the short way across the seam", () => {
  const next = dampYaw(Math.PI - 0.1, -Math.PI + 0.1, 16, dt);
  assert.ok(Math.abs(wrapAngle(next - Math.PI)) < 0.1);
});
