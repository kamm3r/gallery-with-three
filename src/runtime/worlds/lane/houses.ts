import RAPIER from "@dimforge/rapier3d-compat";
import * as THREE from "three";
import {
  CEILING_Y,
  DOOR_HEIGHT,
  FLOOR_Y,
  HOUSES,
  MONSTER_HOUSE,
  PLAN_DOORS,
  PLAN_FURNITURE,
  PLAN_WALLS,
  PLAN_WINDOWS,
  SILL,
  WINDOW_HEAD,
  type FurnitureKind,
  type House,
} from "../../../gameplay/hollowLane";
import type { Night } from "../../../gameplay/hollowNight";
import { createEmbers } from "../ashFx";
import { staticBatch } from "../../staticBatch";
import { nightFx, seeded } from "./halloween";

const STYLES = [
  { siding: "#40546a", trim: "#d8d3c6", roof: "#26252b", door: "#6b2f25", brick: "#5a3a30" },
  { siding: "#56644c", trim: "#e0dccd", roof: "#2c2a26", door: "#2f3d4c", brick: "#4f3a31" },
  { siding: "#6a3833", trim: "#d9cfbb", roof: "#232226", door: "#1f2a23", brick: "#553329" },
  { siding: "#857b66", trim: "#e3ded2", roof: "#302b28", door: "#5e2a22", brick: "#4c3a2f" },
];

const WINDOW_LIT = new THREE.Color(2.1, 1.3, 0.6);
const WINDOW_DARK = new THREE.Color("#0a0c11");

/** Greyscale stripes (lap siding, shingles, planks) to tint per material. */
function stripes(rows: number, vertical = false, seed = 1) {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const context = canvas.getContext("2d")!;
  const random = seeded(seed);
  context.fillStyle = "#d8d8d8";
  context.fillRect(0, 0, size, size);
  const step = size / rows;
  for (let r = 0; r < rows; r++) {
    const shade = 190 + random() * 50;
    context.fillStyle = `rgb(${shade},${shade},${shade})`;
    if (vertical) context.fillRect(r * step, 0, step - 2, size);
    else context.fillRect(0, r * step, size, step - 2);
    context.fillStyle = "#5a5a5a";
    if (vertical) context.fillRect(r * step + step - 2, 0, 2, size);
    else context.fillRect(0, r * step + step - 3, size, 3);
  }
  for (let i = 0; i < 900; i++) {
    context.fillStyle = `rgba(0,0,0,${random() * 0.12})`;
    context.fillRect(random() * size, random() * size, 1 + random() * 3, 1);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

function createHouseKit() {
  const siding = stripes(16, false, 3);
  siding.repeat.set(1, 1);
  const shingles = stripes(12, false, 5);
  shingles.repeat.set(3, 1);
  const styles = STYLES.map((style) => ({
    siding: new THREE.MeshStandardMaterial({ color: style.siding, map: siding, roughness: 0.9 }),
    trim: new THREE.MeshStandardMaterial({ color: style.trim, roughness: 0.7 }),
    roof: new THREE.MeshStandardMaterial({ color: style.roof, map: shingles, roughness: 0.95 }),
    door: new THREE.MeshStandardMaterial({ color: style.door, roughness: 0.6 }),
    brick: new THREE.MeshStandardMaterial({ color: style.brick, roughness: 1 }),
  }));
  // Real glass in real openings: see-through, faintly tinted; lamp-lit panes glow.
  // Flat panes need no back-then-front pass; that split re-resolves the
  // shader program for every pane, every frame.
  const glass = {
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    forceSinglePass: true,
  } as const;
  const windows = {
    lit: new THREE.MeshBasicMaterial({
      color: WINDOW_LIT,
      toneMapped: false,
      opacity: 0.32,
      ...glass,
    }),
    dark: new THREE.MeshStandardMaterial({
      color: WINDOW_DARK,
      roughness: 0.05,
      metalness: 0.3,
      opacity: 0.22,
      ...glass,
    }),
    tv: new THREE.MeshBasicMaterial({ color: new THREE.Color(0.5, 0.7, 1.6), toneMapped: false }),
  };
  const bulb = new THREE.MeshBasicMaterial({
    color: new THREE.Color(3, 2.2, 1.2),
    toneMapped: false,
  });
  const inside = {
    plaster: new THREE.MeshStandardMaterial({ color: "#6f675d", roughness: 0.95 }),
    floor: new THREE.MeshStandardMaterial({
      color: "#3b2a1e",
      map: stripes(10, true, 12),
      roughness: 0.8,
    }),
    wood: new THREE.MeshStandardMaterial({ color: "#4a3527", roughness: 0.75 }),
    pale: new THREE.MeshStandardMaterial({ color: "#b9b3a6", roughness: 0.6 }),
    fabric: new THREE.MeshStandardMaterial({ color: "#4b2a2e", roughness: 1 }),
    sheet: new THREE.MeshStandardMaterial({ color: "#8e8a80", roughness: 1 }),
    dark: new THREE.MeshStandardMaterial({ color: "#16161a", roughness: 0.4 }),
    lamp: new THREE.MeshBasicMaterial({
      color: new THREE.Color(2.2, 1.5, 0.8),
      toneMapped: false,
    }),
  };
  return { siding, shingles, styles, windows, bulb, inside };
}
type Kit = ReturnType<typeof createHouseKit>;
type V3 = [number, number, number];
type Animate = (time: number, delta: number) => void;

function box(
  size: V3,
  material: THREE.Material,
  position: V3 = [0, 0, 0],
  rotation: V3 = [0, 0, 0],
  cast = false,
  receive = false,
) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
  mesh.position.set(...position);
  mesh.rotation.set(...rotation);
  mesh.castShadow = cast;
  mesh.receiveShadow = receive;
  return mesh;
}
function mesh(
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  position: V3 = [0, 0, 0],
  rotation: V3 = [0, 0, 0],
  cast = false,
  receive = false,
) {
  const m = new THREE.Mesh(geometry, material);
  m.position.set(...position);
  m.rotation.set(...rotation);
  m.castShadow = cast;
  m.receiveShadow = receive;
  return m;
}

/** Fixed cuboid in a placed group's local frame. */
function localBox(world: RAPIER.World, root: THREE.Object3D, half: V3, center: V3) {
  root.updateMatrixWorld(true);
  const p = new THREE.Vector3(...center).applyMatrix4(root.matrixWorld);
  const q = root.getWorldQuaternion(new THREE.Quaternion());
  return world.createCollider(
    RAPIER.ColliderDesc.cuboid(...half)
      .setTranslation(p.x, p.y, p.z)
      .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }),
  );
}

