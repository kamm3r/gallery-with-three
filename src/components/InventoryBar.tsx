import { useEffect, useState, useSyncExternalStore } from "react";
import { useGame } from "../gameSettings";
import {
  activateSlot,
  getInventory,
  MAX_SLOTS,
  subscribeInventory,
  type ItemDef,
  type ItemIcon,
} from "../gameplay/inventory";
import { isResultScreenActive } from "../gameplay/resultScreen";
import { playSound } from "../gameplay/sound";

// The hotbar for whatever inventory the current portal opened. Number keys
// (1-8) or a tap use a slot; Tab or I expands it to show what each item does.

const ICONS: Record<ItemIcon, React.JSX.Element> = {
  flashlight: <path d="M4 9h9l5-3v12l-5-3H4zM13 9v6M19 10l2-1M19 14l2 1M19 12h2.5" />,
  key: <path d="M8 12a3.5 3.5 0 1 1 0 .01M11.5 12H21M17 12v3M19.5 12v2.5" />,
  gas: <path d="M6 7h9l3 3v10H6zM9 7V4h5M9 12h6M9 16h6M18 10l2-2" />,
  battery: <path d="M4 8h16v10H4zM7 8V6h3v2M14 8V6h3v2M7 13h3M15 13h3M16.5 11.5v3" />,
  fuse: <path d="M4 12h3M17 12h3M7 9h10v6H7zM9 9v6M15 9v6" />,
  medkit: <path d="M4 8h16v11H4zM9 8V5h6v3M12 11v5M9.5 13.5h5" />,
  drink: <path d="M8 5h8l-1 15H9zM8.5 9h7M10 3h4" />,
};

function ItemIconSvg({ icon }: { icon: ItemIcon }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      {ICONS[icon]}
    </svg>
  );
}

function useInventory() {
  return useSyncExternalStore(subscribeInventory, getInventory, getInventory);
}

export function InventoryBar() {
  const inventory = useInventory();
  const { paused } = useGame();
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (paused || isResultScreenActive() || event.repeat) return;
      if (
        event.target instanceof HTMLElement &&
        event.target.closest('input, select, textarea, [contenteditable="true"]')
      )
        return;
      if (event.code === "Tab" || event.code === "KeyI") {
        event.preventDefault();
        setExpanded((open) => !open);
        return;
      }
      const digit = /^Digit([1-9])$/.exec(event.code);
      if (!digit) return;
      const used = activateSlot(Number(digit[1]) - 1);
      if (used?.item.toggle) playSound("latch");
      else if (used?.item.consumable) playSound(used.spent ? "grab" : "deny");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [paused]);

  if (!inventory.scope) return null;
  const slots = Array.from({ length: MAX_SLOTS }, (_, i) => inventory.slots[i]);
  const describe = (item: ItemDef, on: boolean) =>
    item.toggle ? `${item.name} (${on ? "on" : "off"})` : item.name;
  return (
    <nav
      className={`inventory-bar${expanded ? " is-expanded" : ""}`}
      aria-label="Inventory (number keys to use, Tab to expand)"
    >
      <ol>
        {slots.map((slot, i) => {
          const item = slot && inventory.catalogue[slot.id];
          return (
            <li key={i}>
              <button
                type="button"
                className={[
                  item ? "has-item" : "",
                  slot?.on ? "is-on" : "",
                  inventory.selected === i && item ? "is-selected" : "",
                ].join(" ")}
                disabled={!item}
                aria-label={item ? `${i + 1}: ${describe(item, slot.on)}` : `${i + 1}: empty`}
                aria-pressed={item?.toggle ? slot.on : undefined}
                onClick={() => {
                  const used = activateSlot(i);
                  if (used?.item.toggle) playSound("latch");
                  else if (used?.item.consumable) playSound(used.spent ? "grab" : "deny");
                }}
              >
                <kbd>{i + 1}</kbd>
                {item && <ItemIconSvg icon={item.icon} />}
              </button>
              {expanded && item && (
                <p>
                  <strong>{describe(item, slot.on)}</strong>
                  {item.description}
                </p>
              )}
            </li>
          );
        })}
      </ol>
      <small>
        <kbd>Tab</kbd> {expanded ? "hide" : "show"} details
      </small>
    </nav>
  );
}
