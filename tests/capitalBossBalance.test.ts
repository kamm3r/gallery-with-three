import test from "node:test";
import assert from "node:assert/strict";
import {
  STAMINA_REGEN_DELAY,
  createEncounter,
  moveSpec,
  stepEncounter,
} from "../src/gameplay/bossEncounter.ts";
import {
  nextSwordStep,
  swordAttackDuration,
  swordArmored,
  swordProgress,
  swordSpec,
} from "../src/gameplay/characterAnimations.ts";
import { combatTuning } from "../src/gameplay/combatTuning.ts";
import {
  ROLL_COOLDOWN,
  ROLL_DURATION,
  dodgeInvulnerable,
  rollSpeedAt,
} from "../src/gameplay/playerRules.ts";
import { capitalBosses } from "../src/gameplay/capitalLayout.ts";
import { PARRY_DURATION, PARRY_STAMINA } from "../src/gameplay/playerDefense.ts";
import { capitalPlayerProfile } from "../src/gameplay/capitalMetrics.ts";

/**
 * Simulated, not hand-played: bots fight each capital boss with human limits. They see
 * only what the screen shows (the Warden's pose and position), react after a delay,
 * time their rolls with noise, sometimes misread a telegraph, and get greedy.
 */
type Skill = {
  reaction: number;
  timingNoise: number;
  misread: number;
  greed: number;
  /** Chance to parry a parryable cut instead of rolling it. */
  parry?: number;
};
const AVERAGE: Skill = { reaction: 0.3, timingNoise: 0.12, misread: 0.2, greed: 0.25 };
const CARELESS: Skill = { reaction: 0.42, timingNoise: 0.2, misread: 0.4, greed: 0.5 };
const PARRYING: Skill = { ...AVERAGE, parry: 0.8 };
const WALK = 4;

function scatter(seed: number) {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
}

