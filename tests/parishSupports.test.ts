import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { buildParishEnvironment } from "../src/gameplay/parishEnvironment.ts";
import {
  PARISH_EXIT,
  parishFloorHeight,
  parishStairSupports,
  parishBlocked,
} from "../src/gameplay/ashenParish.ts";

const environment = buildParishEnvironment(false);
environment.root.updateMatrixWorld(true);
// Use the original geometry, since the visible batches also contain the fixture being checked.
const sources: THREE.Mesh[] = [];
environment.root.traverse((o) => {
  if (o instanceof THREE.Mesh && o.parent?.name !== "static-scenery-batches") sources.push(o);
});
test.after(() => environment.dispose());

void test("roof finial pedestals and statue candles touch their supporting masonry", () => {
  const fixtures = sources.filter((o) => {
    if (!(o.material instanceof THREE.MeshStandardMaterial)) return false;
    const color = o.material.color.getHexString();
    return (
      color === "d4c6a0" ||
      (color === "8f9389" && Math.abs(o.scale.x - 1.1) < 0.001 && o.scale.y === 0.6)
    );
  });
  assert.ok(fixtures.length > 10);
  for (const fixture of fixtures) {
    const bounds = new THREE.Box3().setFromObject(fixture);
    const center = bounds.getCenter(new THREE.Vector3());
    const ray = new THREE.Raycaster(
      new THREE.Vector3(center.x, bounds.min.y + 0.001, center.z),
      new THREE.Vector3(0, -1, 0),
      0,
      0.03,
    );
    assert.ok(
      ray.intersectObjects(
        sources.filter((o) => o !== fixture),
        false,
      ).length,
      `unsupported fixture at ${center.x},${bounds.min.y},${center.z}`,
    );
  }
});

void test("all freestanding decorative columns and the exit stand on pavement", () => {
  // The short columns have square capitals 1.4m wide at the refuge and 1.12m at the court.
  const columns = sources.filter(
    (o) =>
      (o.geometry.type === "CylinderGeometry" &&
        (o.geometry as THREE.CylinderGeometry).parameters.height === 2.6) ||
      (o.geometry.type === "CylinderGeometry" &&
        (o.geometry as THREE.CylinderGeometry).parameters.height === 3),
  );
  assert.equal(columns.length, 10);
  for (const column of columns) {
    const bounds = new THREE.Box3().setFromObject(column);
    const center = bounds.getCenter(new THREE.Vector3());
    for (const dx of [-0.6, 0, 0.6])
      for (const dz of [-0.6, 0, 0.6])
        assert.ok(
          Math.abs(
            (parishFloorHeight(center.x + dx, center.z + dz, bounds.min.y) ?? Infinity) -
              bounds.min.y,
          ) < 0.00001,
          `column footing over empty space at ${center.x + dx},${center.z + dz}`,
        );
  }
  assert.equal(parishFloorHeight(PARISH_EXIT[0], PARISH_EXIT[2], PARISH_EXIT[1]), PARISH_EXIT[1]);
});

void test("foundry roof meets its side walls without a sky gap", () => {
  for (const x of [69, 99])
    for (const z of [26, 40, 52]) {
      const ray = new THREE.Raycaster(
        new THREE.Vector3(x, 25.99, z),
        new THREE.Vector3(0, 1, 0),
        0,
        0.2,
      );
      assert.ok(ray.intersectObjects(sources, false).length, `roof detached at ${x},${z}`);
    }
});

void test("the cloister facade has a footing beneath its projecting outer face", () => {
  const ray = new THREE.Raycaster(
    new THREE.Vector3(-64, 6.001, 27.4),
    new THREE.Vector3(0, -1, 0),
    0,
    0.08,
  );
  const footings = sources.filter((o) => new THREE.Box3().setFromObject(o).max.y <= 6.001);
  assert.ok(ray.intersectObjects(footings, false).length, "facade overhang has no foundation");
});

void test("solid stair foundations meet the slab underside along the entire slope", () => {
  for (const z of [101, 104, 107]) {
    const underside = 4.5 - (z - 104) * 0.375 - 0.6 * Math.hypot(1, 0.375);
    const foundations = sources.filter((o) => new THREE.Box3().setFromObject(o).min.y <= -25.99);
    const ray = new THREE.Raycaster(
      new THREE.Vector3(0, underside + 4, z),
      new THREE.Vector3(0, -1, 0),
      0,
      8,
    );
    const hit = ray.intersectObjects(foundations, false)[0];
    assert.ok(
      hit && Math.abs(hit.point.y - underside) < 0.01,
      `stair floats above foundation at ${z}`,
    );
  }
});

void test("scattered grass and fallen leaves are seated on a floor rather than the void", () => {
  const matrix = new THREE.Matrix4(),
    point = new THREE.Vector3();
  environment.dressing.root.traverse((o) => {
    if (!(o instanceof THREE.InstancedMesh) || !/^(fallen-leaves|weeds:)/.test(o.name)) return;
    for (let i = 0; i < o.count; i++) {
      o.getMatrixAt(i, matrix);
      point.setFromMatrixPosition(matrix);
      const floor = parishFloorHeight(point.x, point.z, point.y);
      assert.ok(
        floor !== null && Math.abs(point.y - floor) <= 0.05,
        `${o.name} floats at ${point.toArray().join(",")}`,
      );
    }
  });
});

void test("suspended stair piers connect to their stringers and block paths throughout their height", () => {
  const piers = sources.filter((o) => o.name === "stair-support-pier");
  assert.equal(piers.length, parishStairSupports.length);
  for (const pier of piers) {
    const bounds = new THREE.Box3().setFromObject(pier),
      center = bounds.getCenter(new THREE.Vector3());
    const ray = new THREE.Raycaster(
      new THREE.Vector3(center.x, bounds.max.y - 0.001, center.z),
      new THREE.Vector3(0, 1, 0),
      0,
      0.03,
    );
    assert.ok(
      ray.intersectObjects(
        sources.filter((o) => o.name === "stair-edge-stringer"),
        false,
      ).length,
      `pier misses its stair at ${center.toArray().join(",")}`,
    );
    assert.equal(parishBlocked(center.x, center.y, center.z, 0.1), true);
    assert.ok(
      bounds.min.y <= -25.99 ||
        Math.abs((parishFloorHeight(center.x, center.z, bounds.min.y) ?? Infinity) - bounds.min.y) <
          0.01,
    );
  }
});
