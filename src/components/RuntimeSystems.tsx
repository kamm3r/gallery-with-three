import { useFrame } from "@react-three/fiber";
import { useWorld } from "koota/react";
import { syncPlayer } from "../gameplay/ecs/syncPlayer";
import { updateVisibility } from "../gameplay/ecs/updateVisibility";

export function RuntimeSystems() {
  const world = useWorld();
  // Early data sync; late culling sees this frame's final chase-camera pose.
  useFrame(() => syncPlayer(world), -2);
  useFrame(({ camera }) => updateVisibility(world, camera), 0.5);
  // Positive priority takes over rendering in R3F, so explicitly draw last.
  useFrame(({ gl, scene, camera }) => gl.render(scene, camera), 1);
  return null;
}
