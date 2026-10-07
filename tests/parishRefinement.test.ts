import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { buildParishEnvironment } from "../src/gameplay/parishEnvironment.ts";
import {
  parishEnemySpawns,
  parishBlocked,
  parishProps,
  parishFloorHeight,
} from "../src/gameplay/ashenParish.ts";

const environment = buildParishEnvironment(false);
environment.root.updateMatrixWorld(true);
const sources: THREE.Mesh[] = [];
environment.root.traverse((o) => {
  if (o instanceof THREE.Mesh && o.parent?.name !== "static-scenery-batches") sources.push(o);
});
test.after(() => environment.dispose());

void test("garden retaining walls stand on pavement and preserve enemy spawn clearance", () => {
  for (const bed of parishProps.filter((p) => p.kind === "planter")) {
    const [x, y, z] = bed.position,
      [w, , d] = bed.size;
    for (const dx of [-w / 2, 0, w / 2])
      for (const dz of [-d / 2, 0, d / 2]) assert.equal(parishFloorHeight(x + dx, z + dz, y), y);
    assert.equal(parishBlocked(x, y, z, 0.4), true);
  }
  for (const enemy of parishEnemySpawns)
    assert.equal(parishBlocked(...enemy.position, 0.4), false, enemy.id);
});

void test("planted shrubs root in actual soil and bench legs meet the floor", () => {
  const soils = sources.filter((o) => o.name === "garden-bed-soil"),
    stems = sources.filter((o) => o.name === "garden-shrub-stem"),
    legs = sources.filter((o) => o.name === "bench-grounded-leg");
  assert.ok(stems.length > 50 && legs.length === 8);
  for (const stem of stems) {
    const height = (stem.geometry as THREE.CylinderGeometry).parameters.height,
      base = new THREE.Vector3(0, -height / 2, 0).applyMatrix4(stem.matrixWorld);
    const ray = new THREE.Raycaster(
      base.clone().add(new THREE.Vector3(0, 0.001, 0)),
      new THREE.Vector3(0, -1, 0),
      0,
      0.01,
    );
    assert.ok(
      ray.intersectObjects(soils, false).length,
      `shrub without soil at ${base.toArray().join(",")}`,
    );
  }
  for (const leg of legs) {
    const bounds = new THREE.Box3().setFromObject(leg),
      center = bounds.getCenter(new THREE.Vector3());
    assert.ok(
      Math.abs(bounds.min.y - parishFloorHeight(center.x, center.z, bounds.min.y)!) < 0.001,
    );
  }
});

void test("slate courses touch their roof prisms and facade quoins touch actual masonry", () => {
  const slates = sources.filter((o) => o.name === "roof-slate-course"),
    roofs = sources.filter(
      (o) =>
        o.geometry.type === "ExtrudeGeometry" &&
        o.material instanceof THREE.MeshStandardMaterial &&
        o.material.color.getHexString() === "3b4643",
    );
  assert.ok(slates.length > 300);
  for (const slate of slates) {
    const at = slate.getWorldPosition(new THREE.Vector3());
    const ray = new THREE.Raycaster(
      at.clone().add(new THREE.Vector3(0, 0.1, 0)),
      new THREE.Vector3(0, -1, 0),
      0,
      0.14,
    );
    assert.ok(
      ray.intersectObjects(roofs, false).length,
      `unsupported roof course at ${at.toArray().join(",")}`,
    );
  }
  for (const quoin of sources.filter((o) => /^(facade-quoin|tower-corner-quoin)$/.test(o.name))) {
    const bounds = new THREE.Box3().setFromObject(quoin),
      at = bounds.getCenter(new THREE.Vector3()),
      tower = quoin.name === "tower-corner-quoin";
    at.z = tower ? bounds.max.z : bounds.min.z;
    const ray = new THREE.Raycaster(at, new THREE.Vector3(0, 0, tower ? -1 : 1), 0, 0.18);
    assert.ok(
      ray.intersectObjects(
        sources.filter((o) => o !== quoin),
        false,
      ).length,
      `detached quoin at ${at.toArray().join(",")}`,
    );
  }
});
