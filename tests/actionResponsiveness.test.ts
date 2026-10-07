import { createCombatInput, stepCombatInput } from "../src/gameplay/combatInput.ts";
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
    const start = list.findIndex((s) => s.getText(source).startsWith("fight.attackTime ="));
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
    attackTime: 0.05,
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
          attackId: fight.attackId,
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
    CLIP_SECONDS: { SwordSlashQuick: 0.6, SwordSlashHeavy: 0.8 },
  };
  assert.ok(code);
  // oxlint-disable-next-line typescript/no-implied-eval
  const frame = new Function(...Object.keys(args), code);
  for (let i = 0; i < 8; i++) frame(...Object.values(args));
  assert.equal(fight.attackId, 2);
});

const ready = {
  blocked: false,
  stunned: false,
  grounded: true,
  rolling: false,
  cooldown: 0,
  attackId: 1,
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
