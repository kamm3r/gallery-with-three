import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { Physics } from "@react-three/rapier";
import { useLocation, useNavigate } from "react-router-dom";
import { GameCanvas } from "../components/GameCanvas";
import { ThirdPersonPlayer } from "../components/ThirdPersonPlayer";
import { PortalPainting } from "../components/PortalPainting";
import { PortalFrameCollider } from "../components/PortalFrameCollider";
import { ExperienceHud } from "../components/ExperienceHud";
import { HollowLane, LANE_ATMOSPHERE, laneSignals } from "../components/HollowLane";
import { nightFx } from "../components/halloweenProps";
import { useGame } from "../gameSettings";
import { useGameTimeout } from "../hooks/useGameTimeout";
import { setResultScreenActive } from "../gameplay/resultScreen";
import { setMood } from "../gameplay/sound";
import { InventoryBar } from "../components/InventoryBar";
import {
  addItem,
  closeInventory,
  openInventory,
  removeItem,
  type ItemDef,
} from "../gameplay/inventory";
import { LANE_HALF, LANE_PORTAL, LANE_START } from "../gameplay/hollowLane";
import {
  CAR_PARTS,
  NIGHT,
  isPart,
  type Loot,
  type NightEvent,
  type Outcome,
} from "../gameplay/hollowNight";

const PART_LABEL: Record<Loot, string> = {
  keys: "Car keys",
  gas: "Gas can",
  battery: "Battery",
  fuse: "Fuse",
  medkit: "Med kit",
  drink: "Energy drink",
};

/** What you can carry on Hollow Lane. The inventory belongs to this portal:
 * you arrive with a flashlight, and everything is gone when you leave. */
const LANE_ITEMS: ItemDef[] = [
  {
    id: "flashlight",
    name: "Flashlight",
    description: "Lights the way, and gives you away: he spots a lit torch from much further off.",
    icon: "flashlight",
    toggle: true,
  },
  {
    id: "keys",
    name: "Car keys",
    description: "For the station wagon in the cul-de-sac.",
    icon: "key",
  },
  { id: "gas", name: "Gas can", description: "The station wagon's tank is empty.", icon: "gas" },
  {
    id: "battery",
    name: "Battery",
    description: "The station wagon won't turn over without it.",
    icon: "battery",
  },
  { id: "fuse", name: "Fuse", description: "Fixes the dead payphone on Elm Street.", icon: "fuse" },
  {
    id: "medkit",
    name: "Med kit",
    description: "Patches up a stab wound. Does nothing if you're unhurt.",
    icon: "medkit",
    consumable: true,
  },
  {
    id: "drink",
    name: "Energy drink",
    description: "Instantly refills your stamina, even when you're winded.",
    icon: "drink",
    consumable: true,
  },
];

const OUTCOME_TITLE: Record<Outcome, string> = {
  dead: "You didn't survive the night",
  car: "You drove out of Hollow Lane",
  police: "The police got you out",
};

interface LaneHudState {
  found: Record<"keys" | "gas" | "battery" | "fuse", boolean>;
  health: number;
  police: "none" | "called" | "here";
  hitId: number;
  message: string;
  outcome: Outcome | null;
}

