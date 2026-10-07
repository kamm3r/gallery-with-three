import { useEffect } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { applyPointLightBudget } from "../gameplay/pointLightBudget";
import { useEcsRef } from "../hooks/useEcsRef";

export function PointLightBudget({ limit }: { limit: number }) {
  const state = useEcsRef("render-point-light-budget", () => ({
    originals: new Map<THREE.PointLight, boolean>(),
    lights: [] as THREE.PointLight[],
    discover: 0,
    update: 0,
  }));
  useEffect(() => {
    const current = state.current;
    return () => {
      for (const [light, visible] of current.originals) light.visible = visible;
      current.originals.clear();
      current.lights = [];
      current.discover = current.update = 0;
    };
  }, [state]);
  useFrame(({ scene, camera }, delta) => {
    const current = state.current;
    current.discover -= delta;
    current.update -= delta;
    if (current.discover <= 0) {
      // Discover async-mounted lights without traversing every mesh each frame.
      current.discover = 0.5;
      const lights: THREE.PointLight[] = [];
      scene.traverse((object) => {
        if (!(object instanceof THREE.PointLight)) return;
        if (!current.originals.has(object)) current.originals.set(object, object.visible);
        if (current.originals.get(object)) lights.push(object);
      });
      current.lights = lights;
    }
    if (current.update > 0) return;
    current.update = 0.1;
    applyPointLightBudget(current.lights, camera.position, limit);
  });
  return null;
}
