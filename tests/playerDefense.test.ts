import { test } from "vite-plus/test";
import assert from "node:assert/strict";
import { createEncounter, moveSpec, stepEncounter } from "../src/gameplay/bossEncounter.ts";
import {
  ARMOR_LIMIT,
  GUARD_BREAK_TIME,
  PARRY_WINDOW,
  RIPOSTE_MULTIPLIER,
  receiveBlow,
} from "../src/gameplay/playerDefense.ts";
import {
  PLUNGE_ATTACK,
  swordAttackDuration,
  swordSpec,
} from "../src/gameplay/characterAnimations.ts";
import { combatTuning } from "../src/gameplay/combatTuning.ts";
import { createParishEncounter, stepParishEncounter } from "../src/gameplay/parishEncounter.ts";
import { newParishProgress } from "../src/gameplay/ashenParish.ts";

/** A player at the origin facing +Z, struck from straight ahead unless told otherwise. */
function defender(patch: Partial<ReturnType<typeof createEncounter>> = {}) {
  return Object.assign(createEncounter(), { playerX: 0, playerZ: 0, playerYaw: 0 }, patch);
}
const ahead = { damage: 30, x: 0, z: 3, knockback: 5, parryable: true };
const behind = { ...ahead, z: -3 };

test("a parry deflects frontal parryable blows inside its window only", () => {
  const mid = (PARRY_WINDOW[0] + PARRY_WINDOW[1]) / 2;
  const d = defender({ parryTime: mid });
  assert.equal(receiveBlow(d, ahead), "parried");
  assert.equal(d.health, 100);
  assert.equal(receiveBlow(defender({ parryTime: mid }), behind), "hit");
  assert.equal(receiveBlow(defender({ parryTime: mid }), { ...ahead, parryable: false }), "hit");
  assert.equal(receiveBlow(defender({ parryTime: PARRY_WINDOW[1] + 0.05 }), ahead), "hit");
  assert.equal(receiveBlow(defender({ invulnerable: true }), ahead), "dodged");
});

test("a guard takes frontal blows on stamina with chip damage, and breaks when it runs out", () => {
  const d = defender({ guarding: true, stamina: 100 });
  assert.equal(receiveBlow(d, ahead), "guarded");
  assert.ok(d.health > 90 && d.health < 100, `chip ${100 - d.health}`);
  assert.ok(d.stamina < 70 && d.hurtTime === 0);
  assert.equal(receiveBlow(defender({ guarding: true }), behind), "hit");
  const tired = defender({ guarding: true, stamina: 10 });
  assert.equal(receiveBlow(tired, ahead), "broken");
  assert.equal(tired.hurtTime, GUARD_BREAK_TIME);
  assert.equal(tired.guarding, false);
});

test("hyper-armour takes the damage without the flinch, but not from very heavy blows", () => {
  const d = defender({ hyperArmor: true });
  assert.equal(receiveBlow(d, ahead), "armored");
  assert.equal(d.health, 70);
  assert.equal(d.hurtTime, 0);
  assert.equal(
    receiveBlow(defender({ hyperArmor: true }), { ...ahead, damage: ARMOR_LIMIT }),
    "hit",
  );
});

test("parrying the Warden's sweep staggers it, and the next blow is a riposte", () => {
  const s = createEncounter();
  Object.assign(s, { bossX: 0, bossZ: 3, bossYaw: Math.PI, playerX: 0, playerZ: 0, playerYaw: 0 });
  Object.assign(s, { phase: "windup", move: "sweep", timer: moveSpec("sweep").windup });
  s.parryTime = 0.1;
  stepEncounter(s, 0.02);
  stepEncounter(s, 0.02);
  assert.equal(s.health, 100);
  assert.equal(s.phase, "recovery");
  assert.ok(s.riposte > 0);
  // Let the parry's hit-stop pass, then strike.
  while (s.hitStop > 0) stepEncounter(s, 0.01);
  const before = s.bossHealth;
  Object.assign(s, { attackId: 1, attackStep: 0, attackTime: swordAttackDuration(0) * 0.6 });
  stepEncounter(s, 0.01);
  const plain = combatTuning.baseDamage + combatTuning.recoveryBonusDamage;
  assert.equal(before - s.bossHealth, Math.round(plain * RIPOSTE_MULTIPLIER));
  assert.equal(s.riposte, 0);
  // The slam is too heavy to parry.
  const slam = createEncounter();
  Object.assign(slam, { bossX: 0, bossZ: 3, bossYaw: Math.PI, playerX: 0, playerZ: 0 });
  Object.assign(slam, { phase: "windup", move: "slam", timer: moveSpec("slam").windup });
  slam.parryTime = 0.05;
  for (let i = 0; i < 6; i++) stepEncounter(slam, 0.02);
  assert.ok(slam.health < 100);
});

test("a plunge lands on every enemy around it, not just the nearest", () => {
  const progress = newParishProgress(),
    state = createParishEncounter(progress),
    c = state.combat;
  const [a, b] = state.enemies;
  state.enemies = [a, b];
  Object.assign(b, { x: a.x + 1.6, y: a.y, z: a.z, surfaceId: a.surfaceId });
  Object.assign(c, { playerX: a.x + 0.8, playerY: a.y, playerZ: a.z + 1, playerYaw: 0 });
  const healths = [a.health, b.health];
  Object.assign(c, {
    attackId: 1,
    attackStep: PLUNGE_ATTACK,
    attackTime: swordAttackDuration(PLUNGE_ATTACK) * 0.95,
    plunging: false,
  });
  stepParishEncounter(state, 0.01, progress);
  const expected = Math.round(combatTuning.baseDamage * swordSpec(PLUNGE_ATTACK).motion);
  assert.ok(healths[0] - a.health >= Math.min(healths[0], expected));
  assert.ok(healths[1] - b.health >= Math.min(healths[1], expected));
});

test("parrying a sentinel’s cut staggers it open for a riposte", () => {
  const progress = newParishProgress(),
    state = createParishEncounter(progress),
    c = state.combat;
  const e = state.enemies.find((x) => x.id === "court-guard")!;
  state.enemies = [e];
  // Face to face, the sentinel's cut about to connect.
  Object.assign(c, { playerX: e.x, playerY: e.y, playerZ: e.z + 2, playerYaw: Math.PI });
  Object.assign(e, { yaw: 0, phase: "strike", timer: 0.1, hit: false });
  c.parryTime = 0.1;
  for (let i = 0; i < 4 && e.phase === "strike"; i++) stepParishEncounter(state, 0.02, progress);
  assert.equal(c.health, 100);
  assert.equal(e.phase, "stagger");
  assert.ok(e.riposte > 0);
});
