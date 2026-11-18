import { test } from "vite-plus/test";
import assert from "node:assert/strict";
import {
  canCoyoteJump,
  canEnterPortal,
  canGrabLedge,
  consumeRollPress,
  getGravityScale,
  JUMP_DEFAULTS,
} from "../src/gameplay/playerRules.ts";

test("portal entry requires an airborne player touching the artwork", () => {
  assert.equal(canEnterPortal({ distance: 0.8, grounded: false, feetHeight: 0.3 }), true);
  assert.equal(canEnterPortal({ distance: 0.8, grounded: true, feetHeight: 0 }), false);
  assert.equal(canEnterPortal({ distance: 1.4, grounded: false, feetHeight: 0.3 }), false);
});

test("jump release cuts player jumps while launch pads retain height", () => {
  assert.ok(getGravityScale(4, false, true) > getGravityScale(4, true, true));
  assert.equal(getGravityScale(12, false, false), JUMP_DEFAULTS.riseGravity);
  const edge = { airTime: 0.05, jumping: false, verticalSpeed: -1 };
  assert.equal(canCoyoteJump(edge), true);
  assert.equal(canCoyoteJump({ ...edge, airTime: JUMP_DEFAULTS.coyoteTime + 0.01 }), false);
  assert.equal(canCoyoteJump({ ...edge, jumping: true }), false);
});

test("ledge grabs reject walkable banks and grounded players", () => {
  const ledge = { grounded: false, verticalSpeed: -2, wallDist: 0.3, topHeight: 1.2 };
  assert.equal(canGrabLedge(ledge), true);
  assert.equal(canGrabLedge({ ...ledge, grounded: true }), false);
  assert.equal(canGrabLedge({ ...ledge, wallNormalY: 0.8, topNormalY: 0.8 }), false);
});

test("blocked dodge presses are consumed instead of firing later", () => {
  const ready = {
    grounded: true,
    rolling: false,
    cooldownRemaining: 0,
    rollPress: 2,
    lastRollPress: 1,
  };
  for (const blocked of [{ cooldownRemaining: 0.5 }, { rolling: true }, { grounded: false }]) {
    const consumed = consumeRollPress({ ...ready, ...blocked });
    assert.equal(consumed.start, false);
    assert.equal(consumeRollPress({ ...ready, lastRollPress: consumed.lastPress }).start, false);
    assert.equal(
      consumeRollPress({ ...ready, lastRollPress: consumed.lastPress, rollPress: 3 }).start,
      true,
    );
  }
});
