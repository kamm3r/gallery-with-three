import assert from "node:assert/strict";
import test from "node:test";
import {
  newParishProgress,
  parishEnemySpawns,
  parishFloorHeight,
  parishInteraction,
  parishTiles,
  parishTilesConnected,
  parishTileHeight,
  parishWalls,
  enemySpecs,
  parishAreas,
  parishBackdropSpawns,
  arenaBackdropSpawns,
  parishAreaAt,
  parishProps,
  parishCaches,
  parishBlocked,
  parishShrines,
  PARISH_ARENA_Y,
} from "../src/gameplay/ashenParish.ts";
import {
  createParishEncounter,
  drinkEmber,
  parishLineClear,
  restAtParishShrine,
  stepParishEncounter,
} from "../src/gameplay/parishEncounter.ts";
import { parishEnemyPose } from "../src/gameplay/parishAnimation.ts";
import { swordAttackDuration } from "../src/gameplay/characterAnimations.ts";

void test("every parish region is reachable with both shortcuts still barred", () => {
  const lockedTiles = new Set(["-24,128", "24,32"]);
  const visited = new Set<string>();
  const queue = [parishTiles.find((t) => t.x === 0 && t.z === 136)!];
  while (queue.length) {
    const tile = queue.shift()!;
    const key = `${tile.x},${tile.y},${tile.z}`;
    if (visited.has(key) || lockedTiles.has(`${tile.x},${tile.z}`)) continue;
    visited.add(key);
    for (const other of parishTiles) {
      if (parishTilesConnected(tile, other)) queue.push(other);
    }
  }
  assert.equal(
    new Set(parishTiles.filter((t) => visited.has(`${t.x},${t.y},${t.z}`)).map((t) => t.area)).size,
    parishAreas.length,
  );
  assert.ok(visited.has("0,12,16"), "long route must reach the boss approach");
});

void test("all neighbouring floor slabs and ramps meet at the same height", () => {
  for (const tile of parishTiles) {
    assert.ok(
      parishTiles.some((other) => parishTilesConnected(tile, other)),
      `isolated floor ${tile.x},${tile.y},${tile.z}`,
    );
    for (const other of parishTiles) {
      if (!parishTilesConnected(tile, other)) continue;
      const x = (tile.x + other.x) / 2,
        z = (tile.z + other.z) / 2;
      assert.equal(parishTileHeight(tile, x, z), parishTileHeight(other, x, z));
    }
  }
  for (const wall of parishWalls) {
    const inside = parishFloorHeight(wall.x, wall.z);
    assert.notEqual(inside, null);
  }
  for (const spawn of parishEnemySpawns)
    assert.equal(
      parishFloorHeight(spawn.position[0], spawn.position[2], spawn.position[1]),
      spawn.position[1],
    );
});

void test("shortcuts only open from the far side and block combat through their bars", () => {
  const progress = newParishProgress();
  assert.equal(parishInteraction(-18, 0, 128, progress, false, false)?.available, false);
  assert.equal(parishInteraction(-22, -0.75, 128, progress, false, false)?.available, true);
  assert.equal(parishLineClear(-22, 128, -18, 128, progress, 0), false);
  progress.refuge = true;
  assert.equal(parishLineClear(-22, 128, -18, 128, progress, 0), true);
  assert.equal(parishInteraction(18, 12, 32, progress, false, false)?.available, false);
  assert.equal(parishInteraction(22, 12.5, 32, progress, false, false)?.available, true);
});

void test("arriving at the refuge cannot wake the Warden or damage the player", () => {
  const progress = newParishProgress();
  const state = createParishEncounter(progress);
  for (let i = 0; i < 600; i++) stepParishEncounter(state, 1 / 60, progress);
  assert.equal(state.combat.health, 100);
  assert.equal(state.combat.bossZ, -7);
  assert.equal(state.combat.phase, "approach");
  assert.equal(state.bolts.length, 0);
});

