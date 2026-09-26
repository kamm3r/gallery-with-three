import {
  lazy,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
} from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { CuboidCollider, CylinderCollider, RigidBody } from "@react-three/rapier";
import { useWorld } from "koota/react";
import * as THREE from "three";
import { PlayerPosition } from "../gameplay/ecs/traits";
import {
  CUL_DE_SAC,
  DOORS,
  ESCAPE_CAR,
  FLOOR_Y,
  GRAVEYARD,
  HIDE_SPOTS,
  HOUSES,
  houseToWorld,
  insideHouse,
  LAMP_GLOW,
  LANE_START,
  MONSTER_HOUSE,
  PARK,
  PAYPHONE,
  POLICE_STOP,
  SEARCH_SPOTS,
  STREET_LAMPS,
  STREETS,
  TREES,
  type Point,
  type Tree,
} from "../gameplay/hollowLane";
import {
  awareness,
  canStartCar,
  createNight,
  holdTime,
  maxStamina,
  BONUS,
  PARTS,
  sprintAllowed,
  stepNight,
  applyBonus,
  type Bonus,
  type Focus,
  type Night,
  type NightEvent,
  type Loot,
} from "../gameplay/hollowNight";
import { playSound, setChase } from "../gameplay/sound";
import { setSprintAllowed } from "../gameplay/sprintGate";
import { cameraRig } from "../gameplay/cameraRig";
import { isOn, onUse } from "../gameplay/inventory";
import { heldItems } from "../gameplay/heldItems";
import { sunlight } from "../gameplay/sunlight";
import { heldControls } from "../hooks/usePlayerControls";
import { useReducedMotion } from "../hooks/useReducedMotion";
import { Embers } from "./ashFx";
import type { AtmosphereSettings } from "./AtmosphereEffect";
import {
  Bats,
  createSkyMaterial,
  Ghosts,
  Graveyard,
  GroundMist,
  MOON,
  nightFx,
  seeded,
  usePumpkinGeometry,
} from "./halloweenProps";
import { Killer } from "./Killer";
import { houseDressing, LaneHouses } from "./LaneHouses";

// Hollow Lane on Halloween night: a quiet street of craftsman houses under a
// storm, jack-o'-lanterns on every porch, the Monster House glaring down the
// cul-de-sac, and a masked man walking the sidewalks. See hollowNight.ts for
// the rules; this file draws the street and feeds the rules each frame.

const NatureBatch = lazy(() =>
  import("./UltimateNature").then((module) => ({ default: module.NatureBatch })),
);

const GROUND = 125;
export const LANE_FOG = "#10101a";

export const LANE_ATMOSPHERE: AtmosphereSettings = {
  density: 0.02,
  falloff: 0.28,
  fogStart: 8,
  skyFog: 0.15,
  scatter: 0.1,
  shafts: 0.25,
  shaftDensity: 0.02,
  shaftDistance: 50,
};

/** Per-frame survivor state for the HUD, read outside React. */
export const laneSignals = {
  stamina: 100,
  maxStamina: 100,
  sprintAllowed: true,
  hidden: null as "wardrobe" | "hedge" | null,
  /** What E does right now ("Search kitchen drawers"), or null. */
  prompt: null as string | null,
  /** Whether that needs E held, and how far along the hold is (0..1). */
  hold: false,
  progress: 0,
  awareness: "asleep" as ReturnType<typeof awareness>,
  police: -1,
};

// --- Ground ------------------------------------------------------------------

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

function LaneGround() {
  const textures = useMemo(laneTextures, []);
  useEffect(
    () => () => {
      textures.map.dispose();
      textures.roughnessMap.dispose();
    },
    [textures],
  );
  return (
    <>
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider args={[GROUND, 0.5, GROUND]} position={[0, -0.5, 0]} />
      </RigidBody>
      <mesh rotation-x={-Math.PI / 2} receiveShadow>
        <planeGeometry args={[GROUND * 2, GROUND * 2]} />
        <meshStandardMaterial
          map={textures.map}
          roughnessMap={textures.roughnessMap}
          metalness={0.05}
        />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position-y={-0.02}>
        <ringGeometry args={[GROUND * 0.98, 300, 64]} />
        <meshStandardMaterial color="#0e100c" roughness={1} />
      </mesh>
    </>
  );
}

// --- Lights -----------------------------------------------------------------

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

