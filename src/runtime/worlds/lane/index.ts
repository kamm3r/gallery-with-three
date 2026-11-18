import RAPIER from "@dimforge/rapier3d-compat";
import * as THREE from "three";
import { keyLabel } from "../../../gameplay/controlBindings";
import {
  CUL_DE_SAC,
  DOORS,
  ESCAPE_CAR,
  FLOOR_Y,
  GRAVEYARD,
  HIDE_SPOTS,
  HOUSES,
  LAMP_GLOW,
  LANE_PORTAL,
  LANE_START,
  MONSTER_HOUSE,
  PARK,
  PAYPHONE,
  POLICE_STOP,
  SEARCH_SPOTS,
  STREET_LAMPS,
  STREETS,
  TREES,
  houseToWorld,
  insideHouse,
  type Point,
  type Tree,
} from "../../../gameplay/hollowLane";
import {
  BONUS,
  CAR_PARTS,
  NIGHT,
  PARTS,
  applyBonus,
  awareness,
  canStartCar,
  createNight,
  holdTime,
  isPart,
  maxStamina,
  sprintAllowed,
  stepNight,
  type Bonus,
  type Focus,
  type Loot,
  type Night,
  type NightEvent,
  type Outcome,
} from "../../../gameplay/hollowNight";
import { heldItems } from "../../../gameplay/heldItems";
import { cameraRig } from "../../../gameplay/cameraRig";
import {
  addItem,
  closeInventory,
  isOn,
  onUse,
  openInventory,
  removeItem,
  type ItemDef,
} from "../../../gameplay/inventory";
import { isResultScreenActive, setResultScreenActive } from "../../../gameplay/resultScreen";
import { playSound, setChase } from "../../../gameplay/sound";
import { setSprintAllowed } from "../../../gameplay/sprintGate";
import { sunlight } from "../../../gameplay/sunlight";
import { button, element } from "../../../ui/dom";
import { mountInventoryBar } from "../../../ui/inventoryBar";
import { gameStore } from "../../gameStore";
import { heldControls } from "../../playerInput";
import type { RouteState } from "../../router";
import { createPortalPainting, mountLevel } from "../../level";
import { createEmbers } from "../ashFx";
import {
  MOON,
  createBats,
  createGhosts,
  createGraveyard,
  createGroundMist,
  createSkyMaterial,
  nightFx,
  pumpkinGeometry,
  seeded,
} from "./halloween";
import { createLaneHouses, houseDressing } from "./houses";
import { createKiller } from "./killer";
import { createNatureBatch } from "./nature";

const GROUND = 125;
const LANE_FOG = "#10101a";
const DANGER_RANGE = 24;
type V3 = [number, number, number];
type Animate = (time: number, delta: number) => void;

const PART_LABEL: Record<Loot, string> = {
  keys: "Car keys",
  gas: "Gas can",
  battery: "Battery",
  fuse: "Fuse",
  medkit: "Med kit",
  drink: "Energy drink",
};

/** What you can carry on Hollow Lane. The inventory belongs to this portal:
 * you arrive with a flashlight, and everything is gone when you leave. */
const LANE_ITEMS: ItemDef[] = [
  {
    id: "flashlight",
    name: "Flashlight",
    description: "Lights the way, and gives you away: he spots a lit torch from much further off.",
    icon: "flashlight",
    toggle: true,
  },
  {
    id: "keys",
    name: "Car keys",
    description: "For the station wagon in the cul-de-sac.",
    icon: "key",
  },
  { id: "gas", name: "Gas can", description: "The station wagon's tank is empty.", icon: "gas" },
  {
    id: "battery",
    name: "Battery",
    description: "The station wagon won't turn over without it.",
    icon: "battery",
  },
  { id: "fuse", name: "Fuse", description: "Fixes the dead payphone on Elm Street.", icon: "fuse" },
  {
    id: "medkit",
    name: "Med kit",
    description: "Patches up a stab wound. Does nothing if you're unhurt.",
    icon: "medkit",
    consumable: true,
  },
  {
    id: "drink",
    name: "Energy drink",
    description: "Instantly refills your stamina, even when you're winded.",
    icon: "drink",
    consumable: true,
  },
];

const OUTCOME_TITLE: Record<Outcome, string> = {
  dead: "You didn't survive the night",
  car: "You drove out of Hollow Lane",
  police: "The police got you out",
};

const AWARENESS_LABEL = {
  asleep: "Quiet",
  unaware: "He's walking",
  suspicious: "He's searching",
  hunting: "He's hunting you",
} as const;

