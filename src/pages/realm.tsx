import { capitalControllerTuning, capitalPlayerProfile } from "../gameplay/capitalMetrics.ts";
import type { LockTarget } from "../gameplay/lockOn.ts";
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
import { CombatTuningPanel } from "../components/CombatTuningPanel";
import { SacredCapital } from "../components/SacredCapital";
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
import { newParishProgress, type ParishPoint, type ParishProgress } from "../gameplay/ashenParish";
import {
  capitalAreas as parishAreas,
  CAPITAL_EXIT as PARISH_EXIT,
  CAPITAL_EXIT_YAW as PARISH_EXIT_YAW,
  capitalCaches as parishCaches,
  capitalShrines as parishShrines,
  capitalAreaAt as parishAreaAt,
  capitalWorld,
  capitalSurfaces,
  capitalBosses,
  capitalNpcs,
  capitalBeacon,
} from "../gameplay/capitalLayout";
import {
  capitalInteraction as parishInteraction,
  beginCapitalBoss,
  activateCapitalBeacon,
  newCapitalLiftStates,
  requestCapitalLift,
  type CapitalLiftsState,
} from "../gameplay/capitalProgress";
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
  // Low sunset shafts cross the walls and naves, as in the reference footage.
  shafts: 0.3,
  shaftDensity: 0.022,
  shaftDistance: 40,
  shaftSteps: 12,
};
const ParishWarden = memo(AshWarden);
const ParishEnemyViews = memo(ParishEnemies);
const ParishPlayer = memo(ThirdPersonPlayer);
const PARISH_BOUNDS: [number, number] = [115, 180];
// The way home opens in the colosseum once its keeper falls.
const PARISH_PORTALS = [{ id: "forest", position: PARISH_EXIT, yaw: PARISH_EXIT_YAW, scale: 1.2 }];
const NO_PORTALS: typeof PARISH_PORTALS = [];
/** Death: the words fade in, the screen fades out, and the run resumes at the last ember. */
const DEATH_SHOW_MS = 900;
const DEATH_RESPAWN_MS = 4600;
const ignoreBossReport = () => {};
const ignoreHangChange = () => {};

const PARISH_POST = {
  name: "Parish",
  exposure: 1.1,
  contrast: 0.34,
  lift: 0.01,
  saturation: 1.12,
  vibrance: 0.2,
  split: 0.08,
  shadowTint: "#284d82",
  highlightTint: "#ffe2c0",
  bloomIntensity: 0.32,
  aoIntensity: 1.1,
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
    activeBoss: state.activeBoss,
    dialogue: state.dialogue,
    bossMaxHealth: state.activeBoss
      ? capitalBosses[state.activeBoss].health
      : combatTuning.bossMaxHealth,
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
  lifts,
  resetVersion,
  report,
}: {
  state: MutableRefObject<ParishEncounter>;
  progress: MutableRefObject<ParishProgress>;
  teleport: MutableRefObject<ParishPoint | null>;
  healRequested: MutableRefObject<boolean>;
  lifts: MutableRefObject<CapitalLiftsState>;
  resetVersion: MutableRefObject<number>;
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
      lifts,
      resetVersion,
      controls: { heldControls, setPlayerControl, pressPlayerAttack },
    };
    host.__parish = diagnostics;
    return () => {
      if (host.__parish === diagnostics) delete host.__parish;
    };
  }, [state, progress, teleport, lifts, resetVersion]);
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
          if (interaction.kind === "shrine" && restAtParishShrine(s)) {
            p.checkpoint = interaction.id;
            playSound("bossHit", { intensity: 0.2 });
          } else if (interaction.kind === "cache") {
            const cache = parishCaches.find((cache) => cache.id === interaction.id)!;
            p.caches.push(cache.id);
            s.embers += cache.embers;
            s.flasks = Math.min(3, s.flasks + 1);
            playSound("bossHit", { intensity: 0.2 });
          } else if (interaction.kind === "boss") {
            teleport.current = beginCapitalBoss(s, interaction.id, p);
            resetVersion.current++;
          } else if (interaction.kind === "lift") {
            requestCapitalLift(interaction.id, c.playerY, p, lifts.current);
          } else if (interaction.kind === "switch") {
            activateCapitalBeacon(p);
            playSound("bossHit", { intensity: 0.5 });
          } else if (interaction.kind === "talk") {
            const npc = capitalNpcs.find((n) => n.id === interaction.id)!;
            s.dialogue = `${npc.name}: ${npc.dialogue}`;
            s.dialogueTime = 18;
          } else if (interaction.kind === "gate") {
            p[interaction.id] = true;
          }
          report(snapshotOf(s, p));
        }
      }
    }
    // The sealed lower city consumes a premature drop through its fog.
    if (!p.fogCleared && c.playerY < -1) c.health = 0;
    // Below the ground city there is only cloud.
    if (c.playerY < -40) c.health = 0;
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

