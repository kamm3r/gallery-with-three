import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { buildParishEnvironment } from "../src/gameplay/parishEnvironment.ts";
import { parishWalls } from "../src/gameplay/ashenParish.ts";
import { parishBuildings } from "../src/gameplay/parishArchitecture.ts";

const environment = buildParishEnvironment(false);
environment.root.updateMatrixWorld(true);
const meshes: THREE.Object3D[] = [];
environment.root.traverse((o) => {
  if (o instanceof THREE.Mesh && o.visible) meshes.push(o);
});
test.after(() => environment.dispose());

void test("the refuge canopy connects to its corner supports", () => {
  for (const [x, z, height] of [
    [-12.5, 130.4, 3.8],
    [-5.5, 130.4, 3.8],
    [-12.5, 133.6, 3.35],
    [-5.5, 133.6, 3.35],
  ]) {
    const ray = new THREE.Raycaster(
      new THREE.Vector3(x, height - 0.04, z),
      new THREE.Vector3(0, 1, 0),
      0,
      0.15,
    );
    assert.ok(ray.intersectObjects(meshes, false).length, `unsupported canopy corner at ${x},${z}`);
  }
  const roof = environment.root.getObjectByName("canopy-fabric") as THREE.Mesh;
  const positions = roof.geometry.getAttribute("position"),
    weights = roof.geometry.getAttribute("parishClothWeight");
  for (let i = 0; i < positions.count; i++) {
    if (Math.abs(positions.getX(i)) < 3.49 && Math.abs(positions.getZ(i)) < 1.59) continue;
    assert.ok(weights.getX(i) < 0.00001, "wind must not detach fabric from its supporting frame");
  }
});

void test("house door timber fits inside the pointed arch instead of covering its curved corners", () => {
  const point = new THREE.Vector3();
  for (const building of parishBuildings) {
    const [x, base, z] = building.position,
      front = z - building.size[2] / 2;
    let checked = 0;
    environment.root.traverse((o) => {
      if (!(o instanceof THREE.Mesh) || !(o.material instanceof THREE.MeshStandardMaterial)) return;
      if (!["534333", "735c43"].includes(o.material.color.getHexString())) return;
      const positions = o.geometry.getAttribute("position");
      for (let i = 0; i < positions.count; i++) {
        point.fromBufferAttribute(positions, i).applyMatrix4(o.matrixWorld);
        const across = Math.abs(point.x - x),
          height = point.y - base;
        if (across > 1.21 || point.z > front - 0.01 || point.z < front - 0.65) continue;
        const t = Math.sqrt(Math.max(0, (1.2 - across) / 1.2));
        const top = 2.56 + 1.92 * t - 0.48 * t * t;
        assert.ok(
          height <= top + 0.01,
          `door corner intersects arch: ${point.toArray().join(",")}`,
        );
        checked++;
      }
    });
    assert.ok(checked > 20, "check the actual door geometry");
  }
});

void test("aqueduct stair parapets follow both ends of the slope instead of floating horizontally", () => {
  for (const z of [117, 123]) {
    const floor = 5.25 - (z - 120) * 0.4375;
    const ray = new THREE.Raycaster(new THREE.Vector3(52, 20, z), new THREE.Vector3(0, -1, 0));
    const hit = ray.intersectObjects(meshes, false)[0];
    assert.ok(hit);
    assert.ok(
      Math.abs(hit.point.y - (floor + 1.14)) < 0.1,
      `rail top at z=${z}: ${hit.point.y}, floor ${floor}`,
    );
  }
});

void test("high-walk banners have supports down to the deck", () => {
  for (const [x, z] of [
    [43.6, 68],
    [52.4, 84],
  ]) {
    const ray = new THREE.Raycaster(
      new THREE.Vector3(x - 1, 16, z),
      new THREE.Vector3(1, 0, 0),
      0,
      2,
    );
    assert.ok(ray.intersectObjects(meshes, false).length, `missing banner mast at ${x},${z}`);
  }
});

void test("the bell is hung from the tower roof", () => {
  const ray = new THREE.Raycaster(new THREE.Vector3(47, 30, 48), new THREE.Vector3(1, 0, 0), 0, 2);
  assert.ok(
    ray.intersectObjects(meshes, false).length,
    "the gap between bell and roof needs a hanger",
  );
});
void test("the middle stair arrival does not intersect the arcade beam", () => {
  const ray = new THREE.Raycaster(
    new THREE.Vector3(43.5, 13.2, 64),
    new THREE.Vector3(1, 0, 0),
    0,
    1.5,
  );
  assert.equal(
    ray.intersectObjects(meshes, false).length,
    0,
    "arcade masonry must not cross the stair arrival",
  );
});
void test("aqueduct ivy and rubble stay attached to sloping masonry", () => {
  const slopes = parishWalls.filter((w) => w.slope !== 0 && w.area === "aqueduct" && w.z >= 104);
  const matrix = new THREE.Matrix4(),
    p = new THREE.Vector3();
  let ivy = 0,
    rubble = 0;
  const match = (point: THREE.Vector3, offset: number) =>
    slopes.find(
      (w) =>
        Math.abs((w.alongX ? point.z - w.z : point.x - w.x) - offset) < 0.02 &&
        Math.abs(w.alongX ? point.x - w.x : point.z - w.z) < 3.51,
    );
  const floor = (w: (typeof parishWalls)[number], point: THREE.Vector3) =>
    w.y + w.slope * (w.alongX ? point.x - w.x : point.z - w.z);
  environment.dressing.root.traverse((o) => {
    if (o instanceof THREE.InstancedMesh && o.name.startsWith("foliage:")) {
      for (let i = 0; i < o.count; i++) {
        o.getMatrixAt(i, matrix);
        p.setFromMatrixPosition(matrix);
        const wall = match(p, 0.333);
        if (!wall) continue;
        const height = p.y - floor(wall, p);
        assert.ok(
          height >= 0.14 && height <= 0.96,
          `ivy outside its slope: ${p.toArray().join(",")} (${height})`,
        );
        ivy++;
      }
    } else if (o instanceof THREE.Mesh && o.name === "edge-rubble") {
      const wall = o.userData.boundary as (typeof parishWalls)[number];
      if (!slopes.includes(wall)) return;
      assert.ok(
        Math.abs(o.position.y - floor(wall, o.position) - (o.scale.y * 0.4) / 0.7) < 0.00001,
      );
      rubble++;
    }
  });
  assert.ok(ivy > 0 && rubble > 0, "exercise actual decorations on both stair slopes");
});
