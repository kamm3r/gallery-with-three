import test from "node:test";
import assert from "node:assert/strict";
import { createEncounter, stepEncounter } from "../src/gameplay/bossEncounter.ts";

test("boss telegraphs, strikes once, and leaves a recovery opening", () => {
  const s = createEncounter();
  s.playerZ = -5;
  stepEncounter(s, 0.05);
  assert.equal(s.phase, "windup");
  for (let i = 0; i < 18; i++) stepEncounter(s, 0.05);
  assert.equal(s.health, 100);
  for (let i = 0; i < 10; i++) stepEncounter(s, 0.05);
  assert.equal(s.health, 75);
  assert.equal(s.phase, "recovery");
});

test("dodge invulnerability avoids damage and attacks hit only once", () => {
  const s = createEncounter();
  Object.assign(s, { playerZ: -5, phase: "windup", timer: 1, invulnerable: true });
  stepEncounter(s, 0.05);
  assert.equal(s.health, 100);
  Object.assign(s, { phase: "recovery", attackTime: 0.4, attackId: 1 });
  stepEncounter(s, 0.05);
  assert.equal(s.bossHealth, 260);
  stepEncounter(s, 0.05);
  assert.equal(s.bossHealth, 260);
});

test("defeated boss cannot damage the player", () => {
  const s = createEncounter();
  Object.assign(s, { bossHealth: 0, phase: "windup", timer: 2, playerZ: -5 });
  stepEncounter(s, 0.05);
  assert.equal(s.phase, "defeated");
  assert.equal(s.health, 100);
});