function ParishMap({ snapshot, onClose }: { snapshot: ParishSnapshot; onClose: () => void }) {
  const layers = [
    { id: "lower-tiers", name: "Tiers 1–2" },
    { id: "middle-tiers", name: "Tiers 3–4" },
    { id: "upper-tiers", name: "Tiers 5–6" },
    { id: "citadel", name: "Citadel" },
    { id: "lower", name: "Plain" },
  ] as const;
  const layerAt = (y: number) =>
    y < -1
      ? "lower"
      : y < 12
        ? "lower-tiers"
        : y < 28
          ? "middle-tiers"
          : y < 44
            ? "upper-tiers"
            : "citadel";
  const [layer, setLayer] = useState<string>(() => layerAt(snapshot.playerY));
  const inLayer = (y: number) => layerAt(y) === layer;
  const mx = (x: number) => 120 + (x + 17) * 1.2;
  const mz = (z: number) => 140 + z * 1.2;
  return (
    <div className="parish-map">
      <button
        type="button"
        className="capital-map-close"
        aria-label="Close capital map"
        onClick={onClose}
      >
        ×
      </button>
      <h2>The Fading Sacred Capital</h2>
      <div className="capital-map-layers">
        {layers.map((l) => (
          <button
            key={l.id}
            type="button"
            aria-pressed={layer === l.id}
            disabled={l.id === "lower" && !snapshot.progress.fogCleared}
            onClick={() => setLayer(l.id)}
          >
            {l.name}
          </button>
        ))}
      </div>
      <svg
        viewBox="0 0 240 280"
        role="img"
        aria-label={`${layer} capital routes and current player position`}
      >
        <g stroke="#85919b" strokeWidth=".4">
          {capitalSurfaces
            .filter((s) =>
              inLayer(s.vertices.reduce((sum, p) => sum + p[1], 0) / s.vertices.length),
            )
            .map((s) => (
              <polygon
                key={s.id}
                points={s.vertices.map((p) => `${mx(p[0])},${mz(p[2])}`).join(" ")}
                fill={s.area === snapshot.area ? "#657d87" : "#3c4955"}
              />
            ))}
        </g>
        {parishAreas
          .filter((a) => inLayer(a.center[1]))
          .map((a) => (
            <g key={a.id}>
              <circle cx={mx(a.center[0])} cy={mz(a.center[2])} r="3" fill="#d8c296" />
              <text x={mx(a.center[0])} y={mz(a.center[2]) + 9} textAnchor="middle">
                {a.name
                  .replace("Church Outside Path", "Outside path")
                  .replace("Middle Level Town", "Mid Town")
                  .replace("Asylum Cathedral", "Cathedral")
                  .replace("Ultimate Plaza", "Plaza")
                  .replace("Oblivion Chapel", "Chapel")}
              </text>
            </g>
          ))}
        {parishCaches
          .filter((c) => !snapshot.progress.caches.includes(c.id) && inLayer(c.position[1]))
          .map((c) => (
            <g key={c.id}>
              <circle cx={mx(c.position[0])} cy={mz(c.position[2])} r="2" fill="#e8b46e" />
              <title>{c.name}</title>
            </g>
          ))}
        {inLayer(capitalBeacon.position[1]) && !snapshot.progress.fogCleared && (
          <g>
            <circle
              cx={mx(capitalBeacon.position[0])}
              cy={mz(capitalBeacon.position[2])}
              r="3"
              fill="#92dbed"
            />
            <text
              x={mx(capitalBeacon.position[0])}
              y={mz(capitalBeacon.position[2]) - 6}
              textAnchor="middle"
            >
              Crown beacon
            </text>
          </g>
        )}
        {inLayer(snapshot.playerY) && (
          <circle cx={mx(snapshot.playerX)} cy={mz(snapshot.playerZ)} r="3" fill="#f4f1dd" />
        )}
      </svg>
      <p>
        {snapshot.progress.fogCleared
          ? "The fog has lifted. Take the beacon pathway down to the plain and the colosseum gate."
          : snapshot.progress.cathedralFelled
            ? "Throw the switch behind the keeper's apse to lift the fog."
            : !snapshot.progress.caches.includes("town-key")
              ? "Climb the tiers through the prow gates. The third gate is barred; its key lies in a house on the second tier."
              : snapshot.progress.checkpoint === "refuge"
                ? "Climb the remaining tiers to the citadel and rest at the Oblivion Chapel."
                : "Take the outside path along the cathedral's east side to its galleries."}
        <br />
        Great gate: {snapshot.progress.refuge ? "open" : "barred"} · Cathedral return:{" "}
        {snapshot.progress.court ? "open" : "barred within"} · Beacon lift:{" "}
        {snapshot.progress.beaconLift ? "released" : "locked below"} · Arena lift:{" "}
        {snapshot.progress.arenaLift ? "released" : "locked below"}
      </p>
    </div>
  );
}