void test("an enemy's windup is safe, the strike lands once, and rolls avoid it", () => {
  for (const invulnerable of [false, true]) {
    const progress = newParishProgress(),
      state = createParishEncounter(progress);
    const e = state.enemies[1],
      c = state.combat;
    c.playerY = e.y;
    c.playerX = e.x;
    c.playerZ = e.z + 2;
    c.playerYaw = Math.PI;
    c.invulnerable = invulnerable;
    e.phase = "windup";
    e.timer = 0;
    e.yaw = 0;
    for (let i = 0; i < 20; i++) stepParishEncounter(state, 0.04, progress);
    assert.equal(c.health, 100, "windup must not deal damage");
    for (let i = 0; i < 15; i++) stepParishEncounter(state, 0.04, progress);
    assert.equal(c.health, invulnerable ? 100 : 100 - enemySpecs.sentinel.damage);
    assert.equal(c.playerHitId, invulnerable ? 0 : 1);
  }
});

void test("a player sword connects once per swing and does not hit across elevations", () => {
  for (const offset of [0, 4]) {
    const progress = newParishProgress(),
      state = createParishEncounter(progress),
      e = state.enemies[1],
      c = state.combat;
    c.playerX = e.x;
    c.playerZ = e.z + 2;
    c.playerYaw = Math.PI;
    c.playerY = e.y + offset;
    c.attackId = 1;
    c.attackTime = swordAttackDuration(1) * 0.65;
    const before = e.health;
    stepParishEncounter(state, 0.01, progress);
    stepParishEncounter(state, 0.01, progress);
    assert.equal(e.health, before - (offset === 0 ? 25 : 0));
  }
});

void test("enemy ember projectiles are dodgeable and stop at a barred gate", () => {
  const progress = newParishProgress(),
    state = createParishEncounter(progress),
    c = state.combat;
  c.playerX = -18;
  c.playerY = 0;
  c.playerZ = 128;
  c.invulnerable = true;
  state.bolts.push({ id: 1, x: -20.1, y: 1, z: 128, vx: 8, vz: 0, life: 1 });
  stepParishEncounter(state, 0.05, progress);
  assert.equal(state.bolts.length, 0);
  assert.equal(c.health, 100);
  state.bolts.push({ id: 2, x: -18.2, y: 1, z: 128, vx: 8, vz: 0, life: 1 });
  stepParishEncounter(state, 0.05, progress);
  assert.equal(c.health, 100);
  assert.equal(state.bolts.length, 0);
});

void test("rest respawns enemies and refills supplies while checkpoint shortcuts persist", () => {
  const progress = newParishProgress(),
    state = createParishEncounter(progress);
  state.combat.health = 40;
  state.flasks = 1;
  state.enemies[0].health = 0;
  progress.refuge = true;
  progress.court = true;
  progress.checkpoint = "kiln";
  assert.equal(restAtParishShrine(state), true);
  assert.equal(state.combat.health, 100);
  assert.equal(state.flasks, 3);
  assert.equal(state.enemies[0].health, enemySpecs.sentinel.health);
  const retry = createParishEncounter(progress);
  assert.deepEqual(
    [retry.combat.playerX, retry.combat.playerY, retry.combat.playerZ],
    parishShrines[1].spawn,
  );
  assert.equal(progress.refuge, true);
  assert.equal(progress.court, true);
  state.combat.playerY = state.enemies[1].y;
  state.combat.playerX = state.enemies[1].x;
  state.combat.playerZ = state.enemies[1].z;
  assert.equal(restAtParishShrine(state), false, "nearby enemy must prevent resting");
});

void test("flasks consume only when healing succeeds and cannot cancel hitstun", () => {
  const state = createParishEncounter(newParishProgress());
  assert.equal(drinkEmber(state), false);
  state.combat.health = 20;
  state.combat.hurtTime = 0.3;
  assert.equal(drinkEmber(state), false);
  assert.equal(state.flasks, 3);
  state.combat.hurtTime = 0;
  assert.equal(drinkEmber(state), true);
  assert.equal(state.combat.health, 65);
  assert.equal(state.flasks, 2);
});

