import { useEcsRef } from "../hooks/useEcsRef";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { Physics } from "@react-three/rapier";
import { Navigate, useNavigate } from "react-router-dom";
import { GameCanvas } from "../components/GameCanvas";
import { ExperienceHud } from "../components/ExperienceHud";
import { TinyTusk, TuskArena } from "../components/TinyTusk";
import { ThirdPersonPlayer } from "../components/ThirdPersonPlayer";
import { AkuMask } from "../components/warpProps";
import { useGame } from "../gameSettings";
import { useGameTimeout } from "../hooks/useGameTimeout";
import { useDocumentMetadata } from "../hooks/useDocumentMetadata";
import { setResultScreenActive } from "../gameplay/resultScreen";
import { setMood } from "../gameplay/sound";
import { createPlatformerLink } from "../gameplay/platformerLink";
import { BOSS, createBoss, type BossEvent } from "../gameplay/warpBoss";
import { bossUnlocked, readWarpProgress, recordBoss } from "../gameplay/warpProgress";

const TAUNTS: Partial<Record<BossEvent["type"], string>> = {
  dazed: "He's dazed! Jump on his head!",
  maskLost: "The mask took the hit",
};

function BossRun({ retry }: { retry: () => void }) {
  const navigate = useNavigate();
  const { paused } = useGame();
  const { schedule, cancel } = useGameTimeout();
  const fight = useEcsRef("tusk-combat", createBoss);
  const link = useEcsRef("platformer-player", createPlatformerLink);
  const [ready, setReady] = useState(false);
  const [health, setHealth] = useState(BOSS.maxHealth);
  const [masks, setMasks] = useState(BOSS.startMasks);
  const [outcome, setOutcome] = useState<"won" | "lost" | null>(null);
  const [resultOpen, setResultOpen] = useState(false);
  const [message, setMessage] = useState("Tiny Tusk wants his crystals back!");
  const messageTimer = useRef(0);
  const firstButton = useRef<HTMLButtonElement>(null);
  const markReady = useCallback(() => setReady(true), []);
  useDocumentMetadata("Tiny Tusk | The Warp Room");
  useEffect(() => setMood("ash"), []);
  useEffect(() => {
    setResultScreenActive(resultOpen);
    if (resultOpen) firstButton.current?.focus();
    return () => setResultScreenActive(false);
  }, [resultOpen]);
  useEffect(() => {
    messageTimer.current = schedule(() => setMessage(""), 3000);
  }, [schedule]);

  const onEvents = useCallback(
    (events: BossEvent[]) => {
      const f = fight.current;
      setHealth(f.health);
      setMasks(f.masks);
      for (const event of events) {
        const text = TAUNTS[event.type];
        if (text) {
          cancel(messageTimer.current);
          setMessage(text);
          messageTimer.current = schedule(() => setMessage(""), 2000);
        }
        if (event.type === "defeated") {
          recordBoss();
          setOutcome("won");
          schedule(() => setResultOpen(true), 2800);
        }
        if (event.type === "dead") {
          setOutcome("lost");
          schedule(() => setResultOpen(true), 1400);
        }
      }
    },
    [schedule, cancel],
  );
  const toWarpRoom = () => navigate("/warp", { state: { bossBeaten: outcome === "won" } });

  return (
    <main className="experience">
      <GameCanvas shadows="percentage" camera={{ position: [0, 5, 16], fov: 55 }}>
        <Suspense fallback={null}>
          <Physics gravity={[0, -30, 0]} paused={paused}>
            <TuskArena />
            <TinyTusk fight={fight} link={link} onEvents={onEvents} />
            <AkuMask follow={link} masks={() => fight.current.masks} />
            <ThirdPersonPlayer
              start={[0, 0, 8]}
              platformer={link}
              portals={[]}
              boundary={BOSS.arenaRadius}
              cameraDistance={8}
              onNearPortal={() => {}}
              onEnterPortal={() => {}}
              onHangChange={() => {}}
              onReady={markReady}
            />
          </Physics>
        </Suspense>
      </GameCanvas>
      <ExperienceHud chapter="Boss" title="Tiny Tusk" ready={ready} leaving={false} />
      {ready && !paused && (
        <section className="warp-hud" aria-label="Boss fight">
          <div className="warp-counters">
            {masks > 0 && (
              <span className="warp-mask-icon" role="img" aria-label={`${masks} mask`} />
            )}
          </div>
          {!resultOpen && (
            <div
              className="warp-boss-health"
              role="meter"
              aria-label="Tiny Tusk health"
              aria-valuemin={0}
              aria-valuemax={BOSS.maxHealth}
              aria-valuenow={health}
            >
              <h2>Tiny Tusk</h2>
              <p>
                {Array.from({ length: BOSS.maxHealth }, (_, i) => (
                  <span key={i} className={i < health ? "is-full" : undefined} />
                ))}
              </p>
            </div>
          )}
          <p className={`warp-message${message ? " is-visible" : ""}`} role="status">
            {message}
          </p>
          <p className="warp-help">
            Watch his shadow and get clear. Hop the shockwave. Stomp his head while he's dazed.
          </p>
          {resultOpen && outcome && (
            <div
              className={`combat-result ${outcome === "won" ? "is-victory" : "is-death"}`}
              role="dialog"
              aria-label="Boss result"
            >
              <h2>{outcome === "won" ? "Tiny Tusk is down!" : "Flattened"}</h2>
              <div className="combat-result-actions">
                {outcome === "lost" && (
                  <button ref={firstButton} onClick={retry}>
                    Try again
                  </button>
                )}
                <button ref={outcome === "won" ? firstButton : undefined} onClick={toWarpRoom}>
                  Back to the Warp Room
                </button>
              </div>
            </div>
          )}
        </section>
      )}
    </main>
  );
}

export default function WarpBossPage() {
  const [attempt, setAttempt] = useState(0);
  if (!bossUnlocked(readWarpProgress())) return <Navigate to="/warp" replace />;
  return <BossRun key={attempt} retry={() => setAttempt((n) => n + 1)} />;
}