function fight(id: keyof typeof capitalBosses, skill: Skill, seed: number) {
  const spec = capitalBosses[id],
    rand = scatter(seed * 7919 + 17);
  const s = createEncounter(0);
  Object.assign(s, {
    arenaX: 0,
    arenaZ: 0,
    arenaRadius: spec.radius,
    constrainToArena: true,
    bossX: 0,
    bossZ: -7,
    bossHealth: spec.health,
    playerX: 0,
    playerZ: spec.radius - 2,
    seed: (seed * 2654435761) >>> 0,
  });
  let flasks = 3,
    heal = 0,
    roll = 0,
    rollCooldown = 0,
    rollX = 0,
    rollZ = 0,
    plannedRoll = -1,
    plannedParry = -1,
    seenMove = -1;
  const dt = 1 / 30;
  for (let t = 0; t < 240; t += dt) {
    if (s.health <= 0) return false;
    if (s.bossHealth <= 0) return true;
    const dx = s.bossX - s.playerX,
      dz = s.bossZ - s.playerZ,
      distance = Math.hypot(dx, dz);
    s.playerYaw = Math.atan2(dx, dz);
    // The swing holds during hit-stop, as in the player controller.
    if (s.hitStop <= 0) {
      if (s.attackTime > 0) {
        s.attackTime = Math.max(0, s.attackTime - dt);
        if (s.attackTime === 0) s.sinceSwing = 0;
      } else s.sinceSwing += dt;
    }
    heal = Math.max(0, heal - dt);
    rollCooldown = Math.max(0, rollCooldown - dt);
    // A new telegraph: after a reaction delay, plan a roll for when it should land.
    const telegraph = s.phase === "windup" || (s.phase === "roar" && s.timer < 0.1);
    const moveKey = s.phase === "windup" ? s.impactId * 10 + 1 : -1;
    if (telegraph && seenMove !== moveKey && s.timer > skill.reaction) {
      seenMove = moveKey;
      const m = s.phase === "roar" ? null : moveSpec(s.move);
      const windup = m ? (s.enraged ? m.windupEnraged : m.windup) : 0.6;
      const firstHit = m ? m.hits[0].at : 0;
      const reach = m ? Math.max(...m.hits.map((h) => h.range)) : 4.8;
      const threatened = s.move === "leap" || distance < reach + 1;
      const parryable = s.move === "sweep";
      if (threatened && rand() > skill.misread) {
        const at = t + windup - s.timer + firstHit + (rand() - 0.5) * 2 * skill.timingNoise;
        // Parries aim the middle of their window at the blow; rolls start just before it.
        if (parryable && rand() < (skill.parry ?? 0)) plannedParry = at - 0.13;
        else plannedRoll = at - 0.18;
      }
    }
    if (s.parryTime >= 0 && s.hitStop <= 0) {
      s.parryTime += dt;
      if (s.parryTime > PARRY_DURATION) s.parryTime = -1;
    }
    const busy = s.hurtTime > 0 || s.attackTime > 0 || heal > 0 || s.parryTime >= 0;
    if (plannedParry >= 0 && t >= plannedParry && !busy && roll <= 0) {
      plannedParry = -1;
      if (s.stamina > 0) {
        s.parryTime = 0;
        s.stamina = Math.max(0, s.stamina - PARRY_STAMINA);
        s.staminaDelay = STAMINA_REGEN_DELAY;
      }
    }
    if (plannedRoll >= 0 && t >= plannedRoll && !busy && roll <= 0 && rollCooldown <= 0) {
      plannedRoll = -1;
      if (s.stamina > 0) {
        s.stamina = Math.max(0, s.stamina - 25);
        s.staminaDelay = STAMINA_REGEN_DELAY;
        roll = ROLL_DURATION;
        rollCooldown = ROLL_COOLDOWN;
        // Roll sideways, past the Warden's swing.
        const side = rand() < 0.5 ? 1 : -1;
        rollX = (-dz / Math.max(distance, 0.01)) * side;
        rollZ = (dx / Math.max(distance, 0.01)) * side;
      }
    }
    if (roll > 0) {
      const elapsed = ROLL_DURATION - roll;
      s.invulnerable = dodgeInvulnerable(false, elapsed);
      const speed = rollSpeedAt(capitalPlayerProfile.rollSpeed, elapsed, ROLL_DURATION);
      s.playerX += rollX * speed * dt;
      s.playerZ += rollZ * speed * dt;
      roll -= dt;
    } else {
      s.invulnerable = false;
      if (s.hurtTime > 0) {
        const carry = s.hurtTime / 0.45;
        s.playerX += s.knockX * carry * dt;
        s.playerZ += s.knockZ * carry * dt;
      } else if (
        heal <= 0 &&
        (s.attackTime <= 0 ||
          // Mid-swing, keep the chain going into an opening once the cancel window opens.
          (s.phase === "recovery" &&
            swordProgress(s.attackStep, s.attackTime) >= swordSpec(s.attackStep).chainFrom))
      ) {
        const safe = s.phase === "recovery" || distance > 7;
        if (s.health < 45 && flasks > 0 && safe && s.health < 100) {
          flasks--;
          s.health = Math.min(100, s.health + 45);
          heal = 1;
        } else if (
          distance < 3 &&
          s.stamina > 0 &&
          (s.phase === "recovery" || (s.phase === "approach" && rand() < skill.greed * dt * 6))
        ) {
          const step = nextSwordStep(s.attackStep, s.attackTime > 0, s.sinceSwing);
          s.attackStep = step;
          s.stamina = Math.max(0, s.stamina - swordSpec(step).stamina);
          s.attackId++;
          s.attackTime = swordAttackDuration(step);
          s.sinceSwing = 0;
          s.staminaDelay = STAMINA_REGEN_DELAY;
        } else if (s.phase === "recovery" || distance > 3.4) {
          // Close in for the opening.
          const step = Math.min(Math.max(0, distance - 2.2), WALK * dt);
          s.playerX += (dx / Math.max(distance, 0.01)) * step;
          s.playerZ += (dz / Math.max(distance, 0.01)) * step;
        } else if (s.phase === "approach") {
          // Circle the Warden while it is ready, rather than backing into the wall.
          const sense = seed % 2 ? 1 : -1;
          s.playerX += (-dz / Math.max(distance, 0.01)) * sense * WALK * 0.6 * dt;
          s.playerZ += (dx / Math.max(distance, 0.01)) * sense * WALK * 0.6 * dt;
        }
      }
    }
    // The Warden's kinematic body shoves the player's capsule out of it.
    const ox = s.playerX - s.bossX,
      oz = s.playerZ - s.bossZ,
      gap = Math.hypot(ox, oz);
    if (gap < 1.5 && s.bossY - s.groundY < 1) {
      const nx = gap > 0.01 ? ox / gap : Math.sin(s.bossYaw),
        nz = gap > 0.01 ? oz / gap : Math.cos(s.bossYaw);
      s.playerX = s.bossX + nx * 1.5;
      s.playerZ = s.bossZ + nz * 1.5;
    }
    // The player stays inside the arena wall.
    const r = Math.hypot(s.playerX, s.playerZ);
    if (r > spec.radius) {
      s.playerX *= spec.radius / r;
      s.playerZ *= spec.radius / r;
    }
    // Hyper-armour as the player controller sets it: the heavy swing rides through.
    s.hyperArmor = swordArmored(s.attackStep, s.attackTime);
    stepEncounter(s, dt);
  }
  return false;
}

function winRate(id: keyof typeof capitalBosses, skill: Skill, runs = 150) {
  let wins = 0;
  for (let i = 0; i < runs; i++) if (fight(id, skill, i + 1)) wins++;
  return wins / runs;
}

// Measured with the light chain, hit-stop, the 4 m roll and hyper-armour: average 81%
// (keeper) and 62% (warden); careless 63% and 42%; parrying the sweep 88% and 77%.
void test("an average human-limited player beats each capital boss often, but not always", () => {
  for (const id of ["cathedral", "colosseum"] as const) {
    const rate = winRate(id, AVERAGE);
    assert.ok(rate >= 0.45 && rate <= 0.95, `${id}: average bot wins ${(rate * 100).toFixed(0)}%`);
  }
});

void test("careless play loses to the final keeper more often than it wins", () => {
  const rate = winRate("colosseum", CARELESS);
  assert.ok(rate < 0.5, `careless bot wins ${(rate * 100).toFixed(0)}%`);
  assert.ok(winRate("cathedral", AVERAGE) >= winRate("colosseum", AVERAGE));
});

void test("parrying is a skill that pays: an average player who parries wins more often", () => {
  for (const id of ["cathedral", "colosseum"] as const) {
    const parrying = winRate(id, PARRYING),
      rolling = winRate(id, AVERAGE);
    assert.ok(parrying > rolling, `${id}: parrying ${parrying}, rolling ${rolling}`);
    assert.ok(parrying < 0.99, `${id}: parrying must not trivialise the fight`);
  }
});
