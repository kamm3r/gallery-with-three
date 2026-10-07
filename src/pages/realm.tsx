import { GameplayState } from "../gameplay/ecs/stateBinding";
import { ParishEnemyState, EmberProjectile, IsDead } from "../gameplay/ecs/gameplayTraits";
import { runtimeWorld } from "../gameplay/ecs/world";
import {
  syncParishEntities,
  destroyParishEntities,
  stepParishSystems,
} from "../gameplay/ecs/parishSystems";
import { useEcsRef } from "../hooks/useEcsRef";
import {
  memo,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
  type MutableRefObject,
} from "react";
import { Physics } from "@react-three/rapier";
import { useFrame } from "@react-three/fiber";
import { useLocation, useNavigate } from "react-router-dom";
import { GameCanvas } from "../components/GameCanvas";
import { ThirdPersonPlayer } from "../components/ThirdPersonPlayer";
import { PortalFrameCollider } from "../components/PortalFrameCollider";
import { ExperienceHud } from "../components/ExperienceHud";
import { ASH_ATMOSPHERE, FogGate } from "../components/AshArena";
import { AshWarden } from "../components/AshWarden";
import { AshenParish } from "../components/AshenParish";
import { ParishEnemies } from "../components/ParishEnemies";
import { combatTuning } from "../gameplay/combatTuning";
import { keyLabel } from "../gameplay/controlBindings";
import { useGame } from "../gameSettings";
import { useGameTimeout } from "../hooks/useGameTimeout";
import {
  heldControls,
  pressPlayerAttack,
  setPlayerControl,
  setControlsPaused,
} from "../hooks/usePlayerControls";
import {
  newParishProgress,
  parishAreas,
  PARISH_EXIT,
  PARISH_ARENA_Y,
  parishCaches,
  parishTiles,
  parishRoutes,
  parishAreaAt,
  parishInteraction,
  parishShrines,
  type ParishPoint,
  type ParishProgress,
} from "../gameplay/ashenParish";
import {
  createParishEncounter,
  resetParishEncounter,
  drinkEmber,
  parishThreatened,
  restAtParishShrine,
  type ParishEncounter,
} from "../gameplay/parishEncounter";
import { setResultScreenActive } from "../gameplay/resultScreen";
import { setMood, playSound } from "../gameplay/sound";

const PARISH_ATMOSPHERE = {
  ...ASH_ATMOSPHERE,
  density: 0.0008,
  fogStart: 80,
  skyFog: 0.08,
  shafts: 0,
};
const ParishWarden = memo(AshWarden);
const ParishEnemyViews = memo(ParishEnemies);
const ParishPlayer = memo(ThirdPersonPlayer);
const PARISH_BOUNDS: [number, number] = [112, 170];
const PARISH_PORTALS = [{ id: "forest", position: PARISH_EXIT, yaw: Math.PI, scale: 1.2 }];
const ignoreBossReport = () => {};
const ignoreHangChange = () => {};

const PARISH_POST = {
  name: "Parish",
  exposure: 1.02,
  contrast: 0.42,
  lift: 0.01,
  saturation: 1.0,
  vibrance: 0.12,
  split: 0.08,
  shadowTint: "#405966",
  highlightTint: "#ffd7a3",
  bloomIntensity: 0.23,
  aoIntensity: 1.65,
  aoColor: "#27332f",
  grain: 0.015,
  vignetteDarkness: 0.3,
};

function snapshotOf(state: ParishEncounter, progress: ParishProgress) {
  const combat = state.combat;
  const interaction = parishInteraction(
    combat.playerX,
    combat.playerY,
    combat.playerZ,
    progress,
    parishThreatened(state),
    combat.bossActive,
  );
  return {
    ...combat,
    progress: { ...progress },
    flasks: state.flasks,
    embers: state.embers,
    felled: state.bossFelled,
    area: parishAreaAt(combat.playerX, combat.playerZ, combat.playerY),
    prompt: interaction?.kind === "boss" && state.bossFelled ? undefined : interaction?.prompt,
  };
}
type ParishSnapshot = ReturnType<typeof snapshotOf>;

