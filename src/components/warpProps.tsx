import { useFrame } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef, type MutableRefObject } from "react";
import * as THREE from "three";
import { CRATE_SIZE, type CrateKind, type EnemyKind, type Vec3 } from "../gameplay/warpLevels";

// Everything drawn here is procedural: canvas-painted crate faces, low-poly
// critters and instanced fruit, so the Warp Room ships no new assets.

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
export function crateMaterial(kind: CrateKind) {
  let materials = crateMaterialCache.get(kind);
  if (!materials) {
    materials = crateMaterials(kind);
    crateMaterialCache.set(kind, materials);
  }
  return materials;
}

const crateGeometry = new THREE.BoxGeometry(CRATE_SIZE, CRATE_SIZE, CRATE_SIZE);

/** A crate's look; squash and the TNT blink are driven through `state`. */
export function CrateMesh({
  kind,
  squash,
  fuse,
}: {
  kind: CrateKind;
  squash: () => number;
  fuse: () => number;
}) {
  const mesh = useRef<THREE.Mesh>(null);
  const materials = useMemo(
    () =>
      kind === "tnt" || kind === "nitro"
        ? crateMaterial(kind).map((m) => m.clone())
        : crateMaterial(kind),
    [kind],
  );
  // Only the per-crate clones are ours; the cached base set is shared.
  useEffect(() => {
    if (kind !== "tnt" && kind !== "nitro") return;
    return () => materials.forEach((material) => material.dispose());
  }, [kind, materials]);
  useFrame((state) => {
    const m = mesh.current;
    if (!m) return;
    const s = squash();
    m.scale.set(1 + s * 0.12, 1 - s * 0.22, 1 + s * 0.12);
    m.position.y = CRATE_SIZE / 2 - (s * 0.22 * CRATE_SIZE) / 2;
    const t = state.clock.elapsedTime;
    if (kind === "tnt") {
      const lit = fuse() >= 0;
      const blink = lit ? (Math.sin(t * (20 - fuse() * 4)) > 0 ? 1.4 : 0) : 0;
      for (const material of materials as THREE.MeshStandardMaterial[]) {
        material.emissive.set("#ff3a1a");
        material.emissiveIntensity = blink;
      }
    } else if (kind === "nitro") {
      // Nitro crates rattle and hop in place, glowing.
      m.position.y += Math.max(0, Math.sin(t * 7 + m.id)) * 0.05;
      m.rotation.z = Math.sin(t * 23 + m.id) * 0.03;
    }
  });
  return <mesh ref={mesh} geometry={crateGeometry} material={materials} castShadow receiveShadow />;
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
export function Debris({ bursts }: { bursts: MutableRefObject<Burst[]> }) {
  const planks = useRef<THREE.InstancedMesh>(null);
  const blasts = useRef<THREE.InstancedMesh>(null);
  useFrame((_, delta) => {
    const pieces = planks.current;
    const flashes = blasts.current;
    if (!pieces || !flashes) return;
    const list = bursts.current;
    for (const burst of list) burst.age += delta;
    bursts.current = list.filter((burst) => burst.age < 1.1);
    let plank = 0;
    let flash = 0;
    for (const burst of bursts.current) {
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
        debrisObject.position.set(burst.x + vx * t, burst.y + vy * t - 9 * t * t, burst.z + vz * t);
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
  });
  return (
    <>
      <instancedMesh
        ref={planks}
        args={[plankGeometry, undefined, PLANKS_PER_BURST * MAX_BURSTS]}
        frustumCulled={false}
        castShadow
      >
        <meshStandardMaterial roughness={0.8} />
      </instancedMesh>
      <instancedMesh
        ref={blasts}
        args={[blastGeometry, undefined, MAX_BURSTS]}
        frustumCulled={false}
      >
        <meshBasicMaterial
          color={[4, 1.6, 0.4]}
          transparent
          opacity={0.7}
          toneMapped={false}
          depthWrite={false}
        />
      </instancedMesh>
    </>
  );
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
export function FruitField({ fruit, taken }: { fruit: Vec3[]; taken: () => boolean[] }) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  useFrame((state) => {
    const m = mesh.current;
    if (!m) return;
    const t = state.clock.elapsedTime;
    const gone = taken();
    fruit.forEach(([x, y, z], i) => {
      fruitObject.position.set(x, y + Math.sin(t * 2.4 + i * 0.7) * 0.08, z);
      fruitObject.rotation.set(0.3, t * 2 + i, 0);
      fruitObject.scale.set(1, 1.18, 1).multiplyScalar(gone[i] ? 0 : 1);
      fruitObject.updateMatrix();
      m.setMatrixAt(i, fruitObject.matrix);
    });
    m.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh ref={mesh} args={[fruitGeometry, undefined, fruit.length]} frustumCulled={false}>
      <meshStandardMaterial
        color="#ff8a1c"
        emissive="#ff5a00"
        emissiveIntensity={0.35}
        roughness={0.35}
      />
    </instancedMesh>
  );
}

// --- Crystal and gem ------------------------------------------------------

export function PowerCrystal({
  position,
  collected,
  scale = 1,
  dim = false,
}: {
  position: Vec3;
  collected: () => boolean;
  scale?: number;
  dim?: boolean;
}) {
  const group = useRef<THREE.Group>(null);
  const pickup = useRef(0);
  useFrame((state, delta) => {
    const g = group.current;
    if (!g) return;
    const t = state.clock.elapsedTime;
    if (collected()) pickup.current = Math.min(1, pickup.current + delta * 2.2);
    const p = pickup.current;
    g.rotation.y = t * 1.6 + p * 12;
    g.position.set(position[0], position[1] + Math.sin(t * 2) * 0.12 + p * 2.5, position[2]);
    g.scale.setScalar(scale * (1 - p));
  });
  return (
    <group ref={group} position={position}>
      <mesh scale={[0.42, 0.8, 0.42]} castShadow>
        <octahedronGeometry args={[1, 0]} />
        <meshStandardMaterial
          color={dim ? "#4b3f5c" : "#c77dff"}
          emissive={dim ? "#1a1025" : "#8a2be2"}
          emissiveIntensity={dim ? 0.2 : 1.4}
          metalness={0.2}
          roughness={0.15}
          transparent
          opacity={dim ? 0.55 : 0.92}
        />
      </mesh>
      {!dim && <pointLight color="#c77dff" intensity={6} distance={5} decay={2} />}
    </group>
  );
}

export function Gem({ position, owned }: { position: Vec3; owned: boolean }) {
  const mesh = useRef<THREE.Mesh>(null);
  useFrame((state) => {
    if (mesh.current) mesh.current.rotation.y = -state.clock.elapsedTime * 1.2;
  });
  return (
    <mesh ref={mesh} position={position} scale={[0.32, 0.26, 0.32]}>
      <icosahedronGeometry args={[1, 0]} />
      <meshStandardMaterial
        color={owned ? "#e8fbff" : "#39424d"}
        emissive={owned ? "#8fe9ff" : "#000000"}
        emissiveIntensity={owned ? 1.2 : 0}
        roughness={0.05}
        metalness={0.3}
        transparent
        opacity={owned ? 0.95 : 0.5}
      />
    </mesh>
  );
}

// --- Critters -------------------------------------------------------------

/** One patrolling critter, built from primitives. Faces its heading. */
export function Critter({
  kind,
  color,
  spiky = false,
}: {
  kind: EnemyKind;
  color: string;
  spiky?: boolean;
}) {
  const skin = <meshStandardMaterial color={color} roughness={0.7} />;
  const eye = (x: number, y: number, z: number, r = 0.07) => (
    <group position={[x, y, z]}>
      <mesh>
        <sphereGeometry args={[r, 10, 8]} />
        <meshStandardMaterial color="#ffffff" roughness={0.3} />
      </mesh>
      <mesh position={[0, 0, r * 0.7]}>
        <sphereGeometry args={[r * 0.5, 8, 6]} />
        <meshStandardMaterial color="#111111" />
      </mesh>
    </group>
  );
  switch (kind) {
    case "turtle":
      return (
        <group>
          <mesh position={[0, 0.38, 0]} scale={[1, 0.62, 1.1]} castShadow>
            <sphereGeometry args={[0.55, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2]} />
            <meshStandardMaterial color={spiky ? "#5b3a2a" : "#2f6b35"} roughness={0.6} />
          </mesh>
          {spiky &&
            [0, 1, 2, 3, 4, 5].map((i) => (
              <mesh
                key={i}
                position={[Math.cos(i) * 0.3, 0.72, Math.sin(i) * 0.3]}
                rotation={[Math.sin(i) * 0.4, 0, -Math.cos(i) * 0.4]}
              >
                <coneGeometry args={[0.08, 0.3, 6]} />
                <meshStandardMaterial color="#e8e1d0" />
              </mesh>
            ))}
          <mesh position={[0, 0.3, 0]} scale={[1.05, 0.25, 1.15]}>
            <cylinderGeometry args={[0.55, 0.55, 0.3, 16]} />
            <meshStandardMaterial color="#d8c27a" roughness={0.8} />
          </mesh>
          <mesh position={[0, 0.42, 0.62]} castShadow>
            <sphereGeometry args={[0.22, 12, 10]} />
            {skin}
          </mesh>
          {eye(-0.09, 0.5, 0.78)}
          {eye(0.09, 0.5, 0.78)}
          {[-1, 1].flatMap((sx) =>
            [-1, 1].map((sz) => (
              <mesh key={`${sx}${sz}`} position={[sx * 0.4, 0.1, sz * 0.35]}>
                <cylinderGeometry args={[0.09, 0.1, 0.22, 8]} />
                {skin}
              </mesh>
            )),
          )}
        </group>
      );
    case "seal":
      return (
        <group>
          <mesh position={[0, 0.4, 0]} rotation={[Math.PI / 2 - 0.35, 0, 0]} castShadow>
            <capsuleGeometry args={[0.36, 0.7, 6, 12]} />
            {skin}
          </mesh>
          <mesh position={[0, 0.78, 0.36]} castShadow>
            <sphereGeometry args={[0.28, 14, 10]} />
            {skin}
          </mesh>
          <mesh position={[0, 0.72, 0.62]}>
            <sphereGeometry args={[0.07, 8, 6]} />
            <meshStandardMaterial color="#1a1a1a" />
          </mesh>
          {eye(-0.1, 0.86, 0.58, 0.06)}
          {eye(0.1, 0.86, 0.58, 0.06)}
          {[-1, 1].map((side) => (
            <mesh key={side} position={[side * 0.38, 0.25, 0.15]} rotation={[0, 0, side * 0.9]}>
              <boxGeometry args={[0.35, 0.06, 0.2]} />
              {skin}
            </mesh>
          ))}
        </group>
      );
    case "rat":
      return (
        <group>
          <mesh position={[0, 0.3, 0]} scale={[0.8, 0.7, 1.3]} castShadow>
            <sphereGeometry args={[0.36, 14, 10]} />
            {skin}
          </mesh>
          <mesh position={[0, 0.36, 0.5]} rotation={[Math.PI / 2, 0, 0]} castShadow>
            <coneGeometry args={[0.18, 0.4, 10]} />
            {skin}
          </mesh>
          <mesh position={[0, 0.34, 0.72]}>
            <sphereGeometry args={[0.05, 8, 6]} />
            <meshStandardMaterial color="#e38a9a" />
          </mesh>
          {[-1, 1].map((side) => (
            <mesh key={side} position={[side * 0.17, 0.58, 0.32]}>
              <circleGeometry args={[0.11, 12]} />
              <meshStandardMaterial color="#e3a2ae" side={THREE.DoubleSide} />
            </mesh>
          ))}
          {eye(-0.09, 0.44, 0.58, 0.05)}
          {eye(0.09, 0.44, 0.58, 0.05)}
          <mesh position={[0, 0.25, -0.75]} rotation={[-1.2, 0, 0]}>
            <cylinderGeometry args={[0.02, 0.04, 0.8, 6]} />
            <meshStandardMaterial color="#e3a2ae" />
          </mesh>
        </group>
      );
    case "vulture":
    case "monkey":
      return (
        <group>
          <mesh position={[0, 0.45, 0]} scale={[1, 1.1, 0.9]} castShadow>
            <sphereGeometry args={[0.32, 14, 10]} />
            {skin}
          </mesh>
          <mesh position={[0, 0.9, 0.05]} castShadow>
            <sphereGeometry args={[0.24, 14, 10]} />
            {skin}
          </mesh>
          <mesh position={[0, 0.86, 0.22]} scale={[1, 0.8, 0.6]}>
            <sphereGeometry args={[0.16, 12, 8]} />
            <meshStandardMaterial color="#e8c9a0" />
          </mesh>
          {eye(-0.08, 0.95, 0.24, 0.05)}
          {eye(0.08, 0.95, 0.24, 0.05)}
          {[-1, 1].map((side) => (
            <group key={side}>
              <mesh position={[side * 0.26, 0.95, 0]}>
                <sphereGeometry args={[0.09, 10, 8]} />
                <meshStandardMaterial color="#e8c9a0" />
              </mesh>
              <mesh position={[side * 0.36, 0.45, 0.05]} rotation={[0, 0, side * 0.5]}>
                <capsuleGeometry args={[0.07, 0.4, 4, 8]} />
                {skin}
              </mesh>
              <mesh position={[side * 0.14, 0.1, 0]}>
                <capsuleGeometry args={[0.08, 0.15, 4, 8]} />
                {skin}
              </mesh>
            </group>
          ))}
          <mesh position={[0, 0.5, -0.4]} rotation={[0.9, 0, 0]}>
            <torusGeometry args={[0.22, 0.04, 6, 14, Math.PI * 1.3]} />
            {skin}
          </mesh>
        </group>
      );
  }
}

// --- The mask that follows you ---------------------------------------------

const maskTarget = new THREE.Vector3();

export function AkuMask({
  follow,
  masks,
}: {
  follow: MutableRefObject<{ x: number; y: number; z: number }>;
  masks: () => number;
}) {
  const group = useRef<THREE.Group>(null);
  const smoothed = useRef(new THREE.Vector3());
  useLayoutEffect(() => {
    smoothed.current.set(follow.current.x, follow.current.y, follow.current.z);
  }, [follow]);
  useFrame((state, delta) => {
    const g = group.current;
    if (!g) return;
    const count = masks();
    const t = state.clock.elapsedTime;
    maskTarget.set(
      follow.current.x + Math.cos(t * 1.3) * 0.9,
      follow.current.y + 1.9 + Math.sin(t * 2.1) * 0.15,
      follow.current.z + Math.sin(t * 1.3) * 0.9,
    );
    smoothed.current.lerp(maskTarget, 1 - Math.exp(-6 * delta));
    g.position.copy(smoothed.current);
    g.rotation.y = Math.atan2(
      state.camera.position.x - g.position.x,
      state.camera.position.z - g.position.z,
    );
    const scale = count > 0 ? (count > 1 ? 1.2 : 1) : 0;
    g.scale.setScalar(THREE.MathUtils.damp(g.scale.x, scale, 8, delta));
  });
  return (
    <group ref={group} scale={0}>
      <mesh scale={[0.3, 0.42, 0.12]}>
        <sphereGeometry args={[1, 16, 12]} />
        <meshStandardMaterial
          color="#d9a55a"
          roughness={0.6}
          emissive="#5a3a10"
          emissiveIntensity={0.4}
        />
      </mesh>
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * 0.1, 0.06, 0.1]}>
          <boxGeometry args={[0.08, 0.05, 0.04]} />
          <meshStandardMaterial color="#2b1a0c" />
        </mesh>
      ))}
      <mesh position={[0, -0.16, 0.1]}>
        <boxGeometry args={[0.16, 0.04, 0.04]} />
        <meshStandardMaterial color="#d8402e" />
      </mesh>
      {[-0.12, 0, 0.12].map((x, i) => (
        <mesh key={x} position={[x, 0.5, -0.02]} rotation={[0, 0, -x * 2]}>
          <coneGeometry args={[0.06, 0.34, 6]} />
          <meshStandardMaterial color={["#e0463a", "#4fc26a", "#3a8ee0"][i]} />
        </mesh>
      ))}
      <pointLight color="#ffd28a" intensity={2} distance={3} decay={2} />
    </group>
  );
}
