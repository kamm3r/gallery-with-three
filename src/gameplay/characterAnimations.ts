import { combatTuning } from "./combatTuning.ts";
export const CHARACTER_MODEL =
  "/assets/quaternius/ultimate-animated-character/Casual_Male_gameplay.glb";

/** A rigged character file carrying the gameplay clips (Idle, Walk, SwordSlash, ...). */
export type CharacterModelSpec = {
  path: string;
  /** World metres per model unit at the default 1.84 m capsule. */
  unitScale: number;
  /** Bones the guard pose is laid over while the legs keep walking. */
  upperBones: ReadonlySet<string>;
  /** Where held items (the flashlight) mount; first match wins. */
  mounts: readonly string[];
  /** Mount offset and scale for the flashlight, in the mount's own units. */
  torch: { offset: number; scale: number };
  /** Wrist height in the LedgeHang pose, metres above the feet. */
  ledgeHandHeight: number;
};

// glTF node names lose their dots on load ("UpperArm.L" becomes "UpperArmL").
export const CASUAL_MODEL: CharacterModelSpec = {
  path: CHARACTER_MODEL,
  unitScale: 0.82,
  upperBones: new Set(
    ["Abdomen", "Torso", "Neck", "Head"].concat(
      ...["L", "R"].map((s) => ["Shoulder", "UpperArm", "LowerArm", "Fist"].map((b) => b + s)),
    ),
  ),
  mounts: ["FistR", "Fist.R"],
  torch: { offset: 0.14, scale: 1.3 },
  ledgeHandHeight: 2.16,
};

/**
 * The PS2 Cathedral Pilgrim on the UAL2 skeleton, with every gameplay clip retargeted
 * by scripts/retargetPilgrimGameplay.py (see gameplay-manifest.json for the measured values).
 */
export const PILGRIM_MODEL: CharacterModelSpec = {
  path: "/assets/characters/ashen-parish/pilgrim-ps2/cathedral-pilgrim-ps2-gameplay.glb",
  unitScale: 1.05,
  upperBones: new Set(
    ["spine_01", "spine_02", "spine_03", "neck_01", "Head"].concat(
      ...["l", "r"].map((s) =>
        ["clavicle", "upperarm", "lowerarm", "hand"].map((b) => `${b}_${s}`),
      ),
    ),
  ),
  mounts: ["SwordSocket"],
  torch: { offset: 0, scale: (1.3 * 0.82) / 1.05 },
  ledgeHandHeight: 1.855,
};

/** The model the player wears. */
export const PLAYER_MODEL = PILGRIM_MODEL;
export const CLIP_SECONDS: Record<string, number> = {
  LedgeGrab: 0.2,
  LedgeClimb: 1,
  JumpRise: 0.3,
  JumpFall: 0.6,
  JumpLand: 0.2,
  SitEnter: 0.65,
  SitExit: 0.8,
  SwordSlashQuick: 0.6,
  SwordSlash: 0.82,
  SwordSlashHeavy: 0.8,
  JumpAttack: 0.75,
  PlungeLand: 0.7,
  Parry: 0.7,
  GuardHit: 0.35,
};
// Measured wrist height in the player's authored LedgeHang pose.
export const LEDGE_HAND_HEIGHT = PLAYER_MODEL.ledgeHandHeight;

/**
 * The light attack chain: three swings, each with its own frame data. Times are
 * fractions of the swing. The hit lands between `hitStart` and `hitEnd`; the next
 * swing can cancel this one from `chainFrom` (after its hit), and a roll can cancel
 * it from `rollFrom`. `motion` scales the base damage, `poise` breaks enemy poise,
 * and `hitStop` freezes attacker and target when the blow lands.
 */