/** A soft additive pool of light on the ground: light without a light. */
function useGlowMaterial(color: THREE.ColorRepresentation, opacity: number) {
  const material = useMemo(() => {
    const map = glowTexture();
    return new THREE.MeshBasicMaterial({
      map,
      color,
      transparent: true,
      opacity,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
  }, [color, opacity]);
  useEffect(
    () => () => {
      material.map?.dispose();
      material.dispose();
    },
    [material],
  );
  return material;
}

function StreetLamps({ night }: { night: MutableRefObject<Night> }) {
  const pool = useGlowMaterial("#ffc987", 0.28);
  const lights = useRef<(THREE.PointLight | null)[]>([]);
  const bulbs = useRef<(THREE.Mesh | null)[]>([]);
  const bulb = useMemo(
    () => new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 2.3, 1.3), toneMapped: false }),
    [],
  );
  const dead = useMemo(() => new THREE.MeshBasicMaterial({ color: "#2a2620" }), []);
  useEffect(
    () => () => {
      bulb.dispose();
      dead.dispose();
    },
    [bulb, dead],
  );
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const k = night.current.killer;
    STREET_LAMPS.forEach((lamp, i) => {
      // Lamps stutter when he walks under them.
      const near = Math.hypot(lamp.x - k.x, lamp.z - k.z) < 12 && k.mode !== "dormant";
      const on = !near || Math.sin(t * 23 + i * 7) * Math.sin(t * 9.1 + i) > -0.2;
      const light = lights.current[i];
      if (light) light.intensity = on ? 26 + Math.sin(t * 50 + i) * (i === 3 ? 6 : 0.5) : 2;
      const mesh = bulbs.current[i];
      if (mesh) mesh.material = on ? bulb : dead;
    });
  });
  return (
    <>
      {STREET_LAMPS.map((lamp, i) => {
        // The arm reaches out over the nearest road.
        const toward = Math.abs(lamp.z - 6) < 9 && Math.abs(lamp.x) > 9 ? (lamp.z < 6 ? 1 : -1) : 0;
        const armX = toward === 0 ? (lamp.x < 0 ? 1.4 : -1.4) : 0;
        const armZ = toward * 1.4;
        return (
          <group key={i} position={[lamp.x, 0, lamp.z]}>
            <RigidBody type="fixed" colliders={false}>
              <CylinderCollider args={[2.8, 0.14]} position={[0, 2.8, 0]} />
            </RigidBody>
            <mesh position-y={2.9} castShadow>
              <cylinderGeometry args={[0.08, 0.13, 5.8, 8]} />
              <meshStandardMaterial color="#1c1d20" metalness={0.6} roughness={0.5} />
            </mesh>
            <mesh
              position={[armX / 2, 5.75, armZ / 2]}
              rotation={[toward ? Math.PI / 2 : 0, 0, toward ? 0 : Math.PI / 2]}
            >
              <cylinderGeometry args={[0.05, 0.05, 1.5, 6]} />
              <meshStandardMaterial color="#1c1d20" metalness={0.6} roughness={0.5} />
            </mesh>
            <mesh position={[armX, 5.6, armZ]}>
              <cylinderGeometry args={[0.18, 0.4, 0.35, 10]} />
              <meshStandardMaterial color="#232428" metalness={0.5} roughness={0.5} />
            </mesh>
            <mesh
              ref={(mesh) => {
                bulbs.current[i] = mesh;
              }}
              position={[armX, 5.38, armZ]}
              material={bulb}
            >
              <sphereGeometry args={[0.16, 10, 6]} />
            </mesh>
            <mesh position={[armX, 0.04, armZ]} rotation-x={-Math.PI / 2} material={pool}>
              <planeGeometry args={[LAMP_GLOW * 2, LAMP_GLOW * 2]} />
            </mesh>
            {/* Every other lamp is a real light; the pools sell the rest. */}
            {i % 2 === 0 && (
              <pointLight
                ref={(light) => {
                  lights.current[i] = light;
                }}
                position={[armX, 5.2, armZ]}
                color="#ffc27a"
                intensity={26}
                distance={16}
                decay={2}
              />
            )}
          </group>
        );
      })}
    </>
  );
}

function PorchGlows() {
  const pool = useGlowMaterial("#ffb060", 0.35);
  const spots = useMemo(
    () =>
      HOUSES.flatMap((house, i) =>
        houseDressing(i).porchLight
          ? [{ ...houseToWorld(house, 0.5, house.hd + 1.6), yaw: house.yaw }]
          : [],
      ),
    [],
  );
  return (
    <>
      {spots.map((spot, i) => (
        <mesh key={i} position={[spot.x, 0.38, spot.z]} rotation-x={-Math.PI / 2} material={pool}>
          <planeGeometry args={[5, 5]} />
        </mesh>
      ))}
    </>
  );
}

// --- Props --------------------------------------------------------------------

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

function JackOLanterns() {
  const { body, face } = usePumpkinGeometry();
  const bodies = useRef<THREE.InstancedMesh>(null);
  const faces = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const transform = new THREE.Object3D();
    LANTERNS.forEach((p, i) => {
      transform.position.set(p.x, p.y, p.z);
      transform.rotation.set(0, p.yaw, 0);
      transform.scale.setScalar(p.scale);
      transform.updateMatrix();
      bodies.current!.setMatrixAt(i, transform.matrix);
      faces.current!.setMatrixAt(i, transform.matrix);
    });
    for (const mesh of [bodies.current!, faces.current!]) {
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
    }
  }, []);
  return (
    <>
      <instancedMesh
        ref={bodies}
        args={[body, undefined, LANTERNS.length]}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial color="#c65b1e" roughness={0.9} />
      </instancedMesh>
      <instancedMesh ref={faces} args={[face, undefined, LANTERNS.length]}>
        <meshBasicMaterial color={[2.3, 1.25, 0.35]} toneMapped={false} side={THREE.DoubleSide} />
      </instancedMesh>
    </>
  );
}