function RealmRun({ progress }: { progress: MutableRefObject<ParishProgress> }) {
  const { paused, freeCamera, settings } = useGame();
  const navigate = useNavigate();
  const { state: locationState } = useLocation();
  const state = useEcsRef("parish", () => createParishEncounter(progress.current, capitalWorld));
  const run = state.current;
  const combat = useEcsRef("combat", () => run.combat);
  const teleport = useEcsRef<ParishPoint | null>("teleport", () => null);
  const lifts = useEcsRef("capital-lifts", newCapitalLiftStates);
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
    Object.assign(lifts.current, newCapitalLiftStates());
    syncParishEntities(runtimeWorld, state.current);
    const spawn = parishShrines.find((s) => s.id === progress.current.checkpoint)!.spawn;
    teleport.current = [...spawn];
    healRequested.current = false;
    setControlsPaused(paused || freeCamera);
    setResultScreenActive(false);
    setResultOpen(false);
    setMapOpen(false);
    setNear(false);
    setSnapshot(snapshotOf(state.current, progress.current));
    document.querySelector<HTMLElement>(".game-viewport")?.focus();
  };
  const retryLater = useRef(retry);
  retryLater.current = retry;
  useEffect(() => {
    if (!over) return;
    const id = schedule(() => setResultOpen(true), died ? DEATH_SHOW_MS : 3400);
    // No choices on death: respawn at the last ember rested at.
    const respawn = died ? schedule(() => retryLater.current(), DEATH_RESPAWN_MS) : null;
    return () => {
      cancel(id);
      if (respawn !== null) cancel(respawn);
    };
  }, [over, died, schedule, cancel]);
  useEffect(() => {
    // Only the victory screen takes the pointer for its buttons.
    const choosing = resultOpen && !died;
    setResultScreenActive(choosing);
    if (choosing) retryButton.current?.focus();
    return () => setResultScreenActive(false);
  }, [resultOpen, died]);
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
    const openMap = () => {
      if (!resultOpen) setMapOpen(true);
    };
    window.addEventListener("capital-map-open", openMap);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("capital-map-open", openMap);
      window.removeEventListener("keydown", key);
    };
  }, [paused, resultOpen]);
  const markReady = useCallback(() => setReady(true), []);
  // Live enemies on the player's floor and the boss in its arena can be locked on to.
  const lockTargets = useCallback(() => {
    const run = state.current,
      c = run.combat;
    const targets: LockTarget[] = run.enemies
      .filter((e) => e.health > 0)
      .map((e) => ({ id: e.id, x: e.x, y: e.y, z: e.z, height: 1.5 }));
    if (c.bossActive && c.bossHealth > 0)
      targets.push({ id: "boss", x: c.bossX, y: c.bossY, z: c.bossZ, height: 2.6 });
    return targets;
  }, [state]);
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
      {import.meta.env.DEV && <CombatTuningPanel />}
      {snapshot.dialogue && (
        <aside className="capital-dialogue" role="status">
          {snapshot.dialogue}
        </aside>
      )}
      <GameCanvas
        pointLightBudget={4}
        postMultisampling={0}
        adaptiveResolution
        shadows="percentage"
        camera={{ position: [0, 4, 82], fov: 60 }}
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
              lifts={lifts}
              resetVersion={resetVersion}
              report={setSnapshot}
            />
            <SacredCapital
              state={state}
              progress={snapshot.progress}
              lifts={lifts}
              resetVersion={resetVersion.current}
              revision={[
                snapshot.felled,
                snapshot.progress.refuge,
                snapshot.progress.court,
                snapshot.progress.cathedralFelled,
                snapshot.progress.fogCleared,
                snapshot.progress.beaconLift,
                snapshot.progress.arenaLift,
                snapshot.progress.townLift,
                snapshot.progress.finalFelled,
                ...snapshot.progress.caches,
              ].join(":")}
            />
            <ParishEnemyViews state={state} />
            {snapshot.activeBoss && (
              <ParishWarden
                key={snapshot.activeBoss}
                appearance={snapshot.activeBoss === "cathedral" ? "asylum" : "ember"}
                combat={combat}
                simulate={false}
                report={ignoreBossReport}
                resetVersion={resetVersion.current}
              />
            )}
            {snapshot.progress.finalFelled && (
              <>
                <FogGate
                  position={[PARISH_EXIT[0], PARISH_EXIT[1] + 2.6, PARISH_EXIT[2]]}
                  rotation={[0, PARISH_EXIT_YAW, 0]}
                  scale={1.2}
                  active={near}
                />
                <PortalFrameCollider
                  position={[PARISH_EXIT[0], PARISH_EXIT[1] + 2.6, PARISH_EXIT[2]]}
                  rotation={[0, PARISH_EXIT_YAW, 0]}
                  scale={1.2}
                />
              </>
            )}
            <ParishPlayer
              tuning={capitalControllerTuning}
              movementProfile={capitalPlayerProfile}
              combat={combat}
              lockTargets={lockTargets}
              cameraStyle="combat"
              cameraDistance={7.5}
              start={shrine.spawn}
              startYaw={progress.current.checkpoint === "refuge" ? Math.PI + 2 : Math.PI}
              respawn={shrine.spawn}
              teleportRef={teleport}
              bounds={PARISH_BOUNDS}
              portals={snapshot.progress.finalFelled ? PARISH_PORTALS : NO_PORTALS}
              onNearPortal={markNearPortal}
              onEnterPortal={exit}
              onHangChange={ignoreHangChange}
              onReady={markReady}
            />
          </Physics>
        </Suspense>
      </GameCanvas>
      <ExperienceHud
        chapter="The Fading Sacred Capital"
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
                  className="parish-flask"
                  aria-label={`Use Ember flask, ${snapshot.flasks} of 3 remaining (R)`}
                  title="Ember flask (R)"
                  disabled={
                    snapshot.flasks === 0 ||
                    snapshot.health <= 0 ||
                    snapshot.health >= combatTuning.playerMaxHealth
                  }
                  onClick={() => {
                    healRequested.current = true;
                  }}
                >
                  <svg viewBox="0 0 40 52" fill="none" aria-hidden="true">
                    <path
                      d="M15 5h10v5H15zM16 10v10C8 24 6 30 8 39c2 8 22 8 24 0 2-9 0-15-8-19V10"
                      stroke="currentColor"
                      strokeWidth="2"
                    />
                    <path
                      d="M11 31c5-3 13 3 18 0l-1 8c-1 5-15 5-16 0z"
                      fill="currentColor"
                      opacity=".65"
                    />
                    <path d="M17 24c-4 3-5 6-4 9" stroke="currentColor" strokeLinecap="round" />
                  </svg>
                  <strong aria-hidden="true">{snapshot.flasks}</strong>
                  <kbd aria-hidden="true">R</kbd>
                </button>
              </div>
              <div className="parish-embers" aria-label={`${snapshot.embers} embers`}>
                <svg viewBox="0 0 20 24" aria-hidden="true" fill="none">
                  <path d="M10 2 15 10 10 21 5 10Z" stroke="currentColor" />
                  <path d="m10 7 2 5-2 5-2-5Z" fill="currentColor" />
                </svg>
                <span>{snapshot.embers}</span>
              </div>
              {mapOpen && <ParishMap snapshot={snapshot} onClose={() => setMapOpen(false)} />}
            </>
          )}
          {snapshot.bossActive && !snapshot.felled && !resultOpen && (
            <div className="warden-vitals">
              <h2>
                {snapshot.activeBoss ? capitalBosses[snapshot.activeBoss].name : "The Ash Warden"}
              </h2>
              <VitalBar
                label={`${snapshot.activeBoss ? capitalBosses[snapshot.activeBoss].name : "The Ash Warden"} health`}
                value={snapshot.bossHealth}
                max={snapshot.bossMaxHealth}
                boss
              />
            </div>
          )}
          {resultOpen && died && (
            <div className="death-screen" role="alert" aria-live="assertive">
              <h2>You died</h2>
            </div>
          )}
          {resultOpen && !died && (
            <div
              className="combat-result is-victory"
              role="dialog"
              aria-modal="true"
              aria-label="Encounter result"
            >
              <h2>Warden felled</h2>
              <p>The capital is free of its last keeper. A way home opens in the colosseum.</p>
              <div className="combat-result-actions">
                <button ref={retryButton} onClick={() => setResultOpen(false)}>
                  Explore the capital
                </button>
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
