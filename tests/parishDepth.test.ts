import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { buildParishEnvironment } from "../src/gameplay/parishEnvironment.ts";
import { batchStaticMeshes } from "../src/gameplay/batchStaticMeshes.ts";

const environment = buildParishEnvironment(false);
environment.root.updateMatrixWorld(true);
const sources: THREE.Mesh[] = [];
environment.root.traverse((o) => {
  if (
    o instanceof THREE.Mesh &&
    !(o instanceof THREE.InstancedMesh) &&
    o.parent?.name !== "static-scenery-batches"
  )
    sources.push(o);
});
test.after(() => environment.dispose());

function floorFacesAt(x: number, y: number, z: number) {
  const ray = new THREE.Raycaster(
    new THREE.Vector3(x, y + 0.1, z),
    new THREE.Vector3(0, -1, 0),
    0,
    0.15,
  );
  const hits = ray
    .intersectObjects(sources, false)
    .filter(
      (hit) =>
        Math.abs(hit.point.y - y) < 0.0001 &&
        hit.face &&
        hit.face.normal.clone().transformDirection(hit.object.matrixWorld).y > 0.99,
    );
  return new Set(hits.map((hit) => hit.object)).size;
}

void test("burial terrace and boss approach have one structural face per paving surface", () => {
  // Off-grid samples avoid triangle seams; each site previously had two equal-depth owners.
  for (const [x, y, z] of [
    [-54.9, 6, 114.3],
    [-70.1, 6, 120.3],
    [-56.3, 6, 108.3],
    [0.7, 12, 15.3],
    [0.7, 12, 21.3],
    [-17.3, 12, 21.3],
    [21.3, 12, 21.3],
  ])
    assert.equal(floorFacesAt(x, y, z), 1, `duplicate pavement at ${x},${y},${z}`);
});

void test("cloister roof caps do not share their depth with the arcade masonry", () => {
  for (const x of [-81.1, -47.1]) {
    const ray = new THREE.Raycaster(
      new THREE.Vector3(x, 18, 40.3),
      new THREE.Vector3(0, -1, 0),
      0,
      4,
    );
    const hits = ray
      .intersectObjects(sources, false)
      .filter(
        (hit) =>
          hit.face && hit.face.normal.clone().transformDirection(hit.object.matrixWorld).y > 0.99,
      );
    assert.ok(hits.length >= 2);
    assert.ok(
      hits[1].distance - hits[0].distance > 0.02,
      `roof cap and wall cap overlap at ${x},40.3`,
    );
  }
});

void test("planter coping owns its top face instead of sharing it with the retaining wall", () => {
  for (const [x, y, z] of [
    [-19.825, 6.85, 62.3],
    [-17.1, 6.85, 59.2],
    [-25.825, 7, 90.3],
  ])
    assert.equal(floorFacesAt(x, y, z), 1, `duplicate planter cap at ${x},${y},${z}`);
});

void test("overlapping stair and terrace parapets have distinct exposed side faces", () => {
  const walls = sources.filter(
    (o) =>
      o.geometry.type === "BoxGeometry" &&
      Math.abs(o.position.x + 76) < 0.001 &&
      Math.abs(o.position.z - 104) < 0.001,
  );
  const ray = new THREE.Raycaster(
    new THREE.Vector3(-78, 6.6, 100.1),
    new THREE.Vector3(1, 0, 0),
    0,
    4,
  );
  const hits = ray.intersectObjects(walls, false);
  assert.ok(hits.length >= 2);
  assert.ok(hits[1].distance - hits[0].distance > 0.015, "stacked parapets share an outer face");
});

void test("ground overlays have a depth bias without disabling scene occlusion", () => {
  const overlays = sources.filter((o) => /^(court-stone-inlay|ground-moss)$/.test(o.name));
  assert.ok(overlays.length > 60);
  for (const mesh of overlays) {
    assert.ok(mesh.material instanceof THREE.MeshStandardMaterial);
    assert.equal(mesh.material.depthTest, true);
    assert.equal(mesh.material.depthWrite, false);
    assert.equal(mesh.material.polygonOffset, true);
    assert.ok(mesh.material.polygonOffsetFactor < 0 && mesh.material.polygonOffsetUnits < 0);
    assert.equal(mesh.castShadow, false);
  }
});

void test("static batches preserve the render order of surface layers", () => {
  const root = new THREE.Group(),
    geometry = new THREE.PlaneGeometry(1, 1),
    material = new THREE.MeshStandardMaterial();
  for (const order of [0, 0, 1, 1]) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.renderOrder = order;
    root.add(mesh);
  }
  const batching = batchStaticMeshes(root);
  try {
    assert.deepEqual(
      batching.batch.children.map((o) => o.renderOrder).sort((a, b) => a - b),
      [0, 1],
    );
  } finally {
    batching.dispose();
    geometry.dispose();
    material.dispose();
  }
});
