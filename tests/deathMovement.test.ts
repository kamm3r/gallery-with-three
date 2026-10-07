import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

// Execute the actual parent frame callback without mounting WebGL/React.
const source = ts.createSourceFile(
  "player.tsx",
  readFileSync(new URL("../src/components/ThirdPersonPlayer.tsx", import.meta.url), "utf8"),
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);
let callback = "";
function visit(node: ts.Node) {
  if (
    ts.isCallExpression(node) &&
    node.expression.getText(source) === "useFrame" &&
    node.arguments[0]?.getText(source).includes("player.setMovement")
  )
    callback = node.arguments[0].getText(source);
  ts.forEachChild(node, visit);
}
visit(source);

test("death and result screens suppress movement; parish victory permits exploration", () => {
  assert.ok(callback);
  for (const scenario of [
    { health: 0, bossHealth: 300, freezeOnVictory: true, result: false, frozen: true },
    { health: 100, bossHealth: 300, freezeOnVictory: true, result: true, frozen: true },
    { health: 100, bossHealth: 0, freezeOnVictory: true, result: false, frozen: true },
    { health: 100, bossHealth: 0, freezeOnVictory: false, result: false, frozen: false },
  ])
    for (const rolling of [false, true]) {
      let movement: Record<string, boolean> = {};
      const body = { setLinvel() {}, setAngvel() {} };
      const args = {
        controllerRef: {
          current: {
            body,
            setMovement: (next: typeof movement) => {
              movement = next;
            },
          },
        },
        controlsRef: {
          current: {
            forward: true,
            backward: false,
            left: false,
            right: true,
            run: true,
            jump: true,
          },
        },
        rollRef: { current: { active: rolling, dir: { x: 0, z: -1 } } },
        cameraYawRef: { current: 0 },
        enteringRef: { current: false },
        hangRef: { current: { active: false } },
        seatRef: { current: { active: false } },
        combat: { current: { ...scenario, attackTime: 0, hurtTime: 0 } },
        isResultScreenActive: () => scenario.result,
        isSprintAllowed: () => true,
        platformer: undefined,
        paused: false,
      };
      new Function(...Object.keys(args), `return (${callback})();`)(...Object.values(args));
      assert.ok(
        scenario.frozen
          ? Object.values(movement).every((value) => !value)
          : Object.values(movement).some(Boolean),
        `Incorrect movement for ${JSON.stringify(scenario)}: ${JSON.stringify(movement)}`,
      );
    }
});

void test("backsteps preserve facing while directional rolls turn toward travel", () => {
  for (const backstep of [false, true]) {
    let movement: Record<string, boolean> = {};
    const args = {
      controllerRef: {
        current: {
          body: {},
          setMovement: (next: typeof movement) => {
            movement = next;
          },
        },
      },
      controlsRef: { current: {} },
      rollRef: { current: { active: true, backstep, dir: { x: 0, z: 1 } } },
      cameraYawRef: { current: 0 },
      combat: undefined,
      platformer: undefined,
      paused: false,
      isResultScreenActive: () => false,
    };
    // Executes the checked-in frame callback with an isolated character handle.
    // oxlint-disable-next-line typescript/no-implied-eval
    new Function(...Object.keys(args), `return (${callback})();`)(...Object.values(args));
    assert.equal(movement.preserveFacing, backstep);
    assert.equal(movement.backward, true);
    assert.equal(movement.jump, false);
  }
});
