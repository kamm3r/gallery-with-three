import * as THREE from "three";

const EPSILON = 1e-5;
const CELL = 8;
type Vertex = { position: THREE.Vector3; normal: THREE.Vector3; uv: THREE.Vector2 };
type Face = {
  points: THREE.Vector2[];
  normal: THREE.Vector3;
  distance: number;
  bounds: THREE.Box2;
};

const signedDistance = (p: THREE.Vector2, a: THREE.Vector2, b: THREE.Vector2) =>
  ((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)) / a.distanceTo(b);

/** Remove only the covered part of a triangle, retaining every uncovered edge. */
function subtract(polygon: Vertex[], face: Face, project: (v: THREE.Vector3) => THREE.Vector2) {
  const projected = polygon.map((v) => project(v.position));
  const separated = (a: THREE.Vector2[], b: THREE.Vector2[]) => {
    const orientation =
      a.reduce((sum, p, i) => {
        const q = a[(i + 1) % a.length];
        return sum + p.x * q.y - q.x * p.y;
      }, 0) >= 0
        ? 1
        : -1;
    return a.some((p, i) =>
      b.every((q) => orientation * signedDistance(q, p, a[(i + 1) % a.length]) <= 1e-9),
    );
  };
  if (separated(face.points, projected) || separated(projected, face.points)) return [polygon];
  let inside = polygon;
  const outside: Vertex[][] = [];
  for (let edge = 0; edge < 3 && inside.length >= 3; edge++) {
    const a = face.points[edge],
      b = face.points[(edge + 1) % 3];
    const kept: Vertex[] = [],
      cut: Vertex[] = [];
    for (let i = 0; i < inside.length; i++) {
      const p = inside[i],
        q = inside[(i + 1) % inside.length];
      const dp = signedDistance(project(p.position), a, b);
      const dq = signedDistance(project(q.position), a, b);
      if (dp >= -1e-9) kept.push(p);
      if (dp <= 1e-9) cut.push(p);
      if ((dp > 0 && dq < 0) || (dp < 0 && dq > 0)) {
        const t = dp / (dp - dq);
        const intersection = {
          position: p.position.clone().lerp(q.position, t),
          normal: p.normal.clone().lerp(q.normal, t),
          uv: p.uv.clone().lerp(q.uv, t),
        };
        kept.push(intersection);
        cut.push(intersection);
      }
    }
    if (cut.length >= 3) outside.push(cut);
    inside = kept;
  }
  return outside;
}

/**
 * Static architecture often meets with overlapping floors, roof bases and wall caps.
 * Clip coplanar faces before batching, instead of relying on a camera-dependent depth
 * bias. Earlier meshes own the overlap. Preserve positions, UVs and shading; physics
 * keeps the original slabs. Opposite-facing faces and nearby storeys stay independent.
 */
