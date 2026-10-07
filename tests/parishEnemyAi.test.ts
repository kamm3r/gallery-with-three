import assert from "node:assert/strict";
import test from "node:test";
import {
  createParishEncounter,
  hitParishEnemy,
  stepParishEncounter,
  parishWindupDuration,
} from "../src/gameplay/parishEncounter.ts";
import { enemySpecs, newParishProgress, type EnemyKind } from "../src/gameplay/ashenParish.ts";
import { parishEnemyPose } from "../src/gameplay/parishAnimation.ts";

function duel(kind: EnemyKind = "sentinel") {
  const progress = newParishProgress();
  const state = createParishEncounter(progress);
  const enemy = state.enemies.find((e) =>
    kind === "sentinel" ? e.id === "court-guard" : e.kind === kind,
  )!;
  state.enemies = [enemy];
  state.combat.playerX = enemy.x;
  state.combat.playerZ = enemy.z + 2;
  state.combat.playerY = enemy.y;
  enemy.yaw = 0;
  return { state, enemy, progress, tick: (dt = 0.05) => stepParishEncounter(state, dt, progress) };
}

void test("poise breaks interrupt early windups, but hits never extend an existing stagger", () => {
  const { state, enemy, tick } = duel();
  enemy.health = 150;
  enemy.phase = "windup";
  enemy.timer = 0.1;
  hitParishEnemy(state, enemy);
  assert.equal(enemy.phase, "windup");
  assert.equal(enemy.timer, 0.1);
  hitParishEnemy(state, enemy);
  assert.equal(enemy.phase, "stagger");
  tick();
  const elapsed = enemy.timer;
  hitParishEnemy(state, enemy);
  assert.equal(enemy.timer, elapsed);
  assert.equal(enemy.phase, "stagger", "nonlethal hits must not restart stagger");
});

void test("repeated hits cannot keep any enemy stun-locked: each gets a retaliation window", () => {
  for (const kind of ["sentinel", "hound", "acolyte"] as const) {
    const { state, enemy, tick } = duel(kind);
    enemy.health = 10000;
    enemy.phase = "windup";
    hitParishEnemy(state, enemy, true);
    if (kind === "sentinel") hitParishEnemy(state, enemy, true);
    assert.equal(enemy.phase, "stagger");
    let reachedStrike = false,
      longestStagger = 0,
      streak = 0;
    for (let i = 0; i < 120; i++) {
      if (i % 2 === 0) hitParishEnemy(state, enemy, true);
      tick();
      reachedStrike ||= enemy.phase === "strike";
      streak = enemy.phase === "stagger" ? streak + 0.05 : 0;
      longestStagger = Math.max(streak, longestStagger);
    }
    assert.equal(reachedStrike, true, `${kind} must get an attack despite hit spam`);
    assert.ok(
      longestStagger <= enemySpecs[kind].stagger + 0.05,
      `${kind} stagger must end on time`,
    );
  }
});

void test("committed attacks take health damage without cancellation, including lethal hits", () => {
  for (const phase of ["windup", "strike"] as const) {
    const { state, enemy } = duel();
    enemy.health = 75;
    enemy.phase = phase;
    enemy.timer = phase === "windup" ? enemySpecs.sentinel.windup * 0.8 : 0.04;
    const timer = enemy.timer;
    hitParishEnemy(state, enemy, true);
    hitParishEnemy(state, enemy, true);
    assert.equal(enemy.health, 25);
    assert.equal(enemy.phase, phase);
    assert.equal(enemy.timer, timer);
    hitParishEnemy(state, enemy);
    assert.equal(enemy.phase, "dead");
  }
});

void test("sentinels guard frontal hits but leave flanks and recovery punishable", () => {
  const { state, enemy } = duel();
  enemy.phase = "guard";
  hitParishEnemy(state, enemy);
  assert.equal(enemy.health, enemySpecs.sentinel.health - 5);
  assert.equal(enemy.guardFlash, 1);
  state.combat.playerZ = enemy.z - 2;
  hitParishEnemy(state, enemy);
  assert.equal(enemy.health, enemySpecs.sentinel.health - 30);
  enemy.phase = "recovery";
  hitParishEnemy(state, enemy);
  assert.equal(enemy.health, enemySpecs.sentinel.health - 65);
});

