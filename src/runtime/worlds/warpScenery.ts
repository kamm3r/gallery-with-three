import * as THREE from "three";
import { PIT_BOTTOM, type LevelTheme, type WarpLevel } from "../../gameplay/warpLevels";

// Level dressing: ground blocks and themed props scattered along the route.
// Props are instanced and deterministic, so every visit looks the same.

type Placement = {
  p: [number, number, number];
  r?: [number, number, number];
  s: [number, number, number];
};
type Spot = { x: number; z: number; y: number; k: number; side: number };

function seeded(seed: number) {
  let value = seed >>> 0;
  return () => (value = (Math.imul(value, 1664525) + 1013904223) >>> 0) / 4294967296;
}

const scratch = new THREE.Object3D();
const FLOOR = PIT_BOTTOM;
const standard = (params: THREE.MeshStandardMaterialParameters) =>
  new THREE.MeshStandardMaterial(params);

function scatter(
  parent: THREE.Object3D,
  items: Placement[],
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  shadows = true,
) {
  if (!items.length) return;
  const mesh = new THREE.InstancedMesh(geometry, material, items.length);
  items.forEach((item, i) => {
    scratch.position.set(...item.p);
    scratch.rotation.set(...(item.r ?? [0, 0, 0]));
    scratch.scale.set(...item.s);
    scratch.updateMatrix();
    mesh.setMatrixAt(i, scratch.matrix);
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
  mesh.castShadow = shadows;
  mesh.receiveShadow = true;
  parent.add(mesh);
}

function floorPlane(parent: THREE.Object3D, z: number, material: THREE.Material) {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(90, 200), material);
  mesh.position.set(0, FLOOR, z);
  mesh.rotation.x = -Math.PI / 2;
  mesh.receiveShadow = true;
  parent.add(mesh);
}

/** Ground and walls: themed top, darker sides, with a lip along ground edges. */
export function createLevelGround(level: WarpLevel) {
  const { theme } = level;
  const group = new THREE.Group();
  const top = standard({ color: theme.ground, roughness: 0.9 });
  const side = standard({ color: theme.groundSide, roughness: 0.95 });
  const wall = standard({ color: theme.groundSide, roughness: 1 });
  const wallTop = standard({ color: theme.trim, roughness: 0.9 });
  const floor = [side, side, top, side, side, side];
  const walls = [wall, wall, wallTop, wall, wall, wall];
  const lip = standard({ color: theme.trim, roughness: 0.9 });
  for (const solid of level.solids) {
    const bottom = solid.bottom ?? PIT_BOTTOM;
    const height = solid.top - bottom;
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(solid.w, height, solid.d),
      solid.wall ? walls : floor,
    );
    mesh.position.set(solid.x, bottom + height / 2, solid.z);
    mesh.castShadow = mesh.receiveShadow = true;
    group.add(mesh);
    if (solid.wall || solid.w <= 2.4) continue;
    for (const s of [-1, 1]) {
      const edge = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.12, solid.d), lip);
      edge.position.set(solid.x + s * (solid.w / 2 - 0.12), solid.top + 0.05, solid.z);
      edge.receiveShadow = true;
      group.add(edge);
    }
  }
  return group;
}

/** Side scenery for each theme, both banks of the route. Returns an animator. */
export function createLevelDressing(level: WarpLevel, parent: THREE.Object3D) {
  const { theme } = level;
  const random = seeded(level.index * 977 + 13);
  const spots: Spot[] = [];
  for (let z = level.spawn[2] + 10; z > level.exit[2] - 14; z -= 3.2)
    for (const side of [-1, 1]) {
      const x = side * (7 + random() * 10);
      spots.push({ x, z: z + random() * 2, y: FLOOR + random() * 2.5, k: random(), side });
    }
  switch (theme.deco) {
    case "jungle":
      jungle(parent, spots);
      return () => {};
    case "snow":
      return snow(parent, spots, level);
    case "sewer":
      sewer(parent, level, theme);
      return () => {};
    case "canyon":
      canyon(parent, spots, theme);
      return () => {};
    case "ruins":
      ruins(parent, spots, theme);
      return () => {};
  }
}

