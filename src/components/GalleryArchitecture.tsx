import { useFrame, useThree } from "@react-three/fiber";
import { memo, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { CuboidCollider, RigidBody } from "@react-three/rapier";
import * as THREE from "three";
import {
  CELL,
  DOOR_HEIGHT,
  DOOR_WIDTH,
  WALL_BOTTOM,
  WALL_HEIGHT,
  corniceCapBoxes,
  cornices,
  doorFrames,
  galleryDoors,
  galleryFloors,
  galleryRooms,
  lightAnchors,
  roomBounds,
  sealedDoors,
  wallCores,
  wallLinings,
  type Box,
  type DoorKey,
  type RoomId,
} from "../gameplay/galleryLayout";

/** Wall colliders rise past the visible cornice so no ledge can be grabbed on top. */
const COLLIDER_TOP = 15;

export function GalleryInscription({
  text,
  position,
  rotation,
  width = 4,
}: {
  text: string;
  position: [number, number, number];
  rotation?: [number, number, number];
  width?: number;
}) {
  const { texture, aspect } = useMemo(() => {
    const lines = text.split("\n");
    const canvas = document.createElement("canvas");
    canvas.width = 1024;
    canvas.height = Math.max(256, 110 + lines.length * 62);
    const ctx = canvas.getContext("2d")!;
    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    gradient.addColorStop(0, "#26333b");
    gradient.addColorStop(1, "#1a2329");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 1024, canvas.height);
    ctx.strokeStyle = "#b99a5e";
    ctx.lineWidth = 6;
    ctx.strokeRect(18, 18, 988, canvas.height - 36);
    ctx.lineWidth = 2;
    ctx.strokeRect(34, 34, 956, canvas.height - 68);
    ctx.textAlign = "center";
    lines.forEach((line, i) => {
      ctx.fillStyle = i === 0 ? "#e8c888" : "#ece1c4";
      ctx.font = i === 0 ? "italic 46px Georgia" : "36px Georgia";
      ctx.fillText(line, 512, 96 + i * 62);
    });
    const result = new THREE.CanvasTexture(canvas);
    result.colorSpace = THREE.SRGBColorSpace;
    result.anisotropy = 4;
    return { texture: result, aspect: canvas.height / canvas.width };
  }, [text]);
  useEffect(() => () => texture.dispose(), [texture]);
  return (
    <mesh position={position} rotation={rotation}>
      <planeGeometry args={[width, width * aspect]} />
      <meshBasicMaterial map={texture} toneMapped={false} />
    </mesh>
  );
}

