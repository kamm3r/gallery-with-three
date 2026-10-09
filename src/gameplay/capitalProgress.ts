import {
  capitalBosses,
  capitalBeacon,
  capitalNpcs,
  capitalTownGate,
  capitalCaches,
  capitalLifts,
  capitalShrines,
  capitalShortcut,
  capitalCathedralShortcut,
  type CapitalBossId,
  type CapitalLiftId,
} from "./capitalLayout.ts";
import { createEncounter } from "./bossEncounter.ts";
import { combatTuning } from "./combatTuning.ts";
import type { ParishProgress } from "./ashenParish.ts";
import type { ParishEncounter } from "./parishEncounter.ts";

export type CapitalLiftState = { y: number; target: number };
export const newCapitalLiftStates = () => ({
  beacon: { y: 24, target: 24 },
  arena: { y: 24, target: 24 },
  town: { y: 8, target: 8 },
});
export type CapitalLiftsState = ReturnType<typeof newCapitalLiftStates>;
export function stepCapitalLift(state: CapitalLiftState, delta: number) {
  const step = 3 * Math.max(0, Math.min(delta, 0.05));
  state.y += Math.sign(state.target - state.y) * Math.min(Math.abs(state.target - state.y), step);
}
export function requestCapitalLift(
  id: CapitalLiftId,
  y: number,
  progress: ParishProgress,
  lifts: CapitalLiftsState,
) {
  const spec = capitalLifts.find((l) => l.id === id)!;
  const atTop = Math.abs(y - spec.high) < 1.5;
  const atBottom = Math.abs(y - spec.low) < 1.5;
  if (!atTop && !atBottom) return false;
  const key = id === "beacon" ? "beaconLift" : id === "arena" ? "arenaLift" : "townLift";
  const unlocked = progress[key];
  if (!unlocked) {
    if (!atBottom || !(id === "town" ? progress.caches.includes("town-key") : progress.fogCleared))
      return false;
    progress[key] = true;
  }
  const here = atTop ? spec.high : spec.low;
  const platform = lifts[id];
  platform.target = Math.abs(platform.y - here) < 0.08 ? (atTop ? spec.low : spec.high) : here;
  return true;
}
export type CapitalInteraction =
  | { kind: "switch"; id: "beacon"; prompt: string; available: boolean }
  | { kind: "talk"; id: string; prompt: string; available: boolean }
  | { kind: "town-lock"; id: "town-key"; prompt: string; available: false }
  | { kind: "shrine"; id: "refuge" | "kiln"; prompt: string; available: boolean }
  | { kind: "cache"; id: string; prompt: string; available: boolean }
  | { kind: "boss"; id: CapitalBossId; prompt: string; available: boolean }
  | { kind: "lift"; id: CapitalLiftId; prompt: string; available: boolean }
  | { kind: "gate"; id: "refuge" | "court"; prompt: string; available: boolean };
