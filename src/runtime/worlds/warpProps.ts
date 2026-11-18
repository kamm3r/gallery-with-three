import * as THREE from "three";
import { CRATE_SIZE, type CrateKind, type EnemyKind, type Vec3 } from "../../gameplay/warpLevels";

/** Spinning power crystal. Returns its group and a per-frame updater. */
export function createPowerCrystal(scale = 1, dim = false) {
  const group = new THREE.Group();
  const mesh = new THREE.Mesh(
    new THREE.OctahedronGeometry(1, 0),
    new THREE.MeshStandardMaterial({
      color: dim ? "#4b3f5c" : "#c77dff",
      emissive: dim ? "#1a1025" : "#8a2be2",
      emissiveIntensity: dim ? 0.2 : 1.4,
      metalness: 0.2,
      roughness: 0.15,
      transparent: true,
      opacity: dim ? 0.55 : 0.92,
    }),
  );
  mesh.scale.set(0.42, 0.8, 0.42);
  mesh.castShadow = true;
  group.add(mesh);
  if (!dim) group.add(new THREE.PointLight("#c77dff", 6, 5, 2));
  group.scale.setScalar(scale);
  const baseY = { value: 0 };
  let pickup = 0;
  return {
    group,
    /** Call after positioning the group. */
    anchor() {
      baseY.value = group.position.y;
    },
    update(time: number, delta: number, collected = false) {
      if (collected) pickup = Math.min(1, pickup + delta * 2.2);
      group.rotation.y = time * 1.6 + pickup * 12;
      group.position.y = baseY.value + Math.sin(time * 2) * 0.12 + pickup * 2.5;
      group.scale.setScalar(Math.max(0.0001, scale * (1 - pickup)));
    },
  };
}

export function createGem(owned: boolean) {
  const mesh = new THREE.Mesh(
    new THREE.IcosahedronGeometry(1, 0),
    new THREE.MeshStandardMaterial({
      color: owned ? "#e8fbff" : "#39424d",
      emissive: owned ? "#8fe9ff" : "#000000",
      emissiveIntensity: owned ? 1.2 : 0,
      roughness: 0.05,
      metalness: 0.3,
      transparent: true,
      opacity: owned ? 0.95 : 0.5,
    }),
  );
  mesh.scale.set(0.32, 0.26, 0.32);
  return { mesh, update: (time: number) => (mesh.rotation.y = -time * 1.2) };
}

