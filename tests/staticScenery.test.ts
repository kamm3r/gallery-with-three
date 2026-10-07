import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { batchStaticMeshes } from "../src/gameplay/batchStaticMeshes.ts";

void test("static scenery batches equivalent materials, preserves transformed bounds, and restores on cleanup", () => {
  const root = new THREE.Group();
  root.position.set(5, 2, -3);
  root.rotation.y = 0.4;
  const originals: THREE.Mesh[] = [];
  for (let i = 0; i < 8; i++) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(1, 3, 2),
      new THREE.MeshStandardMaterial({ color: "#50524b" }),
    );
    mesh.position.set(i * 2, 3, 0);
    mesh.rotation.y = i * 0.1;
    mesh.castShadow = true;
    originals.push(mesh);
    root.add(mesh);
  }
  root.updateMatrixWorld(true);
  const expected = new THREE.Box3().setFromObject(root, true);
  const merged = batchStaticMeshes(root);
  assert.equal(merged.batch.children.length, 1);
  assert.ok(originals.every((mesh) => !mesh.visible));
  root.updateMatrixWorld(true);
  const actual = new THREE.Box3().setFromObject(merged.batch, true);
  assert.ok(expected.min.distanceTo(actual.min) < 0.00001);
  assert.ok(expected.max.distanceTo(actual.max) < 0.00001);
  let copiesDisposed = 0,
    originalsDisposed = 0;
  (merged.batch.children[0] as THREE.Mesh).geometry.addEventListener(
    "dispose",
    () => copiesDisposed++,
  );
  originals.forEach((mesh) => mesh.geometry.addEventListener("dispose", () => originalsDisposed++));
  merged.dispose();
  assert.equal(copiesDisposed, 1);
  assert.equal(originalsDisposed, 0);
  assert.ok(originals.every((mesh) => mesh.visible));
  assert.equal(root.children.length, originals.length);
  const remount = batchStaticMeshes(root);
  assert.equal(remount.batch.children.length, 1);
  remount.dispose();
  originals.forEach((mesh) => {
    mesh.geometry.dispose();
    (mesh.material as THREE.Material).dispose();
  });
});
void test("distant cells and different shadow behavior are not combined", () => {
  const root = new THREE.Group();
  const material = new THREE.MeshStandardMaterial();
  for (const [x, castShadow] of [
    [0, true],
    [2, true],
    [4, false],
    [6, false],
    [100, true],
    [102, true],
  ] as const) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), material);
    mesh.position.x = x;
    mesh.castShadow = castShadow;
    root.add(mesh);
  }
  const merged = batchStaticMeshes(root);
  assert.equal(merged.batch.children.length, 3);
  merged.dispose();
  root.children.forEach((mesh) => (mesh as THREE.Mesh).geometry.dispose());
  material.dispose();
});
void test("batching serializes a shared material once, avoiding repeated texture-image encoding", () => {
  const root = new THREE.Group(),
    material = new THREE.MeshStandardMaterial();
  let serializations = 0;
  const original = material.toJSON.bind(material);
  material.toJSON = (...args) => {
    serializations++;
    return original(...args);
  };
  for (let i = 0; i < 100; i++) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), material);
    mesh.position.x = i % 10;
    mesh.position.z = Math.floor(i / 10);
    root.add(mesh);
  }
  const batch = batchStaticMeshes(root);
  try {
    assert.equal(
      serializations,
      1,
      "shared textured materials must not encode the same image for every mesh",
    );
  } finally {
    batch.dispose();
    root.children.forEach((o) => {
      if (o instanceof THREE.Mesh) o.geometry.dispose();
    });
    material.dispose();
  }
});