function laneTextures() {
  const size = 2048;
  const px = size / (GROUND * 2);
  const at = (v: number) => (v + GROUND) * px;
  const make = () => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = size;
    return [canvas, canvas.getContext("2d")!] as const;
  };
  const [colorCanvas, color] = make();
  const [roughCanvas, rough] = make();
  const random = seeded(23);
  color.fillStyle = "#171d14";
  color.fillRect(0, 0, size, size);
  rough.fillStyle = "#f0f0f0";
  rough.fillRect(0, 0, size, size);
  for (let i = 0; i < 3000; i++) {
    const shade = random();
    color.fillStyle =
      shade < 0.5 ? "rgba(34,44,26,0.4)" : shade < 0.8 ? "rgba(8,10,6,0.4)" : "rgba(52,40,26,0.35)";
    color.beginPath();
    color.ellipse(
      random() * size,
      random() * size,
      6 + random() * 30,
      4 + random() * 18,
      random() * 3,
      0,
      7,
    );
    color.fill();
  }
  const rect = (
    context: CanvasRenderingContext2D,
    x: number,
    z: number,
    hx: number,
    hz: number,
    fill: string,
  ) => {
    context.fillStyle = fill;
    context.fillRect(at(x - hx), at(z - hz), hx * 2 * px, hz * 2 * px);
  };
  // Front walks from each porch to the sidewalk.
  for (const house of HOUSES) {
    for (let d = house.hd + 3; d < house.hd + 9; d += 0.5) {
      const p = houseToWorld(house, 0, d);
      rect(color, p.x, p.z, 0.7, 0.7, "#3d3b37");
    }
  }
  // Sidewalks, then asphalt on top, then the cul-de-sac.
  for (const street of STREETS)
    rect(color, street.x, street.z, street.hx + 3, street.hz + 3, "#44423f");
  color.fillStyle = "#44423f";
  color.beginPath();
  color.arc(at(CUL_DE_SAC.x), at(CUL_DE_SAC.z), (CUL_DE_SAC.r + 3) * px, 0, 7);
  color.fill();
  for (const context of [color, rough]) {
    // Damp asphalt: a dull sheen under the lamps, not a mirror.
    const fill = context === color ? "#1d1d21" : "#c0c0c0";
    for (const street of STREETS) rect(context, street.x, street.z, street.hx, street.hz, fill);
    context.fillStyle = fill;
    context.beginPath();
    context.arc(at(CUL_DE_SAC.x), at(CUL_DE_SAC.z), CUL_DE_SAC.r * px, 0, 7);
    context.fill();
  }
  // Sidewalk joints, asphalt cracks, fallen leaves on the lawns.
  color.strokeStyle = "rgba(0,0,0,0.35)";
  color.lineWidth = 1;
  for (let v = -GROUND; v < GROUND; v += 1.6) {
    color.beginPath();
    color.moveTo(0, at(v));
    color.lineTo(size, at(v));
    color.moveTo(at(v), 0);
    color.lineTo(at(v), size);
    color.globalAlpha = 0.25;
    color.stroke();
    color.globalAlpha = 1;
  }
  for (const street of STREETS)
    rect(color, street.x, street.z, street.hx, street.hz, "rgba(29,29,33,0.92)");
  color.fillStyle = "rgba(29,29,33,0.92)";
  color.beginPath();
  color.arc(at(CUL_DE_SAC.x), at(CUL_DE_SAC.z), CUL_DE_SAC.r * px, 0, 7);
  color.fill();
  for (let i = 0; i < 260; i++) {
    const street = STREETS[i % STREETS.length];
    const x = street.x + (random() * 2 - 1) * street.hx,
      z = street.z + (random() * 2 - 1) * street.hz;
    color.strokeStyle = "rgba(0,0,0,0.6)";
    color.beginPath();
    color.moveTo(at(x), at(z));
    color.lineTo(at(x) + (random() - 0.5) * 40, at(z) + (random() - 0.5) * 40);
    color.stroke();
  }
  const leaves = ["#6b2e14", "#8a4a1c", "#4e2a18", "#a3561d", "#3a2a1a", "#5b1c12"];
  for (let i = 0; i < 42000; i++) {
    color.save();
    color.translate(random() * size, random() * size);
    color.rotate(random() * Math.PI);
    color.globalAlpha = 0.4 + random() * 0.5;
    color.fillStyle = leaves[Math.floor(random() * leaves.length)];
    color.fillRect(-2, -1, 2 + random() * 4, 1.5 + random() * 2);
    color.restore();
  }
  const map = new THREE.CanvasTexture(colorCanvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 8;
  const roughnessMap = new THREE.CanvasTexture(roughCanvas);
  return { map, roughnessMap };
}

function glowTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 128;
  const context = canvas.getContext("2d")!;
  const gradient = context.createRadialGradient(64, 64, 0, 64, 64, 64);
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(0.5, "rgba(255,255,255,0.35)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(canvas);
}