function jungle(parent: THREE.Object3D, spots: Spot[]) {
  const trunks: Placement[] = [];
  const crowns: Placement[] = [];
  const ferns: Placement[] = [];
  for (const { x, z, k } of spots) {
    const h = 18 + k * 12;
    const y = FLOOR;
    trunks.push({ p: [x, y + h / 2, z], r: [0, 0, (k - 0.5) * 0.12], s: [0.9, h, 0.9] });
    crowns.push({ p: [x, y + h, z], s: [3.4 + k, 1.8 + k * 0.6, 3.4 + k] });
    crowns.push({ p: [x + 1.2, y + h - 2, z + 0.6], s: [2.4, 1.3, 2.4] });
    crowns.push({ p: [x - 1, y + h - 5, z - 0.8], s: [1.8, 1, 1.8] });
    ferns.push({ p: [x, y + 0.8, z + 1.5], r: [0, k * 6, 0], s: [2.4, 1.6 + k, 2.4] });
  }
  scatter(
    parent,
    trunks,
    new THREE.CylinderGeometry(0.35, 0.5, 1, 7),
    standard({ color: "#5a3d22", roughness: 0.9 }),
  );
  scatter(
    parent,
    crowns,
    new THREE.IcosahedronGeometry(1, 0),
    standard({ color: "#3f8a3a", roughness: 0.8, flatShading: true }),
  );
  scatter(
    parent,
    ferns,
    new THREE.ConeGeometry(1, 1, 6),
    standard({ color: "#5ca84a", roughness: 0.8, flatShading: true }),
  );
  floorPlane(parent, -40, standard({ color: "#2f5a2a", roughness: 1 }));
}

function snow(parent: THREE.Object3D, spots: Spot[], level: WarpLevel) {
  const tiers: Placement[] = [];
  const caps: Placement[] = [];
  const rocks: Placement[] = [];
  for (const { x, z, k, y } of spots) {
    const h = 20 + k * 10;
    for (let t = 0; t < 3; t++) {
      const r = (1.8 - t * 0.45) * (0.8 + k * 0.4);
      tiers.push({ p: [x, y + t * h * 0.28 + h * 0.2, z], s: [r, h * 0.4, r] });
      caps.push({ p: [x, y + t * h * 0.28 + h * 0.34, z], s: [r * 0.55, h * 0.14, r * 0.55] });
    }
    rocks.push({ p: [x * 0.8, y, z + 1.2], r: [k, k * 3, 0], s: [2.2 + k, 1.6 + k, 2.3] });
  }
  scatter(
    parent,
    tiers,
    new THREE.ConeGeometry(1, 1, 8),
    standard({ color: "#2f5a48", roughness: 0.85, flatShading: true }),
  );
  scatter(
    parent,
    caps,
    new THREE.ConeGeometry(1, 1, 8),
    standard({ color: "#f4f8fc", roughness: 0.6, flatShading: true }),
  );
  scatter(
    parent,
    rocks,
    new THREE.DodecahedronGeometry(1, 0),
    standard({ color: "#dfe8f2", roughness: 0.7, flatShading: true }),
  );
  floorPlane(parent, -40, standard({ color: "#e6eef7", roughness: 0.9 }));
  const from = level.spawn[2] + 10;
  const to = level.exit[2] - 10;
  const rand = seeded(99);
  const count = 900;
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    positions[i * 3] = (rand() - 0.5) * 40;
    positions[i * 3 + 1] = rand() * 16 - 2;
    positions[i * 3 + 2] = to + rand() * (from - to);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const points = new THREE.Points(
    geometry,
    new THREE.PointsMaterial({
      color: "#ffffff",
      size: 0.09,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
    }),
  );
  points.frustumCulled = false;
  parent.add(points);
  return (delta: number) => {
    const attribute = geometry.getAttribute("position") as THREE.BufferAttribute;
    const array = attribute.array as Float32Array;
    for (let i = 1; i < array.length; i += 3) {
      array[i] -= delta * (1.2 + (i % 7) * 0.12);
      array[i - 1] += Math.sin(array[i] + i) * delta * 0.3;
      if (array[i] < -3) array[i] += 17;
    }
    attribute.needsUpdate = true;
  };
}

