import { useEffect } from "react";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";
import { useGame } from "../gameSettings";
import { waitForPreparationFrame } from "../gameplay/scenePreparation";

export function ScenePreparation({
  ready,
  onPreparing,
}: {
  ready: boolean;
  onPreparing: (value: boolean) => void;
}) {
  const { settings } = useGame();
  const gl = useThree((s) => s.gl),
    scene = useThree((s) => s.scene),
    camera = useThree((s) => s.camera);
  const clock = useThree((s) => s.clock),
    advance = useThree((s) => s.advance);
  const signature = [
    settings.shadows,
    settings.ambientOcclusion,
    settings.bloom,
    settings.environmentDetail,
    settings.particleDetail,
    settings.resolution,
  ].join(":");
  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    onPreparing(true);
    const nextFrame = waitForPreparationFrame;
    const prepare = async () => {
      // Let the loading overlay paint and the quality controls commit first.
      await nextFrame();
      await nextFrame();
      if (cancelled) return;
      const textures = new Set<THREE.Texture>();
      scene.traverse((o) => {
        if (!(o instanceof THREE.Mesh || o instanceof THREE.Points)) return;
        for (const material of Array.isArray(o.material) ? o.material : [o.material])
          for (const value of Object.values(material))
            if (
              value instanceof THREE.Texture &&
              !value.isRenderTargetTexture &&
              !(value instanceof THREE.DepthTexture)
            )
              textures.add(value);
      });
      for (const texture of textures) gl.initTexture(texture);
      await gl.compileAsync(scene, camera);
      if (cancelled) return;
      // Upload buffers and prepare shadow/post targets at zero game delta.
      advance(clock.elapsedTime);
      await nextFrame();
      if (!cancelled) advance(clock.elapsedTime);
    };
    void prepare()
      .catch((error) => console.error("Scene preparation failed", error))
      .finally(() => {
        if (!cancelled) onPreparing(false);
      });
    return () => {
      cancelled = true;
    };
  }, [ready, signature, gl, scene, camera, clock, advance, onPreparing]);
  return null;
}
