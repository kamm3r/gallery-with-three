import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import {
  bakeHeightField,
  buildHeightTexture,
  sharedHeightTexture,
} from "../src/gameplay/heightmap.ts";
import { groundHeight } from "../src/gameplay/terrain.ts";

test("baked height fields are reproducible and match the terrain", () => {
  const field = bakeHeightField(9, 280);
  assert.deepEqual(field, bakeHeightField(9, 280));
  assert.equal(field.heights.length, 81);
  for (const [i, j] of [
    [0, 0],
    [4, 4],
    [8, 8],
    [2, 6],
  ]) {
    const x = -140 + (i / 8) * 280;
    const z = 140 - (j / 8) * 280;
    assert.ok(Math.abs(field.heights[j * 9 + i] - groundHeight(x, z)) < 1e-6);
  }
});

test("height texture packs meters as R half floats", () => {
  const field = bakeHeightField(8, 280);
  const texture = buildHeightTexture(field);
  assert.equal(texture.image.width, 8);
  assert.equal(texture.format, THREE.RedFormat);
  assert.equal(texture.type, THREE.HalfFloatType);
  const data = texture.image.data as Uint16Array;
  assert.equal(data.length, 64);
  for (let k = 0; k < 64; k++) {
    assert.ok(Math.abs(THREE.DataUtils.fromHalfFloat(data[k]) - field.heights[k]) < 0.01);
  }
  texture.dispose();
});

test("shared height texture is a singleton", () => {
  assert.equal(sharedHeightTexture(), sharedHeightTexture());
});
