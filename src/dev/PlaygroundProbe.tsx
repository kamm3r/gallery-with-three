import { useEffect, useRef, type MutableRefObject } from "react";
import { useAfterPhysicsStep, useRapier } from "@react-three/rapier";
import type { Tuple3 } from "../gameplay/collisionCourse";
import { setPlayerControl } from "../hooks/usePlayerControls";

type Sample = { t: number; x: number; y: number; z: number };

/**
 * Dev-only: `window.__playground` drives the player and records its body
 * position every physics step, so course stations can be checked from a
 * browser console or an automated session.
 */
export function PlaygroundProbe({ teleportRef }: { teleportRef: MutableRefObject<Tuple3 | null> }) {
  const { world, step } = useRapier();
  const trace = useRef<Sample[]>([]);
  const recording = useRef(false);
  const time = useRef(0);
  const findPlayer = () => {
    let found = null as ReturnType<typeof world.getRigidBody> | null;
    world.forEachRigidBody((body) => {
      if ((body.userData as { player?: boolean } | undefined)?.player) found = body;
    });
    return found;
  };
  useAfterPhysicsStep(() => {
    time.current += world.timestep;
    if (!recording.current) return;
    const body = findPlayer();
    if (!body) return;
    const p = body.translation();
    trace.current.push({ t: time.current, x: p.x, y: p.y, z: p.z });
  });
  useEffect(() => {
    const host = window as typeof window & { __playground?: unknown };
    const probe = {
      teleport: (position: Tuple3) => {
        teleportRef.current = position;
      },
      position: () => findPlayer()?.translation(),
      control: setPlayerControl,
      record: () => {
        trace.current = [];
        recording.current = true;
      },
      stop: () => {
        recording.current = false;
        return trace.current;
      },
      bodies: (filter: (name: string) => boolean = () => true) => {
        const out: Array<{ handle: number; type: string; p: unknown; v: unknown }> = [];
        world.forEachRigidBody((body) => {
          const name = String((body.userData as { name?: string } | undefined)?.name ?? "");
          if (!filter(name)) return;
          out.push({
            handle: body.handle,
            type: body.isFixed() ? "fixed" : body.isKinematic() ? "kinematic" : "dynamic",
            p: body.translation(),
            v: body.linvel(),
          });
        });
        return out;
      },
      world,
      /** Runs `n` fixed physics steps with every step hook, without rendering. */
      step: (n = 1) => {
        for (let i = 0; i < n; i++) step(world.timestep);
      },
      /** Puts the body's centre at `position` and zeroes its velocity. */
      place: (position: Tuple3) => {
        const body = findPlayer();
        if (!body) return;
        body.setTranslation({ x: position[0], y: position[1], z: position[2] }, true);
        (body.userData as { launch: (v: number, s: number) => void }).launch(0, 0);
      },
    };
    host.__playground = probe;
    return () => {
      if (host.__playground === probe) delete host.__playground;
    };
  });
  return null;
}