/** Floor plan of the public rooms. Secret rooms are, naturally, left off. */
export function GalleryMap({
  position,
  rotation,
  width = 4.4,
}: {
  position: [number, number, number];
  rotation?: [number, number, number];
  width?: number;
}) {
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 1024;
    canvas.height = 1024;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#e4d6b4";
    ctx.fillRect(0, 0, 1024, 1024);
    ctx.strokeStyle = "#6b5431";
    ctx.lineWidth = 8;
    ctx.strokeRect(14, 14, 996, 996);
    const scale = 52;
    const toX = (x: number) => 512 + x * scale;
    const toY = (z: number) => 560 + z * scale;
    ctx.textAlign = "center";
    ctx.font = "bold 44px Georgia";
    ctx.fillStyle = "#4a3820";
    ctx.fillText("The Keeper's Collection", 512, 72);
    for (const room of galleryRooms) {
      if (room.secret) continue;
      const [x1, x2, z1, z2] = room.rect;
      ctx.fillStyle = room.pit ? "#3b3026" : "#c9b58c";
      ctx.fillRect(toX(x1 - 0.5), toY(z1 - 0.5), (x2 - x1 + 1) * scale, (z2 - z1 + 1) * scale);
      ctx.strokeStyle = "#4a3820";
      ctx.lineWidth = 4;
      ctx.strokeRect(toX(x1 - 0.5), toY(z1 - 0.5), (x2 - x1 + 1) * scale, (z2 - z1 + 1) * scale);
    }
    for (const door of galleryDoors) {
      if (door.kind === "illusory" || door.key === "conservatory") continue;
      const x = (door.a[0] + door.b[0]) / 2;
      const z = (door.a[1] + door.b[1]) / 2;
      ctx.fillStyle = door.kind === "sealed" ? "#8a2f2a" : "#c9b58c";
      const alongX = door.a[1] !== door.b[1];
      ctx.fillRect(
        toX(x) - (alongX ? 12 : 5),
        toY(z) - (alongX ? 5 : 12),
        alongX ? 24 : 10,
        alongX ? 10 : 24,
      );
    }
    ctx.font = "italic 22px Georgia";
    for (const room of galleryRooms) {
      if (room.secret || room.id.endsWith("Passage")) continue;
      const [x1, x2, z1, z2] = room.rect;
      ctx.fillStyle = room.pit ? "#e4d6b4" : "#3a2c18";
      ctx.fillText(room.name, toX((x1 + x2) / 2), toY((z1 + z2) / 2) + 8);
    }
    ctx.fillStyle = "#a33a2a";
    ctx.beginPath();
    ctx.arc(toX(0), toY(3.6), 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = "22px Georgia";
    ctx.fillText("you are here", toX(0), toY(3.6) + 40);
    const result = new THREE.CanvasTexture(canvas);
    result.colorSpace = THREE.SRGBColorSpace;
    result.anisotropy = 4;
    return result;
  }, []);
  useEffect(() => () => texture.dispose(), [texture]);
  return (
    <group position={position} rotation={rotation}>
      <mesh position={[0, 0, -0.04]}>
        <boxGeometry args={[width + 0.3, width + 0.3, 0.08]} />
        <meshStandardMaterial color="#3a2a18" roughness={0.6} />
      </mesh>
      <mesh position={[0, 0, 0.012]}>
        <planeGeometry args={[width, width]} />
        <meshBasicMaterial map={texture} toneMapped={false} />
      </mesh>
    </group>
  );
}

interface InstancedBoxesProps {
  boxes: Array<Box & { color?: string }>;
  color?: string;
  roughness?: number;
  metalness?: number;
  castShadow?: boolean;
  receiveShadow?: boolean;
}

/** One draw call for a list of axis-aligned boxes, optionally per-box coloured. */
export function InstancedBoxes({
  boxes,
  color = "#ffffff",
  roughness = 0.85,
  metalness = 0,
  castShadow = false,
  receiveShadow = true,
}: InstancedBoxesProps) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const batch = mesh.current!;
    const transform = new THREE.Object3D();
    const tint = new THREE.Color();
    boxes.forEach((box, i) => {
      transform.position.fromArray(box.position);
      transform.scale.fromArray(box.size);
      transform.updateMatrix();
      batch.setMatrixAt(i, transform.matrix);
      batch.setColorAt(i, tint.set(box.color ?? color));
    });
    batch.instanceMatrix.needsUpdate = true;
    if (batch.instanceColor) batch.instanceColor.needsUpdate = true;
    batch.computeBoundingSphere();
  }, [boxes, color]);
  return (
    <instancedMesh
      ref={mesh}
      args={[undefined, undefined, boxes.length]}
      castShadow={castShadow}
      receiveShadow={receiveShadow}
    >
      <boxGeometry />
      <meshStandardMaterial roughness={roughness} metalness={metalness} />
    </instancedMesh>
  );
}

function shade(color: string, amount: number) {
  return `#${new THREE.Color(color).multiplyScalar(amount).getHexString()}`;
}

