import test from "node:test";
import assert from "node:assert/strict";
import { freeCameraMovement } from "../src/gameplay/freeCamera.ts";

void test("free camera flies in its viewing direction and strafes at a constant diagonal speed", () => {
  const forward = freeCameraMovement(new Set(["KeyW"]), Math.PI / 2, Math.PI / 6, 12, 1 / 60);
  assert.ok(Math.abs(forward.x + Math.cos(Math.PI / 6) * 0.2) < 1e-6);
  assert.ok(Math.abs(forward.y - 0.1) < 1e-6);
  assert.ok(Math.abs(forward.z) < 1e-6);
  assert.ok(
    Math.abs(
      freeCameraMovement(new Set(["KeyW", "KeyD", "KeyE"]), 0, 0, 12, 1 / 60).length() - 0.2,
    ) < 1e-6,
  );
});

void test("free camera elevation is world vertical and fine control takes precedence over boost", () => {
  const down = freeCameraMovement(new Set(["KeyQ"]), 1, 1, 12, 1 / 60);
  assert.ok(Math.abs(down.x) < 1e-8 && Math.abs(down.y + 0.2) < 1e-8 && Math.abs(down.z) < 1e-8);
  assert.ok(
    Math.abs(freeCameraMovement(new Set(["KeyW", "ShiftLeft"]), 0, 0, 12, 1 / 60).length() - 0.8) <
      1e-6,
  );
  assert.ok(
    Math.abs(
      freeCameraMovement(new Set(["KeyW", "ShiftLeft", "ControlLeft"]), 0, 0, 12, 1 / 60).length() -
        0.04,
    ) < 1e-6,
  );
  assert.equal(freeCameraMovement(new Set(["KeyW", "KeyS"]), 0, 0, 12, 1 / 60).length(), 0);
});

void test("free camera travel is independent of frame rate and caps background time jumps", () => {
  for (const hz of [30, 60, 144]) {
    let distance = 0;
    for (let i = 0; i < hz; i++)
      distance += freeCameraMovement(new Set(["KeyW"]), 0, 0, 12, 1 / hz).length();
    assert.ok(Math.abs(distance - 12) < 1e-8);
  }
  assert.ok(Math.abs(freeCameraMovement(new Set(["KeyW"]), 0, 0, 12, 10).length() - 0.6) < 1e-8);
});
