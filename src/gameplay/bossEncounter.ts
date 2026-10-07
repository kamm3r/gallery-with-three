import { swordHitActive } from "./characterAnimations.ts";
import { combatTuning } from "./combatTuning.ts";

type BossPhase = "approach" | "windup" | "strike" | "recovery" | "roar" | "defeated";
export type BossMove = "sweep" | "slam" | "combo" | "leap" | "nova";

/** Seconds the player is staggered (no input, knocked back) after a hit. */
export const PLAYER_HURT_TIME = 0.45;
/** The Warden keeps its fights inside the ring of pillars. */
const ARENA_RADIUS = 16;

export interface BossHit {
  /** Seconds into the strike phase. */
  at: number;
  damage: number;
  /** Reach from the Warden's centre. */
  range: number;
  /** Minimum cosine between the Warden's facing and the player; -1 hits all around. */
  arc: number;
  knockback: number;
  /** Camera shake on impact, hit or miss (0..1). */
  shake: number;
}

export interface MoveSpec {
  windup: number;
  windupEnraged: number;
  /** Active phase length; hits fire inside it. */
  strike: number;
  recovery: number;
  recoveryEnraged: number;
  hits: BossHit[];
  /** Only chosen when the player stands within [minRange, maxRange]. */
  minRange: number;
  maxRange: number;
  weight: number;
  enragedOnly?: boolean;
  /** Seconds before the move may be chosen again. */
  cooldown: number;
  /** Turn rate toward the player while winding up (rad/s). Delayed swings read late. */
  tracking: number;
  /** Turn rate and forward drift during the strike, for chained swings. */
  strikeTracking?: number;
  lunge?: number;
}

/** Move table. The sweep reads the live tuning panel; the rest are authored. */
export function moveSpec(move: BossMove): MoveSpec {
  const t = combatTuning;
  switch (move) {
    case "sweep":
      return {
        windup: t.windupDuration,
        windupEnraged: t.windupDurationEnraged,
        strike: Math.max(t.strikeDuration, 0.35),
        recovery: t.recoveryDuration,
        recoveryEnraged: t.recoveryDurationEnraged,
        hits: [
          {
            at: 0,
            damage: t.bossDamage,
            range: t.bossStrikeRange,
            arc: 0,
            knockback: 6,
            shake: 0.2,
          },
        ],
        minRange: 0,
        maxRange: 5,
        weight: 3,
        cooldown: 0,
        tracking: 3.2,
      };
    case "slam":
      // Delayed overhead: the long hold baits early rolls, the long recovery pays out.
      return {
        windup: 1.35,
        windupEnraged: 1.05,
        strike: 0.4,
        recovery: 2.1,
        recoveryEnraged: 1.5,
        hits: [{ at: 0.05, damage: 40, range: 5.6, arc: 0.72, knockback: 9, shake: 0.7 }],
        minRange: 0,
        maxRange: 6,
        weight: 2,
        cooldown: 3,
        tracking: 1.6,
      };
    case "combo":
      // Right swipe, left swipe, overhead finisher; steps in and re-aims between swings.
      return {
        windup: 0.75,
        windupEnraged: 0.55,
        strike: 1.7,
        recovery: 1.5,
        recoveryEnraged: 1.1,
        hits: [
          { at: 0.1, damage: 16, range: 4.4, arc: 0.1, knockback: 3, shake: 0.15 },
          { at: 0.65, damage: 16, range: 4.4, arc: 0.1, knockback: 3, shake: 0.15 },
          { at: 1.35, damage: 28, range: 5, arc: 0.6, knockback: 8, shake: 0.55 },
        ],
        minRange: 0,
        maxRange: 5,
        weight: 2,
        cooldown: 4,
        tracking: 2.8,
        strikeTracking: 2.4,
        lunge: 2.2,
      };
    case "leap":
      // Gap closer: crouch, launch at where the player stood when it left the ground.
      return {
        windup: 0.8,
        windupEnraged: 0.6,
        strike: 1.05,
        recovery: 1.6,
        recoveryEnraged: 1.2,
        hits: [{ at: LEAP_AIRTIME, damage: 32, range: 3.8, arc: -1, knockback: 10, shake: 0.9 }],
        minRange: 8,
        maxRange: Infinity,
        weight: 4,
        cooldown: 6,
        tracking: 4,
      };
    case "nova":
      // Phase two only: gathers embers, then erupts all around. Roll through or run.
      return {
        windup: 1.4,
        windupEnraged: 1.4,
        strike: 0.5,
        recovery: 2.2,
        recoveryEnraged: 2.2,
        hits: [{ at: 0.05, damage: 34, range: 6.4, arc: -1, knockback: 11, shake: 1 }],
        minRange: 0,
        maxRange: 7,
        weight: 2,
        enragedOnly: true,
        cooldown: 9,
        tracking: 0,
      };
  }
}

