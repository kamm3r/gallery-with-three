import { characterSweepAllowed } from "../src/gameplay/characterCollision.ts";
import assert from "node:assert/strict";
import test from "node:test";
import RAPIER from "@dimforge/rapier3d-compat";
import { capitalLiftGeometry } from "../src/gameplay/capitalLiftGeometry.ts";
import { capitalLifts } from "../src/gameplay/capitalLayout.ts";

await RAPIER.init();

void test("every lift blocks capsule exits through its side walls and keeps both boarding ends open", () => {
  for (const lift of capitalLifts) {
    const world = new RAPIER.World({ x: 0, y: 0, z: 0 });
    const platform = world.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased().setRotation({
        x: 0,
        y: Math.sin(lift.yaw / 2),
        z: 0,
        w: Math.cos(lift.yaw / 2),
      }),
    );
    const walls = new Set<number>();
    platform.userData = { rideBlockingColliders: walls };
    for (const [index, { size, position }] of capitalLiftGeometry.entries()) {
      const shape = world.createCollider(
        RAPIER.ColliderDesc.cuboid(size[0] / 2, size[1] / 2, size[2] / 2).setTranslation(
          ...position,
        ),
        platform,
      );
      if (index > 0) walls.add(shape.handle);
    }
    const body = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased());
    const capsule = world.createCollider(RAPIER.ColliderDesc.capsule(0.48, 0.42), body);
    const controller = world.createCharacterController(0.03);
    try {
      // Reuse the same moving body's colliders at both landings and halfway through travel.
      for (const y of [lift.low, (lift.low + lift.high) / 2, lift.high]) {
        platform.setNextKinematicTranslation({ x: lift.center[0], y: y - 0.3, z: lift.center[2] });
        world.step();
        for (const direction of [
          { x: -4, z: 0 },
          { x: 4, z: 0 },
          { x: 0, z: -4 },
          { x: 0, z: 4 },
        ]) {
          body.setTranslation({ x: lift.center[0], y: y + 0.93, z: lift.center[2] }, true);
          world.step();
          const worldDirection = {
            x: direction.x * Math.cos(lift.yaw) + direction.z * Math.sin(lift.yaw),
            y: 0,
            z: -direction.x * Math.sin(lift.yaw) + direction.z * Math.cos(lift.yaw),
          };
          controller.computeColliderMovement(
            capsule,
            worldDirection,
            undefined,
            undefined,
            (other) =>
              other.handle !== capsule.handle && characterSweepAllowed(other, platform.handle),
          );
          const movement = controller.computedMovement();
          const localX = movement.x * Math.cos(lift.yaw) - movement.z * Math.sin(lift.yaw);
          const localZ = movement.x * Math.sin(lift.yaw) + movement.z * Math.cos(lift.yaw);
          if (direction.x) {
            assert.ok(Math.abs(localX) < 2.4, `${lift.id} side wall fails at ${y}`);
            assert.ok(Math.abs(localX) > 2, "walls must leave usable deck space");
          } else assert.ok(Math.abs(localZ) > 3.9, `${lift.id} boarding end blocked at ${y}`);
        }
      }
    } finally {
      world.removeCharacterController(controller);
      world.free();
    }
  }
});

void test("all six real lift landings have clear capsule corridors through the new side colliders", async () => {
  const { buildCapitalEnvironment } = await import("../src/gameplay/capitalEnvironment.ts");
  const environment = buildCapitalEnvironment(false);
  const world = new RAPIER.World({ x: 0, y: -30, z: 0 });
  for (const floor of environment.colliders)
    world.createCollider(RAPIER.ColliderDesc.trimesh(floor.vertices, floor.indices));
  for (const solid of environment.solids)
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(solid.size[0] / 2, solid.size[1] / 2, solid.size[2] / 2)
        .setTranslation(solid.position[0], solid.position[1] + solid.size[1] / 2, solid.position[2])
        .setRotation({ x: 0, y: Math.sin(solid.yaw / 2), z: 0, w: Math.cos(solid.yaw / 2) }),
    );
  try {
    for (const lift of capitalLifts)
      for (const landing of [lift.lower, lift.upper]) {
        const y = landing[1];
        const platform = world.createRigidBody(
          RAPIER.RigidBodyDesc.kinematicPositionBased()
            .setTranslation(lift.center[0], y - 0.3, lift.center[2])
            .setRotation({ x: 0, y: Math.sin(lift.yaw / 2), z: 0, w: Math.cos(lift.yaw / 2) }),
        );
        const walls = new Set<number>();
        platform.userData = { rideBlockingColliders: walls };
        for (const [index, { size, position }] of capitalLiftGeometry.entries()) {
          const shape = world.createCollider(
            RAPIER.ColliderDesc.cuboid(size[0] / 2, size[1] / 2, size[2] / 2).setTranslation(
              ...position,
            ),
            platform,
          );
          if (index > 0) walls.add(shape.handle);
        }
        world.step();
        // Probe the complete boarding corridor with the player capsule, just above
        // contact skin. Deck support is checked separately; only walls may obstruct it.
        const shape = new RAPIER.Capsule(0.48, 0.42);
        for (const [from, to] of [
          [landing, [lift.center[0], y, lift.center[2]]],
          [[lift.center[0], y, lift.center[2]], landing],
        ]) {
          const distance = Math.hypot(to[0] - from[0], to[2] - from[2]);
          const hit = world.castShape(
            { x: from[0], y: y + 0.96, z: from[2] },
            { x: 0, y: 0, z: 0, w: 1 },
            { x: (to[0] - from[0]) / distance, y: 0, z: (to[2] - from[2]) / distance },
            shape,
            0.03,
            distance,
            true,
            undefined,
            undefined,
            undefined,
            undefined,
            (other) => characterSweepAllowed(other, platform.handle),
          );
          assert.equal(hit, null, `${lift.id} landing at ${y} obstructs the boarding capsule`);
        }
        world.removeRigidBody(platform);
      }
  } finally {
    world.free();
    environment.dispose();
  }
});
