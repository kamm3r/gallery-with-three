import type { MutableRefObject } from "react";
import { parkZones, type Tuple3 } from "../gameplay/collisionCourse";
import { useControllerTuning, useZoneTeleport } from "../hooks/usePlaygroundTuning";
import { SavedSceneProvider } from "./SceneObject";
import { PlaygroundScene } from "./PlaygroundScene";
import { PortalFrameCollider } from "./PortalFrameCollider";
import { PortalPainting } from "./PortalPainting";
import { ThirdPersonPlayer } from "./ThirdPersonPlayer";
import { CombatArena, useCombatArena, type ArenaStatus } from "./CombatArena";
import type { ArenaRoster } from "../gameplay/combatArena";
import { lazy } from "react";

const PlaygroundProbe = import.meta.env.DEV
  ? lazy(() => import("../dev/PlaygroundProbe").then((m) => ({ default: m.PlaygroundProbe })))
  : null;

interface PlaygroundWorldProps {
  nearPortal: boolean;
  portalImpact: boolean;
  onNearPortal: (near: boolean) => void;
  onExit: () => void;
  onHangChange: (hanging: boolean) => void;
  onReady: () => void;
  /** Written by the zone map, `[` / `]` and `R`; consumed by the player. */
  teleportRef: MutableRefObject<Tuple3 | null>;
  onZoneChange: (index: number) => void;
  /** Foes standing in the combat arena. */
  arenaRoster: ArenaRoster;
  onArenaStatus: (status: ArenaStatus) => void;
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
  teleportRef,
  onZoneChange,
  arenaRoster,
  onArenaStatus,
}: PlaygroundWorldProps) {
  const tuning = useControllerTuning();
  const arena = useCombatArena(arenaRoster);
  useZoneTeleport(teleportRef, onZoneChange);
  return (
    <>
      <SavedSceneProvider>
        <PlaygroundScene batchStatic />
      </SavedSceneProvider>
      {PlaygroundProbe && <PlaygroundProbe teleportRef={teleportRef} />}
      <CombatArena
        arena={arena}
        roster={arenaRoster}
        teleportRef={teleportRef}
        onStatus={onArenaStatus}
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
        combat={arena.combat}
        lockTargets={arena.lockTargets}
      />
    </>
  );
}