function glowMaterial(color: THREE.ColorRepresentation, opacity: number) {
  return new THREE.MeshBasicMaterial({
    map: glowTexture(),
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
}
function mesh(
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  position: V3 = [0, 0, 0],
  rotation: V3 = [0, 0, 0],
  cast = false,
) {
  const m = new THREE.Mesh(geometry, material);
  m.position.set(...position);
  m.rotation.set(...rotation);
  m.castShadow = cast;
  return m;
}
const std = (p: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial(p);
const basic = (p: THREE.MeshBasicMaterialParameters) => new THREE.MeshBasicMaterial(p);

/** Jack-o'-lanterns on every porch, the Monster House steps and the corners. */
const LANTERNS = (() => {
  const random = seeded(8);
  const list: { x: number; y: number; z: number; scale: number; yaw: number }[] = [];
  HOUSES.forEach((house) => {
    const count = 2 + Math.floor(random() * 3);
    const slots = [
      [0.9, house.hd + 3.3, 0],
      [-1.1, house.hd + 3.25, 0],
      [house.hw * 0.55, house.hd + 2.3, 0.35],
      [-house.hw * 0.5, house.hd + 2.1, 0.35],
    ];
    for (let n = 0; n < count; n++) {
      const [lx, lz, y] = slots[n];
      const p = houseToWorld(house, lx, lz);
      list.push({
        ...p,
        y,
        scale: 0.55 + random() * 0.45,
        yaw: house.yaw + (random() - 0.5) * 0.8,
      });
    }
  });
  for (let n = 0; n < 7; n++) {
    const x = MONSTER_HOUSE.x - 8 + n * 2.6;
    list.push({
      x,
      y: 0.6,
      z: MONSTER_HOUSE.z + MONSTER_HOUSE.hd + 2.6,
      scale: 0.7 + random() * 0.6,
      yaw: (random() - 0.5) * 0.6,
    });
  }
  return list;
})();

/** What E does right now, as the HUD's prompt. */
function promptFor(night: Night, focus: Focus | null): string | null {
  if (!focus) return null;
  switch (focus.kind) {
    case "search":
      return `Search ${SEARCH_SPOTS[focus.index].label}`;
    case "pickup":
      return `Pick up the ${PART_NAME[night.revealed[focus.index]!]}`;
    case "hide":
      return HIDE_SPOTS[focus.index].kind === "wardrobe"
        ? "Hide in the wardrobe"
        : "Hide in the hedge";
    case "unhide":
      return "Come out";
    case "door": {
      const door = night.doors[focus.index];
      const inside = insideHouse(night.survivor) === DOORS[focus.index].house;
      if (door.locked) return inside ? "Unlock the door" : "Locked";
      if (door.open) return "Close the door";
      return inside ? "Open the door · hold to lock" : "Open the door";
    }
    case "car":
      return "Start the car";
    case "phone":
      return "Call the police";
  }
}

const PART_NAME: Record<Loot, string> = {
  medkit: "med kit",
  drink: "energy drink",
  keys: "car keys",
  gas: "gas can",
  battery: "battery",
  fuse: "fuse",
};

function buildStreetLamps(scene: THREE.Object3D, world: RAPIER.World, night: Night): Animate {
  const pool = glowMaterial("#ffc987", 0.28);
  const bulb = basic({ color: new THREE.Color(3, 2.3, 1.3), toneMapped: false });
  const dead = basic({ color: "#2a2620" });
  const pole = std({ color: "#1c1d20", metalness: 0.6, roughness: 0.5 });
  const lamps = STREET_LAMPS.map((lamp, i) => {
    const toward = Math.abs(lamp.z - 6) < 9 && Math.abs(lamp.x) > 9 ? (lamp.z < 6 ? 1 : -1) : 0;
    const armX = toward === 0 ? (lamp.x < 0 ? 1.4 : -1.4) : 0;
    const armZ = toward * 1.4;
    const g = new THREE.Group();
    g.position.set(lamp.x, 0, lamp.z);
    world.createCollider(
      RAPIER.ColliderDesc.cylinder(2.8, 0.14).setTranslation(lamp.x, 2.8, lamp.z),
    );
    const bulbMesh = mesh(new THREE.SphereGeometry(0.16, 10, 6), bulb, [armX, 5.38, armZ]);
    g.add(
      mesh(new THREE.CylinderGeometry(0.08, 0.13, 5.8, 8), pole, [0, 2.9, 0], undefined, true),
      mesh(
        new THREE.CylinderGeometry(0.05, 0.05, 1.5, 6),
        pole,
        [armX / 2, 5.75, armZ / 2],
        [toward ? Math.PI / 2 : 0, 0, toward ? 0 : Math.PI / 2],
      ),
      mesh(
        new THREE.CylinderGeometry(0.18, 0.4, 0.35, 10),
        std({ color: "#232428", metalness: 0.5, roughness: 0.5 }),
        [armX, 5.6, armZ],
      ),
      bulbMesh,
      mesh(
        new THREE.PlaneGeometry(LAMP_GLOW * 2, LAMP_GLOW * 2),
        pool,
        [armX, 0.04, armZ],
        [-Math.PI / 2, 0, 0],
      ),
    );
    let light: THREE.PointLight | null = null;
    if (i % 2 === 0) {
      light = new THREE.PointLight("#ffc27a", 26, 16, 2);
      light.position.set(armX, 5.2, armZ);
      g.add(light);
    }
    scene.add(g);
    return { lamp, light, bulbMesh };
  });
  return (t) => {
    const k = night.killer;
    lamps.forEach(({ lamp, light, bulbMesh }, i) => {
      const near = Math.hypot(lamp.x - k.x, lamp.z - k.z) < 12 && k.mode !== "dormant";
      const on = !near || Math.sin(t * 23 + i * 7) * Math.sin(t * 9.1 + i) > -0.2;
      if (light) light.intensity = on ? 26 + Math.sin(t * 50 + i) * (i === 3 ? 6 : 0.5) : 2;
      bulbMesh.material = on ? bulb : dead;
    });
  };
}

function buildPorchGlows(scene: THREE.Object3D) {
  const pool = glowMaterial("#ffb060", 0.35);
  HOUSES.forEach((house, i) => {
    if (!houseDressing(i).porchLight) return;
    const spot = houseToWorld(house, 0.5, house.hd + 1.6);
    scene.add(
      mesh(new THREE.PlaneGeometry(5, 5), pool, [spot.x, 0.38, spot.z], [-Math.PI / 2, 0, 0]),
    );
  });
}

function buildJackOLanterns(scene: THREE.Object3D) {
  const { body, face } = pumpkinGeometry();
  const bodies = new THREE.InstancedMesh(
    body,
    std({ color: "#c65b1e", roughness: 0.9 }),
    LANTERNS.length,
  );
  const faces = new THREE.InstancedMesh(
    face,
    basic({ color: new THREE.Color(2.3, 1.25, 0.35), toneMapped: false, side: THREE.DoubleSide }),
    LANTERNS.length,
  );
  bodies.castShadow = bodies.receiveShadow = true;
  const transform = new THREE.Object3D();
  LANTERNS.forEach((p, i) => {
    transform.position.set(p.x, p.y, p.z);
    transform.rotation.set(0, p.yaw, 0);
    transform.scale.setScalar(p.scale);
    transform.updateMatrix();
    bodies.setMatrixAt(i, transform.matrix);
    faces.setMatrixAt(i, transform.matrix);
  });
  for (const m of [bodies, faces]) {
    m.instanceMatrix.needsUpdate = true;
    m.computeBoundingSphere();
  }
  scene.add(bodies, faces);
}

function buildSearchSpots(scene: THREE.Object3D, night: Night): Animate {
  const glint = basic({
    color: new THREE.Color(1.6, 1.8, 2.4),
    toneMapped: false,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const spots = SEARCH_SPOTS.map((spot, i) => {
    const indoors = spot.house >= 0;
    const kind = i % 3;
    const g = new THREE.Group();
    g.position.set(spot.x, indoors ? FLOOR_Y : 0, spot.z);
    g.rotation.y = i * 1.3;
    let lid: THREE.Mesh | null = null;
    if (!indoors) {
      if (kind === 0) {
        g.add(
          mesh(
            new THREE.CylinderGeometry(0.32, 0.28, 1, 12),
            std({ color: "#3d4247", metalness: 0.5, roughness: 0.6 }),
            [0, 0.5, 0],
            undefined,
            true,
          ),
        );
        lid = mesh(
          new THREE.CylinderGeometry(0.35, 0.35, 0.06, 12),
          std({ color: "#4a5055", metalness: 0.5, roughness: 0.5 }),
          [0, 1.03, 0],
        );
      } else if (kind === 1) {
        g.add(
          mesh(
            new THREE.BoxGeometry(0.8, 0.6, 0.6),
            std({ color: "#7a5a3a", roughness: 1 }),
            [0, 0.3, 0],
            undefined,
            true,
          ),
        );
        lid = mesh(
          new THREE.BoxGeometry(0.55, 0.35, 0.45),
          std({ color: "#8a6a45", roughness: 1 }),
          [0.1, 0.72, 0],
          [0, 0.4, 0],
        );
      } else {
        g.add(
          mesh(
            new THREE.BoxGeometry(0.7, 0.4, 0.35),
            std({ color: "#8a1f1a", metalness: 0.4, roughness: 0.5 }),
            [0, 0.2, 0],
            undefined,
            true,
          ),
        );
        lid = mesh(
          new THREE.BoxGeometry(0.72, 0.08, 0.37),
          std({ color: "#9a2a22", metalness: 0.4, roughness: 0.5 }),
          [0, 0.44, 0],
        );
      }
      g.add(lid);
    }
    const sparkle = mesh(new THREE.SphereGeometry(0.07, 8, 6), glint, [
      0,
      indoors ? 1.25 : 1.35,
      0,
    ]);
    g.add(sparkle);
    scene.add(g);
    return { lid, sparkle };
  });
  return (t) => {
    glint.opacity = 0.35 + 0.35 * Math.max(0, Math.sin(t * 2.2));
    spots.forEach(({ lid, sparkle }, i) => {
      const searched = night.searched[i];
      sparkle.visible = night.live[i] && !searched;
      if (lid && searched) {
        lid.position.set(0.5, 0.05, 0.4);
        lid.rotation.set(Math.PI / 2 - 0.2, 0, 0.4);
      }
    });
  };
}

function buildPartPickups(scene: THREE.Object3D, night: Night): Animate {
  const glowMat = basic({
    color: new THREE.Color(1.2, 0.9, 0.5),
    transparent: true,
    opacity: 0.25,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  const glow = () => mesh(new THREE.SphereGeometry(0.28, 12, 8), glowMat);
  const make = (...children: THREE.Object3D[]) => {
    const g = new THREE.Group();
    g.visible = false;
    g.add(...children, glow());
    scene.add(g);
    return g;
  };
  const metal = (color: string) => std({ color, metalness: 0.9, roughness: 0.3 });
  const groups: Record<Loot, THREE.Group> = {
    keys: make(
      mesh(new THREE.TorusGeometry(0.07, 0.015, 6, 16), metal("#d9b35a")),
      mesh(
        new THREE.BoxGeometry(0.16, 0.035, 0.01),
        metal("#c9c9c9"),
        [0.12, -0.04, 0],
        [0, 0, -0.6],
      ),
    ),
    gas: make(
      mesh(
        new THREE.BoxGeometry(0.3, 0.36, 0.14),
        std({ color: "#b3261c", metalness: 0.3, roughness: 0.5 }),
      ),
      mesh(
        new THREE.CylinderGeometry(0.025, 0.025, 0.14, 6),
        std({ color: "#d8c23a" }),
        [0.1, 0.22, 0],
        [0, 0, -0.5],
      ),
    ),
    battery: make(
      mesh(new THREE.BoxGeometry(0.32, 0.22, 0.18), std({ color: "#1c1c1f", roughness: 0.6 })),
      ...[-0.09, 0.09].map((x) =>
        mesh(
          new THREE.CylinderGeometry(0.025, 0.025, 0.05, 6),
          std({ color: x < 0 ? "#b82020" : "#9a9a9a", metalness: 0.7 }),
          [x, 0.13, 0],
        ),
      ),
    ),
    fuse: make(
      mesh(
        new THREE.CylinderGeometry(0.035, 0.035, 0.18, 8),
        std({ color: "#e9e3d0", roughness: 0.4 }),
        undefined,
        [0, 0, Math.PI / 2],
      ),
      ...[-0.1, 0.1].map((x) =>
        mesh(
          new THREE.CylinderGeometry(0.04, 0.04, 0.04, 8),
          metal("#c0a060"),
          [x, 0, 0],
          [0, 0, Math.PI / 2],
        ),
      ),
    ),
    medkit: make(
      mesh(new THREE.BoxGeometry(0.32, 0.22, 0.12), std({ color: "#e8e4dc", roughness: 0.5 })),
      mesh(new THREE.PlaneGeometry(0.16, 0.05), basic({ color: "#c0201a" }), [0, 0, 0.065]),
      mesh(new THREE.PlaneGeometry(0.05, 0.16), basic({ color: "#c0201a" }), [0, 0, 0.065]),
    ),
    drink: make(
      mesh(
        new THREE.CylinderGeometry(0.05, 0.05, 0.2, 12),
        std({ color: "#2bd06a", metalness: 0.6, roughness: 0.3 }),
      ),
    ),
  };
  return (t) => {
    for (const part of [...PARTS, ...BONUS]) {
      const g = groups[part];
      const spot = night.revealed.findIndex((p) => p === part);
      g.visible = spot >= 0;
      if (spot < 0) continue;
      const at = SEARCH_SPOTS[spot];
      g.position.set(at.x, (at.house >= 0 ? FLOOR_Y : 0) + 1.1 + Math.sin(t * 2.4) * 0.06, at.z);
      g.rotation.y = t * 1.2;
    }
  };
}

function buildStationWagon(scene: THREE.Object3D, world: RAPIER.World, night: Night): Animate {
  const car = new THREE.Group();
  car.position.set(ESCAPE_CAR.x, 0, ESCAPE_CAR.z);
  car.rotation.y = ESCAPE_CAR.yaw;
  scene.add(car);
  car.updateMatrixWorld();
  const center = new THREE.Vector3(0, 0.8, 0).applyMatrix4(car.matrixWorld);
  const q = car.quaternion;
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(0.95, 0.8, 2.4)
      .setTranslation(center.x, center.y, center.z)
      .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }),
  );
  const paint = std({ color: "#4a1d1a", metalness: 0.4, roughness: 0.45 });
  const glass = std({ color: "#0c0f14", metalness: 0.8, roughness: 0.1 });
  const hood = mesh(new THREE.BoxGeometry(1.8, 0.05, 1.4), paint, [0, 1.2, 1.3], [-0.9, 0, 0]);
  const headlights = basic({ color: "#111", toneMapped: false });
  car.add(
    mesh(new THREE.BoxGeometry(1.9, 0.8, 4.8), paint, [0, 0.75, 0], undefined, true),
    mesh(new THREE.BoxGeometry(1.75, 0.72, 3), glass, [0, 1.5, -0.45], undefined, true),
    mesh(new THREE.BoxGeometry(1.8, 0.06, 3.05), paint, [0, 1.88, -0.45]),
    hood,
  );
  const tire = std({ color: "#0d0d0e", roughness: 0.9 });
  for (const x of [-0.85, 0.85])
    for (const z of [-1.5, 1.5])
      car.add(
        mesh(
          new THREE.CylinderGeometry(0.36, 0.36, 0.26, 14),
          tire,
          [x, 0.36, z],
          [0, 0, Math.PI / 2],
        ),
      );
  for (const x of [-0.65, 0.65])
    car.add(
      mesh(
        new THREE.PlaneGeometry(0.35, 0.2),
        x < 0 ? headlights : basic({ color: "#111", toneMapped: false }),
        [x, 0.85, 2.41],
      ),
    );
  for (const x of [-0.7, 0.7])
    car.add(
      mesh(
        new THREE.PlaneGeometry(0.3, 0.16),
        basic({ color: new THREE.Color(1.4, 0.1, 0.1), toneMapped: false }),
        [x, 0.9, -2.41],
        [0, Math.PI, 0],
      ),
    );
  const beam = new THREE.SpotLight("#fff2d0", 0, 40, 0.5, 0.5);
  beam.position.set(0, 0.9, 2.5);
  beam.target.position.set(0, 0.5, 10);
  car.add(beam, beam.target);
  let drive = 0;
  return (_, delta) => {
    const ready = canStartCar(night);
    hood.rotation.x = ready ? 0 : -0.9;
    const escaping = night.outcome === "car";
    const cranking = night.survivor.focus?.kind === "car" && night.survivor.hold > 0;
    headlights.color.setScalar(escaping || cranking ? 3 : 0.05);
    beam.intensity = escaping ? 60 : 0;
    if (!escaping) return;
    drive += delta;
    const speed = Math.min(12, drive * 5);
    car.position.x += Math.sin(car.rotation.y) * speed * delta;
    car.position.z += Math.cos(car.rotation.y) * speed * delta;
    const heading = Math.atan2(-car.position.x, 60 - car.position.z);
    let turn = heading - car.rotation.y;
    turn = Math.atan2(Math.sin(turn), Math.cos(turn));
    car.rotation.y += turn * Math.min(1, delta * 1.5);
  };
}

const PHONE_RED = new THREE.Color(0.5, 0.1, 0.1),
  PHONE_AMBER = new THREE.Color(2.2, 1.6, 0.3),
  PHONE_GREEN = new THREE.Color(0.3, 2.2, 0.6);

function buildPayphone(scene: THREE.Object3D, night: Night): Animate {
  const g = new THREE.Group();
  g.position.set(PAYPHONE.x, 0, PAYPHONE.z);
  g.rotation.y = Math.PI / 2;
  const steel = std({ color: "#8a8d90", metalness: 0.6, roughness: 0.4 });
  const lamp = basic({ color: "#300", toneMapped: false });
  g.add(
    mesh(new THREE.BoxGeometry(0.12, 2.2, 0.12), steel, [0, 1.1, 0], undefined, true),
    mesh(
      new THREE.BoxGeometry(0.7, 0.9, 0.3),
      std({ color: "#8c8f93", metalness: 0.6, roughness: 0.35 }),
      [0, 1.4, 0.18],
      undefined,
      true,
    ),
    mesh(
      new THREE.BoxGeometry(0.1, 0.5, 0.1),
      std({ color: "#111" }),
      [-0.2, 1.45, 0.35],
      [0, 0, 0.1],
    ),
    mesh(new THREE.BoxGeometry(0.72, 0.25, 0.32), lamp, [0, 2.05, 0.18]),
  );
  scene.add(g);
  return () =>
    lamp.color.copy(
      night.police >= 0 || night.policeHere
        ? PHONE_GREEN
        : night.found.fuse
          ? PHONE_AMBER
          : PHONE_RED,
    );
}

function buildPoliceCar(scene: THREE.Object3D, world: RAPIER.World, night: Night): Animate {
  const g = new THREE.Group();
  g.position.set(POLICE_STOP.x + 3, 0, POLICE_STOP.z);
  g.visible = false;
  g.add(
    mesh(
      new THREE.BoxGeometry(1.9, 0.8, 4.8),
      std({ color: "#e8e8e8", roughness: 0.4 }),
      [0, 0.75, 0],
      undefined,
      true,
    ),
    mesh(
      new THREE.BoxGeometry(1.75, 0.65, 2.4),
      std({ color: "#111318", metalness: 0.8, roughness: 0.1 }),
      [0, 1.45, -0.3],
    ),
    mesh(
      new THREE.BoxGeometry(0.7, 0.14, 0.3),
      basic({ color: new THREE.Color(3, 0.2, 0.2), toneMapped: false }),
      [-0.4, 1.86, -0.3],
    ),
    mesh(
      new THREE.BoxGeometry(0.7, 0.14, 0.3),
      basic({ color: new THREE.Color(0.2, 0.5, 3), toneMapped: false }),
      [0.4, 1.86, -0.3],
    ),
  );
  const red = new THREE.PointLight("#ff2020", 0, 24, 2);
  red.position.set(-0.6, 2.4, -0.3);
  const blue = new THREE.PointLight("#2060ff", 0, 24, 2);
  blue.position.set(0.6, 2.4, -0.3);
  g.add(red, blue);
  scene.add(g);
  let here = false;
  let siren = 0;
  return (t, delta) => {
    if (!night.policeHere) return;
    if (!here) {
      here = true;
      g.visible = true;
      world.createCollider(
        RAPIER.ColliderDesc.cuboid(0.95, 0.8, 2.4).setTranslation(g.position.x, 0.8, g.position.z),
      );
    }
    const phase = Math.sin(t * 9) > 0;
    red.intensity = phase ? 40 : 0;
    blue.intensity = phase ? 0 : 40;
    if ((siren -= delta) <= 0 && !night.outcome) {
      siren = 3.6;
      playSound("siren");
    }
  };
}

function buildPlayground(
  scene: THREE.Object3D,
  world: RAPIER.World,
  reduced: () => boolean,
): Animate {
  const g = new THREE.Group();
  g.position.set(PARK.x, 0, PARK.z);
  scene.add(g);
  for (const x of [-2.2, 2.2])
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(0.2, 1.4, 0.9).setTranslation(PARK.x + x, 1.4, PARK.z),
    );
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(0.6, 1, 2).setTranslation(PARK.x + 6, 1, PARK.z - 3),
  );
  const metal = std({ color: "#5b3a2a", metalness: 0.5, roughness: 0.7 });
  for (const x of [-2.2, 2.2])
    for (const side of [-1, 1])
      g.add(
        mesh(
          new THREE.CylinderGeometry(0.06, 0.06, 3, 6),
          metal,
          [x, 1.4, side * 0.7],
          [side * -0.4, 0, 0],
        ),
      );
  g.add(
    mesh(new THREE.CylinderGeometry(0.07, 0.07, 4.6, 6), metal, [0, 2.75, 0], [0, 0, Math.PI / 2]),
  );
  const swings = [-1, 1].map((x) => {
    const s = new THREE.Group();
    s.position.set(x, 2.75, 0);
    for (const dx of [-0.3, 0.3])
      s.add(
        mesh(new THREE.CylinderGeometry(0.015, 0.015, 2.1, 4), std({ color: "#555" }), [
          dx,
          -1.05,
          0,
        ]),
      );
    s.add(mesh(new THREE.BoxGeometry(0.7, 0.05, 0.28), std({ color: "#222" }), [0, -2.1, 0]));
    g.add(s);
    return s;
  });
  const slide = new THREE.Group();
  slide.position.set(6, 0, -3);
  slide.add(
    mesh(
      new THREE.BoxGeometry(0.8, 0.08, 4),
      std({ color: "#8a2a1c", metalness: 0.3, roughness: 0.5 }),
      [0, 1, 0.6],
      [0.55, 0, 0],
      true,
    ),
    mesh(new THREE.BoxGeometry(0.8, 2, 0.1), metal, [0, 1, -1.3]),
  );
  g.add(slide);
  return (t) =>
    swings.forEach(
      (swing, i) => (swing.rotation.x = Math.sin(t * 1.3 + i * 2.2) * (reduced() ? 0.1 : 0.45)),
    );
}

const MODEL: Record<Tree["kind"], string> = {
  dead: "CommonTree_Dead_1",
  willow: "Willow_Dead_1",
  autumn: "CommonTree_1",
  pine: "PineTree_1",
};

function buildTrees(scene: THREE.Object3D, world: RAPIER.World) {
  const all = [...TREES.inside, ...TREES.outside];
  for (const kind of Object.keys(MODEL) as Tree["kind"][])
    createNatureBatch(
      scene,
      MODEL[kind],
      all
        .filter((t) => t.kind === kind)
        .map((t) => ({ x: t.x, y: 0, z: t.z, scale: t.scale, rotation: t.rotation })),
      {
        tree: true,
        leafColor: kind === "autumn" ? "#8f3a17" : kind === "pine" ? "#1c2a24" : undefined,
      },
    );
  createNatureBatch(
    scene,
    "Bush_1",
    HIDE_SPOTS.map((h, i) => ({ x: h.x, y: 0, z: h.z, scale: 2.7, rotation: i * 1.7 })),
    { leafColor: "#1d2e1d" },
  );
  for (const t of TREES.inside)
    world.createCollider(RAPIER.ColliderDesc.cylinder(1.5, 0.4).setTranslation(t.x, 1.5, t.z));
}

/** Hollow Lane on Halloween night: survive the masked man, or escape by car or police. */
export function mountHollowLane(
  host: HTMLElement,
  state: RouteState | null,
  navigate: (path: string, state: RouteState) => void,
  retry: () => void,
  signal: AbortSignal,
) {
  document.title = "Hollow Lane | The painted forest";
  const night = createNight();
  const exit = () => navigate("/", { returnPortal: state?.fromPortal });
  openInventory("seasons", LANE_ITEMS, [{ id: "flashlight", on: true }]);
  const found = { keys: false, gas: false, battery: false, fuse: false };
  let health: number = NIGHT.health;
  let police: "none" | "called" | "here" = "none";
  let outcome: Outcome | null = null;
  let resultIn = 0;
  let message = "";
  let messageTime = 0;

  // HUD.
  const section = element("section", "lane-hud");
  section.setAttribute("aria-label", "Survival status");
  const overlay = element("div", "lane-overlay");
  const awarenessText = element("span");
  const awarenessLine = element("p", "lane-awareness", element("span", "lane-eye"), awarenessText);
  awarenessLine.setAttribute("role", "status");
  const promptText = element("span");
  const interactKey = element("kbd");
  const promptLine = element(
    "div",
    "lane-prompt",
    interactKey,
    element("small", "", "Hold"),
    promptText,
    element("i"),
  );
  const stamina = element("div", "lane-stamina", element("i"));
  stamina.setAttribute("role", "meter");
  stamina.setAttribute("aria-label", "Stamina");
  stamina.setAttribute("aria-valuemin", "0");
  stamina.setAttribute("aria-valuemax", "100");
  overlay.append(
    element("div", "hollow-danger"),
    element("div", "lane-hidden", element("span", "", "Hidden")),
    awarenessLine,
    promptLine,
    stamina,
  );
  const objectives = element("div", "lane-objectives");
  const messageLine = element("p", "hollow-message");
  messageLine.setAttribute("role", "status");
  section.append(overlay, objectives, messageLine);
  host.append(section);
  const disposeInventoryBar = mountInventoryBar(section, {
    store: gameStore,
    resultScreenActive: isResultScreenActive,
    playSound,
  });
  const drawObjectives = () => {
    const { settings } = gameStore.getSnapshot();
    const key = keyLabel(settings.bindings.interact);
    const car = element("ul");
    for (const part of CAR_PARTS)
      car.append(element("li", found[part] ? "is-done" : "", PART_LABEL[part]));
    if (CAR_PARTS.every((part) => found[part]))
      car.append(element("li", "is-goal", "Start the car in the cul-de-sac"));
    const cops = element("ul", "", element("li", found.fuse ? "is-done" : "", PART_LABEL.fuse));
    if (found.fuse && police === "none")
      cops.append(element("li", "is-goal", "Fix the payphone on Elm Street"));
    if (police === "called") {
      const timer = element("li", "is-goal");
      timer.dataset.policeTimer = "";
      cops.append(timer);
    }
    if (police === "here")
      cops.append(element("li", "is-goal", "Get to the police at the south end"));
    objectives.replaceChildren(
      element("h2", "", "Escape Hollow Lane"),
      element("p", "", "By car"),
      car,
      element("p", "", "By police"),
      cops,
      element(
        "small",
        "",
        element("kbd", "", key),
        " to search, pick up, open doors and hide. Hold ",
        element("kbd", "", key),
        " on a door from inside to lock it. ",
        element("kbd", "", "1"),
        " switches the flashlight. Hold ",
        keyLabel(settings.sprintKey ?? settings.bindings.dodge),
        " to sprint, but he hears it.",
      ),
    );
    interactKey.textContent = key;
  };
  drawObjectives();
  const say = (text: string, seconds = 3.2) => {
    message = text;
    messageTime = seconds;
  };
  const showResult = () => {
    setResultScreenActive(true);
    document.exitPointerLock?.();
    const again = button("Play the night again", retry);
    const dialog = element(
      "div",
      `combat-result ${outcome === "dead" ? "is-death" : "is-victory"}`,
      element("h2", "", OUTCOME_TITLE[outcome!]),
      element("div", "combat-result-actions", again, button("Return to the forest", exit)),
    );
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-label", "Night result");
    section.append(dialog);
    again.focus();
  };
  const onEvent = (event: NightEvent) => {
    switch (event.type) {
      case "awake":
        say("Somewhere up the street, a door creaks open.", 4);
        break;
      case "found": {
        addItem(event.item);
        if (isPart(event.item)) found[event.item as keyof typeof found] = true;
        say(`Got the ${PART_LABEL[event.item].toLowerCase()}.`);
        drawObjectives();
        break;
      }
      case "revealed":
        say(`There's a ${PART_LABEL[event.item].toLowerCase()} in here.`, 2.5);
        break;
      case "healed":
        say(event.health === NIGHT.health ? "Patched up. Keep moving." : "Second wind.", 2.4);
        health = event.health;
        break;
      case "locked":
        if (event.locked) say("Door locked. It won't hold him forever.", 2.6);
        break;
      case "bash":
        say("He's breaking the door down!", 1.6);
        break;
      case "broken":
        say("The door gives way.", 2);
        break;
      case "empty":
        say("Nothing useful here.", 1.8);
        break;
      case "spotted":
        say("He sees you. Run.", 2);
        break;
      case "heard":
        say("He heard that.", 2);
        break;
      case "sense":
        say("He can feel you nearby. Move.", 2.6);
        break;
      case "lost":
        say("He lost you. Stay out of sight.", 2.6);
        break;
      case "pulledOut":
        say("He found your hiding place!", 2);
        break;
      case "hit":
        health = event.health;
        section.append(element("div", "hurt-flash"));
        if (event.health > 0) say("You're hurt. One more and it's over.", 3.5);
        break;
      case "exhausted":
        say("Out of breath.", 1.6);
        break;
      case "carStart":
        say("The engine's turning over. He heard that.", 3);
        break;
      case "called":
        removeItem("fuse");
        police = "called";
        drawObjectives();
        say("Police are on their way. Stay alive.", 4);
        break;
      case "policeHere":
        police = "here";
        drawObjectives();
        say("Sirens at the south end of the lane!", 4);
        break;
      case "escaped":
        outcome = event.outcome;
        message = "";
        resultIn = event.outcome === "dead" ? 1.4 : 2.6;
        break;
    }
  };
  const unsubscribeUse = onUse((id) => {
    if (id !== "medkit" && id !== "drink") return false;
    const events = applyBonus(night, id as Bonus);
    events.forEach(onEvent);
    return events.length > 0;
  });
  const previousFog = sunlight.fogColor.value.clone();
  sunlight.fogColor.value.set(LANE_FOG);
  Object.assign(nightFx, { won: 0, dark: 0, flash: 0, danger: 0 });
  const reduced = () => gameStore.getSnapshot().settings.reducedMotion;

  return mountLevel(host, signal, {
    chapter: "Halloween",
    title: "Hollow Lane",
    mood: "grove",
    spawn: { position: LANE_START, yaw: Math.PI },
    killY: -20,
    cameraDistance: 6,
    post: {
      atmosphere: {
        density: 0.02,
        falloff: 0.28,
        fogStart: 8,
        skyFog: 0.15,
        scatter: 0.1,
        shafts: 0.25,
        shaftDensity: 0.02,
        shaftDistance: 50,
      },
    },
    onEnter: exit,
    build: ({ scene, world, camera }) => {
      scene.background = new THREE.Color("#05050a");
      scene.fog = new THREE.Fog(LANE_FOG, 24, 120);
      const skyLight = new THREE.HemisphereLight("#4f5a86", "#15110d", 0.45);
      const moon = new THREE.DirectionalLight("#a9b8ff", 0.9);
      moon.position.copy(MOON).multiplyScalar(140);
      const shadow = moon.shadow.camera;
      shadow.left = shadow.bottom = -115;
      shadow.right = shadow.top = 115;
      shadow.far = 320;
      shadow.updateProjectionMatrix();
      moon.shadow.bias = -0.0005;
      const sky = createSkyMaterial();
      const dome = new THREE.Mesh(new THREE.SphereGeometry(320, 32, 16), sky);
      dome.frustumCulled = false;
      dome.renderOrder = -1;
      scene.add(skyLight, dome);

      // Ground.
      world.createCollider(
        RAPIER.ColliderDesc.cuboid(GROUND, 0.5, GROUND).setTranslation(0, -0.5, 0),
      );
      const textures = laneTextures();
      const ground = mesh(
        new THREE.PlaneGeometry(GROUND * 2, GROUND * 2),
        std({ map: textures.map, roughnessMap: textures.roughnessMap, metalness: 0.05 }),
        undefined,
        [-Math.PI / 2, 0, 0],
      );
      ground.receiveShadow = true;
      scene.add(
        ground,
        mesh(
          new THREE.RingGeometry(GROUND * 0.98, 300, 64),
          std({ color: "#0e100c", roughness: 1 }),
          [0, -0.02, 0],
          [-Math.PI / 2, 0, 0],
        ),
      );

      const animate: Animate[] = [
        createLaneHouses(scene, world, night),
        buildStreetLamps(scene, world, night),
        buildSearchSpots(scene, night),
        buildPartPickups(scene, night),
        buildStationWagon(scene, world, night),
        buildPayphone(scene, night),
        buildPoliceCar(scene, world, night),
        buildPlayground(scene, world, reduced),
        createGhosts(scene, GRAVEYARD as Point, reduced),
        createGroundMist(scene, GROUND * 2, 0.55),
        createBats(scene, reduced),
      ];
      buildTrees(scene, world);
      buildPorchGlows(scene);
      buildJackOLanterns(scene);
      createGraveyard(scene, world, GRAVEYARD);
      const leaves = createEmbers({
        count: 500,
        radius: 110,
        height: 18,
        speed: -0.8,
        size: 0.26,
        color: "#7a3416",
        additive: false,
        sway: 1.6,
        opacity: 0.85,
      });
      scene.add(leaves.points);
      animate.push((t) => leaves.update(t));
      const killer = createKiller(scene, night, signal);

      const portal = createPortalPainting("/assets/tree.jpg");
      portal.position.set(...LANE_PORTAL);
      portal.rotation.y = Math.PI;
      portal.scale.setScalar(1.2);
      scene.add(portal);

      // The flashlight beam: from the lens toward where the camera looks.
      const torch = new THREE.SpotLight("#fff1d6", 75, 24, 0.55, 0.55, 1.6);
      torch.castShadow = true;
      torch.shadow.mapSize.setScalar(512);
      torch.shadow.bias = -0.0008;
      scene.add(torch, torch.target);
      const forward = new THREE.Vector3();

      const timers = { strike: -10, next: 20, thunder: -1, heartbeat: 0, rummage: 0 };
      let interactPress = -1;
      return {
        sun: moon,
        held: "flashlight",
        portals: [
          {
            id: "forest",
            x: LANE_PORTAL[0],
            y: 0,
            z: LANE_PORTAL[2],
            prompt: "Jump through to flee back to the forest",
          },
        ],
        update: ({ time: t, delta, player }) => {
          const dt = Math.min(delta, 0.05);
          for (const a of animate) a(t, delta);
          killer(camera, t, delta);

          // Storm.
          if (t >= timers.next) {
            timers.strike = t;
            timers.thunder = t + 0.6 + Math.random() * 1.6;
            timers.next = t + 20 + Math.random() * 30;
          }
          if (timers.thunder > 0 && t >= timers.thunder) {
            timers.thunder = -1;
            playSound("thunder", { intensity: 0.5 + Math.random() * 0.5 });
          }
          const since = t - timers.strike;
          const pulse = (at: number, size: number) =>
            since >= at ? size * Math.exp(-(since - at) * 18) : 0;
          nightFx.flash =
            (pulse(0, 1) + pulse(0.14, 0.7) + pulse(0.32, 1.1)) * (reduced() ? 0.3 : 1);
          nightFx.won = THREE.MathUtils.damp(
            nightFx.won,
            outcome === "car" || outcome === "police" ? 1 : 0,
            0.8,
            dt,
          );
          sky.uniforms.uTime.value = t;
          sky.uniforms.uWon.value = nightFx.won * 0.5;
          sky.uniforms.uFlash.value = nightFx.flash;
          moon.intensity = 0.9 + nightFx.flash * 5;
          skyLight.intensity = 0.45 + nightFx.flash * 1.6;
          (scene.fog as THREE.Fog).color.copy(sunlight.fogColor.value);

          // Flashlight.
          camera.getWorldDirection(forward);
          const lens = heldItems.flashlightLens;
          if (lens) lens.getWorldPosition(torch.position);
          else torch.position.set(player.x, player.y + 1.2, player.z);
          torch.position.addScaledVector(forward, 0.12);
          heldItems.flashlightOn = isOn("flashlight");
          torch.target.position.set(
            torch.position.x + forward.x * 10,
            torch.position.y + Math.min(forward.y, 0.1) * 10 - 1.2,
            torch.position.z + forward.z * 10,
          );
          torch.intensity = THREE.MathUtils.damp(
            torch.intensity,
            heldItems.flashlightOn ? 75 : 0,
            25,
            delta,
          );

          cameraRig.indoor = insideHouse(player) >= 0;
          // The night's rules.
          const controls = gameStore.getSnapshot().paused ? null : heldControls();
          if (controls) {
            const moving = controls.forward || controls.backward || controls.left || controls.right;
            if (interactPress < 0) interactPress = controls.interactPress;
            const press = controls.interactPress !== interactPress;
            interactPress = controls.interactPress;
            const events = stepNight(night, dt, {
              x: player.x,
              z: player.z,
              moving,
              sprinting: moving && controls.run,
              flashlight: isOn("flashlight"),
              interact: controls.interact,
              press,
            });
            setSprintAllowed(sprintAllowed(night));
            const k = night.killer;
            const gap = Math.hypot(k.x - player.x, k.z - player.z);
            const mood = awareness(night);
            nightFx.danger = THREE.MathUtils.damp(
              nightFx.danger,
              mood === "asleep"
                ? 0
                : Math.max(0, 1 - gap / DANGER_RANGE) * (mood === "hunting" ? 1 : 0.6),
              4,
              dt,
            );
            setChase(!night.outcome && (k.mode === "chase" || k.mode === "attack"));
            if (nightFx.danger > 0.2 && !night.outcome) {
              if ((timers.heartbeat -= dt) <= 0) {
                playSound("heartbeat", { intensity: nightFx.danger });
                timers.heartbeat = THREE.MathUtils.lerp(1.3, 0.42, nightFx.danger);
              }
            } else timers.heartbeat = 0;
            const focus = night.survivor.focus;
            if (
              focus?.kind === "search" &&
              night.survivor.hold > 0 &&
              (timers.rummage -= dt) <= 0
            ) {
              playSound("rummage");
              timers.rummage = 0.25 + Math.random() * 0.25;
            }
            for (const event of events) {
              switch (event.type) {
                case "spotted":
                case "pulledOut":
                  playSound("sting");
                  break;
                case "sense":
                  playSound("sense");
                  break;
                case "shift":
                  playSound("shift");
                  break;
                case "windup":
                  playSound("bossWindup", { intensity: 0.4 });
                  break;
                case "hit":
                  playSound("stab");
                  playSound("hurt");
                  break;
                case "revealed":
                  playSound("sigil", { intensity: 0.6 });
                  break;
                case "found":
                  playSound("grab");
                  break;
                case "door":
                  playSound(event.open ? "creak" : "slam", {
                    intensity: event.by === "killer" ? 1 : 0.7,
                  });
                  break;
                case "locked":
                  playSound("latch");
                  break;
                case "bash":
                  playSound("bossImpact", { intensity: 0.5 });
                  break;
                case "broken":
                  playSound("bossImpact", { intensity: 1 });
                  playSound("slam");
                  break;
                case "hidden":
                  playSound("rummage");
                  break;
                case "empty":
                  playSound("deny");
                  break;
                case "carStart":
                  playSound("engine");
                  break;
                case "called":
                  playSound("dial");
                  break;
                case "escaped":
                  if (event.outcome === "dead") playSound("shriek");
                  else {
                    playSound("hollowWin");
                    if (event.outcome === "car") playSound("engine");
                  }
                  setChase(false);
                  break;
              }
              onEvent(event);
            }

            // Overlay signals.
            const needed = focus ? holdTime(night, focus) : 0;
            const max = maxStamina(night);
            overlay.style.setProperty("--danger", nightFx.danger.toFixed(3));
            overlay.style.setProperty("--stamina", (night.survivor.stamina / 100).toFixed(3));
            overlay.style.setProperty("--stamina-max", (max / 100).toFixed(3));
            overlay.style.setProperty(
              "--channel",
              (needed > 0 ? Math.min(1, night.survivor.hold / needed) : 0).toFixed(3),
            );
            overlay.dataset.awareness = mood;
            overlay.dataset.hidden = night.survivor.hidden
              ? HIDE_SPOTS[night.survivor.hide].kind
              : "none";
            const prompt = promptFor(night, focus);
            overlay.dataset.prompt = String(Boolean(prompt));
            overlay.dataset.hold = String(needed > 0);
            overlay.dataset.winded = String(!sprintAllowed(night));
            overlay.dataset.rested = String(night.survivor.stamina >= max - 0.5);
            stamina.setAttribute("aria-valuenow", String(Math.round(night.survivor.stamina)));
            if (awarenessText.textContent !== AWARENESS_LABEL[mood])
              awarenessText.textContent = AWARENESS_LABEL[mood];
            if (promptText.textContent !== (prompt ?? "")) promptText.textContent = prompt ?? "";
            const timer = objectives.querySelector<HTMLElement>("[data-police-timer]");
            if (timer && night.police >= 0) {
              const seconds = Math.ceil(night.police);
              timer.textContent = `Police arriving in ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
            }
          }
          section.classList.toggle("is-injured", health < NIGHT.health);
          section.hidden = gameStore.getSnapshot().paused;
          if (messageTime > 0 && (messageTime -= delta) <= 0) message = "";
          if (messageLine.textContent !== message) messageLine.textContent = message;
          messageLine.classList.toggle("is-visible", Boolean(message));
          if (resultIn > 0 && (resultIn -= delta) <= 0) showResult();
          return "";
        },
        dispose: () => {
          unsubscribeUse();
          closeInventory("seasons");
          disposeInventoryBar();
          section.remove();
          setResultScreenActive(false);
          sunlight.fogColor.value.copy(previousFog);
          setSprintAllowed(true);
          setChase(false);
          heldItems.flashlightLens = null;
          cameraRig.indoor = false;
        },
      };
    },
  });
}
