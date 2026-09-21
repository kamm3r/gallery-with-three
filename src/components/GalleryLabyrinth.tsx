import { useState } from "react";
import { CuboidCollider, RigidBody } from "@react-three/rapier";
import { GalleryArchitecture, GalleryInscription } from "./GalleryArchitecture";
import { advanceGallerySequence, type GallerySigil } from "../gameplay/galleryLayout";
import { PortalPainting } from "./PortalPainting";
import { PortalFrameCollider } from "./PortalFrameCollider";
import { ThirdPersonPlayer } from "./ThirdPersonPlayer";

interface Props {
  nearPortal: boolean;
  portalImpact: boolean;
  onNearPortal: (value: boolean) => void;
  onExit: () => void;
  onReady: () => void;
  onHangChange: (value: boolean) => void;
  onPuzzleProgress: (value: number) => void;
}
const colors = { sun: "#e6b65a", leaf: "#93c08a", moon: "#a3bbec" };
function Block({
  position,
  size,
  color = "#4a5b61",
}: {
  position: [number, number, number];
  size: [number, number, number];
  color?: string;
}) {
  return (
    <RigidBody type="fixed" colliders="cuboid" position={position}>
      <mesh castShadow receiveShadow>
        <boxGeometry args={size} />
        <meshStandardMaterial color={color} roughness={0.85} />
      </mesh>
    </RigidBody>
  );
}
export function GalleryLabyrinth(props: Props) {
  const [found, setFound] = useState<GallerySigil[]>([]);
  const [progress, setProgress] = useState(0);
  const [secrets, setSecrets] = useState<number[]>([]);
  const solved = progress === 5;
  const press = (name: GallerySigil) => {
    const next = advanceGallerySequence(progress, name, found);
    setProgress(next);
    props.onPuzzleProgress(next);
  };
  return (
    <>
      <color attach="background" args={["#202d38"]} />
      <fog attach="fog" args={["#202d38", 45, 110]} />
      <hemisphereLight args={["#c7d2df", "#394245", 1.35]} />
      <directionalLight
        castShadow
        position={[-25, 45, 10]}
        intensity={1.8}
        color="#f1dec2"
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-65}
        shadow-camera-right={65}
        shadow-camera-top={65}
        shadow-camera-bottom={-65}
        shadow-camera-far={150}
        shadow-normalBias={0.03}
      />
      <GalleryArchitecture />
      <GalleryInscription
        position={[0, 3.5, -2.7]}
        text={`The keeper's testament\nFind the three lost sigils.\nDawn wakes the garden; night follows.\nThrough the garden, return to dawn.\nRecovered: ${found.length} / 3`}
        width={5}
      />
      <GalleryInscription
        position={[-24, 3.4, -20.7]}
        text={
          "The sun archive\nA light sleeps behind the shelves.\nAn unlit passage hides another story."
        }
        width={5}
      />
      <GalleryInscription
        position={[24, 3.4, -20.7]}
        text={
          "The moon chamber\nWalk around the broken mirrors.\nTheir silver backs conceal a passage."
        }
        width={5}
      />
      <GalleryInscription
        position={[24, 3.4, 9.3]}
        text={
          "The suspended garden\nClimb the stones to recover the leaf.\nNo progress is lost when you fall."
        }
        width={5}
      />
      {[-1, 0, 1].map((i) => (
        <Block
          key={`s${i}`}
          position={[-24 + i * 4, 1.6, -12 + (i % 2 ? 2 : -2)]}
          size={[0.7, 3.2, 9]}
          color="#665247"
        />
      ))}
      {[-1, 0, 1].map((i) => (
        <Block
          key={`m${i}`}
          position={[24 + i * 4, 1.3, -12 + (i % 2 ? -2 : 2)]}
          size={[0.55, 2.6, 8]}
          color="#81969d"
        />
      ))}
      {[0, 1, 2].map((i) => (
        <Block
          key={i}
          position={[20 + i * 3.5, 0.2 + i * 0.2, 21]}
          size={[2.5, 0.4 + i * 0.4, 2.5]}
          color="#677d67"
        />
      ))}
      {(["sun", "moon", "leaf"] as const).map(
        (name, i) =>
          !found.includes(name) && (
            <RigidBody
              key={name}
              type="fixed"
              colliders={false}
              position={i === 0 ? [-26, 1.2, -17] : i === 1 ? [26, 1.2, -17] : [27, 1.9, 21]}
            >
              <CuboidCollider
                sensor
                args={[0.65, 0.55, 0.65]}
                onIntersectionEnter={(event) => {
                  if (event.other.rigidBody?.isDynamic())
                    setFound((current) => (current.includes(name) ? current : [...current, name]));
                }}
              />
              <mesh>
                <octahedronGeometry args={[0.45]} />
                <meshStandardMaterial
                  color={colors[name]}
                  emissive={colors[name]}
                  emissiveIntensity={1.5}
                />
              </mesh>
            </RigidBody>
          ),
      )}
      {(["sun", "leaf", "moon"] as const).map((name, i) => (
        <group key={name} position={[(i - 1) * 3, 0, 0]}>
          <RigidBody type="fixed" colliders={false}>
            <CuboidCollider
              sensor
              position={[0, 0.25, 0]}
              args={[0.75, 0.25, 0.75]}
              onIntersectionEnter={(event) => {
                if (event.other.rigidBody?.isDynamic()) press(name);
              }}
            />
            <mesh position={[0, 0.07, 0]}>
              <cylinderGeometry args={[0.8, 0.9, 0.14, 16]} />
              <meshStandardMaterial
                color={colors[name]}
                emissive={colors[name]}
                emissiveIntensity={found.includes(name) ? 0.8 : 0}
              />
            </mesh>
          </RigidBody>
          <GalleryInscription position={[0, 1.2, -0.9]} text={name} width={1.3} />
        </group>
      ))}
      <GalleryInscription
        position={[0, 2.8, -8.8]}
        text={
          solved
            ? "The vault is open."
            : found.length < 3
              ? "Recover all three sigils first."
              : `Remember the keeper's journey.\nSequence: ${progress} / 5\nA wrong step breaks the sequence.`
        }
        width={4.5}
      />
      {!solved && <Block position={[0, 3.5, -27]} size={[6, 7, 0.6]} color="#7d7058" />}
      {[-1, 1].map((side) => (
        <group key={side}>
          {!secrets.includes(side) && (
            <>
              <Block position={[side * 30, 3.5, -21]} size={[6, 7, 0.45]} />
              <RigidBody type="fixed" colliders={false} position={[side * 31, 0.3, -17]}>
                <CuboidCollider
                  sensor
                  args={[0.65, 0.5, 0.65]}
                  onIntersectionEnter={(event) => {
                    if (event.other.rigidBody?.isDynamic())
                      setSecrets((current) => [...new Set([...current, side])]);
                  }}
                />
                <mesh>
                  <cylinderGeometry args={[0.35, 0.4, 0.15, 8]} />
                  <meshStandardMaterial color="#b29a64" />
                </mesh>
              </RigidBody>
            </>
          )}
          <GalleryInscription
            position={[side * 33, 3, -44.7]}
            text={
              side < 0
                ? "The keeper walked five steps.\nSun. Leaf. Moon. Leaf. Sun."
                : "A hidden collection\nYou found the mirror conservatory."
            }
            width={5}
          />
          <mesh position={[side * 33, 1.3, -39]}>
            <icosahedronGeometry args={[1]} />
            <meshStandardMaterial
              color={side < 0 ? "#e2b76b" : "#9bbac8"}
              metalness={0.7}
              roughness={0.25}
            />
          </mesh>
        </group>
      ))}
      <PortalPainting
        image="/assets/tree.jpg"
        position={[0, 2.2, -47]}
        active={solved && (props.nearPortal || props.portalImpact)}
        impact={props.portalImpact}
      />
      <PortalFrameCollider position={[0, 2.2, -47]} />
      <ThirdPersonPlayer
        start={[0, 0, 15]}
        respawn={[0, 0, 15]}
        bounds={[40, 52]}
        cameraDistance={3.8}
        portals={solved ? [{ id: "forest", position: [0, 0, -47] }] : []}
        onNearPortal={(id) => props.onNearPortal(Boolean(id))}
        onEnterPortal={props.onExit}
        onHangChange={props.onHangChange}
        onReady={props.onReady}
      />
    </>
  );
}