function LaneRun({ retry }: { retry: () => void }) {
  const { paused } = useGame();
  const navigate = useNavigate();
  const { state } = useLocation();
  const [ready, setReady] = useState(false);
  const [near, setNear] = useState(false);
  const [resultOpen, setResultOpen] = useState(false);
  const { schedule, cancel } = useGameTimeout();
  const [hud, setHud] = useState<LaneHudState>({
    found: { keys: false, gas: false, battery: false, fuse: false },
    health: NIGHT.health,
    police: "none",
    hitId: 0,
    message: "",
    outcome: null,
  });
  const messageTimer = useRef(0);
  const retryButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    setResultScreenActive(resultOpen);
    if (resultOpen) retryButton.current?.focus();
    return () => setResultScreenActive(false);
  }, [resultOpen]);
  useEffect(() => setMood("grove"), []);
  useEffect(() => {
    openInventory("seasons", LANE_ITEMS, [{ id: "flashlight", on: true }]);
    return () => closeInventory("seasons");
  }, []);
  const markReady = useCallback(() => setReady(true), []);
  const exit = useCallback(
    () => navigate("/", { state: { returnPortal: state?.fromPortal } }),
    [navigate, state],
  );

  const onEvent = useCallback(
    (event: NightEvent) => {
      const say = (message: string, ms = 3200) => {
        cancel(messageTimer.current);
        setHud((h) => ({ ...h, message }));
        messageTimer.current = schedule(() => setHud((h) => ({ ...h, message: "" })), ms);
      };
      switch (event.type) {
        case "awake":
          say("Somewhere up the street, a door creaks open.", 4000);
          break;
        case "found": {
          const item = event.item;
          addItem(item);
          if (isPart(item)) setHud((h) => ({ ...h, found: { ...h.found, [item]: true } }));
          say(`Got the ${PART_LABEL[item].toLowerCase()}.`);
          break;
        }
        case "revealed":
          say(`There's a ${PART_LABEL[event.item].toLowerCase()} in here.`, 2500);
          break;
        case "healed":
          say(event.health === NIGHT.health ? "Patched up. Keep moving." : "Second wind.", 2400);
          setHud((h) => ({ ...h, health: event.health }));
          break;
        case "locked":
          if (event.locked) say("Door locked. It won't hold him forever.", 2600);
          break;
        case "bash":
          say("He's breaking the door down!", 1600);
          break;
        case "broken":
          say("The door gives way.", 2000);
          break;
        case "empty":
          say("Nothing useful here.", 1800);
          break;
        case "spotted":
          say("He sees you. Run.", 2000);
          break;
        case "heard":
          say("He heard that.", 2000);
          break;
        case "sense":
          say("He can feel you nearby. Move.", 2600);
          break;
        case "lost":
          say("He lost you. Stay out of sight.", 2600);
          break;
        case "pulledOut":
          say("He found your hiding place!", 2000);
          break;
        case "hit":
          setHud((h) => ({ ...h, health: event.health, hitId: h.hitId + 1 }));
          if (event.health > 0) say("You're hurt. One more and it's over.", 3500);
          break;
        case "exhausted":
          say("Out of breath.", 1600);
          break;
        case "carStart":
          say("The engine's turning over. He heard that.", 3000);
          break;
        case "called":
          removeItem("fuse");
          setHud((h) => ({ ...h, police: "called" }));
          say("Police are on their way. Stay alive.", 4000);
          break;
        case "policeHere":
          setHud((h) => ({ ...h, police: "here" }));
          say("Sirens at the south end of the lane!", 4000);
          break;
        case "escaped":
          setHud((h) => ({ ...h, outcome: event.outcome, message: "" }));
          schedule(() => setResultOpen(true), event.outcome === "dead" ? 1400 : 2600);
          break;
      }
    },
    [schedule, cancel],
  );

  const carReady = CAR_PARTS.every((part) => hud.found[part]);
  return (
    <main className="experience">
      <GameCanvas
        shadows="percentage"
        camera={{ position: [0, 4, LANE_START[2] + 8], fov: 55 }}
        atmosphere={LANE_ATMOSPHERE}
      >
        <Suspense fallback={null}>
          <Physics gravity={[0, -30, 0]} paused={paused}>
            <HollowLane onEvent={onEvent} />
            <PortalPainting
              image="/assets/tree.jpg"
              position={LANE_PORTAL}
              rotation={[0, Math.PI, 0]}
              scale={1.2}
              active={near}
            />
            <PortalFrameCollider position={LANE_PORTAL} rotation={[0, Math.PI, 0]} scale={1.2} />
            <ThirdPersonPlayer
              start={LANE_START}
              held="flashlight"
              bounds={[LANE_HALF, LANE_HALF]}
              portals={[
                {
                  id: "forest",
                  position: [LANE_PORTAL[0], 0, LANE_PORTAL[2]],
                  yaw: Math.PI,
                  scale: 1.2,
                },
              ]}
              onNearPortal={(id) => setNear(Boolean(id))}
              onEnterPortal={exit}
              onHangChange={() => {}}
              onReady={markReady}
            />
          </Physics>
        </Suspense>
      </GameCanvas>
      <ExperienceHud
        chapter="Halloween"
        title="Hollow Lane"
        ready={ready}
        leaving={false}
        prompt={near ? "Jump through to flee back to the forest" : undefined}
      />
      {ready && !paused && (
        <section
          className={`lane-hud${hud.health < NIGHT.health ? " is-injured" : ""}`}
          aria-label="Survival status"
        >
          <LaneOverlay />
          <InventoryBar />
          {hud.hitId > 0 && <div key={hud.hitId} className="hurt-flash" aria-hidden="true" />}
          <div className="lane-objectives">
            <h2>Escape Hollow Lane</h2>
            <p>By car</p>
            <ul>
              {CAR_PARTS.map((part) => (
                <li key={part} className={hud.found[part] ? "is-done" : undefined}>
                  {PART_LABEL[part]}
                </li>
              ))}
              {carReady && <li className="is-goal">Start the car in the cul-de-sac</li>}
            </ul>
            <p>By police</p>
            <ul>
              <li className={hud.found.fuse ? "is-done" : undefined}>{PART_LABEL.fuse}</li>
              {hud.found.fuse && hud.police === "none" && (
                <li className="is-goal">Fix the payphone on Elm Street</li>
              )}
              {hud.police === "called" && <li className="is-goal" data-police-timer />}
              {hud.police === "here" && (
                <li className="is-goal">Get to the police at the south end</li>
              )}
            </ul>
            <small>
              <kbd>E</kbd> to search, pick up, open doors and hide. Hold <kbd>E</kbd> on a door from
              inside to lock it. <kbd>1</kbd> switches the flashlight. Shift sprints, but he hears
              it.
            </small>
          </div>
          <p className={`hollow-message${hud.message ? " is-visible" : ""}`} role="status">
            {hud.message}
          </p>
          {resultOpen && hud.outcome && (
            <div
              className={`combat-result ${hud.outcome === "dead" ? "is-death" : "is-victory"}`}
              role="dialog"
              aria-label="Night result"
            >
              <h2>{OUTCOME_TITLE[hud.outcome]}</h2>
              <div className="combat-result-actions">
                <button ref={retryButton} onClick={retry}>
                  Play the night again
                </button>
                <button onClick={exit}>Return to the forest</button>
              </div>
            </div>
          )}
        </section>
      )}
    </main>
  );
}

