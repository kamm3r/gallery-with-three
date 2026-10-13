import test from "node:test";
import assert from "node:assert/strict";
import RAPIER from "@dimforge/rapier3d-compat";
import { setCapsuleStance } from "../src/gameplay/capsuleStance.ts";
import {
  CAPITAL_METRICS,
  CAPITAL_ROLL_DISTANCE,
  capitalControllerTuning,
  capitalPlayerProfile,
} from "../src/gameplay/capitalMetrics.ts";
import { stepPlanarVelocity } from "../src/gameplay/movement.ts";
import { ROLL_DURATION, rollSpeedAt } from "../src/gameplay/playerRules.ts";

void test("capital crouch keeps the feet fixed and refuses to stand through a ceiling", async () => {
  await RAPIER.init();
  const world = new RAPIER.World({ x: 0, y: 0, z: 0 });
  const body = world.createRigidBody(
    RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0, 0.93, 0),
  );
  const collider = world.createCollider(RAPIER.ColliderDesc.capsule(0.48, 0.42), body);
  const ceiling = world.createCollider(
    RAPIER.ColliderDesc.cuboid(2, 0.1, 2).setTranslation(0, 1.6, 0),
  );
  world.step();
  const change = (height: number) =>
    setCapsuleStance(1.8, height, 0.42, collider.shape as RAPIER.Capsule, {
      capsule: (half, radius) => new RAPIER.Capsule(half, radius),
      blocked: (shape, offset) =>
        Boolean(
          world.intersectionWithShape(
            { x: 0, y: 0.93 + offset, z: 0 },
            body.rotation(),
            shape,
            undefined,
            undefined,
            collider,
            body,
          ),
        ),
      apply: (shape, offset) => {
        collider.setShape(shape);
        collider.setTranslationWrtParent({ x: 0, y: offset, z: 0 });
      },
    });
  assert.equal(change(1.2), true);
  world.step();
  const shape = collider.shape as RAPIER.Capsule;
  assert.ok(Math.abs(collider.translation().y - shape.halfHeight - shape.radius - 0.03) < 1e-5);
  assert.equal(change(1.8), false);
  world.removeCollider(ceiling, true);
  world.step();
  assert.equal(change(1.8), true);
  world.free();
});

void test("capital movement reaches its speeds, sprints clearly faster, and rolls four metres", () => {
  assert.ok(capitalControllerTuning.runSpeed >= capitalControllerTuning.walkSpeed * 1.4);
  for (const speed of [capitalControllerTuning.walkSpeed, capitalControllerTuning.runSpeed]) {
    const velocity = { x: 0, z: 0 };
    for (let i = 0; i < 120; i++)
      stepPlanarVelocity(
        velocity,
        { wish: { x: 0, z: 1 }, maxSpeed: speed, grounded: true, skidding: false, dt: 1 / 60 },
        capitalControllerTuning,
      );
    assert.equal(velocity.z, speed);
  }
  for (const hz of [30, 60, 144]) {
    let distance = 0;
    for (let t = 0; t < ROLL_DURATION; t += 1 / hz) {
      const dt = Math.min(1 / hz, ROLL_DURATION - t);
      distance += rollSpeedAt(capitalPlayerProfile.rollSpeed, t + dt / 2, ROLL_DURATION) * dt;
    }
    assert.ok(Math.abs(distance - CAPITAL_ROLL_DISTANCE) < 1e-8);
    assert.ok(distance >= CAPITAL_METRICS.rollDistance * 1.5);
  }
});
