import { useFrame, useThree } from "@react-three/fiber";
import { useRef, useState, type MutableRefObject } from "react";
import * as THREE from "three";
import type { Night } from "../gameplay/hollowNight";
import { playSound } from "../gameplay/sound";
import { AnimatedCharacter, type ActionName } from "./AnimatedCharacter";
import { Embers } from "./ashFx";

// The killer: the survivor's own rig recoloured into a pale, featureless mask
// and navy coveralls, the sword shrunk to a kitchen knife. He walks his
// patrols, jogs a chase, and blurs when he shifts.

const PALETTE = {
  Skin: "#d9d5c8",
  Face: "#040404",
  Hair: "#3a2c22",
  Shirt: "#1c2837",
  Pants: "#1a2433",
  Belt: "#121212",
};

const STRIDE = { Walk: 1.1, Run: 1.6 } as Record<string, number>;
const cameraRight = new THREE.Vector3();

export function Killer({ night }: { night: MutableRefObject<Night> }) {
  const root = useRef<THREE.Group>(null);
  const body = useRef<THREE.Group>(null);
  const camera = useThree((state) => state.camera);
  const [pose, setPose] = useState<{ animation: ActionName; pace: number }>({
    animation: "Idle",
    pace: 1,
  });
  const stride = useRef(0);
  const last = useRef({ x: night.current.killer.x, z: night.current.killer.z });
  const [shifting, setShifting] = useState(false);

  useFrame((state, delta) => {
    const k = night.current.killer;
    const g = root.current;
    if (!g || !body.current) return;
    g.position.set(k.x, 0, k.z);
    // Turn heavily rather than snapping, except when he lunges.
    let turn = k.yaw - g.rotation.y;
    turn = Math.atan2(Math.sin(turn), Math.cos(turn));
    g.rotation.y += turn * (1 - Math.exp(-(k.mode === "attack" ? 20 : 7) * delta));

    const moved = Math.hypot(k.x - last.current.x, k.z - last.current.z);
    last.current = { x: k.x, z: k.z };
    let next: { animation: ActionName; pace: number };
    if (k.mode === "attack") next = { animation: "SwordSlash", pace: 1 };
    else if (!k.moving) next = { animation: "Idle", pace: 0.8 };
    else if (k.shifting > 0) next = { animation: "Run", pace: 1.7 };
    else if (k.mode === "chase") next = { animation: "Run", pace: 0.85 };
    else next = { animation: "Walk", pace: k.mode === "patrol" ? 0.8 : 1.05 };
    if (next.animation !== pose.animation || next.pace !== pose.pace) setPose(next);
    if (shifting !== k.shifting > 0) setShifting(k.shifting > 0);

    // A shift is a stutter of presence: there, not there, there.
    body.current.visible = k.shifting <= 0 || Math.sin(state.clock.elapsedTime * 60) > 0;

    // Heavy footsteps, placed left or right of the camera.
    const length = STRIDE[next.animation];
    if (length && k.moving) {
      stride.current += moved;
      if (stride.current >= length) {
        stride.current = 0;
        const gap = Math.hypot(k.x - camera.position.x, k.z - camera.position.z);
        if (gap < 26) {
          cameraRight.setFromMatrixColumn(camera.matrixWorld, 0);
          const pan =
            ((k.x - camera.position.x) * cameraRight.x +
              (k.z - camera.position.z) * cameraRight.z) /
            Math.max(gap, 1);
          playSound("stomp", { intensity: 1 - gap / 26, pan });
        }
      }
    }
  });

  return (
    <group ref={root}>
      <group ref={body}>
        <AnimatedCharacter
          animation={pose.animation}
          pace={pose.pace}
          palette={PALETTE}
          armed
          weaponScale={0.5}
          scale={1.02}
        />
      </group>
      {shifting && (
        <Embers
          count={60}
          radius={0.6}
          height={2.2}
          speed={0.8}
          size={1.2}
          color="#0a0a0c"
          additive={false}
          sway={0.5}
          opacity={0.8}
        />
      )}
    </group>
  );
}
