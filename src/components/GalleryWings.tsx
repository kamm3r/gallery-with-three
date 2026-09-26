import { useTexture, Sparkles } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { CuboidCollider, CylinderCollider, RigidBody } from "@react-three/rapier";
import { memo, useEffect, useMemo, useRef, type ReactNode } from "react";
import * as THREE from "three";
import {
  WALL_BOTTOM,
  archiveMaze,
  mirrorMaze,
  type GalleryMaze,
  type GallerySigil,
} from "../gameplay/galleryLayout";
import { GalleryInscription, GalleryMap } from "./GalleryArchitecture";
import { KinematicPlatform, PlatformSystem } from "./KinematicPlatform";
import Tree from "./Tree";
import { isPlayerBody } from "../gameplay/playerBody";
import { playSound } from "../gameplay/sound";

type Vec3 = [number, number, number];

export const SIGIL_COLORS: Record<GallerySigil, string> = {
  sun: "#f2c14e",
  leaf: "#8fd17a",
  moon: "#a9c4ff",
  star: "#d9c2ff",
  ember: "#ff8a4a",
};

export function SigilShape({ sigil, scale = 1 }: { sigil: GallerySigil; scale?: number }) {
  switch (sigil) {
    case "sun":
      return <icosahedronGeometry args={[0.5 * scale, 0]} />;
    case "leaf":
      return <dodecahedronGeometry args={[0.48 * scale, 0]} />;
    case "moon":
      return <torusGeometry args={[0.36 * scale, 0.13 * scale, 10, 28, Math.PI * 1.45]} />;
    case "star":
      return <octahedronGeometry args={[0.56 * scale, 0]} />;
    case "ember":
      return <tetrahedronGeometry args={[0.6 * scale, 0]} />;
  }
}

/** Glowing sigil. `lit` 0 renders a dim ghost of the shape. */
export function SigilGem({
  sigil,
  lit = 1,
  scale = 1,
}: {
  sigil: GallerySigil;
  lit?: number;
  scale?: number;
}) {
  const mesh = useRef<THREE.Mesh>(null);
  useFrame((state) => {
    if (!mesh.current) return;
    mesh.current.rotation.y = state.clock.elapsedTime * 0.9;
    mesh.current.position.y = Math.sin(state.clock.elapsedTime * 1.7) * 0.12 * lit;
  });
  return (
    <mesh ref={mesh} castShadow={lit > 0}>
      <SigilShape sigil={sigil} scale={scale} />
      <meshStandardMaterial
        color={SIGIL_COLORS[sigil]}
        emissive={SIGIL_COLORS[sigil]}
        emissiveIntensity={0.15 + lit * 2.2}
        roughness={0.3}
        metalness={0.2}
        // Always transparent: toggling it would recompile the program mid-play.
        transparent
        depthWrite={lit > 0}
        opacity={lit === 0 ? 0.35 : 1}
      />
    </mesh>
  );
}

function isPlayer(event: { other: { rigidBody?: { userData?: unknown } } }) {
  return isPlayerBody(event.other.rigidBody);
}

/** Pulls flat floor dressing towards the camera so it never fights the floor. */
const DECAL = { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 } as const;

export type ButtonFeedback = "good" | "bad" | "neutral";

const FEEDBACK_COLOR: Record<ButtonFeedback, THREE.Color> = {
  good: new THREE.Color("#ffd98a"),
  bad: new THREE.Color("#ff4a3a"),
  neutral: new THREE.Color("#9fb4d8"),
};

/**
 * A floor button the player stands on. The cap travels down while anyone is
 * on it and flashes the result colour. `subtle` sinks it flush with the floor.
 */