void test("authored sentinel poses hold the weapon up then land at the contact frame", () => {
  const e = createParishEncounter(newParishProgress()).enemies[0];
  e.phase = "windup";
  e.timer = enemySpecs.sentinel.windup;
  assert.ok(parishEnemyPose(e, 0).arm < -2.5);
  e.phase = "strike";
  e.timer = enemySpecs.sentinel.contact;
  assert.ok(parishEnemyPose(e, 0).lean > 0.5);
  e.phase = "dead";
  e.deathTime = 1.2;
  assert.equal(parishEnemyPose(e, 0).death, 1);
});

void test("the parish remains explorable after victory without lingering hitstun", () => {
  const progress = newParishProgress(),
    state = createParishEncounter(progress);
  state.combat.bossHealth = 0;
  state.combat.hurtTime = 0.4;
  stepParishEncounter(state, 0.01, progress);
  assert.equal(state.bossFelled, true);
  assert.equal(state.combat.freezeOnVictory, false);
  assert.equal(state.combat.hurtTime, 0);
});

void test("the concept plan has a continuous court, foreground refuge and west burial terrace", () => {
  assert.ok(parishTiles.length >= 240);
  for (const [x, y, z] of [
    [0, 6, 80],
    [-24, 6, 80],
    [24, 6, 80],
    [-56, 6, 80],
    [-64, 6, 40],
    [0, 0, 136],
    [-56, -6, 128],
    [48, 14, 88],
    [84, 14, 40],
  ])
    assert.equal(parishFloorHeight(x, z, y), y);
  assert.equal(parishFloorHeight(0, 88, 6), 6, "the old refuge gate corridor is now plaza floor");
  assert.equal(parishFloorHeight(-32, 40, 0), null, "the old crypt room is removed");
  assert.equal(parishFloorHeight(64, 72, 8), null, "the old rectangular foundry loop is removed");
});
void test("the central monument blocks sightlines but leaves space to duel around it", () => {
  const p = newParishProgress();
  assert.equal(parishBlocked(0, 6, 80, 0.4), true);
  assert.equal(parishLineClear(0, 76, 0, 84, p, 6), false);
  assert.equal(parishLineClear(8, 76, 8, 78, p, 6), true);
  for (const prop of parishProps.filter((p) => p.kind !== "support" || p.position[1] !== -26))
    assert.equal(
      parishFloorHeight(prop.position[0], prop.position[2], prop.position[1]),
      prop.position[1],
    );
});
void test("side-route offerings respect elevation, danger and persistent collection", () => {
  const progress = newParishProgress(),
    cache = parishCaches[2];
  const [x, y, z] = cache.position;
  assert.equal(parishInteraction(x, y, z, progress, false, false)?.kind, "cache");
  assert.equal(parishInteraction(x, y, z, progress, true, false)?.available, false);
  assert.equal(parishInteraction(x, 0, z, progress, false, false), null);
  progress.caches.push(cache.id);
  assert.equal(parishInteraction(x, y, z, progress, false, false), null);
});

void test("physical cover still leaves all areas and offerings reachable around barred shortcuts", () => {
  const progress = newParishProgress(),
    visited = new Set<string>(),
    areas = new Set<string>();
  const queue: Array<[number, number, number]> = [[0, 140, 0]];
  for (let index = 0; index < queue.length; index++) {
    const [x, z, y] = queue[index],
      key = `${x},${y},${z}`;
    if (visited.has(key)) continue;
    visited.add(key);
    if (parishBlocked(x, y, z, 0.4)) continue;
    areas.add(parishAreaAt(x, z, y));
    for (const [dx, dz] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const nx = x + dx,
        nz = z + dz,
        height = parishFloorHeight(nx, nz, y);
      if (height === null || Math.abs(height - y) > 1 || parishBlocked(nx, height, nz, 0.4))
        continue;
      if (!parishLineClear(x, z, nx, nz, progress, y)) continue;
      if (!visited.has(`${nx},${height},${nz}`)) queue.push([nx, nz, height]);
    }
  }
  assert.equal(areas.size, parishAreas.length);
  for (const cache of parishCaches)
    assert.ok(
      visited.has(`${cache.position[0]},${cache.position[1]},${cache.position[2]}`),
      cache.id,
    );
});

