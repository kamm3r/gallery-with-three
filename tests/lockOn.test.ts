import test from "node:test";
import assert from "node:assert/strict";
import {
  LOCK_BREAK,
  LOCK_RANGE,
  dampAngle,
  lockCameraYaw,
  lockFacingYaw,
  lockHolds,
  pickLockTarget,
  switchLockTarget,
} from "../src/gameplay/lockOn.ts";

// Camera yaw 0 looks along -Z (forward is (-sin, -cos)).
void test("lock-on picks the target nearest the centre of view, within range and height", () => {
  const ahead = { id: "ahead", x: 0, y: 0, z: -8 },
    nearSide = { id: "side", x: 5, y: 0, z: -2 },
    behind = { id: "behind", x: 0, y: 0, z: 3 },
    far = { id: "far", x: 0, y: 0, z: -(LOCK_RANGE + 1) },
    above = { id: "above", x: 0, y: 9, z: -4 };
  assert.equal(pickLockTarget([nearSide, ahead, behind, far, above], 0, 0, 0, 0)?.id, "ahead");
  assert.equal(pickLockTarget([behind, far, above], 0, 0, 0, 0), null);
  // Turning the camera around brings the one behind into view.
  assert.equal(pickLockTarget([ahead, behind], 0, 0, 0, Math.PI)?.id, "behind");
});

void test("a lock breaks with distance or a lost target, and aims camera and body at it", () => {
  const t = { id: "t", x: 3, y: 0, z: -4 };
  assert.equal(lockHolds(t, 0, 0, 0), true);
  assert.equal(lockHolds(undefined, 0, 0, 0), false);
  assert.equal(lockHolds({ ...t, z: -(LOCK_BREAK + 1) }, 0, 0, 0), false);
  const camera = lockCameraYaw(t, 0, 0),
    facing = lockFacingYaw(t, 0, 0);
  assert.ok(Math.abs(-Math.sin(camera) - 0.6) < 1e-9 && Math.abs(-Math.cos(camera) + 0.8) < 1e-9);
  assert.ok(Math.abs(Math.sin(facing) - 0.6) < 1e-9 && Math.abs(Math.cos(facing) + 0.8) < 1e-9);
  // Easing takes the short way across ±π.
  const eased = dampAngle(Math.PI - 0.1, -Math.PI + 0.1, 100, 1);
  assert.ok(Math.abs(Math.sin(eased) - Math.sin(-Math.PI + 0.1)) < 1e-6);
});

void test("a flick moves the lock to the nearest target on that side, and skips hidden ones", () => {
  // Looking along -Z: x > 0 is to the right of the view.
  const centre = { id: "centre", x: 0, y: 0, z: -8 },
    right = { id: "right", x: 4, y: 0, z: -8 },
    farRight = { id: "far-right", x: 9, y: 0, z: -6 },
    left = { id: "left", x: -5, y: 0, z: -8 };
  const all = [centre, right, farRight, left];
  assert.equal(switchLockTarget(all, "centre", 0, 0, 0, 0, 1)?.id, "right");
  assert.equal(switchLockTarget(all, "centre", 0, 0, 0, 0, -1)?.id, "left");
  assert.equal(switchLockTarget(all, "right", 0, 0, 0, 0, 1)?.id, "far-right");
  assert.equal(switchLockTarget(all, "far-right", 0, 0, 0, 0, 1), null);
  assert.equal(
    switchLockTarget(all, "centre", 0, 0, 0, 0, 1, (t) => t.id !== "right")?.id,
    "far-right",
  );
  // Line of sight also gates the first pick.
  assert.equal(pickLockTarget(all, 0, 0, 0, 0, (t) => t.id !== "centre")?.id, "right");
});