/** Outdoor bins, crates and toolboxes; indoors the furniture is the prop. A
 * glint marks every spot until it's searched. */
function SearchSpots({ night }: { night: MutableRefObject<Night> }) {
  const glints = useRef<(THREE.Mesh | null)[]>([]);
  const lids = useRef<(THREE.Mesh | null)[]>([]);
  const glint = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(1.6, 1.8, 2.4),
        toneMapped: false,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    [],
  );
  useEffect(() => () => glint.dispose(), [glint]);
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    glint.opacity = 0.35 + 0.35 * Math.max(0, Math.sin(t * 2.2));
    SEARCH_SPOTS.forEach((_, i) => {
      const searched = night.current.searched[i];
      const g = glints.current[i];
      // Only tonight's live containers glint.
      if (g) g.visible = night.current.live[i] && !searched;
      const lid = lids.current[i];
      if (lid && searched) {
        lid.position.set(0.5, 0.05, 0.4);
        lid.rotation.set(Math.PI / 2 - 0.2, 0, 0.4);
      }
    });
  });
  return (
    <>
      {SEARCH_SPOTS.map((spot, i) => {
        const indoors = spot.house >= 0;
        const kind = i % 3;
        const lid = (mesh: THREE.Mesh | null) => {
          lids.current[i] = mesh;
        };
        return (
          <group key={i} position={[spot.x, indoors ? FLOOR_Y : 0, spot.z]} rotation-y={i * 1.3}>
            {!indoors &&
              (kind === 0 ? (
                <>
                  <mesh position-y={0.5} castShadow>
                    <cylinderGeometry args={[0.32, 0.28, 1, 12]} />
                    <meshStandardMaterial color="#3d4247" metalness={0.5} roughness={0.6} />
                  </mesh>
                  <mesh ref={lid} position-y={1.03}>
                    <cylinderGeometry args={[0.35, 0.35, 0.06, 12]} />
                    <meshStandardMaterial color="#4a5055" metalness={0.5} roughness={0.5} />
                  </mesh>
                </>
              ) : kind === 1 ? (
                <>
                  <mesh position-y={0.3} castShadow>
                    <boxGeometry args={[0.8, 0.6, 0.6]} />
                    <meshStandardMaterial color="#7a5a3a" roughness={1} />
                  </mesh>
                  <mesh ref={lid} position={[0.1, 0.72, 0]} rotation-y={0.4}>
                    <boxGeometry args={[0.55, 0.35, 0.45]} />
                    <meshStandardMaterial color="#8a6a45" roughness={1} />
                  </mesh>
                </>
              ) : (
                <>
                  <mesh position-y={0.2} castShadow>
                    <boxGeometry args={[0.7, 0.4, 0.35]} />
                    <meshStandardMaterial color="#8a1f1a" metalness={0.4} roughness={0.5} />
                  </mesh>
                  <mesh ref={lid} position-y={0.44}>
                    <boxGeometry args={[0.72, 0.08, 0.37]} />
                    <meshStandardMaterial color="#9a2a22" metalness={0.4} roughness={0.5} />
                  </mesh>
                </>
              ))}
            <mesh
              ref={(mesh) => {
                glints.current[i] = mesh;
              }}
              position-y={indoors ? 1.25 : 1.35}
              material={glint}
            >
              <sphereGeometry args={[0.07, 8, 6]} />
            </mesh>
          </group>
        );
      })}
    </>
  );
}

