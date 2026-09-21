import { swordHitActive } from "./characterAnimations.ts";
import { combatTuning } from "./combatTuning.ts";

export type BossPhase = "approach" | "windup" | "strike" | "recovery" | "defeated";
export function createEncounter() {
  return {
    health: combatTuning.playerMaxHealth,
    stamina: 100,
    bossHealth: combatTuning.bossMaxHealth,
    playerX: 0,
    playerZ: 8,
    playerYaw: Math.PI,
    bossX: 0,
    bossZ: -7,
    bossYaw: 0,
    phase: "approach" as BossPhase,
    timer: 0,
    attackTime: 0,
    attackId: 0,
    hitAttackId: 0,
    inputAttack: 0,
    invulnerable: false,
    hurtTime: 0,
  };
}
export type Encounter = ReturnType<typeof createEncounter>;

export function stepEncounter(state: Encounter, delta: number) {
  if (state.health <= 0 || state.bossHealth <= 0) {
    if (state.bossHealth <= 0) state.phase = "defeated";
    return;
  }
  const dt = Math.min(delta, 0.05);
  state.hurtTime = Math.max(0, state.hurtTime - dt);
  if (state.attackTime <= 0 && !state.invulnerable)
    state.stamina = Math.min(100, state.stamina + combatTuning.staminaRegen * dt);
  const dx = state.playerX - state.bossX,
    dz = state.playerZ - state.bossZ;
  const distance = Math.hypot(dx, dz);
  if (
    state.attackTime > 0 &&
    swordHitActive(state.attackId, state.attackTime) &&
    state.attackId !== state.hitAttackId
  ) {
    state.hitAttackId = state.attackId;
    const facing =
      (-dx * Math.sin(state.playerYaw) - dz * Math.cos(state.playerYaw)) / Math.max(distance, 0.01);
    if (distance < combatTuning.hitDistance && facing > combatTuning.hitFacingThreshold) {
      const dmg =
        state.phase === "recovery"
          ? combatTuning.baseDamage + combatTuning.recoveryBonusDamage
          : combatTuning.baseDamage;
      state.bossHealth = Math.max(0, state.bossHealth - dmg);
    }
  }
  if (state.bossHealth <= 0) {
    state.phase = "defeated";
    return;
  }
  const enraged = state.bossHealth <= combatTuning.enrageThreshold;
  state.timer += dt;
  if (state.phase === "approach") {
    state.bossYaw = Math.atan2(dx, dz);
    if (distance > combatTuning.approachStopDistance) {
      const speed = enraged ? combatTuning.approachSpeedEnraged : combatTuning.approachSpeed;
      const step = Math.min(distance - combatTuning.approachStopDistance, dt * speed);
      state.bossX += (dx / distance) * step;
      state.bossZ += (dz / distance) * step;
    } else {
      state.phase = "windup";
      state.timer = 0;
    }
  } else if (
    state.phase === "windup" &&
    state.timer > (enraged ? combatTuning.windupDurationEnraged : combatTuning.windupDuration)
  ) {
    state.phase = "strike";
    state.timer = 0;
    const frontal =
      (dx * Math.sin(state.bossYaw) + dz * Math.cos(state.bossYaw)) / Math.max(distance, 0.01);
    if (distance < combatTuning.bossStrikeRange && frontal > 0 && !state.invulnerable) {
      state.health = Math.max(0, state.health - combatTuning.bossDamage);
      state.hurtTime = 0.4;
    }
  } else if (state.phase === "strike" && state.timer > combatTuning.strikeDuration) {
    state.phase = "recovery";
    state.timer = 0;
  } else if (
    state.phase === "recovery" &&
    state.timer > (enraged ? combatTuning.recoveryDurationEnraged : combatTuning.recoveryDuration)
  ) {
    state.phase = "approach";
    state.timer = 0;
  }
}
