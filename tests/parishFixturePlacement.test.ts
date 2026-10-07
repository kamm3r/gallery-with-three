import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { buildParishEnvironment } from "../src/gameplay/parishEnvironment.ts";
import { buildParishAtmosphere } from "../src/gameplay/parishAtmosphere.ts";
import { parishTorches } from "../src/gameplay/parishDressingPlan.ts";
import { PARISH_FLAME_DOMAIN_HEIGHT } from "../src/gameplay/parishFireShader.ts";
import { parishBuildings } from "../src/gameplay/parishArchitecture.ts";
import { parishFloorHeight, parishBlocked } from "../src/gameplay/ashenParish.ts";

const environment = buildParishEnvironment(false),
  atmosphere = buildParishAtmosphere();
environment.root.updateMatrixWorld(true);
atmosphere.root.updateMatrixWorld(true);
const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
const solids: Array<{ mesh: THREE.Mesh; bounds: THREE.Box3; source: THREE.Mesh }> = [];
environment.root.traverse((o) => {
  if (
    !(o instanceof THREE.Mesh) ||
    o instanceof THREE.InstancedMesh ||
    o.parent?.name === "static-scenery-batches" ||
    o.geometry.type === "PlaneGeometry"
  )
    return;
  if (!(o.material instanceof THREE.MeshStandardMaterial) || o.material.transparent) return;
  const mesh = new THREE.Mesh(o.geometry, material);
  mesh.matrixWorld.copy(o.matrixWorld);
  solids.push({ mesh, bounds: new THREE.Box3().setFromObject(o), source: o });
});
test.after(() => {
  material.dispose();
  environment.dispose();
  atmosphere.dispose();
});

// Ray parity through the actual closed mesh distinguishes stone from an arch's empty opening.
function contains(mesh: THREE.Mesh, p: THREE.Vector3) {
  const ray = new THREE.Raycaster(p, new THREE.Vector3(0.311, 0.527, 0.79).normalize(), 0.00001);
  const hits = ray.intersectObject(mesh, false);
  let crossings = 0,
    previous = -Infinity;
  for (const hit of hits)
    if (hit.distance - previous > 0.00001) {
      crossings++;
      previous = hit.distance;
    }
  return crossings % 2 === 1;
}

void test("brazier bodies and their flames have clearance from actual columns, walls and furnaces", () => {
  const collisions: string[] = [];
  for (const torch of parishTorches) {
    const [x, y, z] = torch.position,
      s = torch.scale;
    for (const dx of [-0.68, 0, 0.68])
      for (const dz of [-0.68, 0, 0.68])
        for (const height of [0.25, 0.45, 0.9]) {
          const p = new THREE.Vector3(x + dx * s, y + height * s, z + dz * s);
          if (solids.some(({ mesh, bounds }) => bounds.containsPoint(p) && contains(mesh, p))) {
            collisions.push(torch.position.join(","));
            break;
          }
        }
  }
  assert.deepEqual([...new Set(collisions)], [], "fire fixtures intersect masonry or furniture");
});

void test("flame body stays below the bowl diameter while the volume allows headroom for tips", () => {
  const matrix = new THREE.Matrix4(),
    bounds = new THREE.Box3();
  atmosphere.root.traverse((o) => {
    if (!(o instanceof THREE.InstancedMesh)) return;
    for (let i = 0; i < o.count; i++) {
      o.getMatrixAt(i, matrix);
      o.geometry.computeBoundingBox();
      bounds.copy(o.geometry.boundingBox!).applyMatrix4(matrix);
      const s = new THREE.Vector3().setFromMatrixScale(matrix);
      // The largest horizontal matrix scale determines this torch's physical emitter width.
      const torch = parishTorches.find(
        (t) =>
          Math.abs(t.position[0] - matrix.elements[12]) < 0.001 &&
          Math.abs(t.position[2] - matrix.elements[14]) < 0.001,
      )!;
      // Volume bounds include transparent headroom; shader y = 1 is the original flame body.
      const bodyHeight = (bounds.max.y - bounds.min.y) / PARISH_FLAME_DOMAIN_HEIGHT;
      assert.ok(
        torch && bodyHeight <= 1.36 * torch.scale,
        `oversized flame at ${matrix.elements[12]},${matrix.elements[14]} (scale ${s.toArray().join(",")})`,
      );
    }
  });
});

void test("house window panels meet the facade instead of hanging in front of it", () => {
  const windows: THREE.Mesh[] = [];
  environment.root.traverse((o) => {
    if (
      o instanceof THREE.Mesh &&
      o.geometry.type === "BoxGeometry" &&
      o.material instanceof THREE.MeshStandardMaterial &&
      o.material.color.getHexString() === "343d3f"
    )
      windows.push(o);
  });
  assert.equal(windows.length, parishBuildings.length * 2);
  for (const window of windows) {
    const bounds = new THREE.Box3().setFromObject(window),
      center = bounds.getCenter(new THREE.Vector3());
    const building = parishBuildings.find(
      (b) =>
        Math.abs(b.position[0] - center.x) < b.size[0] / 2 &&
        Math.abs(b.position[2] - center.z) < b.size[2] / 2 + 1,
    )!;
    assert.ok(
      bounds.max.z >= building.position[2] - building.size[2] / 2 - 0.001,
      `window panel is detached at ${center.toArray().join(",")}`,
    );
  }
});

