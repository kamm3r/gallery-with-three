import test from "node:test";
import assert from "node:assert/strict";
import {
  BoxGeometry,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  Object3D,
  PerspectiveCamera,
} from "three";
import { createRuntimeWorld } from "../src/gameplay/ecs/world.ts";
import {
  InstanceBatch,
  PlatformBody,
  PlatformMotion,
  PlayerPosition,
  PlayerView,
  SimulationTime,
  VisibilityStats,
} from "../src/gameplay/ecs/traits.ts";
import { syncPlayer } from "../src/gameplay/ecs/syncPlayer.ts";
import { updatePlatforms } from "../src/gameplay/ecs/updatePlatforms.ts";
import { selectDetail, updateVisibility } from "../src/gameplay/ecs/updateVisibility.ts";
import {
  PARK_EXTENT,
  parkJumpPads,
  parkLabels,
  parkOneWay,
  parkPushables,
  parkStatics,
  SLOPE_ANGLES,
  SLOPE_LIMIT_DEG,
  STEP_RISERS,
  terrainHeight,
  terrainMask,
} from "../src/gameplay/collisionCourse.ts";

test("player registration updates shared position and clears on teardown", () => {
  const world = createRuntimeWorld();
  const object = new Object3D();
  object.position.set(4, 2, 7);
  const player = world.spawn(PlayerView({ object }));
  syncPlayer(world);
  assert.deepEqual(world.get(PlayerPosition), { x: 4, y: 2, z: 7, valid: true });
  player.destroy();
  syncPlayer(world);
  assert.equal(world.get(PlayerPosition)!.valid, false);
  assert.equal(world.query(PlayerView).length, 0);
  world.destroy();
});

test("platform ECS motion is deterministic across physics-step subdivisions", () => {
  function run(steps: number) {
    const world = createRuntimeWorld();
    let result = { x: 0, y: 0, z: 0 };
    const entity = world.spawn(
      PlatformMotion({ z: 5, axis: "z", distance: 3, speed: 0.7 }),
      PlatformBody({
        body: {
          setNextKinematicTranslation: (p) => {
            result = { ...p };
          },
          setNextKinematicRotation: () => {},
        },
      }),
    );
    for (let i = 0; i < steps; i++) updatePlatforms(world, 1 / steps);
    assert.ok(Math.abs(world.get(SimulationTime)!.elapsed - 1) < 1e-12);
    entity.destroy();
    assert.equal(world.query(PlatformMotion).length, 0);
    world.destroy();
    return result;
  }
  assert.ok(Math.abs(run(60).z - run(120).z) < 1e-12);
});

test("LOD hysteresis and culling select stable levels", () => {
  assert.equal(selectDetail(45, 44, 155, 1, true), 1);
  assert.equal(selectDetail(45, 44, 155, 2, true), 2);
  assert.equal(selectDetail(39, 44, 155, 2, true), 1);
  assert.equal(selectDetail(160, 44, 155, 1, true), 0);
  assert.equal(selectDetail(10, 44, 155, 1, false), 0);
});

test("visibility system packs near/far instances, culls behind camera, restores on turning", () => {
  const world = createRuntimeWorld();
  const geometry = new BoxGeometry();
  const material = new MeshBasicMaterial();
  const detail = new InstancedMesh(geometry, material, 4),
    proxy = new InstancedMesh(geometry, material, 4);
  const points = [-10, -70, 20, -200].map((z) => ({ x: 0, y: 0, z, scale: 1, rotation: 0 }));
  const matrices = new Float32Array(64);
  points.forEach((p, i) => new Matrix4().makeTranslation(p.x, p.y, p.z).toArray(matrices, i * 16));
  world.spawn(
    InstanceBatch({
      points,
      matrices,
      levels: new Uint8Array(4),
      detail: [detail],
      proxy: [proxy],
      radius: 1,
      centerY: 0,
      near: 44,
      far: 155,
      shadows: false,
    }),
  );
  const camera = new PerspectiveCamera(60, 1, 0.1, 300);
  updateVisibility(world, camera);
  assert.deepEqual(world.get(VisibilityStats), { detailed: 1, simplified: 1, culled: 2 });
  assert.equal(detail.count, 1);
  assert.equal(proxy.count, 1);
  camera.rotation.y = Math.PI;
  updateVisibility(world, camera);
  assert.deepEqual(world.get(VisibilityStats), { detailed: 1, simplified: 0, culled: 3 });
  assert.equal(proxy.visible, false);
  detail.dispose();
  proxy.dispose();
  geometry.dispose();
  material.dispose();
  world.destroy();
});

test("movement park covers every skill zone inside the arena bounds", () => {
  assert.ok(parkStatics.length > 60);
  assert.deepEqual(
    new Set(parkStatics.map((o) => o.shape)),
    new Set(["box", "pyramid", "sphere", "cylinder", "cone"]),
  );
  for (const obstacle of parkStatics) {
    assert.ok(obstacle.size.every((n) => n > 0));
    assert.ok(Math.abs(obstacle.position[0]) + obstacle.size[0] / 2 < PARK_EXTENT);
    assert.ok(Math.abs(obstacle.position[2]) + obstacle.size[2] / 2 < PARK_EXTENT);
  }
  // Slopes bracket the walkable limit: climbable set plus one too-steep ramp.
  assert.ok(SLOPE_ANGLES.some((a) => a <= SLOPE_LIMIT_DEG));
  assert.ok(SLOPE_ANGLES.some((a) => a > SLOPE_LIMIT_DEG));
  assert.equal(STEP_RISERS.length, 3);
  // One-way boards ascend so each hop stays inside jump range.
  assert.equal(parkOneWay.length, 4);
  for (let i = 1; i < parkOneWay.length; i++) {
    const rise = parkOneWay[i].position[1] - parkOneWay[i - 1].position[1];
    assert.ok(rise > 0 && rise < 1.1);
  }
  // Jump pads escalate in strength.
  assert.equal(parkJumpPads.length, 3);
  for (let i = 1; i < parkJumpPads.length; i++) {
    assert.ok(parkJumpPads[i].strength > parkJumpPads[i - 1].strength);
  }
  // Pushables include light shovable cubes and one heavy "not pushable" cube.
  assert.ok(parkPushables.some((b) => b.mass <= 2));
  assert.ok(parkPushables.some((b) => b.mass >= 100));
  assert.equal(parkLabels.length, 23);
});

test("terrain height field is finite and falls off at the patch border", () => {
  assert.ok(Number.isFinite(terrainHeight(3, -2)));
  assert.equal(terrainMask(100, 100, 11, 11), 0);
  assert.equal(terrainMask(0, 0, 11, 11), 1);
});
