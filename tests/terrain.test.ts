import assert from 'node:assert/strict';
import test from 'node:test';
import {
  FLAT_RADIUS,
  HUB_HALF,
  HUB_SEGS,
  PLAY_RADIUS,
  buildTerrainGrid,
  groundHeight,
  groundSlopeDeg,
  scatter,
  WATER_LEVEL,
  riverX,
  isDryLand,
} from '../gameplay/terrain.ts';

test('river and lakes have submerged beds and the island remains dry', () => {
  for (const z of [-95, -30, 10, 80, 100]) {
    assert.ok(groundHeight(riverX(z), z) < WATER_LEVEL);
  }
  assert.ok(groundHeight(27, -48) < WATER_LEVEL);
  assert.ok(groundHeight(66, 69) < WATER_LEVEL);
  assert.ok(isDryLand(66, 54));
  assert.ok(isDryLand(66, 46));
  assert.ok(isDryLand(riverX(10) - 11, 10));
  assert.ok(isDryLand(riverX(10) + 11, 10));
});

test('the clearing is dead flat', () => {
  for (const [x, z] of [
    [0, 0],
    [6, 0],
    [0, 6.4],
    [-10, -8],
    [10.5, 0],
    [0, -10.5],
    [8.3, 0],
  ]) {
    assert.equal(groundHeight(x, z), 0);
  }
  assert.ok(Math.hypot(10, 8) < FLAT_RADIUS + 1);
});

test('hills stay bounded and walkable inside the play radius', () => {
  let maxAbs = 0;
  let maxSlope = 0;
  for (let x = -PLAY_RADIUS; x <= PLAY_RADIUS; x += 2) {
    for (let z = -PLAY_RADIUS; z <= PLAY_RADIUS; z += 2) {
      if (Math.hypot(x, z) > PLAY_RADIUS) continue;
      maxAbs = Math.max(maxAbs, Math.abs(groundHeight(x, z)));
      maxSlope = Math.max(maxSlope, groundSlopeDeg(x, z));
    }
  }
  assert.ok(maxAbs < 3.2, `max |height| ${maxAbs}`);
  // Ecctrl climbs 50° slopes; stay far below for a relaxed walk.
  assert.ok(maxSlope < 30, `max slope ${maxSlope}°`);
});

test('the terrain grid is well-formed', () => {
  const grid = buildTerrainGrid();
  assert.equal(grid.count, (HUB_SEGS + 1) * (HUB_SEGS + 1));
  assert.equal(grid.vertices.length, grid.count * 3);
  assert.equal(grid.colors.length, grid.count * 3);
  assert.equal(grid.indices.length, HUB_SEGS * HUB_SEGS * 6);
  const maxIndex = grid.count - 1;
  for (const index of grid.indices) {
    assert.ok(index >= 0 && index <= maxIndex, `index ${index} in range`);
  }
  // Corners sit far outside the fog-heavy play area.
  assert.ok(HUB_HALF > PLAY_RADIUS);
  // Visual and physics share the array: first vertex matches the function.
  const x0 = -HUB_HALF;
  assert.equal(grid.vertices[1], groundHeight(x0, x0));
});

test('scatter stays in its annulus and on the ground', () => {
  const points = scatter(200, 6, 55, 7);
  assert.equal(points.length, 200);
  for (const p of points) {
    const r = Math.hypot(p.x, p.z);
    assert.ok(r >= 6 && r <= 55, `radius ${r}`);
    assert.equal(p.y, groundHeight(p.x, p.z));
  }
});
