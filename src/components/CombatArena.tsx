import { useCallback, useEffect, useMemo, useRef, type MutableRefObject } from "react";
import { useFrame } from "@react-three/fiber";
import { newParishProgress, type ParishProgress } from "../gameplay/ashenParish";
import type { Encounter } from "../gameplay/bossEncounter";
import { arenaSpawn, arenaWorld, type ArenaRoster } from "../gameplay/combatArena";
import type { Tuple3 } from "../gameplay/collisionCourse";
import {
  destroyParishEntities,
  stepParishSystems,
  syncParishEntities,
} from "../gameplay/ecs/parishSystems";
import { runtimeWorld } from "../gameplay/ecs/world";
import type { LockTarget } from "../gameplay/lockOn";
import {
  createParishEncounter,
  resetParishEncounter,
  type ParishEncounter,
} from "../gameplay/parishEncounter";
import { playSound } from "../gameplay/sound";
import { ParishEnemies } from "./ParishEnemies";

export type ArenaStatus = {
  health: number;
  stamina: number;
  foes: number;
  total: number;
  playerHitId: number;
};

/** Seconds the death pose holds before the arena restocks and you stand again. */
const DEATH_RESPAWN = 3.2;

/**
 * The arena's encounter: the player's combat record (health, stamina, sword
 * and roll timing) and the foes in the ring. The record is shared with the
 * player everywhere in the proving grounds; only the ring holds enemies.
 */
export function useCombatArena(roster: ArenaRoster) {
  const progress = useRef(newParishProgress());
  const world = useMemo(() => arenaWorld(roster), [roster]);
  const state = useRef<ParishEncounter>(null!);
  if (!state.current) state.current = createParishEncounter(progress.current, world);
  // A new roster swaps the world before the enemy views remount and read it.
  if (state.current.world !== world) {
    state.current.world = world;
    resetArena(state.current, progress.current);
  }
  const combat = useRef<Encounter>(state.current.combat);
  const lockTargets = useCallback(
    (): LockTarget[] =>
      state.current.enemies
        .filter((e) => e.health > 0)
        .map((e) => ({ id: e.id, x: e.x, y: e.y, z: e.z, height: 1.5 })),
    [],
  );
  return { state, progress, combat, lockTargets };
}

function resetArena(state: ParishEncounter, progress: ParishProgress) {
  resetParishEncounter(state, progress);
  // The proving grounds catch falls with a respawn, not a death.
  state.combat.fatalFalls = false;
}

export function CombatArena({
  arena,
  roster,
  teleportRef,
  onStatus,
}: {
  arena: ReturnType<typeof useCombatArena>;
  roster: ArenaRoster;
  /** Any teleport restores the player; one to the arena also restocks it. */
  teleportRef: MutableRefObject<Tuple3 | null>;
  onStatus: (status: ArenaStatus) => void;
}) {
  const { state, progress } = arena;
  const runtime = useRef({ deadTime: 0, reportTime: 0, lastEnemyHit: 0, lastPlayerHit: 0 });
  useEffect(() => {
    const encounter = state.current;
    encounter.combat.fatalFalls = false;
    syncParishEntities(runtimeWorld, encounter);
    return () => destroyParishEntities(runtimeWorld, encounter);
  }, [state]);
  // Runs before the player, which consumes the teleport this frame.
  useFrame((_, delta) => {
    const s = state.current,
      c = s.combat,
      r = runtime.current;
    if (teleportRef.current) {
      resetArena(s, progress.current);
      r.deadTime = 0;
    } else if (c.health <= 0) {
      r.deadTime += delta;
      if (r.deadTime > DEATH_RESPAWN) teleportRef.current = arenaSpawn;
    }
    stepParishSystems(runtimeWorld, s, delta, progress.current);
    if (s.enemyHitId > r.lastEnemyHit) playSound("bossHit", { intensity: 0.6 });
    r.lastEnemyHit = s.enemyHitId;
    if (c.playerHitId > r.lastPlayerHit) playSound("hurt");
    r.lastPlayerHit = c.playerHitId;
    r.reportTime += delta;
    if (r.reportTime >= 0.1) {
      r.reportTime = 0;
      onStatus({
        health: c.health,
        stamina: c.stamina,
        foes: s.enemies.filter((e) => e.health > 0).length,
        total: s.enemies.length,
        playerHitId: c.playerHitId,
      });
    }
  }, -0.5);
  return <ParishEnemies key={roster} state={state} />;
}
