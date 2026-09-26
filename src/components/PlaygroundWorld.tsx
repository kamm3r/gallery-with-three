import { Sky } from "@react-three/drei";
import { useRef } from "react";
import { parkZones, type Tuple3 } from "../gameplay/collisionCourse";
import { useControllerTuning, useZoneTeleport } from "../hooks/usePlaygroundTuning";
import { CollisionCourse } from "./CollisionCourse";
import { KinematicPlatform, PlatformSystem } from "./KinematicPlatform";
import { PortalFrameCollider } from "./PortalFrameCollider";
import { PortalPainting } from "./PortalPainting";
import { ThirdPersonPlayer } from "./ThirdPersonPlayer";

interface PlaygroundWorldProps {
  nearPortal: boolean;
  portalImpact: boolean;
  onNearPortal: (near: boolean) => void;
  onExit: () => void;
  onHangChange: (hanging: boolean) => void;
  onReady: () => void;
}

const PORTAL_Z = 30;
const START = parkZones[0].spawn;

export function PlaygroundWorld({
  nearPortal,
  portalImpact,
  onNearPortal,
  onExit,
  onHangChange,
  onReady,
}: PlaygroundWorldProps) {
  const tuning = useControllerTuning();
  const teleportRef = useRef<Tuple3 | null>(null);
  useZoneTeleport(teleportRef);
  return (
    <>
      <color attach="background" args={["#b9cad3"]} />
      <fog attach="fog" args={["#b9cad3", 95, 190]} />
      <Sky distance={450000} sunPosition={[5, 7, 3]} turbidity={5} rayleigh={2} />
      <hemisphereLight args={["#edf4f0", "#3a4650", 1.7]} />
      <directionalLight
        castShadow
        color="#fff0ce"
        intensity={2.3}
        position={[-24, 55, 30]}
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-left={-85}
        shadow-camera-right={85}
        shadow-camera-top={85}
        shadow-camera-bottom={-85}
        shadow-camera-near={0.5}
        shadow-camera-far={200}
        shadow-normalBias={0.025}
      />
      <CollisionCourse />
      <PlatformSystem />
      {/* Blue kinematic set: rotating disc, elevator, shuttles. */}
      <KinematicPlatform
        name="platform-disc"
        position={[-24, 0.7, -12]}
        shape="cylinder"
        radius={4}
        size={[8, 0.4, 8]}
        spin={0.5}
      />
      <KinematicPlatform
        position={[-15, 1.1, -12]}
        axis="y"
        distance={1.1}
        speed={0.8}
        size={[3, 0.4, 3]}
      />
      <KinematicPlatform
        position={[-24, 1.0, -19]}
        axis="x"
        distance={4}
        speed={0.6}
        phase={Math.PI / 2}
        size={[3, 0.4, 3]}
      />
      <KinematicPlatform
        position={[-15, 1.0, -19]}
        axis="z"
        distance={3}
        speed={0.7}
        size={[2.6, 0.4, 2.6]}
      />
      {/* Orange animated deck: kinematic pitch oscillation. */}
      <KinematicPlatform
        name="platform-tilt"
        position={[2, 1.3, -19]}
        tiltAmp={0.32}
        tiltSpeed={0.9}
        size={[4.2, 0.3, 2.2]}
        color="#e09543"
      />
      {/* Sweeper bar (jump it or get shoved), fast carousel, tall elevator,
          fast shuttle: platform-carry and kinematic-push stress. */}
      <KinematicPlatform
        name="platform-sweeper"
        position={[27, 0.45, -64]}
        spin={0.9}
        size={[9, 0.5, 0.5]}
        color="#d63c2f"
      />
      <KinematicPlatform
        name="platform-carousel"
        position={[36, 0.3, -62]}
        shape="cylinder"
        radius={3}
        size={[6, 0.3, 6]}
        spin={2.2}
      />
      <KinematicPlatform
        position={[36, 2.2, -71]}
        axis="y"
        distance={2}
        speed={0.6}
        size={[3, 0.4, 3]}
      />
      <KinematicPlatform
        position={[26, 0.8, -72]}
        axis="x"
        distance={4}
        speed={1.8}
        size={[2.6, 0.4, 2.6]}
      />
      <PortalPainting
        image="/assets/plaster.jpg"
        position={[0, 2.2, PORTAL_Z]}
        rotation={[0, Math.PI, 0]}
        active={nearPortal || portalImpact}
        impact={portalImpact}
      />
      <PortalFrameCollider position={[0, 2.2, PORTAL_Z]} rotation={[0, Math.PI, 0]} />
      <ThirdPersonPlayer
        start={START}
        portals={[{ id: "forest", position: [0, 0, PORTAL_Z] }]}
        bounds={[78, 78]}
        cameraDistance={4.8}
        onNearPortal={(id) => onNearPortal(Boolean(id))}
        onEnterPortal={onExit}
        onHangChange={onHangChange}
        onReady={onReady}
        tuning={tuning}
        teleportRef={teleportRef}
      />
    </>
  );
}
