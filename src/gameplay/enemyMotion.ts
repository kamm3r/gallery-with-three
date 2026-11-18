import { houndRakeYaw } from "./houndAttacks.ts";
import { enemyAttackSpec } from "./enemyAttacks.ts";
import { kilnSweepYaw } from "./kilnAttacks.ts";
import type { EnemyKind } from "./ashenParish.ts";
import { parishWindupDuration, type ParishEnemy } from "./parishEncounter.ts";

const key = (v: Partial<Motion>) => ({
  armR: 0,
  armL: 0,
  outR: 0.08,
  outL: -0.08,
  yawR: 0,
  yawL: 0,
  elbowR: 0.15,
  elbowL: 0.15,
  drop: 0,
  sway: 0,
  neck: 0,
  neckYaw: 0,
  neckRoll: 0,
  tailYaw: 0,
  tailPitch: 0,
  jaw: 0,
  toolX: 0.12,
  toolY: 0.85,
  toolZ: 0.45,
  toolPitch: -1.3,
  toolYaw: 0,
  rake: 0,
  lean: 0,
  twist: 0,
  hipZ: 0,
  reach: 0,
  shrine: 0,
  offX: -0.3,
  offY: 0.5,
  offZ: 0.05,
  tipX: -0.4,
  tipY: 0.65,
  tipZ: 0.4,
  impact: 0,
  ...v,
});
type Motion = {
  armR: number;
  armL: number;
  outR: number;
  outL: number;
  yawR: number;
  yawL: number;
  elbowR: number;
  elbowL: number;
  drop: number;
  sway: number;
  neck: number;
  neckYaw: number;
  neckRoll: number;
  tailYaw: number;
  tailPitch: number;
  jaw: number;
  toolX: number;
  toolY: number;
  toolZ: number;
  toolPitch: number;
  toolYaw: number;
  rake: number;
  lean: number;
  twist: number;
  hipZ: number;
  reach: number;
  shrine: number;
  offX: number;
  offY: number;
  offZ: number;
  tipX: number;
  tipY: number;
  tipZ: number;
  impact: number;
};
/** Each archetype has its own anticipation, contact and follow-through, in +Z-forward space. */
const clips: Record<EnemyKind, Motion[]> = {
  sentinel: [
    key({ armR: -0.25, armL: -0.45, elbowR: 0.35, elbowL: 0.8 }),
    key({
      armR: -2.35,
      armL: -0.7,
      outR: 0.35,
      yawR: 0.45,
      elbowR: 0.7,
      elbowL: 0.9,
      drop: -0.025,
    }),
    key({
      armR: -0.65,
      armL: -0.55,
      outR: 0.32,
      yawR: -0.8,
      elbowR: 0.22,
      elbowL: 0.9,
      drop: 0.07,
    }),
    key({ armR: -0.35, armL: -0.6, yawR: -0.6, elbowR: 0.3, elbowL: 0.85, drop: 0.035 }),
  ],
  acolyte: [
    key({
      lean: -0.2,
      toolX: 0.34,
      toolY: 0.5,
      toolZ: 0.08,
      offX: -0.34,
      offY: 0.5,
      offZ: 0.08,
      neck: -0.12,
    }),
    key({
      lean: -0.32,
      twist: -0.1,
      hipZ: -0.03,
      toolX: 0.14,
      toolY: 1.3,
      toolZ: 0.43,
      offX: -0.16,
      offY: 1.22,
      offZ: 0.4,
      neck: 0.15,
      drop: -0.025,
    }),
    key({
      lean: -0.08,
      twist: 0.12,
      hipZ: 0.03,
      toolX: 0.08,
      toolY: 1.42,
      toolZ: 0.98,
      offX: -0.18,
      offY: 1.2,
      offZ: 0.4,
      neck: -0.18,
      drop: 0.025,
    }),
    key({
      lean: -0.24,
      twist: 0.05,
      hipZ: -0.01,
      toolX: 0.16,
      toolY: 1.2,
      toolZ: 0.66,
      offX: -0.2,
      offY: 1.16,
      offZ: 0.37,
      neck: -0.1,
    }),
  ],
  hound: [
    key({ lean: 0.035, neck: -0.04, jaw: 0.045 }),
    key({ lean: 0.16, hipZ: -0.13, drop: 0.2, neck: -0.15, jaw: 0.55, reach: -0.28 }),
    key({ lean: 0.12, hipZ: 0.15, drop: 0.015, neck: 0.14, jaw: 0.025, reach: 0.85 }),
    key({ lean: 0.1, hipZ: 0.06, drop: 0.14, neck: -0.06, jaw: 0.06, reach: 0.12 }),
  ],
  kiln: [
    key({ lean: 0.18, toolX: 0, toolY: 1.25, toolZ: 0.4, toolPitch: -0.75, drop: 0.03 }),
    key({
      lean: -0.12,
      twist: 0.4,
      hipZ: -0.08,
      toolX: -0.1,
      toolY: 1.13,
      toolZ: 0.24,
      toolPitch: -1.4,
      drop: 0.05,
      sway: 0.025,
    }),
    key({
      lean: 0.5,
      twist: -0.45,
      hipZ: 0.18,
      toolX: -0.1,
      toolY: 1.2,
      toolZ: 0.9,
      toolPitch: -1.55,
      drop: 0.12,
      sway: -0.035,
    }),
    key({
      lean: 0.35,
      twist: -0.3,
      hipZ: 0.1,
      toolX: -0.12,
      toolY: 1.12,
      toolZ: 0.65,
      toolPitch: -1.45,
      drop: 0.09,
    }),
  ],
  clinger: [
    key({ lean: 0.82, toolX: 0.4, toolY: 0.045, toolZ: 0.68 }),
    key({
      lean: 0.58,
      twist: 0.22,
      hipZ: -0.05,
      toolX: 0.65,
      toolY: 0.82,
      toolZ: 0.12,
      drop: 0.035,
      neck: -0.2,
    }),
    key({
      lean: 0.95,
      twist: -0.35,
      hipZ: 0.12,
      toolX: 0.05,
      toolY: 0.55,
      toolZ: 1.08,
      drop: 0.07,
      neck: 0.1,
    }),
    key({ lean: 0.85, twist: -0.2, hipZ: 0.08, toolX: -0.2, toolY: 0.18, toolZ: 0.88, drop: 0.03 }),
  ],
  widow: [
    key({
      lean: 0.12,
      toolX: -0.55,
      toolY: 1.05,
      toolZ: 0.3,
      tipX: -0.4,
      tipY: 0.65,
      tipZ: 0.4,
      sway: 0.12,
      neck: 0.1,
    }),
    key({
      lean: 0.02,
      twist: -0.18,
      hipZ: -0.02,
      toolX: -0.8,
      toolY: 1.65,
      toolZ: 0.58,
      tipX: -1.2,
      tipY: 1.95,
      tipZ: 0.82,
      sway: 0.04,
      neck: 0.15,
      drop: -0.02,
    }),
    key({
      lean: 0.25,
      twist: 0.15,
      hipZ: 0.04,
      toolX: -0.88,
      toolY: 1.65,
      toolZ: 0.4,
      impact: 1,
      tipX: -0.55,
      tipY: 1.92,
      tipZ: 0.4,
      sway: 0.18,
      neck: -0.2,
      drop: 0.045,
    }),
    key({
      lean: 0.18,
      twist: 0.08,
      hipZ: 0.02,
      toolX: -0.85,
      toolY: 1.5,
      toolZ: 0.35,
      tipX: -0.55,
      impact: 0.4,
      tipY: 1.8,
      tipZ: 0.35,
      sway: 0.15,
      neck: -0.08,
      drop: 0.025,
    }),
  ],
  bearer: [
    key({ lean: 0.36, drop: 0.11, neck: -0.15 }),
    key({ lean: 0.08, hipZ: -0.06, drop: 0.11, neck: 0.2, shrine: -0.15 }),
    key({ lean: 0.95, hipZ: 0.18, drop: 0.26, neck: -0.28, shrine: 1.45 }),
    key({ lean: 0.78, hipZ: 0.15, drop: 0.22, neck: -0.18, shrine: 1.25 }),
  ],
};
export const enemyGaits = {
  sentinel: { cadence: 0.75, step: 0.24, lift: 0.1, duty: 0.66, bob: 0.024, sway: 0.025 },
  acolyte: { cadence: 0.48, step: 0.1, lift: 0.025, duty: 0.8, bob: 0.008, sway: 0.04 },
  hound: {
    cadence: 1.35,
    // stride advances 4.8 radians per travelled metre. Match stance velocity
    // to that distance so a planted paw remains fixed against the floor.
    step: (0.6 * Math.PI) / (4.8 * 1.35),
    lift: 0.075,
    duty: 0.6,
    bob: 0.018,
    sway: 0.012,
  },
  kiln: { cadence: 0.48, step: 0.2, lift: 0.065, duty: 0.8, bob: 0.045, sway: 0.07 },
  clinger: { cadence: 1.2, step: 0.2, lift: 0.07, duty: 0.64, bob: 0.035, sway: 0.055 },
  widow: { cadence: 0.55, step: 0.15, lift: 0.06, duty: 0.78, bob: 0.025, sway: 0.085 },
  bearer: { cadence: 0.38, step: 0.14, lift: 0.045, duty: 0.84, bob: 0.055, sway: 0.045 },
} satisfies Record<EnemyKind, object>;
const ease = (t: number) => {
  t = Math.max(0, Math.min(1, t));
  return t * t * (3 - 2 * t);
};
function mix(a: Motion, b: Motion, t: number): Motion {
  const out = { ...a },
    u = ease(t);
  for (const k of Object.keys(a) as (keyof Motion)[]) out[k] = a[k] + (b[k] - a[k]) * u;
  return out;
}
function gaitAmount(e: ParishEnemy, feet = false) {
  // Cadence already follows distance travelled. Scaling foot excursion by
  // speed again makes slow circling skate across the floor.
  const amount = Math.min(1, e.moveAmount * (feet && e.kind === "hound" ? 8 : 1));
  if (e.kind !== "hound") return amount;
  if (e.phase === "windup") return amount * (1 - ease(e.timer / 0.12));
  return e.phase === "strike" || e.phase === "recovery" ? 0 : amount;
}
export function enemyMotion(e: ParishEnemy, time: number, gentle = false) {
  const spec = enemyAttackSpec(e),
    gait = enemyGaits[e.kind];
  const [ready, raised, contact, follow] = clips[e.kind].map((v) => ({ ...v }));
  if (e.kind === "sentinel" && e.attackNumber % 3 === 2) {
    raised.armR = -1.05;
    raised.elbowR = 1.35;
    raised.yawR = 0.12;
    contact.armR = -1.35;
    contact.elbowR = 0.1;
    contact.yawR = 0;
    follow.armR = -1.15;
    follow.elbowR = 0.2;
  }
  if (e.kind === "hound") {
    const move = e.houndAttack ?? "pounce";
    if (move === "snap") {
      Object.assign(raised, {
        lean: 0.06,
        hipZ: -0.045,
        drop: 0.065,
        neck: -0.12,
        jaw: 0.42,
        reach: -0.08,
      });
      Object.assign(contact, {
        lean: 0.12,
        hipZ: 0.12,
        drop: 0.08,
        neck: 0.12,
        jaw: 0.015,
        reach: 0.2,
      });
      Object.assign(follow, { lean: 0.06, hipZ: 0.03, drop: 0.04, neck: 0, jaw: 0.07, reach: 0 });
    } else if (move === "rake") {
      Object.assign(raised, {
        lean: 0.08,
        twist: -0.22,
        hipZ: -0.035,
        drop: 0.1,
        neck: 0.04,
        neckYaw: -0.6916,
        jaw: 0.45,
        reach: -0.08,
      });
      Object.assign(follow, {
        lean: 0.09,
        twist: 0.25,
        hipZ: 0.04,
        drop: 0.095,
        neck: 0.06,
        neckYaw: 0.67,
        jaw: 0.055,
        reach: 0.08,
      });
    }
  }
  if (e.kind === "kiln") {
    const move = e.kilnAttack ?? "clamp";
    if (move === "sweep") {
      Object.assign(raised, {
        toolX: -0.12,
        toolY: 1.28,
        toolZ: 0.4,
        toolPitch: -1.5,
        toolYaw: -1.45,
        lean: 0.06,
        twist: -0.5,
        hipZ: -0.05,
        drop: 0.045,
      });
      Object.assign(follow, {
        toolX: 0.12,
        toolY: 1.28,
        toolZ: 0.4,
        toolPitch: -1.5,
        toolYaw: 1.45,
        lean: 0.2,
        twist: 0.5,
        hipZ: 0.06,
        drop: 0.09,
      });
    } else if (move === "slam") {
      Object.assign(raised, {
        toolX: 0,
        toolY: 2.05,
        toolZ: 0.62,
        toolPitch: 0,
        sway: 0,
        lean: -0.05,
        twist: 0,
        hipZ: -0.04,
        drop: 0,
      });
      Object.assign(contact, {
        toolX: 0,
        toolY: 1.63,
        toolZ: 0.62,
        toolPitch: 0,
        sway: 0,
        lean: 0.18,
        twist: 0,
        hipZ: 0.06,
        drop: 0.13,
      });
      Object.assign(follow, { ...contact, lean: 0.2, drop: 0.15 });
    } else if (move === "check") {
      // Keep the tongs across the left hip. The leading shoulder supplies the blow.
      Object.assign(raised, {
        toolX: -0.12,
        toolY: 1.28,
        toolZ: 0.12,
        toolPitch: -1.5,
        toolYaw: -1.6,
        lean: -0.08,
        twist: 0.32,
        hipZ: -0.09,
        drop: 0.04,
      });
      Object.assign(contact, { ...raised, lean: 0.27, twist: -0.58, hipZ: 0.19, drop: 0.1 });
      Object.assign(follow, { ...contact, lean: 0.2, twist: -0.4, hipZ: 0.12 });
    }
  }

  const comboStart = { ...(e.kind === "hound" ? follow : clips[e.kind][3]) };
  if (e.kind === "sentinel" && (e.attackNumber - 1) % 3 === 2) {
    comboStart.armR = -1.15;
    comboStart.elbowR = 0.2;
  }
  let p = ready;
  if (e.phase === "windup")
    p = mix(e.comboStep ? comboStart : ready, raised, e.timer / parishWindupDuration(e));
  else if (e.phase === "strike")
    p =
      e.timer <= spec.contact
        ? mix(raised, contact, e.timer / spec.contact)
        : mix(contact, follow, (e.timer - spec.contact) / (spec.strike - spec.contact));
  else if (e.phase === "recovery") p = mix(follow, ready, e.timer / spec.recovery);
  if (e.kind === "kiln" && e.kilnAttack === "sweep" && e.phase === "strike") {
    // One uninterrupted curve through impact: no stop at the middle keyframe.
    p = mix(raised, follow, e.timer / spec.strike);
    p.toolYaw = kilnSweepYaw(e.timer);
  }
  if (e.kind === "kiln" && e.kilnAttack === "slam" && e.phase === "windup") {
    const t = e.timer / parishWindupDuration(e);
    const lifted = key({ ...raised, toolY: 1.95, toolZ: 0.35, toolPitch: -Math.PI, lean: -0.1 });
    p = t < 0.4 ? mix(ready, lifted, t / 0.4) : mix(lifted, raised, (t - 0.4) / 0.45);
    if (t >= 0.4 && t <= 0.85) p.toolZ -= Math.sin((Math.PI * (t - 0.4)) / 0.45) ** 2 * 0.16;
  }
  if (e.kind === "hound" && e.houndAttack === "rake" && e.phase === "strike") {
    p = mix(raised, follow, e.timer / spec.strike);
    p.neckYaw = houndRakeYaw(e.timer) - 0.72 * p.twist;
    p.jaw =
      e.timer < spec.contact
        ? raised.jaw * (1 - ease(e.timer / spec.contact))
        : follow.jaw * ease((e.timer - spec.contact) / (spec.strike - spec.contact));
  }
  if (e.kind === "hound" && (e.houndAttack ?? "pounce") === "pounce" && e.phase === "strike") {
    // Uncoil, stretch through the bite, then absorb the landing. The jaw stays
    // open through launch instead of slowly closing for the entire flight.
    const launch = key({
      lean: -0.06,
      hipZ: 0.015,
      drop: 0.015,
      neck: 0.09,
      jaw: 0.48,
      reach: 0.32,
    });
    const release = 0.1;
    p =
      e.timer < release
        ? mix(raised, launch, e.timer / release)
        : e.timer < spec.contact
          ? mix(launch, contact, (e.timer - release) / (spec.contact - release))
          : mix(contact, follow, (e.timer - spec.contact) / (spec.strike - spec.contact));
  }
  if (e.kind === "hound" && e.phase === "recovery") {
    const t = e.timer / spec.recovery;
    // A small damped recoil reads as weight without moving the planted feet.
    const settle = Math.sin(Math.PI * Math.min(1, t * 2)) ** 2;
    p.drop += settle * ((e.houndAttack ?? "pounce") === "pounce" ? 0.055 : 0.018);
    p.neck -= settle * 0.07;
  }
  if (e.kind === "hound") {
    const move = e.houndAttack ?? "pounce";
    const pulse = (t: number) => Math.sin(Math.PI * Math.max(0, Math.min(1, t))) ** 2;
    const side = e.comboStep ? 1 : -1;
    if (e.phase === "windup") {
      const t = e.timer / parishWindupDuration(e),
        load = pulse(t);
      if (move === "pounce") {
        // A predatory shoulder dip and sideways muzzle feint precede the
        // straight launch. Preserve the final tell and collision direction.
        p.hipZ -= load * 0.055;
        p.drop += load * 0.045;
        p.sway -= load * 0.045;
        p.neckYaw += load * 0.16;
        p.neckRoll -= load * 0.12;
        p.tailYaw += load * 0.32;
      } else if (move === "snap") {
        // The second bite cocks the skull to the opposite side.
        p.neckRoll += side * load * 0.22;
        p.neckYaw += side * load * 0.1;
        p.jaw += load * 0.12;
        p.tailPitch -= load * 0.12;
      } else {
        p.sway -= load * 0.055;
        p.neckRoll += load * 0.12;
        p.tailYaw += load * 0.42;
      }
    } else if (e.phase === "strike") {
      const before = e.timer <= spec.contact;
      const t = before
        ? e.timer / spec.contact
        : (e.timer - spec.contact) / (spec.strike - spec.contact);
      const accent = pulse(t);
      if (move === "pounce") {
        p.neckRoll += accent * (before ? -0.1 : 0.08);
        p.tailPitch -= accent * (before ? 0.25 : 0.1);
        p.tailYaw -= accent * 0.18;
      } else if (move === "snap") {
        p.neckRoll += side * accent * (before ? -0.12 : 0.2);
        if (!before) {
          p.neckYaw -= side * accent * 0.16;
          p.neck -= accent * 0.075;
        }
        p.tailYaw += side * accent * 0.18;
      } else {
        // Pull the shoulders across the bite; counterrotate the skull to
        // preserve the authored jaw arc used by the combat hit test.
        const drive = Math.sin((e.timer / spec.strike) * Math.PI * 2) * 0.11;
        p.twist += drive;
        p.neckYaw -= drive * 0.72;
        p.sway += Math.sin((e.timer / spec.strike) * Math.PI * 2) * 0.045;
        p.neckRoll -= pulse(e.timer / spec.strike) * 0.12;
        p.tailYaw -= pulse(e.timer / spec.strike) * 0.48;
      }
    } else if (e.phase === "recovery") {
      const t = e.timer / spec.recovery,
        settle = pulse(t);
      p.neckRoll += settle * (move === "rake" ? -0.13 : side * 0.1);
      p.tailYaw += Math.sin(t * Math.PI * 2) * settle * 0.22;
      p.tailPitch += settle * 0.08;
    }
  }
  if (e.kind === "clinger") p.twist *= e.attackNumber % 2 === 0 ? -1 : 1;
  const cycle = e.stride * gait.cadence,
    walk = gaitAmount(e);
  const breathing = gentle ? 0 : Math.sin(time * (e.kind === "hound" ? 3.4 : 1.3));
  p.drop += Math.abs(Math.sin(cycle)) * gait.bob * walk + breathing * 0.006;
  if (e.kind === "hound") {
    p.drop += 0.085 * Math.min(1, walk * 3);
    const back = Math.sin(cycle * 2 - 0.35) * 0.018 * walk;
    p.lean += back;
    // Keep the muzzle tracking ahead as the shoulder girdle rises and falls.
    p.neck -= back * 0.6;
  }
  p.sway += Math.sin(cycle) * gait.sway * walk;
  if (e.kind === "sentinel") p.armR += Math.sin(cycle) * 0.13 * walk;
  if (e.kind === "acolyte") {
    p.armR += Math.sin(cycle + 0.4) * 0.06 * walk;
    p.armL += Math.sin(cycle - 0.8) * 0.08 * walk;
  }
  const stagger =
    e.phase === "stagger" ? Math.sin(Math.PI * Math.min(1, e.timer / spec.stagger)) : 0;
  p.drop += stagger * (e.kind === "bearer" ? 0.13 : 0.06);
  p.neck += stagger * 0.2;
  return { ...p, cycle, walk, breathing };
}
/** Planted stance, followed by a lifted return. No sinusoidal backwards knee bending. */
export function enemyFoot(e: ParishEnemy, offset: number) {
  const g = enemyGaits[e.kind],
    phase = ((((e.stride * g.cadence) / (Math.PI * 2) + offset) % 1) + 1) % 1;
  const active = gaitAmount(e, true);
  if (phase < g.duty) return { z: g.step * (1 - (2 * phase) / g.duty) * active, y: 0 };
  const t = (phase - g.duty) / (1 - g.duty);
  return {
    z: g.step * (-1 + 2 * ease(t)) * active,
    y: Math.sin(t * Math.PI) ** (e.kind === "hound" ? 2 : 1) * g.lift * active,
  };
}
