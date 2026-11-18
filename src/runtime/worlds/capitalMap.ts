import type { ParishProgress } from "../../gameplay/ashenParish";
import {
  capitalAreaAt,
  capitalAreas,
  capitalBeacon,
  capitalCaches,
  capitalSurfaces,
} from "../../gameplay/capitalLayout";
import { button, element } from "../../ui/dom";

const SVG = "http://www.w3.org/2000/svg";
const LAYERS = [
  { id: "lower-tiers", name: "Tiers 1–2" },
  { id: "middle-tiers", name: "Tiers 3–4" },
  { id: "upper-tiers", name: "Tiers 5–6" },
  { id: "citadel", name: "Citadel" },
  { id: "lower", name: "Plain" },
] as const;
const layerAt = (y: number) =>
  y < -1
    ? "lower"
    : y < 12
      ? "lower-tiers"
      : y < 28
        ? "middle-tiers"
        : y < 44
          ? "upper-tiers"
          : "citadel";
const mx = (x: number) => 120 + (x + 17) * 1.2;
const mz = (z: number) => 140 + z * 1.2;
const shortName = (name: string) =>
  name
    .replace("Church Outside Path", "Outside path")
    .replace("Middle Level Town", "Mid Town")
    .replace("Asylum Cathedral", "Cathedral")
    .replace("Ultimate Plaza", "Plaza")
    .replace("Oblivion Chapel", "Chapel");

function svg<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>) {
  const node = document.createElementNS(SVG, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  return node;
}

/** The capital's route map: one floor layer at a time, with the player's position. */
export function openCapitalMap(
  host: HTMLElement,
  progress: ParishProgress,
  player: { x: number; y: number; z: number },
  onClose: () => void,
) {
  let layer: string = layerAt(player.y);
  const panel = element("div", "parish-map");
  const close = button("×", onClose, "capital-map-close");
  close.setAttribute("aria-label", "Close capital map");
  const layers = element("div", "capital-map-layers");
  const map = svg("svg", { viewBox: "0 0 240 280", role: "img" });
  const notes = element("p");
  panel.append(close, element("h2", "", "The Fading Sacred Capital"), layers, map, notes);
  host.append(panel);
  const area = capitalAreaAt(player.x, player.z, player.y);

  const draw = () => {
    layers.replaceChildren(
      ...LAYERS.map((l) => {
        const node = button(l.name, () => {
          layer = l.id;
          draw();
        });
        node.setAttribute("aria-pressed", String(layer === l.id));
        node.disabled = l.id === "lower" && !progress.fogCleared;
        return node;
      }),
    );
    map.setAttribute("aria-label", `${layer} capital routes and current player position`);
    const inLayer = (y: number) => layerAt(y) === layer;
    const routes = svg("g", { stroke: "#85919b", "stroke-width": ".4" });
    for (const s of capitalSurfaces) {
      if (!inLayer(s.vertices.reduce((sum, p) => sum + p[1], 0) / s.vertices.length)) continue;
      routes.append(
        svg("polygon", {
          points: s.vertices.map((p) => `${mx(p[0])},${mz(p[2])}`).join(" "),
          fill: s.area === area ? "#657d87" : "#3c4955",
        }),
      );
    }
    const children: SVGElement[] = [routes];
    for (const a of capitalAreas) {
      if (!inLayer(a.center[1])) continue;
      const label = svg("text", {
        x: mx(a.center[0]),
        y: mz(a.center[2]) + 9,
        "text-anchor": "middle",
      });
      label.textContent = shortName(a.name);
      children.push(
        svg("circle", { cx: mx(a.center[0]), cy: mz(a.center[2]), r: 3, fill: "#d8c296" }),
        label,
      );
    }
    for (const c of capitalCaches) {
      if (progress.caches.includes(c.id) || !inLayer(c.position[1])) continue;
      const dot = svg("circle", {
        cx: mx(c.position[0]),
        cy: mz(c.position[2]),
        r: 2,
        fill: "#e8b46e",
      });
      const title = svg("title", {});
      title.textContent = c.name;
      dot.append(title);
      children.push(dot);
    }
    if (inLayer(capitalBeacon.position[1]) && !progress.fogCleared) {
      const [x, , z] = capitalBeacon.position;
      const label = svg("text", { x: mx(x), y: mz(z) - 6, "text-anchor": "middle" });
      label.textContent = "Crown beacon";
      children.push(svg("circle", { cx: mx(x), cy: mz(z), r: 3, fill: "#92dbed" }), label);
    }
    if (inLayer(player.y))
      children.push(svg("circle", { cx: mx(player.x), cy: mz(player.z), r: 3, fill: "#f4f1dd" }));
    map.replaceChildren(...children);
  };
  draw();
  notes.replaceChildren(
    progress.fogCleared
      ? "The fog has lifted. Take the beacon pathway down to its tower and ride the lift to Grand Street and the colosseum gate."
      : progress.cathedralFelled
        ? "Throw the switch behind the keeper's apse to lift the fog."
        : progress.checkpoint === "refuge"
          ? "Cross a bridge to the town, go under its street and through the Mountain Tunnel to Up Town, then climb the blade to the plaza and rest at the Oblivion Chapel."
          : "Take the outside path along the cathedral's east side to its galleries.",
    element("br"),
    `Great gate: ${progress.refuge ? "open" : "barred"} · Cathedral return: ${progress.court ? "open" : "barred within"} · Garden door: ${progress.garden ? "open" : "barred above"} · Beacon lift: ${progress.beaconLift ? "released" : progress.fogCleared ? "waiting at the tower" : "held by fog"} · Arena lift: ${progress.arenaLift ? "released" : "locked below"}`,
  );
  return () => panel.remove();
}