export function sealCapitalSeams(meshes: THREE.Mesh[]) {
  const cells = new Map<string, Face[]>();
  const geometries: THREE.BufferGeometry[] = [];
  let trimmedTriangles = 0;
  for (const mesh of meshes) {
    mesh.updateWorldMatrix(true, false);
    const source = mesh.geometry;
    const positions = source.getAttribute("position"),
      normals = source.getAttribute("normal"),
      uvs = source.getAttribute("uv");
    const indices = source.index;
    const count = indices?.count ?? positions.count;
    const output: Vertex[] = [];
    const inverse = mesh.matrixWorld.clone().invert();
    const normalMatrix = new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld);
    const inverseNormal = normalMatrix.clone().invert();
    let changed = false;
    for (let i = 0; i < count; i += 3) {
      const vertices = Array.from({ length: 3 }, (_, j): Vertex => {
        const index = indices ? indices.getX(i + j) : i + j;
        return {
          position: new THREE.Vector3()
            .fromBufferAttribute(positions, index)
            .applyMatrix4(mesh.matrixWorld),
          normal: new THREE.Vector3()
            .fromBufferAttribute(normals, index)
            .applyMatrix3(normalMatrix),
          uv: new THREE.Vector2(uvs.getX(index), uvs.getY(index)),
        };
      });
      const normal = vertices[1].position
        .clone()
        .sub(vertices[0].position)
        .cross(vertices[2].position.clone().sub(vertices[0].position));
      if (normal.lengthSq() < 1e-16) {
        changed = true;
        continue;
      }
      normal.normalize();
      const distance = normal.dot(vertices[0].position);
      const axis =
        Math.abs(normal.x) > Math.abs(normal.y)
          ? Math.abs(normal.x) > Math.abs(normal.z)
            ? 0
            : 2
          : Math.abs(normal.y) > Math.abs(normal.z)
            ? 1
            : 2;
      const project = (p: THREE.Vector3) =>
        axis === 0
          ? new THREE.Vector2(p.y, p.z)
          : axis === 1
            ? new THREE.Vector2(p.z, p.x)
            : new THREE.Vector2(p.x, p.y);
      const points = vertices.map((v) => project(v.position));
      if (signedDistance(points[2], points[0], points[1]) < 0) points.reverse();
      const bounds = new THREE.Box2().setFromPoints(points);
      // Plane normal buckets limit work; verify the actual plane before clipping.
      const plane = normal
        .toArray()
        .map((n) => Math.round(n * 1e5))
        .join(",");
      const keys: string[] = [];
      for (let x = Math.floor(bounds.min.x / CELL); x <= Math.floor(bounds.max.x / CELL); x++)
        for (let y = Math.floor(bounds.min.y / CELL); y <= Math.floor(bounds.max.y / CELL); y++)
          keys.push(`${plane}:${x}:${y}`);
      const candidates = new Set(keys.flatMap((key) => cells.get(key) ?? []));
      let fragments = [vertices];
      for (const face of candidates) {
        if (Math.abs(face.distance - distance) > EPSILON || normal.dot(face.normal) < 1 - 1e-10)
          continue;
        // An edge or point in common is a seam, not an overlapping area.
        if (
          Math.min(bounds.max.x, face.bounds.max.x) - Math.max(bounds.min.x, face.bounds.min.x) <=
            EPSILON ||
          Math.min(bounds.max.y, face.bounds.max.y) - Math.max(bounds.min.y, face.bounds.min.y) <=
            EPSILON
        )
          continue;
        fragments = fragments.flatMap((fragment) => subtract(fragment, face, project));
        if (!fragments.length) break;
      }
      if (fragments.length !== 1 || fragments[0] !== vertices) {
        changed = true;
        trimmedTriangles++;
      }
      for (const fragment of fragments)
        for (let j = 1; j < fragment.length - 1; j++) {
          const triangle = [fragment[0], fragment[j], fragment[j + 1]];
          const area = triangle[1].position
            .clone()
            .sub(triangle[0].position)
            .cross(triangle[2].position.clone().sub(triangle[0].position))
            .lengthSq();
          if (area > 1e-16) output.push(...triangle);
        }
      const face: Face = { points, normal, distance, bounds };
      for (const key of keys) {
        const list = cells.get(key) ?? [];
        list.push(face);
        cells.set(key, list);
      }
    }
    if (!changed) continue;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(
        output.flatMap((v) => v.position.clone().applyMatrix4(inverse).toArray()),
        3,
      ),
    );
    geometry.setAttribute(
      "normal",
      new THREE.Float32BufferAttribute(
        output.flatMap((v) => v.normal.clone().applyMatrix3(inverseNormal).normalize().toArray()),
        3,
      ),
    );
    geometry.setAttribute(
      "uv",
      new THREE.Float32BufferAttribute(
        output.flatMap((v) => v.uv.toArray()),
        2,
      ),
    );
    geometry.userData = { ...source.userData };
    mesh.geometry = geometry;
    geometries.push(geometry);
  }
  return { geometries, trimmedTriangles };
}
