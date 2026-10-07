import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { createParishRig } from "../src/gameplay/parishModels.ts";

function meshCount(root: THREE.Object3D) {
  let count = 0;
  root.traverse((o) => {
    if (o instanceof THREE.Mesh) count++;
  });
  return count;
}
void test("enemy rigs batch static parts while preserving silhouettes and animated joints", () => {
  for (const kind of ["sentinel", "hound", "acolyte"] as const) {
    const original = createParishRig(kind, false);
    const batched = createParishRig(kind);
    assert.ok(
      meshCount(batched.root) < meshCount(original.root) * 0.75,
      `${kind} must reduce mesh submissions`,
    );
    for (const rig of [original, batched]) {
      rig.joints.body.rotation.set(0.2, 0.5, 0);
      rig.joints.legFL.rotation.x = 0.6;
      if (rig.joints.armR) rig.joints.armR.rotation.x = -1.3;
      rig.root.updateMatrixWorld(true);
    }
    const a = new THREE.Box3().setFromObject(original.root, true);
    const b = new THREE.Box3().setFromObject(batched.root, true);
    assert.ok(a.min.distanceTo(b.min) < 0.00001);
    assert.ok(a.max.distanceTo(b.max) < 0.00001);
    assert.deepEqual(Object.keys(original.joints), Object.keys(batched.joints));
    original.dispose();
    batched.dispose();
  }
});
