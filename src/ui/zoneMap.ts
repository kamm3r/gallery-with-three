import { PARK_EXTENT, parkZones, type ParkField } from "../gameplay/collisionCourse.ts";
import { ARENA_ROSTERS, type ArenaRoster } from "../gameplay/combatArena.ts";
import type { GameStore } from "../runtime/gameStore.ts";
import { button, element } from "./dom.ts";

export type ZoneMapProps = {
  current: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onTeleport: (index: number) => void;
  roster: ArenaRoster;
  onFight: (roster: ArenaRoster) => void;
};
const fields: ParkField[] = [
  "North",
  "Middle",
  "South",
  "Back",
  "West",
  "East",
  "Combat",
  "Showcase",
];

export function mountZoneMap(parent: HTMLElement, store: GameStore, initial: ZoneMapProps) {
  let props = initial;
  let wasOpen = false;
  const abort = new AbortController();
  const badge = element("div", "zone-badge");
  badge.setAttribute("role", "status");
  const field = element("span", "zone-badge-field");
  const name = element("strong");
  badge.append(field, name, element("span", "zone-badge-keys", "[ ] cycle · R restart · M map"));
  const overlay = element("div", "zone-map");
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-label", "Test zone map");
  const panel = element("div", "zone-map-panel");
  const close = button("✕", () => props.onOpenChange(false));
  close.setAttribute("aria-label", "Close map");
  panel.append(element("header", "", element("h2", "", "Proving grounds"), close));
  const body = element("div", "zone-map-body");
  const plot = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  plot.setAttribute("class", "zone-map-plot");
  plot.setAttribute(
    "viewBox",
    `${-PARK_EXTENT} ${-PARK_EXTENT} ${PARK_EXTENT * 2} ${PARK_EXTENT * 2}`,
  );
  plot.setAttribute("aria-hidden", "true");
  const ground = document.createElementNS(plot.namespaceURI, "rect");
  ground.setAttribute("x", String(-PARK_EXTENT));
  ground.setAttribute("y", String(-PARK_EXTENT));
  ground.setAttribute("width", String(PARK_EXTENT * 2));
  ground.setAttribute("height", String(PARK_EXTENT * 2));
  ground.setAttribute("class", "zone-map-ground");
  plot.append(ground);
  const go = (index: number) => {
    props.onTeleport(index);
    props.onOpenChange(false);
  };
  const dots = parkZones.map((zone, index) => {
    const dot = document.createElementNS(plot.namespaceURI, "g");
    dot.setAttribute("transform", `translate(${zone.spawn[0]} ${-zone.spawn[2]})`);
    const circle = document.createElementNS(plot.namespaceURI, "circle");
    const text = document.createElementNS(plot.namespaceURI, "text");
    text.setAttribute("y", "-4.5");
    text.textContent = zone.name;
    dot.append(circle, text);
    dot.addEventListener("click", () => go(index));
    plot.append(dot);
    return { dot, circle };
  });
  const nav = element("nav", "zone-map-list");
  const zoneButtons: Array<{ index: number; node: HTMLButtonElement }> = [];
  const rosterButtons: Array<{ id: ArenaRoster; node: HTMLButtonElement }> = [];
  for (const entry of fields) {
    const zones = parkZones
      .map((zone, index) => ({ ...zone, index }))
      .filter((zone) => zone.field === entry);
    if (!zones.length) continue;
    const section = element("section", "", element("h3", "", entry));
    for (const zone of zones) {
      const node = button(zone.name, () => go(zone.index));
      section.append(node);
      zoneButtons.push({ index: zone.index, node });
    }
    if (entry === "Combat") {
      const rosters = element("div", "zone-map-foes");
      rosters.setAttribute("role", "group");
      rosters.setAttribute("aria-label", "Arena foes");
      for (const option of ARENA_ROSTERS) {
        const node = button(option.name, () => {
          props.onFight(option.id);
          props.onOpenChange(false);
        });
        rosterButtons.push({ id: option.id, node });
        rosters.append(node);
      }
      section.append(rosters);
    }
    nav.append(section);
  }
  body.append(plot, nav);
  panel.append(body);
  overlay.append(panel);
  parent.append(badge, overlay);
  overlay.addEventListener("click", () => props.onOpenChange(false));
  panel.addEventListener("click", (event) => event.stopPropagation());
  const sync = () => {
    const { paused } = store.getSnapshot();
    const zone = parkZones[props.current] ?? parkZones[0];
    field.textContent = `${zone.field} field`;
    name.textContent = zone.name;
    badge.hidden = paused;
    overlay.hidden = paused || !props.open;
    if (props.open && !wasOpen && document.pointerLockElement) document.exitPointerLock();
    dots.forEach(({ dot, circle }, index) => {
      dot.setAttribute("class", `zone-map-dot${index === props.current ? " is-current" : ""}`);
      circle.setAttribute("r", index === props.current ? "3.4" : "2.4");
    });
    for (const { index, node } of zoneButtons)
      if (index === props.current) node.setAttribute("aria-current", "location");
      else node.removeAttribute("aria-current");
    for (const { id, node } of rosterButtons)
      node.setAttribute("aria-pressed", String(id === props.roster));
    wasOpen = props.open;
  };
  window.addEventListener(
    "keydown",
    (event) => {
      if (
        store.getSnapshot().paused ||
        event.repeat ||
        (event.target instanceof HTMLElement &&
          event.target.closest('input, select, textarea, [contenteditable="true"]'))
      )
        return;
      if (event.code === "KeyM") {
        event.preventDefault();
        props.onOpenChange(!props.open);
      } else if (props.open && event.code === "Escape") props.onOpenChange(false);
    },
    { signal: abort.signal },
  );
  const unsubscribe = store.subscribe(sync);
  sync();
  return {
    update(next: ZoneMapProps) {
      props = next;
      sync();
    },
    dispose() {
      unsubscribe();
      abort.abort();
      badge.remove();
      overlay.remove();
    },
  };
}
