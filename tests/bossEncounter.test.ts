import test from "node:test";
import assert from "node:assert/strict";
import {
  chooseMove,
  createEncounter,
  LEAP_AIRTIME,
  moveSpec,
  stepEncounter,
  type BossMove,
} from "../src/gameplay/bossEncounter.ts";

function run(s: ReturnType<typeof createEncounter>, seconds: number) {
  for (let t = 0; t < seconds - 1e-9; t += 0.05) stepEncounter(s, 0.05);
}

function forceMove(s: ReturnType<typeof createEncounter>, move: BossMove) {
  Object.assign(s, { phase: "windup", move, timer: 0, hitIndex: 0 });
}

test("boss telegraphs up close, then commits to a melee move", () => {
  const s = createEncounter();
  s.playerZ = -5;
  stepEncounter(s, 0.05);
  assert.equal(s.phase, "windup");
  assert.ok(["sweep", "slam", "combo"].includes(s.move));
});

test("sweep strikes once after its windup and leaves a recovery opening", () => {
  const s = createEncounter();
  s.playerZ = -5;
  forceMove(s, "sweep");
  run(s, 0.9);
  assert.equal(s.health, 100);
  run(s, 0.5);
  assert.equal(s.health, 75);
  assert.equal(s.hurtTime > 0, true);
  run(s, 0.4);
  assert.equal(s.phase, "recovery");
});

test("combo lands three separate hits", () => {
  const s = createEncounter();
  s.playerZ = -5;
  forceMove(s, "combo");
  const hits = moveSpec("combo").hits;
  run(s, moveSpec("combo").windup + 0.05 + hits[2].at + 0.1);
  assert.equal(s.playerHitId, 3);
  assert.equal(s.health, 100 - hits.reduce((sum, hit) => sum + hit.damage, 0));
});

test("slam only reaches a narrow line in front", () => {
  const s = createEncounter();
  // Beside the Warden: inside the range, outside the slam's arc.
  Object.assign(s, { playerX: 3, playerZ: -7 });
  forceMove(s, "slam");
  s.bossYaw = 0;
  run(s, moveSpec("slam").windup * 0.2);
  // Turn tracking is slow for the slam; pin facing forward for this check.
  s.bossYaw = 0;
  s.timer = moveSpec("slam").windup + 0.01;
  run(s, 0.2);
  assert.equal(s.health, 100);
});

test("distant players get leapt at, and the landing hits all around", () => {
  const s = createEncounter();
  Object.assign(s, { playerX: 0, playerZ: 6 });
  stepEncounter(s, 0.05);
  // No leap on arrival; the opening cooldown gives the player a moment.
  assert.equal(s.phase, "approach");
  s.cooldowns.leap = 0;
  stepEncounter(s, 0.05);
  assert.equal(s.phase, "windup");
  assert.equal(s.move, "leap");
  run(s, moveSpec("leap").windup + 0.05);
  assert.equal(s.phase, "strike");
  assert.ok(s.bossY > 0 || s.timer < 0.1);
  run(s, LEAP_AIRTIME + 0.05);
  assert.equal(s.bossY, 0);
  assert.ok(Math.hypot(s.bossX - 0, s.bossZ - 6) < 0.01);
  assert.equal(s.health, 100 - moveSpec("leap").hits[0].damage);
});

test("crossing the enrage threshold roars once and unlocks the nova", () => {
  const s = createEncounter();
  Object.assign(s, { playerZ: -5, bossHealth: 140 });
  stepEncounter(s, 0.05);
  assert.equal(s.phase, "roar");
  assert.equal(s.enraged, true);
  run(s, 2.2);
  assert.notEqual(s.phase, "roar");
  s.cooldowns = { sweep: 99, slam: 99, combo: 99, leap: 99, nova: 0 };
  assert.equal(chooseMove(s, 2), "nova");
  s.enraged = false;
  assert.equal(chooseMove(s, 2), null);
});

test("never repeats the same move back to back when there's a choice", () => {
  const s = createEncounter();
  for (let i = 0; i < 40; i++) {
    s.lastMove = chooseMove(s, 2) ?? s.lastMove;
    const next = chooseMove(s, 2);
    assert.notEqual(next, s.lastMove);
  }
});

test("dodge invulnerability avoids damage and attacks hit only once", () => {
  const s = createEncounter();
  Object.assign(s, { playerZ: -5, invulnerable: true });
  forceMove(s, "sweep");
  s.timer = 1;
  stepEncounter(s, 0.05);
  assert.equal(s.health, 100);
  Object.assign(s, { phase: "recovery", timer: 0, attackTime: 0.4, attackId: 1 });
  stepEncounter(s, 0.05);
  assert.equal(s.bossHealth, 260);
  stepEncounter(s, 0.05);
  assert.equal(s.bossHealth, 260);
});

test("the Warden can't be struck mid-leap", () => {
  const s = createEncounter();
  Object.assign(s, {
    playerZ: -5,
    phase: "strike",
    move: "leap",
    timer: 0.2,
    attackTime: 0.4,
    attackId: 1,
  });
  s.leapFromZ = s.leapToZ = -7;
  stepEncounter(s, 0.05);
  assert.equal(s.bossHealth, 300);
});

test("defeated boss cannot damage the player", () => {
  const s = createEncounter();
  Object.assign(s, { bossHealth: 0, phase: "windup", timer: 2, playerZ: -5 });
  stepEncounter(s, 0.05);
  assert.equal(s.phase, "defeated");
  assert.equal(s.health, 100);
});
