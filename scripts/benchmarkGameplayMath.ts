import { performance } from "node:perf_hooks";
import { readFileSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { stepPlanarVelocity, MOVEMENT_DEFAULTS } from "../src/gameplay/movement.ts";
import { vec3 } from "math";
import { freeCameraMovement } from "../src/gameplay/freeCamera.ts";

// The comparison baseline returns a Three.js Vector3; the current code returns a tuple.
const sumComponents = (v: ArrayLike<number> | { x: number; y: number; z: number }) =>
  "x" in v ? v.x + v.y + v.z : v[0] + v[1] + v[2];
import { groundHeight } from "../src/gameplay/terrain.ts";
import { rollSpeedAt, rollPeakFor } from "../src/gameplay/playerRules.ts";
import { createCameraArm, stepCameraArm } from "../src/gameplay/combatCamera.ts";

const { values } = parseArgs({
  options: { output: { type: "string" }, label: { type: "string" }, baseline: { type: "string" } },
});
const keys = [
  new Set(["KeyW"]),
  new Set(["KeyW", "KeyD", "KeyE"]),
  new Set(["KeyQ", "ControlLeft"]),
  new Set<string>(),
];
const directions = Array.from({ length: 64 }, (_, i) => ({ x: Math.sin(i), z: Math.cos(i) }));
const workloads = [
  {
    name: "planar movement",
    iterations: 200_000,
    run(this: void, count: number) {
      const velocity = { x: 0, z: 0 };
      const step = {
        wish: directions[0],
        maxSpeed: 4.8,
        grounded: true,
        skidding: false,
        dt: 1 / 60,
      };
      let checksum = 0;
      for (let i = 0; i < count; i++) {
        step.wish = directions[(i >> 5) & 63];
        step.grounded = i % 120 < 80;
        step.maxSpeed = i % 240 < 120 ? 4.8 : 7.5;
        step.skidding = stepPlanarVelocity(velocity, step, MOVEMENT_DEFAULTS);
        checksum += velocity.x + velocity.z;
      }
      return checksum;
    },
  },
  {
    name: "free camera",
    iterations: 200_000,
    run(this: void, count: number) {
      let checksum = 0;
      const out = vec3.create();
      for (let i = 0; i < count; i++) {
        const v = freeCameraMovement(
          keys[i & 3],
          (i % 628) / 100,
          (i % 100) / 100 - 0.5,
          12,
          1 / 60,
          out,
        );
        checksum += sumComponents(v);
      }
      return checksum;
    },
  },
  {
    name: "terrain sampling",
    iterations: 100_000,
    run(this: void, count: number) {
      let checksum = 0;
      for (let i = 0; i < count; i++)
        checksum += groundHeight((i % 241) - 120, ((i * 73) % 241) - 120);
      return checksum;
    },
  },
  {
    name: "dodge speed",
    iterations: 500_000,
    run(this: void, count: number) {
      let checksum = 0;
      for (let i = 0; i < count; i++)
        checksum += rollSpeedAt(rollPeakFor(4.5, 0.92), (i % 120) / 100, 0.92);
      return checksum;
    },
  },
  {
    name: "camera recovery",
    iterations: 500_000,
    run(this: void, count: number) {
      const arm = createCameraArm(6);
      let checksum = 0;
      for (let i = 0; i < count; i++) checksum += stepCameraArm(arm, i % 120 < 20 ? 2 : 6, 1 / 60);
      return checksum;
    },
  },
];
const results = workloads.map(({ name, iterations, run }) => {
  for (let i = 0; i < 5; i++) run(iterations);
  const samplesMs: number[] = [];
  let checksum = 0;
  for (let i = 0; i < 15; i++) {
    const start = performance.now();
    checksum = run(iterations);
    samplesMs.push(performance.now() - start);
  }
  const sorted = [...samplesMs].sort((a, b) => a - b);
  return {
    name,
    iterations,
    checksum,
    medianMs: sorted[7],
    minMs: sorted[0],
    maxMs: sorted[14],
    samplesMs,
  };
});
const report = {
  label: values.label ?? "current",
  node: process.version,
  platform: process.platform,
  arch: process.arch,
  date: new Date().toISOString(),
  warmups: 5,
  samples: 15,
  results,
};
if (values.output) writeFileSync(values.output, `${JSON.stringify(report, null, 2)}\n`);
console.table(
  results.map(({ name, iterations, medianMs, checksum }) => ({
    name,
    iterations,
    medianMs,
    checksum,
  })),
);

if (values.baseline) {
  const before = JSON.parse(readFileSync(values.baseline, "utf8")) as typeof report;
  if (
    before.node !== report.node ||
    before.platform !== report.platform ||
    before.arch !== report.arch
  )
    throw new Error("Baseline runtime differs; recapture the baseline on this machine.");
  console.table(
    results.map((result) => {
      const prior = before.results.find((item) => item.name === result.name);
      if (!prior || prior.iterations !== result.iterations)
        throw new Error(`Workload mismatch: ${result.name}`);
      if (
        Math.abs(prior.checksum - result.checksum) >
        1e-10 * Math.max(1, Math.abs(prior.checksum))
      )
        throw new Error(`Behavior checksum changed: ${result.name}`);
      return {
        name: result.name,
        beforeMs: prior.medianMs,
        afterMs: result.medianMs,
        changePercent: (result.medianMs / prior.medianMs - 1) * 100,
      };
    }),
  );
}
