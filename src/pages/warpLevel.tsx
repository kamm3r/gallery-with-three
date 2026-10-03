import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { Physics } from "@react-three/rapier";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { GameCanvas } from "../components/GameCanvas";
import { ExperienceHud } from "../components/ExperienceHud";
import { WarpLevelWorld } from "../components/WarpLevelWorld";
import { useGame } from "../gameSettings";
import { useGameTimeout } from "../hooks/useGameTimeout";
import { useDocumentMetadata } from "../hooks/useDocumentMetadata";
import { setResultScreenActive } from "../gameplay/resultScreen";
import { setMood } from "../gameplay/sound";
import { isWarpLevelId, WARP_LEVELS, type WarpLevel } from "../gameplay/warpLevels";
import { createRun, type RunEvent } from "../gameplay/warpRun";
import { recordLevel } from "../gameplay/warpProgress";

interface WarpHud {
  fruit: number;
  crates: number;
  crateTotal: number;
  masks: number;
  crystal: boolean;
  gem: boolean;
  deaths: number;
}

const MOODS = {
  jungle: "meadow",
  snow: "still",
  sewer: "museum",
  canyon: "meadow",
  ruins: "grove",
} as const;

const MESSAGES: Partial<Record<RunEvent["type"], string>> = {
  checkpoint: "Checkpoint!",
  crystal: "Power crystal!",
  gem: "Every crate smashed. Gem!",
  mask: "Aku Aku mask!",
  maskLost: "The mask took the hit",
};

function LevelRun({ level }: { level: WarpLevel }) {
  const navigate = useNavigate();
  const { paused } = useGame();
  const { schedule, cancel } = useGameTimeout();
  const run = useRef(createRun(level));
  const [ready, setReady] = useState(false);
  const [near, setNear] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [finished, setFinished] = useState(false);
  const [message, setMessage] = useState("");
  const [hud, setHud] = useState<WarpHud>(() => ({
    fruit: 0,
    crates: 0,
    crateTotal: run.current.crateTotal,
    masks: 0,
    crystal: false,
    gem: false,
    deaths: 0,
  }));
  const messageTimer = useRef(0);
  const continueButton = useRef<HTMLButtonElement>(null);
  useDocumentMetadata(`${level.name} | The Warp Room`);
  useEffect(() => setMood(MOODS[level.theme.deco]), [level]);
  useEffect(() => {
    setResultScreenActive(finished);
    if (finished) continueButton.current?.focus();
    return () => setResultScreenActive(false);
  }, [finished]);
  const markReady = useCallback(() => setReady(true), []);

  const onEvents = useCallback(
    (events: RunEvent[]) => {
      const r = run.current;
      setHud({
        fruit: r.fruit,
        crates: r.cratesBroken,
        crateTotal: r.crateTotal,
        masks: r.masks,
        crystal: r.crystal,
        gem: r.gem,
        deaths: r.deaths,
      });
      const said = events.map((event) => MESSAGES[event.type]).find(Boolean);
      const boulder = events.find((event) => event.type === "boulder");
      const text =
        said ?? (boulder?.type === "boulder" && boulder.state === "rolling" ? "RUN!" : undefined);
      if (text) {
        cancel(messageTimer.current);
        setMessage(text);
        messageTimer.current = schedule(() => setMessage(""), 1800);
      }
    },
    [schedule, cancel],
  );

  const backToWarpRoom = useCallback(
    (cleared: boolean) => {
      setLeaving(true);
      schedule(
        () =>
          navigate("/warp", {
            state: {
              returnPortal: level.id,
              cleared: cleared
                ? { level: level.id, crystal: run.current.crystal, gem: run.current.gem }
                : undefined,
            },
          }),
        260,
      );
    },
    [level.id, navigate, schedule],
  );

  const finish = useCallback(() => {
    recordLevel(level.id, { crystal: run.current.crystal, gem: run.current.gem });
    setFinished(true);
  }, [level.id]);

  return (
    <main className="experience">
      <GameCanvas shadows="percentage" camera={{ position: [0, 4, level.spawn[2] + 7], fov: 55 }}>
        <Suspense fallback={null}>
          <Physics gravity={[0, -30, 0]} paused={paused}>
            <WarpLevelWorld
              level={level}
              run={run}
              nearExit={near}
              onNearExit={setNear}
              onExit={finish}
              onEvents={onEvents}
              onReady={markReady}
            />
          </Physics>
        </Suspense>
      </GameCanvas>
      <ExperienceHud
        chapter="The Warp Room"
        title={level.name}
        ready={ready}
        leaving={leaving}
        prompt={near && !finished ? "Jump through to finish the level" : undefined}
      />
      {ready && !paused && (
        <section className="warp-hud" aria-label="Level status">
          <div className="warp-counters">
            <p className="warp-fruit" aria-label={`${hud.fruit} fruit`}>
              <span className="warp-fruit-icon" aria-hidden="true" />
              {hud.fruit}
            </p>
            <p className="warp-crates" aria-label={`${hud.crates} of ${hud.crateTotal} crates`}>
              <span className="warp-crate-icon" aria-hidden="true" />
              {hud.crates}/{hud.crateTotal}
            </p>
            <p className="warp-slots">
              <span
                className={`warp-crystal-icon${hud.crystal ? " is-owned" : ""}`}
                role="img"
                aria-label={hud.crystal ? "Crystal found" : "Crystal not found yet"}
              />
              <span
                className={`warp-gem-icon${hud.gem ? " is-owned" : ""}`}
                role="img"
                aria-label={hud.gem ? "Gem earned" : "Gem not earned yet"}
              />
              {hud.masks > 0 && (
                <span className="warp-mask-icon" role="img" aria-label={`${hud.masks} masks`}>
                  {hud.masks > 1 ? "×2" : ""}
                </span>
              )}
            </p>
          </div>
          <p className={`warp-message${message ? " is-visible" : ""}`} role="status">
            {message}
          </p>
          <p className="warp-help">
            <kbd>Click</kbd>/<kbd>J</kbd>/<kbd>E</kbd> spin · jump on crates and critters
          </p>
          {finished && (
            <div
              className="combat-result is-victory warp-result"
              role="dialog"
              aria-label="Level complete"
            >
              <h2>{level.name} complete</h2>
              <ul className="warp-tally">
                <li className={hud.crystal ? "is-done" : "is-missing"}>
                  {hud.crystal ? "Power crystal collected" : "Power crystal missed"}
                </li>
                <li className={hud.gem ? "is-done" : "is-missing"}>
                  Crates {hud.crates}/{hud.crateTotal}
                  {hud.gem ? " · gem earned" : ""}
                </li>
                <li>{hud.fruit} fruit</li>
              </ul>
              <div className="combat-result-actions">
                <button ref={continueButton} onClick={() => backToWarpRoom(true)}>
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

export default function WarpLevelPage() {
  const { levelId } = useParams();
  if (!isWarpLevelId(levelId)) return <Navigate to="/warp" replace />;
  return <LevelRun key={levelId} level={WARP_LEVELS[levelId]} />;
}