/** Deterministic per-house choices: a lamp left on, a TV, the porch light. */
export function houseDressing(index: number) {
  const random = seeded(100 + index * 17);
  const lamp = random() < 0.55;
  return {
    lamp,
    tv: random() < 0.35,
    porchLight: random() < 0.75,
    // With a lamp on, the living-room windows glow warm (front half of the house).
    windows: PLAN_WINDOWS.map((pane) => lamp && pane.z > 0 && random() < 0.85),
  };
}

const FURNITURE_HEIGHT: Record<FurnitureKind, number> = {
  counter: 0.95,
  fridge: 1.9,
  table: 0.78,
  bed: 0.6,
  dresser: 1.1,
  wardrobe: 2.3,
  sofa: 0.9,
  tv: 0.7,
  shelf: 2,
  chair: 0.9,
  desk: 0.78,
  cabinet: 1.3,
  nightstand: 0.6,
};

function gableShape(width: number, height: number) {
  return new THREE.ShapeGeometry(
    new THREE.Shape([
      new THREE.Vector2(-width / 2, 0),
      new THREE.Vector2(width / 2, 0),
      new THREE.Vector2(0, height),
    ]),
  );
}

function buildWalls(
  root: THREE.Group,
  world: RAPIER.World,
  house: House,
  kit: Kit,
  style: Kit["styles"][number],
  lit: readonly boolean[],
) {
  const { hw, hd } = house;
  const back = PLAN_DOORS[1];
  for (const w of PLAN_WALLS)
    localBox(world, root, [w.hx, (w.y1 - w.y0) / 2, w.hz], [w.x, (w.y0 + w.y1) / 2, w.z]);
  localBox(world, root, [hw + 0.1, FLOOR_Y / 2, hd + 0.1], [0, FLOOR_Y / 2, 0]);
  localBox(world, root, [hw, 0.05, hd], [0, CEILING_Y + 0.05, 0]);
  localBox(world, root, [0.7, 0.15, 0.35], [back.x, 0.15, -hd - 0.35]);
  for (const w of PLAN_WALLS) {
    const height = w.y1 - w.y0;
    const y = (w.y0 + w.y1) / 2;
    if (!w.outside) {
      root.add(
        box([w.hx * 2, height, w.hz * 2], kit.inside.plaster, [w.x, y, w.z], undefined, true, true),
      );
      continue;
    }
    const alongX = w.outside === "+z" || w.outside === "-z";
    const out = (w.outside[0] === "+" ? 1 : -1) * 0.05;
    const size: V3 = alongX ? [w.hx * 2, height, 0.1] : [0.1, height, w.hz * 2];
    root.add(
      box(
        size,
        style.siding,
        alongX ? [w.x, y, w.z + out] : [w.x + out, y, w.z],
        undefined,
        true,
        true,
      ),
      box(
        size,
        kit.inside.plaster,
        alongX ? [w.x, y, w.z - out] : [w.x - out, y, w.z],
        undefined,
        false,
        true,
      ),
    );
  }
  PLAN_WINDOWS.forEach((pane, i) => {
    const height = WINDOW_HEAD - SILL;
    const out = pane.outside[0] === "+" ? 1 : -1;
    const g = new THREE.Group();
    g.position.set(pane.x, FLOOR_Y + SILL + height / 2, pane.z);
    g.rotation.y = pane.along === "x" ? 0 : Math.PI / 2;
    g.add(
      mesh(
        new THREE.PlaneGeometry(pane.width, height),
        lit[i] ? kit.windows.lit : kit.windows.dark,
      ),
    );
    for (const [x, yy, w, h] of [
      [0, height / 2 + 0.06, pane.width + 0.3, 0.12],
      [0, -height / 2 - 0.08, pane.width + 0.45, 0.14],
      [-pane.width / 2 - 0.06, 0, 0.12, height],
      [pane.width / 2 + 0.06, 0, 0.12, height],
      [0, 0, 0.05, height],
    ])
      g.add(box([w, h, 0.06], style.trim, [x, yy, (pane.along === "x" ? out : -out) * 0.13]));
    root.add(g);
  });
  root.add(
    mesh(
      new THREE.PlaneGeometry(hw * 2, hd * 2),
      kit.inside.floor,
      [0, FLOOR_Y + 0.005, 0],
      [-Math.PI / 2, 0, 0],
      false,
      true,
    ),
    mesh(
      new THREE.PlaneGeometry(hw * 2, hd * 2),
      kit.inside.plaster,
      [0, CEILING_Y, 0],
      [Math.PI / 2, 0, 0],
    ),
    box([1.4, 0.3, 0.7], kit.inside.pale, [back.x, 0.15, -hd - 0.35], undefined, false, true),
  );
}

