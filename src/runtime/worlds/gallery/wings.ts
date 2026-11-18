import RAPIER from "@dimforge/rapier3d-compat";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import {
  WALL_BOTTOM,
  archiveMaze,
  mirrorMaze,
  type GalleryMaze,
  type GallerySigil,
} from "../../../gameplay/galleryLayout";
import { playSound } from "../../../gameplay/sound";
import { createGalleryMap, createInscription } from "./architecture";

type V3 = [number, number, number];

export const SIGIL_COLORS: Record<GallerySigil, string> = {
  sun: "#f2c14e",
  leaf: "#8fd17a",
  moon: "#a9c4ff",
  star: "#d9c2ff",
  ember: "#ff8a4a",
};
export type ButtonFeedback = "good" | "bad" | "neutral";
const FEEDBACK_COLOR: Record<ButtonFeedback, THREE.Color> = {
  good: new THREE.Color("#ffd98a"),
  bad: new THREE.Color("#ff4a3a"),
  neutral: new THREE.Color("#9fb4d8"),
};
const DECAL = { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 } as const;

/** Per-frame hooks and player-touch triggers registered while building. */
export type GalleryContext = {
  scene: THREE.Object3D;
  world: RAPIER.World;
  animate: ((time: number, delta: number) => void)[];
  /** Axis-aligned trigger boxes (center, half extents) tested against the player's feet. */
  triggers: Trigger[];
  movers: Mover[];
  textures: THREE.TextureLoader;
};
export type Trigger = {
  center: THREE.Vector3;
  half: THREE.Vector3;
  inside: boolean;
  enabled: boolean;
  enter: () => void;
  exit?: () => void;
};
type Mover = {
  body: RAPIER.RigidBody;
  mesh: THREE.Object3D;
  origin: THREE.Vector3;
  axis: "x" | "y" | "z";
  distance: number;
  speed: number;
  spin: number;
};

const std = (params: THREE.MeshStandardMaterialParameters) =>
  new THREE.MeshStandardMaterial(params);
function mesh(
  geometry: THREE.BufferGeometry,
  material: THREE.Material | THREE.Material[],
  position: V3 = [0, 0, 0],
  rotation: V3 = [0, 0, 0],
  shadow: [boolean, boolean] = [false, false],
) {
  const m = new THREE.Mesh(geometry, material);
  m.position.set(...position);
  m.rotation.set(...rotation);
  m.castShadow = shadow[0];
  m.receiveShadow = shadow[1];
  return m;
}
function group(position: V3 = [0, 0, 0], rotation: V3 = [0, 0, 0], ...children: THREE.Object3D[]) {
  const g = new THREE.Group();
  g.position.set(...position);
  g.rotation.set(...rotation);
  if (children.length) g.add(...children);
  return g;
}
/** Fixed cuboid collider in world space for an object-local box. */
function boxCollider(ctx: GalleryContext, parent: THREE.Object3D, half: V3, local: V3 = [0, 0, 0]) {
  parent.updateWorldMatrix(true, false);
  const center = new THREE.Vector3(...local).applyMatrix4(parent.matrixWorld);
  const q = new THREE.Quaternion();
  parent.getWorldQuaternion(q);
  return ctx.world.createCollider(
    RAPIER.ColliderDesc.cuboid(...half)
      .setTranslation(center.x, center.y, center.z)
      .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }),
  );
}
function cylinderCollider(
  ctx: GalleryContext,
  parent: THREE.Object3D,
  halfHeight: number,
  radius: number,
  local: V3 = [0, 0, 0],
) {
  parent.updateWorldMatrix(true, false);
  const center = new THREE.Vector3(...local).applyMatrix4(parent.matrixWorld);
  return ctx.world.createCollider(
    RAPIER.ColliderDesc.cylinder(halfHeight, radius).setTranslation(center.x, center.y, center.z),
  );
}
function trigger(
  ctx: GalleryContext,
  parent: THREE.Object3D,
  half: V3,
  local: V3,
  enter: () => void,
  exit?: () => void,
) {
  parent.updateWorldMatrix(true, false);
  const t: Trigger = {
    center: new THREE.Vector3(...local).applyMatrix4(parent.matrixWorld),
    half: new THREE.Vector3(...half),
    inside: false,
    enabled: true,
    enter,
    exit,
  };
  ctx.triggers.push(t);
  return t;
}

function sigilGeometry(sigil: GallerySigil, scale = 1) {
  switch (sigil) {
    case "sun":
      return new THREE.IcosahedronGeometry(0.5 * scale, 0);
    case "leaf":
      return new THREE.DodecahedronGeometry(0.48 * scale, 0);
    case "moon":
      return new THREE.TorusGeometry(0.36 * scale, 0.13 * scale, 10, 28, Math.PI * 1.45);
    case "star":
      return new THREE.OctahedronGeometry(0.56 * scale, 0);
    case "ember":
      return new THREE.TetrahedronGeometry(0.6 * scale, 0);
  }
}

