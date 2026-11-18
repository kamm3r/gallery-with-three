import { type EnemyKind } from "./ashenParish.ts";
export type KilnAttack = "clamp" | "sweep" | "slam" | "check";
export const kilnAttacks = {
  clamp: {
    windup: 1.35,
    strike: 0.65,
    contact: 0.32,
    recovery: 1.7,
    range: 3.4,
    reach: 3.5,
    damage: 40,
    strikeSpeed: 1.1,
    frontal: 0.8,
  },
  sweep: {
    windup: 1.1,
    strike: 0.48,
    contact: 0.24,
    recovery: 1.5,
    range: 2.8,
    reach: 3.1,
    damage: 32,
    strikeSpeed: 0,
    frontal: -0.25,
  },
  slam: {
    windup: 1.85,
    strike: 0.95,
    contact: 0.28,
    recovery: 2.6,
    range: 2.5,
    reach: 3.5,
    damage: 52,
    strikeSpeed: 0,
    frontal: -1,
  },
  check: {
    windup: 0.65,
    strike: 0.4,
    contact: 0.16,
    recovery: 1.1,
    range: 1.3,
    reach: 1.5,
    damage: 16,
    strikeSpeed: 1.8,
    frontal: 0.6,
  },
} as const;
export function selectKilnAttack(
  distance: number,
  frontal: number,
  previous: KilnAttack,
  number: number,
): KilnAttack {
  if (distance < 1.25 && previous !== "check") return "check";
  if (frontal < 0.85 && distance < 2.8 && previous !== "sweep") return "sweep";
  if (distance > 2.7 && previous !== "clamp") return "clamp";
  const choices: KilnAttack[] = distance < 2.7 ? ["slam", "sweep", "clamp"] : ["clamp", "sweep"];
  for (let offset = 0; offset < choices.length; offset++) {
    const next = choices[(number + offset) % choices.length];
    if (next !== previous) return next;
  }
  return "clamp";
}

/** Root-local impact position converted from the 1.12-scale tool's two downturned tips. */
export const kilnSlamImpact = { forward: 0.975, radius: 2.5, duration: 0.55 } as const;
export const kilnSweepWindow = { start: 0.075, end: 0.405, halfWidth: 0.35 } as const;
const smooth = (t: number) => {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
};
export function kilnSweepYaw(timer: number) {
  return -1.45 + 2.9 * smooth(timer / kilnAttacks.sweep.strike);
}
/** The whole arc is active; test the portion crossed this simulation step, including low frame rates. */
export function kilnSweepContains(angle: number, timer: number, dt: number) {
  const { start, end, halfWidth } = kilnSweepWindow;
  if (timer < start || timer - dt > end) return false;
  const from = kilnSweepYaw(Math.max(start, timer - dt));
  const to = kilnSweepYaw(Math.min(end, timer));
  return angle >= from - halfWidth && angle <= to + halfWidth;
}
export function kilnSlamElapsed(e: {
  kind: EnemyKind;
  kilnAttack?: KilnAttack;
  phase: string;
  timer: number;
}) {
  if (e.kind !== "kiln" || e.kilnAttack !== "slam") return -1;
  return e.phase === "strike"
    ? e.timer - kilnAttacks.slam.contact
    : e.phase === "recovery"
      ? kilnAttacks.slam.strike - kilnAttacks.slam.contact + e.timer
      : -1;
}
export function kilnSlamRadius(elapsed: number) {
  return kilnSlamImpact.radius * Math.max(0, Math.min(1, elapsed / kilnSlamImpact.duration));
}
