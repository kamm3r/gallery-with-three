import { combatTuning } from "../../gameplay/combatTuning";
import type { ParishEncounter } from "../../gameplay/parishEncounter";
import { element } from "../../ui/dom";
import { mountVitalBar } from "../../ui/vitalBar";
import { gameStore } from "../gameStore";

const svg = (markup: string, viewBox: string) => {
  const node = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  node.setAttribute("viewBox", viewBox);
  node.setAttribute("fill", "none");
  node.setAttribute("aria-hidden", "true");
  // Static, author-written icon paths only.
  node.innerHTML = markup;
  return node;
};

/** Health, stamina, Ember flasks, embers and NPC dialogue for the capital. */
export function mountCapitalHud(host: HTMLElement, drink: () => void) {
  const abort = new AbortController();
  const section = element("section", "combat-hud parish-hud");
  section.setAttribute("aria-label", "Combat status");
  const vitals = element("div", "player-vitals");
  const crest = element("span", "vital-crest", "✧");
  crest.setAttribute("aria-hidden", "true");
  const bars = element("div");
  vitals.append(crest, bars);
  const max = combatTuning.playerMaxHealth;
  const health = mountVitalBar(bars, { label: "Health", value: max, max });
  const stamina = mountVitalBar(bars, { label: "Stamina", value: 100, max: 100, stamina: true });

  const flask = element("button", "parish-flask");
  flask.type = "button";
  flask.title = "Ember flask (R)";
  const flaskCount = element("strong", "", "3");
  flask.append(
    svg(
      '<path d="M15 5h10v5H15zM16 10v10C8 24 6 30 8 39c2 8 22 8 24 0 2-9 0-15-8-19V10" stroke="currentColor" stroke-width="2"/><path d="M11 31c5-3 13 3 18 0l-1 8c-1 5-15 5-16 0z" fill="currentColor" opacity=".65"/>',
      "0 0 40 52",
    ),
    flaskCount,
    element("kbd", "", "R"),
  );
  flask.addEventListener("click", drink, { signal: abort.signal });
  const supplies = element("div", "parish-supplies", flask);
  const emberCount = element("span", "", "0");
  const embers = element(
    "div",
    "parish-embers",
    svg(
      '<path d="M10 2 15 10 10 21 5 10Z" stroke="currentColor"/><path d="m10 7 2 5-2 5-2-5Z" fill="currentColor"/>',
      "0 0 20 24",
    ),
    emberCount,
  );
  section.append(vitals, supplies, embers);
  const dialogue = element("aside", "capital-dialogue");
  dialogue.setAttribute("role", "status");
  dialogue.hidden = true;
  host.append(dialogue, section);
  window.addEventListener(
    "keydown",
    (event) => {
      if (event.code === "KeyR" && !event.repeat && !gameStore.getSnapshot().paused) drink();
    },
    { signal: abort.signal },
  );

  const death = element("div", "death-screen", element("h2", "", "You died"));
  death.setAttribute("role", "alert");
  death.hidden = true;
  host.append(death);
  const wardenName = element("h2");
  const wardenHost = element("div", "warden-vitals", wardenName);
  wardenHost.hidden = true;
  const wardenBar = mountVitalBar(wardenHost, {
    label: "Boss health",
    value: 1,
    max: 1,
    boss: true,
  });
  section.append(wardenHost);
  let shown = "";
  return {
    boss(state: { name: string; health: number; max: number } | null) {
      wardenHost.hidden = !state;
      if (!state) return;
      wardenName.textContent = state.name;
      wardenBar.update({
        label: `${state.name} health`,
        value: state.health,
        max: state.max,
        boss: true,
      });
    },
    died(dead: boolean) {
      death.hidden = !dead;
    },
    update(state: ParishEncounter) {
      const c = state.combat;
      health.update({ label: "Health", value: c.health, max });
      stamina.update({ label: "Stamina", value: c.stamina, max: 100, stamina: true });
      const key = `${state.flasks}:${state.embers}:${c.health}:${state.dialogue}:${gameStore.getSnapshot().paused}`;
      if (key === shown) return;
      shown = key;
      section.hidden = gameStore.getSnapshot().paused;
      flaskCount.textContent = String(state.flasks);
      flask.disabled = state.flasks === 0 || c.health <= 0 || c.health >= max;
      flask.setAttribute("aria-label", `Use Ember flask, ${state.flasks} of 3 remaining (R)`);
      emberCount.textContent = String(state.embers);
      embers.setAttribute("aria-label", `${state.embers} embers`);
      dialogue.hidden = !state.dialogue;
      dialogue.textContent = state.dialogue;
    },
    dispose() {
      abort.abort();
      health.dispose();
      wardenBar.dispose();
      stamina.dispose();
      section.remove();
      dialogue.remove();
      death.remove();
    },
  };
}
