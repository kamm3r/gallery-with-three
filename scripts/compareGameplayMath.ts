import { execFileSync } from "node:child_process";
import {
  cpSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";

const { values } = parseArgs({
  options: {
    ref: { type: "string", default: "HEAD" },
    output: { type: "string", default: "docs/benchmarks/math-comparison.json" },
  },
});
const root = resolve(import.meta.dirname, "..");
const ref = execFileSync("git", ["rev-parse", "--verify", `${values.ref}^{commit}`], {
  cwd: root,
  encoding: "utf8",
}).trim();
const temporary = mkdtempSync(join(tmpdir(), "gallery-math-"));
type Run = {
  node: string;
  platform: string;
  arch: string;
  results: Array<{
    name: string;
    iterations: number;
    checksum: number;
    medianMs: number;
    samplesMs: number[];
  }>;
};
try {
  mkdirSync(join(temporary, "src/gameplay"), { recursive: true });
  mkdirSync(join(temporary, "scripts"));
  writeFileSync(join(temporary, "package.json"), '{"type":"module"}');
  symlinkSync(join(root, "node_modules"), join(temporary, "node_modules"), "dir");
  for (const file of [
    "movement",
    "freeCamera",
    "terrain",
    "hubPortals",
    "playerRules",
    "combatCamera",
  ])
    writeFileSync(
      join(temporary, `src/gameplay/${file}.ts`),
      execFileSync("git", ["show", `${ref}:src/gameplay/${file}.ts`], { cwd: root }),
    );
  cpSync(
    join(root, "scripts/benchmarkGameplayMath.ts"),
    join(temporary, "scripts/benchmarkGameplayMath.ts"),
  );
  const runs: { before: Run[]; after: Run[] } = { before: [], after: [] };
  for (let round = 0; round < 5; round++) {
    for (const label of round % 2
      ? (["after", "before"] as const)
      : (["before", "after"] as const)) {
      const cwd = label === "before" ? temporary : root;
      const output = join(temporary, `${label}-${round}.json`);
      execFileSync(
        process.execPath,
        [
          "--experimental-strip-types",
          join(cwd, "scripts/benchmarkGameplayMath.ts"),
          "--label",
          label,
          "--output",
          output,
        ],
        { cwd, stdio: "pipe" },
      );
      runs[label].push(JSON.parse(readFileSync(output, "utf8")) as Run);
    }
  }
  const median = (numbers: number[]) =>
    [...numbers].sort((a, b) => a - b)[Math.floor(numbers.length / 2)];
  const comparisons = runs.before[0].results.map((original, index) => {
    const before = runs.before.map((run) => run.results[index]);
    const after = runs.after.map((run) => run.results[index]);
    for (const result of [...before, ...after]) {
      if (result.name !== original.name || result.iterations !== original.iterations)
        throw new Error("Workloads differ");
      if (
        Math.abs(result.checksum - original.checksum) >
        1e-10 * Math.max(1, Math.abs(original.checksum))
      )
        throw new Error(`Behavior changed: ${original.name}`);
    }
    const beforeMs = median(before.map((result) => result.medianMs));
    const afterMs = median(after.map((result) => result.medianMs));
    return {
      name: original.name,
      iterations: original.iterations,
      beforeMs,
      afterMs,
      changePercent: (afterMs / beforeMs - 1) * 100,
      checksumMatches: true,
    };
  });
  const report = {
    baselineCommit: ref,
    math: "0.1.0",
    date: new Date().toISOString(),
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    rounds: 5,
    method:
      "Alternating process order; median of five process medians; each process uses five warmups and fifteen timed samples per workload",
    comparisons,
    runs,
  };
  writeFileSync(resolve(root, values.output!), `${JSON.stringify(report, null, 2)}\n`);
  console.table(comparisons);
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
