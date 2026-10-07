import { useCallback, useEffect } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { useGame } from "../gameSettings";
import { useEcsRef } from "../hooks/useEcsRef";
import { shadowSizes } from "../gameplay/graphicsSettings";

/** Apply shadow resolution to authored lights, including scenes mounted asynchronously. */
export function GraphicsQuality() {
  const { settings } = useGame();
  const scene = useThree((s) => s.scene);
  const gl = useThree((s) => s.gl);
  const cache = useEcsRef("render-shadow-budget", () => ({
    discover: 0,
    shadows: [] as THREE.LightShadow[],
  }));
  const update = useCallback(() => {
    const size = shadowSizes[settings.shadows];
    if (!size) return;
    for (const shadow of cache.current.shadows) {
      if (shadow.mapSize.x === size && shadow.mapSize.y === size) continue;
      shadow.mapSize.set(size, size);
      shadow.map?.dispose();
      shadow.map = null;
      shadow.mapPass?.dispose();
      shadow.mapPass = null;
      shadow.needsUpdate = gl.shadowMap.needsUpdate = true;
    }
  }, [cache, gl, settings.shadows]);
  useEffect(() => {
    update();
    cache.current.discover = 0;
  }, [update, cache]);
  useFrame((_, dt) => {
    cache.current.discover -= dt;
    if (cache.current.discover > 0) return;
    cache.current.discover = 0.5;
    cache.current.shadows.length = 0;
    scene.traverse((o) => {
      if (
        (o instanceof THREE.DirectionalLight ||
          o instanceof THREE.SpotLight ||
          o instanceof THREE.PointLight) &&
        o.castShadow
      )
        cache.current.shadows.push(o.shadow);
    });
    update();
  }, -0.1);
  return null;
}
