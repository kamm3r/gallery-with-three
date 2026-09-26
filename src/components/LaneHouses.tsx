import { useFrame } from "@react-three/fiber";
import { CuboidCollider, RigidBody, type RapierCollider } from "@react-three/rapier";
import { useEffect, useMemo, useRef, type MutableRefObject } from "react";
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
} from "../gameplay/hollowLane";
import type { Night } from "../gameplay/hollowNight";
import { Embers } from "./ashFx";
import { nightFx, seeded } from "./halloweenProps";

// Hollow Lane's houses. Craftsman bungalows (lap siding, a gabled porch on
// tapered columns over brick piers, glowing windows) you can walk into: a
// living room, kitchen and bedroom behind real doors, furnished, with a
// wardrobe to hide in. Over the cul-de-sac, the crooked Monster House: window
// eyes, a railing of teeth and a doorway that glows like a mouth.

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

function gable(width: number, height: number) {
  const shape = new THREE.Shape([
    new THREE.Vector2(-width / 2, 0),
    new THREE.Vector2(width / 2, 0),
    new THREE.Vector2(0, height),
  ]);
  return new THREE.ShapeGeometry(shape);
}

function useHouseKit() {
  const kit = useMemo(() => {
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
    const glass = { transparent: true, depthWrite: false, side: THREE.DoubleSide } as const;
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
  }, []);
  useEffect(
    () => () => {
      kit.siding.dispose();
      kit.shingles.dispose();
      for (const style of kit.styles) Object.values(style).forEach((m) => m.dispose());
      Object.values(kit.windows).forEach((m) => m.dispose());
      kit.bulb.dispose();
      kit.inside.floor.map?.dispose();
      Object.values(kit.inside).forEach((m) => m.dispose());
    },
    [kit],
  );
  // Televisions flicker blue behind a few front windows.
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const flicker = 0.6 + 0.4 * Math.abs(Math.sin(t * 7.1) * Math.sin(t * 2.3 + 1));
    kit.windows.tv.color.setRGB(0.45 * flicker, 0.65 * flicker, 1.6 * flicker);
  });
  return kit;
}

type Kit = ReturnType<typeof useHouseKit>;

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

/** Outer walls: siding outside, plaster inside. Inner walls: plaster. Window
 * openings hold glass; the moon (and his gaze) comes straight through. */
