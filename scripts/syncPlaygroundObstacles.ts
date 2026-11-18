// Regenerates src/gameplay/playgroundObstacles.json from the course generators
// in collisionCourse.ts. Pieces keep their IDs while their zone / structure /
// name stays the same, so editor overrides follow them. Legacy (version-1)
// targets that no longer exist are recorded as retired.
//
//   vpx scripts/syncPlaygroundObstacles.ts           # write
//   vpx scripts/syncPlaygroundObstacles.ts --check   # fail if out of date
import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { parkStatics } from "../src/gameplay/collisionCourse.ts";
import { legacyObstacleIds, retiredObstacleIds } from "../src/gameplay/legacyObstacleIds.ts";

const obstaclesPath = new URL("../src/gameplay/playgroundObstacles.json", import.meta.url);
const legacyPath = new URL("../src/gameplay/legacyObstacleIds.ts", import.meta.url);
const check = process.argv.includes("--check");

type Entry = { id: string; zone: string; part?: string; name: string };
const keyOf = (o: { zone: string; part?: string; name: string }) =>
  `${o.zone}|${o.part ?? ""}|${o.name}`;

const previous = JSON.parse(readFileSync(obstaclesPath, "utf8")) as Entry[];
const idByKey = new Map(previous.map((o) => [keyOf(o), o.id]));
const round = (values: number[]) => values.map((v) => Math.round(v * 1e6) / 1e6);

const seen = new Set<string>();
const next = parkStatics.map((o) => {
  const key = keyOf(o);
  if (seen.has(key)) throw new Error(`Duplicate course piece: ${key}`);
  seen.add(key);
  return {
    id: idByKey.get(key) ?? `obstacle-${randomUUID()}`,
    zone: o.zone,
    ...(o.part ? { part: o.part } : {}),
    name: o.name,
    shape: o.shape,
    position: round(o.position),
    size: round(o.size),
    color: o.color,
    ...(o.rotation ? { rotation: round(o.rotation) } : {}),
  };
});

const live = new Set(next.map((o) => o.id));
const retired = [
  ...new Set([
    ...[...retiredObstacleIds].filter((id) => !live.has(id)),
    ...Object.values(legacyObstacleIds).filter((id) => !live.has(id)),
  ]),
].sort();

const json = JSON.stringify(next, null, 2) + "\n";
const legacySource = readFileSync(legacyPath, "utf8");
const retiredBlock = `export const retiredObstacleIds: ReadonlySet<string> = new Set([\n${retired
  .map((id) => `  "${id}",\n`)
  .join("")}]);\n`;
const legacyNext = legacySource.replace(
  /export const retiredObstacleIds[\s\S]*?\]\);\n/,
  retiredBlock,
);

const reused = next.filter((o) => idByKey.has(keyOf(o))).length;
// Compare data, not text: the formatter reflows both files after a write.
const stale =
  JSON.stringify(next) !== JSON.stringify(JSON.parse(readFileSync(obstaclesPath, "utf8"))) ||
  retired.join() !== [...retiredObstacleIds].sort().join();
if (check) {
  if (stale) {
    console.error(
      "playgroundObstacles.json is out of date: run vpx scripts/syncPlaygroundObstacles.ts",
    );
    process.exit(1);
  }
  console.log("playgroundObstacles.json is up to date");
} else {
  writeFileSync(obstaclesPath, json);
  writeFileSync(legacyPath, legacyNext);
  console.log(
    `${next.length} pieces: ${reused} kept their IDs, ${next.length - reused} new, ` +
      `${previous.length - reused} removed; ${retired.length} retired legacy IDs`,
  );
}