function ParishRuntime({
  state,
  progress,
  teleport,
  healRequested,
  report,
}: {
  state: MutableRefObject<ParishEncounter>;
  progress: MutableRefObject<ParishProgress>;
  teleport: MutableRefObject<ParishPoint | null>;
  healRequested: MutableRefObject<boolean>;
  report: (snapshot: ParishSnapshot) => void;
}) {
  const runtime = useEcsRef("parish-runtime", () => ({
    interactionPress: heldControls().interactPress,
    reportTime: 0,
    lastEnemyHit: 0,
    lastPlayerHit: 0,
  }));
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const host = window as typeof window & { __parish?: unknown };
    const diagnostics = {
      ecs: {
        world: runtimeWorld,
        traits: { GameplayState, ParishEnemyState, EmberProjectile, IsDead },
      },
      state,
      progress,
      teleport,
      controls: { heldControls, setPlayerControl, pressPlayerAttack },
    };
    host.__parish = diagnostics;
    return () => {
      if (host.__parish === diagnostics) delete host.__parish;
    };
  }, [state, progress, teleport]);
  useEffect(() => {
    const encounter = state.current;
    syncParishEntities(runtimeWorld, encounter);
    return () => destroyParishEntities(runtimeWorld, encounter);
  }, [state]);
  useFrame((_, delta) => {
    const s = state.current,
      c = s.combat,
      p = progress.current,
      r = runtime.current;
    if (healRequested.current) {
      drinkEmber(s);
      healRequested.current = false;
    }
    const press = heldControls().interactPress;
    if (press !== r.interactionPress) {
      r.interactionPress = press;
      if (c.health > 0 && c.attackTime === 0 && c.hurtTime === 0 && !c.invulnerable) {
        const interaction = parishInteraction(
          c.playerX,
          c.playerY,
          c.playerZ,
          p,
          parishThreatened(s),
          c.bossActive,
        );
        if (interaction?.available) {
          if (interaction.kind === "shortcut") {
            p[interaction.id] = true;
            playSound("bossImpact", { intensity: 0.2 });
          } else if (interaction.kind === "shrine" && restAtParishShrine(s)) {
            p.checkpoint = interaction.id;
            playSound("bossHit", { intensity: 0.2 });
          } else if (interaction.kind === "cache") {
            const cache = parishCaches.find((cache) => cache.id === interaction.id)!;
            p.caches.push(cache.id);
            s.embers += cache.embers;
            s.flasks = Math.min(3, s.flasks + 1);
            playSound("bossHit", { intensity: 0.2 });
          } else if (interaction.kind === "boss" && !s.bossFelled) {
            c.bossActive = true;
            teleport.current = [0, PARISH_ARENA_Y, 18];
          }
          report(snapshotOf(s, p));
        }
      }
    }
    stepParishSystems(runtimeWorld, s, delta, p);
    if (s.enemyHitId > r.lastEnemyHit) playSound("bossHit", { intensity: 0.6 });
    r.lastEnemyHit = s.enemyHitId;
    if (!c.bossActive && c.playerHitId > r.lastPlayerHit) playSound("hurt");
    r.lastPlayerHit = c.playerHitId;
    r.reportTime += delta;
    if (r.reportTime >= 0.1) {
      r.reportTime = 0;
      report(snapshotOf(s, p));
    }
  }, -0.5);
  return null;
}

function ParishMap({ snapshot }: { snapshot: ParishSnapshot }) {
  const mx = (x: number) => 92 + x * 0.86;
  const mz = (z: number) => 18 + (152 - z) * 1.06;
  return (
    <div className="parish-map">
      <h2>Ashen Parish</h2>
      <svg
        viewBox="0 0 192 202"
        role="img"
        aria-label="Parish routes: refuge, court, garden, cloister, foundry, aqueduct, belfry, crypt, kiln and Warden arena. Two barred shortcuts open from the far side."
      >
        <g fill="#403f36" stroke="#6d6b5c" strokeWidth=".5">
          {parishTiles.map((tile) => (
            <rect
              key={`${tile.x}:${tile.y}:${tile.z}`}
              x={mx(tile.x - 4)}
              y={mz(tile.z + 4)}
              width={8 * 0.86}
              height={8 * 1.06}
              fill={tile.y > 0 ? "#5b5747" : "#403f36"}
            />
          ))}
        </g>
        <g fill="none" stroke="#817b68" strokeWidth="3" strokeLinejoin="round">
          {parishRoutes.map((route) => (
            <path
              key={route.id}
              d={route.points
                .map(([x, , z], index) => `${index ? "L" : "M"} ${mx(x)} ${mz(z)}`)
                .join(" ")}
              stroke={
                route.id === "bell" || route.id === "foundry"
                  ? "#b6a479"
                  : route.id === "funeral"
                    ? "#7e9dab"
                    : "#817b68"
              }
            />
          ))}
          <path
            d={`M ${mx(-40)} ${mz(128)} H ${mx(-16)}`}
            stroke={snapshot.progress.refuge ? "#dfbc75" : "#86594d"}
            strokeDasharray={snapshot.progress.refuge ? undefined : "3 4"}
          />
          <path
            d={`M ${mx(16)} ${mz(32)} H ${mx(32)}`}
            stroke={snapshot.progress.court ? "#dfbc75" : "#86594d"}
            strokeDasharray={snapshot.progress.court ? undefined : "3 4"}
          />
        </g>
        {parishAreas.map((area) => (
          <g key={area.id}>
            <circle
              cx={mx(area.center[0])}
              cy={mz(area.center[2])}
              r={area.id === snapshot.area ? 6 : 4}
              fill={area.id === snapshot.area ? "#e6c689" : "#403f36"}
              stroke="#bbb29b"
            />
            <text x={mx(area.center[0])} y={mz(area.center[2]) + 15} textAnchor="middle">
              {
                {
                  refuge: "Refuge",
                  yard: "Court",
                  crypt: "Crypt",
                  aqueduct: "Aqueduct",
                  belfry: "Belfry",
                  kiln: "Kiln",
                  arena: "Warden",
                  graveyard: "Garden",
                  cloister: "Cloister",
                  foundry: "Foundry",
                }[area.id]
              }
            </text>
          </g>
        ))}
        <circle cx={mx(snapshot.playerX)} cy={mz(snapshot.playerZ)} r="2.7" fill="#f4f1dd" />
      </svg>
      <p>
        Gold: opened shortcut · tan: upper walk
        <br />
        Blue: funeral descent · dashed: barred gate
      </p>
    </div>
  );
}

