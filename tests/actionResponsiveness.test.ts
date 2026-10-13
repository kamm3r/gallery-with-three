import { createCombatInput, stepCombatInput } from "../src/gameplay/combatInput.ts";
import {
  nextSwordStep,
  swordAttackDuration,
  swordProgress,
  swordSpec,
  SWORD_CHAIN,
} from "../src/gameplay/characterAnimations.ts";
import { ROLL_ATTACK_FROM, dodgeInvulnerable } from "../src/gameplay/playerRules.ts";
import { combatTuning } from "../src/gameplay/combatTuning.ts";
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

// Exercise the real attack acceptance block in PlayerRuntime.
const source = ts.createSourceFile(
  "player.tsx",
  readFileSync(new URL("../src/components/ThirdPersonPlayer.tsx", import.meta.url), "utf8"),
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);
let code = "";
function visit(node: ts.Node) {
  if (
    ts.isIfStatement(node) &&
    node.expression.getText(source) === "fight" &&
    node.thenStatement.getText(source).includes("fight.inputAttack")
  ) {
    const list = (node.thenStatement as ts.Block).statements;
    const start = list.findIndex((s) => s.getText(source).startsWith("if (fight.hitStop"));
    const end = list.findIndex((s) => s.getText(source).startsWith("fight.invulnerable ="));
    code = list
      .slice(start, end)
      .map((s) => s.getText(source))
      .join("\n");
  }
  ts.forEachChild(node, visit);
}
visit(source);
void test("an attack pressed in the final 50 ms of recovery is not discarded", () => {
  const fight = {
    health: 100,
    bossHealth: 300,
    freezeOnVictory: false,
    stamina: 100,
    attackId: 1,
    attackStep: 0,
    attackTime: 0.05,
    sinceSwing: 0,
    hitStop: 0,
    parryTime: -1,
    plunging: false,
    staminaDelay: 0,
    shake: 0,
    inputAttack: 0,
  };
  const buffer = createCombatInput();
  const args = {
    requested: { attack: false, dodge: false },
    resolveActions: () =>
      stepCombatInput(
        buffer,
        { attackPress: 1, rollPress: 0 },
        {
          blocked: false,
          stunned: false,
          grounded: true,
          rolling: false,
          cooldown: 0,
          attackStep: fight.attackStep,
          attackRemaining: fight.attackTime,
          stamina: fight.stamina,
          canAttack: true,
        },
        1 / 60,
      ),
    fight,
    input: { attackPress: 1 },
    delta: 1 / 60,
    grounded: true,
    rollRef: { current: { active: false } },
    hangRef: { current: { active: false } },
    nextSwordStep,
    swordSpec,
    swordAttackDuration,
    swordProgress,
    combatTuning,
    SWING_STEER_UNTIL: 0.25,
    STAMINA_REGEN_DELAY: 0.5,
    PARRY_DURATION: 0.7,
    PLUNGE_ATTACK: 4,
    JUMP_ATTACK: 3,
    PLUNGE_HEIGHT: 2.4,
    playSound() {},
    dampAngle: (a: number) => a,
    inputYaw: () => null,
    lockRef: { current: { yaw: null } },
    player: { turnTo() {}, bodyZAxis: { x: 0, z: 1 } },
  };
  assert.ok(code);
  // oxlint-disable-next-line typescript/no-implied-eval
  const frame = new Function(...Object.keys(args), code);
  for (let i = 0; i < 8; i++) frame(...Object.values(args));
  assert.equal(fight.attackId, 2);
  // It continues the chain into the second swing.
  assert.equal(fight.attackStep, 1);
});

