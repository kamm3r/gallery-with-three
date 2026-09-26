/**
 * Shared hub-world terrain. One height function drives the visual mesh, the
 * Rapier trimesh collider, and every scattered prop, so physics and visuals
 * agree by construction.
 */

import { HUB_PORTALS, firstPathDistance } from "./hubPortals.ts";

export const HUB_HALF = 140;
export const HUB_SEGS = 240;
/** Gameplay clearing: dead flat inside this radius (spawn, paths, portals). */
export const FLAT_RADIUS = 14;
/** Hills ramp in between FLAT_RADIUS and this radius. */
export const HILL_START = 24;
/** Player clamp radius; keep clear of the rim rise. */
export const PLAY_RADIUS = 120;
export const WATER_LEVEL = -0.45;
export const LAKES = [
  { x: 27, z: -48, radiusX: 21, radiusZ: 17, island: false },
  { x: 66, z: 46, radiusX: 32, radiusZ: 27, island: true },
];

export function riverX(z: number) {
  return 34 + Math.sin(z * 0.035) * 12 + Math.sin(z * 0.078) * 7;
}

export function waterDistance(x: number, z: number) {
  // Signed distance to the river/lake shore, negative inside the water.
  let distance = Math.abs(x - riverX(z)) - (3.4 + Math.sin(z * 0.06) * 0.7);
  for (const lake of LAKES) {
    const ellipse = Math.hypot((x - lake.x) / lake.radiusX, (z - lake.z) / lake.radiusZ);
    distance = Math.min(distance, (ellipse - 1) * Math.min(lake.radiusX, lake.radiusZ));
  }
  return distance;
}

export function isDryLand(x: number, z: number) {
  return groundHeight(x, z) > WATER_LEVEL + 0.25;
}

export function smoothstep(edge0: number, edge1: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function hash2(x: number, y: number) {
  const h = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return h - Math.floor(h);
}

export function valueNoise(x: number, z: number) {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const sx = fx * fx * (3 - 2 * fx);
  const sz = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz);
  const b = hash2(ix + 1, iz);
  const c = hash2(ix, iz + 1);
  const d = hash2(ix + 1, iz + 1);
  return a + (b - a) * sx + (c - a) * sz + (a - b - c + d) * sx * sz;
}

function naturalHeight(x: number, z: number) {
  const r = Math.hypot(x, z);
  const mask = smoothstep(FLAT_RADIUS, HILL_START, r);
  if (mask <= 0) return 0;
  const rolling =
    1.5 * Math.sin(x * 0.09 + 0.7) * Math.cos(z * 0.075 + 0.2) +
    0.8 * Math.sin(x * 0.21 + 1.7) * Math.sin(z * 0.19 + 0.6) +
    0.7 * (valueNoise(x * 0.12, z * 0.12) - 0.5);
  // Distant rim rise for a layered horizon inside the fog.
  const rim = smoothstep(124, 155, r) * 8;
  const land = (rolling + rim) * mask;
  const shore = waterDistance(x, z);
  let height = -2.4 + (Math.max(land, 0.45) + 2.4) * smoothstep(-8, 8, shore);
  // Away from the banks, retain the original gentle hills.
  height = height * (1 - smoothstep(8, 20, shore)) + land * smoothstep(8, 20, shore);
  const islandDistance = Math.hypot(x - 66, z - 46);
  const island = 1 - smoothstep(8, 21, islandDistance);
  return (height * (1 - island) + 1.3 * island) * mask;
}

const portalGround = HUB_PORTALS.map((portal) => ({
  ...portal,
  height: Math.max(0.2, naturalHeight(portal.x, portal.z)),
}));

export function groundHeight(x: number, z: number) {
  const natural = naturalHeight(x, z);
  for (const portal of portalGround) {
    const distance = Math.hypot(x - portal.x, z - portal.z);
    if (distance < 15) {
      const blend = smoothstep(5.5, 15, distance);
      return portal.height * (1 - blend) + natural * blend;
    }
  }
  return natural;
}

/** Steepest slope in degrees, sampled numerically. */
export function groundSlopeDeg(x: number, z: number) {
  const e = 0.35;
  const dx = (groundHeight(x + e, z) - groundHeight(x - e, z)) / (2 * e);
  const dz = (groundHeight(x, z + e) - groundHeight(x, z - e)) / (2 * e);
  return (Math.atan(Math.hypot(dx, dz)) * 180) / Math.PI;
}

export interface TerrainGrid {
  vertices: number[];
  indices: number[];
  colors: number[];
  count: number;
}

function groundColor(x: number, z: number, h: number): [number, number, number] {
  const patch = valueNoise(x * 0.05 + 31, z * 0.05 + 7);
  const grain = valueNoise(x * 0.35 + 3, z * 0.35 + 11);
  // Mossy forest floor, lightness jitter.
  let r = 0.22 + grain * 0.07;
  let g = 0.33 + grain * 0.09;
  let b = 0.17 + grain * 0.05;
  // Dry sunlit tint on hilltops.
  const dry = smoothstep(1.1, 2.4, h);
  r += dry * 0.16;
  g += dry * 0.1;
  b -= dry * 0.04;
  // Dark soil pockets in the hollows of the patch noise.
  const soil = 1 - smoothstep(0.3, 0.48, patch);
  r = r * (1 - soil * 0.25);
  g = g * (1 - soil * 0.3);
  b = b * (1 - soil * 0.2);
  const path = 1 - smoothstep(0.9, 1.7, firstPathDistance(x, z));
  return [
    r * (1 - path) + (0.48 + grain * 0.08) * path,
    g * (1 - path) + (0.38 + grain * 0.07) * path,
    b * (1 - path) + (0.23 + grain * 0.06) * path,
  ];
}

export function buildTerrainGrid(half: number = HUB_HALF, segs: number = HUB_SEGS): TerrainGrid {
  const vertices: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  for (let j = 0; j <= segs; j++) {
    for (let i = 0; i <= segs; i++) {
      const x = -half + (2 * half * i) / segs;
      const z = -half + (2 * half * j) / segs;
      const y = groundHeight(x, z);
      vertices.push(x, y, z);
      const [r, g, b] = groundColor(x, z, y);
      colors.push(r, g, b);
    }
  }
  for (let j = 0; j < segs; j++) {
    for (let i = 0; i < segs; i++) {
      const a = j * (segs + 1) + i;
      const b = a + 1;
      const c = a + segs + 1;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
  return { vertices, indices, colors, count: (segs + 1) * (segs + 1) };
}

export function mulberry32(seed: number) {
  let state = seed >>> 0;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface ScatterPoint {
  x: number;
  y: number;
  z: number;
  scale: number;
  rotation: number;
  tint: number;
}

/** Deterministic scatter in an annulus; y follows the terrain. */
export function scatter(
  count: number,
  minR: number,
  maxR: number,
  seed: number,
  minScale = 0.7,
  maxScale = 1.3,
): ScatterPoint[] {
  const rand = mulberry32(seed);
  const points: ScatterPoint[] = [];
  for (let n = 0; n < count; n++) {
    const angle = rand() * Math.PI * 2;
    const radius = minR + Math.sqrt(rand()) * (maxR - minR);
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    points.push({
      x,
      y: groundHeight(x, z),
      z,
      scale: minScale + rand() * (maxScale - minScale),
      rotation: rand() * Math.PI * 2,
      tint: rand(),
    });
  }
  return points;
}