function useShellGeometry() {
  return useMemo(() => {
    const floors = galleryFloors.map(({ cell: [x, z], color }) => ({
      position: [x * CELL, -0.2, z * CELL] as Box["position"],
      size: [CELL, 0.4, CELL] as Box["size"],
      color,
    }));
    // A dark wainscot and a thin gilded rail on every lining that reaches the floor.
    const wainscots: Array<Box & { color: string }> = [];
    const rails: Box[] = [];
    for (const lining of wallLinings) {
      const [px, py, pz] = lining.position;
      const [sx, sy, sz] = lining.size;
      const bottom = py - sy / 2;
      const top = py + sy / 2;
      const thick = (s: number) => (s === 0.06 ? 0.14 : s);
      // Perpendicular runs overlap in the corners; a hair of height apart
      // keeps their top faces from sharing a plane.
      const lift = sx > sz ? 0 : 0.02;
      if (bottom <= 0 && top >= 1.4 && bottom > WALL_BOTTOM) {
        wainscots.push({
          position: [px, (1.3 + lift) / 2, pz],
          size: [thick(sx), 1.3 + lift, thick(sz)],
          color: shade(lining.color, 0.55),
        });
      }
      if (bottom <= 4.8 && top >= 5)
        rails.push({ position: [px, 4.9 + lift, pz], size: [thick(sx), 0.12, thick(sz)] });
    }
    const trims: Box[] = [];
    for (const frame of doorFrames) {
      if (frame.kind === "illusory") continue;
      const [x, , z] = frame.position;
      const at = (a: number, y: number, along: number, height: number): Box => ({
        position: frame.alongX ? [x + a, y, z] : [x, y, z + a],
        size: frame.alongX ? [along, height, 0.8] : [0.8, height, along],
      });
      // Jambs stand 4 cm proud of the opening so they never share the
      // wall's cut face.
      const side = DOOR_WIDTH / 2 + 0.14;
      trims.push(at(-side, (DOOR_HEIGHT + 0.3) / 2, 0.36, DOOR_HEIGHT + 0.3));
      trims.push(at(side, (DOOR_HEIGHT + 0.3) / 2, 0.36, DOOR_HEIGHT + 0.3));
      trims.push(at(0, DOOR_HEIGHT + 0.25, DOOR_WIDTH + 0.7, 0.45));
      trims.push(at(0, DOOR_HEIGHT + 0.62, 0.6, 0.35));
    }
    return { floors, wainscots, rails, trims };
  }, []);
}

function Chandeliers() {
  const rings = useRef<THREE.InstancedMesh>(null);
  const chains = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const transform = new THREE.Object3D();
    const tint = new THREE.Color();
    lightAnchors.forEach((anchor, i) => {
      transform.position.fromArray(anchor.position);
      transform.rotation.set(Math.PI / 2, 0, 0);
      transform.scale.setScalar(1);
      transform.updateMatrix();
      rings.current!.setMatrixAt(i, transform.matrix);
      rings.current!.setColorAt(i, tint.set(anchor.color).multiplyScalar(2.6));
      const length = WALL_HEIGHT + 1 - anchor.position[1];
      transform.position.set(
        anchor.position[0],
        anchor.position[1] + length / 2,
        anchor.position[2],
      );
      transform.rotation.set(0, 0, 0);
      transform.scale.set(1, length, 1);
      transform.updateMatrix();
      chains.current!.setMatrixAt(i, transform.matrix);
    });
    for (const batch of [rings.current!, chains.current!]) {
      batch.instanceMatrix.needsUpdate = true;
      if (batch.instanceColor) batch.instanceColor.needsUpdate = true;
      batch.computeBoundingSphere();
    }
  }, []);
  return (
    <>
      <instancedMesh ref={rings} args={[undefined, undefined, lightAnchors.length]}>
        <torusGeometry args={[0.85, 0.07, 6, 28]} />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
      <instancedMesh ref={chains} args={[undefined, undefined, lightAnchors.length]}>
        <cylinderGeometry args={[0.03, 0.03, 1, 5]} />
        <meshStandardMaterial color="#3a332a" metalness={0.6} roughness={0.5} />
      </instancedMesh>
    </>
  );
}

const POOL_SIZE = 6;
/** Re-rank fixtures a few times a second, not every frame. */
const POOL_RANK_INTERVAL = 0.2;
const focus = new THREE.Vector3();
const forward = new THREE.Vector3();

/**
 * A fixed handful of point lights follows the camera between the ceiling
 * fixtures. Shader cost stays flat however many rooms the museum has.
 */
