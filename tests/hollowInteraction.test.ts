import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import * as THREE from "three";
import * as rules from "../src/gameplay/hollowNight.ts";
import { HIDE_SPOTS, insideHouse } from "../src/gameplay/hollowLane.ts";

// Exercise the scene's actual input bridge, including its movement detection.
const source = ts.createSourceFile(
  "HollowLane.tsx",
  readFileSync(new URL("../src/components/HollowLane.tsx", import.meta.url), "utf8"),
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);
let callback = "";
function visit(node: ts.Node) {
  if (
    ts.isCallExpression(node) &&
    node.expression.getText(source) === "useFrame" &&
    node.arguments[0]?.getText(source).includes("stepNight(n, dt")
  )
    callback = node.arguments[0].getText(source);
  ts.forEachChild(node, visit);
}
visit(source);

void test("after a hit, releasing movement and pressing interact keeps the survivor hidden", () => {
  assert.ok(callback);
  const night = rules.createNight(() => 0.5);
  const at = { x: 0, z: 30 };
  Object.assign(night.killer, { mode: "attack", x: 0, z: 29, timer: 0, path: [] });
  const hit = rules.stepNight(night, 0.05, {
    ...at,
    moving: false,
    sprinting: false,
    interact: false,
    press: false,
  });
  assert.ok(hit.some((event) => event.type === "hit" && event.health === 1));
  const hedge = HIDE_SPOTS.find((spot) => spot.kind === "hedge")!;
  const controls = {
    forward: true,
    backward: false,
    left: false,
    right: false,
    run: true,
    interact: false,
    interactPress: 0,
  };
  const events: rules.NightEvent[] = [];
  const args = {
    ...rules,
    THREE,
    HIDE_SPOTS,
    insideHouse,
    night: { current: night },
    timers: {
      current: {
        next: Infinity,
        strike: -10,
        thunder: -1,
        heartbeat: 0,
        rummage: 0,
        interactPress: 0,
      },
    },
    motion: { current: { x: hedge.x - 0.4, z: hedge.z, speed: 8 } },
    world: { get: () => ({ ...hedge, valid: true }) },
    PlayerPosition: {},
    nightFx: { flash: 0, won: 0, danger: 0 },
    reducedMotion: false,
    sky: { uniforms: { uTime: {}, uWon: {}, uFlash: {} } },
    moonLight: { current: null },
    skyLight: { current: null },
    scene: {},
    cameraRig: {},
    heldControls: () => controls,
    isOn: () => false,
    setSprintAllowed: () => {},
    setChase: () => {},
    playSound: () => {},
    laneSignals: {},
    promptFor: () => "",
    DANGER_RANGE: 24,
    onEvent: (event: rules.NightEvent) => events.push(event),
  };
  // oxlint-disable-next-line typescript/no-implied-eval
  const frame = new Function(
    ...Object.keys(args),
    ts.transpile(`const frame = ${callback};`) + "return frame;",
  )(...Object.values(args));
  const state = { clock: { elapsedTime: 0 } };
  frame(state, 0.05);
  controls.forward = false;
  controls.run = false;
  controls.interact = true;
  controls.interactPress++;
  frame(state, 0.05);
  assert.equal(night.survivor.hidden, true, "interact must hide an injured survivor");
  controls.interact = false;
  frame(state, 0.05);
  assert.equal(night.survivor.hidden, true, "residual movement must not cancel hiding");
  assert.equal(
    events.some((event) => event.type === "unhidden"),
    false,
  );
  controls.forward = true;
  frame(state, 0.05);
  assert.equal(night.survivor.hidden, false, "deliberately moving must still leave hiding");
});
