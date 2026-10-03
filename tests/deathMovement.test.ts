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

test("death suppresses held movement and an active roll in the real frame callback", () => {
  assert.ok(callback);
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
      combat: { current: { health: 0, bossHealth: 300, attackTime: 0 } },
      platformer: undefined,
      paused: false,
    };
    new Function(...Object.keys(args), `return (${callback})();`)(...Object.values(args));
    assert.ok(
      Object.values(movement).every((value) => !value),
      `Dead player received movement: ${JSON.stringify(movement)}`,
    );
  }
});
