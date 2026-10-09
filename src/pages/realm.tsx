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
const PARISH_PORTALS = [{ id: "forest", position: PARISH_EXIT, yaw: Math.PI, scale: 1.2 }];
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
    bossMaxHealth: state.activeBoss === "cathedral" ? 260 : combatTuning.bossMaxHealth,
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
  const layers = [
    { id: "town", name: "Town & wall" },
    { id: "plaza", name: "Plaza" },
    { id: "gallery", name: "Galleries" },
    { id: "roof", name: "Roofs" },
    { id: "lower", name: "Below" },
  ] as const;
  const layerAt = (y: number) =>
    y < 0 ? "lower" : y < 22 ? "town" : y < 34 ? "plaza" : y < 43 ? "gallery" : "roof";
  const [layer, setLayer] = useState<string>(() => layerAt(snapshot.playerY));
  const inLayer = (y: number) => layerAt(y) === layer;
  const mx = (x: number) => 120 + x;
  const mz = (z: number) => 180 + z;
  return (
    <div className="parish-map">
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
                  .replace("Cathedral Exterior", "Exterior")
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
            <text x={mx(0)} y={mz(-77) - 6} textAnchor="middle">
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
          ? "The fog has lifted. The lower city is open."
          : snapshot.progress.cathedralFelled
            ? "Climb the cathedral rafters and light the crown beacon."
            : !snapshot.progress.caches.includes("town-key")
              ? "Cross the wall bridges into town. Search beneath its streets for the mountain passage key."
              : snapshot.progress.checkpoint === "refuge"
                ? "Climb the mountain passage to the plaza. Rest at the Oblivion Chapel to shorten your return."
                : "Follow the western cathedral exterior to the galleries. The eastern nave stair returns to the barred front door."}
        <br />
        Town return: {snapshot.progress.refuge ? "open" : "barred"} · Cathedral return:{" "}
        {snapshot.progress.court ? "open" : "barred within"} · Beacon lift:{" "}
        {snapshot.progress.beaconLift ? "released" : "locked below"} · Arena lift:{" "}
        {snapshot.progress.arenaLift ? "released" : "locked below"}
      </p>
    </div>
  );
}

function RealmRun({ progress }: { progress: MutableRefObject<ParishProgress> }) {
  const { paused, settings } = useGame();
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
              startYaw={progress.current.checkpoint === "refuge" ? Math.PI + 2 : Math.PI}
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
                  Capital map <kbd>M</kbd>
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
                {snapshot.activeBoss ? capitalBosses[snapshot.activeBoss].name : "The Ash Warden"}
                <small>
                  {snapshot.enraged
                    ? "The bell tolls for the living"
                    : snapshot.activeBoss === "cathedral"
                      ? "Guardian of the hidden city"
                      : "Keeper of the capital flame"}
                </small>
              </h2>
              <VitalBar
                label={`${snapshot.activeBoss ? capitalBosses[snapshot.activeBoss].name : "The Ash Warden"} health`}
                value={snapshot.bossHealth}
                max={snapshot.bossMaxHealth}
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
                  : "The capital is free of its last keeper. Its roads remain open."}
              </p>
              <div className="combat-result-actions">
                {died ? (
                  <button ref={retryButton} onClick={retry}>
                    Return to the ember
                  </button>
                ) : (
                  <button ref={retryButton} onClick={() => setResultOpen(false)}>
                    Explore the capital
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
