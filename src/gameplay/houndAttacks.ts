export type HoundAttack = "pounce" | "snap" | "rake";
export const houndAttacks = {
  pounce: {
    windup: 0.8,
    followupWindup: 0.8,
    strike: 0.5,
    contact: 0.36,
    recovery: 1.05,
    range: 3.8,
    reach: 1.75,
    damage: 28,
    strikeSpeed: 5.8,
    travel: 2.9,
    frontal: 0.82,
  },
  snap: {
    windup: 0.34,
    followupWindup: 0.26,
    strike: 0.32,
    contact: 0.12,
    recovery: 0.62,
    range: 1.35,
    reach: 1.6,
    damage: 14,
    strikeSpeed: 0.8,
    travel: 0.18,
    frontal: 0.72,
  },
  rake: {
    windup: 0.63,
    followupWindup: 0.63,
    strike: 0.52,
    contact: 0.24,
    recovery: 0.88,
    range: 2,
    reach: 1.7,
    damage: 20,
    strikeSpeed: 1.4,
    travel: 0.4,
    frontal: 0.05,
  },
} as const;
export function selectHoundAttack(
  distance: number,
  frontal: number,
  previous?: HoundAttack,
): HoundAttack {
  if (distance < 1.4) return previous === "snap" ? "rake" : "snap";
  if (distance < 2.05 && (frontal < 0.8 || previous === "pounce")) return "rake";
  return "pounce";
}
const smooth = (t: number) => {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
};
/** One continuous ballistic silhouette. Feet tuck during flight and extend for landing. */
export function houndAir(timer: number) {
  const t = Math.max(0, Math.min(1, timer / houndAttacks.pounce.strike));
  return {
    height: Math.sin(t * Math.PI) * 0.3,
    tuck: Math.sin(t * Math.PI),
    land: smooth((t - 0.65) / 0.35),
  };
}

/** Forelegs reach for the landing while the rear legs fold under the pelvis.
 * Both trajectories return to the planted pose at touchdown. */
export function houndFlightFoot(timer: number, front: boolean, right: boolean) {
  const t = Math.max(0, Math.min(1, timer / houndAttacks.pounce.strike));
  const envelope = Math.sin(Math.PI * t) ** 2;
  const fold = Math.sin(Math.PI * smooth(Math.min(1, t / 0.82))) ** 2;
  return {
    y: (front ? 0.46 : 0.4) * fold,
    z: envelope * (front ? 0.18 + 0.48 * smooth(t) : 0.36 - 0.48 * smooth(t)),
    // Slightly staggered forepaws break the rigid, symmetrical leap silhouette.
    x: (right ? 1 : -1) * envelope * (front ? 0.035 : 0.02),
    pitch: (front ? -0.55 : 0.45) * fold,
  };
}

export function houndRakeYaw(timer: number) {
  return -0.85 + 1.7 * smooth(timer / houndAttacks.rake.strike);
}
export function houndRakeContains(angle: number, timer: number, dt: number) {
  const start = 0.075,
    end = 0.445;
  if (timer < start || timer - dt > end) return false;
  return (
    angle >= houndRakeYaw(Math.max(start, timer - dt)) - 0.3 &&
    angle <= houndRakeYaw(Math.min(end, timer)) + 0.3
  );
}
