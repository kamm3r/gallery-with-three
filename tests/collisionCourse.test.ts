import assert from "node:assert/strict";
import test from "node:test";
import {
  BRIDGE_PITCH,
  CEILING_CLEARANCES,
  GRATE_GAPS,
  SLOPE_LIMIT_DEG,
  VALLEY_ANGLES,
  parkBridge,
  parkFunnel,
  parkStatics,
  parkZones,
} from "../src/gameplay/collisionCourse.ts";

// Capsule from ThirdPersonPlayer: radius 0.42.
const CAPSULE_DIAMETER = 0.84;

test("funnel wedges the capsule: walk-in entry, impassable exit", () => {
  const entryGap = parkFunnel.entryHalfWidth * 2;
  const exitGap = parkFunnel.exitHalfWidth * 2;
  assert.ok(entryGap > CAPSULE_DIAMETER);
  assert.ok(exitGap < CAPSULE_DIAMETER);
  assert.ok(parkFunnel.entryZ - parkFunnel.exitZ >= 12);
});

test("funnel registers two mirrored walls around the lane center", () => {
  const walls = parkStatics.filter((o) => o.shape === "box" && o.color === parkFunnel.color);
  assert.equal(walls.length, 2);
  const [a, b] = walls;
  assert.ok(Math.abs(a.position[0] + b.position[0] - 2 * parkFunnel.centerX) < 1e-9);
  assert.ok(Math.abs(a.rotation![1] + b.rotation![1]) < 1e-9);
  assert.ok(a.rotation![1] !== 0);
});

test("funnel sits clear of the slope lanes", () => {
  const rightmost = parkFunnel.centerX + parkFunnel.entryHalfWidth + parkFunnel.wallThickness;
  assert.ok(rightmost < -28.5);
});

test("zone spawns stand on open floor inside the player bounds", () => {
  for (const zone of parkZones) {
    const [x, , z] = zone.spawn;
    assert.ok(Math.abs(x) < 78 && Math.abs(z) < 78, zone.name);
    for (const o of parkStatics) {
      // Footprint box; yawed pieces get their widest side on both axes.
      const yawed = Boolean(o.rotation?.[1]);
      const hx = (yawed ? Math.max(o.size[0], o.size[2]) : o.size[0]) / 2;
      const hz = (yawed ? Math.max(o.size[0], o.size[2]) : o.size[2]) / 2;
      const clear =
        Math.abs(o.position[0] - x) > hx + CAPSULE_DIAMETER / 2 ||
        Math.abs(o.position[2] - z) > hz + CAPSULE_DIAMETER / 2;
      assert.ok(clear, `${zone.name} overlaps a static`);
    }
  }
});

test("stress lanes bracket the controller limits", () => {
  const standing = CAPSULE_DIAMETER + 1 + 0.2;
  assert.ok(CEILING_CLEARANCES.some((c) => c > standing));
  assert.ok(CEILING_CLEARANCES.some((c) => c < standing));
  assert.ok(VALLEY_ANGLES.some((a) => a < SLOPE_LIMIT_DEG));
  assert.ok(VALLEY_ANGLES.some((a) => a > SLOPE_LIMIT_DEG));
  assert.ok(GRATE_GAPS.some((g) => g < CAPSULE_DIAMETER));
  assert.ok(GRATE_GAPS.some((g) => g > CAPSULE_DIAMETER));
});

test("bridge planks span the deck gap with a small seam", () => {
  assert.ok(BRIDGE_PITCH > parkBridge.plankSize[2]);
  assert.ok(BRIDGE_PITCH - parkBridge.plankSize[2] < 0.1);
});