export const LEAP_AIRTIME = 0.75;
const LEAP_HEIGHT = 4.5;
export const ROAR_DURATION = 2;
const ROAR_HIT: BossHit = { at: 0.6, damage: 10, range: 4.8, arc: -1, knockback: 12, shake: 1 };
const MOVES: BossMove[] = ["sweep", "slam", "combo", "leap", "nova"];

export function createEncounter(groundY = 0) {
  return {
    health: combatTuning.playerMaxHealth,
    stamina: 100,
    bossHealth: combatTuning.bossMaxHealth,
    playerX: 0,
    playerY: 0,
    playerZ: 8,
    playerYaw: Math.PI,
    bossX: 0,
    bossY: groundY,
    groundY,
    bossZ: -7,
    bossYaw: 0,
    bossActive: true,
    freezeOnVictory: true,
    fatalFalls: false,
    phase: "approach" as BossPhase,
    move: "sweep" as BossMove,
    lastMove: null as BossMove | null,
    // The opening leap waits a beat so arriving players can get their bearings.
    cooldowns: { sweep: 0, slam: 0, combo: 0, leap: 3, nova: 0 } as Record<BossMove, number>,
    /** Index of the next hit to resolve in the current strike. */
    hitIndex: 0,
    timer: 0,
    /** Second phase: faster, adds the nova, entered once through a roar. */
    enraged: false,
    leapFromX: 0,
    leapFromZ: 0,
    leapToX: 0,
    leapToZ: 0,
    seed: 0x2f6b1d,
    attackTime: 0,
    attackId: 0,
    hitAttackId: 0,
    inputAttack: 0,
    invulnerable: false,
    hurtTime: 0,
    knockX: 0,
    knockZ: 0,
    /** Camera shake, decays to 0. */
    shake: 0,
    /** Hit flash on the Warden, decays to 0. */
    bossFlash: 0,
    /** Increments on every landed Warden impact (VFX/SFX cue). */
    impactId: 0,
    impactX: 0,
    impactZ: 0,
    impactRange: 0,
    /** 0..1 weight of the latest impact (shake of the hit). */
    impactForce: 0,
    /** Increments whenever the player takes damage. */
    playerHitId: 0,
    /** Increments whenever the player's sword connects. */
    bossHitId: 0,
  };
}
export type Encounter = ReturnType<typeof createEncounter>;

function random(state: Encounter) {
  // Deterministic LCG so tests and replays pick the same moves.
  state.seed = (Math.imul(state.seed, 1664525) + 1013904223) >>> 0;
  return state.seed / 4294967296;
}

function turnToward(state: Encounter, target: number, rate: number, dt: number) {
  let diff = target - state.bossYaw;
  diff = Math.atan2(Math.sin(diff), Math.cos(diff));
  const step = rate * dt;
  state.bossYaw += Math.max(-step, Math.min(step, diff));
}

export function chooseMove(state: Encounter, distance: number): BossMove | null {
  const options = MOVES.filter((move) => {
    const spec = moveSpec(move);
    return (
      state.cooldowns[move] <= 0 &&
      (!spec.enragedOnly || state.enraged) &&
      distance >= spec.minRange &&
      distance <= spec.maxRange
    );
  });
  if (!options.length) return null;
  // Never throw the same move twice in a row when there's a choice.
  const pool = options.length > 1 ? options.filter((move) => move !== state.lastMove) : options;
  const total = pool.reduce((sum, move) => sum + moveSpec(move).weight, 0);
  let roll = random(state) * total;
  for (const move of pool) {
    roll -= moveSpec(move).weight;
    if (roll <= 0) return move;
  }
  return pool[pool.length - 1];
}