function RealmRun({ progress }: { progress: MutableRefObject<ParishProgress> }) {
  const { paused, settings } = useGame();
  const navigate = useNavigate();
  const { state: locationState } = useLocation();
  const state = useEcsRef("parish", () => createParishEncounter(progress.current));
  const run = state.current;
  const combat = useEcsRef("combat", () => run.combat);
  const teleport = useEcsRef<ParishPoint | null>("teleport", () => null);
  const healRequested = useEcsRef("heal-request", () => false);
  const resetVersion = useEcsRef("parish-reset", () => 0);
  const [snapshot, setSnapshot] = useState(() => snapshotOf(run, progress.current));
  const [ready, setReady] = useState(false);
  const [near, setNear] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const [resultOpen, setResultOpen] = useState(false);
  const retryButton = useRef<HTMLButtonElement>(null);
  const died = snapshot.health <= 0;
  const over = died || snapshot.felled;
  const { schedule, cancel } = useGameTimeout();
  const retry = () => {
    resetParishEncounter(state.current, progress.current);
    resetVersion.current++;
    syncParishEntities(runtimeWorld, state.current);
    const spawn = parishShrines.find((s) => s.id === progress.current.checkpoint)!.spawn;
    teleport.current = [...spawn];
    healRequested.current = false;
    setControlsPaused(paused);
    setResultScreenActive(false);
    setResultOpen(false);
    setMapOpen(false);
    setNear(false);
    setSnapshot(snapshotOf(state.current, progress.current));
    document.querySelector<HTMLElement>(".game-viewport")?.focus();
  };
  useEffect(() => {
    if (!over) return;
    const id = schedule(() => setResultOpen(true), died ? 1600 : 3400);
    return () => cancel(id);
  }, [over, died, schedule, cancel]);
  useEffect(() => {
    setResultScreenActive(resultOpen);
    if (resultOpen) retryButton.current?.focus();
    return () => setResultScreenActive(false);
  }, [resultOpen]);
  useEffect(() => {
    setMood("ash");
  }, []);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (
        paused ||
        resultOpen ||
        event.repeat ||
        (event.target instanceof HTMLElement &&
          event.target.closest('input, select, textarea, button, [contenteditable="true"]'))
      )
        return;
      if (event.code === "KeyR") {
        event.preventDefault();
        healRequested.current = true;
      }
      if (event.code === "KeyM") {
        event.preventDefault();
        setMapOpen((open) => !open);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [paused, resultOpen]);
  const markReady = useCallback(() => setReady(true), []);
  const markNearPortal = useCallback((id: string | null) => setNear(Boolean(id)), []);
  const exit = useCallback(
    () => navigate("/", { state: { returnPortal: locationState?.fromPortal } }),
    [navigate, locationState],
  );
  const shrine = parishShrines.find((s) => s.id === progress.current.checkpoint)!;
  const area = parishAreas.find((a) => a.id === snapshot.area)!;
  const prompt = resultOpen
    ? undefined
    : near
      ? "Jump through the fog to return to the forest"
      : snapshot.prompt?.replace(/^E ·/, `${keyLabel(settings.bindings.interact)} ·`);
  return (
    <main className="experience parish-experience">
      <GameCanvas
        pointLightBudget={4}
        postMultisampling={0}
        adaptiveResolution
        shadows="percentage"
        camera={{ position: [0, 4, 148], fov: 60 }}
        atmosphere={PARISH_ATMOSPHERE}
        postProfile={PARISH_POST}
        prepareScene={ready}
      >
        <Suspense fallback={null}>
          <Physics gravity={[0, -30, 0]} paused={paused}>
            <ParishRuntime
              state={state}
              progress={progress}
              teleport={teleport}
              healRequested={healRequested}
              report={setSnapshot}
            />
            <AshenParish
              state={state}
              progress={snapshot.progress}
              bossFelled={snapshot.felled}
              revision={[
                snapshot.felled,
                snapshot.progress.refuge,
                snapshot.progress.court,
                ...snapshot.progress.caches,
              ].join(":")}
            />
            <ParishEnemyViews state={state} />
            <ParishWarden
              combat={combat}
              simulate={false}
              report={ignoreBossReport}
              resetVersion={resetVersion.current}
            />
            <FogGate
              position={[PARISH_EXIT[0], PARISH_EXIT[1] + 2.6, PARISH_EXIT[2]]}
              rotation={[0, Math.PI, 0]}
              scale={1.2}
              active={near}
            />
            <PortalFrameCollider
              position={[PARISH_EXIT[0], PARISH_EXIT[1] + 2.6, PARISH_EXIT[2]]}
              rotation={[0, Math.PI, 0]}
              scale={1.2}
            />
            <ParishPlayer
              combat={combat}
              cameraStyle="combat"
              cameraDistance={7.5}
              start={shrine.spawn}
              startYaw={Math.PI}
              respawn={shrine.spawn}
              teleportRef={teleport}
              bounds={PARISH_BOUNDS}
              portals={PARISH_PORTALS}
              onNearPortal={markNearPortal}
              onEnterPortal={exit}
              onHangChange={ignoreHangChange}
              onReady={markReady}
            />
          </Physics>
        </Suspense>
      </GameCanvas>
      <ExperienceHud
        chapter="Ashen Parish"
        title={area.name}
        ready={ready}
        leaving={false}
        prompt={prompt}
      />
      {ready && !paused && (
        <section
          className={`combat-hud parish-hud${snapshot.enraged ? " is-enraged" : ""}`}
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
            <>
              <button
                type="button"
                className="parish-touch-sword"
                onPointerDown={(event) => {
                  event.preventDefault();
                  pressPlayerAttack();
                }}
              >
                Sword
              </button>
              <div className="parish-supplies">
                <button
                  type="button"
                  disabled={
                    snapshot.flasks === 0 ||
                    snapshot.health <= 0 ||
                    snapshot.health >= combatTuning.playerMaxHealth
                  }
                  onClick={() => {
                    healRequested.current = true;
                  }}
                >
                  Ember flask <strong>{snapshot.flasks} / 3</strong>
                  <kbd>R</kbd>
                </button>
                <span>{snapshot.embers} embers</span>
                <button
                  type="button"
                  aria-expanded={mapOpen}
                  onClick={() => setMapOpen((open) => !open)}
                >
                  Parish map <kbd>M</kbd>
                </button>
              </div>
              <p className="parish-controls">
                {keyLabel(settings.bindings.jump)} · Jump &nbsp;{" "}
                {keyLabel(settings.bindings.attack)} / Click · Sword &nbsp;{" "}
                {keyLabel(settings.bindings.dodge)} · Dodge &nbsp;{" "}
                {keyLabel(settings.sprintKey ?? settings.bindings.dodge)} ·{" "}
                {settings.sprintKey ? "Sprint" : "Hold to sprint"} &nbsp;{" "}
                {keyLabel(settings.bindings.interact)} · Use
              </p>
              {mapOpen && <ParishMap snapshot={snapshot} />}
            </>
          )}
          {snapshot.bossActive && !snapshot.felled && !resultOpen && (
            <div className="warden-vitals">
              <h2>
                The Ash Warden
                <small>
                  {snapshot.enraged
                    ? "The bell tolls for the living"
                    : "Keeper of the parish flame"}
                </small>
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
              aria-modal="true"
              aria-label="Encounter result"
            >
              <h2>{died ? "You died" : "Warden felled"}</h2>
              <p>
                {died
                  ? `Return to ${shrine.name}. Your opened shortcuts remain.`
                  : "The parish flame is yours. Its roads remain open."}
              </p>
              <div className="combat-result-actions">
                {died ? (
                  <button ref={retryButton} onClick={retry}>
                    Return to the ember
                  </button>
                ) : (
                  <button ref={retryButton} onClick={() => setResultOpen(false)}>
                    Explore the parish
                  </button>
                )}
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
  const progress = useEcsRef("parish-progress", newParishProgress);
  return <RealmRun progress={progress} />;
}
