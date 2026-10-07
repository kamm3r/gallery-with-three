import * as THREE from "three";

const worldPosition = new THREE.Vector3();
/** Keep a fixed light count so moving through the parish does not recompile shaders. */
export function applyPointLightBudget(
  lights: THREE.PointLight[],
  camera: THREE.Vector3,
  limit: number,
) {
  const candidates = lights
    .filter((light) => {
      if (light.intensity <= 0) return false;
      for (let parent = light.parent; parent; parent = parent.parent)
        if (!parent.visible) return false;
      return true;
    })
    .map((light) => ({
      light,
      // Hysteresis avoids swapping nearly equidistant lights on every camera step.
      score:
        light.getWorldPosition(worldPosition).distanceToSquared(camera) *
        (light.visible ? 0.85 : 1),
    }))
    .sort((a, b) => a.score - b.score || a.light.id - b.light.id);
  const active = new Set(
    candidates.slice(0, Math.max(0, Math.floor(limit))).map((candidate) => candidate.light),
  );
  for (const light of lights) light.visible = active.has(light);
}