export function capitalInteraction(
  x: number,
  y: number,
  z: number,
  p: ParishProgress,
  threatened: boolean,
  bossActive: boolean,
): CapitalInteraction | null {
  const near = (point: [number, number, number], radius: number) =>
    Math.hypot(x - point[0], z - point[2]) < radius && Math.abs(y - point[1]) < 1.5;
  if (!p.fogCleared && near(capitalBeacon.position, 3))
    return {
      kind: "switch",
      id: "beacon",
      available: p.cathedralFelled && !bossActive && !threatened,
      prompt: p.cathedralFelled
        ? "E · Light the crown beacon · reveal the lower city"
        : "The oratory keeper guards the beacon",
    };
  if (!p.caches.includes("town-key") && near(capitalTownGate.position, 3))
    return {
      kind: "town-lock",
      id: "town-key",
      available: false,
      prompt: "Locked · find the mountain passage key in the lower town",
    };
  if (!p.court && near(capitalCathedralShortcut.position, 4)) {
    const inside = z < capitalCathedralShortcut.position[2] - 0.25;
    return {
      kind: "gate",
      id: "court",
      available: inside && !threatened && !bossActive,
      prompt: inside
        ? threatened || bossActive
          ? "Clear the cathedral watch"
          : "E · Unbar the cathedral return to the chapel"
        : "Barred within · follow the western exterior to the galleries",
    };
  }
  for (const npc of capitalNpcs)
    if (near(npc.position, 2.8))
      return {
        kind: "talk",
        id: npc.id,
        available: !threatened && !bossActive,
        prompt: threatened ? "Clear the nearby watch" : `E · Speak with ${npc.name}`,
      };
  if (!p.refuge && near(capitalShortcut.position, 4)) {
    const side =
      (x - capitalShortcut.position[0]) * Math.sin(capitalShortcut.yaw) +
      (z - capitalShortcut.position[2]) * Math.cos(capitalShortcut.yaw);
    return {
      kind: "gate",
      id: "refuge",
      available: side < -0.25 && !threatened && !bossActive,
      prompt:
        side < -0.25
          ? threatened
            ? "Clear the town watch"
            : "E · Open the city-wall return"
          : "Barred from the town side",
    };
  }
  for (const s of capitalShrines)
    if (near(s.position, 3.4))
      return {
        kind: "shrine",
        id: s.id,
        available: !threatened && !bossActive,
        prompt:
          threatened || bossActive ? "Cannot rest while danger is near" : `E · Rest at ${s.name}`,
      };
  for (const cache of capitalCaches)
    if (!p.caches.includes(cache.id) && near(cache.position, 2.6))
      return {
        kind: "cache",
        id: cache.id,
        available: !threatened && !bossActive,
        prompt: threatened ? "Clear the nearby watch" : `E · Take ${cache.name}`,
      };
  for (const lift of capitalLifts) {
    if (
      near(lift.upper, 4) ||
      near(lift.lower, 4) ||
      Math.hypot(x - lift.center[0], z - lift.center[2]) < 3.6
    ) {
      const unlocked =
        lift.id === "beacon" ? p.beaconLift : lift.id === "arena" ? p.arenaLift : p.townLift;
      const onLanding = Math.abs(y - lift.high) < 1.5 || Math.abs(y - lift.low) < 1.5;
      const canUnlock =
        Math.abs(y - lift.low) < 1.5 &&
        (lift.id === "town" ? p.caches.includes("town-key") : p.fogCleared);
      return {
        kind: "lift",
        id: lift.id,
        available: !bossActive && !threatened && onLanding && (unlocked || canUnlock),
        prompt: !onLanding
          ? "Lift in motion"
          : unlocked
            ? "E · Call or operate the lift"
            : canUnlock
              ? "E · Release the lift mechanism"
              : lift.id === "town"
                ? "Locked · find the mountain passage key below the town"
                : "Mechanism locked below · find the other end",
      };
    }
  }
  for (const id of ["cathedral", "colosseum"] as const) {
    const complete = id === "cathedral" ? p.cathedralFelled : p.finalFelled;
    if (!complete && !bossActive && near(capitalBosses[id].entry, 4))
      return {
        kind: "boss",
        id,
        available: id === "cathedral" || p.fogCleared,
        prompt: `E · Traverse the seal · ${capitalBosses[id].name}`,
      };
  }
  return null;
}
export function beginCapitalBoss(
  state: ParishEncounter,
  id: CapitalBossId,
  progress: ParishProgress,
) {
  if (
    state.combat.bossActive ||
    (id === "cathedral" ? progress.cathedralFelled : progress.finalFelled) ||
    (id === "colosseum" && !progress.fogCleared)
  )
    return null;
  const spec = capitalBosses[id],
    c = state.combat;
  const health = c.health,
    stamina = c.stamina,
    attackId = c.attackId,
    playerHitId = c.playerHitId;
  Object.assign(c, createEncounter(spec.origin[1]));
  Object.assign(c, {
    health,
    stamina,
    attackId,
    playerHitId,
    bossActive: true,
    freezeOnVictory: false,
    fatalFalls: true,
    arenaX: spec.origin[0],
    arenaZ: spec.origin[2],
    arenaRadius: spec.radius,
    constrainToArena: true,
    verticalHitRange: 1.8,
    bossX: spec.origin[0],
    bossZ: spec.origin[2] - 7,
    bossHealth: id === "cathedral" ? 260 : combatTuning.bossMaxHealth,
    playerX: spec.spawn[0],
    playerY: spec.spawn[1],
    playerZ: spec.spawn[2],
  });
  state.activeBoss = id;
  state.resolvedAttack = attackId;
  return [...spec.spawn] as [number, number, number];
}

export function activateCapitalBeacon(progress: ParishProgress) {
  if (!progress.cathedralFelled || progress.fogCleared) return false;
  progress.fogCleared = true;
  return true;
}
