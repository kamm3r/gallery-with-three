import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { capitalKitPanel, capitalKitGeometry } from "../src/gameplay/capitalBuildingKit.ts";
import { createCapitalBuilder } from "../src/gameplay/capitalKitLevel.ts";
import { CAPITAL_SITES } from "../src/gameplay/capitalDistricts.ts";

void test("the main gate lies on the front centreline of the city", () => {
  assert.equal(CAPITAL_SITES.greatGate[0], 0);
  assert.equal(CAPITAL_SITES.greatGateFoot[0], 0);
});

void test("lift shaft headers are connected to their sill by corner uprights", () => {
  const g = capitalKitGeometry("elevator", [7.4, 30, 7.4], 0.6);
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(g, material);
  mesh.updateMatrixWorld(true);
  const ray = new THREE.Raycaster(new THREE.Vector3(3.4, 15, 5), new THREE.Vector3(0, 0, -1));
  assert.ok(
    ray.intersectObject(mesh).length > 0,
    "shaft header has no vertical support halfway up",
  );
  g.dispose();
  material.dispose();
});

void test("wall infill blocks render at the same height as their collision boxes", () => {
  const b = createCapitalBuilder();
  b.wall([0, 0], [12, 0], 0, 8, { openings: [{ at: 6, width: 3, height: 3, bottom: 3 }] });
  for (const p of b.pieces.filter((p) => p.model === "block")) {
    const g = capitalKitGeometry(p.model, p.size, p.thickness);
    g.computeBoundingBox();
    const low = p.position[1] + g.boundingBox!.min.y;
    const solid = b.solids.find((s) => s.position[0] === p.position[0] && s.size[1] === p.size[1]);
    assert.ok(solid);
    assert.ok(
      Math.abs(low - solid.position[1]) < 1e-5,
      `render bottom ${low}, collider bottom ${solid.position[1]}`,
    );
    g.dispose();
  }
});

void test("roof and masonry slab fascia faces outward for both outline directions", () => {
  const corners: [number, number, number][] = [
    [-2, 5, -2],
    [2, 5, -2],
    [2, 5, 2],
    [-2, 5, 2],
  ];
  const material = new THREE.MeshBasicMaterial();
  for (const outline of [corners, [...corners].reverse()]) {
    const g = capitalKitPanel(outline, 0.6);
    const mesh = new THREE.Mesh(g, material);
    mesh.updateMatrixWorld(true);
    for (const [x, z] of [
      [0, -5],
      [0, 5],
      [-5, 0],
      [5, 0],
    ]) {
      const ray = new THREE.Raycaster(
        new THREE.Vector3(x, 4.7, z),
        new THREE.Vector3(-x, 0, -z).normalize(),
        0,
        3.1,
      );
      assert.ok(ray.intersectObject(mesh).length > 0, `missing visible fascia from ${x},${z}`);
    }
    g.dispose();
  }
  material.dispose();
});
