import { FramedArtwork } from "./FramedArtwork";
import { useCallback, useState } from "react";
import { CuboidCollider, CylinderCollider, RigidBody } from "@react-three/rapier";
import { PortalPainting } from "./PortalPainting";
import { PortalFrameCollider } from "./PortalFrameCollider";
import { ThirdPersonPlayer } from "./ThirdPersonPlayer";
import Tree from "./Tree";
import { GallerySealPuzzle } from "./GallerySealPuzzle";

interface GalleryWorldProps {
  nearPortal: boolean;
  portalImpact: boolean;
  onNearPortal: (near: boolean) => void;
  onExit: () => void;
  onReady: () => void;
  onHangChange: (hanging: boolean) => void;
  onPuzzleProgress: (progress: number) => void;
}

const artworks = [
  "/assets/text.jpg",
  "/assets/sweesh.jpg",
  "/assets/hands.jpg",
  "/assets/mankey.jpg",
  "/assets/oilpainting.jpg",
  "/assets/plaster.jpg",
  "/assets/tree.jpg",
  "/assets/pocket_monsters.jpg",
];

const bays = [5.2, 1, -3.2, -7.4];

export function GalleryWorld({
  nearPortal,
  portalImpact,
  onNearPortal,
  onExit,
  onReady,
  onHangChange,
  onPuzzleProgress,
}: GalleryWorldProps) {
  const [puzzleProgress, setPuzzleProgress] = useState(0);
  const puzzleSolved = puzzleProgress === 3;

  const updatePuzzleProgress = useCallback(
    (progress: number) => {
      setPuzzleProgress(progress);
      onPuzzleProgress(progress);
    },
    [onPuzzleProgress],
  );

  return (
    <>
      <color attach="background" args={["#182225"]} />
      <fog attach="fog" args={["#182225", 19, 38]} />
      <hemisphereLight args={["#c8d7cc", "#101719", 1.15]} />
      <directionalLight
        castShadow
        color="#dae2d9"
        intensity={1.7}
        position={[-5, 11, 5]}
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-left={-12}
        shadow-camera-right={12}
        shadow-camera-top={16}
        shadow-camera-bottom={-16}
        shadow-camera-near={0.5}
        shadow-camera-far={45}
      />

      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider args={[9, 0.2, 13.5]} position={[0, -0.2, 0]} />
        <CuboidCollider args={[0.23, 2.65, 13.5]} position={[-8.8, 2.65, 0]} />
        <CuboidCollider args={[0.23, 2.65, 13.5]} position={[8.8, 2.65, 0]} />
        <CuboidCollider args={[9, 2.65, 0.23]} position={[0, 2.65, -13.3]} />
        <CuboidCollider args={[9, 2.65, 0.23]} position={[0, 2.65, 13.3]} />
        <CylinderCollider args={[0.34, 2.3]} position={[0, 0.34, -10.7]} />
      </RigidBody>

      <mesh position={[0, -0.2, 0]} receiveShadow>
        <boxGeometry args={[18, 0.4, 27]} />
        <meshStandardMaterial color="#66736c" roughness={0.92} />
      </mesh>
      <mesh position={[0, 0.018, -0.5]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[3.5, 22]} />
        <meshStandardMaterial color="#394f43" roughness={1} />
      </mesh>

      <mesh position={[-8.8, 2.65, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.45, 5.3, 27]} />
        <meshStandardMaterial color="#344246" roughness={0.88} />
      </mesh>
      <mesh position={[8.8, 2.65, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.45, 5.3, 27]} />
        <meshStandardMaterial color="#344246" roughness={0.88} />
      </mesh>
      <mesh position={[0, 2.65, -13.3]} castShadow receiveShadow>
        <boxGeometry args={[18, 5.3, 0.45]} />
        <meshStandardMaterial color="#2c393c" roughness={0.9} />
      </mesh>
      <mesh position={[0, 2.65, 13.3]} castShadow receiveShadow>
        <boxGeometry args={[18, 5.3, 0.45]} />
        <meshStandardMaterial color="#2c393c" roughness={0.9} />
      </mesh>

      {bays.map((z) => (
        <group key={z}>
          <mesh position={[0, 5.05, z]} castShadow>
            <boxGeometry args={[17.8, 0.22, 0.32]} />
            <meshStandardMaterial color="#8b6840" roughness={0.58} />
          </mesh>
          <mesh position={[0, 4.94, z]}>
            <boxGeometry args={[14.6, 0.06, 0.12]} />
            <meshBasicMaterial color="#e8c486" />
          </mesh>
          <pointLight
            color="#f2cb8c"
            intensity={11}
            distance={7.5}
            decay={2}
            position={[0, 4.3, z]}
          />
        </group>
      ))}

      {artworks.map((image, index) => {
        const side = index % 2 === 0 ? -1 : 1;
        const row = Math.floor(index / 2);
        return (
          <FramedArtwork
            key={image}
            image={image}
            position={[side * 7.45, 2.35, 5.2 - row * 4.2]}
            rotation={[0, (side * -Math.PI) / 2, 0]}
          />
        );
      })}

      <mesh position={[0, 0.34, -10.7]} castShadow receiveShadow>
        <cylinderGeometry args={[2.2, 2.45, 0.68, 32]} />
        <meshStandardMaterial color="#68736a" roughness={0.88} />
      </mesh>
      <Tree position={[0, 0.68, -10.7]} scale={1.35} />
      <pointLight color="#b9d68f" intensity={18} distance={8} decay={2} position={[0, 3.7, -9.4]} />

      <GallerySealPuzzle onProgressChange={updatePuzzleProgress} />

      <PortalPainting
        image="/assets/tree.jpg"
        position={[0, 2.2, 12.65]}
        rotation={[0, Math.PI, 0]}
        active={puzzleSolved && (nearPortal || portalImpact)}
        impact={portalImpact}
      />
      <PortalFrameCollider position={[0, 2.2, 12.65]} rotation={[0, Math.PI, 0]} />
      <ThirdPersonPlayer
        start={[0, 0, 6.4]}
        portals={puzzleSolved ? [{ id: "forest", position: [0, 0, 12.65] }] : []}
        bounds={[7.7, 11.8]}
        cameraDistance={4.8}
        onNearPortal={(portalId) => onNearPortal(Boolean(portalId))}
        onEnterPortal={() => onExit()}
        onHangChange={onHangChange}
        onReady={onReady}
      />
    </>
  );
}
