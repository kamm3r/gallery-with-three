import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { defaultSettings, useGame } from "../gameSettings";
import { isResultScreenActive } from "../gameplay/resultScreen";
import {
  bindingLabels,
  defaultBindings,
  isBindableCode,
  keyLabel,
  rebind,
  readSprintKey,
  suggestedSprintKey,
  type BindingAction,
} from "../gameplay/controlBindings";
import { playSound } from "../gameplay/sound";
import {
  graphicsPresets,
  type GraphicsPreset,
  type EffectDetail,
  type Detail,
} from "../gameplay/graphicsSettings";

type Page = "pause" | "options" | "video" | "game" | "controls" | "return";
const titles: Record<Page, string> = {
  pause: "Paused",
  options: "Options",
  video: "Display",
  game: "Game options",
  controls: "Controls",
  return: "Return to the forest?",
};

function Ornament() {
  return (
    <svg className="menu-ornament" viewBox="0 0 400 44" fill="none" aria-hidden="true">
      <path
        d="M8 22h120c24 0 37-9 51-9M392 22H272c-24 0-37-9-51-9M145 22c15 15 30 12 43 0M255 22c-15 15-30 12-43 0"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="M200 3c-16 9-20 21 0 38 20-17 16-29 0-38Zm0 7v26m-11-16 11 7 11-7"
        stroke="currentColor"
        strokeWidth="1.5"
      />
    </svg>
  );
}

