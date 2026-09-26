import assert from "node:assert/strict";
import test from "node:test";
import {
  GRASS_HEIGHT,
  allowsGrass,
  createGrassPatch,
  grassHeightScale,
} from "../src/gameplay/grass.ts";
import { groundHeight } from "../src/gameplay/terrain.ts";

test("grass leaves spawn, paths, and portal gardens clear", () => {
  for (const [x, z] of [
    [0, 6],
    [-6, 4],
    [-15, -3],
    [-32, -14],
    [-28, 102],
    [125, 0],
  ]) {
    assert.equal(allowsGrass(x, z), false);
  }
  assert.equal(allowsGrass(-5, 5), false);
  assert.equal(allowsGrass(-5, -5), true);
});

test("grass patches are reproducible, grounded, and stay within their chunk", () => {
  const blades = createGrassPatch(-3, 2, 12);
  assert.ok(blades.length > 500);
  assert.deepEqual(blades, createGrassPatch(-3, 2, 12));
  for (const blade of blades) {
    assert.ok(blade.x >= -30 && blade.x < -20);
    assert.ok(blade.z >= 20 && blade.z < 30);
    assert.equal(blade.y, groundHeight(blade.x, blade.z) - 0.025);
    const scale = grassHeightScale(blade.x, blade.z);
    assert.ok(scale >= 0.3 && scale <= 1);
    assert.ok(
      blade.height >= GRASS_HEIGHT * 0.75 * scale - 1e-9 &&
        blade.height <= GRASS_HEIGHT * 1.5 * scale + 1e-9,
    );
  }
});
