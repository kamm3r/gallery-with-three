import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

// Execute the actual animation choice used by PlayerRuntime.
const source = ts.createSourceFile(
  "player.tsx",
  readFileSync(new URL("../src/components/ThirdPersonPlayer.tsx", import.meta.url), "utf8"),
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);
let expression = "";
function visit(node: ts.Node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(source) === "nextAction")
    expression = node.initializer!.getText(source);
  ts.forEachChild(node, visit);
}
visit(source);
function choose(patch: Record<string, unknown> = {}) {
  const args = {
    fight: {
      health: 100,
      bossHealth: 0,
      freezeOnVictory: false,
      hurtTime: 0,
      attackTime: 0,
      attackId: 1,
    },
    link: undefined,
    grounded: true,
    seat: { active: false },
    hang: { active: false },
    roll: { active: false },
    velocity: { y: 0 },
    landingTime: { current: 0 },
    moving: false,
    planarSpeedForAnimation: 0,
    CLIP_SECONDS: {},
    isResultScreenActive: () => false,
    ...patch,
  };
  assert.ok(expression);
  // oxlint-disable-next-line typescript/no-implied-eval
  return new Function(...Object.keys(args), `return (${expression});`)(...Object.values(args));
}
void test("parish victory releases the animation state to idle, locomotion, jump, dodge and sword", () => {
  assert.equal(choose(), "Idle");
  assert.equal(choose({ moving: true, planarSpeedForAnimation: 4 }), "Walk");
  assert.equal(choose({ moving: true, planarSpeedForAnimation: 7 }), "Run");
  assert.equal(choose({ grounded: false, velocity: { y: 3 } }), "JumpRise");
  assert.equal(choose({ roll: { active: true, backstep: false } }), "Roll");
  assert.equal(
    choose({
      fight: { health: 100, bossHealth: 0, freezeOnVictory: false, attackTime: 0.3, attackId: 1 },
    }),
    "SwordSlashQuick",
  );
});
void test("victory still celebrates when the encounter ends play, and death takes priority", () => {
  assert.equal(choose({ fight: { health: 100, bossHealth: 0, freezeOnVictory: true } }), "Victory");
  assert.equal(choose({ fight: { health: 0, bossHealth: 0, freezeOnVictory: false } }), "Death");
});

void test("the victory banner can celebrate, then release to exploration after dismissal", () => {
  assert.equal(choose({ isResultScreenActive: () => true }), "Victory");
  assert.equal(
    choose({ moving: true, planarSpeedForAnimation: 4, isResultScreenActive: () => false }),
    "Walk",
  );
});
