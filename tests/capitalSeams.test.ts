import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { buildCapitalEnvironment } from "../src/gameplay/capitalEnvironment.ts";
import { capitalKitPanel } from "../src/gameplay/capitalBuildingKit.ts";
import { sealCapitalSeams } from "../src/gameplay/capitalSeams.ts";

void test("capital floor joins have one visible surface rather than coplanar layers", () => {
  const environment = buildCapitalEnvironment(false);
  environment.root.updateMatrixWorld(true);
  try {
    for (const [x, y, z] of [
      [38.02045895, 24, -6.68947314],
      [0.13, 0, 96.6],
      [25.86027274, 16, 43.56376422],
      [-10.87, 48, -12.17],
      [-15.87, 54, -58.17],
    ]) {
      const ray = new THREE.Raycaster(
        new THREE.Vector3(x, y + 0.1, z),
        new THREE.Vector3(0, -1, 0),
        0,
        0.11,
      );
      const hits = ray
        .intersectObject(environment.root, true)
        .filter((h) => h.object.visible)
        .filter((h) => Math.abs(h.point.y - y) < 0.001);
      assert.equal(hits.length, 1, `overlapping floor faces at ${x},${y},${z}`);
    }
  } finally {
    environment.dispose();
  }
});

void test("slabs with collinear outline vertices remain closed and face outward", () => {
  const top: [number, number, number][] = [
    [-2, 5, -2],
    [0, 5, -2],
    [2, 5, -2],
    [2, 5, 2],
    [-2, 5, 2],
  ];
  const material = new THREE.MeshBasicMaterial();
  const reversed = [...top].reverse();
  for (const outline of [top, [...reversed.slice(2), ...reversed.slice(0, 2)]]) {
    const geometry = capitalKitPanel(outline, 0.6);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.updateMatrixWorld(true);
    for (const [origin, direction] of [
      [
        [0.2, 6, 0.3],
        [0, -1, 0],
      ],
      [
        [0.2, 4, 0.3],
        [0, 1, 0],
      ],
      [
        [0, 4.7, -5],
        [0, 0, 1],
      ],
      [
        [0, 4.7, 5],
        [0, 0, -1],
      ],
    ]) {
      const ray = new THREE.Raycaster(
        new THREE.Vector3(...origin),
        new THREE.Vector3(...direction),
      );
      const hit = ray.intersectObject(mesh)[0];
      assert.ok(hit, `missing slab face from ${origin}`);
      if (direction[1] === -1) assert.ok(Math.abs(hit.point.y - 5) < 1e-5);
      if (direction[1] === 1) assert.ok(Math.abs(hit.point.y - 4.4) < 1e-5);
    }
    geometry.dispose();
  }
  material.dispose();
});

void test("slab tops have vertical normals so adjacent floor panels shade seamlessly", () => {
  const geometry = capitalKitPanel(
    [
      [-2, 5, -2],
      [2, 5, -2],
      [2, 5, 2],
      [-2, 5, 2],
    ],
    0.6,
  );
  const index = geometry.index!;
  const normals = geometry.getAttribute("normal");
  for (const i of [0, 1, 2]) assert.ok(normals.getY(index.getX(i)) > 0.9999);
  geometry.dispose();
});

void test("clipping rotated overlapping slabs preserves coverage, UVs and nearby floors", () => {
  const group = new THREE.Group();
  group.rotation.y = 0.37;
  group.position.set(12, 8, -9);
  const material = new THREE.MeshBasicMaterial();
  const originals = [new THREE.BoxGeometry(4, 0.4, 4), new THREE.BoxGeometry(4, 0.4, 4)];
  const meshes = originals.map((g, i) => {
    const mesh = new THREE.Mesh(g, material);
    mesh.position.set(i * 2, -0.2, 0);
    group.add(mesh);
    return mesh;
  });
  const upperGeometry = new THREE.BoxGeometry(4, 0.4, 4);
  const upper = new THREE.Mesh(upperGeometry, material);
  upper.position.set(0, -0.18, 0);
  group.add(upper);
  group.updateMatrixWorld(true);
  const seams = sealCapitalSeams([...meshes, upper]);
  try {
    assert.ok(seams.trimmedTriangles > 0);
    for (let x = -1.83; x < 3.9; x += 0.37)
      for (let z = -1.87; z < 1.9; z += 0.41) {
        const origin = new THREE.Vector3(x, 0.2, z).applyMatrix4(group.matrixWorld);
        const ray = new THREE.Raycaster(origin, new THREE.Vector3(0, -1, 0), 0, 0.25);
        const hits = ray.intersectObjects(meshes);
        assert.equal(hits.length, 1, `gap or overlap at ${x},${z}`);
        if (x < 1.9) assert.equal(ray.intersectObject(upper).length, 1, "nearby floor was clipped");
      }
    for (const g of seams.geometries)
      for (const name of ["position", "normal", "uv"])
        assert.ok(Array.from(g.getAttribute(name).array).every(Number.isFinite));
  } finally {
    [...originals, upperGeometry, ...seams.geometries].forEach((g) => g.dispose());
    material.dispose();
  }
});