const ready = {
  blocked: false,
  stunned: false,
  grounded: true,
  rolling: false,
  cooldown: 0,
  attackStep: 0,
  attackRemaining: 0,
  stamina: 100,
  canAttack: true,
};
void test("a dodge pressed shortly before roll recovery finishes starts on the first eligible frame", () => {
  const buffer = createCombatInput(),
    input = { attackPress: 0, rollPress: 1 };
  assert.equal(
    stepCombatInput(buffer, input, { ...ready, rolling: true, cooldown: 0.05 }, 1 / 60).dodge,
    false,
  );
  assert.equal(stepCombatInput(buffer, input, ready, 0.05).dodge, true);
  assert.equal(stepCombatInput(buffer, input, ready, 1 / 60).dodge, false);
});
void test("dodge cancels sword recovery but cannot cancel windup or its damage window", () => {
  for (const attackRemaining of [0.6, 0.4, 0.3]) {
    const buffer = createCombatInput();
    assert.equal(
      stepCombatInput(
        buffer,
        { attackPress: 0, rollPress: 1 },
        { ...ready, attackRemaining },
        1 / 60,
      ).dodge,
      false,
    );
  }
  const buffer = createCombatInput();
  assert.equal(
    stepCombatInput(
      buffer,
      { attackPress: 0, rollPress: 1 },
      { ...ready, attackRemaining: 0.2 },
      1 / 60,
    ).dodge,
    true,
  );
});
void test("early inputs expire and pause/death discard pending actions", () => {
  const buffer = createCombatInput(),
    input = { attackPress: 1, rollPress: 1 };
  stepCombatInput(buffer, input, { ...ready, rolling: true }, 1 / 60);
  assert.deepEqual(stepCombatInput(buffer, input, ready, 0.2), { attack: false, dodge: false });
  stepCombatInput(buffer, { attackPress: 2, rollPress: 2 }, { ...ready, blocked: true }, 1 / 60);
  assert.deepEqual(stepCombatInput(buffer, { attackPress: 2, rollPress: 2 }, ready, 1 / 60), {
    attack: false,
    dodge: false,
  });
});
void test("a near-landing press buffers but a long airborne press expires", () => {
  const buffer = createCombatInput(),
    input = { attackPress: 0, rollPress: 1 };
  stepCombatInput(buffer, input, { ...ready, grounded: false }, 1 / 60);
  assert.equal(stepCombatInput(buffer, input, ready, 0.08).dodge, true);
  stepCombatInput(buffer, { ...input, rollPress: 2 }, { ...ready, grounded: false }, 1 / 60);
  assert.equal(stepCombatInput(buffer, { ...input, rollPress: 2 }, ready, 0.2).dodge, false);
});
void test("dodge wins simultaneous inputs and attack buffering cannot become an endless combo", () => {
  const buffer = createCombatInput();
  assert.deepEqual(stepCombatInput(buffer, { attackPress: 1, rollPress: 1 }, ready, 1 / 60), {
    attack: false,
    dodge: true,
  });
  assert.deepEqual(stepCombatInput(buffer, { attackPress: 1, rollPress: 1 }, ready, 1 / 60), {
    attack: false,
    dodge: false,
  });
});

void test("each swing chains into the next only after its hit, and the heavy ends the chain", () => {
  for (const step of [0, 1, 2]) {
    const duration = swordAttackDuration(step),
      spec = swordSpec(step);
    const press = (progress: number) =>
      stepCombatInput(
        createCombatInput(),
        { attackPress: 1, rollPress: 0 },
        { ...ready, attackStep: step, attackRemaining: duration * (1 - progress) },
        1 / 60,
      ).attack;
    // Never during the swing's hit window.
    assert.equal(press((spec.hitStart + spec.hitEnd) / 2), false, `step ${step} mid-hit`);
    assert.ok(spec.chainFrom > spec.hitEnd && spec.rollFrom > spec.hitEnd);
    if (spec.chainFrom <= 1) assert.equal(press(spec.chainFrom + 0.01), true, `step ${step}`);
  }
  assert.equal(nextSwordStep(0, true, 0), 1);
  assert.equal(nextSwordStep(1, false, 0.2), 2);
  assert.equal(nextSwordStep(2, false, 0.2), 0);
  assert.equal(nextSwordStep(1, false, 1), 0);
  // After a jump attack or plunge the ground chain starts afresh.
  assert.equal(nextSwordStep(3, false, 0), 0);
  assert.equal(nextSwordStep(4, false, 0), 0);
  assert.deepEqual(
    SWORD_CHAIN.map((s) => s.clip),
    ["SwordSlashQuick", "SwordSlash", "SwordSlashHeavy"],
  );
});

void test("late in a roll an attack cancels it into a roll attack; early it does not", () => {
  const press = (rollElapsed: number) =>
    stepCombatInput(
      createCombatInput(),
      { attackPress: 1, rollPress: 0 },
      { ...ready, rolling: true, rollElapsed },
      1 / 60,
    ).attack;
  assert.equal(press(0.3), false);
  assert.equal(press(ROLL_ATTACK_FROM + 0.01), true);
});

void test("rolls and backsteps are invincible only inside their windows, by roll weight", () => {
  assert.equal(dodgeInvulnerable(false, 0.02), false);
  assert.equal(dodgeInvulnerable(false, 0.3), true);
  assert.equal(dodgeInvulnerable(false, 0.7), false);
  assert.equal(dodgeInvulnerable(true, 0.1), true);
  assert.equal(dodgeInvulnerable(true, 0.3), false);
  // A heavy roll's window opens later and closes sooner than a light one's.
  assert.equal(dodgeInvulnerable(false, 0.1, "heavy"), false);
  assert.equal(dodgeInvulnerable(false, 0.1, "light"), true);
  assert.equal(dodgeInvulnerable(false, 0.5, "heavy"), false);
});

void test("any stamina left allows a dodge or swing; none blocks both", () => {
  const act = (stamina: number) =>
    stepCombatInput(
      createCombatInput(),
      { attackPress: 1, rollPress: 1 },
      { ...ready, stamina },
      0,
    );
  assert.equal(act(3).dodge, true);
  assert.deepEqual(act(0), { attack: false, dodge: false });
});

void test("in the air only an attack comes out, and only between swings", () => {
  const air = (attackRemaining: number) =>
    stepCombatInput(
      createCombatInput(),
      { attackPress: 1, rollPress: 1 },
      { ...ready, grounded: false, attackRemaining },
      1 / 60,
    );
  assert.deepEqual(air(0), { attack: true, dodge: false });
  assert.deepEqual(air(0.3), { attack: false, dodge: false });
});