void test("each tree branch starts inside its tapered trunk", () => {
  const trunks: THREE.Mesh<THREE.CylinderGeometry>[] = [],
    branches: THREE.Mesh<THREE.CylinderGeometry>[] = [];
  environment.dressing.root.traverse((o) => {
    if (!(o instanceof THREE.Mesh) || !(o.geometry instanceof THREE.CylinderGeometry)) return;
    const g = o.geometry.parameters;
    if (g.radiusBottom === 0.34 && g.radiusTop === 0.09)
      trunks.push(o as THREE.Mesh<THREE.CylinderGeometry>);
    if (g.radiusBottom === 0.1 && g.radiusTop === 0.025)
      branches.push(o as THREE.Mesh<THREE.CylinderGeometry>);
  });
  assert.ok(trunks.length > 10 && branches.length > 100);
  for (const branch of branches) {
    const start = new THREE.Vector3(0, -branch.geometry.parameters.height / 2, 0).applyMatrix4(
      branch.matrixWorld,
    );
    assert.ok(
      trunks.some((trunk) => {
        const p = start.clone().applyMatrix4(trunk.matrixWorld.clone().invert()),
          g = trunk.geometry.parameters;
        const t = (p.y + g.height / 2) / g.height,
          radius = g.radiusBottom + t * (g.radiusTop - g.radiusBottom);
        return t >= 0 && t <= 1 && Math.hypot(p.x, p.z) <= radius + 0.001;
      }),
      `detached branch at ${start.toArray().join(",")}`,
    );
  }
});

void test("ground moss vertices stay on pavement, including patches beside cutaways", () => {
  const point = new THREE.Vector3();
  environment.dressing.root.traverse((o) => {
    if (
      !(o instanceof THREE.Mesh) ||
      o.parent?.name === "static-scenery-batches" ||
      !(o.material instanceof THREE.MeshStandardMaterial) ||
      o.material.color.getHexString() !== "8b9469"
    )
      return;
    const positions: THREE.BufferAttribute | THREE.InterleavedBufferAttribute =
      o.geometry.getAttribute("position");
    const index: THREE.BufferAttribute | null = o.geometry.index;
    const used = new Set(
      Array.from({ length: index?.count ?? positions.count }, (_, i) =>
        index ? index.getX(i) : i,
      ),
    );
    for (const i of used) {
      point.fromBufferAttribute(positions, i).applyMatrix4(o.matrixWorld);
      const floor = parishFloorHeight(point.x, point.z, point.y);
      assert.ok(
        floor !== null && Math.abs(point.y - floor) < 0.04,
        `moss over void at ${point.toArray().join(",")}`,
      );
    }
  });
});

void test("visible braziers and court columns also block navigation through their bodies", () => {
  for (const torch of parishTorches)
    assert.equal(
      parishBlocked(...torch.position, 0.25),
      true,
      `brazier has no solid footprint at ${torch.position.join(",")}`,
    );
  assert.equal(parishBlocked(23, 6, 80, 0.25), true, "court column has no solid footprint");
});

void test("lantern plates and banner brackets embed into the actual facade masonry", () => {
  const masonry = solids.filter(({ source }) => source.parent === environment.root);
  const mounts: THREE.Mesh[] = [];
  environment.dressing.root.traverse((o) => {
    if (o instanceof THREE.Mesh && ["lantern-wall-plate", "wall-banner-bracket"].includes(o.name))
      mounts.push(o);
  });
  assert.equal(mounts.length, 6);
  for (const mount of mounts) {
    const bounds = new THREE.Box3().setFromObject(mount),
      center = bounds.getCenter(new THREE.Vector3());
    assert.ok(
      [bounds.min.z + 0.001, bounds.max.z - 0.001].some((z) => {
        const point = new THREE.Vector3(center.x, center.y, z);
        return masonry.some(
          ({ mesh, bounds }) => bounds.containsPoint(point) && contains(mesh, point),
        );
      }),
      `unsupported ${mount.name} at ${center.toArray().join(",")}`,
    );
  }
});

void test("banner headers remain inside their support rods along their full width", () => {
  let banners = 0;
  const rods = solids.filter(
    ({ source }) =>
      source.material instanceof THREE.MeshStandardMaterial &&
      source.material.color.getHexString() === "3c4040",
  );
  environment.dressing.root.traverse((o) => {
    if (!(o instanceof THREE.Mesh) || o.name !== "hanging-banner") return;
    banners++;
    const positions = o.geometry.getAttribute("position"),
      uv = o.geometry.getAttribute("uv");
    for (let i = 0; i < positions.count; i++) {
      if (uv.getY(i) < 0.999) continue;
      const point = new THREE.Vector3()
        .fromBufferAttribute(positions, i)
        .applyMatrix4(o.matrixWorld);
      assert.ok(
        rods.some(({ mesh, bounds }) => bounds.containsPoint(point) && contains(mesh, point)),
        `banner header has no rod at ${point.toArray().join(",")}`,
      );
    }
  });
  assert.equal(banners, 5);
});
