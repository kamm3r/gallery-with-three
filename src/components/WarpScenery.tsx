import { useFrame } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef, type ReactNode } from "react";
import * as THREE from "three";
import { PIT_BOTTOM, type LevelTheme, type Solid, type WarpLevel } from "../gameplay/warpLevels";

// Level dressing: ground blocks and themed props scattered along the route.
// Props are instanced and deterministic, so every visit looks the same.

type Placement = {
  p: [number, number, number];
  r?: [number, number, number];
  s: [number, number, number];
};

function seeded(seed: number) {
  let value = seed >>> 0;
  return () => (value = (Math.imul(value, 1664525) + 1013904223) >>> 0) / 4294967296;
}

const scratch = new THREE.Object3D();
/** The valley floor under every level: well below the death height. */
const FLOOR = PIT_BOTTOM;

/** One instanced batch of a single primitive. */
function Scatter({
  items,
  children,
  shadows = true,
}: {
  items: Placement[];
  children: ReactNode;
  shadows?: boolean;
}) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const m = mesh.current;
    if (!m) return;
    items.forEach((item, i) => {
      scratch.position.set(...item.p);
      scratch.rotation.set(...(item.r ?? [0, 0, 0]));
      scratch.scale.set(...item.s);
      scratch.updateMatrix();
      m.setMatrixAt(i, scratch.matrix);
    });
    m.instanceMatrix.needsUpdate = true;
    m.computeBoundingSphere();
  }, [items]);
  if (!items.length) return null;
  return (
    <instancedMesh
      ref={mesh}
      args={[undefined, undefined, items.length]}
      castShadow={shadows}
      receiveShadow
    >
      {children}
    </instancedMesh>
  );
}

/** Ground and walls: themed top, darker sides. */
export function LevelGround({ level }: { level: WarpLevel }) {
  const { theme } = level;
  const materials = useMemo(() => {
    const top = new THREE.MeshStandardMaterial({ color: theme.ground, roughness: 0.9 });
    const side = new THREE.MeshStandardMaterial({ color: theme.groundSide, roughness: 0.95 });
    const wall = new THREE.MeshStandardMaterial({ color: theme.groundSide, roughness: 1 });
    const wallTop = new THREE.MeshStandardMaterial({ color: theme.trim, roughness: 0.9 });
    return {
      floor: [side, side, top, side, side, side],
      wall: [wall, wall, wallTop, wall, wall, wall],
    };
  }, [theme]);
  return (
    <>
      {level.solids.map((solid, i) => (
        <SolidMesh
          key={i}
          solid={solid}
          materials={solid.wall ? materials.wall : materials.floor}
        />
      ))}
      {/* Grass/snow lip along the ground edges. */}
      {level.solids
        .filter((solid) => !solid.wall && solid.w > 2.4)
        .map((solid, i) => (
          <group key={`lip-${i}`}>
            {[-1, 1].map((side) => (
              <mesh
                key={side}
                position={[solid.x + side * (solid.w / 2 - 0.12), solid.top + 0.05, solid.z]}
                receiveShadow
              >
                <boxGeometry args={[0.3, 0.12, solid.d]} />
                <meshStandardMaterial color={theme.trim} roughness={0.9} />
              </mesh>
            ))}
          </group>
        ))}
    </>
  );
}

function SolidMesh({ solid, materials }: { solid: Solid; materials: THREE.Material[] }) {
  const bottom = solid.bottom ?? PIT_BOTTOM;
  const height = solid.top - bottom;
  return (
    <mesh
      position={[solid.x, bottom + height / 2, solid.z]}
      material={materials}
      castShadow
      receiveShadow
    >
      <boxGeometry args={[solid.w, height, solid.d]} />
    </mesh>
  );
}

/** Side scenery for each theme, both banks of the route. */
export function LevelDressing({ level }: { level: WarpLevel }) {
  const { theme } = level;
  const layout = useMemo(() => {
    const random = seeded(level.index * 977 + 13);
    const spots: { x: number; z: number; y: number; k: number; side: number }[] = [];
    const start = level.spawn[2] + 10;
    const end = level.exit[2] - 14;
    for (let z = start; z > end; z -= 3.2) {
      for (const side of [-1, 1]) {
        const x = side * (7 + random() * 10);
        spots.push({ x, z: z + random() * 2, y: FLOOR + random() * 2.5, k: random(), side });
      }
    }
    return { spots, random };
  }, [level]);
  switch (theme.deco) {
    case "jungle":
      return <Jungle spots={layout.spots} />;
    case "snow":
      return <Snow spots={layout.spots} level={level} />;
    case "sewer":
      return <Sewer level={level} theme={theme} />;
    case "canyon":
      return <Canyon spots={layout.spots} theme={theme} />;
    case "ruins":
      return <Ruins spots={layout.spots} theme={theme} />;
  }
}

