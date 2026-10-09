import * as THREE from "three";
import type { CapitalSurface } from "./capitalLayout.ts";
import { capitalStatues } from "./capitalLayout.ts";
import type { ParishPoint } from "./ashenParish.ts";

type Materials = Record<string, THREE.Material>;
type Add = (
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  position?: ParishPoint,
  rotation?: ParishPoint,
) => THREE.Mesh;

const stairFamilies = [
  "town-stair",
  "town-cellar-stair",
  "town-hall-stair",
  "town-roof-stair",
  "cathedral-third-ascent",
  "cathedral-nave-stair",
  "cathedral-rafter-stair",
  "west-exterior",
  "garden-return",
];
export function isCapitalStair(s: CapitalSurface) {
  return (
    s.vertices.length === 4 &&
    !s.id.includes("landing") &&
    stairFamilies.some((id) => s.id.startsWith(id + ":")) &&
    Math.abs(s.vertices[1][1] - s.vertices[0][1]) > 0.1
  );
}

/** Repeated architectural cues read at walking height in the reference demo. */
export function addCapitalReferenceDetails(add: Add, m: Materials, floors: CapitalSurface[]) {
  const box = (p: ParishPoint, size: ParishPoint, material = m.dark, yaw = 0) =>
    add(new THREE.BoxGeometry(...size), material, p, [0, yaw, 0]);
  const cylinder = (
    p: ParishPoint,
    radius: number,
    height: number,
    material = m.trim,
    top = radius,
  ) => add(new THREE.CylinderGeometry(top, radius, height, 10), material, p);
  // Sculpted, hooded memorials flank the route openings in the footage. They
  // stand outside the clear aisle; their plinths are authored in the layout.
  for (const [x, y, z, yaw] of capitalStatues) {
    cylinder([x, y + 0.2, z], 0.8, 0.4, m.dark);
    cylinder([x, y + 0.55, z], 0.63, 0.3, m.trim);
    const robe = add(new THREE.CylinderGeometry(0.28, 0.62, 2.4, 12, 6), m.statue, [x, y + 1.9, z]);
    const position = robe.geometry.getAttribute("position");
    for (let i = 0; i < position.count; i++) {
      const a = Math.atan2(position.getZ(i), position.getX(i));
      const fold = 1 + 0.07 * Math.sin(a * 6) * (0.5 - position.getY(i) / 2.4);
      position.setX(i, position.getX(i) * fold);
      position.setZ(i, position.getZ(i) * fold);
    }
    robe.geometry.computeVertexNormals();
    const head = add(new THREE.SphereGeometry(0.27, 12, 8), m.statue, [x, y + 3.35, z]);
    head.scale.set(0.85, 1.12, 0.95);
    const hood = add(
      new THREE.SphereGeometry(0.37, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.68),
      m.statue,
      [x, y + 3.4, z],
    );
    hood.rotation.x = -0.25;
    for (const side of [-1, 1]) {
      const arm = add(new THREE.CylinderGeometry(0.14, 0.2, 1.2, 8), m.statue, [
        x + side * 0.34,
        y + 2.4,
        z,
      ]);
      arm.rotation.z = side * 0.24;
    }
    box([x, y + 2.05, z + 0.28], [0.28, 0.55, 0.2], m.statue, yaw);
  }
  // Broad stairs retain continuous collision ramps, with risers below the
  // nominal walk surface. Rendering cannot introduce hidden capsule snags.
  for (const s of floors) {
    if (!isCapitalStair(s)) continue;
    const [a, b, c, d] = s.vertices;
    const rise = b[1] - a[1];
    if (Math.abs(rise) < 0.1) continue;
    const run = Math.hypot(b[0] - a[0], b[2] - a[2]);
    const width = Math.hypot(d[0] - a[0], d[2] - a[2]);
    const count = Math.ceil(Math.abs(rise) / 0.2);
    const yaw = Math.atan2(b[0] - a[0], b[2] - a[2]);
    for (let i = 0; i < count; i++) {
      const t = (i + 0.5) / count;
      const y = a[1] + rise * (rise > 0 ? i / count : (i + 1) / count);
      box(
        [
          (a[0] + d[0]) / 2 + (b[0] - a[0]) * t,
          y - (Math.abs(rise) / count + 0.06) / 2,
          (a[2] + d[2]) / 2 + (b[2] - a[2]) * t,
        ],
        [width, Math.abs(rise) / count + 0.06, run / count + 0.01],
        m.paving,
        yaw,
      );
    }
    void c;
  }
  box([0, -32, 0], [20000, 4, 20000], m.backdrop);
  // A ruined city continues beyond the playable curtain instead of ending
  // against a flat background. The silhouettes follow the video horizon.
  for (let i = 0; i < 36; i++) {
    const a = i * 2.399963;
    const radius = 330 + (i % 5) * 27;
    const x = Math.cos(a) * radius,
      z = Math.sin(a) * radius;
    const h = 16 + (i % 7) * 8;
    box([x, h / 2 - 30, z], [8 + (i % 4) * 4, h, 10 + (i % 3) * 4], m.backdrop);
    for (const side of [-1, 1]) {
      const annexHeight = 10 + (i % 4) * 5;
      box([x + side * 13, annexHeight / 2 - 30, z + side * 7], [20, annexHeight, 18], m.backdrop);
    }
    if (i % 3 === 0) {
      cylinder([x, h - 23, z], 5, 4, m.backdrop);
      cylinder([x, h - 18, z], 5, 8, m.backdrop, 0.4);
    }
  }
}
