import * as THREE from "three";
import { groundHeight } from "./terrain.ts";

/** World-space meters covered by the baked height texture (hub is ±140). */
export const HEIGHTMAP_WORLD = 280;
const HEIGHTMAP_RES = 512;

export interface HeightField {
  resolution: number;
  world: number;
  heights: Float32Array;
}

/** World position of a height-field texel. Row 0 is +world/2 in z. */
function heightFieldPosition(
  resolution: number,
  world: number,
  i: number,
  j: number,
): { x: number; z: number } {
  return {
    x: -world / 2 + (i / (resolution - 1)) * world,
    z: world / 2 - (j / (resolution - 1)) * world,
  };
}

export function bakeHeightField(
  resolution: number = HEIGHTMAP_RES,
  world: number = HEIGHTMAP_WORLD,
): HeightField {
  const heights = new Float32Array(resolution * resolution);
  for (let j = 0; j < resolution; j++) {
    for (let i = 0; i < resolution; i++) {
      const { x, z } = heightFieldPosition(resolution, world, i, j);
      heights[j * resolution + i] = groundHeight(x, z);
    }
  }
  return { resolution, world, heights };
}

/**
 * Packs heights into an R half-float texture for vertex-shader terrain
 * lookups (half-float filtering is core in WebGL2).
 */
export function buildHeightTexture(field?: HeightField): THREE.DataTexture {
  const baked = field ?? bakeHeightField();
  const { resolution } = baked;
  const data = new Uint16Array(resolution * resolution);
  for (let k = 0; k < resolution * resolution; k++) {
    data[k] = THREE.DataUtils.toHalfFloat(baked.heights[k]);
  }
  const texture = new THREE.DataTexture(
    data,
    resolution,
    resolution,
    THREE.RedFormat,
    THREE.HalfFloatType,
  );
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

let sharedTexture: THREE.DataTexture | null = null;

/** App-lifetime height texture shared by GPU-driven nature (moths, grass). */
export function sharedHeightTexture(): THREE.DataTexture {
  if (!sharedTexture) sharedTexture = buildHeightTexture();
  return sharedTexture;
}
