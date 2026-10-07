import assert from "node:assert/strict";
import test from "node:test";
import {
  createFrameTelemetry,
  recordFrame,
  summarizeFrames,
} from "../src/gameplay/frameTelemetry.ts";

void test("frame diagnostics expose an isolated stall even when most frames are smooth", () => {
  const frames = createFrameTelemetry();
  for (let i = 0; i < 99; i++) recordFrame(frames, 16, 4);
  recordFrame(frames, 300, 120);
  const summary = summarizeFrames(frames);
  assert.equal(summary.p95Ms, 16);
  assert.equal(summary.worstMs, 300);
  assert.equal(summary.over50Ms, 1);
  assert.equal(summary.advanceCpuMaxMs, 120);
  assert.ok(summary.fps > 50, "average FPS alone conceals a large stall");
});

void test("diagnostics remain bounded and expire old stalls without accepting background gaps", () => {
  const frames = createFrameTelemetry();
  const buffer = frames.intervals;
  recordFrame(frames, 500, 90);
  for (const invalid of [0, NaN, Infinity, 3000]) recordFrame(frames, invalid, 0);
  assert.equal(frames.count, 1);
  for (let i = 0; i < 1000; i++) recordFrame(frames, 20, 5);
  assert.equal(frames.intervals, buffer);
  assert.equal(frames.count, 360);
  assert.equal(summarizeFrames(frames).worstMs, 20);
});
