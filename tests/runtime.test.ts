import { test, type TestContext } from "vite-plus/test";
import assert from "node:assert/strict";
import RAPIER from "@dimforge/rapier3d-compat";
import { PerspectiveCamera, Object3D, AnimationClip, NumberKeyframeTrack } from "three";
import { createRuntimeWorld } from "../src/gameplay/ecs/world.ts";
import { GameplayState } from "../src/gameplay/ecs/stateBinding.ts";
import { activePlayer } from "../src/gameplay/playerBody.ts";
import { createPlayerController } from "../src/runtime/playerController.ts";
import { startFrameLoop } from "../src/runtime/frameLoop.ts";
import { createSceneAnimator } from "../src/runtime/sceneAnimator.ts";

await RAPIER.init();

function physics(t: TestContext, movingGround = false) {
  const world = new RAPIER.World({ x: 0, y: -30, z: 0 });
  world.timestep = 1 / 60;
  const stateWorld = createRuntimeWorld();
  const ground = world.createRigidBody(
    (movingGround
      ? RAPIER.RigidBodyDesc.kinematicPositionBased()
      : RAPIER.RigidBodyDesc.fixed()
    ).setTranslation(0, -0.5, 0),
  );
  world.createCollider(RAPIER.ColliderDesc.cuboid(12, 0.5, 12), ground);
  // A full-height wall at x = 3.
  world.createCollider(RAPIER.ColliderDesc.cuboid(0.2, 4, 12).setTranslation(3, 4, 0));
  const camera = new PerspectiveCamera();
  camera.position.set(0, 3, 6);
  camera.lookAt(0, 3, 0);
  camera.updateMatrixWorld();
  const player = createPlayerController({
    world,
    rapier: RAPIER,
    camera,
    stateWorld,
    position: [0, 2, 0],
    capsuleHalfHeight: 0.5,
    capsuleRadius: 0.42,
  });
  const step = (count = 1) => {
    for (let i = 0; i < count; i++) {
      player.step();
      world.step();
    }
  };
  t.onTestFinished(() => {
    player.dispose();
    world.free();
    stateWorld.destroy();
  });
  world.step();
  step(90);
  return { world, stateWorld, ground, player, step };
}

test("native player lands, walks into walls without tunneling, jumps and lands again", (t) => {
  const { player, step } = physics(t);
  assert.equal(player.handle.isOnGround, true);
  assert.ok(
    Math.abs(player.body.translation().y - 0.95) < 0.05,
    `standing height ${player.body.translation().y}`,
  );
  player.handle.setMovement({ rightward: true });
  step(120);
  assert.ok(player.body.translation().x > 2 && player.body.translation().x < 2.5);
  player.handle.setMovement({ rightward: false, jump: true });
  step(10);
  assert.equal(player.handle.isOnGround, false);
  assert.ok(player.body.translation().y > 1.5);
  player.handle.setMovement({ jump: false });
  step(120);
  assert.equal(player.handle.isOnGround, true);
});

test("native player follows a moving platform and disposes its body and ECS state", (t) => {
  const { world, stateWorld, ground, player, step } = physics(t, true);
  const origin = player.body.translation().x;
  for (let i = 0; i < 60; i++) {
    ground.setNextKinematicTranslation({ x: (i + 1) / 60, y: -0.5, z: 0 });
    step();
  }
  assert.ok(Math.abs(player.body.translation().x - origin - 1) < 0.1);
  assert.equal(player.handle.isOnPlatform, true);
  assert.ok(stateWorld.query(GameplayState).length > 0);
  player.dispose();
  player.dispose();
  player.step();
  assert.equal(world.bodies.len(), 1);
  assert.equal(stateWorld.query(GameplayState).length, 0);
  assert.equal(activePlayer.collider, null);
});

test("frame loop clamps background gaps and cancels cleanly before resuming", () => {
  let now = 0;
  let sequence = 0;
  const callbacks = new Map<number, (time: number) => void>();
  const clock = {
    now: () => now,
    request: (callback: (time: number) => void) => {
      callbacks.set(++sequence, callback);
      return sequence;
    },
    cancel: (id: number) => {
      callbacks.delete(id);
    },
  };
  const deltas: number[] = [];
  const frame = (time: number) => {
    now = time;
    const [id, callback] = callbacks.entries().next().value!;
    callbacks.delete(id);
    callback(now);
  };
  const stop = startFrameLoop(({ delta }) => deltas.push(delta), clock);
  frame(16);
  frame(10_000);
  stop();
  stop();
  assert.deepEqual(deltas, [0.016, 0.05]);
  assert.equal(callbacks.size, 0);
  now = 30_000;
  const stopAgain = startFrameLoop(({ delta }) => deltas.push(delta), clock);
  frame(30_016);
  stopAgain();
  assert.equal(deltas.at(-1), 0.016);
});

test("native player descends a step and settles above the floor", (t) => {
  const { world, player, step } = physics(t);
  world.createCollider(RAPIER.ColliderDesc.cuboid(2, 0.15, 2).setTranslation(0, 0.15, 0));
  player.body.setTranslation({ x: 0, y: 1.25, z: 0 }, true);
  world.step();
  step(30);
  assert.ok(player.body.translation().y > 1.2);
  player.handle.setMovement({ forward: true });
  let airborneFrames = 0;
  for (let i = 0; i < 50; i++) {
    step();
    if (!player.handle.isOnGround) airborneFrames++;
    assert.ok(player.body.translation().y > 0.9);
  }
  assert.ok(airborneFrames <= 3, "only a brief loss of contact while rounding the step edge");
  assert.equal(player.handle.isOnGround, true);
  assert.ok(player.body.translation().z < -2.5);
  assert.ok(Math.abs(player.body.translation().y - 0.95) < 0.05);
});

test("native animation holds its pose at zero delta and releases bindings on disposal", () => {
  const object = new Object3D();
  const clip = new AnimationClip("Move", 1, [
    new NumberKeyframeTrack(".position[x]", [0, 1], [0, 2]),
  ]);
  const animator = createSceneAnimator(object);
  animator.configure([clip], { enabled: true, autoplay: true, clip: "Move", loop: true, speed: 1 });
  animator.update(0.25);
  assert.ok(Math.abs(object.position.x - 0.5) < 0.001);
  animator.update(0);
  assert.ok(Math.abs(object.position.x - 0.5) < 0.001);
  animator.dispose();
  animator.update(0.25);
  assert.equal(object.position.x, 0);
});
