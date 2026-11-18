import * as THREE from "three";

/** Metre-scale fractured relief across the whole rock face, beyond the tiled grain. */
export function applyCapitalRockRelief(material: THREE.MeshStandardMaterial) {
  const compile = material.onBeforeCompile.bind(material);
  const cacheKey = material.customProgramCacheKey();
  material.onBeforeCompile = (shader, renderer) => {
    compile(shader, renderer);
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <common>",
      `#include <common>
      float capitalRockHash(vec3 p) {
        return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453);
      }
      float capitalRockNoise(vec3 p) {
        vec3 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(mix(capitalRockHash(i), capitalRockHash(i + vec3(1,0,0)), f.x),
              mix(capitalRockHash(i + vec3(0,1,0)), capitalRockHash(i + vec3(1,1,0)), f.x), f.y),
          mix(mix(capitalRockHash(i + vec3(0,0,1)), capitalRockHash(i + vec3(1,0,1)), f.x),
              mix(capitalRockHash(i + vec3(0,1,1)), capitalRockHash(i + vec3(1,1,1)), f.x), f.y), f.z);
      }`,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <color_fragment>",
      `#include <color_fragment>
      float rockBroad = capitalRockNoise(vCapitalPosition * .075);
      float rockFracture = abs(capitalRockNoise(vCapitalPosition * .22 + 17.0) * 2.0 - 1.0);
      diffuseColor.rgb *= mix(vec3(.68,.66,.62), vec3(1.16,1.14,1.10), rockBroad);
      diffuseColor.rgb *= .85 + .15 * smoothstep(.06, .22, rockFracture);`,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <normal_fragment_maps>",
      `#include <normal_fragment_maps>
      float rockHeight = 2.8 * rockBroad + 1.2 * rockFracture;
      vec3 rockDx = dFdx(-vViewPosition), rockDy = dFdy(-vViewPosition);
      vec3 rockR1 = cross(rockDy, normal), rockR2 = cross(normal, rockDx);
      float rockDet = dot(rockDx, rockR1);
      vec3 rockGradient = sign(rockDet) * (dFdx(rockHeight) * rockR1 + dFdy(rockHeight) * rockR2);
      normal = normalize(max(abs(rockDet), 1e-8) * normal - rockGradient);`,
    );
  };
  material.customProgramCacheKey = () => `${cacheKey}:rock-relief-v1`;
}

/**
 * Finished surface textures for the capital, painted procedurally so the kit city reads
 * as the white stone city of the reference rather than a blockout. Each tile covers the
 * 4 m that `capitalKitUv` projects per texture repeat, and comes with a normal map
 * derived from its own shading, so mortar, joints and grain sit back from the face.
 */
export type CapitalSurfaceKind =
  | "ashlar"
  | "plaster"
  | "flagstone"
  | "dressed"
  | "smooth"
  | "timber"
  | "slate"
  | "iron"
  | "rock"
  | "grass"
  | "earth";

const SIZE = 512;
const PX = SIZE / 4; // pixels per metre

function scatter(seed: number) {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
}
const hash = (x: number, y: number, s: number) => {
  const v = Math.sin(x * 127.1 + y * 311.7 + s * 74.7) * 43758.5453;
  return v - Math.floor(v);
};
/** Tileable value noise with period `period` cells. */
function valueNoise(x: number, y: number, period: number, seed: number) {
  const ix = Math.floor(x),
    iy = Math.floor(y),
    fx = x - ix,
    fy = y - iy;
  const w = (i: number) => ((i % period) + period) % period;
  const sx = fx * fx * (3 - 2 * fx),
    sy = fy * fy * (3 - 2 * fy);
  const a = hash(w(ix), w(iy), seed),
    b = hash(w(ix + 1), w(iy), seed),
    c = hash(w(ix), w(iy + 1), seed),
    d = hash(w(ix + 1), w(iy + 1), seed);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}
/** Tileable fractal noise over the whole texture, `base` cells across at the coarsest. */
function fbm(px: number, py: number, base: number, seed: number, octaves = 4) {
  let sum = 0,
    amp = 0.5,
    period = base;
  for (let o = 0; o < octaves; o++) {
    sum += amp * valueNoise((px / SIZE) * period, (py / SIZE) * period, period, seed + o * 13);
    amp *= 0.5;
    period *= 2;
  }
  return sum / (1 - 0.5 ** octaves);
}

type Painter = {
  /** Base colour (0–1 rgb) and height (0–1) at a pixel. */
  pixel(x: number, y: number): [number, number, number, number];
};

