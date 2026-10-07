import test from "node:test";
import assert from "node:assert/strict";
import { hubSpawn } from "../src/gameplay/hubSpawn.ts";
import { HUB_PORTALS } from "../src/gameplay/hubPortals.ts";
import { groundHeight } from "../src/gameplay/terrain.ts";

test("fresh visits and unknown return IDs use the main spawn", () => {
  assert.deepEqual(hubSpawn().position, [0, 0, 6]);
  assert.deepEqual(hubSpawn("unknown"), hubSpawn());
});

test("each level return starts on terrain in front of its source painting, facing away", () => {
  for (const portal of HUB_PORTALS) {
    const spawn = hubSpawn(portal.id);
    const [x, y, z] = spawn.position;
    assert.ok(
      Math.abs((x - portal.x) * Math.sin(portal.yaw) + (z - portal.z) * Math.cos(portal.yaw) - 9) <
        1e-9,
    );
    assert.equal(y, groundHeight(x, z) + 0.05);
    assert.equal(spawn.yaw, portal.yaw);
  }
});