function buildFurniture(
  root: THREE.Group,
  world: RAPIER.World,
  house: House,
  kit: Kit,
  tv: boolean,
  night: Night,
  wardrobe: number,
): Animate {
  const m = kit.inside;
  const panel = PLAN_FURNITURE.find((f) => f.kind === "wardrobe")!;
  const wardrobeWidth = house.hw - 0.1 - panel.x;
  const leaves: THREE.Group[] = [];
  for (const f of PLAN_FURNITURE) {
    const h = FURNITURE_HEIGHT[f.kind!];
    localBox(world, root, [f.hx, h / 2, f.hz], [f.x, FLOOR_Y + h / 2, f.z]);
    const at = (dy: number): V3 => [f.x, FLOOR_Y + dy, f.z];
    switch (f.kind) {
      case "counter":
        root.add(
          box([f.hx * 2, h - 0.06, f.hz * 2], m.wood, at(h / 2 - 0.03), undefined, true, true),
          box([f.hx * 2 + 0.04, 0.05, f.hz * 2 + 0.04], m.pale, at(h - 0.02)),
        );
        break;
      case "fridge":
        root.add(box([f.hx * 2, h, f.hz * 2], m.pale, at(h / 2), undefined, true));
        break;
      case "table":
        root.add(box([f.hx * 2, 0.06, f.hz * 2], m.wood, at(h - 0.03), undefined, true));
        for (const sx of [-1, 1])
          for (const sz of [-1, 1])
            root.add(
              box([0.06, h, 0.06], m.wood, [
                f.x + sx * (f.hx - 0.06),
                FLOOR_Y + h / 2,
                f.z + sz * (f.hz - 0.06),
              ]),
            );
        break;
      case "bed":
        root.add(
          box([f.hx * 2, 0.5, f.hz * 2], m.wood, at(0.25), undefined, true),
          box([f.hx * 2 - 0.05, 0.12, f.hz * 2 - 0.4], m.fabric, at(0.55), undefined, true),
          box([f.hx * 2 - 0.3, 0.14, 0.35], m.sheet, [f.x, FLOOR_Y + 0.6, f.z - f.hz + 0.25]),
        );
        break;
      case "dresser":
        root.add(
          box([f.hx * 2, h, f.hz * 2], m.wood, at(h / 2), undefined, true),
          mesh(new THREE.CylinderGeometry(0.08, 0.15, 0.22, 10), m.lamp, [
            f.x,
            FLOOR_Y + h + 0.25,
            f.z + 0.2,
          ]),
        );
        break;
      case "wardrobe":
        root.add(
          box([0.08, h, f.hz * 2], m.wood, at(h / 2), undefined, true),
          box([wardrobeWidth, 0.08, f.hz * 2], m.wood, [f.x + wardrobeWidth / 2, FLOOR_Y + h, f.z]),
        );
        for (const leaf of [0, 1]) {
          const g = new THREE.Group();
          g.position.set(leaf ? f.x + wardrobeWidth - 0.02 : f.x + 0.02, FLOOR_Y, f.z + f.hz);
          g.userData.dynamic = true;
          g.add(
            box(
              [wardrobeWidth / 2 - 0.02, h - 0.05, 0.04],
              m.wood,
              [(leaf ? -1 : 1) * (wardrobeWidth / 4), h / 2, 0],
              undefined,
              true,
            ),
          );
          root.add(g);
          leaves.push(g);
        }
        break;
      case "sofa":
        root.add(
          box([f.hx * 2, 0.5, f.hz * 2], m.fabric, at(0.25), undefined, true),
          box([f.hx * 2, 0.7, 0.24], m.fabric, [f.x, FLOOR_Y + 0.6, f.z + f.hz - 0.12]),
        );
        break;
      case "tv":
        root.add(
          box([f.hx * 2, 0.5, f.hz * 2], m.wood, at(0.25)),
          box([1.1, 0.65, 0.12], m.dark, at(0.8)),
          mesh(new THREE.PlaneGeometry(0.95, 0.52), tv ? kit.windows.tv : m.dark, [
            f.x,
            FLOOR_Y + 0.8,
            f.z + 0.07,
          ]),
        );
        break;
      case "shelf":
        root.add(box([f.hx * 2, h, f.hz * 2], m.wood, at(h / 2), undefined, true));
        for (const y of [0.45, 0.95, 1.45])
          root.add(box([0.1, 0.32, f.hz * 1.6], m.fabric, [f.x + 0.12, FLOOR_Y + y, f.z]));
        break;
      case "desk":
        root.add(box([f.hx * 2, 0.06, f.hz * 2], m.wood, at(h - 0.03), undefined, true));
        for (const side of [-1, 1])
          root.add(
            box([0.36, h, f.hz * 2 - 0.05], m.wood, [
              f.x + side * (f.hx - 0.2),
              FLOOR_Y + h / 2,
              f.z,
            ]),
          );
        root.add(
          mesh(new THREE.CylinderGeometry(0.06, 0.12, 0.18, 10), m.lamp, [
            f.x + 0.5,
            FLOOR_Y + h + 0.2,
            f.z - 0.05,
          ]),
        );
        break;
      case "cabinet":
      case "nightstand":
        root.add(
          box(
            [f.hx * 2, h, f.hz * 2],
            f.kind === "cabinet" ? m.pale : m.wood,
            at(h / 2),
            undefined,
            true,
          ),
        );
        break;
      default:
        root.add(box([f.hx * 2, h, f.hz * 2], m.fabric, at(h / 2), undefined, true));
    }
  }
  return (_, delta) => {
    const s = night.survivor;
    const shut = s.hidden && s.hide === wardrobe;
    leaves.forEach((leaf, i) => {
      leaf.rotation.y = THREE.MathUtils.damp(
        leaf.rotation.y,
        shut ? 0 : (i ? -1 : 1) * 1.2,
        10,
        delta,
      );
    });
  };
}