/** Running-bond blocks: returns block id, distance to the nearest joint in pixels. */
function bond(
  x: number,
  y: number,
  course: number,
  lengths: (row: number) => number[],
): { id: number; edge: number; row: number } {
  const row = Math.floor(y / course),
    inRow = y - row * course;
  const ls = lengths(row);
  let start = 0,
    id = 0;
  const total = ls.reduce((s, l) => s + l, 0);
  const offset = (row * 0.37 * total) % total;
  let u = (((x + offset) % total) + total) % total;
  for (; id < ls.length; id++) {
    if (u < ls[id]) break;
    u -= ls[id];
    start += ls[id];
  }
  const edge = Math.min(inRow, course - inRow, u, ls[Math.min(id, ls.length - 1)] - u);
  return { id: row * 97 + id, edge, row };
}
/** Block lengths for each course, summing to the texture width so the bond tiles. */
function courses(rows: number, min: number, max: number, seed: number) {
  const rand = scatter(seed);
  return Array.from({ length: rows }, () => {
    const ls: number[] = [];
    let left = SIZE;
    while (left > 0) {
      let l = Math.round((min + rand() * (max - min)) * PX);
      if (left - l < min * PX * 0.7) l = left;
      ls.push(l);
      left -= l;
    }
    return ls;
  });
}

const mix = (a: number[], b: number[], t: number) => a.map((v, i) => v + (b[i] - v) * t);
const hex = (s: string) => [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16) / 255);

