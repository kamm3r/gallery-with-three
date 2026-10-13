import { swordProgress, swordSpec } from "./characterAnimations.ts";
import { ROLL_ATTACK_FROM } from "./playerRules.ts";

export const ACTION_BUFFER_SECONDS = 0.18;
export function createCombatInput(attackPress = 0, rollPress = 0) {
  return { attackPress, rollPress, attack: 0, dodge: 0 };
}
export type CombatInput = ReturnType<typeof createCombatInput>;
export interface ActionContext {
  blocked: boolean;
  stunned: boolean;
  grounded: boolean;
  rolling: boolean;
  /** Seconds into the current roll; late in a roll an attack cancels it. */
  rollElapsed?: number;
  cooldown: number;
  /** The swing of the light chain that is playing. */
  attackStep: number;
  attackRemaining: number;
  stamina: number;
  canAttack: boolean;
}

/**
 * One recent intent per action, never an unbounded combo/roll queue. Cancel windows:
 * a swing gives way to the next swing from its `chainFrom` and to a roll from its
 * `rollFrom`, both after its hit; a roll gives way to a roll attack late in its tail.
 * Like the genre, actions only need some stamina left, not their full cost.
 */
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
  if (state.stunned) return { attack: false, dodge: false };
  if (!state.grounded) {
    // In the air only an attack comes out: a jump attack or a plunge.
    if (
      buffer.attack > 0 &&
      state.canAttack &&
      state.stamina > 0 &&
      state.attackRemaining <= 0 &&
      !state.rolling
    ) {
      buffer.attack = 0;
      return { attack: true, dodge: false };
    }
    return { attack: false, dodge: false };
  }
  if (state.rolling) {
    if (
      buffer.attack > 0 &&
      state.canAttack &&
      state.stamina > 0 &&
      (state.rollElapsed ?? 0) >= ROLL_ATTACK_FROM
    ) {
      buffer.attack = 0;
      return { attack: true, dodge: false };
    }
    return { attack: false, dodge: false };
  }
  const swinging = state.attackRemaining > 0,
    progress = swinging ? swordProgress(state.attackStep, state.attackRemaining) : 1,
    spec = swordSpec(state.attackStep);
  if (
    buffer.dodge > 0 &&
    (!swinging || progress >= spec.rollFrom) &&
    state.cooldown <= 0 &&
    state.stamina > 0
  ) {
    buffer.dodge = buffer.attack = 0;
    return { attack: false, dodge: true };
  }
  if (
    buffer.attack > 0 &&
    state.canAttack &&
    (!swinging || progress >= spec.chainFrom) &&
    state.stamina > 0
  ) {
    buffer.attack = 0;
    return { attack: true, dodge: false };
  }
  return { attack: false, dodge: false };
}