function buildDoor(
  root: THREE.Group,
  world: RAPIER.World,
  index: number,
  back: boolean,
  kit: Kit,
  material: THREE.Material,
  night: Night,
): Animate {
  const plan = PLAN_DOORS[back ? 1 : 0];
  const swing = back ? -1.7 : 1.7;
  const collider = localBox(
    world,
    root,
    [plan.width / 2, DOOR_HEIGHT / 2, 0.05],
    [plan.x, FLOOR_Y + DOOR_HEIGHT / 2, plan.z],
  );
  const hinge = new THREE.Group();
  hinge.position.set(plan.x - plan.width / 2, FLOOR_Y, plan.z);
  hinge.userData.dynamic = true;
  hinge.add(
    box(
      [plan.width - 0.04, DOOR_HEIGHT, 0.06],
      material,
      [plan.width / 2, DOOR_HEIGHT / 2, 0],
      undefined,
      true,
    ),
  );
  if (!back)
    for (const x of [-0.28, 0, 0.28])
      hinge.add(
        mesh(new THREE.PlaneGeometry(0.2, 0.34), kit.windows.dark, [
          plan.width / 2 + x,
          1.75,
          0.035,
        ]),
      );
  hinge.add(
    mesh(new THREE.SphereGeometry(0.04, 6, 4), kit.inside.pale, [plan.width - 0.12, 1.05, 0.05]),
  );
  root.add(hinge);
  return (time, delta) => {
    const door = night.doors[index];
    const bashing = night.killer.door === index && door.locked;
    hinge.rotation.y = THREE.MathUtils.damp(hinge.rotation.y, door.open ? swing : 0, 7, delta);
    hinge.rotation.z = bashing ? Math.sin(time * 40) * 0.015 : 0;
    hinge.rotation.x = THREE.MathUtils.damp(
      hinge.rotation.x,
      door.broken ? (back ? 1.45 : -1.45) : 0,
      8,
      delta,
    );
    collider.setEnabled(!door.open);
  };
}