function LightPool() {
  const lights = useRef<Array<THREE.PointLight | null>>([]);
  const slots = useRef(Array.from({ length: POOL_SIZE }, () => ({ anchor: -1 })));
  const ranked = useRef(new Set<number>());
  const sinceRank = useRef(Infinity);
  const camera = useThree((state) => state.camera);
  useFrame((_, rawDelta) => {
    const delta = Math.min(rawDelta, 0.05);
    sinceRank.current += delta;
    if (sinceRank.current >= POOL_RANK_INTERVAL) {
      sinceRank.current = 0;
      camera.getWorldDirection(forward);
      focus.copy(camera.position).addScaledVector(forward.setY(0).normalize(), 3);
      ranked.current = new Set(
        lightAnchors
          .map((anchor, i) => ({
            i,
            d: (anchor.position[0] - focus.x) ** 2 + (anchor.position[2] - focus.z) ** 2,
          }))
          .sort((a, b) => a.d - b.d)
          .slice(0, POOL_SIZE)
          .map(({ i }) => i),
      );
    }
    const wanted = new Set(ranked.current);
    const blend = 1 - Math.exp(-5 * delta);
    slots.current.forEach((slot, k) => {
      const light = lights.current[k];
      if (!light) return;
      const keep = wanted.delete(slot.anchor);
      const target = keep ? lightAnchors[slot.anchor].intensity : 0;
      light.intensity += (target - light.intensity) * blend;
      if (!keep && light.intensity < 0.4) slot.anchor = -1;
    });
    for (const anchor of wanted) {
      const k = slots.current.findIndex((slot) => slot.anchor === -1);
      if (k < 0) break;
      const light = lights.current[k];
      if (!light) continue;
      slots.current[k].anchor = anchor;
      light.position.fromArray(lightAnchors[anchor].position);
      light.position.y -= 0.6;
      light.color.set(lightAnchors[anchor].color);
      light.intensity = 0;
    }
  });
  return (
    <>
      {Array.from({ length: POOL_SIZE }, (_, k) => (
        <pointLight
          key={k}
          ref={(light) => {
            lights.current[k] = light;
          }}
          intensity={0}
          distance={18}
          decay={1.6}
        />
      ))}
    </>
  );
}

/** Skylight sun: a tight shadow frustum that travels with the camera. */
function SkylightSun() {
  const light = useRef<THREE.DirectionalLight>(null);
  const { camera, scene } = useThree();
  useLayoutEffect(() => {
    const sun = light.current!;
    scene.add(sun.target);
    return () => {
      scene.remove(sun.target);
    };
  }, [scene]);
  useFrame(() => {
    const sun = light.current;
    if (!sun) return;
    camera.getWorldDirection(forward);
    focus.copy(camera.position).addScaledVector(forward.setY(0).normalize(), 6);
    // Snap to shadow texels so walls don't shimmer as the frustum follows.
    focus.set(Math.round(focus.x), 0, Math.round(focus.z));
    sun.target.position.copy(focus);
    sun.position.set(focus.x - 16, 42, focus.z + 10);
  });
  return (
    <directionalLight
      ref={light}
      castShadow
      intensity={0.8}
      color="#f3dfbf"
      shadow-mapSize={[2048, 2048]}
      shadow-camera-left={-26}
      shadow-camera-right={26}
      shadow-camera-top={26}
      shadow-camera-bottom={-26}
      shadow-camera-near={1}
      shadow-camera-far={90}
      shadow-bias={-0.0004}
      shadow-normalBias={0.06}
    />
  );
}

const abyssGlow: Partial<Record<RoomId, string>> = { garden: "#2f8a55", crypt: "#ff5a1c" };

