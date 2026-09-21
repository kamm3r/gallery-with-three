import test from 'node:test';
import assert from 'node:assert/strict';
import { BoxGeometry, InstancedMesh, Matrix4, MeshBasicMaterial, Object3D, PerspectiveCamera } from 'three';
import { createRuntimeWorld } from '../gameplay/ecs/world.ts';
import { InstanceBatch, PlatformBody, PlatformMotion, PlayerPosition, PlayerView, SimulationTime, VisibilityStats } from '../gameplay/ecs/traits.ts';
import { syncPlayer } from '../gameplay/ecs/syncPlayer.ts';
import { updatePlatforms } from '../gameplay/ecs/updatePlatforms.ts';
import { selectDetail, updateVisibility } from '../gameplay/ecs/updateVisibility.ts';
import { simplifyGeometry } from '../gameplay/simplifyGeometry.ts';
import { courseObstacles, COURSE_EXTENT } from '../gameplay/collisionCourse.ts';

test('player registration updates shared position and clears on teardown', () => {
  const world = createRuntimeWorld();
  const object = new Object3D(); object.position.set(4, 2, 7);
  const player = world.spawn(PlayerView({ object }));
  syncPlayer(world);
  assert.deepEqual(world.get(PlayerPosition), { x: 4, y: 2, z: 7, valid: true });
  player.destroy(); syncPlayer(world);
  assert.equal(world.get(PlayerPosition)!.valid, false);
  assert.equal(world.query(PlayerView).length, 0);
  world.destroy();
});

test('platform ECS motion is deterministic across physics-step subdivisions', () => {
  function run(steps: number) {
    const world = createRuntimeWorld();
    let result = { x: 0, y: 0, z: 0 };
    const entity = world.spawn(PlatformMotion({ z: 5, axis: 'z', distance: 3, speed: .7 }), PlatformBody({ body: {
      setNextKinematicTranslation: p => { result = { ...p }; }, setNextKinematicRotation: () => {},
    } }));
    for (let i = 0; i < steps; i++) updatePlatforms(world, 1 / steps);
    assert.ok(Math.abs(world.get(SimulationTime)!.elapsed - 1) < 1e-12);
    entity.destroy(); assert.equal(world.query(PlatformMotion).length, 0);
    world.destroy(); return result;
  }
  assert.ok(Math.abs(run(60).z - run(120).z) < 1e-12);
});

test('LOD hysteresis and culling select stable levels', () => {
  assert.equal(selectDetail(45, 44, 155, 1, true), 1);
  assert.equal(selectDetail(45, 44, 155, 2, true), 2);
  assert.equal(selectDetail(39, 44, 155, 2, true), 1);
  assert.equal(selectDetail(160, 44, 155, 1, true), 0);
  assert.equal(selectDetail(10, 44, 155, 1, false), 0);
});

test('visibility system packs near/far instances, culls behind camera, restores on turning', () => {
  const world = createRuntimeWorld();
  const geometry = new BoxGeometry(); const material = new MeshBasicMaterial();
  const detail = new InstancedMesh(geometry, material, 4), proxy = new InstancedMesh(geometry, material, 4);
  const points = [-10, -70, 20, -200].map(z => ({ x: 0, y: 0, z, scale: 1, rotation: 0 }));
  const matrices = new Float32Array(64);
  points.forEach((p, i) => new Matrix4().makeTranslation(p.x, p.y, p.z).toArray(matrices, i * 16));
  world.spawn(InstanceBatch({ points, matrices, levels: new Uint8Array(4), detail: [detail], proxy: [proxy], radius: 1, centerY: 0, near: 44, far: 155, shadows: false }));
  const camera = new PerspectiveCamera(60, 1, .1, 300);
  updateVisibility(world, camera);
  assert.deepEqual(world.get(VisibilityStats), { detailed: 1, simplified: 1, culled: 2 });
  assert.equal(detail.count, 1); assert.equal(proxy.count, 1);
  camera.rotation.y = Math.PI;
  updateVisibility(world, camera);
  assert.deepEqual(world.get(VisibilityStats), { detailed: 1, simplified: 0, culled: 3 });
  assert.equal(proxy.visible, false);
  detail.dispose(); proxy.dispose(); geometry.dispose(); material.dispose(); world.destroy();
});

test('distant mesh simplification reduces geometry and preserves material groups', () => {
  const source = new BoxGeometry(1, 1, 1, 24, 24, 24);
  const low = simplifyGeometry(source);
  assert.ok(low.getAttribute('position').count < source.index!.count / 2);
  assert.equal(low.groups.length, source.groups.length);
  assert.ok(low.getAttribute('normal').count > 0);
  low.dispose(); source.dispose();
});

test('collision course has bounded obstacles and multiple collider shapes', () => {
  assert.ok(courseObstacles.length > 150);
  assert.equal(new Set(courseObstacles.map(o => o.shape)).size, 4);
  for (const obstacle of courseObstacles) {
    assert.ok(obstacle.size.every(n => n > 0));
    assert.ok(Math.abs(obstacle.position[0]) + obstacle.size[0] / 2 < COURSE_EXTENT);
    assert.ok(Math.abs(obstacle.position[2]) + obstacle.size[2] / 2 < COURSE_EXTENT);
  }
});
