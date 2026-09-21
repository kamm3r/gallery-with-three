/**
 * Live-tunable combat + hitbox parameters.
 * `combatTuning` is a mutable singleton so `bossEncounter.ts` (pure simulation)
 * can read it without React hooks, while a Leva panel mutates it at runtime.
 */
export const combatTuning = {
  // — Sword hitbox —
  hitDistance: 3.4,
  hitFacingThreshold: 0.1,
  hitWindowStart: 0.3,
  hitWindowEnd: 0.5,
  /** Forward offset from PlayerSword pivot to tip along local -Z (world units). */
  swordTipOffset: 0.85,
  swordTipRadius: 0.6,
  showHitbox: false,

  // — Damage —
  baseDamage: 25,
  recoveryBonusDamage: 15, // + base = 40 when boss in recovery
  bossDamage: 25,

  // — Health —
  bossMaxHealth: 300,
  playerMaxHealth: 100,
  enrageThreshold: 150,

  // — Stamina —
  attackStaminaCost: 20,
  rollStaminaCost: 25,
  staminaRegen: 22,

  // — Boss locomotion —
  approachSpeed: 2.3,
  approachSpeedEnraged: 3.2,
  approachStopDistance: 2.8,

  // — Boss phases (seconds) —
  windupDuration: 1,
  windupDurationEnraged: 0.65,
  strikeDuration: 0.2,
  recoveryDuration: 1.6,
  recoveryDurationEnraged: 1,

  // — Boss attack reach —
  bossStrikeRange: 4.8,

  // — Diagnostics —
  perfEnabled: false,
};

export type CombatTuning = typeof combatTuning;