function sewer(parent: THREE.Object3D, level: WarpLevel, theme: LevelTheme) {
  const pipes: Placement[] = [];
  const rings: Placement[] = [];
  const random = seeded(7);
  const start = level.spawn[2] + 6;
  const end = level.exit[2] - 4;
  const length = start - end;
  for (const side of [-1, 1])
    for (const height of [2.2, 4.6]) {
      pipes.push({
        p: [side * 3.1, height + (side > 0 ? 0.4 : 0), (start + end) / 2],
        r: [Math.PI / 2, 0, 0],
        s: [side * height > 3 ? 0.35 : 0.22, length, side * height > 3 ? 0.35 : 0.22],
      });
      for (let z = start; z > end; z -= 4 + random() * 3)
        rings.push({
          p: [side * 3.1, height + (side > 0 ? 0.4 : 0), z],
          r: [Math.PI / 2, 0, 0],
          s: [1.25, 0.3, 1.25],
        });
    }
  scatter(
    parent,
    pipes,
    new THREE.CylinderGeometry(1, 1, 1, 12),
    standard({ color: "#6d7a6a", metalness: 0.5, roughness: 0.5 }),
  );
  scatter(
    parent,
    rings,
    new THREE.CylinderGeometry(0.36, 0.36, 1, 12),
    standard({ color: "#4a5448", metalness: 0.6, roughness: 0.4 }),
  );
  const ceiling = new THREE.Mesh(
    new THREE.PlaneGeometry(8, length),
    standard({ color: "#232b25", roughness: 1, side: THREE.DoubleSide }),
  );
  ceiling.position.set(0, 6.05, (start + end) / 2);
  ceiling.rotation.x = Math.PI / 2;
  const sludge = new THREE.Mesh(
    new THREE.PlaneGeometry(8, length),
    standard({ color: "#5fbf3a", emissive: "#3a8f1c", emissiveIntensity: 0.9, roughness: 0.3 }),
  );
  sludge.position.set(0, level.killY - 0.6, (start + end) / 2);
  sludge.rotation.x = -Math.PI / 2;
  parent.add(ceiling, sludge);
  const bulb = new THREE.MeshBasicMaterial({
    color: new THREE.Color(2.4, 2.2, 1.4),
    toneMapped: false,
  });
  for (let z = start - 6; z > end; z -= 16) {
    const lamp = new THREE.Group();
    lamp.position.set(0, 5.4, z);
    lamp.add(
      new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 8), bulb),
      new THREE.PointLight(theme.light, 14, 14, 2),
    );
    parent.add(lamp);
  }
}

function canyon(parent: THREE.Object3D, spots: Spot[], theme: LevelTheme) {
  const pillars: Placement[] = [];
  const cacti: Placement[] = [];
  for (const { x, z, k } of spots) {
    const h = 22 + k * 16;
    pillars.push({
      p: [x + Math.sign(x) * 2, FLOOR + h / 2, z],
      r: [0, k * 5, 0],
      s: [2.4 + k * 2, h, 2.4 + k * 2],
    });
    if (k > 0.6) cacti.push({ p: [x * 0.8, FLOOR + 1.5, z + 1.3], s: [0.4, 2 + k * 1.5, 0.4] });
  }
  scatter(
    parent,
    pillars,
    new THREE.CylinderGeometry(0.45, 0.6, 1, 7),
    standard({ color: theme.groundSide, roughness: 1, flatShading: true }),
  );
  scatter(
    parent,
    cacti,
    new THREE.CapsuleGeometry(1, 1, 4, 8),
    standard({ color: "#5f8a3c", roughness: 0.8 }),
  );
  floorPlane(parent, -40, standard({ color: theme.ground, roughness: 1 }));
}

function ruins(parent: THREE.Object3D, spots: Spot[], theme: LevelTheme) {
  const columns: Placement[] = [];
  const caps: Placement[] = [];
  const vines: Placement[] = [];
  spots.forEach(({ x, z, k }, i) => {
    const h = 14 + k * 10;
    const broken = i % 3 === 0;
    columns.push({
      p: [x, FLOOR + h / 2, z],
      r: [0, 0, broken ? (k - 0.5) * 0.3 : 0],
      s: [0.7, h, 0.7],
    });
    if (!broken) caps.push({ p: [x, FLOOR + h + 0.2, z], s: [1.9, 0.4, 1.9] });
    vines.push({ p: [x + 0.5, FLOOR + h * 0.6, z + 0.5], s: [0.4, h * 0.5, 0.4] });
  });
  scatter(
    parent,
    columns,
    new THREE.CylinderGeometry(1, 1, 1, 10),
    standard({ color: "#b9ae96", roughness: 0.9 }),
  );
  scatter(
    parent,
    caps,
    new THREE.BoxGeometry(1, 1, 1),
    standard({ color: "#a39a86", roughness: 0.9 }),
  );
  scatter(
    parent,
    vines,
    new THREE.CylinderGeometry(0.2, 0.05, 1, 5),
    standard({ color: theme.trim, roughness: 0.8 }),
    false,
  );
  floorPlane(parent, -45, standard({ color: "#4f5a3c", roughness: 1 }));
}
