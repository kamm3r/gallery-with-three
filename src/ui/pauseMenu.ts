import { defaultSettings, type GameSettings } from "../gameSettings.ts";
import { graphicsPresets } from "../gameplay/graphicsSettings.ts";
import {
  bindingLabels,
  defaultBindings,
  isBindableCode,
  keyLabel,
  rebind,
  readSprintKey,
  suggestedSprintKey,
  type BindingAction,
} from "../gameplay/controlBindings.ts";
import type { GameStore } from "../runtime/gameStore.ts";
import { append, button, element } from "./dom.ts";

type SettingKeys<T> = {
  [K in keyof GameSettings]: GameSettings[K] extends T ? K : never;
}[keyof GameSettings];
type Page = "pause" | "options" | "video" | "game" | "controls" | "return";
const titles: Record<Page, string> = {
  pause: "Paused",
  options: "Options",
  video: "Display",
  game: "Game options",
  controls: "Controls",
  return: "Return to the forest?",
};

function ornament() {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", "menu-ornament");
  svg.setAttribute("viewBox", "0 0 400 44");
  svg.setAttribute("fill", "none");
  svg.setAttribute("aria-hidden", "true");
  for (const d of [
    "M8 22h120c24 0 37-9 51-9M392 22H272c-24 0-37-9-51-9M145 22c15 15 30 12 43 0M255 22c-15 15-30 12-43 0",
    "M200 3c-16 9-20 21 0 38 20-17 16-29 0-38Zm0 7v26m-11-16 11 7 11-7",
  ]) {
    const path = document.createElementNS(svg.namespaceURI, "path");
    path.setAttribute("d", d);
    path.setAttribute("stroke", "currentColor");
    path.setAttribute("stroke-width", "1.5");
    svg.append(path);
  }
  return svg;
}

export type PauseMenuOptions = {
  store: GameStore;
  pathname: () => string;
  navigate: (path: string, state?: Record<string, unknown>) => void;
  playSound: () => void;
  resultScreenActive: () => boolean;
};

