import test from "node:test";
import assert from "node:assert/strict";
import RAPIER from "@dimforge/rapier3d-compat";
import { blocksCamera, createCameraArm, stepCameraArm } from "../src/gameplay/combatCamera.ts";

await RAPIER.init();
void test("camera sweep ignores NPCs and stale corpses while respecting stonework", () => {
  const world = new RAPIER.World({ x: 0, y: 0, z: 0 });
  try {
    const enemy = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased());
    enemy.userData = { cameraIgnore: true };
    world.createCollider(RAPIER.ColliderDesc.ball(1).setTranslation(0, 0, 3), enemy);
    world.createCollider(RAPIER.ColliderDesc.cuboid(3, 3, 0.2).setTranslation(0, 0, 6));
    world.step();
    const sweep = (filter?: typeof blocksCamera) =>
      world.castShape(
        { x: 0, y: 0, z: 0 },
        { x: 0, y: 0, z: 0, w: 1 },
        { x: 0, y: 0, z: 1 },
        new RAPIER.Ball(0.35),
        0,
        8,
        true,
        RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,
        undefined,
        undefined,
        undefined,
        filter,
      )!;
    assert.ok(sweep().time_of_impact < 2, "original camera collapses against the NPC");
    assert.ok(sweep(blocksCamera).time_of_impact > 5, "filtered camera reaches the wall");
    enemy.userData = { nonBlocking: true };
    enemy.setEnabled(false);
    assert.ok(sweep(blocksCamera).time_of_impact > 5, "stale corpse stays excluded");
  } finally {
    world.free();
  }
});
void test("occlusion recovery holds steady between pillars and never eases into a wall", () => {
  const arm = createCameraArm(7.5);
  assert.equal(stepCameraArm(arm, 2, 1 / 60), 2);
  for (let i = 0; i < 6; i++) assert.equal(stepCameraArm(arm, 7.5, 1 / 60), 2);
  for (let i = 0; i < 120; i++) stepCameraArm(arm, 7.5, 1 / 60);
  assert.ok(arm.distance > 7.49);
  assert.equal(stepCameraArm(arm, 1.2, 1 / 60), 1.2);
});
