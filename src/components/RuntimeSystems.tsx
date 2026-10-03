import { useFrame } from "@react-three/fiber";
import { useWorld } from "koota/react";
import { syncPlayer } from "../gameplay/ecs/syncPlayer";
import { updateVisibility } from "../gameplay/ecs/updateVisibility";

export function RuntimeSystems() {
  const world = useWorld();
  // Early data sync; late culling sees this frame's final chase-camera pose.
  useFrame(() => syncPlayer(world), -2);
  // Positive priority takes over rendering in R3F; CinematicPost draws the
  // frame (through its composer, or directly when post is switched off).
  useFrame(({ camera }) => updateVisibility(world, camera), 0.5);
  return null;
}
