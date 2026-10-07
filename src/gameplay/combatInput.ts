import { swordAttackDuration } from "./characterAnimations.ts";

export const ACTION_BUFFER_SECONDS = 0.18;
/** Dodge opens in recovery, after the authored sword damage window has closed. */
export const ATTACK_DODGE_PROGRESS = 0.65;
export function createCombatInput(attackPress = 0, rollPress = 0) {
  return { attackPress, rollPress, attack: 0, dodge: 0 };
}
export type CombatInput = ReturnType<typeof createCombatInput>;
export interface ActionContext {
  blocked: boolean;
  stunned: boolean;
  grounded: boolean;
  rolling: boolean;
  cooldown: number;
  attackId: number;
  attackRemaining: number;
  stamina: number;
  canAttack: boolean;
}

/** One recent intent per action, never an unbounded combo/roll queue. */
export function stepCombatInput(
  buffer: CombatInput,
  input: { attackPress: number; rollPress: number },
  state: ActionContext,
  delta: number,
) {
  buffer.attack = Math.max(0, buffer.attack - delta);
  buffer.dodge = Math.max(0, buffer.dodge - delta);
  if (buffer.attackPress !== input.attackPress) buffer.attack = ACTION_BUFFER_SECONDS;
  if (buffer.rollPress !== input.rollPress) buffer.dodge = ACTION_BUFFER_SECONDS;
  buffer.attackPress = input.attackPress;
  buffer.rollPress = input.rollPress;
  if (state.blocked) {
    buffer.attack = buffer.dodge = 0;
    return { attack: false, dodge: false };
  }
  if (state.stunned || !state.grounded || state.rolling) return { attack: false, dodge: false };
  const canDodge =
    state.attackRemaining <= 0 ||
    1 - state.attackRemaining / swordAttackDuration(state.attackId) >= ATTACK_DODGE_PROGRESS;
  if (buffer.dodge > 0 && canDodge && state.cooldown <= 0 && state.stamina >= 25) {
    buffer.dodge = buffer.attack = 0;
    return { attack: false, dodge: true };
  }
  if (buffer.attack > 0 && state.canAttack && state.attackRemaining <= 0 && state.stamina >= 20) {
    buffer.attack = 0;
    return { attack: true, dodge: false };
  }
  return { attack: false, dodge: false };
}