function beginMove(state: Encounter, move: BossMove) {
  state.move = move;
  state.phase = "windup";
  state.timer = 0;
  state.hitIndex = 0;
}

function resolveHit(state: Encounter, hit: BossHit) {
  const dx = state.playerX - state.bossX,
    dz = state.playerZ - state.bossZ;
  const distance = Math.hypot(dx, dz);
  const frontal =
    (dx * Math.sin(state.bossYaw) + dz * Math.cos(state.bossYaw)) / Math.max(distance, 0.01);
  state.shake = Math.max(state.shake, hit.shake);
  state.impactId++;
  state.impactX = state.bossX + Math.sin(state.bossYaw) * (hit.arc > -1 ? hit.range * 0.55 : 0);
  state.impactZ = state.bossZ + Math.cos(state.bossYaw) * (hit.arc > -1 ? hit.range * 0.55 : 0);
  state.impactRange = hit.range;
  state.impactForce = hit.shake;
  if (distance >= hit.range || (hit.arc > -1 && frontal <= hit.arc) || state.invulnerable) return;
  state.health = Math.max(0, state.health - hit.damage);
  if (hit.damage > 0) state.playerHitId++;
  state.hurtTime = PLAYER_HURT_TIME;
  const nx = distance > 0.01 ? dx / distance : Math.sin(state.bossYaw);
  const nz = distance > 0.01 ? dz / distance : Math.cos(state.bossYaw);
  state.knockX = nx * hit.knockback;
  state.knockZ = nz * hit.knockback;
  state.shake = Math.max(state.shake, 0.5);
}

/** Warden height during a leap: a ballistic arc landing at LEAP_AIRTIME. */
function leapHeight(timer: number) {
  const t = Math.min(1, Math.max(0, timer / LEAP_AIRTIME));
  return 4 * LEAP_HEIGHT * t * (1 - t);
}