function painter(kind: CapitalSurfaceKind): Painter {
  switch (kind) {
    case "ashlar": {
      // Pale limestone in half-metre courses, each block slightly differently weathered.
      const rows = courses(8, 0.7, 1.5, 11),
        light = hex("#e9e4da"),
        warm = hex("#d8cfbf"),
        mortar = hex("#bdb5a8");
      return {
        pixel(x, y) {
          const b = bond(x, y, PX / 2, (r) => rows[r % 8]);
          const tone = hash(b.id, 3, 1),
            grain = fbm(x, y, 16, 5, 4),
            stain = fbm(x, y, 4, 9, 3);
          if (b.edge < 2.2)
            return [...(mix(mortar, warm, grain * 0.3) as [number, number, number]), 0.1];
          const bevel = Math.min(1, b.edge / 5);
          const c = mix(light, warm, tone * 0.6 + stain * 0.35).map(
            (v) => v * (0.9 + grain * 0.14) * (0.92 + bevel * 0.08),
          );
          return [c[0], c[1], c[2], 0.55 + bevel * 0.35 + grain * 0.1];
        },
      };
    }
    case "plaster": {
      const base = hex("#f1ece2"),
        dirt = hex("#cfc5b4");
      return {
        pixel(x, y) {
          const n = fbm(x, y, 6, 21, 5),
            fine = fbm(x, y, 64, 23, 2),
            // Rain streaks run down the face.
            streak = fbm(x * 4, y * 0.25, 8, 27, 3);
          const c = mix(
            base,
            dirt,
            Math.max(0, n - 0.45) * 1.2 + Math.max(0, streak - 0.6) * 0.8,
          ).map((v) => v * (0.95 + fine * 0.07));
          return [c[0], c[1], c[2], 0.5 + fine * 0.3 + n * 0.2];
        },
      };
    }
    case "flagstone": {
      const rows = courses(5, 0.6, 1.3, 31),
        stone = hex("#c4bcae"),
        dark = hex("#9f978a"),
        gap = hex("#5f5a52");
      return {
        pixel(x, y) {
          const b = bond(x, y, SIZE / 5, (r) => rows[r % 5]);
          const tone = hash(b.id, 7, 2),
            grain = fbm(x, y, 24, 33, 4),
            wear = fbm(x, y, 5, 37, 3);
          if (b.edge < 3)
            return [...(mix(gap, dark, grain * 0.4) as [number, number, number]), 0.05];
          const bevel = Math.min(1, b.edge / 7);
          const c = mix(stone, dark, tone * 0.55 + wear * 0.25).map(
            (v) => v * (0.88 + grain * 0.18) * (0.9 + bevel * 0.1),
          );
          return [c[0], c[1], c[2], 0.5 + bevel * 0.3 + grain * 0.2];
        },
      };
    }
    case "dressed": {
      // Warm dressed sandstone for frames, stairs and kit trim: metre blocks, fine joints.
      const rows = courses(4, 0.9, 1.6, 41),
        sand = hex("#d9c8a8"),
        deep = hex("#bda780");
      return {
        pixel(x, y) {
          const b = bond(x, y, PX, (r) => rows[r % 4]);
          const grain = fbm(x, y, 32, 43, 4),
            tone = hash(b.id, 5, 4);
          if (b.edge < 1.5)
            return [
              ...((mix(deep, sand, 0.2) as [number, number, number]).map((v) => v * 0.8) as [
                number,
                number,
                number,
              ]),
              0.2,
            ];
          const c = mix(sand, deep, tone * 0.4 + grain * 0.3);
          return [c[0], c[1], c[2], 0.6 + grain * 0.3];
        },
      };
    }
    case "smooth": {
      const base = hex("#e4ded2"),
        shade = hex("#c9c0b0");
      return {
        pixel(x, y) {
          const n = fbm(x, y, 8, 51, 5);
          const c = mix(base, shade, n * 0.6);
          return [c[0], c[1], c[2], 0.5 + n * 0.3];
        },
      };
    }
    case "timber": {
      // Planks a quarter metre wide, with grain running along them.
      const wood = hex("#8a5f3c"),
        dark = hex("#5a3a22");
      return {
        pixel(x, y) {
          const plank = Math.floor(y / (PX / 4)),
            edge = Math.min(y % (PX / 4), PX / 4 - (y % (PX / 4)));
          const grain = fbm(x * 0.15, y * 3 + plank * 40, 16, 61 + plank, 4),
            tone = hash(plank, 1, 6);
          if (edge < 1.5) return [...(dark.map((v) => v * 0.7) as [number, number, number]), 0.1];
          const c = mix(wood, dark, grain * 0.6 + tone * 0.3);
          return [c[0], c[1], c[2], 0.5 + grain * 0.4];
        },
      };
    }
    case "slate": {
      // Overlapping slates in 0.33 m courses; each course's lower edge casts a lip.
      const rows = courses(12, 0.3, 0.5, 71),
        slate = hex("#73746f"),
        blue = hex("#50524f");
      return {
        pixel(x, y) {
          const course = SIZE / 12,
            b = bond(x, y, course, (r) => rows[r % 12]);
          const inRow = y - b.row * course,
            grain = fbm(x, y, 32, 73, 3),
            tone = hash(b.id, 2, 8);
          const lip = inRow / course;
          const c = mix(slate, blue, tone * 0.7 + grain * 0.2).map(
            (v) => v * (0.75 + lip * 0.3) * (b.edge < 1.5 ? 0.7 : 1),
          );
          return [c[0], c[1], c[2], lip * 0.8 + grain * 0.2];
        },
      };
    }
    case "iron": {
      const base = hex("#3b3f45"),
        rust = hex("#6b4a35");
      return {
        pixel(x, y) {
          const n = fbm(x, y, 12, 81, 4);
          const c = mix(base, rust, Math.max(0, n - 0.55) * 1.6);
          return [c[0], c[1], c[2], 0.5 + n * 0.2];
        },
      };
    }
    case "rock": {
      const light = hex("#b4b1aa"),
        dark = hex("#6d6b67"),
        lichen = hex("#858a78");
      return {
        pixel(x, y) {
          const n = fbm(x, y, 4, 91, 6),
            ridge = 1 - Math.abs(fbm(x, y, 8, 95, 4) * 2 - 1),
            crack = ridge > 0.96 ? 1 : 0,
            moss = Math.max(0, fbm(x, y, 3, 99, 3) - 0.66) * 1.5;
          const c = mix(mix(dark, light, n), lichen, moss).map((v) => v * (1 - crack * 0.3));
          return [c[0], c[1], c[2], n * 0.8 + (1 - crack) * 0.2];
        },
      };
    }
    case "grass": {
      const light = hex("#8b9d3e"),
        dark = hex("#557526");
      return {
        pixel(x, y) {
          const patch = fbm(x, y, 6, 111, 3),
            blades = fbm(x * 2, y * 0.4, 80, 113, 2),
            c = mix(light, dark, patch * 0.65 + blades * 0.25);
          return [c[0], c[1], c[2], 0.45 + blades * 0.12];
        },
      };
    }
    case "earth": {
      const dust = hex("#7d7466"),
        grass = hex("#5d6450");
      return {
        pixel(x, y) {
          const n = fbm(x, y, 4, 101, 5),
            g = fbm(x, y, 3, 103, 3);
          const c = mix(dust, grass, Math.max(0, g - 0.4) * 1.5).map((v) => v * (0.85 + n * 0.25));
          return [c[0], c[1], c[2], n];
        },
      };
    }
  }
}