/** A dug-up part floats, glowing, where it was found until you pick it up. */
function PartPickups({ night }: { night: MutableRefObject<Night> }) {
  const groups = useRef<Partial<Record<Loot, THREE.Group | null>>>({});
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const n = night.current;
    for (const part of [...PARTS, ...BONUS]) {
      const g = groups.current[part];
      if (!g) continue;
      const spot = n.revealed.findIndex((p) => p === part);
      g.visible = spot >= 0;
      if (spot < 0) continue;
      const at = SEARCH_SPOTS[spot];
      g.position.set(at.x, (at.house >= 0 ? FLOOR_Y : 0) + 1.1 + Math.sin(t * 2.4) * 0.06, at.z);
      g.rotation.y = t * 1.2;
    }
  });
  const glow = (
    <mesh>
      <sphereGeometry args={[0.28, 12, 8]} />
      <meshBasicMaterial
        color={[1.2, 0.9, 0.5]}
        transparent
        opacity={0.25}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        toneMapped={false}
      />
    </mesh>
  );
  const set = (part: Loot) => (group: THREE.Group | null) => {
    groups.current[part] = group;
  };
  return (
    <>
      <group ref={set("keys")} visible={false}>
        <mesh>
          <torusGeometry args={[0.07, 0.015, 6, 16]} />
          <meshStandardMaterial color="#d9b35a" metalness={0.9} roughness={0.3} />
        </mesh>
        <mesh position={[0.12, -0.04, 0]} rotation-z={-0.6}>
          <boxGeometry args={[0.16, 0.035, 0.01]} />
          <meshStandardMaterial color="#c9c9c9" metalness={0.9} roughness={0.3} />
        </mesh>
        {glow}
      </group>
      <group ref={set("gas")} visible={false}>
        <mesh>
          <boxGeometry args={[0.3, 0.36, 0.14]} />
          <meshStandardMaterial color="#b3261c" metalness={0.3} roughness={0.5} />
        </mesh>
        <mesh position={[0.1, 0.22, 0]} rotation-z={-0.5}>
          <cylinderGeometry args={[0.025, 0.025, 0.14, 6]} />
          <meshStandardMaterial color="#d8c23a" />
        </mesh>
        {glow}
      </group>
      <group ref={set("battery")} visible={false}>
        <mesh>
          <boxGeometry args={[0.32, 0.22, 0.18]} />
          <meshStandardMaterial color="#1c1c1f" roughness={0.6} />
        </mesh>
        {[-0.09, 0.09].map((x) => (
          <mesh key={x} position={[x, 0.13, 0]}>
            <cylinderGeometry args={[0.025, 0.025, 0.05, 6]} />
            <meshStandardMaterial color={x < 0 ? "#b82020" : "#9a9a9a"} metalness={0.7} />
          </mesh>
        ))}
        {glow}
      </group>
      <group ref={set("fuse")} visible={false}>
        <mesh rotation-z={Math.PI / 2}>
          <cylinderGeometry args={[0.035, 0.035, 0.18, 8]} />
          <meshStandardMaterial color="#e9e3d0" roughness={0.4} />
        </mesh>
        {[-0.1, 0.1].map((x) => (
          <mesh key={x} position={[x, 0, 0]} rotation-z={Math.PI / 2}>
            <cylinderGeometry args={[0.04, 0.04, 0.04, 8]} />
            <meshStandardMaterial color="#c0a060" metalness={0.9} roughness={0.3} />
          </mesh>
        ))}
        {glow}
      </group>
      <group ref={set("medkit")} visible={false}>
        <mesh>
          <boxGeometry args={[0.32, 0.22, 0.12]} />
          <meshStandardMaterial color="#e8e4dc" roughness={0.5} />
        </mesh>
        {[
          [0.16, 0.05],
          [0.05, 0.16],
        ].map(([w, h], k) => (
          <mesh key={k} position={[0, 0, 0.065]}>
            <planeGeometry args={[w, h]} />
            <meshBasicMaterial color="#c0201a" />
          </mesh>
        ))}
        {glow}
      </group>
      <group ref={set("drink")} visible={false}>
        <mesh>
          <cylinderGeometry args={[0.05, 0.05, 0.2, 12]} />
          <meshStandardMaterial color="#2bd06a" metalness={0.6} roughness={0.3} />
        </mesh>
        {glow}
      </group>
    </>
  );
}

/** The flashlight from the inventory, held in the right hand: the beam
 * starts at its lens and aims where the camera looks. */
function Flashlight() {
  const world = useWorld();
  const camera = useThree((state) => state.camera);
  const light = useRef<THREE.SpotLight>(null);
  const forward = useMemo(() => new THREE.Vector3(), []);
  useFrame((_, delta) => {
    const spot = light.current;
    const player = world.get(PlayerPosition);
    if (!spot || !player?.valid) return;
    camera.getWorldDirection(forward);
    const lens = heldItems.flashlightLens;
    if (lens) lens.getWorldPosition(spot.position);
    else spot.position.set(player.x, player.y + 1.2, player.z);
    // A hair in front of the lens so the torch itself never shadows the beam.
    spot.position.addScaledVector(forward, 0.12);
    heldItems.flashlightOn = isOn("flashlight");
    spot.target.position.set(
      spot.position.x + forward.x * 10,
      spot.position.y + Math.min(forward.y, 0.1) * 10 - 1.2,
      spot.position.z + forward.z * 10,
    );
    spot.target.updateMatrixWorld();
    // Kept mounted when off (intensity 0) so toggling never recompiles shaders.
    spot.intensity = THREE.MathUtils.damp(spot.intensity, isOn("flashlight") ? 75 : 0, 25, delta);
  });
  return (
    <spotLight
      ref={light}
      color="#fff1d6"
      intensity={75}
      distance={24}
      decay={1.6}
      angle={0.55}
      penumbra={0.55}
      castShadow
      shadow-mapSize={[512, 512]}
      shadow-bias={-0.0008}
    />
  );
}

