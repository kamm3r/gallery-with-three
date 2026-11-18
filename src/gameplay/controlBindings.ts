export const defaultBindings = {
  forward: "KeyW",
  backward: "KeyS",
  left: "KeyA",
  right: "KeyD",
  jump: "KeyF",
  dodge: "Space",
  interact: "KeyE",
  attack: "KeyJ",
  lockOn: "KeyQ",
  guard: "KeyK",
  parry: "KeyL",
  crouch: "KeyC",
};
export type BindingAction = keyof typeof defaultBindings;
export type ControlBindings = Record<BindingAction, string>;
export const bindingLabels: Record<BindingAction, string> = {
  forward: "Move forward",
  backward: "Move backward",
  left: "Move left",
  right: "Move right",
  jump: "Jump / climb ledge",
  dodge: "Dodge",
  interact: "Use / interact",
  attack: "Attack",
  lockOn: "Lock on / release",
  guard: "Guard (hold) / deflect (tap)",
  parry: "Parry",
  crouch: "Crouch (hold)",
};

// These keys already operate menus or area-specific abilities.
export function isBindableCode(code: string) {
  return (
    /^(Key[A-Z]|Digit[0-9]|Space|Arrow(Up|Down|Left|Right)|Shift(Left|Right)|Control(Left|Right))$/.test(
      code,
    ) && !["KeyR", "KeyM", "Digit1"].includes(code)
  );
}
export function keyLabel(code: string) {
  const modifiers: Record<string, string> = {
    ShiftLeft: "Left Shift",
    ShiftRight: "Right Shift",
    ControlLeft: "Left Ctrl",
    ControlRight: "Right Ctrl",
  };
  return modifiers[code] ?? code.replace(/^Key|^Digit|^Arrow/, "");
}
export function rebind(
  bindings: ControlBindings,
  action: BindingAction,
  code: string,
): ControlBindings {
  if (!isBindableCode(code)) return bindings;
  const next = { ...bindings };
  for (const other of Object.keys(next) as BindingAction[]) {
    if (other !== action && next[other] === code) next[other] = bindings[action];
  }
  next[action] = code;
  return next;
}
const ADDED_LATER: BindingAction[] = ["lockOn", "guard", "parry", "crouch"];
const SPARE_KEYS = [
  ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").map((letter) => `Key${letter}`),
  ..."23456789".split("").map((digit) => `Digit${digit}`),
];
/**
 * @param reserved The saved dedicated sprint key: a newly added action must not take it.
 */
export function readBindings(saved: unknown, reserved?: unknown): ControlBindings {
  if (!saved || typeof saved !== "object") return { ...defaultBindings };
  const record = { ...(saved as Record<string, unknown>) };
  // Actions added after a map was saved take their default key while it is still free,
  // else the first free key, so a custom map is never thrown away for them.
  const taken = (code: string) => code === reserved || Object.values(record).includes(code);
  for (const key of ADDED_LATER)
    if (record[key] === undefined)
      record[key] = [defaultBindings[key], ...SPARE_KEYS].find(
        (code) => isBindableCode(code) && !taken(code),
      );
  const values = Object.keys(defaultBindings).map((key) => record[key]);
  // Partial/invalid maps fall back together so two actions never share a key.
  if (
    values.some((code) => typeof code !== "string" || !isBindableCode(code)) ||
    new Set(values).size !== values.length
  )
    return { ...defaultBindings };
  return Object.fromEntries(
    Object.keys(defaultBindings).map((key) => [key, record[key]]),
  ) as ControlBindings;
}

export const SPRINT_HOLD_MS = 250;
/** A held sprint never produces a dodge when released. */
export function releaseDodges(startedAt: number, releasedAt: number) {
  return releasedAt - startedAt < SPRINT_HOLD_MS;
}

/** Sprint uses the dodge key when null; dedicated keys cannot shadow movement aliases. */
export function readSprintKey(saved: unknown, bindings: ControlBindings): string | null {
  return typeof saved === "string" &&
    isBindableCode(saved) &&
    !saved.startsWith("Arrow") &&
    !Object.values(bindings).includes(saved)
    ? saved
    : null;
}
export function suggestedSprintKey(bindings: ControlBindings) {
  return [
    "ShiftLeft",
    "ShiftRight",
    "ControlLeft",
    ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").map((letter) => `Key${letter}`),
  ].find((code) => readSprintKey(code, bindings) !== null)!;
}
