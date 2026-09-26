import { button, folder, useControls } from "leva";
import { useEffect, useMemo, useRef, type MutableRefObject } from "react";
import { parkZones, type Tuple3 } from "../gameplay/collisionCourse";
import { controllerDefaults, type ControllerTuning } from "../gameplay/controllerTuning";
import { useGame } from "../gameSettings";

const RAD_TO_DEG = 180 / Math.PI;
const panelDefaults = {
  ...controllerDefaults,
  skidAngle: Math.round(controllerDefaults.skidAngle * RAD_TO_DEG),
  slopeMaxAngle: Math.round(controllerDefaults.slopeMaxAngle * RAD_TO_DEG),
};

function slider(value: number, min: number, max: number, step: number, label: string) {
  return { value, min, max, step, label };
}

/** Leva "Controller" folder. Mounted by the playground only, so the other
 * worlds always play on `controllerDefaults`. */
export function useControllerTuning(): ControllerTuning {
  const d = panelDefaults;
  const [values, set] = useControls("Controller", () => ({
    Movement: folder({
      walkSpeed: slider(d.walkSpeed, 1, 12, 0.1, "Walk speed"),
      runSpeed: slider(d.runSpeed, 1, 16, 0.1, "Run speed"),
      groundAccel: slider(d.groundAccel, 5, 120, 1, "Accel"),
      groundDecel: slider(d.groundDecel, 5, 120, 1, "Decel"),
      groundTurnRate: slider(d.groundTurnRate, 1, 30, 0.5, "Turn rate"),
      facingDampGround: slider(d.facingDampGround, 1, 40, 0.5, "Face turn"),
    }),
    Skid: folder({
      skidAngle: slider(d.skidAngle, 90, 180, 1, "Reverse angle"),
      skidMinSpeed: slider(d.skidMinSpeed, 0, 10, 0.1, "Min speed"),
      skidDecel: slider(d.skidDecel, 5, 150, 1, "Braking"),
    }),
    Air: folder({
      airAccel: slider(d.airAccel, 0, 60, 0.5, "Air control"),
      airDrag: slider(d.airDrag, 0, 10, 0.1, "Air drag"),
      facingDampAir: slider(d.facingDampAir, 0, 40, 0.5, "Air face turn"),
    }),
    Jump: folder({
      jumpSpeed: slider(d.jumpSpeed, 4, 20, 0.1, "Takeoff speed"),
      riseGravity: slider(d.riseGravity, 0.3, 4, 0.05, "Rise gravity"),
      cutGravity: slider(d.cutGravity, 0.3, 6, 0.05, "Release gravity"),
      apexGravity: slider(d.apexGravity, 0.1, 2, 0.05, "Apex gravity"),
      apexSpeed: slider(d.apexSpeed, 0, 6, 0.1, "Apex window"),
      fallGravity: slider(d.fallGravity, 0.5, 5, 0.05, "Fall gravity"),
      fallMaxSpeed: slider(d.fallMaxSpeed, 5, 60, 1, "Terminal speed"),
      coyoteTime: slider(d.coyoteTime, 0, 0.4, 0.01, "Coyote time"),
      jumpBuffer: slider(d.jumpBuffer, 0, 0.4, 0.01, "Jump buffer"),
    }),
    Collision: folder({
      skinWidth: slider(d.skinWidth, 0.005, 0.2, 0.005, "Skin width"),
      stepHeight: slider(d.stepHeight, 0, 1.2, 0.02, "Step height"),
      snapDistance: slider(d.snapDistance, 0, 1.5, 0.02, "Ground snap"),
      slopeMaxAngle: slider(d.slopeMaxAngle, 10, 85, 1, "Max slope"),
      mass: slider(d.mass, 1, 200, 1, "Push mass"),
    }),
  }));

  const tuning = useMemo(
    () => ({
      ...values,
      skidAngle: values.skidAngle / RAD_TO_DEG,
      slopeMaxAngle: values.slopeMaxAngle / RAD_TO_DEG,
    }),
    [values],
  );
  const latest = useRef(tuning);
  latest.current = tuning;

  useControls(
    "Controller",
    {
      "Reset defaults": button(() => set(panelDefaults)),
      // Paste into gameplay/controllerTuning.ts once a setting feels right.
      "Copy values": button(() => {
        void navigator.clipboard?.writeText(JSON.stringify(latest.current, null, 2));
      }),
    },
    [set],
  );
  return tuning;
}

/** Leva zone picker plus `[` / `]` to cycle zones and `R` to restart one. */
export function useZoneTeleport(teleportRef: MutableRefObject<Tuple3 | null>) {
  const { paused } = useGame();
  const names = useMemo(() => parkZones.map((zone) => zone.name), []);
  const current = useRef(0);
  const [, set] = useControls("Test zones", () => ({
    zone: {
      value: names[0],
      options: names,
      label: "Zone",
      onChange: (name: string, _path, context) => {
        current.current = Math.max(0, names.indexOf(name));
        // Picking from the panel teleports; the initial mount does not.
        if (!context.initial) teleportRef.current = parkZones[current.current].spawn;
      },
      transient: false,
    },
  }));

  useEffect(() => {
    if (paused) return;
    const go = (index: number) => {
      current.current = (index + parkZones.length) % parkZones.length;
      teleportRef.current = parkZones[current.current].spawn;
      set({ zone: names[current.current] });
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.repeat || event.target instanceof HTMLInputElement) return;
      if (event.code === "BracketRight") go(current.current + 1);
      else if (event.code === "BracketLeft") go(current.current - 1);
      else if (event.code === "KeyR") teleportRef.current = parkZones[current.current].spawn;
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [names, paused, set, teleportRef]);
}