type Spot = { x: number; z: number; y: number; k: number; side: number };

function Jungle({ spots }: { spots: Spot[] }) {
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
  return (
    <>
      <Scatter items={trunks}>
        <cylinderGeometry args={[0.35, 0.5, 1, 7]} />
        <meshStandardMaterial color="#5a3d22" roughness={0.9} />
      </Scatter>
      <Scatter items={crowns}>
        <icosahedronGeometry args={[1, 0]} />
        <meshStandardMaterial color="#3f8a3a" roughness={0.8} flatShading />
      </Scatter>
      <Scatter items={ferns}>
        <coneGeometry args={[1, 1, 6]} />
        <meshStandardMaterial color="#5ca84a" roughness={0.8} flatShading />
      </Scatter>
      <mesh position={[0, FLOOR, -40]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[90, 200]} />
        <meshStandardMaterial color="#2f5a2a" roughness={1} />
      </mesh>
    </>
  );
}

function Snow({ spots, level }: { spots: Spot[]; level: WarpLevel }) {
  const tiers: Placement[] = [];
  const caps: Placement[] = [];
  const rocks: Placement[] = [];
  for (const { x, z, k, y } of spots) {
    const base = y;
    const h = 20 + k * 10;
    for (let t = 0; t < 3; t++) {
      const r = (1.8 - t * 0.45) * (0.8 + k * 0.4);
      tiers.push({ p: [x, base + t * h * 0.28 + h * 0.2, z], s: [r, h * 0.4, r] });
      caps.push({ p: [x, base + t * h * 0.28 + h * 0.34, z], s: [r * 0.55, h * 0.14, r * 0.55] });
    }
    rocks.push({ p: [x * 0.8, base, z + 1.2], r: [k, k * 3, 0], s: [2.2 + k, 1.6 + k, 2.3] });
  }
  return (
    <>
      <Scatter items={tiers}>
        <coneGeometry args={[1, 1, 8]} />
        <meshStandardMaterial color="#2f5a48" roughness={0.85} flatShading />
      </Scatter>
      <Scatter items={caps}>
        <coneGeometry args={[1, 1, 8]} />
        <meshStandardMaterial color="#f4f8fc" roughness={0.6} flatShading />
      </Scatter>
      <Scatter items={rocks}>
        <dodecahedronGeometry args={[1, 0]} />
        <meshStandardMaterial color="#dfe8f2" roughness={0.7} flatShading />
      </Scatter>
      <mesh position={[0, FLOOR, -40]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[90, 200]} />
        <meshStandardMaterial color="#e6eef7" roughness={0.9} />
      </mesh>
      <Snowfall from={level.spawn[2] + 10} to={level.exit[2] - 10} />
    </>
  );
}

function Snowfall({ from, to }: { from: number; to: number }) {
  const points = useRef<THREE.Points>(null);
  const geometry = useMemo(() => {
    const random = seeded(99);
    const count = 900;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (random() - 0.5) * 40;
      positions[i * 3 + 1] = random() * 16 - 2;
      positions[i * 3 + 2] = to + random() * (from - to);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    return g;
  }, [from, to]);
  useFrame((_, delta) => {
    const attribute = geometry.getAttribute("position") as THREE.BufferAttribute;
    const array = attribute.array as Float32Array;
    for (let i = 1; i < array.length; i += 3) {
      array[i] -= delta * (1.2 + (i % 7) * 0.12);
      array[i - 1] += Math.sin(array[i] + i) * delta * 0.3;
      if (array[i] < -3) array[i] += 17;
    }
    attribute.needsUpdate = true;
  });
  return (
    <points ref={points} geometry={geometry} frustumCulled={false}>
      <pointsMaterial
        color="#ffffff"
        size={0.09}
        sizeAttenuation
        transparent
        opacity={0.85}
        depthWrite={false}
      />
    </points>
  );
}

