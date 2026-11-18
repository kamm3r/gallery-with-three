import {
  activateSlot,
  getInventory,
  MAX_SLOTS,
  subscribeInventory,
  type ItemIcon,
} from "../gameplay/inventory.ts";
import type { GameStore } from "../runtime/gameStore.ts";
import { append, button, element } from "./dom.ts";

const icons: Record<ItemIcon, string> = {
  flashlight: "M4 9h9l5-3v12l-5-3H4zM13 9v6M19 10l2-1M19 14l2 1M19 12h2.5",
  key: "M8 12a3.5 3.5 0 1 1 0 .01M11.5 12H21M17 12v3M19.5 12v2.5",
  gas: "M6 7h9l3 3v10H6zM9 7V4h5M9 12h6M9 16h6M18 10l2-2",
  battery: "M4 8h16v10H4zM7 8V6h3v2M14 8V6h3v2M7 13h3M15 13h3M16.5 11.5v3",
  fuse: "M4 12h3M17 12h3M7 9h10v6H7zM9 9v6M15 9v6",
  medkit: "M4 8h16v11H4zM9 8V5h6v3M12 11v5M9.5 13.5h5",
  drink: "M8 5h8l-1 15H9zM8.5 9h7M10 3h4",
};

export function mountInventoryBar(
  parent: HTMLElement,
  options: {
    store: GameStore;
    resultScreenActive: () => boolean;
    playSound: (sound: "latch" | "grab" | "deny") => void;
  },
) {
  const abort = new AbortController();
  const nav = element("nav", "inventory-bar");
  nav.setAttribute("aria-label", "Inventory (number keys to use, Tab to expand)");
  const list = element("ol");
  const hint = element("small");
  nav.append(list, hint);
  parent.append(nav);
  let expanded = false;
  const use = (index: number) => {
    if (options.store.getSnapshot().paused || options.resultScreenActive()) return;
    const used = activateSlot(index);
    if (used?.item.toggle) options.playSound("latch");
    else if (used?.item.consumable) options.playSound(used.spent ? "grab" : "deny");
  };
  const slots = Array.from({ length: MAX_SLOTS }, (_, index) => {
    const action = button("", () => use(index));
    const number = element("kbd", "", String(index + 1));
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    const path = document.createElementNS(svg.namespaceURI, "path");
    svg.append(path);
    action.append(number, svg);
    const details = element("p");
    const name = element("strong");
    const description = document.createTextNode("");
    details.append(name, description);
    list.append(element("li", "", action, details));
    return { action, svg, path, details, name, description };
  });
  const sync = () => {
    const inventory = getInventory();
    nav.hidden = !inventory.scope;
    nav.inert = options.store.getSnapshot().paused;
    nav.classList.toggle("is-expanded", expanded);
    hint.replaceChildren(element("kbd", "", "Tab"));
    append(hint, expanded ? " hide details" : " show details");
    slots.forEach(({ action, svg, path, details, name, description }, index) => {
      const slot = inventory.slots[index];
      const item = slot && inventory.catalogue[slot.id];
      const label = item
        ? item.toggle
          ? `${item.name} (${slot.on ? "on" : "off"})`
          : item.name
        : "empty";
      action.disabled = !item;
      action.classList.toggle("has-item", Boolean(item));
      action.classList.toggle("is-on", Boolean(slot?.on));
      action.classList.toggle("is-selected", inventory.selected === index && Boolean(item));
      action.setAttribute("aria-label", `${index + 1}: ${label}`);
      if (item?.toggle) action.setAttribute("aria-pressed", String(slot.on));
      else action.removeAttribute("aria-pressed");
      svg.style.display = item ? "" : "none";
      path.setAttribute("d", item ? icons[item.icon] : "");
      details.hidden = !expanded || !item;
      name.textContent = label;
      description.textContent = item?.description ?? "";
    });
  };
  window.addEventListener(
    "keydown",
    (event) => {
      if (
        !getInventory().scope ||
        options.store.getSnapshot().paused ||
        options.resultScreenActive() ||
        event.repeat
      )
        return;
      if (
        event.target instanceof HTMLElement &&
        event.target.closest('input, select, textarea, [contenteditable="true"]')
      )
        return;
      if (event.code === "Tab" || event.code === "KeyI") {
        event.preventDefault();
        expanded = !expanded;
        sync();
        return;
      }
      const digit = /^Digit([1-9])$/.exec(event.code);
      if (digit) use(Number(digit[1]) - 1);
    },
    { signal: abort.signal },
  );
  const unsubscribeInventory = subscribeInventory(sync);
  const unsubscribeStore = options.store.subscribe(sync);
  sync();
  return () => {
    abort.abort();
    unsubscribeInventory();
    unsubscribeStore();
    nav.remove();
  };
}
