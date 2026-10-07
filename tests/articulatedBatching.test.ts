import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { batchArticulatedMeshes } from "../src/gameplay/batchArticulatedMeshes.ts";
void test("React-owned rigs batch within joints, track their motion and restore originals on cleanup", () => {
  const root = new THREE.Group(),
    arm = new THREE.Group();
  root.add(arm);
  arm.position.set(0.4, 1, 0);
  const material = new THREE.MeshStandardMaterial();
  const geometry = new THREE.BoxGeometry(0.1, 0.3, 0.1);
  for (let i = 0; i < 5; i++) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.y = -i * 0.3;
    arm.add(mesh);
  }
  const before = new THREE.Box3().setFromObject(root, true);
  const originals = [...arm.children];
  const cleanup = batchArticulatedMeshes(root);
  assert.equal(originals.filter((o) => o.visible).length, 0);
  assert.equal(arm.children.filter((o) => o.visible).length, 1);
  const after = new THREE.Box3().setFromObject(root, true);
  assert.ok(before.min.distanceTo(after.min) < 1e-6);
  assert.ok(before.max.distanceTo(after.max) < 1e-6);
  arm.rotation.x = -1.2;
  root.updateMatrixWorld(true);
  const batch = arm.children.find((o) => o.visible)!;
  const expected = new THREE.Box3();
  for (const o of originals) expected.union(new THREE.Box3().setFromObject(o, true));
  const actual = new THREE.Box3().setFromObject(batch, true);
  assert.ok(expected.min.distanceTo(actual.min) < 1e-6);
  assert.ok(expected.max.distanceTo(actual.max) < 1e-6);
  cleanup();
  assert.deepEqual(arm.children, originals);
  assert.ok(originals.every((o) => o.visible));
  geometry.dispose();
  material.dispose();
});
