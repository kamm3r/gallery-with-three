import { GameCanvas } from "../components/GameCanvas";
import { useGame } from "../gameSettings";
import { useGameTimeout } from "../hooks/useGameTimeout";
import { Physics } from "@react-three/rapier";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ExperienceHud } from "../components/ExperienceHud";
import { ForestWorld } from "../components/ForestWorld";
import { FOREST_ATMOSPHERE } from "../components/AtmosphereEffect";
import { useDocumentMetadata } from "../hooks/useDocumentMetadata";
import { useReducedMotion } from "../hooks/useReducedMotion";
import { HUB_PORTALS } from "../gameplay/hubPortals";
import { hubSpawn } from "../gameplay/hubSpawn";
import { setMood } from "../gameplay/sound";

export default function ForestHub() {
  const navigate = useNavigate();
  const location = useLocation();
  const [spawn] = useState(() => hubSpawn(location.state?.returnPortal));
  const { paused } = useGame();
  const { schedule, cancel } = useGameTimeout();
  const [nearPortal, setNearPortal] = useState<string | null>(null);
  const [portalImpact, setPortalImpact] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [ready, setReady] = useState(false);
  const [hanging, setHanging] = useState(false);
  const transitionTimer = useRef<number | null>(null);
  const routeTimer = useRef<number | null>(null);
  const reducedMotion = useReducedMotion();
  const markReady = useCallback(() => setReady(true), []);
  useDocumentMetadata("The painted forest", "Explore a forest and jump through its paintings.");
  useEffect(() => {
    setMood("meadow");
  }, []);

  const enterPortal = useCallback(
    (portalId: string) => {
      if (transitionTimer.current) return;
      setPortalImpact(portalId);
      transitionTimer.current = schedule(
        () => {
          setLeaving(true);
          const destination =
            HUB_PORTALS.find((portal) => portal.id === portalId)?.destination ?? "/gallery";
          routeTimer.current = schedule(
            () => navigate(destination, { state: { fromPortal: portalId } }),
            240,
          );
        },
        reducedMotion ? 40 : 620,
      );
    },
    [navigate, reducedMotion, schedule],
  );

  useEffect(() => {
    return () => {
      if (transitionTimer.current) cancel(transitionTimer.current);
      if (routeTimer.current) cancel(routeTimer.current);
    };
  }, [cancel]);

  return (
    <main className="experience">
      <GameCanvas
        shadows="percentage"
        camera={{ position: [0, 4, 12], fov: 52 }}
        atmosphere={FOREST_ATMOSPHERE}
      >
        <Suspense fallback={null}>
          <Physics gravity={[0, -30, 0]} paused={paused}>
            <ForestWorld
              spawn={spawn}
              nearPortal={nearPortal}
              portalImpact={portalImpact}
              onNearPortal={setNearPortal}
              onEnterPortal={enterPortal}
              onHangChange={setHanging}
              onReady={markReady}
            />
          </Physics>
        </Suspense>
      </GameCanvas>
      <ExperienceHud
        chapter="The clearing"
        title="The painted forest"
        prompt={
          hanging
            ? undefined
            : nearPortal
              ? `Jump into ${HUB_PORTALS.find((portal) => portal.id === nearPortal)?.label ?? "the painting"}`
              : undefined
        }
        leaving={leaving}
        ready={ready}
      />
    </main>
  );
}