/** What E does right now, as the HUD's prompt. */
export function promptFor(night: Night, focus: Focus | null): string | null {
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

export const PART_NAME: Record<Loot, string> = {
  medkit: "med kit",
  drink: "energy drink",
  keys: "car keys",
  gas: "gas can",
  battery: "battery",
  fuse: "fuse",
};

function StationWagon({ night }: { night: MutableRefObject<Night> }) {
  const car = useRef<THREE.Group>(null);
  const hood = useRef<THREE.Mesh>(null);
  const headlights = useRef<THREE.MeshBasicMaterial>(null);
  const beam = useRef<THREE.SpotLight>(null);
  const drive = useRef(0);
  useFrame((_, delta) => {
    const n = night.current;
    const ready = canStartCar(n);
    if (hood.current) hood.current.rotation.x = ready ? 0 : -0.9;
    const escaping = n.outcome === "car";
    const cranking = n.survivor.focus?.kind === "car" && n.survivor.hold > 0;
    if (headlights.current) headlights.current.color.setScalar(escaping || cranking ? 3 : 0.05);
    if (beam.current) beam.current.intensity = escaping ? 60 : 0;
    if (!escaping || !car.current) return;
    // Pull away round the cul-de-sac and down the lane.
    drive.current += delta;
    const t = drive.current;
    const speed = Math.min(12, t * 5);
    car.current.position.x += Math.sin(car.current.rotation.y) * speed * delta;
    car.current.position.z += Math.cos(car.current.rotation.y) * speed * delta;
    const heading = Math.atan2(-car.current.position.x, 60 - car.current.position.z);
    let turn = heading - car.current.rotation.y;
    turn = Math.atan2(Math.sin(turn), Math.cos(turn));
    car.current.rotation.y += turn * Math.min(1, delta * 1.5);
  });
  const paint = <meshStandardMaterial color="#4a1d1a" metalness={0.4} roughness={0.45} />;
  const glass = <meshStandardMaterial color="#0c0f14" metalness={0.8} roughness={0.1} />;
  return (
    <group ref={car} position={[ESCAPE_CAR.x, 0, ESCAPE_CAR.z]} rotation-y={ESCAPE_CAR.yaw}>
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider args={[0.95, 0.8, 2.4]} position={[0, 0.8, 0]} />
      </RigidBody>
      <mesh position-y={0.75} castShadow>
        <boxGeometry args={[1.9, 0.8, 4.8]} />
        {paint}
      </mesh>
      <mesh position={[0, 1.5, -0.45]} castShadow>
        <boxGeometry args={[1.75, 0.72, 3]} />
        {glass}
      </mesh>
      <mesh position={[0, 1.88, -0.45]}>
        <boxGeometry args={[1.8, 0.06, 3.05]} />
        {paint}
      </mesh>
      <mesh ref={hood} position={[0, 1.2, 1.3]} rotation-x={-0.9}>
        <boxGeometry args={[1.8, 0.05, 1.4]} />
        {paint}
      </mesh>
      {[-0.85, 0.85].flatMap((x) =>
        [-1.5, 1.5].map((z) => (
          <mesh key={`${x}${z}`} position={[x, 0.36, z]} rotation-z={Math.PI / 2}>
            <cylinderGeometry args={[0.36, 0.36, 0.26, 14]} />
            <meshStandardMaterial color="#0d0d0e" roughness={0.9} />
          </mesh>
        )),
      )}
      {[-0.65, 0.65].map((x) => (
        <mesh key={x} position={[x, 0.85, 2.41]}>
          <planeGeometry args={[0.35, 0.2]} />
          <meshBasicMaterial ref={x < 0 ? headlights : undefined} color="#111" toneMapped={false} />
        </mesh>
      ))}
      {[-0.7, 0.7].map((x) => (
        <mesh key={x} position={[x, 0.9, -2.41]} rotation-y={Math.PI}>
          <planeGeometry args={[0.3, 0.16]} />
          <meshBasicMaterial color={[1.4, 0.1, 0.1]} toneMapped={false} />
        </mesh>
      ))}
      <spotLight
        ref={beam}
        position={[0, 0.9, 2.5]}
        angle={0.5}
        penumbra={0.5}
        distance={40}
        intensity={0}
        color="#fff2d0"
      />
    </group>
  );
}

const PHONE_RED = new THREE.Color(0.5, 0.1, 0.1),
  PHONE_AMBER = new THREE.Color(2.2, 1.6, 0.3),
  PHONE_GREEN = new THREE.Color(0.3, 2.2, 0.6);

function Payphone({ night }: { night: MutableRefObject<Night> }) {
  const lamp = useRef<THREE.MeshBasicMaterial>(null);
  useFrame(() => {
    const n = night.current;
    // Red while dead, amber once you have the fuse, green once it's called.
    if (lamp.current)
      lamp.current.color.set(
        n.police >= 0 || n.policeHere ? PHONE_GREEN : n.found.fuse ? PHONE_AMBER : PHONE_RED,
      );
  });
  return (
    <group position={[PAYPHONE.x, 0, PAYPHONE.z]} rotation-y={Math.PI / 2}>
      <mesh position-y={1.1} castShadow>
        <boxGeometry args={[0.12, 2.2, 0.12]} />
        <meshStandardMaterial color="#8a8d90" metalness={0.6} roughness={0.4} />
      </mesh>
      <mesh position={[0, 1.4, 0.18]} castShadow>
        <boxGeometry args={[0.7, 0.9, 0.3]} />
        <meshStandardMaterial color="#8c8f93" metalness={0.6} roughness={0.35} />
      </mesh>
      <mesh position={[-0.2, 1.45, 0.35]} rotation-z={0.1}>
        <boxGeometry args={[0.1, 0.5, 0.1]} />
        <meshStandardMaterial color="#111" />
      </mesh>
      <mesh position={[0, 2.05, 0.18]}>
        <boxGeometry args={[0.72, 0.25, 0.32]} />
        <meshBasicMaterial ref={lamp} color="#300" toneMapped={false} />
      </mesh>
    </group>
  );
}

function PoliceCar({ night }: { night: MutableRefObject<Night> }) {
  const [here, setHere] = useState(false);
  const red = useRef<THREE.PointLight>(null);
  const blue = useRef<THREE.PointLight>(null);
  const siren = useRef(0);
  useFrame((state, delta) => {
    const arrived = night.current.policeHere;
    if (arrived !== here) setHere(arrived);
    if (!arrived) return;
    const phase = Math.sin(state.clock.elapsedTime * 9) > 0;
    if (red.current) red.current.intensity = phase ? 40 : 0;
    if (blue.current) blue.current.intensity = phase ? 0 : 40;
    siren.current -= delta;
    if (siren.current <= 0 && !night.current.outcome) {
      siren.current = 3.6;
      playSound("siren");
    }
  });
  if (!here) return null;
  return (
    <group position={[POLICE_STOP.x + 3, 0, POLICE_STOP.z]}>
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider args={[0.95, 0.8, 2.4]} position={[0, 0.8, 0]} />
      </RigidBody>
      <mesh position-y={0.75} castShadow>
        <boxGeometry args={[1.9, 0.8, 4.8]} />
        <meshStandardMaterial color="#e8e8e8" roughness={0.4} />
      </mesh>
      <mesh position={[0, 1.45, -0.3]}>
        <boxGeometry args={[1.75, 0.65, 2.4]} />
        <meshStandardMaterial color="#111318" metalness={0.8} roughness={0.1} />
      </mesh>
      {[-0.4, 0.4].map((x) => (
        <mesh key={x} position={[x, 1.86, -0.3]}>
          <boxGeometry args={[0.7, 0.14, 0.3]} />
          <meshBasicMaterial color={x < 0 ? [3, 0.2, 0.2] : [0.2, 0.5, 3]} toneMapped={false} />
        </mesh>
      ))}
      <pointLight ref={red} position={[-0.6, 2.4, -0.3]} color="#ff2020" distance={24} decay={2} />
      <pointLight ref={blue} position={[0.6, 2.4, -0.3]} color="#2060ff" distance={24} decay={2} />
    </group>
  );
}

/** The park: a swing set whose swings move on their own, and a slide. */
function Playground({ reducedMotion }: { reducedMotion: boolean }) {
  const swings = useRef<(THREE.Group | null)[]>([]);
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    swings.current.forEach((swing, i) => {
      if (swing) swing.rotation.x = Math.sin(t * 1.3 + i * 2.2) * (reducedMotion ? 0.1 : 0.45);
    });
  });
  const metal = <meshStandardMaterial color="#5b3a2a" metalness={0.5} roughness={0.7} />;
  return (
    <group position={[PARK.x, 0, PARK.z]}>
      <RigidBody type="fixed" colliders={false}>
        {[-2.2, 2.2].map((x) => (
          <CuboidCollider key={x} args={[0.2, 1.4, 0.9]} position={[x, 1.4, 0]} />
        ))}
        <CuboidCollider args={[0.6, 1, 2]} position={[6, 1, -3]} />
      </RigidBody>
      {[-2.2, 2.2].map((x) =>
        [-1, 1].map((side) => (
          <mesh key={`${x}${side}`} position={[x, 1.4, side * 0.7]} rotation-x={side * -0.4}>
            <cylinderGeometry args={[0.06, 0.06, 3, 6]} />
            {metal}
          </mesh>
        )),
      )}
      <mesh position-y={2.75} rotation-z={Math.PI / 2}>
        <cylinderGeometry args={[0.07, 0.07, 4.6, 6]} />
        {metal}
      </mesh>
      {[-1, 1].map((x, i) => (
        <group
          key={x}
          position={[x, 2.75, 0]}
          ref={(group) => {
            swings.current[i] = group;
          }}
        >
          {[-0.3, 0.3].map((dx) => (
            <mesh key={dx} position={[dx, -1.05, 0]}>
              <cylinderGeometry args={[0.015, 0.015, 2.1, 4]} />
              <meshStandardMaterial color="#555" />
            </mesh>
          ))}
          <mesh position-y={-2.1}>
            <boxGeometry args={[0.7, 0.05, 0.28]} />
            <meshStandardMaterial color="#222" />
          </mesh>
        </group>
      ))}
      <group position={[6, 0, -3]}>
        <mesh position={[0, 1, 0.6]} rotation-x={0.55} castShadow>
          <boxGeometry args={[0.8, 0.08, 4]} />
          <meshStandardMaterial color="#8a2a1c" metalness={0.3} roughness={0.5} />
        </mesh>
        <mesh position={[0, 1, -1.3]}>
          <boxGeometry args={[0.8, 2, 0.1]} />
          {metal}
        </mesh>
      </group>
    </group>
  );
}

