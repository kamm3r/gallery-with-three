import { groundHeight, isDryLand, mulberry32, smoothstep, valueNoise } from "./terrain.ts";
import { inPortalGarden, firstPathDistance } from "./hubPortals.ts";

export const GRASS_CHUNK_SIZE = 10;
export const GRASS_RADIUS = 124;
/**
 * Blade height like Quick_Grass (GRASS_HEIGHT with a 0.75-1.5 random
 * multiplier): tall meadow grass instead of lawn.
 */
export const GRASS_HEIGHT = 1.5;

export function allowsGrass(x: number, z: number) {
  if (Math.hypot(x, z) > GRASS_RADIUS) return false;
  if (!isDryLand(x, z)) return false;
  if (inPortalGarden(x, z)) return false;
  if (firstPathDistance(x, z) < 1.8) return false;
  const spawn = Math.hypot(x, z - 6) < 1.5;
  return !spawn;
}

/**
 * Tall grass gathers in sunlit drifts; between them, and in the heart of the
 * clearing, it stays knee-high so the forest floor, flowers and ruins read.
 */
export function grassHeightScale(x: number, z: number) {
  const drift = smoothstep(0.42, 0.62, valueNoise(x * 0.045 + 17, z * 0.045 - 5));
  const clearing = smoothstep(7, 15, Math.hypot(x, z));
  return (0.5 + drift * 0.5) * (0.6 + clearing * 0.4);
}

export function createGrassPatch(chunkX: number, chunkZ: number, density: number) {
  const random = mulberry32(((chunkX + 7) * 73856093) ^ ((chunkZ + 7) * 19349663));
  const blades: Array<{ x: number; y: number; z: number; height: number; angle: number }> = [];
  for (let i = 0; i < GRASS_CHUNK_SIZE ** 2 * density; i++) {
    const x = (chunkX + random()) * GRASS_CHUNK_SIZE;
    const z = (chunkZ + random()) * GRASS_CHUNK_SIZE;
    const variation = 0.75 + random() * 0.75;
    const angle = random() * Math.PI * 2;
    if (!allowsGrass(x, z)) continue;
    // A broad density field avoids an evenly combed carpet.
    if (random() > 0.6 + valueNoise(x * 0.13, z * 0.13) * 0.4) continue;
    const height = GRASS_HEIGHT * variation * grassHeightScale(x, z);
    blades.push({ x, y: groundHeight(x, z) - 0.025, z, height, angle });
  }
  return blades;
}
