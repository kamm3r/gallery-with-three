import type { GameStore } from "../runtime/gameStore.ts";
import { button, element } from "./dom.ts";

export type ExperienceHudProps = {
  chapter: string;
  title: string;
  prompt?: string;
  leaving: boolean;
  ready: boolean;
};
type TouchControl = "forward" | "left" | "backward" | "right" | "jump" | "roll" | "interact";

export function mountExperienceHud(
  parent: HTMLElement,
  store: GameStore,
  initial: ExperienceHudProps,
  setControl: (control: TouchControl, active: boolean) => void,
) {
  let props = initial;
  const abort = new AbortController();
  const held = new Map<number, TouchControl>();
  const hud = element("div", "hud");
  const arrival = element("header", "arrival-title", element("h1", "", props.title));
  const touch = element("div", "touch-controls");
  touch.setAttribute("aria-label", "Touch controls");
  for (const [control, label] of [
    ["forward", "Up"],
    ["left", "Left"],
    ["backward", "Down"],
    ["right", "Right"],
    ["jump", "Jump"],
    ["roll", "Roll"],
    ["interact", "Use"],
  ] as const) {
    const node = button(label, () => {}, `touch-control touch-${control}`);
    node.setAttribute("aria-label", label);
    node.addEventListener(
      "pointerdown",
      (event) => {
        event.preventDefault();
        if (store.getSnapshot().paused) return;
        held.set(event.pointerId, control);
        node.setPointerCapture?.(event.pointerId);
        setControl(control, true);
      },
      { signal: abort.signal },
    );
    const release = (event: PointerEvent) => {
      event.preventDefault();
      if (!held.delete(event.pointerId)) return;
      if (![...held.values()].includes(control)) setControl(control, false);
    };
    for (const name of ["pointerup", "pointercancel", "lostpointercapture"] as const)
      node.addEventListener(name, release, { signal: abort.signal });
    touch.append(node);
  }
  const prompt = element("div", "portal-prompt");
  prompt.setAttribute("role", "status");
  const loading = element("div", "loading-screen", "Loading world");
  loading.setAttribute("role", "status");
  const curtain = element("div", "scene-curtain");
  hud.append(arrival, touch, prompt, loading, curtain);
  parent.append(hud);
  const releaseAll = () => {
    for (const control of new Set(held.values())) setControl(control, false);
    held.clear();
  };
  const sync = () => {
    const { paused } = store.getSnapshot();
    hud.dataset.sceneReady = String(props.ready);
    hud.inert = paused;
    hud.setAttribute("aria-hidden", String(paused));
    arrival.hidden = !props.ready;
    arrival.style.animationPlayState = paused ? "paused" : "running";
    if (arrival.firstElementChild!.textContent !== props.title)
      arrival.firstElementChild!.textContent = props.title;
    prompt.classList.toggle("is-visible", Boolean(props.prompt));
    prompt.textContent = props.prompt ?? "";
    loading.classList.toggle("is-ready", props.ready);
    curtain.classList.toggle("is-leaving", props.leaving);
    if (paused) releaseAll();
  };
  const unsubscribe = store.subscribe(sync);
  window.addEventListener("blur", releaseAll, { signal: abort.signal });
  sync();
  return {
    update(next: ExperienceHudProps) {
      props = next;
      sync();
    },
    dispose() {
      unsubscribe();
      abort.abort();
      releaseAll();
      hud.remove();
    },
  };
}