// --- Trees ------------------------------------------------------------------

const MODEL: Record<Tree["kind"], string> = {
  dead: "CommonTree_Dead_1",
  willow: "Willow_Dead_1",
  autumn: "CommonTree_1",
  pine: "PineTree_1",
};

function specimens(trees: Tree[]) {
  return trees.map((t) => ({
    x: t.x,
    y: 0,
    z: t.z,
    scale: t.scale,
    rotation: t.rotation,
    tint: 0.5,
  }));
}

function LaneTrees() {
  const all = [...TREES.inside, ...TREES.outside];
  return (
    <>
      {(Object.keys(MODEL) as Tree["kind"][]).map((kind) => (
        <NatureBatch
          key={kind}
          model={MODEL[kind]}
          tree
          points={specimens(all.filter((t) => t.kind === kind))}
          leafColor={kind === "autumn" ? "#8f3a17" : kind === "pine" ? "#1c2a24" : undefined}
        />
      ))}
      <NatureBatch
        model="Bush_1"
        points={HIDE_SPOTS.map((h, i) => ({
          x: h.x,
          y: 0,
          z: h.z,
          scale: 2.7,
          rotation: i * 1.7,
          tint: 0.5,
        }))}
        leafColor="#1d2e1d"
      />
      {TREES.inside.map((t, i) => (
        <RigidBody key={i} type="fixed" colliders={false} position={[t.x, 1.5, t.z]}>
          <CylinderCollider args={[1.5, 0.4]} />
        </RigidBody>
      ))}
    </>
  );
}

