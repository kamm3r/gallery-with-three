import { stepEncounter } from "../bossEncounter.ts";
import { createQuery, type World } from "koota";
import {
  stepParishEncounter,
  stepParishEnemy,
  stepEmberBolt,
  type ParishEncounter,
} from "../parishEncounter.ts";
import type { ParishProgress } from "../ashenParish.ts";
import {
  Combatant,
  BossCombat,
  IsBoss,
  EmberProjectile,
  IsDead,
  IsEnemy,
  IsProjectile,
  ParishEnemyState,
  ParishMember,
} from "./gameplayTraits.ts";

const bosses = createQuery(BossCombat, ParishMember);
const enemies = createQuery(ParishEnemyState, ParishMember);
const projectiles = createQuery(EmberProjectile, ParishMember);

/** Reconcile respawns/new bolts without keeping entity handles in React refs. */
export function syncParishEntities(world: World, state: ParishEncounter) {
  let bossRegistered = false;
  world.query(bosses).readEach(([data, member], entity) => {
    if (member.owner !== state) return;
    if (data.state !== state.combat) entity.destroy();
    else bossRegistered = true;
  });
  if (!bossRegistered)
    world.spawn(
      IsBoss,
      Combatant,
      ParishMember({ owner: state, index: -1 }),
      BossCombat({ state: state.combat }),
    );
  const registered = new Set<object>();
  world.query(enemies).readEach(([data, member], entity) => {
    if (member.owner !== state) return;
    if (state.enemies[member.index] !== data.state) entity.destroy();
    else {
      registered.add(data.state);
      if (data.state.health <= 0) entity.add(IsDead);
      else entity.remove(IsDead);
    }
  });
  state.enemies.forEach((enemy, index) => {
    if (!registered.has(enemy)) {
      const entity = world.spawn(
        IsEnemy,
        Combatant,
        ParishMember({ owner: state, index }),
        ParishEnemyState({ state: enemy }),
      );
      if (enemy.health <= 0) entity.add(IsDead);
    }
  });
  registered.clear();
  world.query(projectiles).readEach(([data, member], entity) => {
    if (member.owner !== state) return;
    if (!state.bolts.includes(data.state)) entity.destroy();
    else registered.add(data.state);
  });
  for (const bolt of state.bolts)
    if (!registered.has(bolt))
      world.spawn(
        IsProjectile,
        ParishMember({ owner: state, index: bolt.id }),
        EmberProjectile({ state: bolt }),
      );
}

export function destroyParishEntities(world: World, state: ParishEncounter) {
  world.query(ParishMember).readEach(([member], entity) => {
    if (member.owner === state) entity.destroy();
  });
}

/** The frame coordinator; each system operates on entity-owned records. */
export function stepParishSystems(
  world: World,
  state: ParishEncounter,
  delta: number,
  progress: ParishProgress,
) {
  syncParishEntities(world, state);
  stepParishEncounter(
    state,
    delta,
    progress,
    (encounter, dt, route) => {
      world.query(enemies).updateEach(([data, member], entity) => {
        if (member.owner !== encounter) return;
        stepParishEnemy(encounter, data.state, dt, route);
        if (data.state.health <= 0) entity.add(IsDead);
        else entity.remove(IsDead);
      });
    },
    (encounter, dt, route) => {
      syncParishEntities(world, encounter);
      world.query(projectiles).updateEach(([data, member], entity) => {
        if (member.owner !== encounter) return;
        if (!stepEmberBolt(encounter, data.state, dt, route)) entity.destroy();
      });
      const active: ParishEncounter["bolts"] = [];
      world.query(projectiles).readEach(([data, member]) => {
        if (member.owner === encounter) active.push(data.state);
      });
      encounter.bolts = active;
    },
    (_, dt) => {
      world.query(bosses).updateEach(([data, member]) => {
        if (member.owner === state) stepEncounter(data.state, dt);
      });
    },
  );
  syncParishEntities(world, state);
}