void test("nearby melee enemies space themselves and take turns committing", () => {
  const state = createParishEncounter(newParishProgress());
  state.enemies = state.enemies.filter((e) => e.kind === "sentinel").slice(0, 2);
  state.enemies.forEach((e, i) => {
    e.x = e.homeX = i ? 1 : -1;
    e.z = e.homeZ = 72;
    e.yaw = 0;
    e.phase = "pursue";
    e.timer = 1;
  });
  state.combat.playerX = 0;
  state.combat.playerZ = 74;
  state.combat.playerY = 6;
  stepParishEncounter(state, 0.05, newParishProgress());
  assert.equal(state.enemies.filter((e) => e.phase === "windup").length, 1);
  assert.ok(
    Math.hypot(state.enemies[0].x - state.enemies[1].x, state.enemies[0].z - state.enemies[1].z) >=
      0.9,
  );
});

void test("casters retreat from melee then cast; hounds circle before lunging", () => {
  const caster = duel("acolyte");
  const oldZ = caster.enemy.z;
  caster.tick();
  assert.equal(caster.enemy.phase, "retreat");
  assert.ok(caster.enemy.z < oldZ);
  for (let i = 0; i < 20; i++) caster.tick();
  assert.ok(["windup", "strike"].includes(caster.enemy.phase));
  const hound = duel("hound");
  hound.tick();
  assert.equal(hound.enemy.phase, "circle");
  assert.notEqual(hound.enemy.x, hound.enemy.homeX);
  for (let i = 0; i < 7; i++) hound.tick();
  assert.equal(hound.enemy.phase, "windup");
});

void test("late windup stops tracking, allowing a side dodge to make the attack miss", () => {
  const { state, enemy, tick } = duel();
  enemy.phase = "windup";
  enemy.timer = 0.8;
  state.combat.playerX = enemy.x + 2;
  state.combat.playerZ = enemy.z;
  for (let i = 0; i < 6; i++) tick();
  assert.equal(enemy.yaw, 0);
  assert.equal(state.combat.health, 100);
});

void test("poise recovers out of combat; lost targets are searched briefly then forgotten", () => {
  const { state, enemy, tick } = duel();
  hitParishEnemy(state, enemy);
  tick();
  state.combat.playerY = 20;
  tick();
  assert.equal(enemy.phase, "search");
  for (let i = 0; i < 85; i++) tick();
  assert.equal(enemy.phase, "idle");
  assert.equal(enemy.poise, enemySpecs.sentinel.poise);
});

void test("all enemy attack poses join continuously at windup, contact, and recovery", () => {
  for (const kind of ["sentinel", "hound", "acolyte"] as const) {
    const { enemy } = duel(kind);
    const spec = enemySpecs[kind];
    for (const [from, end, to] of [
      ["windup", spec.windup, "strike"],
      ["strike", spec.strike, "recovery"],
    ] as const) {
      enemy.phase = from;
      enemy.timer = end;
      const before = parishEnemyPose(enemy, 0);
      enemy.phase = to;
      enemy.timer = 0;
      const after = parishEnemyPose(enemy, 0);
      for (const key of ["lean", "twist", "arm", "shield", "bob", "jaw"] as const)
        assert.ok(
          Math.abs(before[key] - after[key]) < 1e-8,
          `${kind} ${from}->${to} ${key} must not pop`,
        );
    }
    enemy.phase = "strike";
    enemy.timer = spec.contact;
    const contact = parishEnemyPose(enemy, 0);
    assert.ok(Number.isFinite(contact.arm));
    if (kind === "hound") assert.ok(contact.legFL < 0 && contact.legBL > 0);
  }
});

void test("hounds close to a reachable lunge distance before committing", () => {
  const { state, enemy, tick } = duel("hound");
  state.combat.playerZ = enemy.z + 3.4;
  for (let i = 0; i < 80; i++) tick();
  assert.ok(state.combat.playerHitId > 0, "a stationary player in open ground must be reachable");
});