// --- The night ----------------------------------------------------------------

const DANGER_RANGE = 24;

export function HollowLane({
  onEvent,
  night: nightRef,
}: {
  onEvent: (event: NightEvent) => void;
  /** Optional: lets the page read the night (e.g. for the HUD). */
  night?: MutableRefObject<Night | null>;
}) {
  const world = useWorld();
  const scene = useThree((state) => state.scene);
  const reducedMotion = useReducedMotion();
  const night = useRef<Night>(null as unknown as Night);
  night.current ??= createNight();
  useEffect(() => {
    if (nightRef) nightRef.current = night.current;
  }, [nightRef]);
  const moonLight = useRef<THREE.DirectionalLight>(null);
  const skyLight = useRef<THREE.HemisphereLight>(null);
  const sky = useMemo(createSkyMaterial, []);
  useEffect(() => () => sky.dispose(), [sky]);
  const motion = useRef({ x: LANE_START[0], z: LANE_START[2], speed: 0 });
  const timers = useRef({
    strike: -10,
    next: 20,
    thunder: -1,
    heartbeat: 0,
    rummage: 0,
    interactPress: heldControls().interactPress,
  });

  // Med kits and energy drinks from the inventory act on tonight's rules.
  useEffect(
    () =>
      onUse((id) => {
        if (id !== "medkit" && id !== "drink") return false;
        const events = applyBonus(night.current, id as Bonus);
        events.forEach(onEvent);
        return events.length > 0;
      }),
    [onEvent],
  );

  useEffect(() => {
    const previous = sunlight.fogColor.value.clone();
    sunlight.fogColor.value.set(LANE_FOG);
    Object.assign(nightFx, { won: 0, dark: 0, flash: 0, danger: 0 });
    return () => {
      sunlight.fogColor.value.copy(previous);
      setSprintAllowed(true);
      cameraRig.indoor = false;
      setChase(false);
    };
  }, []);

  useFrame((state, delta) => {
    const t = state.clock.elapsedTime;
    const dt = Math.min(delta, 0.05);
    const n = night.current;

    // Storm: now and then a stuttering flash, thunder a beat later.
    const w = timers.current;
    if (t >= w.next) {
      w.strike = t;
      w.thunder = t + 0.6 + Math.random() * 1.6;
      w.next = t + 20 + Math.random() * 30;
    }
    if (w.thunder > 0 && t >= w.thunder) {
      w.thunder = -1;
      playSound("thunder", { intensity: 0.5 + Math.random() * 0.5 });
    }
    const since = t - w.strike;
    const pulse = (at: number, size: number) =>
      since >= at ? size * Math.exp(-(since - at) * 18) : 0;
    nightFx.flash = (pulse(0, 1) + pulse(0.14, 0.7) + pulse(0.32, 1.1)) * (reducedMotion ? 0.3 : 1);
    nightFx.won = THREE.MathUtils.damp(
      nightFx.won,
      n.outcome === "car" || n.outcome === "police" ? 1 : 0,
      0.8,
      dt,
    );
    sky.uniforms.uTime.value = t;
    sky.uniforms.uWon.value = nightFx.won * 0.5;
    sky.uniforms.uFlash.value = nightFx.flash;
    if (moonLight.current) moonLight.current.intensity = 0.9 + nightFx.flash * 5;
    if (skyLight.current) skyLight.current.intensity = 0.45 + nightFx.flash * 1.6;
    if (scene.fog) scene.fog.color.copy(sunlight.fogColor.value);

    const player = world.get(PlayerPosition);
    if (!player?.valid) return;
    const m = motion.current;
    const speed = Math.hypot(player.x - m.x, player.z - m.z) / Math.max(dt, 1e-3);
    m.speed = THREE.MathUtils.damp(m.speed, speed, 12, dt);
    m.x = player.x;
    m.z = player.z;
    const moving = m.speed > 0.6;
    // Inside a house, the camera tucks in over the shoulder.
    cameraRig.indoor = insideHouse(player) >= 0;
    const controls = heldControls();
    const press = controls.interactPress !== w.interactPress;
    w.interactPress = controls.interactPress;
    const events = stepNight(n, dt, {
      x: player.x,
      z: player.z,
      moving,
      sprinting: moving && controls.run,
      flashlight: isOn("flashlight"),
      interact: controls.interact,
      press,
    });
    setSprintAllowed(sprintAllowed(n));

    const k = n.killer;
    const gap = Math.hypot(k.x - player.x, k.z - player.z);
    const mood = awareness(n);
    nightFx.danger = THREE.MathUtils.damp(
      nightFx.danger,
      mood === "asleep" ? 0 : Math.max(0, 1 - gap / DANGER_RANGE) * (mood === "hunting" ? 1 : 0.6),
      4,
      dt,
    );
    setChase(!n.outcome && (k.mode === "chase" || k.mode === "attack"));
    if (nightFx.danger > 0.2 && !n.outcome) {
      w.heartbeat -= dt;
      if (w.heartbeat <= 0) {
        playSound("heartbeat", { intensity: nightFx.danger });
        w.heartbeat = THREE.MathUtils.lerp(1.3, 0.42, nightFx.danger);
      }
    } else w.heartbeat = 0;
    const focus = n.survivor.focus;
    if (focus?.kind === "search" && n.survivor.hold > 0) {
      w.rummage -= dt;
      if (w.rummage <= 0) {
        playSound("rummage");
        w.rummage = 0.25 + Math.random() * 0.25;
      }
    }

    const needed = focus ? holdTime(n, focus) : 0;
    Object.assign(laneSignals, {
      stamina: n.survivor.stamina,
      maxStamina: maxStamina(n),
      sprintAllowed: sprintAllowed(n),
      hidden: n.survivor.hidden ? HIDE_SPOTS[n.survivor.hide].kind : null,
      prompt: promptFor(n, focus),
      hold: needed > 0,
      progress: needed > 0 ? Math.min(1, n.survivor.hold / needed) : 0,
      awareness: mood,
      police: n.police,
    });

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
          playSound(event.open ? "creak" : "slam", { intensity: event.by === "killer" ? 1 : 0.7 });
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
  });

  return (
    <>
      <fog attach="fog" args={[LANE_FOG, 24, 120]} />
      <hemisphereLight ref={skyLight} args={["#4f5a86", "#15110d", 0.45]} />
      <directionalLight
        ref={moonLight}
        position={MOON.clone().multiplyScalar(140).toArray()}
        intensity={0.9}
        color="#a9b8ff"
        castShadow
        shadow-mapSize={[4096, 4096]}
        shadow-camera-left={-115}
        shadow-camera-right={115}
        shadow-camera-top={115}
        shadow-camera-bottom={-115}
        shadow-camera-far={320}
        shadow-bias={-0.0005}
      />
      <mesh material={sky} frustumCulled={false} renderOrder={-1}>
        <sphereGeometry args={[320, 32, 16]} />
      </mesh>

      <LaneGround />
      <LaneHouses night={night} />
      <LaneTrees />
      <StreetLamps night={night} />
      <PorchGlows />
      <JackOLanterns />
      <SearchSpots night={night} />
      <PartPickups night={night} />
      <Flashlight />
      <StationWagon night={night} />
      <Payphone night={night} />
      <PoliceCar night={night} />
      <Playground reducedMotion={reducedMotion} />
      <Graveyard area={GRAVEYARD} />
      <Ghosts center={GRAVEYARD as Point} reducedMotion={reducedMotion} />
      <Killer night={night} />

      <GroundMist size={GROUND * 2} opacity={0.55} />
      <Bats reducedMotion={reducedMotion} />
      <Embers
        count={500}
        radius={110}
        height={18}
        speed={-0.8}
        size={0.26}
        color="#7a3416"
        additive={false}
        sway={1.6}
        opacity={0.85}
      />
    </>
  );
}