function buildCraftsman(
  scene: THREE.Object3D,
  world: RAPIER.World,
  house: House,
  index: number,
  kit: Kit,
  night: Night,
): Animate[] {
  const { hw, hd } = house;
  const style = kit.styles[house.style];
  const dress = houseDressing(index);
  const root = new THREE.Group();
  root.position.set(house.x, 0, house.z);
  root.rotation.y = house.yaw;
  scene.add(root);
  const rise = 2.3,
    span = hw + 0.6,
    slope = Math.hypot(span, rise),
    angle = Math.atan2(rise, span),
    porchWidth = hw * 1.2,
    porchRise = 1.3,
    porchSlope = Math.hypot(porchWidth / 2 + 0.3, porchRise),
    porchAngle = Math.atan2(porchRise, porchWidth / 2 + 0.3);
  const wallTop = CEILING_Y;
  const porchTop = 3.3;
  const porchFront = hd + 2.8;
  localBox(world, root, [porchWidth / 2 + 0.4, 0.175, 1.4], [0, 0.175, hd + 1.4]);
  root.add(
    box([hw * 2 + 0.2, 0.6, hd * 2 + 0.2], style.brick, [0, 0.3, 0], undefined, false, true),
  );
  buildWalls(root, world, house, kit, style, dress.windows);
  const animate: Animate[] = [buildFurniture(root, world, house, kit, dress.tv, night, index)];
  if (dress.lamp) {
    const light = new THREE.PointLight("#ffb870", 5, 7, 2);
    light.position.set(0, CEILING_Y - 0.6, 2);
    root.add(light);
  }
  for (const back of [false, true])
    animate.push(buildDoor(root, world, index * 2 + (back ? 1 : 0), back, kit, style.door, night));
  const gable = gableShape(hw * 2, rise);
  for (const z of [hd, -hd])
    root.add(mesh(gable, style.siding, [0, wallTop, z], [0, z > 0 ? 0 : Math.PI, 0], true));
  for (const side of [-1, 1])
    root.add(
      box(
        [slope + 0.2, 0.18, hd * 2 + 1.4],
        style.roof,
        [(side * span) / 2, wallTop + rise / 2, 0],
        [0, 0, -side * angle],
        true,
      ),
    );
  root.add(
    box([0.9, 3, 0.9], style.brick, [hw * 0.5, wallTop + 1.4, -hd * 0.3], undefined, true),
    box([porchWidth + 0.8, 0.35, 2.8], style.trim, [0, 0.175, hd + 1.4], undefined, false, true),
    box([2.2, 0.18, 0.7], style.trim, [0, 0.09, porchFront + 0.35], undefined, false, true),
  );
  for (const side of [-1, 1]) {
    const g = new THREE.Group();
    g.position.set((side * porchWidth) / 2, 0, porchFront - 0.35);
    g.add(
      box([0.6, 0.8, 0.6], style.brick, [0, 0.75, 0], undefined, true),
      mesh(
        new THREE.CylinderGeometry(0.18, 0.28, porchTop - 1.15, 4),
        style.trim,
        [0, 1.15 + (porchTop - 1.15) / 2, 0],
        [0, Math.PI / 4, 0],
        true,
      ),
    );
    root.add(g);
  }
  root.add(
    box([porchWidth + 0.5, 0.25, 3.1], style.trim, [0, porchTop + 0.1, hd + 1.5]),
    mesh(gableShape(porchWidth, porchRise), style.trim, [0, porchTop + 0.22, porchFront + 0.02]),
  );
  for (const side of [-1, 1])
    root.add(
      box(
        [porchSlope + 0.2, 0.14, 3.4],
        style.roof,
        [(side * (porchWidth / 2 + 0.3)) / 2, porchTop + 0.22 + porchRise / 2, hd + 1.5],
        [0, 0, -side * porchAngle],
        true,
      ),
    );
  for (const [x, y, w, h] of [
    [-0.86, FLOOR_Y + 1.2, 0.12, 2.4],
    [0.46, FLOOR_Y + 1.2, 0.12, 2.4],
    [-0.2, FLOOR_Y + 2.38, 1.44, 0.12],
  ])
    root.add(box([w, h, 0.04], style.trim, [x, y, hd + 0.11]));
  if (dress.porchLight)
    root.add(mesh(new THREE.SphereGeometry(0.09, 8, 6), kit.bulb, [0.75, 2.75, hd + 0.12]));
  staticBatch(root);
  return animate;
}

