import assert from "node:assert/strict";

test("walkable banks are not ledges even when both proximity rays hit", () => {
  const bank = {
    grounded: false,
    verticalSpeed: -2,
    wallDist: 0.3,
    topHeight: 1.2,
    wallNormalY: 0.8,
    topNormalY: 0.8,
  };
  assert.equal(canGrabLedge(bank), false);
});
import { consumeRollPress } from "../src/gameplay/playerRules.ts";
import test from "node:test";
import {
  canEnterPortal,
  canGrabLedge,
  downhillSnapSpeed,
  DOWNHILL_SNAP_FEET,
  getGravityScale,
  shouldStartRoll,
  shouldStickToGround,
} from "../src/gameplay/playerRules.ts";

test("walking into a portal does not enter it", () => {
  assert.equal(canEnterPortal({ distance: 0.8, grounded: true, feetHeight: 0 }), false);
});

test("jumping into a portal enters it", () => {
  assert.equal(canEnterPortal({ distance: 0.8, grounded: false, feetHeight: 0.3 }), true);
});

test("portal entry still requires touching the artwork", () => {
  assert.equal(canEnterPortal({ distance: 1.4, grounded: false, feetHeight: 0.3 }), false);
});

test("releasing jump increases gravity while rising", () => {
  assert.ok(getGravityScale(4, false) > getGravityScale(4, true));
  assert.equal(getGravityScale(-1, true), 1);
});

test("falling against a ledge wall grabs it", () => {
  assert.equal(
    canGrabLedge({
      grounded: false,
      verticalSpeed: -2,
      wallDist: 0.6,
      topHeight: 1.0,
    }),
    true,
  );
});

test("ledge grab rejects bad states", () => {
  const grabbable = {
    grounded: false,
    verticalSpeed: -2,
    wallDist: 0.6,
    topHeight: 1.0,
  };
  assert.equal(canGrabLedge({ ...grabbable, grounded: true }), false);
  assert.equal(canGrabLedge({ ...grabbable, verticalSpeed: 0 }), false);
  assert.equal(canGrabLedge({ ...grabbable, wallDist: 2 }), false);
  assert.equal(canGrabLedge({ ...grabbable, topHeight: 0.1 }), false);
  assert.equal(canGrabLedge({ ...grabbable, topHeight: 2.5 }), false);
});

test("fresh roll press starts a roll when grounded and ready", () => {
  assert.equal(
    shouldStartRoll({
      grounded: true,
      rolling: false,
      cooldownRemaining: 0,
      rollPress: 1,
      lastRollPress: 0,
    }),
    true,
  );
});

test("roll does not trigger without a fresh press", () => {
  assert.equal(
    shouldStartRoll({
      grounded: true,
      rolling: false,
      cooldownRemaining: 0,
      rollPress: 1,
      lastRollPress: 1,
    }),
    false,
  );
});

test("roll does not trigger mid-air, while rolling, or on cooldown", () => {
  const base = {
    grounded: true,
    rolling: false,
    cooldownRemaining: 0,
    rollPress: 2,
    lastRollPress: 1,
  };
  assert.equal(shouldStartRoll({ ...base, grounded: false }), false);
  assert.equal(shouldStartRoll({ ...base, rolling: true }), false);
  assert.equal(shouldStartRoll({ ...base, cooldownRemaining: 0.5 }), false);
});

test("an unavailable roll press is consumed and cannot fire later", () => {
  for (const blocked of [{ cooldownRemaining: 0.5 }, { rolling: true }, { grounded: false }]) {
    const state = {
      grounded: true,
      rolling: false,
      cooldownRemaining: 0,
      rollPress: 2,
      lastRollPress: 1,
      ...blocked,
    };
    const consumed = consumeRollPress(state);
    assert.equal(consumed.start, false);
    const ready = {
      grounded: true,
      rolling: false,
      cooldownRemaining: 0,
      rollPress: 2,
      lastRollPress: consumed.lastPress,
    };
    assert.equal(consumeRollPress(ready).start, false);
    assert.equal(consumeRollPress({ ...ready, rollPress: 3 }).start, true);
  }
});

test("downhill snap sticks on the grounded-to-airborne edge over a step", () => {
  assert.equal(
    shouldStickToGround({
      wasGrounded: true,
      grounded: false,
      verticalSpeed: -1,
      moving: true,
      enabled: true,
      feetAboveGround: 0.48,
      groundNormalY: 1,
    }),
    true,
  );
});

test("downhill snap ignores steady states and real falls", () => {
  const runningOffEdge = {
    wasGrounded: true,
    grounded: false,
    verticalSpeed: -1,
    moving: true,
    enabled: true,
    feetAboveGround: 0.3,
    groundNormalY: 1,
  };
  assert.equal(shouldStickToGround({ ...runningOffEdge, grounded: true }), false);
  assert.equal(shouldStickToGround({ ...runningOffEdge, wasGrounded: false }), false);
  assert.equal(shouldStickToGround({ ...runningOffEdge, moving: false }), false);
  assert.equal(shouldStickToGround({ ...runningOffEdge, enabled: false }), false);
  assert.equal(shouldStickToGround({ ...runningOffEdge, verticalSpeed: 1 }), false);
  assert.equal(shouldStickToGround({ ...runningOffEdge, verticalSpeed: -12 }), false);
  assert.equal(shouldStickToGround({ ...runningOffEdge, feetAboveGround: null }), false);
  assert.equal(
    shouldStickToGround({ ...runningOffEdge, feetAboveGround: DOWNHILL_SNAP_FEET + 0.1 }),
    false,
  );
  assert.equal(shouldStickToGround({ ...runningOffEdge, groundNormalY: 0.2 }), false);
});

test("downhill snap speed sinks at least the minimum and accelerates", () => {
  assert.equal(downhillSnapSpeed(-0.5, 1 / 60), -3.5);
  assert.ok(downhillSnapSpeed(-4, 1 / 60) < -4);
});