function Abysses() {
  return (
    <>
      {galleryRooms
        .filter((room) => room.pit)
        .map((room) => {
          const [minX, maxX, minZ, maxZ] = roomBounds(room.id);
          const glow = new THREE.Color(abyssGlow[room.id] ?? "#223").multiplyScalar(1.6);
          return (
            <group key={room.id}>
              <mesh
                position={[(minX + maxX) / 2, WALL_BOTTOM + 0.4, (minZ + maxZ) / 2]}
                rotation={[-Math.PI / 2, 0, 0]}
              >
                <planeGeometry args={[maxX - minX, maxZ - minZ]} />
                <meshBasicMaterial color={glow} toneMapped={false} />
              </mesh>
            </group>
          );
        })}
    </>
  );
}

function SealedSlab({ box, open }: { box: Box; open: boolean }) {
  const group = useRef<THREE.Group>(null);
  useFrame((_, delta) => {
    if (!group.current) return;
    const target = open ? -DOOR_HEIGHT - 0.2 : 0;
    group.current.position.y += (target - group.current.position.y) * (1 - Math.exp(-1.6 * delta));
  });
  const [w, h, d] = box.size;
  const alongX = w > d;
  return (
    <>
      {!open && (
        <RigidBody type="fixed" colliders={false} position={box.position}>
          <CuboidCollider args={[w / 2, h / 2, d / 2]} />
        </RigidBody>
      )}
      <group position={box.position}>
        <group ref={group}>
          <mesh castShadow receiveShadow>
            <boxGeometry args={box.size} />
            <meshStandardMaterial color="#6d5a3a" metalness={0.55} roughness={0.38} />
          </mesh>
          {[-1, 1].map((side) => (
            <mesh
              key={side}
              position={alongX ? [0, 0.3, (side * d) / 2] : [(side * w) / 2, 0.3, 0]}
              rotation={[0, alongX ? 0 : Math.PI / 2, 0]}
            >
              <torusGeometry args={[0.72, 0.06, 8, 36]} />
              <meshBasicMaterial color={[2.4, 1.8, 0.9]} toneMapped={false} />
            </mesh>
          ))}
        </group>
      </group>
    </>
  );
}

/**
 * The fixed shell. Memoised: HUD state changes on the page must not
 * re-reconcile hundreds of colliders.
 */
export const GalleryArchitecture = memo(function GalleryArchitecture({
  openKeys,
}: {
  openKeys: readonly DoorKey[];
}) {
  const { floors, wainscots, rails, trims } = useShellGeometry();
  return (
    <>
      <RigidBody type="fixed" colliders={false}>
        {floors.map((floor, i) => (
          <CuboidCollider
            key={`f${i}`}
            args={[CELL / 2, 0.2, CELL / 2]}
            position={floor.position}
          />
        ))}
        {wallCores.map((core, i) => {
          if (!core.collide) return null;
          const bottom = core.position[1] - core.size[1] / 2;
          const top =
            core.position[1] + core.size[1] / 2 === WALL_HEIGHT
              ? COLLIDER_TOP
              : core.position[1] + core.size[1] / 2;
          return (
            <CuboidCollider
              key={`w${i}`}
              position={[core.position[0], (bottom + top) / 2, core.position[2]]}
              args={[core.size[0] / 2, (top - bottom) / 2, core.size[2] / 2]}
            />
          );
        })}
      </RigidBody>
      <InstancedBoxes boxes={floors} roughness={0.55} />
      <InstancedBoxes boxes={wallCores} color="#2a2b2e" castShadow />
      <InstancedBoxes boxes={wallLinings} roughness={0.92} />
      <InstancedBoxes boxes={wainscots} roughness={0.7} />
      <InstancedBoxes boxes={rails} color="#b8955a" metalness={0.6} roughness={0.35} />
      <InstancedBoxes boxes={cornices} color="#8c826c" castShadow />
      <InstancedBoxes boxes={corniceCapBoxes} color="#9a8f76" castShadow />
      <InstancedBoxes boxes={trims} color="#a78a58" metalness={0.25} roughness={0.55} castShadow />
      {sealedDoors.map((door) => (
        <SealedSlab key={door.key} box={door} open={openKeys.includes(door.key)} />
      ))}
      <Chandeliers />
      <LightPool />
      <SkylightSun />
      <Abysses />
    </>
  );
});