function Walls({
  house,
  kit,
  style,
  lit,
}: {
  house: House;
  kit: Kit;
  style: Kit["styles"][number];
  /** Per-window glow (a lamp on behind it), in PLAN_WINDOWS order. */
  lit: readonly boolean[];
}) {
  const { hw, hd } = house;
  const back = PLAN_DOORS[1];
  return (
    <>
      <RigidBody type="fixed" colliders={false}>
        {PLAN_WALLS.map((w, i) => (
          <CuboidCollider
            key={i}
            args={[w.hx, (w.y1 - w.y0) / 2, w.hz]}
            position={[w.x, (w.y0 + w.y1) / 2, w.z]}
          />
        ))}
        <CuboidCollider args={[hw + 0.1, FLOOR_Y / 2, hd + 0.1]} position={[0, FLOOR_Y / 2, 0]} />
        <CuboidCollider args={[hw, 0.05, hd]} position={[0, CEILING_Y + 0.05, 0]} />
        <CuboidCollider args={[0.7, 0.15, 0.35]} position={[back.x, 0.15, -hd - 0.35]} />
      </RigidBody>
      {PLAN_WALLS.map((w, i) => {
        const height = w.y1 - w.y0;
        const y = (w.y0 + w.y1) / 2;
        if (!w.outside)
          return (
            <mesh
              key={i}
              position={[w.x, y, w.z]}
              material={kit.inside.plaster}
              castShadow
              receiveShadow
            >
              <boxGeometry args={[w.hx * 2, height, w.hz * 2]} />
            </mesh>
          );
        const alongX = w.outside === "+z" || w.outside === "-z";
        const out = (w.outside[0] === "+" ? 1 : -1) * 0.05;
        const size: [number, number, number] = alongX
          ? [w.hx * 2, height, 0.1]
          : [0.1, height, w.hz * 2];
        return (
          <group key={i} position={[w.x, y, w.z]}>
            <mesh
              position={alongX ? [0, 0, out] : [out, 0, 0]}
              material={style.siding}
              castShadow
              receiveShadow
            >
              <boxGeometry args={size} />
            </mesh>
            <mesh
              position={alongX ? [0, 0, -out] : [-out, 0, 0]}
              material={kit.inside.plaster}
              receiveShadow
            >
              <boxGeometry args={size} />
            </mesh>
          </group>
        );
      })}
      {PLAN_WINDOWS.map((pane, i) => {
        const height = WINDOW_HEAD - SILL;
        const yaw = pane.along === "x" ? 0 : Math.PI / 2;
        const out = pane.outside[0] === "+" ? 1 : -1;
        return (
          <group key={i} position={[pane.x, FLOOR_Y + SILL + height / 2, pane.z]} rotation-y={yaw}>
            <mesh material={lit[i] ? kit.windows.lit : kit.windows.dark}>
              <planeGeometry args={[pane.width, height]} />
            </mesh>
            {/* Trim on the outside face; the glass sits mid-wall. */}
            {[
              [0, height / 2 + 0.06, pane.width + 0.3, 0.12],
              [0, -height / 2 - 0.08, pane.width + 0.45, 0.14],
              [-pane.width / 2 - 0.06, 0, 0.12, height],
              [pane.width / 2 + 0.06, 0, 0.12, height],
              [0, 0, 0.05, height],
            ].map(([x, y, w, h], j) => (
              <mesh
                key={j}
                position={[x, y, (pane.along === "x" ? out : -out) * 0.13]}
                material={style.trim}
              >
                <boxGeometry args={[w, h, 0.06]} />
              </mesh>
            ))}
          </group>
        );
      })}
      <mesh
        position={[0, FLOOR_Y + 0.005, 0]}
        rotation-x={-Math.PI / 2}
        material={kit.inside.floor}
        receiveShadow
      >
        <planeGeometry args={[hw * 2, hd * 2]} />
      </mesh>
      <mesh position={[0, CEILING_Y, 0]} rotation-x={Math.PI / 2} material={kit.inside.plaster}>
        <planeGeometry args={[hw * 2, hd * 2]} />
      </mesh>
      <mesh position={[back.x, 0.15, -hd - 0.35]} material={kit.inside.pale} receiveShadow>
        <boxGeometry args={[1.4, 0.3, 0.7]} />
      </mesh>
    </>
  );
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

function Furniture({
  house,
  kit,
  tv,
  night,
  wardrobe,
}: {
  house: House;
  kit: Kit;
  tv: boolean;
  night: MutableRefObject<Night>;
  /** This bedroom's index in HIDE_SPOTS. */
  wardrobe: number;
}) {
  const m = kit.inside;
  const leaves = useRef<(THREE.Group | null)[]>([]);
  const panel = PLAN_FURNITURE.find((f) => f.kind === "wardrobe")!;
  // From its side panel to the outer wall.
  const wardrobeWidth = house.hw - 0.1 - panel.x;
  useFrame((_, delta) => {
    // The wardrobe doors pull shut while you're hiding inside.
    const s = night.current.survivor;
    const shut = s.hidden && s.hide === wardrobe;
    leaves.current.forEach((leaf, i) => {
      if (!leaf) return;
      const target = shut ? 0 : (i ? -1 : 1) * 1.2;
      leaf.rotation.y = THREE.MathUtils.damp(leaf.rotation.y, target, 10, delta);
    });
  });
  return (
    <>
      <RigidBody type="fixed" colliders={false}>
        {PLAN_FURNITURE.map((f, i) => {
          const h = FURNITURE_HEIGHT[f.kind!];
          return (
            <CuboidCollider
              key={i}
              args={[f.hx, h / 2, f.hz]}
              position={[f.x, FLOOR_Y + h / 2, f.z]}
            />
          );
        })}
      </RigidBody>
      {PLAN_FURNITURE.map((f, i) => {
        const h = FURNITURE_HEIGHT[f.kind!];
        const at = (dy: number): [number, number, number] => [f.x, FLOOR_Y + dy, f.z];
        switch (f.kind) {
          case "counter":
            return (
              <group key={i}>
                <mesh position={at(h / 2 - 0.03)} material={m.wood} castShadow receiveShadow>
                  <boxGeometry args={[f.hx * 2, h - 0.06, f.hz * 2]} />
                </mesh>
                <mesh position={at(h - 0.02)} material={m.pale}>
                  <boxGeometry args={[f.hx * 2 + 0.04, 0.05, f.hz * 2 + 0.04]} />
                </mesh>
              </group>
            );
          case "fridge":
            return (
              <mesh key={i} position={at(h / 2)} material={m.pale} castShadow>
                <boxGeometry args={[f.hx * 2, h, f.hz * 2]} />
              </mesh>
            );
          case "table":
            return (
              <group key={i}>
                <mesh position={at(h - 0.03)} material={m.wood} castShadow>
                  <boxGeometry args={[f.hx * 2, 0.06, f.hz * 2]} />
                </mesh>
                {[-1, 1].flatMap((sx) =>
                  [-1, 1].map((sz) => (
                    <mesh
                      key={`${sx}${sz}`}
                      position={[
                        f.x + sx * (f.hx - 0.06),
                        FLOOR_Y + h / 2,
                        f.z + sz * (f.hz - 0.06),
                      ]}
                      material={m.wood}
                    >
                      <boxGeometry args={[0.06, h, 0.06]} />
                    </mesh>
                  )),
                )}
              </group>
            );
          case "bed":
            return (
              <group key={i}>
                <mesh position={at(0.25)} material={m.wood} castShadow>
                  <boxGeometry args={[f.hx * 2, 0.5, f.hz * 2]} />
                </mesh>
                <mesh position={at(0.55)} material={m.fabric} castShadow>
                  <boxGeometry args={[f.hx * 2 - 0.05, 0.12, f.hz * 2 - 0.4]} />
                </mesh>
                <mesh position={[f.x, FLOOR_Y + 0.6, f.z - f.hz + 0.25]} material={m.sheet}>
                  <boxGeometry args={[f.hx * 2 - 0.3, 0.14, 0.35]} />
                </mesh>
              </group>
            );
          case "dresser":
            return (
              <group key={i}>
                <mesh position={at(h / 2)} material={m.wood} castShadow>
                  <boxGeometry args={[f.hx * 2, h, f.hz * 2]} />
                </mesh>
                <mesh position={[f.x, FLOOR_Y + h + 0.25, f.z + 0.2]} material={m.lamp}>
                  <cylinderGeometry args={[0.08, 0.15, 0.22, 10]} />
                </mesh>
              </group>
            );
          case "wardrobe":
            return (
              <group key={i}>
                <mesh position={at(h / 2)} material={m.wood} castShadow>
                  <boxGeometry args={[0.08, h, f.hz * 2]} />
                </mesh>
                <mesh position={[f.x + wardrobeWidth / 2, FLOOR_Y + h, f.z]} material={m.wood}>
                  <boxGeometry args={[wardrobeWidth, 0.08, f.hz * 2]} />
                </mesh>
                {[0, 1].map((leaf) => (
                  <group
                    key={leaf}
                    position={[leaf ? f.x + wardrobeWidth - 0.02 : f.x + 0.02, FLOOR_Y, f.z + f.hz]}
                    ref={(group) => {
                      leaves.current[leaf] = group;
                    }}
                  >
                    <mesh
                      position={[(leaf ? -1 : 1) * (wardrobeWidth / 4), h / 2, 0]}
                      material={m.wood}
                      castShadow
                    >
                      <boxGeometry args={[wardrobeWidth / 2 - 0.02, h - 0.05, 0.04]} />
                    </mesh>
                  </group>
                ))}
              </group>
            );
          case "sofa":
            return (
              <group key={i}>
                <mesh position={at(0.25)} material={m.fabric} castShadow>
                  <boxGeometry args={[f.hx * 2, 0.5, f.hz * 2]} />
                </mesh>
                <mesh position={[f.x, FLOOR_Y + 0.6, f.z + f.hz - 0.12]} material={m.fabric}>
                  <boxGeometry args={[f.hx * 2, 0.7, 0.24]} />
                </mesh>
              </group>
            );
          case "tv":
            return (
              <group key={i}>
                <mesh position={at(0.25)} material={m.wood}>
                  <boxGeometry args={[f.hx * 2, 0.5, f.hz * 2]} />
                </mesh>
                <mesh position={at(0.8)} material={m.dark}>
                  <boxGeometry args={[1.1, 0.65, 0.12]} />
                </mesh>
                <mesh
                  position={[f.x, FLOOR_Y + 0.8, f.z + 0.07]}
                  material={tv ? kit.windows.tv : m.dark}
                >
                  <planeGeometry args={[0.95, 0.52]} />
                </mesh>
              </group>
            );
          case "shelf":
            return (
              <group key={i}>
                <mesh position={at(h / 2)} material={m.wood} castShadow>
                  <boxGeometry args={[f.hx * 2, h, f.hz * 2]} />
                </mesh>
                {[0.45, 0.95, 1.45].map((y) => (
                  <mesh key={y} position={[f.x + 0.12, FLOOR_Y + y, f.z]} material={m.fabric}>
                    <boxGeometry args={[0.1, 0.32, f.hz * 1.6]} />
                  </mesh>
                ))}
              </group>
            );
          case "desk":
            return (
              <group key={i}>
                <mesh position={at(h - 0.03)} material={m.wood} castShadow>
                  <boxGeometry args={[f.hx * 2, 0.06, f.hz * 2]} />
                </mesh>
                {[-1, 1].map((side) => (
                  <mesh
                    key={side}
                    position={[f.x + side * (f.hx - 0.2), FLOOR_Y + h / 2, f.z]}
                    material={m.wood}
                  >
                    <boxGeometry args={[0.36, h, f.hz * 2 - 0.05]} />
                  </mesh>
                ))}
                <mesh position={[f.x + 0.5, FLOOR_Y + h + 0.2, f.z - 0.05]} material={m.lamp}>
                  <cylinderGeometry args={[0.06, 0.12, 0.18, 10]} />
                </mesh>
              </group>
            );
          case "cabinet":
          case "nightstand":
            return (
              <mesh
                key={i}
                position={at(h / 2)}
                material={f.kind === "cabinet" ? m.pale : m.wood}
                castShadow
              >
                <boxGeometry args={[f.hx * 2, h, f.hz * 2]} />
              </mesh>
            );
          default:
            return (
              <mesh key={i} position={at(h / 2)} material={m.fabric} castShadow>
                <boxGeometry args={[f.hx * 2, h, f.hz * 2]} />
              </mesh>
            );
        }
      })}
    </>
  );
}

/** A hinged door that swings inward; shakes when he bashes it, falls in when broken. */
function HouseDoor({
  index,
  back,
  kit,
  material,
  night,
}: {
  index: number;
  back: boolean;
  kit: Kit;
  material: THREE.Material;
  night: MutableRefObject<Night>;
}) {
  const plan = PLAN_DOORS[back ? 1 : 0];
  const hinge = useRef<THREE.Group>(null);
  const collider = useRef<RapierCollider>(null);
  const swing = back ? -1.7 : 1.7;
  useFrame((state, delta) => {
    const door = night.current.doors[index];
    const g = hinge.current;
    if (!g) return;
    const k = night.current.killer;
    const bashing = k.door === index && door.locked;
    g.rotation.y = THREE.MathUtils.damp(g.rotation.y, door.open ? swing : 0, 7, delta);
    g.rotation.z = bashing ? Math.sin(state.clock.elapsedTime * 40) * 0.015 : 0;
    // Broken: knocked off its hinges onto the floor.
    g.rotation.x = THREE.MathUtils.damp(
      g.rotation.x,
      door.broken ? (back ? 1.45 : -1.45) : 0,
      8,
      delta,
    );
    collider.current?.setEnabled(!door.open);
  });
  return (
    <>
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider
          ref={collider}
          args={[plan.width / 2, DOOR_HEIGHT / 2, 0.05]}
          position={[plan.x, FLOOR_Y + DOOR_HEIGHT / 2, plan.z]}
        />
      </RigidBody>
      <group ref={hinge} position={[plan.x - plan.width / 2, FLOOR_Y, plan.z]}>
        <mesh position={[plan.width / 2, DOOR_HEIGHT / 2, 0]} material={material} castShadow>
          <boxGeometry args={[plan.width - 0.04, DOOR_HEIGHT, 0.06]} />
        </mesh>
        {!back &&
          [-0.28, 0, 0.28].map((x) => (
            <mesh key={x} position={[plan.width / 2 + x, 1.75, 0.035]} material={kit.windows.dark}>
              <planeGeometry args={[0.2, 0.34]} />
            </mesh>
          ))}
        <mesh position={[plan.width - 0.12, 1.05, 0.05]} material={kit.inside.pale}>
          <sphereGeometry args={[0.04, 6, 4]} />
        </mesh>
      </group>
    </>
  );
}

function CraftsmanHouse({
  house,
  index,
  kit,
  night,
}: {
  house: House;
  index: number;
  kit: Kit;
  night: MutableRefObject<Night>;
}) {
  const { hw, hd } = house;
  const style = kit.styles[house.style];
  const dress = useMemo(() => houseDressing(index), [index]);
  const geometry = useMemo(() => {
    const rise = 2.3,
      span = hw + 0.6;
    const porchWidth = hw * 1.2,
      porchRise = 1.3;
    return {
      rise,
      span,
      slope: Math.hypot(span, rise),
      angle: Math.atan2(rise, span),
      gable: gable(hw * 2, rise),
      porchWidth,
      porchRise,
      porchSlope: Math.hypot(porchWidth / 2 + 0.3, porchRise),
      porchAngle: Math.atan2(porchRise, porchWidth / 2 + 0.3),
      porchGable: gable(porchWidth, porchRise),
    };
  }, [hw]);
  useEffect(
    () => () => {
      geometry.gable.dispose();
      geometry.porchGable.dispose();
    },
    [geometry],
  );
  const wallTop = CEILING_Y;
  const porchTop = 3.3;
  const porchFront = hd + 2.8;
  return (
    <group position={[house.x, 0, house.z]} rotation-y={house.yaw}>
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider
          args={[geometry.porchWidth / 2 + 0.4, 0.175, 1.4]}
          position={[0, 0.175, hd + 1.4]}
        />
      </RigidBody>
      {/* Brick foundation, walls, rooms, furniture and doors. */}
      <mesh position-y={0.3} material={style.brick} receiveShadow>
        <boxGeometry args={[hw * 2 + 0.2, 0.6, hd * 2 + 0.2]} />
      </mesh>
      <Walls house={house} kit={kit} style={style} lit={dress.windows} />
      <Furniture house={house} kit={kit} tv={dress.tv} night={night} wardrobe={index} />
      {dress.lamp && (
        // Somebody left a lamp on: enough to see the living room by.
        <pointLight
          position={[0, CEILING_Y - 0.6, 2]}
          color="#ffb870"
          intensity={5}
          distance={7}
          decay={2}
        />
      )}
      {[false, true].map((back) => (
        <HouseDoor
          key={String(back)}
          index={index * 2 + (back ? 1 : 0)}
          back={back}
          kit={kit}
          material={style.door}
          night={night}
        />
      ))}
      {[hd, -hd].map((z) => (
        <mesh
          key={z}
          geometry={geometry.gable}
          material={style.siding}
          position={[0, wallTop, z]}
          rotation-y={z > 0 ? 0 : Math.PI}
          castShadow
        />
      ))}
      {[-1, 1].map((side) => (
        <mesh
          key={side}
          material={style.roof}
          position={[(side * geometry.span) / 2, wallTop + geometry.rise / 2, 0]}
          rotation-z={-side * geometry.angle}
          castShadow
        >
          <boxGeometry args={[geometry.slope + 0.2, 0.18, hd * 2 + 1.4]} />
        </mesh>
      ))}
      <mesh position={[hw * 0.5, wallTop + 1.4, -hd * 0.3]} material={style.brick} castShadow>
        <boxGeometry args={[0.9, 3, 0.9]} />
      </mesh>

      {/* Gabled front porch on tapered columns over brick piers. */}
      <mesh position={[0, 0.175, hd + 1.4]} material={style.trim} receiveShadow>
        <boxGeometry args={[geometry.porchWidth + 0.8, 0.35, 2.8]} />
      </mesh>
      <mesh position={[0, 0.09, porchFront + 0.35]} material={style.trim} receiveShadow>
        <boxGeometry args={[2.2, 0.18, 0.7]} />
      </mesh>
      {[-1, 1].map((side) => (
        <group key={side} position={[(side * geometry.porchWidth) / 2, 0, porchFront - 0.35]}>
          <mesh position-y={0.75} material={style.brick} castShadow>
            <boxGeometry args={[0.6, 0.8, 0.6]} />
          </mesh>
          <mesh
            position-y={1.15 + (porchTop - 1.15) / 2}
            rotation-y={Math.PI / 4}
            material={style.trim}
            castShadow
          >
            <cylinderGeometry args={[0.18, 0.28, porchTop - 1.15, 4]} />
          </mesh>
        </group>
      ))}
      <mesh position={[0, porchTop + 0.1, hd + 1.5]} material={style.trim}>
        <boxGeometry args={[geometry.porchWidth + 0.5, 0.25, 3.1]} />
      </mesh>
      <mesh
        geometry={geometry.porchGable}
        material={style.trim}
        position={[0, porchTop + 0.22, porchFront + 0.02]}
      />
      {[-1, 1].map((side) => (
        <mesh
          key={side}
          material={style.roof}
          position={[
            (side * (geometry.porchWidth / 2 + 0.3)) / 2,
            porchTop + 0.22 + geometry.porchRise / 2,
            hd + 1.5,
          ]}
          rotation-z={-side * geometry.porchAngle}
          castShadow
        >
          <boxGeometry args={[geometry.porchSlope + 0.2, 0.14, 3.4]} />
        </mesh>
      ))}

      {/* Door trim, windows and the porch light. */}
      {[
        [-0.86, FLOOR_Y + 1.2, 0.12, 2.4],
        [0.46, FLOOR_Y + 1.2, 0.12, 2.4],
        [-0.2, FLOOR_Y + 2.38, 1.44, 0.12],
      ].map(([x, y, w, h], i) => (
        <mesh key={i} position={[x, y, hd + 0.11]} material={style.trim}>
          <boxGeometry args={[w, h, 0.04]} />
        </mesh>
      ))}
      {dress.porchLight && (
        <mesh position={[0.75, 2.75, hd + 0.12]} material={kit.bulb}>
          <sphereGeometry args={[0.09, 8, 6]} />
        </mesh>
      )}
    </group>
  );
}

// --- The Monster House ---------------------------------------------------------

const EYE_GLOW = new THREE.Color(2.8, 1.5, 0.35);
const ROOF_RISE = 5,
  ROOF_RUN = 7.5;

function MonsterHouseMesh({ kit }: { kit: Kit }) {
  const h = MONSTER_HOUSE;
  const breath = useRef<THREE.Group>(null);
  const doorLight = useRef<THREE.PointLight>(null);
  const eyes = useMemo(
    () => new THREE.MeshBasicMaterial({ color: EYE_GLOW.clone(), toneMapped: false }),
    [],
  );
  const planks = useMemo(() => {
    const texture = stripes(18, true, 9);
    texture.repeat.set(3, 1);
    return texture;
  }, []);
  const wood = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#3a2f28", map: planks, roughness: 1 }),
    [planks],
  );
  const roof = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#1c1a1d", map: kit.shingles, roughness: 1 }),
    [kit],
  );
  const bone = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#bdb49c", roughness: 0.9 }),
    [],
  );
  useEffect(
    () => () => {
      [eyes, wood, roof, bone].forEach((m) => m.dispose());
      planks.dispose();
    },
    [eyes, wood, roof, bone, planks],
  );
  const teeth = useMemo(() => {
    const random = seeded(66);
    return Array.from({ length: 26 }, (_, i) => {
      const x = -9 + (i / 25) * 18;
      return Math.abs(x) < 1.6
        ? null
        : { x, height: 0.7 + random() * 0.5, tilt: (random() - 0.5) * 0.35 };
    }).filter((tooth) => tooth !== null);
  }, []);
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    // It breathes, and its eyes burn hotter when he's close to you.
    const glow = 0.7 + nightFx.danger * 0.9 + Math.sin(t * 0.8) * 0.15;
    eyes.color.copy(EYE_GLOW).multiplyScalar(glow);
    if (breath.current) breath.current.scale.y = 1 + Math.sin(t * 0.6) * 0.008;
    if (doorLight.current) doorLight.current.intensity = 14 + glow * 10 + Math.sin(t * 5.3) * 2;
  });
  return (
    <group position={[h.x, 0, h.z]}>
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider args={[h.hw, 4, h.hd]} position={[0, 4, 0]} />
        <CuboidCollider args={[9.5, 0.3, 1.75]} position={[0, 0.3, h.hd + 1.75]} />
      </RigidBody>
      <group ref={breath}>
        <mesh position-y={0.5} castShadow receiveShadow>
          <boxGeometry args={[h.hw * 2 + 0.6, 1, h.hd * 2 + 0.6]} />
          <meshStandardMaterial color="#29272a" roughness={1} />
        </mesh>
        <mesh position-y={3.1} material={wood} castShadow receiveShadow>
          <boxGeometry args={[h.hw * 2, 4.2, h.hd * 2]} />
        </mesh>
        {/* The upper storey sags off true, like the whole place is leaning in. */}
        <group position-y={7} rotation={[0.02, 0.04, 0.03]}>
          <mesh material={wood} castShadow>
            <boxGeometry args={[17, 3.6, 13]} />
          </mesh>
          {[-1, 1].map((side) => (
            <mesh
              key={side}
              material={eyes}
              position={[side * 4, 0.1, 6.52]}
              rotation-z={side * -0.12}
            >
              <planeGeometry args={[3, 1.7]} />
            </mesh>
          ))}
          {/* Heavy brows: a steep roof whose eaves hang low over the eyes.
              Eaves at y 1.8, 7.5 out; ridge 5 higher over the middle. */}
          {[-1, 1].map((side) => (
            <mesh
              key={side}
              material={roof}
              position={[0, 1.8 + ROOF_RISE / 2, side * (ROOF_RUN / 2)]}
              rotation-x={side * Math.atan2(ROOF_RISE, ROOF_RUN)}
              castShadow
            >
              <boxGeometry args={[19.5, 0.3, Math.hypot(ROOF_RISE, ROOF_RUN) + 0.4]} />
            </mesh>
          ))}
          <mesh position={[5.5, 7, -1]} rotation-z={0.18} castShadow>
            <boxGeometry args={[1.2, 4, 1.2]} />
            <meshStandardMaterial color="#2a2020" roughness={1} />
          </mesh>
          <Embers
            count={40}
            radius={0.4}
            height={9}
            speed={0.6}
            size={1.8}
            color="#2e2b2c"
            additive={false}
            sway={1.2}
            opacity={0.5}
            position={[5.9, 9.1, -1]}
          />
        </group>

        {/* Porch: a railing of crooked teeth and a door that glows like a mouth. */}
        <mesh position={[0, 0.3, h.hd + 1.75]} receiveShadow>
          <boxGeometry args={[19, 0.6, 3.5]} />
          <meshStandardMaterial color="#2f2824" roughness={1} />
        </mesh>
        <mesh position={[0, 4.4, h.hd + 1.9]} rotation-x={0.12} material={roof} castShadow>
          <boxGeometry args={[19.6, 0.25, 4.2]} />
        </mesh>
        {[-9, -3.5, 3.5, 9].map((x) => (
          <mesh
            key={x}
            position={[x, 2.4, h.hd + 3.3]}
            rotation-z={x * 0.006}
            material={wood}
            castShadow
          >
            <boxGeometry args={[0.35, 3.6, 0.35]} />
          </mesh>
        ))}
        {teeth.map((tooth) => (
          <mesh
            key={tooth.x}
            position={[tooth.x, 0.6 + tooth.height / 2, h.hd + 3.4]}
            rotation-z={tooth.tilt}
            material={bone}
            castShadow
          >
            <coneGeometry args={[0.18, tooth.height, 4]} />
          </mesh>
        ))}
        <mesh position={[0, 2.4, h.hd + 0.03]}>
          <planeGeometry args={[2.4, 3.2]} />
          <meshBasicMaterial color={[2.6, 1.1, 0.3]} toneMapped={false} />
        </mesh>
        <mesh position={[0, 0.62, h.hd + 1.8]} rotation-x={-Math.PI / 2}>
          <planeGeometry args={[2, 3.4]} />
          <meshStandardMaterial color="#5a1418" roughness={0.8} />
        </mesh>
        {[-1, 1].map((side) => (
          <mesh key={side} material={eyes} position={[side * 6.5, 3, h.hd + 0.03]}>
            <planeGeometry args={[1.6, 1.8]} />
          </mesh>
        ))}
      </group>
      <pointLight
        ref={doorLight}
        position={[0, 2.4, h.hd + 3]}
        color="#ff8a3a"
        intensity={20}
        distance={16}
        decay={2}
      />
      <pointLight
        position={[0, 7, h.hd + 5]}
        color="#ffae52"
        intensity={14}
        distance={18}
        decay={2}
      />
    </group>
  );
}

export function LaneHouses({ night }: { night: MutableRefObject<Night> }) {
  const kit = useHouseKit();
  return (
    <>
      {HOUSES.map((house, i) => (
        <CraftsmanHouse key={i} house={house} index={i} kit={kit} night={night} />
      ))}
      <MonsterHouseMesh kit={kit} />
    </>
  );
}