export function stepEncounter(state: Encounter, delta: number) {
  const dt = Math.min(delta, 0.05);
  state.shake = Math.max(0, state.shake - dt * 2.2);
  state.bossFlash = Math.max(0, state.bossFlash - dt * 5);
  if (state.health <= 0 || state.bossHealth <= 0) {
    if (state.bossHealth <= 0) {
      state.phase = "defeated";
      state.bossY = state.groundY;
      if (!state.freezeOnVictory) {
        state.hurtTime = 0;
        state.stamina = Math.min(100, state.stamina + combatTuning.staminaRegen * dt);
      }
    }
    return;
  }
  state.hurtTime = Math.max(0, state.hurtTime - dt);
  for (const move of MOVES) state.cooldowns[move] = Math.max(0, state.cooldowns[move] - dt);
  if (state.attackTime <= 0 && !state.invulnerable)
    state.stamina = Math.min(100, state.stamina + combatTuning.staminaRegen * dt);
  if (!state.bossActive) return;
  let dx = state.playerX - state.bossX,
    dz = state.playerZ - state.bossZ;
  let distance = Math.hypot(dx, dz);
  const airborne = state.phase === "strike" && state.move === "leap" && state.timer < LEAP_AIRTIME;
  if (
    state.attackTime > 0 &&
    swordHitActive(state.attackId, state.attackTime) &&
    state.attackId !== state.hitAttackId
  ) {
    state.hitAttackId = state.attackId;
    const facing =
      (-dx * Math.sin(state.playerYaw) - dz * Math.cos(state.playerYaw)) / Math.max(distance, 0.01);
    if (
      !airborne &&
      distance < combatTuning.hitDistance &&
      facing > combatTuning.hitFacingThreshold
    ) {
      const dmg =
        state.phase === "recovery"
          ? combatTuning.baseDamage + combatTuning.recoveryBonusDamage
          : combatTuning.baseDamage;
      state.bossHealth = Math.max(0, state.bossHealth - dmg);
      state.bossFlash = 1;
      state.bossHitId++;
      state.shake = Math.max(state.shake, 0.12);
    }
  }
  if (state.bossHealth <= 0) {
    state.phase = "defeated";
    state.bossY = state.groundY;
    return;
  }
  const enraged = state.enraged;
  state.timer += dt;
  const spec = moveSpec(state.move);
  const targetYaw = Math.atan2(dx, dz);

  if (state.phase === "approach") {
    turnToward(state, targetYaw, enraged ? 6 : 4.5, dt);
    if (!state.enraged && state.bossHealth <= combatTuning.enrageThreshold) {
      state.enraged = true;
      state.phase = "roar";
      state.timer = 0;
      state.hitIndex = 0;
      return;
    }
    const leap = distance >= moveSpec("leap").minRange ? chooseMove(state, distance) : null;
    if (leap) {
      beginMove(state, leap);
    } else if (distance > combatTuning.approachStopDistance) {
      const speed = enraged ? combatTuning.approachSpeedEnraged : combatTuning.approachSpeed;
      const step = Math.min(distance - combatTuning.approachStopDistance, dt * speed);
      state.bossX += (dx / distance) * step;
      state.bossZ += (dz / distance) * step;
    } else {
      const move = chooseMove(state, distance);
      if (move) beginMove(state, move);
    }
  } else if (state.phase === "roar") {
    if (state.hitIndex === 0 && state.timer >= ROAR_HIT.at) {
      state.hitIndex = 1;
      resolveHit(state, ROAR_HIT);
    }
    if (state.timer > ROAR_DURATION) {
      state.phase = "approach";
      state.timer = 0;
    }
  } else if (state.phase === "windup") {
    if (spec.tracking) turnToward(state, targetYaw, spec.tracking, dt);
    if (state.timer > (enraged ? spec.windupEnraged : spec.windup)) {
      state.phase = "strike";
      state.timer = 0;
      state.hitIndex = 0;
      state.lastMove = state.move;
      state.cooldowns[state.move] = spec.cooldown;
      if (state.move === "leap") {
        // Commit to where the player stands right now, kept inside the pillars.
        const reach = Math.hypot(state.playerX, state.playerZ);
        const clamp = reach > ARENA_RADIUS ? ARENA_RADIUS / reach : 1;
        state.leapFromX = state.bossX;
        state.leapFromZ = state.bossZ;
        state.leapToX = state.playerX * clamp;
        state.leapToZ = state.playerZ * clamp;
        state.bossYaw = targetYaw;
      }
    }
  } else if (state.phase === "strike") {
    if (state.move === "leap") {
      const t = Math.min(1, state.timer / LEAP_AIRTIME);
      const ease = t * t * (3 - 2 * t);
      state.bossX = state.leapFromX + (state.leapToX - state.leapFromX) * ease;
      state.bossZ = state.leapFromZ + (state.leapToZ - state.leapFromZ) * ease;
      state.bossY = state.groundY + leapHeight(state.timer);
      dx = state.playerX - state.bossX;
      dz = state.playerZ - state.bossZ;
      distance = Math.hypot(dx, dz);
    }
    if (spec.strikeTracking) {
      // Re-aim between chained swings, never while one is landing.
      const next = spec.hits[state.hitIndex];
      if (next && next.at - state.timer > 0.12)
        turnToward(state, Math.atan2(dx, dz), spec.strikeTracking, dt);
      if (spec.lunge && distance > 2.2 && next && next.at - state.timer < 0.35) {
        const step = Math.min(distance - 2.2, spec.lunge * dt);
        state.bossX += Math.sin(state.bossYaw) * step;
        state.bossZ += Math.cos(state.bossYaw) * step;
      }
    }
    while (state.hitIndex < spec.hits.length && state.timer >= spec.hits[state.hitIndex].at) {
      resolveHit(state, spec.hits[state.hitIndex]);
      state.hitIndex++;
    }
    if (state.timer > spec.strike) {
      state.phase = "recovery";
      state.timer = 0;
      state.bossY = state.groundY;
    }
  } else if (
    state.phase === "recovery" &&
    state.timer > (enraged ? spec.recoveryEnraged : spec.recovery)
  ) {
    state.phase = "approach";
    state.timer = 0;
  }
}