function Sewer({ level, theme }: { level: WarpLevel; theme: LevelTheme }) {
  const pipes: Placement[] = [];
  const rings: Placement[] = [];
  const random = seeded(7);
  const start = level.spawn[2] + 6;
  const end = level.exit[2] - 4;
  const length = start - end;
  for (const side of [-1, 1]) {
    for (const height of [2.2, 4.6]) {
      pipes.push({
        p: [side * 3.1, height + (side > 0 ? 0.4 : 0), (start + end) / 2],
        r: [Math.PI / 2, 0, 0],
        s: [side * height > 3 ? 0.35 : 0.22, length, side * height > 3 ? 0.35 : 0.22],
      });
      for (let z = start; z > end; z -= 4 + random() * 3) {
        rings.push({
          p: [side * 3.1, height + (side > 0 ? 0.4 : 0), z],
          r: [Math.PI / 2, 0, 0],
          s: [1.25, 0.3, 1.25],
        });
      }
    }
  }
  const lamps = useMemo(() => {
    const list: [number, number, number][] = [];
    for (let z = start - 6; z > end; z -= 16) list.push([0, 5.4, z]);
    return list;
  }, [start, end]);
  return (
    <>
      <Scatter items={pipes}>
        <cylinderGeometry args={[1, 1, 1, 12]} />
        <meshStandardMaterial color="#6d7a6a" metalness={0.5} roughness={0.5} />
      </Scatter>
      <Scatter items={rings}>
        <cylinderGeometry args={[0.36, 0.36, 1, 12]} />
        <meshStandardMaterial color="#4a5448" metalness={0.6} roughness={0.4} />
      </Scatter>
      {/* Ceiling and a glowing sludge river far below. */}
      <mesh position={[0, 6.05, (start + end) / 2]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[8, length]} />
        <meshStandardMaterial color="#232b25" roughness={1} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, level.killY - 0.6, (start + end) / 2]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[8, length]} />
        <meshStandardMaterial
          color="#5fbf3a"
          emissive="#3a8f1c"
          emissiveIntensity={0.9}
          roughness={0.3}
        />
      </mesh>
      {lamps.map((position) => (
        <group key={position[2]} position={position}>
          <mesh>
            <sphereGeometry args={[0.18, 10, 8]} />
            <meshBasicMaterial color={[2.4, 2.2, 1.4]} toneMapped={false} />
          </mesh>
          <pointLight color={theme.light} intensity={14} distance={14} decay={2} />
        </group>
      ))}
    </>
  );
}

function Canyon({ spots, theme }: { spots: Spot[]; theme: LevelTheme }) {
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
  return (
    <>
      <Scatter items={pillars}>
        <cylinderGeometry args={[0.45, 0.6, 1, 7]} />
        <meshStandardMaterial color={theme.groundSide} roughness={1} flatShading />
      </Scatter>
      <Scatter items={cacti}>
        <capsuleGeometry args={[1, 1, 4, 8]} />
        <meshStandardMaterial color="#5f8a3c" roughness={0.8} />
      </Scatter>
      <mesh position={[0, FLOOR, -40]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[90, 200]} />
        <meshStandardMaterial color={theme.ground} roughness={1} />
      </mesh>
    </>
  );
}

function Ruins({ spots, theme }: { spots: Spot[]; theme: LevelTheme }) {
  const columns: Placement[] = [];
  const caps: Placement[] = [];
  const vines: Placement[] = [];
  spots.forEach(({ x, z, k }, i) => {
    const h = 14 + k * 10;
    const y = FLOOR;
    const broken = i % 3 === 0;
    columns.push({
      p: [x, y + h / 2, z],
      r: [0, 0, broken ? (k - 0.5) * 0.3 : 0],
      s: [0.7, h, 0.7],
    });
    if (!broken) caps.push({ p: [x, y + h + 0.2, z], s: [1.9, 0.4, 1.9] });
    vines.push({ p: [x + 0.5, y + h * 0.6, z + 0.5], s: [0.4, h * 0.5, 0.4] });
  });
  return (
    <>
      <Scatter items={columns}>
        <cylinderGeometry args={[1, 1, 1, 10]} />
        <meshStandardMaterial color="#b9ae96" roughness={0.9} />
      </Scatter>
      <Scatter items={caps}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#a39a86" roughness={0.9} />
      </Scatter>
      <Scatter items={vines} shadows={false}>
        <cylinderGeometry args={[0.2, 0.05, 1, 5]} />
        <meshStandardMaterial color={theme.trim} roughness={0.8} />
      </Scatter>
      <mesh position={[0, FLOOR, -45]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[90, 200]} />
        <meshStandardMaterial color="#4f5a3c" roughness={1} />
      </mesh>
    </>
  );
}