export function PauseMenu() {
  const { paused, setPaused, settings, updateSettings } = useGame();
  const [page, setPage] = useState<Page>("pause");
  const [controlsParent, setControlsParent] = useState<Page>("pause");
  const [fullscreen, setFullscreen] = useState(Boolean(document.fullscreenElement));
  const [bindingAction, setBindingAction] = useState<BindingAction | "sprint" | null>(null);
  const [message, setMessage] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const location = useLocation();
  const navigate = useNavigate();
  const resume = useCallback(() => setPaused(false), [setPaused]);
  const back = useCallback(() => {
    playSound("ui");
    if (page === "pause") setPaused(false);
    else
      setPage(
        page === "controls"
          ? controlsParent
          : page === "options" || page === "return"
            ? "pause"
            : "options",
      );
  }, [controlsParent, page, setPaused]);

  useEffect(() => {
    const element = dialog.current;
    if (paused) element?.showModal();
    else if (element?.open) {
      element.close();
      (document.querySelector<HTMLElement>(".game-viewport") ?? trigger.current)?.focus();
    }
  }, [paused]);
  useEffect(() => {
    if (paused) dialog.current?.querySelector<HTMLElement>("button, input, select")?.focus();
  }, [page, paused]);
  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.code !== "Escape" || event.repeat) return;
      event.preventDefault();
      if (paused) back();
      else {
        setPage("pause");
        setPaused(true);
      }
    };
    let wasLocked = Boolean(document.pointerLockElement);
    const onLock = () => {
      const locked = Boolean(document.pointerLockElement);
      if (wasLocked && !locked && !paused && !isResultScreenActive()) {
        setPage("pause");
        setPaused(true);
      }
      wasLocked = locked;
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("pointerlockchange", onLock);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerlockchange", onLock);
    };
  }, [back, paused, setPaused]);
  useEffect(() => {
    const onFullscreen = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onFullscreen);
    return () => document.removeEventListener("fullscreenchange", onFullscreen);
  }, []);

  useEffect(() => {
    if (!bindingAction || !paused || page !== "controls") return;
    const capture = (event: globalThis.KeyboardEvent) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.repeat) return;
      if (event.code === "Escape") {
        setBindingAction(null);
        return;
      }
      if (!isBindableCode(event.code)) {
        setMessage(
          "That key is reserved. Choose a letter, arrow, number, Space, Shift, or Control. R, M, and 1 are reserved for area abilities.",
        );
        return;
      }
      if (bindingAction === "sprint") {
        const sprintKey = readSprintKey(event.code, settings.bindings);
        if (!sprintKey) {
          setMessage("Choose an unused key for sprint. Arrow keys are reserved for movement.");
          return;
        }
        updateSettings({ sprintKey });
      } else {
        if (event.code === settings.sprintKey) {
          setMessage("That key is assigned to sprint. Change the sprint key first.");
          return;
        }
        updateSettings({ bindings: rebind(settings.bindings, bindingAction, event.code) });
      }
      setBindingAction(null);
      setMessage(
        bindingAction === "sprint"
          ? "Sprint binding saved."
          : "Binding saved. If that key was already assigned, the two bindings were swapped.",
      );
    };
    window.addEventListener("keydown", capture, true);
    return () => window.removeEventListener("keydown", capture, true);
  }, [bindingAction, page, paused, settings.bindings, settings.sprintKey, updateSettings]);
  useEffect(() => {
    if (!paused || page !== "controls") setBindingAction(null);
  }, [paused, page]);

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
      setMessage("");
    } catch {
      setMessage("Fullscreen is unavailable in this browser window.");
    }
  };
  const navigateMenu = (event: KeyboardEvent<HTMLDialogElement>) => {
    if (
      !["ArrowUp", "ArrowDown"].includes(event.key) ||
      event.target instanceof HTMLInputElement ||
      event.target instanceof HTMLSelectElement
    )
      return;
    const items = [
      ...event.currentTarget.querySelectorAll<HTMLElement>("button:not(:disabled), input, select"),
    ];
    const index = items.indexOf(document.activeElement as HTMLElement);
    event.preventDefault();
    items[(index + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus();
  };

  return (
    <>
      <button
        ref={trigger}
        className="pause-trigger"
        aria-label="Pause game"
        onClick={() => {
          setPage("pause");
          setPaused(true);
          playSound("ui");
        }}
      >
        <span aria-hidden="true">Ⅱ</span> Menu <kbd>Esc</kbd>
      </button>
      <dialog
        ref={dialog}
        className="pause-menu"
        aria-labelledby="pause-title"
        onCancel={(event) => event.preventDefault()}
        onKeyDown={navigateMenu}
      >
        <div className={`menu-content menu-content-${page}`}>
          <h2 id="pause-title">{titles[page]}</h2>
          <Ornament />
          {page === "pause" && (
            <nav className="menu-links" aria-label="Pause menu">
              <button
                onClick={() => {
                  playSound("ui");
                  resume();
                }}
              >
                Continue
              </button>
              <button onClick={() => setPage("options")}>Options</button>
              <button
                onClick={() => {
                  setControlsParent("pause");
                  setPage("controls");
                }}
              >
                Controls
              </button>
              {location.pathname.startsWith("/warp/") && (
                <button
                  onClick={() => {
                    const from = location.pathname.slice("/warp/".length);
                    void navigate("/warp", { state: { returnPortal: from } });
                    resume();
                  }}
                >
                  Back to the Warp Room
                </button>
              )}
              {location.pathname !== "/" && (
                <button onClick={() => setPage("return")}>Return to the forest</button>
              )}
            </nav>
          )}
          {page === "options" && (
            <nav className="menu-links" aria-label="Options">
              <button onClick={() => setPage("game")}>Game options</button>
              <button onClick={() => setPage("video")}>Display</button>
              <button
                onClick={() => {
                  setControlsParent("options");
                  setPage("controls");
                }}
              >
                Controls
              </button>
            </nav>
          )}
          {page === "video" && (
            <div className="menu-settings">
              <label className="setting-row">
                Graphics preset
                <select
                  aria-label="Graphics preset"
                  value={settings.graphicsPreset}
                  onChange={(e) =>
                    updateSettings({ graphicsPreset: e.target.value as GraphicsPreset })
                  }
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="ultra">Ultra</option>
                  <option value="custom">Custom</option>
                </select>
              </label>
              <label className="setting-row">
                Render scale
                <select
                  aria-label="Render scale"
                  value={settings.resolution}
                  onChange={(e) => updateSettings({ resolution: Number(e.target.value) })}
                >
                  <option value={0.75}>75%</option>
                  <option value={1}>100%</option>
                  <option value={1.5}>150%</option>
                  <option value={2}>200%</option>
                </select>
              </label>
              <button
                className="setting-row"
                onClick={toggleFullscreen}
                disabled={!document.fullscreenEnabled}
              >
                Fullscreen<span>{fullscreen ? "On" : "Off"}</span>
              </button>
              <button
                className="setting-row"
                onClick={() => updateSettings({ adaptiveResolution: !settings.adaptiveResolution })}
                aria-pressed={settings.adaptiveResolution}
              >
                Dynamic resolution
                <span>{settings.adaptiveResolution ? "On" : "Off"}</span>
              </button>
              <label className="setting-row">
                Automatic resolution target
                <select
                  aria-label="Automatic resolution target"
                  value={settings.frameTarget}
                  disabled={!settings.adaptiveResolution}
                  onChange={(e) =>
                    updateSettings({ frameTarget: Number(e.target.value) as 30 | 60 })
                  }
                >
                  <option value={60}>60 FPS</option>
                  <option value={30}>30 FPS</option>
                </select>
              </label>
              {(
                [
                  ["shadows", "Shadows"],
                  ["ambientOcclusion", "Ambient occlusion"],
                  ["particleDetail", "Decorative particles"],
                ] as const
              ).map(([key, label]) => (
                <label className="setting-row" key={key}>
                  {label}
                  <select
                    aria-label={label}
                    value={settings[key]}
                    onChange={(e) => updateSettings({ [key]: e.target.value as EffectDetail })}
                  >
                    <option value="off">Off</option>
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </label>
              ))}
              <label className="setting-row">
                World detail
                <select
                  aria-label="World detail"
                  value={settings.environmentDetail}
                  onChange={(e) => updateSettings({ environmentDetail: e.target.value as Detail })}
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </label>
              <button
                className="setting-row"
                aria-pressed={settings.bloom}
                onClick={() => updateSettings({ bloom: !settings.bloom })}
              >
                Bloom<span>{settings.bloom ? "On" : "Off"}</span>
              </button>
              <label className="setting-row">
                Brightness
                <span className="setting-slider">
                  <input
                    aria-label="Brightness"
                    type="range"
                    min="60"
                    max="140"
                    step="5"
                    value={settings.brightness}
                    onChange={(e) => updateSettings({ brightness: Number(e.target.value) })}
                  />
                  <output>{settings.brightness}%</output>
                </span>
              </label>
              <p className="menu-note">
                Settings are saved automatically. Dynamic resolution stays within your render scale.
                Graphics quality keeps combat timing and collision consistent.
              </p>
              <button
                className="menu-reset"
                onClick={() =>
                  updateSettings({
                    brightness: defaultSettings.brightness,
                    ...graphicsPresets.medium,
                  })
                }
              >
                Reset display defaults
              </button>
            </div>
          )}
          {page === "game" && (
            <div className="menu-settings">
              <label className="setting-row">
                Sound volume
                <span className="setting-slider">
                  <input
                    aria-label="Sound effects volume"
                    type="range"
                    min="0"
                    max="100"
                    step="5"
                    value={settings.soundVolume}
                    onChange={(e) => updateSettings({ soundVolume: Number(e.target.value) })}
                  />
                  <output>{settings.soundVolume}%</output>
                </span>
              </label>
              <label className="setting-row">
                Camera sensitivity
                <span className="setting-slider">
                  <input
                    aria-label="Camera sensitivity"
                    type="range"
                    min="25"
                    max="200"
                    step="5"
                    value={settings.sensitivity}
                    onChange={(e) => updateSettings({ sensitivity: Number(e.target.value) })}
                  />
                  <output>{settings.sensitivity}%</output>
                </span>
              </label>
              <button
                className="setting-row"
                role="switch"
                aria-checked={settings.invertY}
                onClick={() => updateSettings({ invertY: !settings.invertY })}
              >
                Invert vertical look<span>{settings.invertY ? "On" : "Off"}</span>
              </button>
              <button
                className="setting-row"
                role="switch"
                aria-checked={settings.reducedMotion}
                onClick={() => updateSettings({ reducedMotion: !settings.reducedMotion })}
              >
                Reduce motion<span>{settings.reducedMotion ? "On" : "Use system setting"}</span>
              </button>
              <button
                className="menu-reset"
                onClick={() =>
                  updateSettings({
                    soundVolume: 60,
                    sensitivity: 100,
                    invertY: false,
                    showHints: true,
                    reducedMotion: false,
                  })
                }
              >
                Reset game defaults
              </button>
            </div>
          )}
          {page === "controls" && (
            <>
              <dl className="menu-controls">
                {(Object.keys(bindingLabels) as BindingAction[]).map((action) => (
                  <div key={action}>
                    <dt>{bindingLabels[action]}</dt>
                    <dd>
                      <button
                        className="binding-button"
                        aria-label={`Change ${bindingLabels[action]} binding, currently ${keyLabel(settings.bindings[action])}`}
                        onClick={() => {
                          setBindingAction(action);
                          setMessage("");
                        }}
                      >
                        {bindingAction === action ? (
                          "Press a key…"
                        ) : (
                          <kbd>{keyLabel(settings.bindings[action])}</kbd>
                        )}
                      </button>
                    </dd>
                  </div>
                ))}
                <div>
                  <dt>Sprint controls</dt>
                  <dd>
                    <select
                      aria-label="Sprint controls"
                      value={settings.sprintKey ? "separate" : "shared"}
                      onChange={(event) => {
                        setBindingAction(null);
                        updateSettings({
                          sprintKey:
                            event.target.value === "shared"
                              ? null
                              : suggestedSprintKey(settings.bindings),
                        });
                      }}
                    >
                      <option value="shared">Hold dodge key</option>
                      <option value="separate">Separate sprint key</option>
                    </select>
                  </dd>
                </div>
                {settings.sprintKey && (
                  <div>
                    <dt>Sprint key</dt>
                    <dd>
                      <button
                        className="binding-button"
                        aria-label={`Change sprint binding, currently ${keyLabel(settings.sprintKey)}`}
                        onClick={() => {
                          setBindingAction("sprint");
                          setMessage("");
                        }}
                      >
                        {bindingAction === "sprint" ? (
                          "Press a key…"
                        ) : (
                          <kbd>{keyLabel(settings.sprintKey)}</kbd>
                        )}
                      </button>
                    </dd>
                  </div>
                )}
                <div>
                  <dt>Spin attack in the Warp Room</dt>
                  <dd>
                    Left mouse button / <kbd>{keyLabel(settings.bindings.attack)}</kbd> /{" "}
                    <kbd>{keyLabel(settings.bindings.interact)}</kbd>
                  </dd>
                </div>
                <div>
                  <dt>Drop from ledge</dt>
                  <dd>
                    <kbd>{keyLabel(settings.bindings.backward)}</kbd> / <kbd>↓</kbd>
                  </dd>
                </div>
                <div>
                  <dt>Look around</dt>
                  <dd>Click scene, move mouse</dd>
                </div>
                <div>
                  <dt>Pause / back</dt>
                  <dd>
                    <kbd>Esc</kbd>
                  </dd>
                </div>
              </dl>
              <p className="menu-note">
                Select a binding and press a new key; Esc cancels. Dodge while moving to roll or
                while still to backstep. Choose whether sprint uses a held dodge key or its own key.
                Arrow keys also move. Left click attacks with the pointer captured. You can also
                drag to look around. Touch controls appear on smaller screens. Jump into a painting
                to enter it.
              </p>
              <button
                className="menu-reset"
                onClick={() => {
                  setBindingAction(null);
                  updateSettings({ bindings: { ...defaultBindings }, sprintKey: null });
                  setMessage("Default controls restored.");
                }}
              >
                Reset control defaults
              </button>
            </>
          )}
          {page === "return" && (
            <>
              <p className="menu-note">Your progress in this area will reset when you leave.</p>
              <div className="menu-links">
                <button
                  onClick={() => {
                    navigate("/");
                    setPage("pause");
                    resume();
                  }}
                >
                  Return to the forest
                </button>
                <button onClick={() => setPage("pause")}>Stay here</button>
              </div>
            </>
          )}
          {page !== "pause" && page !== "return" && (
            <button className="menu-back" onClick={back}>
              Back
            </button>
          )}
          <Ornament />
          <p className="menu-footnote">
            <kbd>↑ ↓</kbd> Navigate{" "}
            <span>
              <kbd>Enter</kbd> Select
            </span>{" "}
            <span>
              <kbd>Esc</kbd> {page === "pause" ? "Continue" : "Back"}
            </span>
          </p>
          {message && (
            <p className="menu-note" role="status">
              {message}
            </p>
          )}
        </div>
      </dialog>
    </>
  );
}