void test("skyline ruins stay outside the expanded routes and their camera space", () => {
  for (const ruin of parishBackdropSpawns)
    for (const tile of parishTiles)
      assert.ok(
        Math.abs(ruin.position[0] - tile.x) > 10 || Math.abs(ruin.position[2] - tile.z) > 10,
        "background tower overlaps playable tile",
      );
  for (const ruin of arenaBackdropSpawns)
    assert.ok(ruin.z <= 0, "arena ruins must not occupy the north parish");
});

void test("court and west terrace genuinely overlap the bridge and burial floors", () => {
  for (const z of [80, 88, 96]) {
    assert.equal(parishFloorHeight(48, z, 6), 6);
    assert.equal(parishFloorHeight(48, z, 14), 14);
    assert.notEqual(parishAreaAt(48, z, 6), parishAreaAt(48, z, 14));
  }
  assert.equal(parishFloorHeight(-56, 112, -6), -6);
  assert.equal(parishFloorHeight(-56, 112, 6), 6);
  assert.equal(parishFloorHeight(0, 108, 3), 3);
  assert.equal(parishFloorHeight(0, 44, 9), 9);
  assert.equal(parishFloorHeight(0, 0, 12), PARISH_ARENA_Y);
});
void test("opening the refuge postern shortens the burial chamber return", () => {
  const distance = (open: boolean) => {
    const start = parishTiles.find((t) => t.x === -56 && t.z === 128 && t.y === -6)!;
    const seen = new Set();
    const queue = [{ tile: start, steps: 0 }];
    for (let i = 0; i < queue.length; i++) {
      const { tile, steps } = queue[i];
      if (seen.has(tile)) continue;
      seen.add(tile);
      if (!open && tile.x === -24 && tile.z === 128) continue;
      if (tile.x === 0 && tile.z === 136 && tile.y === 0) return steps;
      for (const next of parishTiles)
        if (parishTilesConnected(tile, next)) queue.push({ tile: next, steps: steps + 1 });
    }
    return Infinity;
  };
  assert.ok(Number.isFinite(distance(false)));
  assert.ok(distance(true) < distance(false));
});
void test("projectiles remain on the correct floor below the long eastern bridge", () => {
  const p = newParishProgress();
  assert.equal(parishLineClear(48, 84, 48, 86, p, 6), true);
  assert.equal(parishLineClear(48, 84, 48, 86, p, 14), true);
  const state = createParishEncounter(p);
  state.bolts.push({ id: 1, x: 48, y: 7.1, z: 84, vx: 0, vz: 4, life: 1 });
  state.bolts.push({ id: 2, x: 48, y: 15.1, z: 84, vx: 0, vz: 4, life: 1 });
  stepParishEncounter(state, 0.05, p);
  assert.equal(state.bolts.length, 2);
  assert.ok(state.bolts.every((b) => b.z > 84));
});
void test("the raised Warden stays on the cathedral floor including recovery and leap", () => {
  const state = createParishEncounter(newParishProgress());
  state.combat.bossActive = true;
  state.combat.playerY = PARISH_ARENA_Y;
  state.combat.playerX = 10;
  state.combat.playerZ = 10;
  for (let i = 0; i < 360; i++) {
    stepParishEncounter(state, 1 / 60, newParishProgress());
    assert.ok(state.combat.bossY >= PARISH_ARENA_Y);
  }
});
