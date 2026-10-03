import assert from "node:assert/strict";
import test from "node:test";
import { DAY_LENGTH, daylightAt } from "../src/gameplay/daylight.ts";

test("the day/night cycle repeats smoothly and includes daylight and darkness", () => {
  assert.equal(daylightAt(DAY_LENGTH * 0.13).daylight, 1);
  assert.equal(daylightAt(DAY_LENGTH * 0.63).daylight, 0);
  for (let t = 0; t < DAY_LENGTH; t++) {
    const current = daylightAt(t);
    const next = daylightAt(t + 0.01);
    assert.ok(current.daylight >= 0 && current.daylight <= 1);
    assert.ok(current.sunset >= 0 && current.sunset <= 1);
    assert.ok(Math.abs(current.daylight - next.daylight) < 0.001);
    assert.ok(Math.abs(current.elevation - daylightAt(t + DAY_LENGTH).elevation) < 1e-12);
  }
});
