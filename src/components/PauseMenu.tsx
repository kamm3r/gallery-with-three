import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { defaultSettings, useGame } from "../gameSettings";
import { isResultScreenActive } from "../gameplay/resultScreen";

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
  const [message, setMessage] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const location = useLocation();
  const navigate = useNavigate();
  const resume = useCallback(() => setPaused(false), [setPaused]);
  const back = useCallback(() => {
    if (page === "pause") resume();
    else
      setPage(
        page === "controls"
          ? controlsParent
          : page === "options" || page === "return"
            ? "pause"
            : "options",
      );
  }, [controlsParent, page, resume]);

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
              <button onClick={resume}>Continue</button>
              <button onClick={() => setPage("options")}>Options</button>
              <button
                onClick={() => {
                  setControlsParent("pause");
                  setPage("controls");
                }}
              >
                Controls
              </button>
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
                Render quality
                <select
                  value={settings.resolution}
                  onChange={(e) => updateSettings({ resolution: Number(e.target.value) })}
                >
                  <option value={0.75}>Low</option>
                  <option value={1}>Standard</option>
                  <option value={1.5}>High</option>
                  <option value={2}>Ultra</option>
                </select>
              </label>
              <button
                className="setting-row"
                onClick={toggleFullscreen}
                disabled={!document.fullscreenEnabled}
              >
                Fullscreen<span>{fullscreen ? "On" : "Off"}</span>
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
                Display changes apply to the world. Settings are saved automatically.
              </p>
              <button
                className="menu-reset"
                onClick={() =>
                  updateSettings({
                    brightness: defaultSettings.brightness,
                    resolution: defaultSettings.resolution,
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
                Sound effects
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
                <div>
                  <dt>Move</dt>
                  <dd>
                    <kbd>W A S D</kbd> / <kbd>↑ ← ↓ →</kbd>
                  </dd>
                </div>
                <div>
                  <dt>Jump / climb ledge</dt>
                  <dd>
                    <kbd>Space</kbd>
                  </dd>
                </div>
                <div>
                  <dt>Run</dt>
                  <dd>
                    <kbd>Shift</kbd>
                  </dd>
                </div>
                <div>
                  <dt>Roll</dt>
                  <dd>
                    <kbd>F</kbd>
                  </dd>
                </div>
                <div>
                  <dt>Sit / stand near a log</dt>
                  <dd>
                    <kbd>E</kbd>
                  </dd>
                </div>
                <div>
                  <dt>Attack in boss arena</dt>
                  <dd>
                    Left mouse button / <kbd>J</kbd>
                  </dd>
                </div>
                <div>
                  <dt>Drop from ledge</dt>
                  <dd>
                    <kbd>S</kbd> / <kbd>↓</kbd>
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
                You can also drag to look around. Touch controls appear on smaller screens. Jump
                into a painting to enter it.
              </p>
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
