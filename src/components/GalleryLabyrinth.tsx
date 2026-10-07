import { useEcsState } from "../hooks/useEcsState";
import { useEcsRef } from "../hooks/useEcsRef";
import { useCallback, useEffect, useRef } from "react";
import { Stars } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { CuboidCollider, CylinderCollider, RigidBody } from "@react-three/rapier";
import * as THREE from "three";
import { GalleryArchitecture, GalleryInscription } from "./GalleryArchitecture";
import {
  GalleryWings,
  PressureButton,
  SIGIL_COLORS,
  SigilGem,
  type ButtonFeedback,
} from "./GalleryWings";
import {
  GALLERY_BOUNDS,
  GALLERY_SEQUENCE,
  GALLERY_SIGILS,
  advanceGallerySequence,
  roomAt,
  type DoorKey,
  type RoomId,
  type GallerySigil,
} from "../gameplay/galleryLayout";
import { playSound, setFootstepSurface, setZone, type SoundZone } from "../gameplay/sound";
import { PortalPainting } from "./PortalPainting";
import { PortalFrameCollider } from "./PortalFrameCollider";
import { ThirdPersonPlayer } from "./ThirdPersonPlayer";
import { isPlayerBody } from "../gameplay/playerBody";

interface Props {
  nearPortal: boolean;
  portalImpact: boolean;
  onNearPortal: (value: boolean) => void;
  onExit: () => void;
  onReady: () => void;
  onHangChange: (value: boolean) => void;
  onPuzzleProgress: (value: number) => void;
  onNotice: (message: string) => void;
}

type Vec3 = [number, number, number];

/** Dev-only `?spawn=x,z[,yawDegrees]` drops the player straight into a wing for testing. */
const DEV_SPAWN =
  import.meta.env.DEV && typeof window !== "undefined"
    ? new URLSearchParams(window.location.search).get("spawn")?.split(",").map(Number)
    : undefined;
const START: Vec3 = DEV_SPAWN ? [DEV_SPAWN[0], 0, DEV_SPAWN[1]] : [0, 0, 23];
const START_YAW = DEV_SPAWN?.[2] === undefined ? Math.PI : (DEV_SPAWN[2] * Math.PI) / 180;
const PORTAL: Vec3 = [0, 2.2, -62.3];
const ROTUNDA: [number, number] = [0, -12];
/** Plate order around the ring deliberately differs from the journey. */
const RING: GallerySigil[] = ["moon", "star", "ember", "sun", "leaf"];

const SIGIL_NAMES: Record<GallerySigil, string> = {
  sun: "sun",
  leaf: "leaf",
  moon: "moon",
  star: "star",
  ember: "ember",
};

function isPlayer(event: { other: { rigidBody?: { userData?: unknown } } }) {
  return isPlayerBody(event.other.rigidBody);
}

function Checkpoint({
  position,
  size,
  onEnter,
}: {
  position: Vec3;
  size: Vec3;
  onEnter: () => void;
}) {
  return (
    <RigidBody type="fixed" colliders={false} position={position}>
      <CuboidCollider
        sensor
        args={size}
        onIntersectionEnter={(event) => {
          if (isPlayer(event)) onEnter();
        }}
      />
    </RigidBody>
  );
}

const ROOM_ZONES: Partial<Record<RoomId, SoundZone>> = {
  archive: "archive",
  study: "archive",
  westHall: "archive",
  mirrors: "mirrors",
  eastHall: "mirrors",
  conservatory: "mirrors",
  garden: "garden",
  gardenPassage: "garden",
  crypt: "crypt",
  cryptPassage: "crypt",
  ossuary: "crypt",
  starStair: "observatory",
  observatory: "observatory",
  vault: "vault",
  vaultHall: "vault",
};

/** Follows the camera through the wings: ambience zones, stone steps, falls. */
function GalleryAudio() {
  const camera = useThree((state) => state.camera);
  const zone = useRef<SoundZone | null>(null);
  const elapsed = useEcsRef("elapsed", () => 0);
  const falling = useEcsRef("falling", () => false);
  useEffect(() => {
    setFootstepSurface("stone");
    return () => {
      setFootstepSurface("grass");
      setZone(null);
    };
  }, []);
  useFrame((_, delta) => {
    elapsed.current += delta;
    if (elapsed.current < 0.25) return;
    elapsed.current = 0;
    const { x, y, z } = camera.position;
    if (y < -3 && !falling.current) {
      falling.current = true;
      playSound("fall");
    } else if (y > 0) {
      falling.current = false;
    }
    const room = roomAt(x, z);
    const next = (room && ROOM_ZONES[room.id]) ?? "halls";
    if (next !== zone.current) {
      zone.current = next;
      setZone(next);
    }
  });
  return null;
}

