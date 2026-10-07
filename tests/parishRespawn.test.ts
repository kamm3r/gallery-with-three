import test from "node:test";
import assert from "node:assert/strict";
import { createParishEncounter, resetParishEncounter } from "../src/gameplay/parishEncounter.ts";
import { newParishProgress, parishShrines, enemySpecs } from "../src/gameplay/ashenParish.ts";
import { createRuntimeWorld } from "../src/gameplay/ecs/world.ts";
import {
  BossCombat,
  ParishEnemyState,
  ParishMember,
  IsDead,
  EmberProjectile,
} from "../src/gameplay/ecs/gameplayTraits.ts";
import { syncParishEntities, destroyParishEntities } from "../src/gameplay/ecs/parishSystems.ts";

void test("retry resets ECS combat in place so mounted player and Warden views keep their binding", () => {
  const progress = newParishProgress();
  progress.checkpoint = "kiln";
  progress.court = true;
  progress.caches.push("garden");
  const state = createParishEncounter(progress),
    combat = state.combat;
  combat.health = 0;
  combat.attackTime = 1;
  combat.bossHealth = 0;
  combat.bossActive = true;
  state.enemies[0].health = 0;
  state.bolts.push({ id: 1, x: 0, y: 14, z: 0, vx: 1, vz: 1, life: 3 });
  state.flasks = 0;
  state.healTime = 1;
  state.embers = 200;
  const world = createRuntimeWorld();
  try {
    syncParishEntities(world, state);
    const boss = world.queryFirst(BossCombat)!;
    assert.equal(resetParishEncounter(state, progress), state);
    assert.equal(state.combat, combat, "retry must not detach the mounted combat ref or ECS boss");
    syncParishEntities(world, state);
    assert.equal(world.queryFirst(BossCombat), boss);
    assert.equal(boss.get(BossCombat)!.state, combat);
    assert.equal(combat.health, 100);
    assert.equal(combat.attackTime, 0);
    assert.equal(combat.bossActive, false);
    assert.deepEqual(
      [combat.playerX, combat.playerY, combat.playerZ],
      parishShrines.find((s) => s.id === "kiln")!.spawn,
    );
    assert.equal(state.flasks, 3);
    assert.equal(state.healTime, 0);
    assert.equal(state.embers, 0);
    assert.equal(world.query(IsDead).length, 0);
    assert.equal(world.query(EmberProjectile).length, 0);
    assert.equal(world.query(ParishEnemyState).length, state.enemies.length);
    assert.ok(state.enemies.every((e) => e.health === enemySpecs[e.kind].health));
    assert.equal(progress.court, true);
    assert.deepEqual(progress.caches, ["garden"]);
    destroyParishEntities(world, state);
    assert.equal(world.query(ParishMember).length, 0);
  } finally {
    world.destroy();
  }
});
