/**
 * How a blow on the player resolves, shared by the Warden, every enemy and their
 * bolts: dodged (i-frames), parried, deflected, guarded, guard broken, armoured
 * through, or a plain hit. Guarding, deflecting and parrying only work against
 * blows from the front.
 */

/** A parry deflects blows landing this long after it starts. */
export const PARRY_WINDOW = [0.05, 0.21] as const;
/** The whole parry motion; it cannot be cancelled. */
export const PARRY_DURATION = 0.7;
export const PARRY_STAMINA = 12;
/** A parried attacker stays open this long; the next blow on it is a riposte. */
export const RIPOSTE_TIME = 2;
export const RIPOSTE_MULTIPLIER = 2;
/** Guarded blows cost stamina and let a sliver of damage through. */
export const GUARD_STAMINA_PER_DAMAGE = 1.2;
export const GUARD_CHIP = 0.12;
/** A guard broken by a stamina-draining blow staggers for longer than a hit. */
export const GUARD_BREAK_TIME = 1;
/** The guard's recoil when it holds. */
export const GUARD_HIT_TIME = 0.35;
/**
 * Sekiro's deflect: a guard raised just before a blow lands turns it aside for
 * free, with no chip damage and no stamina. Mashing the guard earns no window.
 */
export const DEFLECT_WINDOW = 0.16;
/** A guard press this soon after the previous one gets no deflect window. */
export const DEFLECT_MASH = 0.45;
/** The guard's recoil after a deflect: short, so a counter can follow. */
export const DEFLECT_RECOIL = 0.18;
/** Hyper-armour shrugs off flinches, but not blows this heavy. */
export const ARMOR_LIMIT = 40;
/** Blows are guardable or parryable within this cone in front of the player (cosine). */
const FRONT = 0.2;
const HURT_TIME = 0.45;

export interface DefenderState {
  health: number;
  stamina: number;
  staminaDelay: number;
  playerX: number;
  playerZ: number;
  playerYaw: number;
  invulnerable: boolean;
  hurtTime: number;
  knockX: number;
  knockZ: number;
  shake: number;
  playerHitId: number;
  guarding: boolean;
  /** Seconds since the parry started, or a negative number when not parrying. */
  parryTime: number;
  hyperArmor: boolean;
  guardHitTime: number;
  guardHitId: number;
  parryId: number;
  /** Seconds since a deflecting guard press, or a negative number when there is none. */
  deflectTime: number;
  /** Seconds since the guard was last pressed, for the mashing check. */
  sinceGuardPress: number;
  deflectId: number;
}

export type BlowOutcome =
  | "dodged"
  | "parried"
  | "deflected"
  | "guarded"
  | "broken"
  | "armored"
  | "hit";

export interface Blow {
  damage: number;
  /** Where the blow comes from. */
  x: number;
  z: number;
  knockback: number;
  shake?: number;
  parryable: boolean;
}

export function inParryWindow(parryTime: number) {
  return parryTime >= PARRY_WINDOW[0] && parryTime <= PARRY_WINDOW[1];
}

export function inDeflectWindow(deflectTime: number) {
  return deflectTime >= 0 && deflectTime <= DEFLECT_WINDOW;
}

/** Advances the deflect clocks; a guard press opens a window unless it is a mash. */
export function stepDeflect(
  d: Pick<DefenderState, "deflectTime" | "sinceGuardPress">,
  pressed: boolean,
  dt: number,
) {
  d.sinceGuardPress += dt;
  if (d.deflectTime >= 0) d.deflectTime += dt;
  if (!pressed) return;
  d.deflectTime = d.sinceGuardPress >= DEFLECT_MASH ? 0 : -1;
  d.sinceGuardPress = 0;
}

export function receiveBlow(d: DefenderState, blow: Blow): BlowOutcome {
  if (d.invulnerable) return "dodged";
  const dx = d.playerX - blow.x,
    dz = d.playerZ - blow.z,
    length = Math.max(0.01, Math.hypot(dx, dz));
  // The player faces (sin, cos) of their yaw; the blow arrives from -(dx, dz).
  const front = -(Math.sin(d.playerYaw) * dx + Math.cos(d.playerYaw) * dz) / length > FRONT;
  const push = (amount: number) => {
    d.knockX = (dx / length) * amount;
    d.knockZ = (dz / length) * amount;
  };
  d.shake = Math.max(d.shake, blow.shake ?? 0.3);
  if (front && blow.parryable && inParryWindow(d.parryTime)) {
    d.parryId++;
    return "parried";
  }
  if (front && d.guarding && inDeflectWindow(d.deflectTime)) {
    d.deflectId++;
    d.guardHitTime = DEFLECT_RECOIL;
    push(Math.min(1, blow.knockback * 0.15));
    return "deflected";
  }
  if (front && d.guarding) {
    d.stamina -= blow.damage * GUARD_STAMINA_PER_DAMAGE;
    d.staminaDelay = Math.max(d.staminaDelay, 0.6);
    if (d.stamina <= 0) {
      d.stamina = 0;
      d.guarding = false;
      d.health = Math.max(0, d.health - Math.round(blow.damage * 0.5));
      d.playerHitId++;
      d.hurtTime = GUARD_BREAK_TIME;
      push(blow.knockback * 0.6);
      return "broken";
    }
    d.health = Math.max(0, d.health - Math.round(blow.damage * GUARD_CHIP));
    d.guardHitTime = GUARD_HIT_TIME;
    d.guardHitId++;
    push(Math.min(2, blow.knockback * 0.3));
    return "guarded";
  }
  d.health = Math.max(0, d.health - blow.damage);
  if (blow.damage > 0) d.playerHitId++;
  if (d.hyperArmor && blow.damage < ARMOR_LIMIT) return "armored";
  d.hurtTime = HURT_TIME;
  push(blow.knockback);
  return "hit";
}