function KeeperStatue({ progress }: { progress: number }) {
  const halo = useRef<THREE.Mesh>(null);
  useFrame((state, delta) => {
    if (!halo.current) return;
    halo.current.rotation.z += delta * (0.3 + progress * 0.25);
    halo.current.position.y = 4.6 + Math.sin(state.clock.elapsedTime) * 0.08;
  });
  const glow = progress / GALLERY_SEQUENCE.length;
  return (
    <group position={[ROTUNDA[0], 0, ROTUNDA[1]]}>
      <RigidBody type="fixed" colliders={false}>
        <CylinderCollider args={[0.6, 1.4]} position={[0, 0.6, 0]} />
        <CylinderCollider args={[1.6, 0.55]} position={[0, 2.8, 0]} />
      </RigidBody>
      <mesh position={[0, 0.6, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[1.4, 1.6, 1.2, 24]} />
        <meshStandardMaterial color="#8f866f" roughness={0.6} />
      </mesh>
      <mesh position={[0, 2.5, 0]} castShadow>
        <coneGeometry args={[0.75, 2.6, 16]} />
        <meshStandardMaterial color="#d8d0bd" roughness={0.45} />
      </mesh>
      <mesh position={[0, 4.05, 0]} castShadow>
        <sphereGeometry args={[0.38, 20, 14]} />
        <meshStandardMaterial color="#d8d0bd" roughness={0.45} />
      </mesh>
      <mesh ref={halo} position={[0, 4.6, 0]} rotation={[Math.PI / 2.4, 0, 0]}>
        <torusGeometry args={[0.8, 0.05, 8, 40]} />
        <meshBasicMaterial
          color={new THREE.Color("#ffd68a").multiplyScalar(1 + glow * 3)}
          toneMapped={false}
        />
      </mesh>
      {GALLERY_SEQUENCE.map((_, i) => {
        const angle = (i / GALLERY_SEQUENCE.length) * Math.PI * 2;
        return (
          <mesh key={i} position={[Math.sin(angle) * 1.25, 5.3, Math.cos(angle) * 1.25]}>
            <sphereGeometry args={[0.12, 12, 8]} />
            <meshBasicMaterial
              color={i < progress ? new THREE.Color(3, 2.4, 1.2) : new THREE.Color("#3a3a44")}
              toneMapped={false}
            />
          </mesh>
        );
      })}
      <mesh position={[0, 0.015, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[6.1, 6.45, 72]} />
        <meshStandardMaterial color="#c9a45c" metalness={0.6} roughness={0.35} />
      </mesh>
    </group>
  );
}

function SigilPlate({
  sigil,
  angle,
  found,
  onPress,
}: {
  sigil: GallerySigil;
  angle: number;
  found: boolean;
  onPress: (sigil: GallerySigil) => ButtonFeedback;
}) {
  const x = ROTUNDA[0] + Math.sin(angle) * 5;
  const z = ROTUNDA[1] + Math.cos(angle) * 5;
  return (
    <group position={[x, 0, z]}>
      <PressureButton
        color={SIGIL_COLORS[sigil]}
        lit={found ? 1 : 0}
        onPress={() => onPress(sigil)}
      />
      <group position={[0, 1.8, 0]}>
        <SigilGem sigil={sigil} lit={found ? 1 : 0} scale={0.8} />
      </group>
      {/* Name stands just outside the plate, facing the statue. */}
      <group rotation={[0, angle + Math.PI, 0]}>
        <GalleryInscription position={[0, 0.6, -1.45]} text={SIGIL_NAMES[sigil]} width={1.1} />
      </group>
    </group>
  );
}

export function GalleryLabyrinth(props: Props) {
  const { onPuzzleProgress, onNotice } = props;
  const [found, setFound] = useEcsState<GallerySigil[]>("gallery-found", []);
  const [progress, setProgress] = useEcsState("gallery-progress", 0);
  const [openKeys, setOpenKeys] = useEcsState<DoorKey[]>("gallery-openKeys", []);
  const [respawn, setRespawn] = useEcsState<Vec3>("gallery-respawn", START);
  const solved = progress === GALLERY_SEQUENCE.length;
  const progressRef = useEcsRef("progressRef", () => 0);
  const foundRef = useEcsRef<GallerySigil[]>("foundRef", () => []);

  const find = useCallback(
    (sigil: GallerySigil) => {
      if (foundRef.current.includes(sigil)) return;
      foundRef.current = [...foundRef.current, sigil];
      setFound(foundRef.current);
      playSound("sigil", { intensity: foundRef.current.length / GALLERY_SIGILS.length });
      const count = foundRef.current.length;
      onNotice(
        count === GALLERY_SIGILS.length
          ? "All five sigils recovered. Return to the hall of sigils."
          : `The ${SIGIL_NAMES[sigil]} sigil recovered (${count} / ${GALLERY_SIGILS.length})`,
      );
    },
    [onNotice],
  );

  const press = useCallback(
    (sigil: GallerySigil): ButtonFeedback => {
      if (foundRef.current.length < GALLERY_SIGILS.length) {
        playSound("deny");
        onNotice(
          `The plates stay cold. ${foundRef.current.length} / ${GALLERY_SIGILS.length} sigils recovered.`,
        );
        return "neutral";
      }
      const before = progressRef.current;
      if (before >= GALLERY_SEQUENCE.length) return "neutral";
      const next = advanceGallerySequence(before, sigil, foundRef.current);
      progressRef.current = next;
      if (next !== before) {
        setProgress(next);
        onPuzzleProgress(next);
      }
      if (next === GALLERY_SEQUENCE.length) {
        setOpenKeys((keys) => [...keys, "vault"]);
        playSound("solve");
        playSound("rumble");
        onNotice("The vault door grinds open.");
        return "good";
      }
      if (next > before) {
        playSound("correct", { intensity: next / GALLERY_SEQUENCE.length });
        return "good";
      }
      playSound("wrong");
      onNotice("A wrong step. The journey starts again.");
      return "bad";
    },
    [onNotice, onPuzzleProgress],
  );

  const conservatoryOpen = useEcsRef("conservatoryOpen", () => false);
  const openConservatory = useCallback(() => {
    if (conservatoryOpen.current) return;
    conservatoryOpen.current = true;
    setOpenKeys((keys) => [...keys, "conservatory"]);
    playSound("secret");
    playSound("rumble");
    onNotice("Somewhere in the moon chamber, stone slides against stone.");
  }, [onNotice]);

  return (
    <>
      <color attach="background" args={["#0e1420"]} />
      <fog attach="fog" args={["#0e1420", 34, 95]} />
      <hemisphereLight args={["#b9c6de", "#2a2622", 0.55]} />
      <Stars radius={140} depth={40} count={2500} factor={5} saturation={0.2} fade speed={0.4} />
      <GalleryAudio />
      <GalleryArchitecture openKeys={openKeys} />
      <GalleryWings found={found} solved={solved} onFind={find} onSecretPlate={openConservatory} />

      <KeeperStatue progress={progress} />
      {RING.map((sigil, i) => (
        <SigilPlate
          key={sigil}
          sigil={sigil}
          angle={((i * 72 + 36) * Math.PI) / 180}
          found={found.includes(sigil)}
          onPress={press}
        />
      ))}
      <GalleryInscription
        position={[-5.5, 3.8, -20.6]}
        text={
          solved
            ? "The journey is complete.\nThe vault stands open."
            : found.length < GALLERY_SIGILS.length
              ? `The hall of sigils\nThe plates wait for their sigils.\nRecovered: ${found.length} / ${GALLERY_SIGILS.length}`
              : `The hall of sigils\nWalk the keeper's journey.\nSteps taken: ${progress} / ${GALLERY_SEQUENCE.length}`
        }
        width={4.6}
      />
      <GalleryInscription
        position={[5.5, 3.8, -20.6]}
        text={"The vault\nSix steps, as the verses tell.\nA wrong step undoes them all."}
        width={4.6}
      />

      <Checkpoint
        position={[12, 1, 18]}
        size={[2.5, 1, 2.5]}
        onEnter={() => setRespawn([12, 0, 18])}
      />
      <Checkpoint
        position={[-12, 1, 18]}
        size={[2.5, 1, 2.5]}
        onEnter={() => setRespawn([-12, 0, 18])}
      />
      <Checkpoint position={[0, 1, 18]} size={[8.5, 1, 8.5]} onEnter={() => setRespawn(START)} />

      <PortalPainting
        image="/assets/tree.jpg"
        position={PORTAL}
        active={solved && (props.nearPortal || props.portalImpact)}
        impact={props.portalImpact}
      />
      <PortalFrameCollider position={PORTAL} />
      <ThirdPersonPlayer
        start={START}
        startYaw={START_YAW}
        respawn={respawn}
        bounds={GALLERY_BOUNDS}
        cameraDistance={4.2}
        portals={solved ? [{ id: "forest", position: [PORTAL[0], 0, PORTAL[2]] }] : []}
        onNearPortal={(id) => props.onNearPortal(Boolean(id))}
        onEnterPortal={props.onExit}
        onHangChange={props.onHangChange}
        onReady={props.onReady}
      />
    </>
  );
}
