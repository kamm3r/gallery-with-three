import test from "node:test";
import assert from "node:assert/strict";
import { createRuntimeWorld } from "../src/gameplay/ecs/world.ts";
import { GameplayState, createStateBinding } from "../src/gameplay/ecs/stateBinding.ts";
import {
  IsDead,
  ParishEnemyState,
  EmberProjectile,
  ParishMember,
} from "../src/gameplay/ecs/gameplayTraits.ts";
import {
  destroyParishEntities,
  stepParishSystems,
  syncParishEntities,
} from "../src/gameplay/ecs/parishSystems.ts";
import {
  createParishEncounter,
  stepParishEncounter,
  restAtParishShrine,
} from "../src/gameplay/parishEncounter.ts";
import { newParishProgress } from "../src/gameplay/ashenParish.ts";

void test("state adapters read entity-owned values and clean up across Strict Mode remounts", () => {
  const world = createRuntimeWorld();
  try {
    const binding = createStateBinding(world, "player-roll", () => ({ elapsed: 0 }));
    assert.equal(world.query(GameplayState).length, 0, "rendering must not spawn entities");
    const dispose = binding.mount();
    world.query(GameplayState).updateEach(([data]) => {
      (data.value as { elapsed: number }).elapsed = 1;
    });
    assert.equal(binding.current.elapsed, 1);
    let changes = 0;
    const unsubscribe = binding.subscribe(() => changes++);
    binding.current = { elapsed: 2 };
    assert.equal(changes, 1, "reactive views must hear about ECS transitions");
    unsubscribe();
    assert.deepEqual(world.queryFirst(GameplayState)!.get(GameplayState)!.value, { elapsed: 2 });
    dispose();
    assert.equal(world.query(GameplayState).length, 0);
    const again = binding.mount();
    assert.equal(binding.current.elapsed, 2);
    again();
    assert.equal(world.query(GameplayState).length, 0);
  } finally {
    world.destroy();
  }
});

void test("destroyed gameplay entities cannot silently leave stale ref state", () => {
  const world = createRuntimeWorld();
  try {
    const binding = createStateBinding(world, "combat", () => ({ health: 100 }));
    const dispose = binding.mount();
    world.queryFirst(GameplayState)!.destroy();
    assert.throws(() => binding.current, /Missing ECS state/);
    dispose();
  } finally {
    world.destroy();
  }
});

void test("query-driven parish simulation preserves the existing combat behavior", () => {
  const world = createRuntimeWorld();
  try {
    const progress = newParishProgress();
    const expected = createParishEncounter(progress),
      actual = createParishEncounter(progress);
    for (const state of [expected, actual]) {
      state.combat.playerX = 0;
      state.combat.playerZ = 75;
      state.combat.health = 10000;
    }
    for (let frame = 0; frame < 600; frame++) {
      if (frame % 80 === 0) {
        for (const state of [expected, actual]) {
          state.combat.attackId++;
          state.combat.attackTime = 0.5;
          state.combat.playerYaw = Math.PI;
        }
      }
      stepParishEncounter(expected, 1 / 60, progress);
      stepParishSystems(world, actual, 1 / 60, progress);
      assert.deepEqual(actual, expected, `simulation diverged at frame ${frame}`);
    }
    assert.equal(world.query(ParishEnemyState).length, actual.enemies.length);
    world.query(ParishEnemyState).readEach(([data]) => {
      assert.ok(actual.enemies.includes(data.state), "views must use the same entity-owned record");
    });
    destroyParishEntities(world, actual);
    assert.equal(world.query(ParishMember).length, 0);
  } finally {
    world.destroy();
  }
});

void test("projectiles and corpses are reconciled on death, shrine respawn and teardown", () => {
  const world = createRuntimeWorld();
  try {
    const progress = newParishProgress(),
      state = createParishEncounter(progress);
    state.enemies[0].health = 0;
    state.enemies[0].phase = "dead";
    state.bolts.push({ id: 1, x: 0, y: 1, z: 0, vx: 0, vz: 0, life: 0.01 });
    stepParishSystems(world, state, 1 / 60, progress);
    assert.equal(world.query(IsDead, ParishEnemyState).length, 1);
    assert.equal(world.query(EmberProjectile).length, 0);
    assert.equal(restAtParishShrine(state), true);
    syncParishEntities(world, state);
    assert.equal(world.query(IsDead, ParishEnemyState).length, 0);
    assert.equal(world.query(ParishEnemyState).length, state.enemies.length);
    state.combat.bossHealth = 0;
    stepParishSystems(world, state, 1 / 60, progress);
    assert.equal(world.query(IsDead, ParishEnemyState).length, state.enemies.length);
    destroyParishEntities(world, state);
    assert.equal(world.query(ParishMember).length, 0);
  } finally {
    world.destroy();
  }
});