void test("sentinel thrusts and overheads have distinct preparations and continuous contact poses", () => {
  const { enemy } = duel();
  enemy.phase = "windup";
  enemy.timer = enemySpecs.sentinel.windup;
  enemy.attackNumber = 1;
  const overhead = parishEnemyPose(enemy, 0);
  enemy.attackNumber = 2;
  const thrust = parishEnemyPose(enemy, 0);
  assert.ok(overhead.arm < thrust.arm - 1);
  assert.ok(thrust.elbow > overhead.elbow);
  enemy.phase = "strike";
  enemy.timer = 0;
  const strike = parishEnemyPose(enemy, 0);
  for (const key of ["lean", "twist", "arm", "elbow"] as const)
    assert.ok(Math.abs(strike[key] - thrust[key]) < 1e-6);
  enemy.timer = enemySpecs.sentinel.contact;
  const contact = parishEnemyPose(enemy, 0);
  assert.ok(contact.lean > 0.5);
});

void test("sentinels land two separately timed hits before their punishable recovery", () => {
  const { state, enemy, tick } = duel();
  enemy.phase = "windup";
  enemy.attackNumber = 1;
  for (let i = 0; i < 44; i++) tick();
  assert.equal(state.combat.playerHitId, 2);
  assert.equal(state.combat.health, 100 - enemySpecs.sentinel.damage * 2);
  assert.equal(enemy.phase, "recovery");
});
void test("one early roll window avoids the opening blow but does not cover its follow-up", () => {
  const { state, enemy, tick } = duel();
  enemy.phase = "windup";
  enemy.attackNumber = 1;
  for (let i = 0; i < 220; i++) {
    const time = i * 0.01;
    state.combat.invulnerable = time > 0.91 && time < 1.38;
    tick(0.01);
  }
  assert.equal(state.combat.playerHitId, 1);
  assert.equal(state.combat.health, 100 - enemySpecs.sentinel.damage);
});
void test("retreating outside combo reach leaves a safe recovery opening", () => {
  const { state, enemy, tick } = duel();
  enemy.phase = "windup";
  enemy.attackNumber = 1;
  while (state.combat.playerHitId === 0) tick();
  state.combat.playerX = enemy.x + 6;
  for (let i = 0; i < 10; i++) tick();
  assert.equal(state.combat.playerHitId, 1);
  assert.equal(enemy.phase, "recovery");
});
void test("two separate flanks can pressure the player, with a cap of two nearby melee attackers", () => {
  const state = createParishEncounter(newParishProgress());
  state.enemies = state.enemies.filter((e) => e.kind === "sentinel").slice(0, 3);
  state.combat.playerX = 0;
  state.combat.playerZ = 72;
  for (const [i, e] of state.enemies.entries()) {
    e.x = e.homeX = i === 0 ? -2 : i === 1 ? 2 : 0;
    e.z = e.homeZ = i === 2 ? 74 : 72;
    e.y = 0;
    e.yaw = Math.atan2(-e.x, 72 - e.z);
    e.phase = "pursue";
    e.timer = 1;
  }
  stepParishEncounter(state, 0.05, newParishProgress());
  assert.equal(state.enemies.filter((e) => e.phase === "windup").length, 2);
});
void test("combo preparation starts from the previous strike pose and still locks tracking before contact", () => {
  const { state, enemy, tick } = duel();
  enemy.phase = "strike";
  enemy.attackNumber = 1;
  enemy.timer = enemySpecs.sentinel.strike;
  enemy.hit = true;
  const before = parishEnemyPose(enemy, 0);
  tick(0.001);
  assert.equal(enemy.comboStep, 1);
  assert.equal(enemy.phase, "windup");
  const after = parishEnemyPose(enemy, 0);
  for (const key of ["lean", "twist", "arm", "shield"] as const)
    assert.ok(Math.abs(after[key] - before[key]) < 1e-6);
  enemy.timer = parishWindupDuration(enemy) * 0.8;
  const yaw = enemy.yaw;
  state.combat.playerX = enemy.x + 2;
  state.combat.playerZ = enemy.z;
  tick(0.01);
  assert.equal(enemy.yaw, yaw);
});
void test("a careless stationary player cannot survive a sentinel's repeated pressure", () => {
  const { state, tick } = duel();
  for (let i = 0; i < 120; i++) tick();
  assert.equal(state.combat.health, 0);
});