export function PressureButton({
  color,
  radius = 0.75,
  lit = 0,
  subtle = false,
  onPress,
}: {
  color: string;
  radius?: number;
  /** 0..1 idle glow of the cap. */
  lit?: number;
  subtle?: boolean;
  onPress: () => ButtonFeedback | void;
}) {
  const cap = useRef<THREE.Group>(null);
  const material = useRef<THREE.MeshStandardMaterial>(null);
  const contacts = useRef(0);
  const flash = useRef(0);
  const flashColor = useRef(FEEDBACK_COLOR.neutral);
  const base = useMemo(() => new THREE.Color(color), [color]);
  const housingTop = subtle ? 0 : 0.16;
  const travel = subtle ? 0.05 : 0.11;
  const capHeight = subtle ? 0.06 : 0.2;
  // Raised: cap top sits `travel` above the housing; pressed: flush with it.
  const raisedY = housingTop + travel - capHeight / 2 + (subtle ? 0.005 : 0.01);
  useFrame((_, rawDelta) => {
    const delta = Math.min(rawDelta, 0.05);
    const group = cap.current;
    if (group) {
      const target = contacts.current > 0 ? raisedY - travel : raisedY;
      group.position.y += (target - group.position.y) * (1 - Math.exp(-22 * delta));
    }
    flash.current = Math.max(0, flash.current - delta * 1.6);
    const surface = material.current;
    if (surface) {
      surface.emissive.copy(base).lerp(flashColor.current, Math.min(1, flash.current * 1.5));
      surface.emissiveIntensity = (subtle ? 0.02 : 0.08 + lit * 0.8) + flash.current * 2.4;
    }
  });
  return (
    <group>
      <RigidBody type="fixed" colliders={false}>
        {!subtle && (
          <CylinderCollider
            args={[housingTop / 2, radius + 0.3]}
            position={[0, housingTop / 2, 0]}
          />
        )}
        <CuboidCollider
          sensor
          args={[radius * 0.8, 0.35, radius * 0.8]}
          position={[0, housingTop + 0.3, 0]}
          onIntersectionEnter={(event) => {
            if (!isPlayer(event)) return;
            contacts.current += 1;
            if (contacts.current > 1) return;
            playSound("press");
            const feedback = onPress() ?? "neutral";
            flashColor.current = FEEDBACK_COLOR[feedback];
            flash.current = 1;
          }}
          onIntersectionExit={(event) => {
            if (isPlayer(event)) contacts.current = Math.max(0, contacts.current - 1);
          }}
        />
      </RigidBody>
      {!subtle && (
        <>
          <mesh position={[0, housingTop / 2, 0]} receiveShadow castShadow>
            <cylinderGeometry args={[radius + 0.26, radius + 0.34, housingTop, 32]} />
            <meshStandardMaterial color="#3a3530" roughness={0.75} />
          </mesh>
          <mesh position={[0, housingTop, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[radius + 0.1, 0.055, 8, 40]} />
            <meshStandardMaterial color="#c9a45c" metalness={0.75} roughness={0.3} />
          </mesh>
        </>
      )}
      <group ref={cap} position={[0, raisedY, 0]}>
        <mesh castShadow={!subtle} receiveShadow>
          {subtle ? (
            <boxGeometry args={[radius * 1.6, capHeight, radius * 1.6]} />
          ) : (
            <cylinderGeometry args={[radius - 0.07, radius, capHeight, 32]} />
          )}
          <meshStandardMaterial ref={material} color={color} emissive={color} roughness={0.45} />
        </mesh>
        <mesh position={[0, capHeight / 2 + 0.004, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[radius * 0.42, radius * 0.5, 32]} />
          <meshBasicMaterial color={subtle ? "#35425f" : "#fff3d6"} {...DECAL} />
        </mesh>
      </group>
    </group>
  );
}

/** Floating sigil that is claimed the moment the player touches it. */
function SigilPickup({
  sigil,
  position,
  found,
  onFind,
}: {
  sigil: GallerySigil;
  position: Vec3;
  found: readonly GallerySigil[];
  onFind: (sigil: GallerySigil) => void;
}) {
  if (found.includes(sigil)) return null;
  return (
    <group position={position}>
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider
          sensor
          args={[0.75, 0.9, 0.75]}
          onIntersectionEnter={(event) => {
            if (isPlayer(event)) onFind(sigil);
          }}
        />
      </RigidBody>
      <SigilGem sigil={sigil} />
      <Sparkles
        count={14}
        scale={[1.6, 1.8, 1.6]}
        size={3}
        speed={0.4}
        color={SIGIL_COLORS[sigil]}
      />
    </group>
  );
}

function Solid({
  position,
  size,
  color,
  metalness = 0,
  roughness = 0.8,
  children,
}: {
  position: Vec3;
  size: Vec3;
  color: string;
  metalness?: number;
  roughness?: number;
  children?: ReactNode;
}) {
  return (
    <RigidBody type="fixed" colliders="cuboid" position={position}>
      <mesh castShadow receiveShadow>
        <boxGeometry args={size} />
        <meshStandardMaterial color={color} metalness={metalness} roughness={roughness} />
      </mesh>
      {children}
    </RigidBody>
  );
}

/** A platform described by its top surface. `pillar` runs it down into the abyss. */
function Ledge({
  x,
  z,
  top,
  size,
  color,
  pillar = false,
  thickness = 0.45,
}: {
  x: number;
  z: number;
  top: number;
  size: [number, number];
  color: string;
  pillar?: boolean;
  thickness?: number;
}) {
  const bottom = pillar ? WALL_BOTTOM : top - thickness;
  return (
    <Solid
      position={[x, (top + bottom) / 2, z]}
      size={[size[0], top - bottom, size[1]]}
      color={color}
    >
      <mesh
        position={[0, (top - bottom) / 2 + 0.015, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow
      >
        <planeGeometry args={[size[0] - 0.12, size[1] - 0.12]} />
        <meshStandardMaterial
          color={new THREE.Color(color).multiplyScalar(1.35)}
          roughness={0.7}
          {...DECAL}
        />
      </mesh>
    </Solid>
  );
}

function Painting({
  image,
  position,
  rotation = [0, 0, 0],
  width = 2.6,
  height = 3.2,
}: {
  image: string;
  position: Vec3;
  rotation?: Vec3;
  width?: number;
  height?: number;
}) {
  const texture = useTexture(image);
  return (
    <group position={position} rotation={rotation}>
      <mesh castShadow>
        <boxGeometry args={[width + 0.5, height + 0.5, 0.16]} />
        <meshStandardMaterial color="#2d2016" roughness={0.6} />
      </mesh>
      <mesh position={[0, 0, 0.06]}>
        <boxGeometry args={[width + 0.18, height + 0.18, 0.1]} />
        <meshStandardMaterial color="#b8935a" metalness={0.65} roughness={0.35} />
      </mesh>
      <mesh position={[0, 0, 0.125]}>
        <planeGeometry args={[width, height]} />
        <meshBasicMaterial map={texture} toneMapped={false} />
      </mesh>
      <mesh position={[0, -height / 2 - 0.55, 0.05]}>
        <boxGeometry args={[0.7, 0.18, 0.04]} />
        <meshStandardMaterial color="#c9a45c" metalness={0.7} roughness={0.3} />
      </mesh>
    </group>
  );
}

/** A reading stand for the keeper's verses. The plaque faces +z at yaw 0. */
function Lectern({ position, yaw = 0, text }: { position: Vec3; yaw?: number; text: string }) {
  return (
    <group position={position} rotation={[0, yaw, 0]}>
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider args={[0.35, 0.6, 0.35]} position={[0, 0.6, 0]} />
      </RigidBody>
      <mesh position={[0, 0.6, 0]} castShadow>
        <cylinderGeometry args={[0.16, 0.3, 1.2, 8]} />
        <meshStandardMaterial color="#5a4330" roughness={0.6} />
      </mesh>
      <group position={[0, 1.42, 0.05]} rotation={[-0.55, 0, 0]}>
        <mesh position={[0, 0, -0.04]} castShadow>
          <boxGeometry args={[1.7, 1.05, 0.07]} />
          <meshStandardMaterial color="#3d2c1c" roughness={0.6} />
        </mesh>
        <GalleryInscription position={[0, 0, 0.012]} text={text} width={1.55} />
      </group>
    </group>
  );
}

function Column({
  position,
  height = 9,
  color = "#b8ae98",
}: {
  position: Vec3;
  height?: number;
  color?: string;
}) {
  return (
    <RigidBody type="fixed" colliders={false} position={position}>
      <CylinderCollider args={[height / 2, 0.55]} position={[0, height / 2, 0]} />
      <mesh position={[0, height / 2, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.42, 0.48, height, 16]} />
        <meshStandardMaterial color={color} roughness={0.55} />
      </mesh>
      {[0.2, height - 0.25].map((y) => (
        <mesh key={y} position={[0, y, 0]} castShadow receiveShadow>
          <boxGeometry args={[1.15, 0.45, 1.15]} />
          <meshStandardMaterial color="#8f846c" roughness={0.6} />
        </mesh>
      ))}
    </RigidBody>
  );
}

function Rug({
  position,
  size,
  color,
  border = "#c9a45c",
}: {
  position: Vec3;
  size: [number, number];
  color: string;
  border?: string;
}) {
  return (
    <group position={position}>
      <mesh position={[0, 0.015, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={size} />
        <meshStandardMaterial color={border} roughness={1} {...DECAL} />
      </mesh>
      <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[size[0] - 0.35, size[1] - 0.35]} />
        <meshStandardMaterial color={color} roughness={1} {...DECAL} />
      </mesh>
    </group>
  );
}

function Bust({
  position,
  yaw = 0,
  color = "#d9d2c3",
}: {
  position: Vec3;
  yaw?: number;
  color?: string;
}) {
  return (
    <group position={position} rotation={[0, yaw, 0]}>
      <Solid position={[0, 0.65, 0]} size={[0.9, 1.3, 0.9]} color="#5b5347" />
      <mesh position={[0, 1.62, 0]} castShadow>
        <cylinderGeometry args={[0.2, 0.45, 0.62, 12]} />
        <meshStandardMaterial color={color} roughness={0.45} />
      </mesh>
      <mesh position={[0, 2.12, 0]} castShadow>
        <sphereGeometry args={[0.3, 16, 12]} />
        <meshStandardMaterial color={color} roughness={0.45} />
      </mesh>
    </group>
  );
}

function Brazier({ position, color = "#ff8a3a" }: { position: Vec3; color?: string }) {
  const flame = useRef<THREE.Mesh>(null);
  useFrame((state) => {
    if (!flame.current) return;
    const t = state.clock.elapsedTime * 9 + position[0];
    flame.current.scale.set(1, 0.85 + Math.sin(t) * 0.12 + Math.sin(t * 2.3) * 0.08, 1);
  });
  return (
    <group position={position}>
      <Solid position={[0, 0.45, 0]} size={[0.5, 0.9, 0.5]} color="#2b2522" metalness={0.5} />
      <mesh position={[0, 1.02, 0]} castShadow>
        <cylinderGeometry args={[0.5, 0.3, 0.3, 10]} />
        <meshStandardMaterial color="#3a302a" metalness={0.6} roughness={0.4} />
      </mesh>
      <mesh ref={flame} position={[0, 1.45, 0]}>
        <coneGeometry args={[0.3, 0.8, 8]} />
        <meshBasicMaterial color={new THREE.Color(color).multiplyScalar(3)} toneMapped={false} />
      </mesh>
    </group>
  );
}

// --- Foyer, long gallery and the other public rooms ---------------------

function PublicRooms() {
  return (
    <>
      {/* Entrance hall */}
      <Rug position={[0, 0, 18]} size={[3.4, 17.4]} color="#5a1c26" />
      {[-6, 6].flatMap((x) =>
        [12.5, 23.5].map((z) => <Column key={`${x},${z}`} position={[x, 0, z]} />),
      )}
      <Painting
        image="/assets/oilpainting.jpg"
        position={[-5, 3.4, 26.6]}
        rotation={[0, Math.PI, 0]}
      />
      <Painting
        image="/assets/tree.jpg"
        position={[0, 3.6, 26.6]}
        rotation={[0, Math.PI, 0]}
        width={3.2}
        height={4}
      />
      <Painting image="/assets/hands.jpg" position={[5, 3.4, 26.6]} rotation={[0, Math.PI, 0]} />
      <Painting
        image="/assets/sweesh.jpg"
        position={[8.6, 3.4, 12]}
        rotation={[0, -Math.PI / 2, 0]}
      />
      <Painting
        image="/assets/mankey.jpg"
        position={[8.6, 3.4, 24]}
        rotation={[0, -Math.PI / 2, 0]}
      />
      <Painting
        image="/assets/plaster.jpg"
        position={[-8.6, 3.4, 12]}
        rotation={[0, Math.PI / 2, 0]}
      />
      {/* The empty frame is the door: the closet wall behind it is an illusion. */}
      <group position={[-8.62, 2.1, 24]} rotation={[0, Math.PI / 2, 0]}>
        {[-1, 1].map((side) => (
          <mesh key={side} position={[side * 1.3, 0, 0]}>
            <boxGeometry args={[0.24, 3.9, 0.16]} />
            <meshStandardMaterial color="#b8935a" metalness={0.65} roughness={0.35} />
          </mesh>
        ))}
        <mesh position={[0, 1.95, 0]}>
          <boxGeometry args={[2.84, 0.24, 0.16]} />
          <meshStandardMaterial color="#b8935a" metalness={0.65} roughness={0.35} />
        </mesh>
        <GalleryInscription
          position={[0, 2.75, 0.05]}
          text={"The open door\n(on loan)"}
          width={1.4}
        />
      </group>
      <GalleryInscription
        position={[-5, 3.6, 9.4]}
        text={
          "The keeper's testament\nFive sigils were scattered through the collection.\nBring them home to the hall of sigils,\nthen walk the keeper's journey on its plates.\nSix verses remember the way.\nOne wrong step and the journey starts again."
        }
        width={5.2}
      />
      <GalleryMap position={[5, 3.6, 9.4]} width={4.4} />
      <Lectern position={[3.2, 0, 19.5]} text={"Verse I\nThe journey began\nbeneath the star."} />
      {[-1, 1].map((side) => (
        <Solid
          key={side}
          position={[side * 7.6, 0.25, 18 + side * 5.5]}
          size={[1, 0.5, 3.2]}
          color="#4a3322"
        />
      ))}

      {/* Long gallery */}
      <Rug position={[0, 0, 3]} size={[2.4, 11.4]} color="#1f3b37" />
      <Painting
        image="/assets/pocket_monsters.jpg"
        position={[2.6, 3.4, 6]}
        rotation={[0, -Math.PI / 2, 0]}
      />
      <Painting
        image="/assets/fieldhouse.jpg"
        position={[2.6, 3.4, 0]}
        rotation={[0, -Math.PI / 2, 0]}
      />
      <Painting image="/assets/text.jpg" position={[-2.6, 3.4, 6]} rotation={[0, Math.PI / 2, 0]} />
      <Painting
        image="/assets/sweesh.jpg"
        position={[-2.6, 3.4, 0]}
        rotation={[0, Math.PI / 2, 0]}
      />

      {/* Hall of busts → sun archive */}
      <Rug position={[-15, 0, -12]} size={[11.4, 2.4]} color="#5a3a1c" />
      {[-18, -12].flatMap((x) =>
        [-13.9, -10.1].map((z) => (
          <Bust key={`${x},${z}`} position={[x, 0, z]} yaw={z < -12 ? 0 : Math.PI} />
        )),
      )}
      <GalleryInscription
        position={[-15, 4.4, -14.6]}
        text={
          "The sun archive\nThe sun sleeps in the deepest stacks.\nThe far shelves breathe a draught."
        }
        width={4.6}
      />

      {/* Silver corridor → moon chamber */}
      <Rug position={[15, 0, -12]} size={[11.4, 2.4]} color="#26324f" />
      {[12, 18].flatMap((x) =>
        [-14.62, -9.38].map((z) => (
          <mesh key={`${x},${z}`} position={[x, 2.4, z]} rotation={[0, z < -12 ? 0 : Math.PI, 0]}>
            <planeGeometry args={[1.8, 3.8]} />
            <meshStandardMaterial
              color="#aebfd8"
              metalness={0.9}
              roughness={0.08}
              emissive="#1c2840"
            />
          </mesh>
        )),
      )}
      <GalleryInscription
        position={[15, 5.6, -14.6]}
        text={
          "The moon chamber\nMirrors lie; count your turns.\nOne stone of its floor is not a stone."
        }
        width={4.6}
      />

      {/* Star stair */}
      <GalleryInscription
        position={[32.6, 3.6, -33]}
        rotation={[0, -Math.PI / 2, 0]}
        text={"The observatory\nThe star waits atop the orrery.\nA fall costs only time."}
        width={4.4}
      />
      {[-36.5, -33, -29.5].map((z, i) => (
        <Solid
          key={z}
          position={[27.9, 0.2 + i * 0.2, z]}
          size={[1.2, 0.4 + i * 0.4, 2]}
          color="#2e3456"
        />
      ))}

      {/* Passages to the pits */}
      <GalleryInscription
        position={[12, 3.8, 15.4]}
        text={
          "The suspended garden\nThe leaf rests beyond the drop.\nThe garden remembers your last step."
        }
        width={4.4}
      />
      <GalleryInscription
        position={[-12, 3.8, 15.4]}
        text={"The ember crypt\nWalk softly above the embers.\nIts last flame guards a quiet room."}
        width={4.4}
      />

      {/* Vault approach */}
      <Rug position={[0, 0, -30]} size={[2.6, 17.4]} color="#6b4f1f" />
      <Painting
        image="/assets/oilpainting.jpg"
        position={[2.6, 3.4, -27]}
        rotation={[0, -Math.PI / 2, 0]}
      />
      <Painting
        image="/assets/hands.jpg"
        position={[-2.6, 3.4, -33]}
        rotation={[0, Math.PI / 2, 0]}
      />
    </>
  );
}

// --- Sun archive: a seeded bookshelf maze -------------------------------

function useBookTexture() {
  const texture = useMemo(() => {
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
  }, []);
  useEffect(() => () => texture.dispose(), [texture]);
  return texture;
}

function MazeWalls({
  maze,
  height,
  thickness,
  materials,
}: {
  maze: GalleryMaze;
  height: number;
  thickness: number;
  materials: THREE.Material[];
}) {
  return (
    <RigidBody type="fixed" colliders={false}>
      {maze.segments.map(({ from, to }, i) => {
        const alongX = from[1] === to[1];
        const length = Math.hypot(to[0] - from[0], to[1] - from[1]) + thickness;
        const position: Vec3 = [(from[0] + to[0]) / 2, height / 2, (from[1] + to[1]) / 2];
        return (
          <group key={i} position={position} rotation={[0, alongX ? 0 : Math.PI / 2, 0]}>
            <CuboidCollider args={[length / 2, height / 2, thickness / 2]} />
            <mesh castShadow receiveShadow material={materials}>
              <boxGeometry args={[length, height, thickness]} />
            </mesh>
          </group>
        );
      })}
    </RigidBody>
  );
}

function SunArchive({
  found,
  onFind,
}: {
  found: readonly GallerySigil[];
  onFind: (s: GallerySigil) => void;
}) {
  const books = useBookTexture();
  const materials = useMemo(() => {
    const wood = new THREE.MeshStandardMaterial({ color: "#4a301c", roughness: 0.7 });
    const spines = new THREE.MeshStandardMaterial({ map: books, roughness: 0.85 });
    return [wood, wood, wood, wood, spines, spines];
  }, [books]);
  useEffect(
    () => () => {
      materials[0].dispose();
      materials[4].dispose();
    },
    [materials],
  );
  const [vx, vz] = archiveMaze.deadEnds[0];
  const [sx, sz] = archiveMaze.deepest;
  return (
    <>
      <MazeWalls maze={archiveMaze} height={3.6} thickness={0.7} materials={materials} />
      <SigilPickup sigil="sun" position={[sx, 1.3, sz]} found={found} onFind={onFind} />
      <Lectern
        position={[vx, 0, vz]}
        text={"Verse II\nSecond, the keeper\nclimbed toward the sun."}
      />
      <Sparkles
        position={[-33, 3, -15]}
        count={60}
        scale={[24, 5, 24]}
        size={2}
        speed={0.15}
        color="#ffd89a"
      />
    </>
  );
}

// --- Moon chamber: a mirror maze with a hidden pressure stone -----------

function MoonChamber({
  found,
  onFind,
  onSecretPlate,
}: {
  found: readonly GallerySigil[];
  onFind: (s: GallerySigil) => void;
  onSecretPlate: () => void;
}) {
  const materials = useMemo(() => {
    const frame = new THREE.MeshStandardMaterial({
      color: "#2b3350",
      metalness: 0.7,
      roughness: 0.35,
    });
    const glass = new THREE.MeshStandardMaterial({
      color: "#b9c9e6",
      metalness: 0.95,
      roughness: 0.06,
      emissive: "#1a2748",
      emissiveIntensity: 0.9,
    });
    return [frame, frame, frame, frame, glass, glass];
  }, []);
  useEffect(
    () => () => {
      materials[0].dispose();
      materials[4].dispose();
    },
    [materials],
  );
  const [mx, mz] = mirrorMaze.deepest;
  const [px, pz] = mirrorMaze.deadEnds[0];
  const [vx, vz] = mirrorMaze.deadEnds[1];
  return (
    <>
      <MazeWalls maze={mirrorMaze} height={4.4} thickness={0.35} materials={materials} />
      <SigilPickup sigil="moon" position={[mx, 1.3, mz]} found={found} onFind={onFind} />
      <Lectern position={[vx, 0, vz]} text={"Verse III\nThird, the leaf\nof the hanging garden."} />
      {/* The hidden stone: a hair darker than the floor, with a faint crescent. */}
      <group position={[px, 0, pz]}>
        <PressureButton subtle color="#2a3244" onPress={onSecretPlate} />
      </group>
      <Sparkles
        position={[33, 2.5, -15]}
        count={70}
        scale={[24, 4, 24]}
        size={2.5}
        speed={0.2}
        color="#bcd0ff"
      />
    </>
  );
}

// --- Suspended garden: platforms over a green abyss ---------------------

function SuspendedGarden({
  found,
  onFind,
}: {
  found: readonly GallerySigil[];
  onFind: (s: GallerySigil) => void;
}) {
  const moss = "#4e6b3f";
  return (
    <>
      <Ledge x={16.75} z={18} top={0} size={[3.5, 5]} color={moss} pillar />
      <Ledge x={19.2} z={21.9} top={0.4} size={[2, 2]} color={moss} pillar />
      <Ledge x={22.4} z={24} top={0.9} size={[2, 2]} color={moss} pillar />
      <Ledge x={27} z={24} top={1.2} size={[5, 0.75]} color="#6b5a3a" thickness={0.3} />
      <KinematicPlatform
        position={[32, 1.1, 22]}
        axis="z"
        distance={2.2}
        speed={0.9}
        size={[2.2, 0.35, 2.2]}
        color="#5d7a4a"
      />
      <Ledge x={35.5} z={18.5} top={2} size={[2, 2]} color={moss} pillar />
      <KinematicPlatform
        position={[36, 2.05, 14]}
        shape="cylinder"
        radius={1.5}
        size={[3, 0.3, 3]}
        spin={0.9}
        color="#6f8f55"
      />
      <Ledge x={33.2} z={10.4} top={2.7} size={[1.6, 1.6]} color={moss} pillar />
      <Ledge x={36.3} z={5.6} top={2.2} size={[4.4, 4.4]} color={moss} pillar />
      <Tree variant="spreading" position={[37.6, 2.2, 7.2]} scale={0.7} />
      <Tree variant="round" position={[16.2, 0, 16.2]} scale={0.55} />
      <SigilPickup sigil="leaf" position={[35.2, 3.4, 4.6]} found={found} onFind={onFind} />
      <Lectern
        position={[37.4, 2.2, 4.3]}
        yaw={Math.PI / 4}
        text={"Verse IV\nFourth, the ember\nthat sleeps below."}
      />
      {[18, 24, 30, 36].map((x, i) => (
        <mesh key={x} position={[x, 5.5 - (i % 2) * 1.5, 26.4]}>
          <cylinderGeometry args={[0.06, 0.06, 7 + (i % 2) * 3, 5]} />
          <meshStandardMaterial color="#3f6b35" />
        </mesh>
      ))}
      <Sparkles
        position={[27, 1, 15]}
        count={90}
        scale={[24, 8, 24]}
        size={4}
        speed={0.3}
        color="#d6ff9a"
      />
    </>
  );
}

// --- Ember crypt: narrow bridges and moving stones over embers ----------

function EmberCrypt({
  found,
  onFind,
}: {
  found: readonly GallerySigil[];
  onFind: (s: GallerySigil) => void;
}) {
  const stone = "#4a3530";
  return (
    <>
      <Ledge x={-16.75} z={18} top={0} size={[3.5, 5]} color={stone} pillar />
      <Ledge x={-21.25} z={18} top={0} size={[5.5, 0.7]} color="#3a2a26" thickness={0.3} />
      <KinematicPlatform
        position={[-26.2, 0, 18]}
        axis="y"
        distance={1.2}
        speed={1}
        size={[2.2, 0.35, 2.2]}
        color="#5a3a30"
      />
      <Ledge x={-29.5} z={18} top={0.6} size={[1.8, 1.8]} color={stone} pillar />
      <KinematicPlatform
        position={[-29.5, 0.45, 13.5]}
        axis="z"
        distance={1.8}
        speed={1.2}
        size={[2.2, 0.35, 2.2]}
        color="#5a3a30"
      />
      <KinematicPlatform
        position={[-29.5, 0.45, 7.6]}
        shape="cylinder"
        radius={1.6}
        size={[3.2, 0.3, 3.2]}
        spin={-1.2}
        color="#6a3a2a"
      />
      <Ledge x={-36.2} z={6} top={0} size={[5.3, 5]} color={stone} pillar />
      <Solid position={[-35, 0.5, 4.3]} size={[0.9, 1, 0.9]} color="#3a2a26" />
      <SigilPickup sigil="ember" position={[-35, 1.9, 4.3]} found={found} onFind={onFind} />
      <Brazier position={[-17.8, 0, 15.8]} />
      <Brazier position={[-17.8, 0, 20.2]} />
      <Brazier position={[-29.5, 0.6, 18]} />
      {/* The last flame, right beside the illusory wall into the ossuary. */}
      <Brazier position={[-38, 0, 8.2]} color="#ffb04a" />
      <Sparkles
        position={[-27, -3, 15]}
        count={120}
        scale={[24, 12, 24]}
        size={5}
        speed={0.7}
        color="#ff9a4a"
      />
    </>
  );
}

// --- Observatory: a spiral of floating ledges up to the orrery ----------

function Orrery() {
  const rings = useRef<THREE.Group>(null);
  useFrame((_, delta) => {
    if (!rings.current) return;
    rings.current.children.forEach((ring, i) => {
      ring.rotation.y += delta * (0.12 + i * 0.07) * (i % 2 ? -1 : 1);
    });
  });
  return (
    <group ref={rings} position={[30, 10.5, -48]}>
      {[4.5, 6.5, 8].map((radius, i) => (
        <group key={radius} rotation={[0.25 * (i - 1), 0, 0.18 * i]}>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[radius, 0.07, 6, 64]} />
            <meshStandardMaterial color="#b8935a" metalness={0.8} roughness={0.3} />
          </mesh>
          <mesh position={[radius, 0, 0]}>
            <sphereGeometry args={[0.35 + i * 0.12, 16, 12]} />
            <meshStandardMaterial
              color={["#9ab8ff", "#ffb07a", "#c8a0ff"][i]}
              emissive={["#9ab8ff", "#ffb07a", "#c8a0ff"][i]}
              emissiveIntensity={1.4}
            />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function Observatory({
  found,
  onFind,
}: {
  found: readonly GallerySigil[];
  onFind: (s: GallerySigil) => void;
}) {
  const slab = "#3d4470";
  return (
    <>
      <Ledge x={35.8} z={-42.8} top={1.1} size={[2.4, 2.4]} color={slab} />
      <Ledge x={37} z={-46.4} top={2.2} size={[2.2, 2.2]} color={slab} />
      <Ledge x={37} z={-50} top={3.3} size={[2.2, 2.2]} color={slab} />
      <KinematicPlatform
        position={[33.8, 4.1, -53.5]}
        axis="x"
        distance={1.4}
        speed={0.9}
        size={[2.4, 0.35, 2.4]}
        color="#5a64a0"
      />
      <Ledge x={29.5} z={-54.4} top={4.9} size={[2.2, 2.2]} color={slab} />
      <Ledge x={25.6} z={-53.2} top={5.7} size={[2, 2]} color={slab} />
      <KinematicPlatform
        position={[24.2, 6.1, -49.5]}
        axis="z"
        distance={1.3}
        speed={1}
        size={[2, 0.35, 2]}
        color="#5a64a0"
      />
      <Ledge x={26.9} z={-47} top={6.8} size={[1.6, 1.6]} color={slab} />
      <RigidBody type="fixed" colliders={false} position={[30, 0, -48]}>
        <CylinderCollider args={[3.6, 1.8]} position={[0, 3.6, 0]} />
        <mesh position={[0, 3.6, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[1.8, 2.3, 7.2, 24]} />
          <meshStandardMaterial color="#2b3158" roughness={0.5} metalness={0.3} />
        </mesh>
        <mesh position={[0, 7.25, 0]}>
          <cylinderGeometry args={[1.95, 1.95, 0.12, 24]} />
          <meshStandardMaterial color="#b8935a" metalness={0.7} roughness={0.3} />
        </mesh>
      </RigidBody>
      <SigilPickup sigil="star" position={[30, 8.3, -48]} found={found} onFind={onFind} />
      <Orrery />
      <Sparkles
        position={[30, 5, -48]}
        count={120}
        scale={[18, 10, 18]}
        size={3}
        speed={0.1}
        color="#d9d0ff"
      />
    </>
  );
}

// --- Secret rooms --------------------------------------------------------

function SecretRooms() {
  return (
    <>
      {/* Painter's study, behind the archive's farthest shelves. */}
      <Rug position={[-39, 0, -33]} size={[8, 8]} color="#2f3f2c" />
      <group position={[-42, 0, -36]} rotation={[0, 0.5, 0]}>
        {[-1, 1].map((side) => (
          <mesh
            key={side}
            position={[side * 0.6, 1.3, 0]}
            rotation={[0.12, 0, side * -0.18]}
            castShadow
          >
            <boxGeometry args={[0.1, 2.8, 0.1]} />
            <meshStandardMaterial color="#6b4a2a" />
          </mesh>
        ))}
        <Painting
          image="/assets/oilpainting.jpg"
          position={[0, 2, 0.15]}
          rotation={[-0.12, 0, 0]}
          width={1.6}
          height={1.9}
        />
      </group>
      <Solid position={[-36, 0.45, -37.5]} size={[3, 0.9, 1.4]} color="#4a3322" />
      <Lectern position={[-38.5, 0, -32]} text={"Verse V\nFifth, the cold light\nof the moon."} />

      {/* Mirror conservatory, opened by the hidden stone. */}
      <Tree variant="conical" position={[48, 0, -24.5]} scale={0.7} />
      <Tree variant="oval" position={[48, 0, -11.5]} scale={0.7} />
      <Lectern
        position={[48.5, 0, -18]}
        yaw={-Math.PI / 2}
        text={"Verse VI\nAt last the keeper\nreturned to the sun."}
      />
      <Sparkles
        position={[48, 3, -18]}
        count={50}
        scale={[5, 6, 16]}
        size={3}
        speed={0.2}
        color="#c8f0ff"
      />

      {/* Collector's closet, through the empty frame in the entrance hall. */}
      <GalleryInscription
        position={[-14.6, 3.4, 24]}
        rotation={[0, Math.PI / 2, 0]}
        text={
          "Collector's note\nThree rooms were struck from the map:\none behind the archive's farthest shelves,\none past the crypt's last flame,\none a hidden stone in the moon maze opens."
        }
        width={4.8}
      />
      <Solid position={[-12, 0.4, 26]} size={[1.6, 0.8, 0.9]} color="#6b4a2a">
        <mesh position={[0, 0.45, 0]}>
          <boxGeometry args={[1.64, 0.1, 0.94]} />
          <meshStandardMaterial color="#c9a45c" metalness={0.7} roughness={0.3} />
        </mesh>
      </Solid>

      {/* Ossuary, past the last flame. */}
      <GalleryInscription
        position={[-44.6, 3.4, 9]}
        rotation={[0, Math.PI / 2, 0]}
        text={
          "The keeper's ledger\nSix verses tell the journey. They rest in\nthe entrance hall, the sun archive,\nthe moon chamber, the suspended garden,\nthe painter's study and the mirror conservatory."
        }
        width={5}
      />
      {[4.5, 13.5].map((z) => (
        <Brazier key={z} position={[-42, 0, z]} color="#ffc06a" />
      ))}
    </>
  );
}

// --- Vault ----------------------------------------------------------------

function Vault({ open }: { open: boolean }) {
  return (
    <>
      <Rug position={[0, 0, -51]} size={[4, 22]} color="#6b1f2a" />
      {[-6, 6].flatMap((x) =>
        [-44, -52, -58].map((z) => (
          <Column key={`${x},${z}`} position={[x, 0, z]} color="#d4c49a" />
        )),
      )}
      {(["star", "sun", "leaf", "ember", "moon"] as const).map((sigil, i) => (
        <group key={sigil} position={[i % 2 ? 8 : -8, 0, -42 - i * 4]}>
          <Solid position={[0, 0.7, 0]} size={[1, 1.4, 1]} color="#8a7a55" />
          <group position={[0, 2.2, 0]}>
            <SigilGem sigil={sigil} lit={open ? 1 : 0} scale={1.1} />
          </group>
        </group>
      ))}
      <GalleryInscription
        position={[-6.2, 3.6, -62.6]}
        text={
          "The collection remembers.\nEvery journey leaves a trace.\nStep through: the forest is yours again."
        }
        width={4.6}
      />
      <Painting
        image="/assets/pocket_monsters.jpg"
        position={[6.2, 3.6, -62.6]}
        width={2.4}
        height={3}
      />
    </>
  );
}

/** Memoised: only sigil pickups and the vault opening change its output. */
export const GalleryWings = memo(function GalleryWings({
  found,
  solved,
  onFind,
  onSecretPlate,
}: {
  found: readonly GallerySigil[];
  solved: boolean;
  onFind: (sigil: GallerySigil) => void;
  onSecretPlate: () => void;
}) {
  return (
    <>
      <PlatformSystem />
      <PublicRooms />
      <SunArchive found={found} onFind={onFind} />
      <MoonChamber found={found} onFind={onFind} onSecretPlate={onSecretPlate} />
      <SuspendedGarden found={found} onFind={onFind} />
      <EmberCrypt found={found} onFind={onFind} />
      <Observatory found={found} onFind={onFind} />
      <SecretRooms />
      <Vault open={solved} />
    </>
  );
});
