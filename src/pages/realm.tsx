import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { Physics } from "@react-three/rapier";
import { useLocation, useNavigate } from "react-router-dom";
import { GameCanvas } from "../components/GameCanvas";
import { ThirdPersonPlayer } from "../components/ThirdPersonPlayer";
import { PortalFrameCollider } from "../components/PortalFrameCollider";
import { ExperienceHud } from "../components/ExperienceHud";
import { AshArena, ASH_ATMOSPHERE, FogGate } from "../components/AshArena";
import { AshWarden } from "../components/AshWarden";
import { combatTuning } from "../gameplay/combatTuning";
import { useGame } from "../gameSettings";
import { useGameTimeout } from "../hooks/useGameTimeout";
import { createEncounter } from "../gameplay/bossEncounter";
import { setResultScreenActive } from "../gameplay/resultScreen";
import { setMood } from "../gameplay/sound";

function RealmRun({ retry }: { retry: () => void }) {
  const { paused } = useGame();
  const navigate = useNavigate();
  const { state } = useLocation();
  const combat = useRef(createEncounter());
  const [snapshot, setSnapshot] = useState(createEncounter);
  const [ready, setReady] = useState(false);
  const [near, setNear] = useState(false);
  const died = snapshot.health <= 0;
  const over = died || snapshot.bossHealth <= 0;
  const [resultOpen, setResultOpen] = useState(false);
  const { schedule, cancel } = useGameTimeout();
  useEffect(() => {
    if (!over) return;
    // Let the fall (or the Warden's collapse) play before the banner.
    const id = schedule(() => setResultOpen(true), died ? 1600 : 3400);
    return () => cancel(id);
  }, [over, died, schedule, cancel]);
  const retryButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    setResultScreenActive(resultOpen);
    if (resultOpen) retryButton.current?.focus();
    return () => setResultScreenActive(false);
  }, [resultOpen]);
  const markReady = useCallback(() => setReady(true), []);
  useEffect(() => {
    setMood("ash");
  }, []);
  const exit = useCallback(
    () => navigate("/", { state: { returnPortal: state?.fromPortal } }),
    [navigate, state],
  );
  return (
    <main className="experience">
      <GameCanvas
        shadows="percentage"
        camera={{ position: [0, 4, 14], fov: 52 }}
        atmosphere={ASH_ATMOSPHERE}
      >
        <Suspense fallback={null}>
          <Physics gravity={[0, -30, 0]} paused={paused}>
            <AshArena combat={combat} />
            <AshWarden combat={combat} report={setSnapshot} />
            <FogGate position={[0, 2.6, 14]} rotation={[0, Math.PI, 0]} scale={1.2} active={near} />
            <PortalFrameCollider position={[0, 2.6, 14]} rotation={[0, Math.PI, 0]} scale={1.2} />
            <ThirdPersonPlayer
              combat={combat}
              start={[0, 0, 5]}
              boundary={21}
              portals={[{ id: "forest", position: [0, 0, 14], yaw: Math.PI, scale: 1.2 }]}
              onNearPortal={(id) => setNear(Boolean(id))}
              onEnterPortal={exit}
              onHangChange={() => {}}
              onReady={markReady}
            />
          </Physics>
        </Suspense>
      </GameCanvas>
      <ExperienceHud
        chapter="Trial of ash"
        title="The Ash Warden"
        ready={ready}
        leaving={false}
        prompt={near ? "Jump through the fog to return to the forest" : undefined}
      />
      {ready && !paused && (
        <section
          className={`combat-hud${snapshot.enraged ? " is-enraged" : ""}`}
          aria-label="Combat status"
        >
          {snapshot.playerHitId > 0 && (
            <div key={snapshot.playerHitId} className="hurt-flash" aria-hidden="true" />
          )}
          <div className="player-vitals">
            <span className="vital-crest" aria-hidden="true">
              ✧
            </span>
            <div>
              <VitalBar label="Health" value={snapshot.health} max={combatTuning.playerMaxHealth} />
              <VitalBar label="Stamina" value={snapshot.stamina} max={100} stamina />
            </div>
          </div>
          {!resultOpen && (
            <div className="warden-vitals">
              <h2>
                The Ash Warden
                {snapshot.enraged && <small>Kindled in wrath</small>}
              </h2>
              <VitalBar
                label="The Ash Warden health"
                value={snapshot.bossHealth}
                max={combatTuning.bossMaxHealth}
                boss
              />
            </div>
          )}
          {resultOpen && (
            <div
              className={`combat-result ${died ? "is-death" : "is-victory"}`}
              role="dialog"
              aria-label="Encounter result"
            >
              <h2>{died ? "You died" : "Warden felled"}</h2>
              <div className="combat-result-actions">
                <button ref={retryButton} onClick={retry}>
                  Retry encounter
                </button>
                <button onClick={exit}>Return to the forest</button>
              </div>
            </div>
          )}
        </section>
      )}
    </main>
  );
}

function VitalBar({
  label,
  value,
  max,
  stamina = false,
  boss = false,
}: {
  label: string;
  value: number;
  max: number;
  stamina?: boolean;
  boss?: boolean;
}) {
  const bounded = Math.max(0, Math.min(max, value));
  // Soulslike damage trail: a pale chunk lingers, then drains after the hit.
  const [lagging, setLagging] = useState(bounded);
  useEffect(() => {
    const timer = window.setTimeout(() => setLagging(bounded), 650);
    return () => window.clearTimeout(timer);
  }, [bounded]);
  const trail = Math.max(lagging, bounded);
  return (
    <div
      className={`vital-bar${stamina ? " is-stamina" : ""}${boss ? " is-boss" : ""}`}
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={Math.round(bounded)}
    >
      {!stamina && <span className="vital-trail" style={{ transform: `scaleX(${trail / max})` }} />}
      <span className="vital-fill" style={{ transform: `scaleX(${bounded / max})` }} />
    </div>
  );
}

export default function RealmLevel() {
  const [attempt, setAttempt] = useState(0);
  return <RealmRun key={attempt} retry={() => setAttempt((n) => n + 1)} />;
}
