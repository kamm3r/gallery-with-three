// A small inventory any world can use. It's scoped to the portal you're in:
// a level opens its own inventory when you arrive (with its own catalogue of
// items) and it is cleared when you leave, so nothing carries between worlds
// yet. Plain module state with subscribe(), so React (useInventory) and
// per-frame game code (getInventory) read the same thing.

export type ItemIcon = "flashlight" | "key" | "gas" | "battery" | "fuse" | "medkit" | "drink";

export interface ItemDef {
  id: string;
  name: string;
  description: string;
  icon: ItemIcon;
  /** Using it switches it on and off (a flashlight); otherwise it's just carried. */
  toggle?: boolean;
  /** Using it spends it, if the world says it did something (see onUse). */
  consumable?: boolean;
}

interface Slot {
  id: string;
  /** For toggle items. */
  on: boolean;
}

export interface Inventory {
  /** Portal/world that owns this inventory, or null outside any. */
  scope: string | null;
  catalogue: Record<string, ItemDef>;
  slots: Slot[];
  /** Index of the last slot used or picked. */
  selected: number;
}

export const MAX_SLOTS = 8;

const empty: Inventory = { scope: null, catalogue: {}, slots: [], selected: 0 };
let state: Inventory = empty;
const listeners = new Set<() => void>();
const users = new Set<(id: string) => boolean>();

/**
 * The world decides what using a consumable does. Return true if it did
 * something (it's spent); false leaves it in the inventory.
 */
export function onUse(handler: (id: string) => boolean) {
  users.add(handler);
  return () => {
    users.delete(handler);
  };
}

function commit(next: Inventory) {
  state = next;
  listeners.forEach((listener) => listener());
}

export function subscribeInventory(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export const getInventory = () => state;

/** Arrive in a world: a fresh inventory with its catalogue and starting items. */
export function openInventory(
  scope: string,
  catalogue: ItemDef[],
  start: { id: string; on?: boolean }[] = [],
) {
  commit({
    scope,
    catalogue: Object.fromEntries(catalogue.map((item) => [item.id, item])),
    slots: start.slice(0, MAX_SLOTS).map(({ id, on = false }) => ({ id, on })),
    selected: 0,
  });
}

/** Leave a world: its inventory goes with it (only if it's still the open one). */
export function closeInventory(scope: string) {
  if (state.scope === scope) commit(empty);
}

export function hasItem(id: string) {
  return state.slots.some((slot) => slot.id === id);
}

export function isOn(id: string) {
  return state.slots.some((slot) => slot.id === id && slot.on);
}

/** Returns false if there's no room or the item isn't known to this world. */
export function addItem(id: string) {
  if (!state.catalogue[id] || state.slots.length >= MAX_SLOTS) return false;
  commit({ ...state, slots: [...state.slots, { id, on: false }] });
  return true;
}

export function removeItem(id: string) {
  const index = state.slots.findIndex((slot) => slot.id === id);
  if (index < 0) return false;
  const slots = state.slots.filter((_, i) => i !== index);
  commit({ ...state, slots, selected: Math.min(state.selected, Math.max(0, slots.length - 1)) });
  return true;
}

/**
 * Use the item in a slot: toggle items switch on/off; others are just
 * selected. Returns what happened, or null for an empty slot.
 */
export function activateSlot(
  index: number,
): { item: ItemDef; on: boolean; spent?: boolean } | null {
  const slot = state.slots[index];
  if (!slot) return null;
  const item = state.catalogue[slot.id];
  if (item.consumable) {
    const spent = [...users].some((use) => use(item.id));
    if (spent) {
      const slots = state.slots.filter((_, i) => i !== index);
      commit({ ...state, slots, selected: Math.min(index, Math.max(0, slots.length - 1)) });
    }
    return { item, on: false, spent };
  }
  const slots = item.toggle
    ? state.slots.map((s, i) => (i === index ? { ...s, on: !s.on } : s))
    : state.slots;
  commit({ ...state, slots, selected: index });
  return { item, on: slots[index].on };
}