/** A colour map and a normal map for one surface kind. */
export function capitalSurfaceTextures(kind: CapitalSurfaceKind, bump = 2.5) {
  const p = painter(kind);
  const color = new Uint8ClampedArray(SIZE * SIZE * 4),
    height = new Float32Array(SIZE * SIZE);
  for (let y = 0; y < SIZE; y++)
    for (let x = 0; x < SIZE; x++) {
      const [r, g, b, h] = p.pixel(x, y),
        i = y * SIZE + x;
      color[i * 4] = r * 255;
      color[i * 4 + 1] = g * 255;
      color[i * 4 + 2] = b * 255;
      color[i * 4 + 3] = 255;
      height[i] = h;
    }
  const normal = new Uint8ClampedArray(SIZE * SIZE * 4);
  const at = (x: number, y: number) => height[((y + SIZE) % SIZE) * SIZE + ((x + SIZE) % SIZE)];
  for (let y = 0; y < SIZE; y++)
    for (let x = 0; x < SIZE; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * bump,
        dy = (at(x, y + 1) - at(x, y - 1)) * bump,
        l = Math.hypot(dx, dy, 1),
        i = (y * SIZE + x) * 4;
      normal[i] = (-dx / l) * 127.5 + 127.5;
      normal[i + 1] = (dy / l) * 127.5 + 127.5;
      normal[i + 2] = (1 / l) * 127.5 + 127.5;
      normal[i + 3] = 255;
    }
  const texture = (data: Uint8ClampedArray, srgb: boolean) => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = SIZE;
    const ctx = canvas.getContext("2d")!,
      image = ctx.createImageData(SIZE, SIZE);
    image.data.set(data);
    ctx.putImageData(image, 0, 0);
    const t = new THREE.CanvasTexture(canvas);
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
    return t;
  };
  return { map: texture(color, true), normalMap: texture(normal, false) };
}

/** Texels per 4 m tile in PS2 style (32 per metre, like a 128² PS2 texture page). */
export const PS2_TILE = 128;

/**
 * Pure PS2 conversion of one surface: box-downsample to `tile` texels, bake the normal
 * map's relief into the colour under a fixed key light (no per-pixel lighting on the
 * PS2), then posterise to 5 bits per channel with a 4×4 ordered dither.
 */
export function ps2SurfacePixels(
  color: Uint8ClampedArray,
  normal: Uint8ClampedArray,
  size: number,
  tile = PS2_TILE,
) {
  const out = new Uint8ClampedArray(tile * tile * 4),
    step = size / tile,
    light = [-0.42, 0.52, 0.74],
    bayer = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  for (let y = 0; y < tile; y++)
    for (let x = 0; x < tile; x++) {
      const sum = [0, 0, 0, 0, 0, 0];
      for (let j = 0; j < step; j++)
        for (let i = 0; i < step; i++) {
          const k = ((y * step + j) * size + (x * step + i)) * 4;
          for (let c = 0; c < 3; c++) {
            sum[c] += color[k + c];
            sum[3 + c] += normal[k + c] / 127.5 - 1;
          }
        }
      const n = step * step,
        nx = sum[3] / n,
        ny = sum[4] / n,
        nz = sum[5] / n,
        len = Math.hypot(nx, ny, nz) || 1,
        lambert = (nx * light[0] + ny * light[1] + nz * light[2]) / len,
        shade = 0.62 + 0.5 * Math.max(0, lambert),
        threshold = bayer[(y % 4) * 4 + (x % 4)] / 16,
        o = (y * tile + x) * 4;
      for (let c = 0; c < 3; c++) {
        const v = Math.min(1, ((sum[c] / n) * shade) / 255);
        out[o + c] = (Math.min(31, Math.floor(v * 31 + threshold)) / 31) * 255;
      }
      out[o + 3] = 255;
    }
  return out;
}

/** A PS2-style texture from a finished surface's colour and normal maps. */
export function ps2SurfaceTexture(source: { map: THREE.Texture; normalMap: THREE.Texture }) {
  const read = (t: THREE.Texture) => {
    const canvas = t.image as HTMLCanvasElement;
    return canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height).data;
  };
  const size = (source.map.image as HTMLCanvasElement).width,
    pixels = ps2SurfacePixels(read(source.map), read(source.normalMap), size);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = PS2_TILE;
  const ctx = canvas.getContext("2d")!,
    image = ctx.createImageData(PS2_TILE, PS2_TILE);
  image.data.set(pixels);
  ctx.putImageData(image, 0, 0);
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestMipmapLinearFilter;
  t.anisotropy = 1;
  return t;
}
