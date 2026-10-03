import assert from "node:assert/strict";
import test from "node:test";
import { existsSync } from "node:fs";
import { HUB_PORTALS, HUB_PAINTING_SCALE } from "../src/gameplay/hubPortals.ts";
import { groundHeight, isDryLand, PLAY_RADIUS } from "../src/gameplay/terrain.ts";
import { allowsGrass } from "../src/gameplay/grass.ts";

test("five distinct, larger paintings sit on dry land with clear approaches", () => {
  assert.equal(HUB_PORTALS.length, 5);
  assert.equal(new Set(HUB_PORTALS.map((p) => p.id)).size, 5);
  assert.ok(HUB_PAINTING_SCALE > 1);
  for (const portal of HUB_PORTALS) {
    assert.ok(isDryLand(portal.x, portal.z), portal.id);
    assert.ok(Math.hypot(portal.x, portal.z) < PLAY_RADIUS - 5);
    assert.equal(allowsGrass(portal.x, portal.z), false);
    assert.ok(existsSync(`public${portal.image}`));
    assert.ok(
      ["/gallery", "/playground", "/seasons", "/boss", "/warp"].includes(portal.destination),
    );
  }
  assert.equal(
    new Set(HUB_PORTALS.map((p) => p.destination)).size,
    5,
    "every painting leads somewhere new",
  );
});

test("painting footprints are flat terrain, including the face-up painting", () => {
  assert.equal(HUB_PORTALS.filter((p) => p.flat).length, 1);
  for (const p of HUB_PORTALS) {
    const y = groundHeight(p.x, p.z);
    for (const [dx, dz] of [
      [-4, 0],
      [4, 0],
      [0, -4],
      [0, 4],
    ])
      assert.equal(groundHeight(p.x + dx, p.z + dz), y);
  }
});