export const SWORD_MOVES = [
  {
    clip: "SwordSlashQuick",
    hitStart: -1,
    hitEnd: -1,
    chainFrom: 0.52,
    rollFrom: 0.55,
    motion: 1,
    stamina: 16,
    poise: 25,
    hitStop: 0.06,
    armor: [2, 2],
    radius: 0,
  },
  {
    clip: "SwordSlash",
    hitStart: 0.3,
    hitEnd: 0.48,
    chainFrom: 0.55,
    rollFrom: 0.58,
    motion: 1.1,
    stamina: 18,
    poise: 30,
    hitStop: 0.07,
    armor: [2, 2],
    radius: 0,
  },
  {
    clip: "SwordSlashHeavy",
    hitStart: 0.3,
    hitEnd: 0.5,
    chainFrom: 2,
    rollFrom: 0.62,
    motion: 1.5,
    stamina: 24,
    poise: 45,
    hitStop: 0.11,
    // The heavy swing shrugs off flinches from its wind-up through the cut.
    armor: [0.12, 0.55],
    radius: 0,
  },
  {
    // A jump attack: an overhead cut delivered from the air, armoured throughout.
    clip: "JumpAttack",
    hitStart: 0.45,
    hitEnd: 0.68,
    chainFrom: 2,
    rollFrom: 0.75,
    motion: 1.6,
    stamina: 22,
    poise: 50,
    hitStop: 0.12,
    armor: [0, 0.8],
    radius: 0,
  },
  {
    // A plunge: the landing drives the blade down and strikes all around it.
    clip: "PlungeLand",
    hitStart: 0,
    hitEnd: 0.2,
    chainFrom: 2,
    rollFrom: 0.6,
    motion: 2.6,
    stamina: 18,
    poise: 80,
    hitStop: 0.16,
    armor: [0, 0.5],
    radius: 2.6,
  },
] as const;
/** The light chain: the first three moves. */
export const SWORD_CHAIN = SWORD_MOVES.slice(0, 3);
export const JUMP_ATTACK = 3;
export const PLUNGE_ATTACK = 4;
/** A fall from at least this far above the ground below turns an attack into a plunge. */
export const PLUNGE_HEIGHT = 2.4;
/** Seconds after a swing ends during which another press still continues the chain. */
export const CHAIN_GRACE = 0.35;
export type SwordStep = 0 | 1 | 2 | 3 | 4;
/** Chain steps wrap around the light chain; the aerial moves keep their own entries. */
export const swordStep = (step: number) =>
  (step === JUMP_ATTACK || step === PLUNGE_ATTACK ? step : ((step % 3) + 3) % 3) as SwordStep;
export function swordSpec(step: number) {
  const spec = SWORD_MOVES[swordStep(step)];
  // The quick swing's hit window follows the live tuning panel.
  return spec.hitStart < 0
    ? { ...spec, hitStart: combatTuning.hitWindowStart, hitEnd: combatTuning.hitWindowEnd }
    : spec;
}
export function swordAttackDuration(step: number) {
  return CLIP_SECONDS[SWORD_MOVES[swordStep(step)].clip];
}
/** Whether hyper-armour holds at this point of the swing. */
export function swordArmored(step: number, remaining: number) {
  const progress = swordProgress(step, remaining),
    [from, to] = SWORD_MOVES[swordStep(step)].armor;
  return remaining > 0 && progress >= from && progress <= to;
}
/** Progress through the current swing, 0 at its start and 1 at its end. */
export function swordProgress(step: number, remaining: number) {
  return 1 - remaining / swordAttackDuration(step);
}
export function swordHitActive(step: number, remaining: number) {
  const progress = swordProgress(step, remaining),
    spec = swordSpec(step);
  return progress >= spec.hitStart && progress <= spec.hitEnd;
}
/** The step a new press starts: the next in the chain if still inside it, else the first. */
export function nextSwordStep(step: number, swinging: boolean, sinceSwing: number): SwordStep {
  // After an aerial move, the ground chain starts afresh.
  if (step >= JUMP_ATTACK) return 0;
  return swinging || sinceSwing < CHAIN_GRACE ? (((step + 1) % 3) as SwordStep) : 0;
}

export function climbProgress(seconds: number) {
  const progress = Math.min(1, Math.max(0, seconds / CLIP_SECONDS.LedgeClimb));
  const up = Math.min(1, progress / 0.65);
  const forward = Math.max(0, (progress - 0.6) / 0.4);
  return {
    up: up * up * (3 - 2 * up),
    forward: forward * forward * (3 - 2 * forward),
    done: progress === 1,
  };
}