const AWARENESS_LABEL = {
  asleep: "Quiet",
  unaware: "He's walking",
  suspicious: "He's searching",
  hunting: "He's hunting you",
} as const;

/** Stamina, awareness, actions and fear overlays, driven from per-frame signals. */
function LaneOverlay() {
  const root = useRef<HTMLDivElement>(null);
  const awarenessText = useRef<HTMLSpanElement>(null);
  const promptText = useRef<HTMLSpanElement>(null);
  const meter = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let frame = 0;
    const tick = () => {
      const el = root.current;
      if (el) {
        const s = laneSignals;
        el.style.setProperty("--danger", nightFx.danger.toFixed(3));
        el.style.setProperty("--stamina", (s.stamina / 100).toFixed(3));
        el.style.setProperty("--stamina-max", (s.maxStamina / 100).toFixed(3));
        el.style.setProperty("--channel", s.progress.toFixed(3));
        el.dataset.awareness = s.awareness;
        el.dataset.hidden = s.hidden ?? "none";
        el.dataset.prompt = String(Boolean(s.prompt));
        el.dataset.hold = String(s.hold);
        el.dataset.winded = String(!s.sprintAllowed);
        el.dataset.rested = String(s.stamina >= s.maxStamina - 0.5);
        meter.current?.setAttribute("aria-valuenow", String(Math.round(s.stamina)));
        if (awarenessText.current) awarenessText.current.textContent = AWARENESS_LABEL[s.awareness];
        if (promptText.current && promptText.current.textContent !== (s.prompt ?? ""))
          promptText.current.textContent = s.prompt ?? "";
        const timer = el.parentElement?.querySelector<HTMLElement>("[data-police-timer]");
        if (timer && s.police >= 0) {
          const seconds = Math.ceil(s.police);
          timer.textContent = `Police arriving in ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
        }
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);
  return (
    <div ref={root} className="lane-overlay">
      <div className="hollow-danger" aria-hidden="true" />
      <div className="lane-hidden" aria-hidden="true">
        <span>Hidden</span>
      </div>
      <p className="lane-awareness" role="status">
        <span className="lane-eye" aria-hidden="true" />
        <span ref={awarenessText} />
      </p>
      <div className="lane-prompt" role="status">
        <kbd>E</kbd>
        <small>Hold</small>
        <span ref={promptText} />
        <i />
      </div>
      <div
        ref={meter}
        className="lane-stamina"
        role="meter"
        aria-label="Stamina"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={100}
      >
        <i />
      </div>
    </div>
  );
}

export default function SeasonsLevel() {
  const [attempt, setAttempt] = useState(0);
  return <LaneRun key={attempt} retry={() => setAttempt((n) => n + 1)} />;
}