/** Glowing sigil. `setLit(0)` shows a dim ghost of the shape. */
export function createSigilGem(ctx: GalleryContext, sigil: GallerySigil, lit = 1, scale = 1) {
  const material = std({
    color: SIGIL_COLORS[sigil],
    emissive: SIGIL_COLORS[sigil],
    roughness: 0.3,
    metalness: 0.2,
    transparent: true,
  });
  const gem = mesh(sigilGeometry(sigil, scale), material);
  let level = lit;
  const setLit = (next: number) => {
    level = next;
    material.emissiveIntensity = 0.15 + next * 2.2;
    material.depthWrite = next > 0;
    material.opacity = next === 0 ? 0.35 : 1;
    gem.castShadow = next > 0;
  };
  setLit(lit);
  ctx.animate.push((t) => {
    gem.rotation.y = t * 0.9;
    gem.position.y = Math.sin(t * 1.7) * 0.12 * level;
  });
  return { mesh: gem, setLit };
}

/** Twinkling motes in a box, a native stand-in for drei's Sparkles. */
function sparkles(
  ctx: GalleryContext,
  position: V3,
  count: number,
  scale: V3,
  size: number,
  speed: number,
  color: string,
) {
  const positions = new Float32Array(count * 3);
  const phases: number[] = [];
  for (let i = 0; i < count; i++) {
    positions.set(
      [
        (Math.random() - 0.5) * scale[0],
        (Math.random() - 0.5) * scale[1],
        (Math.random() - 0.5) * scale[2],
      ],
      i * 3,
    );
    phases.push(Math.random() * Math.PI * 2);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const base = positions.slice();
  const material = new THREE.PointsMaterial({
    color,
    size: size * 0.03,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  const points = new THREE.Points(geometry, material);
  points.position.set(...position);
  ctx.scene.add(points);
  ctx.animate.push((t) => {
    for (let i = 0; i < count; i++)
      positions[i * 3 + 1] = base[i * 3 + 1] + Math.sin(t * speed * 3 + phases[i]) * 0.3;
    geometry.getAttribute("position").needsUpdate = true;
    material.opacity = 0.6 + Math.sin(t * 2) * 0.2;
  });
}

/** A floor button the player stands on; the cap sinks and flashes the result. */
export function createPressureButton(
  ctx: GalleryContext,
  parent: THREE.Object3D,
  color: string,
  onPress: () => ButtonFeedback | void,
  { radius = 0.75, lit = 0, subtle = false } = {},
) {
  const root = new THREE.Group();
  parent.add(root);
  const housingTop = subtle ? 0 : 0.16;
  const travel = subtle ? 0.05 : 0.11;
  const capHeight = subtle ? 0.06 : 0.2;
  const raisedY = housingTop + travel - capHeight / 2 + (subtle ? 0.005 : 0.01);
  if (!subtle) {
    root.add(
      mesh(
        new THREE.CylinderGeometry(radius + 0.26, radius + 0.34, housingTop, 32),
        std({ color: "#3a3530", roughness: 0.75 }),
        [0, housingTop / 2, 0],
        undefined,
        [true, true],
      ),
      mesh(
        new THREE.TorusGeometry(radius + 0.1, 0.055, 8, 40),
        std({ color: "#c9a45c", metalness: 0.75, roughness: 0.3 }),
        [0, housingTop, 0],
        [Math.PI / 2, 0, 0],
      ),
    );
    cylinderCollider(ctx, root, housingTop / 2, radius + 0.3, [0, housingTop / 2, 0]);
  }
  const material = std({ color, emissive: color, roughness: 0.45 });
  const cap = group(
    [0, raisedY, 0],
    undefined,
    mesh(
      subtle
        ? new THREE.BoxGeometry(radius * 1.6, capHeight, radius * 1.6)
        : new THREE.CylinderGeometry(radius - 0.07, radius, capHeight, 32),
      material,
      undefined,
      undefined,
      [!subtle, true],
    ),
    mesh(
      new THREE.RingGeometry(radius * 0.42, radius * 0.5, 32),
      new THREE.MeshBasicMaterial({ color: subtle ? "#35425f" : "#fff3d6", ...DECAL }),
      [0, capHeight / 2 + 0.004, 0],
      [-Math.PI / 2, 0, 0],
    ),
  );
  root.add(cap);
  const base = new THREE.Color(color);
  let contacts = 0;
  let flash = 0;
  let flashColor = FEEDBACK_COLOR.neutral;
  let glow = lit;
  trigger(
    ctx,
    root,
    [radius * 0.8, 0.35, radius * 0.8],
    [0, housingTop + 0.3, 0],
    () => {
      contacts = 1;
      playSound("press");
      flashColor = FEEDBACK_COLOR[onPress() ?? "neutral"];
      flash = 1;
    },
    () => (contacts = 0),
  );
  ctx.animate.push((_, rawDelta) => {
    const delta = Math.min(rawDelta, 0.05);
    const target = contacts > 0 ? raisedY - travel : raisedY;
    cap.position.y += (target - cap.position.y) * (1 - Math.exp(-22 * delta));
    flash = Math.max(0, flash - delta * 1.6);
    material.emissive.copy(base).lerp(flashColor, Math.min(1, flash * 1.5));
    material.emissiveIntensity = (subtle ? 0.02 : 0.08 + glow * 0.8) + flash * 2.4;
  });
  return { root, setLit: (next: number) => (glow = next) };
}

function sigilPickup(
  ctx: GalleryContext,
  sigil: GallerySigil,
  position: V3,
  found: readonly GallerySigil[],
  onFind: (s: GallerySigil) => void,
) {
  if (found.includes(sigil)) return;
  const root = group(position);
  ctx.scene.add(root);
  const gem = createSigilGem(ctx, sigil);
  root.add(gem.mesh);
  sparkles(ctx, position, 14, [1.6, 1.8, 1.6], 3, 0.4, SIGIL_COLORS[sigil]);
  const t = trigger(ctx, root, [0.75, 0.9, 0.75], [0, 0, 0], () => {
    t.enabled = false;
    root.removeFromParent();
    onFind(sigil);
  });
}

function solid(
  ctx: GalleryContext,
  parent: THREE.Object3D,
  position: V3,
  size: V3,
  color: string,
  metalness = 0,
  roughness = 0.8,
) {
  const root = group(position);
  root.add(
    mesh(
      new THREE.BoxGeometry(...size),
      std({ color, metalness, roughness }),
      undefined,
      undefined,
      [true, true],
    ),
  );
  parent.add(root);
  boxCollider(ctx, root, [size[0] / 2, size[1] / 2, size[2] / 2]);
  return root;
}

function ledge(
  ctx: GalleryContext,
  x: number,
  z: number,
  top: number,
  size: [number, number],
  color: string,
  pillar = false,
  thickness = 0.45,
) {
  const bottom = pillar ? WALL_BOTTOM : top - thickness;
  const root = solid(
    ctx,
    ctx.scene,
    [x, (top + bottom) / 2, z],
    [size[0], top - bottom, size[1]],
    color,
  );
  root.add(
    mesh(
      new THREE.PlaneGeometry(size[0] - 0.12, size[1] - 0.12),
      std({ color: new THREE.Color(color).multiplyScalar(1.35), roughness: 0.7, ...DECAL }),
      [0, (top - bottom) / 2 + 0.015, 0],
      [-Math.PI / 2, 0, 0],
      [false, true],
    ),
  );
}

function painting(
  ctx: GalleryContext,
  parent: THREE.Object3D,
  image: string,
  position: V3,
  rotation: V3 = [0, 0, 0],
  width = 2.6,
  height = 3.2,
) {
  const texture = ctx.textures.load(image);
  texture.colorSpace = THREE.SRGBColorSpace;
  parent.add(
    group(
      position,
      rotation,
      mesh(
        new THREE.BoxGeometry(width + 0.5, height + 0.5, 0.16),
        std({ color: "#2d2016", roughness: 0.6 }),
        undefined,
        undefined,
        [true, false],
      ),
      mesh(
        new THREE.BoxGeometry(width + 0.18, height + 0.18, 0.1),
        std({ color: "#b8935a", metalness: 0.65, roughness: 0.35 }),
        [0, 0, 0.06],
      ),
      mesh(
        new THREE.PlaneGeometry(width, height),
        new THREE.MeshBasicMaterial({ map: texture, toneMapped: false }),
        [0, 0, 0.125],
      ),
      mesh(
        new THREE.BoxGeometry(0.7, 0.18, 0.04),
        std({ color: "#c9a45c", metalness: 0.7, roughness: 0.3 }),
        [0, -height / 2 - 0.55, 0.05],
      ),
    ),
  );
}

function lectern(ctx: GalleryContext, position: V3, text: string, yaw = 0) {
  const root = group(position, [0, yaw, 0]);
  ctx.scene.add(root);
  boxCollider(ctx, root, [0.35, 0.6, 0.35], [0, 0.6, 0]);
  root.add(
    mesh(
      new THREE.CylinderGeometry(0.16, 0.3, 1.2, 8),
      std({ color: "#5a4330", roughness: 0.6 }),
      [0, 0.6, 0],
      undefined,
      [true, false],
    ),
    group(
      [0, 1.42, 0.05],
      [-0.55, 0, 0],
      mesh(
        new THREE.BoxGeometry(1.7, 1.05, 0.07),
        std({ color: "#3d2c1c", roughness: 0.6 }),
        [0, 0, -0.04],
        undefined,
        [true, false],
      ),
      createInscription(text, [0, 0, 0.012], undefined, 1.55),
    ),
  );
}

function column(ctx: GalleryContext, position: V3, height = 9, color = "#b8ae98") {
  const root = group(position);
  ctx.scene.add(root);
  cylinderCollider(ctx, root, height / 2, 0.55, [0, height / 2, 0]);
  root.add(
    mesh(
      new THREE.CylinderGeometry(0.42, 0.48, height, 16),
      std({ color, roughness: 0.55 }),
      [0, height / 2, 0],
      undefined,
      [true, true],
    ),
  );
  for (const y of [0.2, height - 0.25])
    root.add(
      mesh(
        new THREE.BoxGeometry(1.15, 0.45, 1.15),
        std({ color: "#8f846c", roughness: 0.6 }),
        [0, y, 0],
        undefined,
        [true, true],
      ),
    );
}

function rug(
  ctx: GalleryContext,
  position: V3,
  size: [number, number],
  color: string,
  border = "#c9a45c",
) {
  ctx.scene.add(
    group(
      position,
      undefined,
      mesh(
        new THREE.PlaneGeometry(...size),
        std({ color: border, roughness: 1, ...DECAL }),
        [0, 0.015, 0],
        [-Math.PI / 2, 0, 0],
        [false, true],
      ),
      mesh(
        new THREE.PlaneGeometry(size[0] - 0.35, size[1] - 0.35),
        std({ color, roughness: 1, ...DECAL }),
        [0, 0.03, 0],
        [-Math.PI / 2, 0, 0],
        [false, true],
      ),
    ),
  );
}

function bust(ctx: GalleryContext, position: V3, yaw = 0, color = "#d9d2c3") {
  const root = group(position, [0, yaw, 0]);
  ctx.scene.add(root);
  solid(ctx, root, [0, 0.65, 0], [0.9, 1.3, 0.9], "#5b5347");
  root.add(
    mesh(
      new THREE.CylinderGeometry(0.2, 0.45, 0.62, 12),
      std({ color, roughness: 0.45 }),
      [0, 1.62, 0],
      undefined,
      [true, false],
    ),
    mesh(
      new THREE.SphereGeometry(0.3, 16, 12),
      std({ color, roughness: 0.45 }),
      [0, 2.12, 0],
      undefined,
      [true, false],
    ),
  );
}

function brazier(ctx: GalleryContext, position: V3, color = "#ff8a3a") {
  const root = group(position);
  ctx.scene.add(root);
  solid(ctx, root, [0, 0.45, 0], [0.5, 0.9, 0.5], "#2b2522", 0.5);
  const flame = mesh(
    new THREE.ConeGeometry(0.3, 0.8, 8),
    new THREE.MeshBasicMaterial({
      color: new THREE.Color(color).multiplyScalar(3),
      toneMapped: false,
    }),
    [0, 1.45, 0],
  );
  root.add(
    mesh(
      new THREE.CylinderGeometry(0.5, 0.3, 0.3, 10),
      std({ color: "#3a302a", metalness: 0.6, roughness: 0.4 }),
      [0, 1.02, 0],
      undefined,
      [true, false],
    ),
    flame,
  );
  ctx.animate.push((time) => {
    const t = time * 9 + position[0];
    flame.scale.set(1, 0.85 + Math.sin(t) * 0.12 + Math.sin(t * 2.3) * 0.08, 1);
  });
}

function platform(
  ctx: GalleryContext,
  position: V3,
  {
    axis = "x",
    distance = 0,
    speed = 1,
    spin = 0,
    shape = "box",
    radius = 4,
    size = [3.2, 0.35, 2.6],
    color = "#3b6fe0",
  }: {
    axis?: "x" | "y" | "z";
    distance?: number;
    speed?: number;
    spin?: number;
    shape?: "box" | "cylinder";
    radius?: number;
    size?: V3;
    color?: string;
  },
) {
  const body = ctx.world.createRigidBody(
    RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(...position),
  );
  const geometry =
    shape === "cylinder"
      ? new THREE.CylinderGeometry(radius, radius, size[1], 32)
      : new THREE.BoxGeometry(...size);
  ctx.world.createCollider(
    (shape === "cylinder"
      ? RAPIER.ColliderDesc.cylinder(size[1] / 2, radius)
      : RAPIER.ColliderDesc.cuboid(size[0] / 2, size[1] / 2, size[2] / 2)
    ).setFriction(1),
    body,
  );
  const m = mesh(geometry, std({ color, roughness: 0.6 }), position, undefined, [true, true]);
  ctx.scene.add(m);
  ctx.movers.push({
    body,
    mesh: m,
    origin: new THREE.Vector3(...position),
    axis,
    distance,
    speed,
    spin,
  });
}

const trees = new Map<string, Promise<THREE.Group>>();
function tree(ctx: GalleryContext, variant: string, position: V3, scale: number) {
  const holder = group(position);
  holder.scale.setScalar(scale);
  ctx.scene.add(holder);
  let load = trees.get(variant);
  if (!load) {
    load = new GLTFLoader()
      .loadAsync(`/assets/trees/tree-${variant}.glb`)
      .then(({ scene }) => scene);
    trees.set(variant, load);
  }
  void load
    .then((model) => {
      const copy = model.clone(true);
      copy.traverse((o) => {
        if (o instanceof THREE.Mesh) o.castShadow = o.receiveShadow = true;
      });
      holder.add(copy);
    })
    .catch((error: unknown) => console.warn("Could not load tree", error));
}

function bookTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#3a2616";
  ctx.fillRect(0, 0, 512, 512);
  const palette = [
    "#7a2e2a",
    "#2f4f6b",
    "#6b5a2a",
    "#2f5a3a",
    "#5a2f5a",
    "#8a6a3a",
    "#3a3a3a",
    "#9a4a2a",
  ];
  let seed = 7;
  const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let shelf = 0; shelf < 4; shelf++) {
    const y0 = shelf * 128;
    ctx.fillStyle = "#24170d";
    ctx.fillRect(0, y0 + 116, 512, 12);
    let x = 4;
    while (x < 506) {
      const w = 10 + random() * 18;
      const h = 70 + random() * 40;
      ctx.fillStyle = palette[Math.floor(random() * palette.length)];
      ctx.fillRect(x, y0 + 116 - h, w - 2, h);
      ctx.fillStyle = "rgba(230,200,140,0.5)";
      ctx.fillRect(x + 2, y0 + 116 - h + 12, w - 6, 3);
      x += w;
    }
  }
  const result = new THREE.CanvasTexture(canvas);
  result.colorSpace = THREE.SRGBColorSpace;
  result.wrapS = THREE.RepeatWrapping;
  result.repeat.set(2, 1);
  result.anisotropy = 4;
  return result;
}

function mazeWalls(
  ctx: GalleryContext,
  maze: GalleryMaze,
  height: number,
  thickness: number,
  materials: THREE.Material[],
) {
  for (const { from, to } of maze.segments) {
    const alongX = from[1] === to[1];
    const length = Math.hypot(to[0] - from[0], to[1] - from[1]) + thickness;
    const root = group(
      [(from[0] + to[0]) / 2, height / 2, (from[1] + to[1]) / 2],
      [0, alongX ? 0 : Math.PI / 2, 0],
    );
    root.add(
      mesh(new THREE.BoxGeometry(length, height, thickness), materials, undefined, undefined, [
        true,
        true,
      ]),
    );
    ctx.scene.add(root);
    boxCollider(ctx, root, [length / 2, height / 2, thickness / 2]);
  }
}

function inscription(
  ctx: GalleryContext,
  text: string,
  position: V3,
  rotation?: V3,
  width?: number,
) {
  const m = createInscription(text, position, rotation, width);
  ctx.scene.add(m);
  return m;
}

function publicRooms(ctx: GalleryContext) {
  rug(ctx, [0, 0, 18], [3.4, 17.4], "#5a1c26");
  for (const x of [-6, 6]) for (const z of [12.5, 23.5]) column(ctx, [x, 0, z]);
  const s = ctx.scene;
  painting(ctx, s, "/assets/oilpainting.jpg", [-5, 3.4, 26.6], [0, Math.PI, 0]);
  painting(ctx, s, "/assets/tree.jpg", [0, 3.6, 26.6], [0, Math.PI, 0], 3.2, 4);
  painting(ctx, s, "/assets/hands.jpg", [5, 3.4, 26.6], [0, Math.PI, 0]);
  painting(ctx, s, "/assets/sweesh.jpg", [8.6, 3.4, 12], [0, -Math.PI / 2, 0]);
  painting(ctx, s, "/assets/mankey.jpg", [8.6, 3.4, 24], [0, -Math.PI / 2, 0]);
  painting(ctx, s, "/assets/plaster.jpg", [-8.6, 3.4, 12], [0, Math.PI / 2, 0]);
  const gold = std({ color: "#b8935a", metalness: 0.65, roughness: 0.35 });
  s.add(
    group(
      [-8.62, 2.1, 24],
      [0, Math.PI / 2, 0],
      mesh(new THREE.BoxGeometry(0.24, 3.9, 0.16), gold, [-1.3, 0, 0]),
      mesh(new THREE.BoxGeometry(0.24, 3.9, 0.16), gold, [1.3, 0, 0]),
      mesh(new THREE.BoxGeometry(2.84, 0.24, 0.16), gold, [0, 1.95, 0]),
      createInscription("The open door\n(on loan)", [0, 2.75, 0.05], undefined, 1.4),
    ),
  );
  inscription(
    ctx,
    "The keeper's testament\nFive sigils were scattered through the collection.\nBring them home to the hall of sigils,\nthen walk the keeper's journey on its plates.\nSix verses remember the way.\nOne wrong step and the journey starts again.",
    [-5, 3.6, 9.4],
    undefined,
    5.2,
  );
  s.add(createGalleryMap([5, 3.6, 9.4], undefined, 4.4));
  lectern(ctx, [3.2, 0, 19.5], "Verse I\nThe journey began\nbeneath the star.");
  for (const side of [-1, 1])
    solid(ctx, s, [side * 7.6, 0.25, 18 + side * 5.5], [1, 0.5, 3.2], "#4a3322");

  rug(ctx, [0, 0, 3], [2.4, 11.4], "#1f3b37");
  painting(ctx, s, "/assets/pocket_monsters.jpg", [2.6, 3.4, 6], [0, -Math.PI / 2, 0]);
  painting(ctx, s, "/assets/fieldhouse.jpg", [2.6, 3.4, 0], [0, -Math.PI / 2, 0]);
  painting(ctx, s, "/assets/text.jpg", [-2.6, 3.4, 6], [0, Math.PI / 2, 0]);
  painting(ctx, s, "/assets/sweesh.jpg", [-2.6, 3.4, 0], [0, Math.PI / 2, 0]);

  rug(ctx, [-15, 0, -12], [11.4, 2.4], "#5a3a1c");
  for (const x of [-18, -12])
    for (const z of [-13.9, -10.1]) bust(ctx, [x, 0, z], z < -12 ? 0 : Math.PI);
  inscription(
    ctx,
    "The sun archive\nThe sun sleeps in the deepest stacks.\nThe far shelves breathe a draught.",
    [-15, 4.4, -14.6],
    undefined,
    4.6,
  );

  rug(ctx, [15, 0, -12], [11.4, 2.4], "#26324f");
  const mirror = std({ color: "#aebfd8", metalness: 0.9, roughness: 0.08, emissive: "#1c2840" });
  for (const x of [12, 18])
    for (const z of [-14.62, -9.38])
      s.add(
        mesh(new THREE.PlaneGeometry(1.8, 3.8), mirror, [x, 2.4, z], [0, z < -12 ? 0 : Math.PI, 0]),
      );
  inscription(
    ctx,
    "The moon chamber\nMirrors lie; count your turns.\nOne stone of its floor is not a stone.",
    [15, 5.6, -14.6],
    undefined,
    4.6,
  );

  inscription(
    ctx,
    "The observatory\nThe star waits atop the orrery.\nA fall costs only time.",
    [32.6, 3.6, -33],
    [0, -Math.PI / 2, 0],
    4.4,
  );
  [-36.5, -33, -29.5].forEach((z, i) =>
    solid(ctx, s, [27.9, 0.2 + i * 0.2, z], [1.2, 0.4 + i * 0.4, 2], "#2e3456"),
  );
  inscription(
    ctx,
    "The suspended garden\nThe leaf rests beyond the drop.\nThe garden remembers your last step.",
    [12, 3.8, 15.4],
    undefined,
    4.4,
  );
  inscription(
    ctx,
    "The ember crypt\nWalk softly above the embers.\nIts last flame guards a quiet room.",
    [-12, 3.8, 15.4],
    undefined,
    4.4,
  );

  rug(ctx, [0, 0, -30], [2.6, 17.4], "#6b4f1f");
  painting(ctx, s, "/assets/oilpainting.jpg", [2.6, 3.4, -27], [0, -Math.PI / 2, 0]);
  painting(ctx, s, "/assets/hands.jpg", [-2.6, 3.4, -33], [0, Math.PI / 2, 0]);
}

function sunArchive(
  ctx: GalleryContext,
  found: readonly GallerySigil[],
  onFind: (s: GallerySigil) => void,
) {
  const wood = std({ color: "#4a301c", roughness: 0.7 });
  const spines = std({ map: bookTexture(), roughness: 0.85 });
  mazeWalls(ctx, archiveMaze, 3.6, 0.7, [wood, wood, wood, wood, spines, spines]);
  const [vx, vz] = archiveMaze.deadEnds[0];
  const [sx, sz] = archiveMaze.deepest;
  sigilPickup(ctx, "sun", [sx, 1.3, sz], found, onFind);
  lectern(ctx, [vx, 0, vz], "Verse II\nSecond, the keeper\nclimbed toward the sun.");
  sparkles(ctx, [-33, 3, -15], 60, [24, 5, 24], 2, 0.15, "#ffd89a");
}

function moonChamber(
  ctx: GalleryContext,
  found: readonly GallerySigil[],
  onFind: (s: GallerySigil) => void,
  onSecretPlate: () => void,
) {
  const frame = std({ color: "#2b3350", metalness: 0.7, roughness: 0.35 });
  const glass = std({
    color: "#b9c9e6",
    metalness: 0.95,
    roughness: 0.06,
    emissive: "#1a2748",
    emissiveIntensity: 0.9,
  });
  mazeWalls(ctx, mirrorMaze, 4.4, 0.35, [frame, frame, frame, frame, glass, glass]);
  const [mx, mz] = mirrorMaze.deepest;
  const [px, pz] = mirrorMaze.deadEnds[0];
  const [vx, vz] = mirrorMaze.deadEnds[1];
  sigilPickup(ctx, "moon", [mx, 1.3, mz], found, onFind);
  lectern(ctx, [vx, 0, vz], "Verse III\nThird, the leaf\nof the hanging garden.");
  const plate = group([px, 0, pz]);
  ctx.scene.add(plate);
  createPressureButton(ctx, plate, "#2a3244", onSecretPlate, { subtle: true });
  sparkles(ctx, [33, 2.5, -15], 70, [24, 4, 24], 2.5, 0.2, "#bcd0ff");
}

function suspendedGarden(
  ctx: GalleryContext,
  found: readonly GallerySigil[],
  onFind: (s: GallerySigil) => void,
) {
  const moss = "#4e6b3f";
  ledge(ctx, 16.75, 18, 0, [3.5, 5], moss, true);
  ledge(ctx, 19.2, 21.9, 0.4, [2, 2], moss, true);
  ledge(ctx, 22.4, 24, 0.9, [2, 2], moss, true);
  ledge(ctx, 27, 24, 1.2, [5, 0.75], "#6b5a3a", false, 0.3);
  platform(ctx, [32, 1.1, 22], {
    axis: "z",
    distance: 2.2,
    speed: 0.9,
    size: [2.2, 0.35, 2.2],
    color: "#5d7a4a",
  });
  ledge(ctx, 35.5, 18.5, 2, [2, 2], moss, true);
  platform(ctx, [36, 2.05, 14], {
    shape: "cylinder",
    radius: 1.5,
    size: [3, 0.3, 3],
    spin: 0.9,
    color: "#6f8f55",
  });
  ledge(ctx, 33.2, 10.4, 2.7, [1.6, 1.6], moss, true);
  ledge(ctx, 36.3, 5.6, 2.2, [4.4, 4.4], moss, true);
  tree(ctx, "spreading", [37.6, 2.2, 7.2], 0.7);
  tree(ctx, "round", [16.2, 0, 16.2], 0.55);
  sigilPickup(ctx, "leaf", [35.2, 3.4, 4.6], found, onFind);
  lectern(ctx, [37.4, 2.2, 4.3], "Verse IV\nFourth, the ember\nthat sleeps below.", Math.PI / 4);
  const vine = std({ color: "#3f6b35" });
  [18, 24, 30, 36].forEach((x, i) =>
    ctx.scene.add(
      mesh(new THREE.CylinderGeometry(0.06, 0.06, 7 + (i % 2) * 3, 5), vine, [
        x,
        5.5 - (i % 2) * 1.5,
        26.4,
      ]),
    ),
  );
  sparkles(ctx, [27, 1, 15], 90, [24, 8, 24], 4, 0.3, "#d6ff9a");
}

function emberCrypt(
  ctx: GalleryContext,
  found: readonly GallerySigil[],
  onFind: (s: GallerySigil) => void,
) {
  const stone = "#4a3530";
  ledge(ctx, -16.75, 18, 0, [3.5, 5], stone, true);
  ledge(ctx, -21.25, 18, 0, [5.5, 0.7], "#3a2a26", false, 0.3);
  platform(ctx, [-26.2, 0, 18], {
    axis: "y",
    distance: 1.2,
    speed: 1,
    size: [2.2, 0.35, 2.2],
    color: "#5a3a30",
  });
  ledge(ctx, -29.5, 18, 0.6, [1.8, 1.8], stone, true);
  platform(ctx, [-29.5, 0.45, 13.5], {
    axis: "z",
    distance: 1.8,
    speed: 1.2,
    size: [2.2, 0.35, 2.2],
    color: "#5a3a30",
  });
  platform(ctx, [-29.5, 0.45, 7.6], {
    shape: "cylinder",
    radius: 1.6,
    size: [3.2, 0.3, 3.2],
    spin: -1.2,
    color: "#6a3a2a",
  });
  ledge(ctx, -36.2, 6, 0, [5.3, 5], stone, true);
  solid(ctx, ctx.scene, [-35, 0.5, 4.3], [0.9, 1, 0.9], "#3a2a26");
  sigilPickup(ctx, "ember", [-35, 1.9, 4.3], found, onFind);
  brazier(ctx, [-17.8, 0, 15.8]);
  brazier(ctx, [-17.8, 0, 20.2]);
  brazier(ctx, [-29.5, 0.6, 18]);
  brazier(ctx, [-38, 0, 8.2], "#ffb04a");
  sparkles(ctx, [-27, -3, 15], 120, [24, 12, 24], 5, 0.7, "#ff9a4a");
}

function observatory(
  ctx: GalleryContext,
  found: readonly GallerySigil[],
  onFind: (s: GallerySigil) => void,
) {
  const slab = "#3d4470";
  ledge(ctx, 35.8, -42.8, 1.1, [2.4, 2.4], slab);
  ledge(ctx, 37, -46.4, 2.2, [2.2, 2.2], slab);
  ledge(ctx, 37, -50, 3.3, [2.2, 2.2], slab);
  platform(ctx, [33.8, 4.1, -53.5], {
    axis: "x",
    distance: 1.4,
    speed: 0.9,
    size: [2.4, 0.35, 2.4],
    color: "#5a64a0",
  });
  ledge(ctx, 29.5, -54.4, 4.9, [2.2, 2.2], slab);
  ledge(ctx, 25.6, -53.2, 5.7, [2, 2], slab);
  platform(ctx, [24.2, 6.1, -49.5], {
    axis: "z",
    distance: 1.3,
    speed: 1,
    size: [2, 0.35, 2],
    color: "#5a64a0",
  });
  ledge(ctx, 26.9, -47, 6.8, [1.6, 1.6], slab);
  const tower = group([30, 0, -48]);
  ctx.scene.add(tower);
  cylinderCollider(ctx, tower, 3.6, 1.8, [0, 3.6, 0]);
  tower.add(
    mesh(
      new THREE.CylinderGeometry(1.8, 2.3, 7.2, 24),
      std({ color: "#2b3158", roughness: 0.5, metalness: 0.3 }),
      [0, 3.6, 0],
      undefined,
      [true, true],
    ),
    mesh(
      new THREE.CylinderGeometry(1.95, 1.95, 0.12, 24),
      std({ color: "#b8935a", metalness: 0.7, roughness: 0.3 }),
      [0, 7.25, 0],
    ),
  );
  sigilPickup(ctx, "star", [30, 8.3, -48], found, onFind);
  const orrery = group([30, 10.5, -48]);
  [4.5, 6.5, 8].forEach((radius, i) => {
    const color = ["#9ab8ff", "#ffb07a", "#c8a0ff"][i];
    orrery.add(
      group(
        [0, 0, 0],
        [0.25 * (i - 1), 0, 0.18 * i],
        mesh(
          new THREE.TorusGeometry(radius, 0.07, 6, 64),
          std({ color: "#b8935a", metalness: 0.8, roughness: 0.3 }),
          undefined,
          [Math.PI / 2, 0, 0],
        ),
        mesh(
          new THREE.SphereGeometry(0.35 + i * 0.12, 16, 12),
          std({ color, emissive: color, emissiveIntensity: 1.4 }),
          [radius, 0, 0],
        ),
      ),
    );
  });
  ctx.scene.add(orrery);
  ctx.animate.push((_, delta) =>
    orrery.children.forEach(
      (ring, i) => (ring.rotation.y += delta * (0.12 + i * 0.07) * (i % 2 ? -1 : 1)),
    ),
  );
  sparkles(ctx, [30, 5, -48], 120, [18, 10, 18], 3, 0.1, "#d9d0ff");
}

function secretRooms(ctx: GalleryContext) {
  const s = ctx.scene;
  rug(ctx, [-39, 0, -33], [8, 8], "#2f3f2c");
  const easel = group([-42, 0, -36], [0, 0.5, 0]);
  for (const side of [-1, 1])
    easel.add(
      mesh(
        new THREE.BoxGeometry(0.1, 2.8, 0.1),
        std({ color: "#6b4a2a" }),
        [side * 0.6, 1.3, 0],
        [0.12, 0, side * -0.18],
        [true, false],
      ),
    );
  painting(ctx, easel, "/assets/oilpainting.jpg", [0, 2, 0.15], [-0.12, 0, 0], 1.6, 1.9);
  s.add(easel);
  solid(ctx, s, [-36, 0.45, -37.5], [3, 0.9, 1.4], "#4a3322");
  lectern(ctx, [-38.5, 0, -32], "Verse V\nFifth, the cold light\nof the moon.");
  tree(ctx, "conical", [48, 0, -24.5], 0.7);
  tree(ctx, "oval", [48, 0, -11.5], 0.7);
  lectern(ctx, [48.5, 0, -18], "Verse VI\nAt last the keeper\nreturned to the sun.", -Math.PI / 2);
  sparkles(ctx, [48, 3, -18], 50, [5, 6, 16], 3, 0.2, "#c8f0ff");
  inscription(
    ctx,
    "Collector's note\nThree rooms were struck from the map:\none behind the archive's farthest shelves,\none past the crypt's last flame,\none a hidden stone in the moon maze opens.",
    [-14.6, 3.4, 24],
    [0, Math.PI / 2, 0],
    4.8,
  );
  const chest = solid(ctx, s, [-12, 0.4, 26], [1.6, 0.8, 0.9], "#6b4a2a");
  chest.add(
    mesh(
      new THREE.BoxGeometry(1.64, 0.1, 0.94),
      std({ color: "#c9a45c", metalness: 0.7, roughness: 0.3 }),
      [0, 0.45, 0],
    ),
  );
  inscription(
    ctx,
    "The keeper's ledger\nSix verses tell the journey. They rest in\nthe entrance hall, the sun archive,\nthe moon chamber, the suspended garden,\nthe painter's study and the mirror conservatory.",
    [-44.6, 3.4, 9],
    [0, Math.PI / 2, 0],
    5,
  );
  for (const z of [4.5, 13.5]) brazier(ctx, [-42, 0, z], "#ffc06a");
}

function vault(ctx: GalleryContext, open: boolean) {
  rug(ctx, [0, 0, -51], [4, 22], "#6b1f2a");
  for (const x of [-6, 6]) for (const z of [-44, -52, -58]) column(ctx, [x, 0, z], 9, "#d4c49a");
  const gems = (["star", "sun", "leaf", "ember", "moon"] as const).map((sigil, i) => {
    const root = group([i % 2 ? 8 : -8, 0, -42 - i * 4]);
    ctx.scene.add(root);
    solid(ctx, root, [0, 0.7, 0], [1, 1.4, 1], "#8a7a55");
    const gem = createSigilGem(ctx, sigil, open ? 1 : 0, 1.1);
    root.add(group([0, 2.2, 0], undefined, gem.mesh));
    return gem;
  });
  inscription(
    ctx,
    "The collection remembers.\nEvery journey leaves a trace.\nStep through: the forest is yours again.",
    [-6.2, 3.6, -62.6],
    undefined,
    4.6,
  );
  painting(ctx, ctx.scene, "/assets/pocket_monsters.jpg", [6.2, 3.6, -62.6], undefined, 2.4, 3);
  return (lit: boolean) => gems.forEach((gem) => gem.setLit(lit ? 1 : 0));
}

/** Builds every wing. Returns the vault's light-up switch. */
export function createGalleryWings(
  ctx: GalleryContext,
  found: readonly GallerySigil[],
  solved: boolean,
  onFind: (sigil: GallerySigil) => void,
  onSecretPlate: () => void,
) {
  publicRooms(ctx);
  sunArchive(ctx, found, onFind);
  moonChamber(ctx, found, onFind, onSecretPlate);
  suspendedGarden(ctx, found, onFind);
  emberCrypt(ctx, found, onFind);
  observatory(ctx, found, onFind);
  secretRooms(ctx);
  return vault(ctx, solved);
}

/** Moves kinematic platforms; call before every physics step. */
export function stepGalleryMovers(movers: Mover[], elapsed: number) {
  for (const m of movers) {
    const offset = Math.sin(elapsed * m.speed) * m.distance;
    m.body.setNextKinematicTranslation({
      x: m.origin.x + (m.axis === "x" ? offset : 0),
      y: m.origin.y + (m.axis === "y" ? offset : 0),
      z: m.origin.z + (m.axis === "z" ? offset : 0),
    });
    if (m.spin) {
      const half = (elapsed * m.spin) / 2;
      m.body.setNextKinematicRotation({ x: 0, y: Math.sin(half), z: 0, w: Math.cos(half) });
    }
  }
}
