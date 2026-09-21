import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { AnimationMixer, Vector3 } from 'three';
import { climbProgress, swordAttackDuration, swordHitActive } from '../gameplay/characterAnimations.ts';

test('airborne clips do not add a second vertical jump above the physics body', async () => {
  const bytes = readFileSync(new URL('../public/assets/quaternius/ultimate-animated-character/Casual_Male_gameplay.glb', import.meta.url));
  const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  const mixer = new AnimationMixer(gltf.scene);
  for (const name of ['JumpRise', 'JumpFall']) {
    mixer.stopAllAction();
    const clip = gltf.animations.find(c => c.name === name)!;
    const action = mixer.clipAction(clip).play();
    for (let i = 0; i < 20; i++) {
      action.time = clip.duration * i / 20;
      mixer.update(0);
      gltf.scene.updateMatrixWorld(true);
      const height = gltf.scene.getObjectByName('Hips')!.getWorldPosition(new Vector3()).y * .82;
      assert.ok(height < .82 && height > .58, `${name} adds root motion: hips at ${height}m`);
    }
  }
});

test('fall clip changes skeletal pose instead of holding a static frame', async () => {
  const bytes = readFileSync(new URL('../public/assets/quaternius/ultimate-animated-character/Casual_Male_gameplay.glb', import.meta.url));
  const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  const clip = gltf.animations.find(clip => clip.name === 'JumpFall')!;
  assert.ok(clip.tracks.some(track => {
    const size = track.getValueSize();
    return Array.from(track.values).some((value, index) => Math.abs(value - track.values[index % size]) > .01);
  }), 'JumpFall contains no moving bone tracks');
});

test('ledge climb raises the player before moving onto the ledge', () => {
  assert.deepEqual(climbProgress(-1), { up: 0, forward: 0, done: false });
  assert.equal(climbProgress(.5).forward, 0);
  assert.equal(climbProgress(.65).up, 1);
  assert.deepEqual(climbProgress(2), { up: 1, forward: 1, done: true });
  let previous = climbProgress(0);
  for (let i = 1; i <= 100; i++) {
    const next = climbProgress(i / 100);
    assert.ok(next.up >= previous.up && next.forward >= previous.forward);
    previous = next;
  }
});

test('both sword variants deal damage only during the contact phase', () => {
  for (const id of [1, 2]) {
    const duration = swordAttackDuration(id);
    assert.equal(swordHitActive(id, duration), false);
    assert.equal(swordHitActive(id, duration * .6), true);
    assert.equal(swordHitActive(id, duration * .2), false);
    assert.equal(swordHitActive(id, 0), false);
  }
});

test('exported player contains original and new skeletal actions', () => {
  const bytes = readFileSync(new URL('../public/assets/quaternius/ultimate-animated-character/Casual_Male_gameplay.glb', import.meta.url));
  const gltf = JSON.parse(bytes.toString('utf8', 20, 20 + bytes.readUInt32LE(12)));
  const names = gltf.animations.map((clip: { name: string }) => clip.name);
  for (const name of ['Idle', 'Walk', 'Run', 'Roll', 'Death', 'Jump', 'SitDown', 'StandUp', 'SwordSlash',
    'LedgeGrab', 'LedgeHang', 'LedgeClimb', 'JumpRise', 'JumpFall', 'JumpLand',
    'SitEnter', 'SeatedIdle', 'SitExit', 'SwordSlashQuick', 'SwordSlashHeavy']) {
    assert.ok(names.includes(name), `Missing ${name}`);
  }
  assert.equal(new Set(names).size, names.length);
  assert.ok(gltf.nodes.some((node: { name: string }) => node.name === 'PlayerSword'));
  for (const clip of gltf.animations) {
    assert.ok(clip.channels.length > 0);
    for (const sampler of clip.samplers) {
      const input = gltf.accessors[sampler.input];
      assert.ok(input.max[0] > input.min[0], `${clip.name} has no duration`);
    }
  }
});
