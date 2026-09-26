import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { Physics } from "@react-three/rapier";
import { useLocation, useNavigate } from "react-router-dom";
import { GameCanvas } from "../components/GameCanvas";
import { ExperienceHud } from "../components/ExperienceHud";
import { WarpRoomWorld } from "../components/WarpRoomWorld";
import { useGame } from "../gameSettings";
import { useGameTimeout } from "../hooks/useGameTimeout";
import { useDocumentMetadata } from "../hooks/useDocumentMetadata";
import { useReducedMotion } from "../hooks/useReducedMotion";
import { playSound, setMood } from "../gameplay/sound";
import { isWarpLevelId, WARP_LEVEL_IDS, WARP_LEVELS } from "../gameplay/warpLevels";
import { bossUnlocked, readWarpProgress } from "../gameplay/warpProgress";
import { warpRoomSpawn } from "../gameplay/warpRoom";

interface ArrivalState {
  returnPortal?: string;
  cleared?: { level: string; crystal: boolean; gem: boolean };
  bossBeaten?: boolean;
}

function arrivalMessage(state: ArrivalState | null, bossOpen: boolean) {
  if (state?.bossBeaten) return "Tiny Tusk is beaten. The Warp Room is yours.";
  const cleared = state?.cleared;
  if (!cleared || !isWarpLevelId(cleared.level)) return "";
  const name = WARP_LEVELS[cleared.level].name;
  if (cleared.crystal && bossOpen)
    return `${name} cleared. All five crystals: the boss portal is open!`;
  if (cleared.crystal)
    return `${name} cleared. Crystal secured${cleared.gem ? ", and the gem!" : "."}`;
  return `${name} finished, but the crystal is still in there.`;
}

export default function WarpRoom() {
  const navigate = useNavigate();
  const location = useLocation();
  const arrival = location.state as ArrivalState | null;
  const [progress] = useState(() => readWarpProgress());
  const [spawn] = useState(() => warpRoomSpawn(arrival?.returnPortal));
  const { paused } = useGame();
  const { schedule, cancel } = useGameTimeout();
  const [nearPortal, setNearPortal] = useState<string | null>(null);
  const [portalImpact, setPortalImpact] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState(() => arrivalMessage(arrival, bossUnlocked(progress)));
  const transitionTimer = useRef<number | null>(null);
  const reducedMotion = useReducedMotion();
  const markReady = useCallback(() => setReady(true), []);
  const bossOpen = bossUnlocked(progress);
  useDocumentMetadata("The Warp Room | The painted forest");
  useEffect(() => setMood("still"), []);
  useEffect(() => {
    if (!message || !ready) return;
    if (arrival?.cleared?.crystal) playSound(bossOpen ? "solve" : "sigil");
    const id = schedule(() => setMessage(""), 5200);
    return () => cancel(id);
    // Only on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  const enterPortal = useCallback(
    (id: string) => {
      if (transitionTimer.current) return;
      setPortalImpact(id);
      const destination = id === "forest" ? "/" : id === "boss" ? "/warp/boss" : `/warp/${id}`;
      const state = id === "forest" ? { returnPortal: "island" } : { fromPortal: id };
      transitionTimer.current = schedule(
        () => {
          setLeaving(true);
          schedule(() => navigate(destination, { state }), 240);
        },
        reducedMotion ? 40 : 620,
      );
    },
    [navigate, reducedMotion, schedule],
  );

  const nearLevel = nearPortal && isWarpLevelId(nearPortal) ? WARP_LEVELS[nearPortal] : null;
  const prompt =
    nearPortal === "forest"
      ? "Jump through to return to the forest"
      : nearPortal === "boss"
        ? "Jump onto the pad to face Tiny Tusk"
        : nearLevel
          ? `Jump into ${nearLevel.name}`
          : undefined;

  return (
    <main className="experience">
      <GameCanvas shadows="percentage" camera={{ position: [0, 4, 14], fov: 55 }}>
        <Suspense fallback={null}>
          <Physics gravity={[0, -30, 0]} paused={paused}>
            <WarpRoomWorld
              progress={progress}
              spawn={spawn}
              nearPortal={nearPortal}
              portalImpact={portalImpact}
              onNearPortal={setNearPortal}
              onEnterPortal={enterPortal}
              onReady={markReady}
            />
          </Physics>
        </Suspense>
      </GameCanvas>
      <ExperienceHud
        chapter="Warp"
        title="The Warp Room"
        prompt={prompt}
        leaving={leaving}
        ready={ready}
      />
      {ready && !paused && (
        <section className="warp-hud" aria-label="Warp Room progress">
          <div className="warp-counters">
            <p aria-label={`${progress.crystals.length} of 5 crystals`}>
              <span className="warp-crystal-icon is-owned" aria-hidden="true" />
              {progress.crystals.length}/5
            </p>
            <p aria-label={`${progress.gems.length} of 5 gems`}>
              <span className="warp-gem-icon is-owned" aria-hidden="true" />
              {progress.gems.length}/5
            </p>
          </div>
          {nearLevel && (
            <div className="warp-level-card" role="status">
              <h2>
                <small>Level {nearLevel.index + 1}</small>
                {nearLevel.name}
              </h2>
              <p>{nearLevel.blurb}</p>
              <p className="warp-level-rewards">
                <span className={progress.crystals.includes(nearLevel.id) ? "is-done" : undefined}>
                  Crystal
                </span>
                <span className={progress.gems.includes(nearLevel.id) ? "is-done" : undefined}>
                  Gem
                </span>
              </p>
            </div>
          )}
          {nearPortal === null && !bossOpen && (
            <p className="warp-help">
              Find the power crystal in each level. With all five, the center pad opens.
              {` ${WARP_LEVEL_IDS.length - progress.crystals.length} to go.`}
            </p>
          )}
          <p className={`warp-message${message ? " is-visible" : ""}`} role="status">
            {message}
          </p>
        </section>
      )}
    </main>
  );
}
