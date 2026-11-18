import { GameCanvas } from "../components/GameCanvas";
import { useGame } from "../hooks/useGame";
import { useGameTimeout } from "../hooks/useGameTimeout";
import { Physics } from "@react-three/rapier";
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "../hooks/useRoute";
import { ExperienceHud } from "../components/ExperienceHud";
import { PlaygroundWorld } from "../components/PlaygroundWorld";
import { useDocumentMetadata } from "../hooks/useDocumentMetadata";
import { useReducedMotion } from "../hooks/useReducedMotion";
import { setMood } from "../gameplay/sound";
import { parkZones, type Tuple3 } from "../gameplay/collisionCourse";
import { ZoneMap } from "../components/ZoneMap";
import type { ArenaStatus } from "../components/CombatArena";
import { VitalBar } from "../components/VitalBar";
import { arenaZoneIndex, ARENA_ROSTERS, type ArenaRoster } from "../gameplay/combatArena";
import { combatTuning } from "../gameplay/combatTuning";

const PlaygroundInspector = import.meta.env.DEV
  ? lazy(() => import("../dev/PlaygroundInspector"))
  : null;

export default function PlaygroundLevel() {
  const { search } = useLocation();
  if (PlaygroundInspector && new URLSearchParams(search).has("inspector")) {
    return <PlaygroundInspector />;
  }
  return <PlayablePlayground />;
}

function PlayablePlayground() {
  const navigate = useNavigate();
  const { state } = useLocation();
  const { paused } = useGame();
  const { schedule, cancel } = useGameTimeout();
  const [nearPortal, setNearPortal] = useState(false);
  const [portalImpact, setPortalImpact] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [ready, setReady] = useState(false);
  const [hanging, setHanging] = useState(false);
  const [zone, setZone] = useState(0);
  const [mapOpen, setMapOpen] = useState(false);
  const [arenaRoster, setArenaRoster] = useState<ArenaRoster>("mixed");
  const [arenaStatus, setArenaStatus] = useState<ArenaStatus | null>(null);
  const teleportRef = useRef<Tuple3 | null>(null);
  const teleportTo = useCallback((index: number) => {
    teleportRef.current = parkZones[index].spawn;
    setZone(index);
  }, []);
  const fightRoster = useCallback(
    (roster: ArenaRoster) => {
      setArenaRoster(roster);
      teleportTo(arenaZoneIndex);
    },
    [teleportTo],
  );
  const transitionTimer = useRef<number | null>(null);
  const routeTimer = useRef<number | null>(null);
  const reducedMotion = useReducedMotion();
  const markReady = useCallback(() => setReady(true), []);
  useDocumentMetadata("The proving grounds | The painted forest");
  useEffect(() => {
    setMood("meadow");
  }, []);

  const returnToForest = useCallback(() => {
    if (transitionTimer.current) return;
    setPortalImpact(true);
    transitionTimer.current = schedule(
      () => {
        setLeaving(true);
        routeTimer.current = schedule(
          () => navigate("/", { state: { returnPortal: state?.fromPortal } }),
          240,
        );
      },
      reducedMotion ? 40 : 620,
    );
  }, [navigate, reducedMotion, schedule, state]);

  useEffect(() => {
    return () => {
      if (transitionTimer.current) cancel(transitionTimer.current);
      if (routeTimer.current) cancel(routeTimer.current);
    };
  }, [cancel]);

  return (
    <main className="experience playground-experience">
      <GameCanvas
        tuningInitiallyOpen
        shadows="percentage"
        camera={{ position: [0, 3.9, 12], fov: 52 }}
      >
        <Suspense fallback={null}>
          <Physics gravity={[0, -30, 0]} paused={paused}>
            <PlaygroundWorld
              nearPortal={nearPortal}
              portalImpact={portalImpact}
              onNearPortal={setNearPortal}
              onExit={returnToForest}
              onHangChange={setHanging}
              onReady={markReady}
              teleportRef={teleportRef}
              onZoneChange={setZone}
              arenaRoster={arenaRoster}
              onArenaStatus={setArenaStatus}
            />
          </Physics>
        </Suspense>
      </GameCanvas>
      <ExperienceHud
        chapter="Movement study"
        title="The proving grounds"
        prompt={hanging ? undefined : nearPortal ? "Jump through to return" : undefined}
        leaving={leaving}
        ready={ready}
      />
      {ready && !leaving && (
        <ZoneMap
          current={zone}
          open={mapOpen}
          onOpenChange={setMapOpen}
          onTeleport={teleportTo}
          roster={arenaRoster}
          onFight={fightRoster}
        />
      )}
      {ready && !leaving && !paused && arenaStatus && zone === arenaZoneIndex && (
        <section className="combat-hud arena-hud" aria-label="Combat status">
          {arenaStatus.playerHitId > 0 && (
            <div key={arenaStatus.playerHitId} className="hurt-flash" aria-hidden="true" />
          )}
          <div className="player-vitals">
            <div>
              <VitalBar
                label="Health"
                value={arenaStatus.health}
                max={combatTuning.playerMaxHealth}
              />
              <VitalBar label="Stamina" value={arenaStatus.stamina} max={100} stamina />
            </div>
          </div>
          <p className="arena-foes">
            {ARENA_ROSTERS.find((r) => r.id === arenaRoster)?.name} · {arenaStatus.foes}/
            {arenaStatus.total} standing · <kbd>R</kbd> restock · <kbd>M</kbd> pick foes
          </p>
        </section>
      )}
    </main>
  );
}