/** Mount once. Settings update the existing controls, preserving keyboard focus. */
export function mountPauseMenu(parent: HTMLElement, options: PauseMenuOptions) {
  const { store } = options;
  const abort = new AbortController();
  const { signal } = abort;
  const dialog = element("dialog", "pause-menu");
  dialog.setAttribute("aria-labelledby", "pause-title");
  const content = element("div");
  const status = element("p", "menu-note");
  status.setAttribute("role", "status");
  dialog.append(content);
  parent.append(dialog);
  let page: Page = "pause";
  let controlsParent: Page = "pause";
  let bindingAction: BindingAction | "sprint" | null = null;
  let wasPaused = false;
  let wasLocked = Boolean(document.pointerLockElement);
  let syncFields: Array<() => void> = [];
  const settings = () => store.getSnapshot().settings;
  const message = (text: string) => {
    status.textContent = text;
    status.hidden = !text;
  };
  const focusFirst = () =>
    dialog.querySelector<HTMLElement>("button:not(:disabled), input, select")?.focus();
  const resume = () => store.setPaused(false);
  const go = (next: Page) => {
    page = next;
    bindingAction = null;
    message("");
    render();
    focusFirst();
  };
  const back = () => {
    options.playSound();
    if (page === "pause") resume();
    else
      go(
        page === "controls"
          ? controlsParent
          : page === "options" || page === "return"
            ? "pause"
            : "options",
      );
  };
  const controls = (from: Page) => {
    controlsParent = from;
    go("controls");
  };
  const update = (patch: Partial<GameSettings>) => store.updateSettings(patch);

  function select<K extends SettingKeys<string | number>>(
    label: string,
    key: K,
    choices: Array<readonly [string | number, string]>,
    parse: (value: string) => GameSettings[K],
    disabled = () => false,
  ) {
    const input = element("select");
    input.setAttribute("aria-label", label);
    for (const [value, text] of choices) {
      const option = element("option", "", text);
      option.value = String(value);
      input.append(option);
    }
    input.addEventListener("change", () => update({ [key]: parse(input.value) }));
    syncFields.push(() => {
      input.value = String(settings()[key]);
      input.disabled = disabled();
    });
    return element("label", "setting-row", label, input);
  }

  function toggle<K extends SettingKeys<boolean>>(label: string, key: K, disabled = () => false) {
    const value = element("span");
    const node = button(label, () => update({ [key]: !settings()[key] }), "setting-row");
    node.append(value);
    syncFields.push(() => {
      node.setAttribute("aria-pressed", String(settings()[key]));
      value.textContent = settings()[key] ? "On" : "Off";
      node.disabled = disabled();
    });
    return node;
  }

  function slider(
    label: string,
    key: "brightness" | "soundVolume" | "sensitivity",
    min: number,
    max: number,
  ) {
    const input = element("input");
    input.type = "range";
    input.min = String(min);
    input.max = String(max);
    input.step = "5";
    input.setAttribute("aria-label", label);
    const output = element("output");
    input.addEventListener("input", () => update({ [key]: Number(input.value) }));
    syncFields.push(() => {
      input.value = String(settings()[key]);
      output.textContent = `${settings()[key]}%`;
    });
    return element("label", "setting-row", label, element("span", "setting-slider", input, output));
  }

  function renderDisplay() {
    const body = element("div", "menu-settings");
    const ps2 = () => settings().ps2Style;
    append(
      body,
      select(
        "Graphics preset",
        "graphicsPreset",
        ["low", "medium", "high", "ultra", "custom"].map((v) => [
          v,
          v[0].toUpperCase() + v.slice(1),
        ]),
        (v) => v as GameSettings["graphicsPreset"],
      ),
      select(
        "Render scale",
        "resolution",
        [
          [0.75, "75%"],
          [1, "100%"],
          [1.5, "150%"],
          [2, "200%"],
        ],
        Number,
        ps2,
      ),
    );
    const fullValue = element("span");
    const fullscreen = button(
      "Fullscreen",
      () => {
        const request = document.fullscreenElement
          ? document.exitFullscreen()
          : document.documentElement.requestFullscreen();
        void request
          .then(() => message(""))
          .catch(() => message("Fullscreen is unavailable in this browser window."));
      },
      "setting-row",
    );
    fullscreen.append(fullValue);
    fullscreen.disabled = !document.fullscreenEnabled;
    syncFields.push(() => {
      fullValue.textContent = document.fullscreenElement ? "On" : "Off";
    });
    append(
      body,
      fullscreen,
      toggle("Dynamic resolution", "adaptiveResolution", ps2),
      select(
        "Automatic resolution target",
        "frameTarget",
        [
          [60, "60 FPS"],
          [30, "30 FPS"],
        ],
        (v) => Number(v) as 30 | 60,
        () => ps2() || !settings().adaptiveResolution,
      ),
    );
    const effects = ["off", "low", "medium", "high"].map(
      (v) => [v, v[0].toUpperCase() + v.slice(1)] as const,
    );
    for (const [key, label] of [
      ["shadows", "Shadows"],
      ["particleDetail", "Decorative particles"],
    ] as const)
      body.append(select(label, key, effects, (v) => v as GameSettings[typeof key]));
    append(
      body,
      select(
        "World detail",
        "environmentDetail",
        effects.slice(1),
        (v) => v as GameSettings["environmentDetail"],
      ),
      toggle("PS2 style", "ps2Style"),
      toggle("Bloom", "bloom"),
      slider("Brightness", "brightness", 60, 140),
      element(
        "p",
        "menu-note",
        "Settings are saved automatically. PS2 style uses a fixed render resolution and replaces dynamic resolution. Graphics settings keep combat timing and collision consistent.",
      ),
      button(
        "Reset display defaults",
        () =>
          update({
            brightness: defaultSettings.brightness,
            ps2Style: defaultSettings.ps2Style,
            ...graphicsPresets.medium,
          }),
        "menu-reset",
      ),
    );
    return body;
  }

  function renderGame() {
    return element(
      "div",
      "menu-settings",
      slider("Sound effects volume", "soundVolume", 0, 100),
      slider("Camera sensitivity", "sensitivity", 25, 200),
      toggle("Invert vertical look", "invertY"),
      toggle("Camera auto-rotation", "cameraAutoRotate"),
      toggle("Show control hints", "showHints"),
      toggle("Reduce motion", "reducedMotion"),
      select(
        "Roll weight",
        "rollWeight",
        [
          ["light", "Light · quick and far"],
          ["medium", "Medium"],
          ["heavy", "Heavy · slow and short"],
        ],
        (v) => v as GameSettings["rollWeight"],
      ),
      button(
        "Reset game defaults",
        () =>
          update({
            soundVolume: 60,
            sensitivity: 100,
            invertY: false,
            cameraAutoRotate: true,
            showHints: true,
            reducedMotion: false,
            rollWeight: "medium",
          }),
        "menu-reset",
      ),
    );
  }

  function renderControls() {
    const list = element("dl", "menu-controls");
    const row = (label: string, value: Node | string) =>
      list.append(element("div", "", element("dt", "", label), element("dd", "", value)));
    const binding = (action: BindingAction | "sprint", label: string, code: string) => {
      const node = button(
        bindingAction === action ? "Press a key…" : keyLabel(code),
        () => {
          bindingAction = action;
          message("");
          render();
          dialog.querySelector<HTMLElement>(`[data-binding="${action}"]`)?.focus();
        },
        "binding-button",
      );
      node.dataset.binding = action;
      node.setAttribute("aria-label", `Change ${label} binding, currently ${keyLabel(code)}`);
      row(label, node);
    };
    if (options.pathname() === "/boss") {
      row("Ember flask", "R");
      row("Capital map", "M");
    }
    for (const action of Object.keys(bindingLabels) as BindingAction[])
      binding(action, bindingLabels[action], settings().bindings[action]);
    const sprint = element("select");
    sprint.setAttribute("aria-label", "Sprint controls");
    for (const [value, label] of [
      ["shared", "Hold dodge key"],
      ["separate", "Separate sprint key"],
    ]) {
      const option = element("option", "", label);
      option.value = value;
      sprint.append(option);
    }
    sprint.value = settings().sprintKey ? "separate" : "shared";
    sprint.addEventListener("change", () => {
      bindingAction = null;
      update({
        sprintKey: sprint.value === "shared" ? null : suggestedSprintKey(settings().bindings),
      });
    });
    row("Sprint controls", sprint);
    if (settings().sprintKey) binding("sprint", "sprint", settings().sprintKey!);
    row(
      "Spin attack in the Warp Room",
      `Left mouse button / ${keyLabel(settings().bindings.attack)} / ${keyLabel(settings().bindings.interact)}`,
    );
    row("Drop from ledge", `${keyLabel(settings().bindings.backward)} / ↓`);
    row("Look around", "Click scene, move mouse");
    row("Pause / back", "Esc");
    return element(
      "div",
      "",
      list,
      element(
        "p",
        "menu-note",
        "Select a binding and press a new key; Esc cancels. Dodge while moving to roll or while still to backstep. Choose whether sprint uses a held dodge key or its own key. Arrow keys also move. Left click attacks with the pointer captured. You can also drag to look around. Touch controls appear on smaller screens.",
      ),
      button(
        "Reset control defaults",
        () => {
          bindingAction = null;
          update({ bindings: { ...defaultBindings }, sprintKey: null });
          message("Default controls restored.");
        },
        "menu-reset",
      ),
    );
  }

  function render() {
    const focused = document.activeElement;
    const focusedLabel = dialog.contains(focused) ? focused?.getAttribute("aria-label") : null;
    syncFields = [];
    const heading = element("h2", "", titles[page]);
    heading.id = "pause-title";
    content.className = `menu-content menu-content-${page}`;
    content.replaceChildren(heading, ornament());
    if (page === "pause") {
      const nav = element(
        "nav",
        "menu-links",
        button("Continue", () => {
          options.playSound();
          resume();
        }),
      );
      nav.setAttribute("aria-label", "Pause menu");
      if (options.pathname() === "/boss")
        nav.append(
          button("Capital map", () => {
            window.dispatchEvent(new Event("capital-map-open"));
            resume();
          }),
        );
      append(
        nav,
        button("Options", () => go("options")),
        button("Controls", () => controls("pause")),
      );
      if (options.pathname().startsWith("/warp/"))
        nav.append(
          button("Back to the Warp Room", () => {
            options.navigate("/warp", { returnPortal: options.pathname().slice(6) });
            resume();
          }),
        );
      if (options.pathname() !== "/")
        nav.append(button("Return to the forest", () => go("return")));
      content.append(nav);
    } else if (page === "options") {
      const nav = element(
        "nav",
        "menu-links",
        button("Game options", () => go("game")),
        button("Display", () => go("video")),
        button("Controls", () => controls("options")),
      );
      nav.setAttribute("aria-label", "Options");
      content.append(nav);
    } else if (page === "video") content.append(renderDisplay());
    else if (page === "game") content.append(renderGame());
    else if (page === "controls") content.append(renderControls());
    else {
      content.append(
        element(
          "p",
          "menu-note",
          options.pathname() === "/boss"
            ? "Your shortcuts, offerings, bosses and last shrine are saved. Return at that shrine with health and flasks restored."
            : "Your progress in this area will reset when you leave.",
        ),
      );
      const nav = element(
        "div",
        "menu-links",
        button("Return to the forest", () => {
          options.navigate("/");
          go("pause");
          resume();
        }),
      );
      if (options.pathname() === "/boss")
        nav.append(
          button("Start new Capital run · erase saved progress", () => {
            window.dispatchEvent(new Event("parish-new-run"));
            go("pause");
            resume();
          }),
        );
      nav.append(button("Stay here", () => go("pause")));
      content.append(nav);
    }
    if (page !== "pause" && page !== "return") content.append(button("Back", back, "menu-back"));
    append(
      content,
      ornament(),
      element(
        "p",
        "menu-footnote",
        `↑ ↓ Navigate · Enter Select · Esc ${page === "pause" ? "Continue" : "Back"}`,
      ),
      status,
    );
    syncFields.forEach((sync) => sync());
    if (focusedLabel)
      Array.from(dialog.querySelectorAll<HTMLElement>("[aria-label]"))
        .find((node) => node.getAttribute("aria-label") === focusedLabel)
        ?.focus();
  }

  const sync = () => {
    const { paused } = store.getSnapshot();
    if (paused && !wasPaused) {
      go("pause");
      dialog.showModal();
      focusFirst();
    } else if (!paused && wasPaused) {
      bindingAction = null;
      dialog.close();
      document.querySelector<HTMLElement>(".game-viewport")?.focus();
    } else if (paused) {
      if (page === "controls") render();
      else syncFields.forEach((field) => field());
    }
    wasPaused = paused;
  };
  const unsubscribe = store.subscribe(sync);
  window.addEventListener(
    "keydown",
    (event) => {
      if (event.code !== "Escape" || event.repeat || bindingAction) return;
      event.preventDefault();
      if (store.getSnapshot().paused) back();
      else store.setPaused(true);
    },
    { signal },
  );
  window.addEventListener(
    "keydown",
    (event) => {
      if (!bindingAction || !store.getSnapshot().paused || page !== "controls") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.repeat) return;
      if (event.code === "Escape") {
        bindingAction = null;
        render();
        focusFirst();
        return;
      }
      if (!isBindableCode(event.code)) {
        message(
          "That key is reserved. Choose a letter, arrow, number, Space, Shift, or Control. R, M, and 1 are reserved for area abilities.",
        );
        return;
      }
      const action = bindingAction;
      if (action === "sprint") {
        const sprintKey = readSprintKey(event.code, settings().bindings);
        if (!sprintKey) {
          message("Choose an unused key for sprint. Arrow keys are reserved for movement.");
          return;
        }
        bindingAction = null;
        update({ sprintKey });
      } else {
        if (event.code === settings().sprintKey) {
          message("That key is assigned to sprint. Change the sprint key first.");
          return;
        }
        bindingAction = null;
        update({ bindings: rebind(settings().bindings, action, event.code) });
      }
      message(
        action === "sprint"
          ? "Sprint binding saved."
          : "Binding saved. If that key was already assigned, the two bindings were swapped.",
      );
      dialog.querySelector<HTMLElement>(`[data-binding="${action}"]`)?.focus();
    },
    { capture: true, signal },
  );
  document.addEventListener(
    "pointerlockchange",
    () => {
      const locked = Boolean(document.pointerLockElement);
      if (wasLocked && !locked && !store.getSnapshot().paused && !options.resultScreenActive())
        store.setPaused(true);
      wasLocked = locked;
    },
    { signal },
  );
  document.addEventListener("fullscreenchange", () => syncFields.forEach((field) => field()), {
    signal,
  });
  dialog.addEventListener("cancel", (event) => event.preventDefault(), { signal });
  dialog.addEventListener(
    "keydown",
    (event) => {
      if (
        !["ArrowUp", "ArrowDown"].includes(event.key) ||
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLSelectElement
      )
        return;
      const items = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          "button:not(:disabled), input:not(:disabled), select:not(:disabled)",
        ),
      );
      const index = items.indexOf(document.activeElement as HTMLElement);
      event.preventDefault();
      items[(index + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus();
    },
    { signal },
  );
  render();
  sync();
  return () => {
    unsubscribe();
    abort.abort();
    if (dialog.open) dialog.close();
    dialog.remove();
  };
}