/** Point-cloud starfield shell, a native stand-in for drei's Stars. */
export function createStars(radius = 120, depth = 50, count = 2500) {
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const color = new THREE.Color();
  for (let i = 0; i < count; i++) {
    const r = radius + Math.random() * depth;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    positions.set(
      [r * Math.sin(phi) * Math.cos(theta), r * Math.cos(phi), r * Math.sin(phi) * Math.sin(theta)],
      i * 3,
    );
    color.setHSL(0.6 + Math.random() * 0.2, 0.5, 0.75 + Math.random() * 0.25);
    colors.set([color.r, color.g, color.b], i * 3);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return new THREE.Points(
    geometry,
    new THREE.PointsMaterial({ size: 0.9, vertexColors: true, fog: false, depthWrite: false }),
  );
}

// --- Crates ---------------------------------------------------------------

const crateFaces = new Map<string, THREE.CanvasTexture>();

function paintCrate(kind: CrateKind, top: boolean) {
  const key = `${kind}-${top}`;
  const cached = crateFaces.get(key);
  if (cached) return cached;
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const g = canvas.getContext("2d")!;
  const wood =
    kind === "spring"
      ? "#8d96a3"
      : kind === "nitro"
        ? "#39c94a"
        : kind === "tnt"
          ? "#d9822b"
          : "#c98a45";
  const dark =
    kind === "spring"
      ? "#56606d"
      : kind === "nitro"
        ? "#1c6e25"
        : kind === "tnt"
          ? "#8f4a14"
          : "#7a4a1f";
  g.fillStyle = wood;
  g.fillRect(0, 0, size, size);
  // Planks and grain.
  g.strokeStyle = dark;
  g.lineWidth = 3;
  for (let i = 1; i < 4; i++) {
    g.beginPath();
    g.moveTo(0, (i * size) / 4);
    g.lineTo(size, (i * size) / 4);
    g.stroke();
  }
  g.globalAlpha = 0.25;
  for (let i = 0; i < 40; i++) {
    const y = (i * 37) % size;
    g.beginPath();
    g.moveTo(0, y + 2);
    g.bezierCurveTo(size / 3, y - 3, (2 * size) / 3, y + 5, size, y);
    g.stroke();
  }
  g.globalAlpha = 1;
  // Frame: dark border and corner bands (iron on spring crates).
  g.lineWidth = 12;
  g.strokeStyle = kind === "spring" ? "#3a414b" : dark;
  g.strokeRect(6, 6, size - 12, size - 12);
  if (kind === "basic" && !top) {
    g.lineWidth = 9;
    g.beginPath();
    g.moveTo(12, 12);
    g.lineTo(size - 12, size - 12);
    g.stroke();
  }
  g.fillStyle = "#fff6df";
  g.strokeStyle = "#3a2410";
  g.lineWidth = 4;
  g.textAlign = "center";
  g.textBaseline = "middle";
  const label = (text: string, color = "#fff6df", px = 58) => {
    g.font = `900 ${px}px system-ui, sans-serif`;
    g.fillStyle = color;
    g.strokeText(text, size / 2, size / 2 + 4);
    g.fillText(text, size / 2, size / 2 + 4);
  };
  const arrow = () => {
    g.fillStyle = kind === "spring" ? "#e8edf3" : "#ffe08a";
    g.strokeStyle = "#3a2410";
    g.beginPath();
    g.moveTo(size / 2, 18);
    g.lineTo(size - 26, size / 2);
    g.lineTo(size / 2 + 16, size / 2);
    g.lineTo(size / 2 + 16, size - 20);
    g.lineTo(size / 2 - 16, size - 20);
    g.lineTo(size / 2 - 16, size / 2);
    g.lineTo(26, size / 2);
    g.closePath();
    g.fill();
    g.stroke();
  };
  switch (kind) {
    case "bonus":
      label("?", "#ffe08a", 80);
      break;
    case "check":
      label("C", "#9ef0ff", 76);
      break;
    case "tnt":
      label("TNT", "#ffe8c2", 44);
      break;
    case "nitro":
      label("!", "#eaffea", 84);
      break;
    case "aku":
      // A little carved mask: two eyes and feathers.
      g.fillStyle = "#e7b86a";
      g.beginPath();
      g.ellipse(size / 2, size / 2 + 6, 30, 40, 0, 0, Math.PI * 2);
      g.fill();
      g.stroke();
      g.fillStyle = "#2b1a0c";
      g.fillRect(size / 2 - 18, size / 2 - 8, 12, 10);
      g.fillRect(size / 2 + 6, size / 2 - 8, 12, 10);
      g.fillStyle = "#e0463a";
      g.fillRect(size / 2 - 14, size / 2 + 20, 28, 6);
      g.fillStyle = "#4fc26a";
      g.fillRect(size / 2 - 4, size / 2 - 52, 8, 20);
      break;
    case "bounce":
    case "spring":
      if (top) arrow();
      else label(kind === "spring" ? "▲" : "▲", kind === "spring" ? "#e8edf3" : "#ffe08a", 60);
      break;
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  crateFaces.set(key, texture);
  return texture;
}

function crateMaterials(kind: CrateKind) {
  const side = paintCrate(kind, false);
  const top = paintCrate(kind, true);
  const emissive = kind === "nitro" ? "#1d8a2a" : "#000000";
  const make = (map: THREE.Texture) =>
    new THREE.MeshStandardMaterial({
      map,
      roughness: kind === "spring" ? 0.45 : 0.8,
      metalness: kind === "spring" ? 0.6 : 0,
      emissive,
      emissiveIntensity: kind === "nitro" ? 0.6 : 0,
    });
  const sideMaterial = make(side);
  const topMaterial = make(top);
  // Box face order: +x, -x, +y, -y, +z, -z.
  return [sideMaterial, sideMaterial, topMaterial, topMaterial, sideMaterial, sideMaterial];
}

const crateMaterialCache = new Map<CrateKind, THREE.Material[]>();
function crateMaterial(kind: CrateKind) {
  let materials = crateMaterialCache.get(kind);
  if (!materials) {
    materials = crateMaterials(kind);
    crateMaterialCache.set(kind, materials);
  }
  return materials;
}

const crateGeometry = new THREE.BoxGeometry(CRATE_SIZE, CRATE_SIZE, CRATE_SIZE);

/** A crate's look; squash and the TNT blink come from the run state. */
export function createCrate(kind: CrateKind) {
  const materials =
    kind === "tnt" || kind === "nitro"
      ? crateMaterial(kind).map((m) => m.clone())
      : crateMaterial(kind);
  const mesh = new THREE.Mesh(crateGeometry, materials);
  mesh.castShadow = mesh.receiveShadow = true;
  return {
    mesh,
    update(time: number, squash: number, fuse: number) {
      mesh.scale.set(1 + squash * 0.12, 1 - squash * 0.22, 1 + squash * 0.12);
      mesh.position.y = CRATE_SIZE / 2 - (squash * 0.22 * CRATE_SIZE) / 2;
      if (kind === "tnt") {
        const blink = fuse >= 0 ? (Math.sin(time * (20 - fuse * 4)) > 0 ? 1.4 : 0) : 0;
        for (const material of materials as THREE.MeshStandardMaterial[]) {
          material.emissive.set("#ff3a1a");
          material.emissiveIntensity = blink;
        }
      } else if (kind === "nitro") {
        mesh.position.y += Math.max(0, Math.sin(time * 7 + mesh.id)) * 0.05;
        mesh.rotation.z = Math.sin(time * 23 + mesh.id) * 0.03;
      }
    },
    dispose() {
      if (kind === "tnt" || kind === "nitro") materials.forEach((material) => material.dispose());
    },
  };
}

// --- Debris and blasts ----------------------------------------------------

interface Burst {
  x: number;
  y: number;
  z: number;
  age: number;
  color: THREE.Color;
  seed: number;
  blast: boolean;
}

const PLANKS_PER_BURST = 8;
const MAX_BURSTS = 12;
const plankGeometry = new THREE.BoxGeometry(0.34, 0.07, 0.14);
const blastGeometry = new THREE.SphereGeometry(1, 20, 14);
const debrisObject = new THREE.Object3D();

/** Splintered crate planks and explosion flashes, from one shared pool. */
export function createDebris() {
  let bursts: Burst[] = [];
  const pieces = new THREE.InstancedMesh(
    plankGeometry,
    new THREE.MeshStandardMaterial({ roughness: 0.8 }),
    PLANKS_PER_BURST * MAX_BURSTS,
  );
  pieces.frustumCulled = false;
  pieces.castShadow = true;
  pieces.count = 0;
  const flashes = new THREE.InstancedMesh(
    blastGeometry,
    new THREE.MeshBasicMaterial({
      color: new THREE.Color(4, 1.6, 0.4),
      transparent: true,
      opacity: 0.7,
      toneMapped: false,
      depthWrite: false,
    }),
    MAX_BURSTS,
  );
  flashes.frustumCulled = false;
  flashes.count = 0;
  const group = new THREE.Group().add(pieces, flashes);
  return {
    group,
    add(burst: Burst) {
      bursts.push(burst);
      if (bursts.length > MAX_BURSTS) bursts.shift();
    },
    update(delta: number) {
      for (const burst of bursts) burst.age += delta;
      bursts = bursts.filter((burst) => burst.age < 1.1);
      let plank = 0;
      let flash = 0;
      for (const burst of bursts) {
        if (burst.blast) {
          const t = burst.age / 0.6;
          debrisObject.position.set(burst.x, burst.y, burst.z);
          debrisObject.rotation.set(0, 0, 0);
          debrisObject.scale.setScalar(t < 1 ? 0.5 + t * 2.6 : 0);
          debrisObject.updateMatrix();
          flashes.setMatrixAt(flash++, debrisObject.matrix);
        }
        for (let i = 0; i < PLANKS_PER_BURST; i++) {
          const a = burst.seed + i * 2.399;
          const speed = burst.blast ? 7 : 3.4;
          const vx = Math.cos(a) * speed * (0.6 + ((i * 7) % 5) / 10);
          const vz = Math.sin(a) * speed * (0.6 + ((i * 3) % 5) / 10);
          const vy = 4 + ((i * 5) % 4);
          const t = burst.age;
          debrisObject.position.set(
            burst.x + vx * t,
            burst.y + vy * t - 9 * t * t,
            burst.z + vz * t,
          );
          debrisObject.rotation.set(a + t * 9, a * 2 + t * 7, t * 5);
          debrisObject.scale.setScalar(Math.max(0, 1 - t / 1.1));
          debrisObject.updateMatrix();
          pieces.setMatrixAt(plank, debrisObject.matrix);
          pieces.setColorAt(plank++, burst.color);
        }
      }
      pieces.count = plank;
      flashes.count = flash;
      pieces.instanceMatrix.needsUpdate = true;
      if (pieces.instanceColor) pieces.instanceColor.needsUpdate = true;
      flashes.instanceMatrix.needsUpdate = true;
    },
  };
}

export type { Burst };
export function makeBurst(position: Vec3, color: string, blast = false): Burst {
  return {
    x: position[0],
    y: position[1],
    z: position[2],
    age: 0,
    color: new THREE.Color(color),
    seed: Math.random() * Math.PI * 2,
    blast,
  };
}

// --- Fruit ----------------------------------------------------------------

const fruitGeometry = new THREE.SphereGeometry(0.2, 14, 10);
const fruitObject = new THREE.Object3D();

/** Wumpa-style fruit: bobbing, spinning, hidden once taken. */
export function createFruitField(fruit: Vec3[]) {
  const mesh = new THREE.InstancedMesh(
    fruitGeometry,
    new THREE.MeshStandardMaterial({
      color: "#ff8a1c",
      emissive: "#ff5a00",
      emissiveIntensity: 0.35,
      roughness: 0.35,
    }),
    Math.max(1, fruit.length),
  );
  mesh.frustumCulled = false;
  mesh.count = fruit.length;
  return {
    mesh,
    update(time: number, taken: boolean[]) {
      fruit.forEach(([x, y, z], i) => {
        fruitObject.position.set(x, y + Math.sin(time * 2.4 + i * 0.7) * 0.08, z);
        fruitObject.rotation.set(0.3, time * 2 + i, 0);
        fruitObject.scale.set(1, 1.18, 1).multiplyScalar(taken[i] ? 0 : 1);
        fruitObject.updateMatrix();
        mesh.setMatrixAt(i, fruitObject.matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
    },
  };
}

// --- Critters -------------------------------------------------------------

const part = (
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  position: Vec3 = [0, 0, 0],
  rotation: Vec3 = [0, 0, 0],
  scale?: Vec3,
  shadow = false,
) => {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(...position);
  mesh.rotation.set(...rotation);
  if (scale) mesh.scale.set(...scale);
  mesh.castShadow = shadow;
  return mesh;
};
const standard = (
  color: THREE.ColorRepresentation,
  extra: THREE.MeshStandardMaterialParameters = {},
) => new THREE.MeshStandardMaterial({ color, ...extra });

/** One patrolling critter, built from primitives. Faces its heading. */
export function createCritter(kind: EnemyKind, color: string, spiky = false) {
  const skin = standard(color, { roughness: 0.7 });
  const white = standard("#ffffff", { roughness: 0.3 });
  const black = standard("#111111");
  const eye = (x: number, y: number, z: number, r = 0.07) => {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    g.add(
      part(new THREE.SphereGeometry(r, 10, 8), white),
      part(new THREE.SphereGeometry(r * 0.5, 8, 6), black, [0, 0, r * 0.7]),
    );
    return g;
  };
  const g = new THREE.Group();
  switch (kind) {
    case "turtle":
      g.add(
        part(
          new THREE.SphereGeometry(0.55, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2),
          standard(spiky ? "#5b3a2a" : "#2f6b35", { roughness: 0.6 }),
          [0, 0.38, 0],
          undefined,
          [1, 0.62, 1.1],
          true,
        ),
        part(
          new THREE.CylinderGeometry(0.55, 0.55, 0.3, 16),
          standard("#d8c27a", { roughness: 0.8 }),
          [0, 0.3, 0],
          undefined,
          [1.05, 0.25, 1.15],
        ),
        part(
          new THREE.SphereGeometry(0.22, 12, 10),
          skin,
          [0, 0.42, 0.62],
          undefined,
          undefined,
          true,
        ),
        eye(-0.09, 0.5, 0.78),
        eye(0.09, 0.5, 0.78),
      );
      if (spiky)
        for (let i = 0; i < 6; i++)
          g.add(
            part(
              new THREE.ConeGeometry(0.08, 0.3, 6),
              standard("#e8e1d0"),
              [Math.cos(i) * 0.3, 0.72, Math.sin(i) * 0.3],
              [Math.sin(i) * 0.4, 0, -Math.cos(i) * 0.4],
            ),
          );
      for (const sx of [-1, 1])
        for (const sz of [-1, 1])
          g.add(
            part(new THREE.CylinderGeometry(0.09, 0.1, 0.22, 8), skin, [sx * 0.4, 0.1, sz * 0.35]),
          );
      break;
    case "seal":
      g.add(
        part(
          new THREE.CapsuleGeometry(0.36, 0.7, 6, 12),
          skin,
          [0, 0.4, 0],
          [Math.PI / 2 - 0.35, 0, 0],
          undefined,
          true,
        ),
        part(
          new THREE.SphereGeometry(0.28, 14, 10),
          skin,
          [0, 0.78, 0.36],
          undefined,
          undefined,
          true,
        ),
        part(new THREE.SphereGeometry(0.07, 8, 6), standard("#1a1a1a"), [0, 0.72, 0.62]),
        eye(-0.1, 0.86, 0.58, 0.06),
        eye(0.1, 0.86, 0.58, 0.06),
        ...[-1, 1].map((side) =>
          part(
            new THREE.BoxGeometry(0.35, 0.06, 0.2),
            skin,
            [side * 0.38, 0.25, 0.15],
            [0, 0, side * 0.9],
          ),
        ),
      );
      break;
    case "rat":
      g.add(
        part(
          new THREE.SphereGeometry(0.36, 14, 10),
          skin,
          [0, 0.3, 0],
          undefined,
          [0.8, 0.7, 1.3],
          true,
        ),
        part(
          new THREE.ConeGeometry(0.18, 0.4, 10),
          skin,
          [0, 0.36, 0.5],
          [Math.PI / 2, 0, 0],
          undefined,
          true,
        ),
        part(new THREE.SphereGeometry(0.05, 8, 6), standard("#e38a9a"), [0, 0.34, 0.72]),
        ...[-1, 1].map((side) =>
          part(
            new THREE.CircleGeometry(0.11, 12),
            standard("#e3a2ae", { side: THREE.DoubleSide }),
            [side * 0.17, 0.58, 0.32],
          ),
        ),
        eye(-0.09, 0.44, 0.58, 0.05),
        eye(0.09, 0.44, 0.58, 0.05),
        part(
          new THREE.CylinderGeometry(0.02, 0.04, 0.8, 6),
          standard("#e3a2ae"),
          [0, 0.25, -0.75],
          [-1.2, 0, 0],
        ),
      );
      break;
    case "vulture":
    case "monkey": {
      const face = standard("#e8c9a0");
      g.add(
        part(
          new THREE.SphereGeometry(0.32, 14, 10),
          skin,
          [0, 0.45, 0],
          undefined,
          [1, 1.1, 0.9],
          true,
        ),
        part(
          new THREE.SphereGeometry(0.24, 14, 10),
          skin,
          [0, 0.9, 0.05],
          undefined,
          undefined,
          true,
        ),
        part(
          new THREE.SphereGeometry(0.16, 12, 8),
          face,
          [0, 0.86, 0.22],
          undefined,
          [1, 0.8, 0.6],
        ),
        eye(-0.08, 0.95, 0.24, 0.05),
        eye(0.08, 0.95, 0.24, 0.05),
        part(
          new THREE.TorusGeometry(0.22, 0.04, 6, 14, Math.PI * 1.3),
          skin,
          [0, 0.5, -0.4],
          [0.9, 0, 0],
        ),
      );
      for (const side of [-1, 1])
        g.add(
          part(new THREE.SphereGeometry(0.09, 10, 8), face, [side * 0.26, 0.95, 0]),
          part(
            new THREE.CapsuleGeometry(0.07, 0.4, 4, 8),
            skin,
            [side * 0.36, 0.45, 0.05],
            [0, 0, side * 0.5],
          ),
          part(new THREE.CapsuleGeometry(0.08, 0.15, 4, 8), skin, [side * 0.14, 0.1, 0]),
        );
      break;
    }
  }
  return g;
}

// --- The mask that follows you ---------------------------------------------

const maskTarget = new THREE.Vector3();

export function createAkuMask() {
  const group = new THREE.Group();
  group.scale.setScalar(0);
  group.add(
    part(
      new THREE.SphereGeometry(1, 16, 12),
      standard("#d9a55a", { roughness: 0.6, emissive: "#5a3a10", emissiveIntensity: 0.4 }),
      [0, 0, 0],
      undefined,
      [0.3, 0.42, 0.12],
    ),
    ...[-1, 1].map((side) =>
      part(new THREE.BoxGeometry(0.08, 0.05, 0.04), standard("#2b1a0c"), [side * 0.1, 0.06, 0.1]),
    ),
    part(new THREE.BoxGeometry(0.16, 0.04, 0.04), standard("#d8402e"), [0, -0.16, 0.1]),
    ...[-0.12, 0, 0.12].map((x, i) =>
      part(
        new THREE.ConeGeometry(0.06, 0.34, 6),
        standard(["#e0463a", "#4fc26a", "#3a8ee0"][i]),
        [x, 0.5, -0.02],
        [0, 0, -x * 2],
      ),
    ),
    new THREE.PointLight("#ffd28a", 2, 3, 2),
  );
  const smoothed = new THREE.Vector3();
  let primed = false;
  return {
    group,
    update(
      time: number,
      delta: number,
      follow: THREE.Vector3,
      camera: THREE.Camera,
      masks: number,
    ) {
      maskTarget.set(
        follow.x + Math.cos(time * 1.3) * 0.9,
        follow.y + 1.9 + Math.sin(time * 2.1) * 0.15,
        follow.z + Math.sin(time * 1.3) * 0.9,
      );
      if (!primed) smoothed.copy(maskTarget);
      primed = true;
      smoothed.lerp(maskTarget, 1 - Math.exp(-6 * delta));
      group.position.copy(smoothed);
      group.rotation.y = Math.atan2(
        camera.position.x - group.position.x,
        camera.position.z - group.position.z,
      );
      const scale = masks > 0 ? (masks > 1 ? 1.2 : 1) : 0;
      group.scale.setScalar(Math.max(0.0001, THREE.MathUtils.damp(group.scale.x, scale, 8, delta)));
    },
  };
}
