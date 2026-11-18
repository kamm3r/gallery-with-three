// The proving grounds' combat arena: the realm's enemy simulation running on
// a flat fenced ring (collisionCourse.ts `parkArena`). Enemies keep inside
// the fence, path round the pillars, and lose sight of you behind them.
import { enemySpecs, type EnemyKind, type ParishPoint } from "./ashenParish.ts";
import { parkArena, parkZones } from "./collisionCourse.ts";
import type { ParishWorld } from "./parishEncounter.ts";

/** Which foes stand in the ring: one kind, or a mixed group. */
export type ArenaRoster = EnemyKind | "mixed";

export const ARENA_ROSTERS: Array<{ id: ArenaRoster; name: string }> = [
  { id: "mixed", name: "Mixed group" },
  ...(Object.keys(enemySpecs) as EnemyKind[]).map((kind) => ({
    id: kind,
    name: enemySpecs[kind].name,
  })),
];

const MIXED: EnemyKind[] = ["sentinel", "acolyte", "hound"];

export const arenaZoneIndex = parkZones.findIndex((zone) => zone.field === "Combat");
/** The arena zone's spawn; teleporting here also restocks the ring. */
export const arenaSpawn = parkZones[arenaZoneIndex].spawn;

const [CX, , CZ] = parkArena.center;
/** Enemies stop this far inside the fence. */
const INNER = parkArena.radius - 0.9;

/** Foes start on the far half of the ring, spread across it. */
export function arenaSpawns(roster: ArenaRoster): ParishWorld["spawns"] {
  const kinds = roster === "mixed" ? MIXED : [roster];
  return kinds.map((kind, i) => {
    const across = kinds.length === 1 ? 0 : (i / (kinds.length - 1) - 0.5) * 9;
    const position: ParishPoint = [CX + across, 0, CZ + 7 - Math.abs(across) * 0.3];
    return { id: `arena-${kind}-${i}`, kind, position, area: "arena" };
  });
}

function insideRing(x: number, z: number, margin = INNER) {
  return Math.hypot(x - CX, z - CZ) <= margin;
}

function blocked(x: number, _y: number, z: number, radius = 0) {
  return parkArena.pillars.some(
    ([px, pz]) => Math.hypot(x - px, z - pz) < parkArena.pillarRadius + radius,
  );
}

export function arenaWorld(roster: ArenaRoster): ParishWorld {
  return {
    campaign: false,
    spawns: arenaSpawns(roster),
    shrines: [
      { id: "refuge", name: "Arena gate", position: arenaSpawn, spawn: arenaSpawn },
      { id: "kiln", name: "Arena gate", position: arenaSpawn, spawn: arenaSpawn },
    ],
    floorHeight: (x, z) => (insideRing(x, z) ? 0 : null),
    blocked,
    // Sampled like the realm's rule: the line must stay over the ring floor and
    // clear of the pillars. A player outside the fence is out of reach.
    lineClear: (ax, az, bx, bz) => {
      const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 0.5));
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const x = ax + (bx - ax) * t,
          z = az + (bz - az) * t;
        if (!insideRing(x, z, parkArena.radius - 0.2) || blocked(x, 0, z)) return false;
      }
      return true;
    },
  };
}
