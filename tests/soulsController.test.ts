import test from "node:test";
import assert from "node:assert/strict";
import { capitalControllerTuning } from "../src/gameplay/capitalMetrics.ts";
import { autoRotateYaw, AUTO_ROTATE_DELAY } from "../src/gameplay/combatCamera.ts";
import { MOVEMENT_DEFAULTS, SOULS_MOVEMENT, stepPlanarVelocity } from "../src/gameplay/movement.ts";
import { getGravityScale, SOULS_JUMP } from "../src/gameplay/playerRules.ts";
import { createEncounter } from "../src/gameplay/bossEncounter.ts";
import {
  DEFLECT_MASH,
  DEFLECT_WINDOW,
  receiveBlow,
  stepDeflect,
} from "../src/gameplay/playerDefense.ts";

const dt = 1 / 60;
const GRAVITY = 30;

void test("the combat realms use the souls preset; other worlds keep their platformer feel", () => {
  assert.equal(capitalControllerTuning.skidAngle, SOULS_MOVEMENT.skidAngle);
  assert.equal(capitalControllerTuning.jumpSpeed, SOULS_JUMP.jumpSpeed);
  assert.equal(MOVEMENT_DEFAULTS.turnBrake, 0);
});

void test("a souls reversal pivots without skidding, sheds some speed, and recovers", () => {
  const speed = capitalControllerTuning.runSpeed;
  const velocity = { x: 0, z: speed };
  let skidding = false,
    slowest = speed,
    turnedAt = -1;
  for (let i = 0; i < 60; i++) {
    skidding = stepPlanarVelocity(
      velocity,
      { wish: { x: 0, z: -1 }, maxSpeed: speed, grounded: true, skidding, dt },
      capitalControllerTuning,
    );
    assert.equal(skidding, false);
    slowest = Math.min(slowest, Math.hypot(velocity.x, velocity.z));
    if (turnedAt < 0 && velocity.z < -0.95 * Math.hypot(velocity.x, velocity.z)) turnedAt = i * dt;
  }
  assert.ok(turnedAt > 0 && turnedAt < 0.25, `turned round in ${turnedAt}s`);
  assert.ok(slowest < speed * 0.8 && slowest > speed * 0.3, `dipped to ${slowest}`);
  assert.ok(Math.abs(velocity.z + speed) < 1e-6);
});

void test("airborne, the souls arc keeps its momentum and barely steers", () => {
  const velocity = { x: 0, z: 6.6 };
  for (let i = 0; i < 30; i++)
    stepPlanarVelocity(
      velocity,
      { wish: { x: 0, z: -1 }, maxSpeed: 6.6, grounded: false, skidding: false, dt },
      SOULS_MOVEMENT,
    );
  // Half a second of pulling back still carries the jump forward.
  assert.ok(velocity.z > 4.5, `kept ${velocity.z} m/s`);
});

function jump(holdFor: number) {
  let y = 0,
    vy = SOULS_JUMP.jumpSpeed,
    t = 0,
    peak = 0;
  while (y >= 0) {
    const held = t < holdFor;
    vy -= GRAVITY * getGravityScale(vy, held, vy > 0, SOULS_JUMP) * dt;
    y += vy * dt;
    t += dt;
    peak = Math.max(peak, y);
  }
  return { peak, airtime: t };
}

void test("the souls jump is one committed arc, the same tapped or held", () => {
  const tap = jump(dt),
    held = jump(Infinity);
  assert.ok(Math.abs(tap.peak - held.peak) < 1e-9);
  assert.ok(held.peak > 1 && held.peak < 1.4, `peaks at ${held.peak}m`);
  assert.ok(held.airtime > 0.45 && held.airtime < 0.65, `airborne ${held.airtime}s`);
});

const ahead = { damage: 30, x: 0, z: 3, knockback: 5, parryable: false };
function guard() {
  return Object.assign(createEncounter(), {
    playerX: 0,
    playerZ: 0,
    playerYaw: 0,
    guarding: true,
    stamina: 50,
  });
}

void test("a guard pressed just before a blow deflects it for free", () => {
  const d = guard();
  stepDeflect(d, true, dt);
  stepDeflect(d, false, DEFLECT_WINDOW / 2);
  assert.equal(receiveBlow(d, ahead), "deflected");
  assert.equal(d.health, 100);
  assert.equal(d.stamina, 50);
  // Too late: an ordinary guard, with chip damage and a stamina cost.
  stepDeflect(d, false, DEFLECT_WINDOW);
  assert.equal(receiveBlow(d, ahead), "guarded");
  assert.ok(d.health < 100 && d.stamina < 50);
});

void test("deflects only work from the front, and mashing the guard earns no window", () => {
  const d = guard();
  stepDeflect(d, true, dt);
  assert.equal(receiveBlow(d, { ...ahead, z: -3 }), "hit");
  const mashed = guard();
  stepDeflect(mashed, true, dt);
  stepDeflect(mashed, false, DEFLECT_MASH / 2);
  stepDeflect(mashed, true, dt);
  assert.equal(receiveBlow(mashed, ahead), "guarded");
  // A patient press after the mash window deflects again.
  stepDeflect(mashed, false, DEFLECT_MASH);
  stepDeflect(mashed, true, dt);
  assert.equal(receiveBlow(mashed, ahead), "deflected");
});

void test("the camera drifts behind sideways travel only once the player stops looking", () => {
  // Camera yaw 0 looks along -Z; its right is +X.
  assert.equal(autoRotateYaw(0, 4, 0, AUTO_ROTATE_DELAY / 2, dt), 0);
  let yaw = 0;
  for (let i = 0; i < 120; i++) yaw = autoRotateYaw(yaw, 4, 0, 5, dt);
  assert.ok(yaw < -0.3, `turned right to ${yaw}`);
  // Straight toward or away from the camera leaves it alone.
  assert.equal(autoRotateYaw(0, 0, 4, 5, dt), 0);
  assert.equal(autoRotateYaw(0, 0, -4, 5, dt), 0);
});
