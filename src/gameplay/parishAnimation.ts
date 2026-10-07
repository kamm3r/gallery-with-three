import { enemySpecs } from "./ashenParish.ts";
import { parishWindupDuration } from "./parishEncounter.ts";
import type { ParishEnemy } from "./parishEncounter.ts";

const smooth = (t: number) => {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
};
type CombatPose = {
  lean: number;
  twist: number;
  arm: number;
  shield: number;
  bob: number;
  jaw: number;
};
const blend = (a: CombatPose, b: CombatPose, progress: number): CombatPose => {
  const t = smooth(progress);
  return {
    lean: a.lean + (b.lean - a.lean) * t,
    twist: a.twist + (b.twist - a.twist) * t,
    arm: a.arm + (b.arm - a.arm) * t,
    shield: a.shield + (b.shield - a.shield) * t,
    bob: a.bob + (b.bob - a.bob) * t,
    jaw: a.jaw + (b.jaw - a.jaw) * t,
  };
};
/** Shared key poses make phase boundaries continuous, including the damage frame. */
export function parishEnemyPose(enemy: ParishEnemy, time: number, gentle = false) {
  const spec = enemySpecs[enemy.kind];
  const hound = enemy.kind === "hound",
    sentinel = enemy.kind === "sentinel";
  const ready: CombatPose = {
    lean: 0,
    twist: 0,
    arm: -0.3,
    shield: sentinel ? -0.9 : -0.3,
    bob: 0,
    jaw: 0,
  };
  const raised: CombatPose = {
    lean: hound ? 0.22 : sentinel ? -0.28 : -0.12,
    twist: sentinel ? 0.65 : -0.15,
    arm: sentinel ? -2.6 : -2.05,
    shield: -0.4,
    bob: hound ? -0.18 : -0.09,
    jaw: hound ? 0.6 : 0,
  };
  const contact: CombatPose = {
    lean: hound ? -0.2 : sentinel ? 0.58 : 0.18,
    twist: sentinel ? -0.8 : 0.15,
    arm: sentinel ? -0.1 : -0.75,
    shield: -0.35,
    bob: hound ? 0.12 : 0,
    jaw: hound ? 0.12 : 0,
  };
  const follow: CombatPose = {
    lean: hound ? 0.08 : sentinel ? 0.46 : 0.12,
    twist: sentinel ? -0.65 : 0.1,
    arm: sentinel ? 0.12 : -0.6,
    shield: -0.4,
    bob: hound ? -0.03 : 0,
    jaw: 0,
  };
  // Every third preparation is a shorter thrust silhouette; damage timing
  // stays in the encounter, so what the player sees matches its contact frame.
  const thrust = sentinel && enemy.attackNumber % 3 === 2;
  if (thrust) {
    raised.arm = -1.15;
    raised.twist = 0.3;
    raised.lean = -0.18;
    contact.arm = -1.45;
    contact.twist = -0.35;
    follow.arm = -1.3;
    follow.twist = -0.25;
  }
  const previousThrust = sentinel && (enemy.attackNumber - 1) % 3 === 2;
  const comboStart: CombatPose = {
    ...follow,
    lean: 0.46,
    twist: previousThrust ? -0.25 : -0.65,
    arm: previousThrust ? -1.3 : 0.12,
  };
  let pose = ready;
  if (enemy.phase === "windup")
    pose = blend(
      enemy.comboStep > 0 ? comboStart : ready,
      raised,
      enemy.timer / parishWindupDuration(enemy),
    );
  else if (enemy.phase === "strike") {
    pose =
      enemy.timer <= spec.contact
        ? blend(raised, contact, enemy.timer / spec.contact)
        : blend(contact, follow, (enemy.timer - spec.contact) / (spec.strike - spec.contact));
  } else if (enemy.phase === "recovery") pose = blend(follow, ready, enemy.timer / spec.recovery);
  const stride = Math.sin(enemy.stride) * enemy.moveAmount;
  const stagger =
    enemy.phase === "stagger" ? Math.sin(Math.min(1, enemy.timer / spec.stagger) * Math.PI) : 0;
  const flinch = enemy.flinch > 0 ? Math.sin((1 - enemy.flinch / 0.18) * Math.PI) : 0;
  const death = enemy.phase === "dead" ? smooth(enemy.deathTime / 1.1) : 0;
  const coil = hound && enemy.phase === "windup" ? smooth(enemy.timer / spec.windup) : 0;
  const leap =
    hound && enemy.phase === "strike"
      ? Math.sin(Math.min(1, enemy.timer / spec.strike) * Math.PI)
      : 0;
  return {
    ...pose,
    lean: pose.lean - stagger * 0.35 - flinch * (enemy.phase === "strike" ? 0.035 : 0.08),
    arm: pose.arm + stagger * 0.45,
    head: -pose.lean * 0.4 + stagger * 0.2,
    roll: gentle ? 0 : stride * (hound ? 0.025 : 0.018),
    elbow: sentinel
      ? thrust
        ? 1.1 - Math.max(0, pose.lean)
        : 0.28 + Math.max(0, -pose.arm - 0.8) * 0.18
      : 0.55 + Math.max(0, -pose.arm) * 0.2,
    offElbow: sentinel ? 0.65 : 0.35,
    kneeFL: 0.12 + Math.max(0, -stride) * 0.7 + coil * 0.55 + leap * 0.35,
    kneeFR: 0.12 + Math.max(0, stride) * 0.7 + coil * 0.55 + leap * 0.35,
    kneeBL: 0.3 + Math.max(0, stride) * 0.6 + coil * 0.7,
    kneeBR: 0.3 + Math.max(0, -stride) * 0.6 + coil * 0.7,
    stride,
    legFL: stride * 0.55 + coil * 0.4 - leap * 0.65,
    legFR: -stride * 0.55 + coil * 0.4 - leap * 0.65,
    legBL: -stride * 0.55 - coil * 0.35 + leap * 0.6,
    legBR: stride * 0.55 - coil * 0.35 + leap * 0.6,
    // Reduced motion removes idle ornament; attack silhouettes remain readable.
    bob: pose.bob + (gentle ? 0 : Math.sin(time * 1.6) * 0.012),
    death,
    sink: Math.max(0, enemy.deathTime - 9) * 0.3,
    glow: enemy.flash * 3,
    guardGlow: enemy.guardFlash * 2,
    castGlow:
      enemy.kind !== "acolyte"
        ? 0
        : enemy.phase === "windup"
          ? smooth(enemy.timer / spec.windup)
          : enemy.phase === "strike"
            ? 1 - smooth(enemy.timer / spec.strike) * 0.7
            : enemy.phase === "recovery"
              ? 0.3 * (1 - smooth(enemy.timer / spec.recovery))
              : 0,
  };
}