const EYE_GLOW = new THREE.Color(2.8, 1.5, 0.35);
const ROOF_RISE = 5,
  ROOF_RUN = 7.5;

function buildMonsterHouse(scene: THREE.Object3D, world: RAPIER.World, kit: Kit): Animate {
  const h = MONSTER_HOUSE;
  const root = new THREE.Group();
  root.position.set(h.x, 0, h.z);
  scene.add(root);
  localBox(world, root, [h.hw, 4, h.hd], [0, 4, 0]);
  localBox(world, root, [9.5, 0.3, 1.75], [0, 0.3, h.hd + 1.75]);
  const eyes = new THREE.MeshBasicMaterial({ color: EYE_GLOW.clone(), toneMapped: false });
  const planks = stripes(18, true, 9);
  planks.repeat.set(3, 1);
  const wood = new THREE.MeshStandardMaterial({ color: "#3a2f28", map: planks, roughness: 1 });
  const roof = new THREE.MeshStandardMaterial({
    color: "#1c1a1d",
    map: kit.shingles,
    roughness: 1,
  });
  const bone = new THREE.MeshStandardMaterial({ color: "#bdb49c", roughness: 0.9 });
  const random = seeded(66);
  const teeth = Array.from({ length: 26 }, (_, i) => {
    const x = -9 + (i / 25) * 18;
    return Math.abs(x) < 1.6
      ? null
      : { x, height: 0.7 + random() * 0.5, tilt: (random() - 0.5) * 0.35 };
  }).filter((tooth) => tooth !== null);
  const breath = new THREE.Group();
  root.add(breath);
  breath.add(
    box(
      [h.hw * 2 + 0.6, 1, h.hd * 2 + 0.6],
      new THREE.MeshStandardMaterial({ color: "#29272a", roughness: 1 }),
      [0, 0.5, 0],
      undefined,
      true,
      true,
    ),
    box([h.hw * 2, 4.2, h.hd * 2], wood, [0, 3.1, 0], undefined, true, true),
  );
  const upper = new THREE.Group();
  upper.position.y = 7;
  upper.rotation.set(0.02, 0.04, 0.03);
  upper.add(box([17, 3.6, 13], wood, undefined, undefined, true));
  for (const side of [-1, 1])
    upper.add(
      mesh(new THREE.PlaneGeometry(3, 1.7), eyes, [side * 4, 0.1, 6.52], [0, 0, side * -0.12]),
    );
  for (const side of [-1, 1])
    upper.add(
      box(
        [19.5, 0.3, Math.hypot(ROOF_RISE, ROOF_RUN) + 0.4],
        roof,
        [0, 1.8 + ROOF_RISE / 2, side * (ROOF_RUN / 2)],
        [side * Math.atan2(ROOF_RISE, ROOF_RUN), 0, 0],
        true,
      ),
    );
  upper.add(
    box(
      [1.2, 4, 1.2],
      new THREE.MeshStandardMaterial({ color: "#2a2020", roughness: 1 }),
      [5.5, 7, -1],
      [0, 0, 0.18],
      true,
    ),
  );
  const smoke = createEmbers({
    count: 40,
    radius: 0.4,
    height: 9,
    speed: 0.6,
    size: 1.8,
    color: "#2e2b2c",
    additive: false,
    sway: 1.2,
    opacity: 0.5,
  });
  smoke.points.position.set(5.9, 9.1, -1);
  upper.add(smoke.points);
  breath.add(upper);
  breath.add(
    box(
      [19, 0.6, 3.5],
      new THREE.MeshStandardMaterial({ color: "#2f2824", roughness: 1 }),
      [0, 0.3, h.hd + 1.75],
      undefined,
      false,
      true,
    ),
    box([19.6, 0.25, 4.2], roof, [0, 4.4, h.hd + 1.9], [0.12, 0, 0], true),
  );
  for (const x of [-9, -3.5, 3.5, 9])
    breath.add(box([0.35, 3.6, 0.35], wood, [x, 2.4, h.hd + 3.3], [0, 0, x * 0.006], true));
  for (const tooth of teeth)
    breath.add(
      mesh(
        new THREE.ConeGeometry(0.18, tooth.height, 4),
        bone,
        [tooth.x, 0.6 + tooth.height / 2, h.hd + 3.4],
        [0, 0, tooth.tilt],
        true,
      ),
    );
  breath.add(
    mesh(
      new THREE.PlaneGeometry(2.4, 3.2),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6, 1.1, 0.3), toneMapped: false }),
      [0, 2.4, h.hd + 0.03],
    ),
    mesh(
      new THREE.PlaneGeometry(2, 3.4),
      new THREE.MeshStandardMaterial({ color: "#5a1418", roughness: 0.8 }),
      [0, 0.62, h.hd + 1.8],
      [-Math.PI / 2, 0, 0],
    ),
  );
  for (const side of [-1, 1])
    breath.add(mesh(new THREE.PlaneGeometry(1.6, 1.8), eyes, [side * 6.5, 3, h.hd + 0.03]));
  const doorLight = new THREE.PointLight("#ff8a3a", 20, 16, 2);
  doorLight.position.set(0, 2.4, h.hd + 3);
  const porchLight = new THREE.PointLight("#ffae52", 14, 18, 2);
  porchLight.position.set(0, 7, h.hd + 5);
  root.add(doorLight, porchLight);
  return (t) => {
    const glow = 0.7 + nightFx.danger * 0.9 + Math.sin(t * 0.8) * 0.15;
    eyes.color.copy(EYE_GLOW).multiplyScalar(glow);
    breath.scale.y = 1 + Math.sin(t * 0.6) * 0.008;
    doorLight.intensity = 14 + glow * 10 + Math.sin(t * 5.3) * 2;
    smoke.update(t);
  };
}

/** Every house on the lane plus the Monster House. Returns a per-frame animator. */
export function createLaneHouses(
  scene: THREE.Object3D,
  world: RAPIER.World,
  night: Night,
): Animate {
  const kit = createHouseKit();
  const animate: Animate[] = [];
  HOUSES.forEach((house, i) => animate.push(...buildCraftsman(scene, world, house, i, kit, night)));
  animate.push(buildMonsterHouse(scene, world, kit));
  return (time, delta) => {
    const flicker = 0.6 + 0.4 * Math.abs(Math.sin(time * 7.1) * Math.sin(time * 2.3 + 1));
    kit.windows.tv.color.setRGB(0.45 * flicker, 0.65 * flicker, 1.6 * flicker);
    for (const a of animate) a(time, delta);
  };
}
