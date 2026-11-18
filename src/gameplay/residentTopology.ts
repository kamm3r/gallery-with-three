import { ShapeUtils, Vector2 } from "three";

export type Point = [number, number, number];
export type UV = [number, number];
export type IndexedSurface = {
  points: Point[];
  uv: UV[];
  indices: number[];
};

/** Closed glove with shaped knuckles, four fingertips, and a thumb in the same outline. */
export function gloveMesh(width: number, handedness: number): IndexedSurface {
  const outline: UV[] = [
    [-0.35, 0.034],
    [0.34, 0.034],
    [0.35, 0.012],
    [0.47, -0.004],
    [0.53, -0.023],
    [0.46, -0.034],
    [0.33, -0.032],
    [0.38, -0.057],
    [0.34, -0.074],
    [0.21, -0.078],
    [0.18, -0.066],
    [0.14, -0.083],
    [0.02, -0.086],
    [-0.035, -0.073],
    [-0.085, -0.081],
    [-0.2, -0.078],
    [-0.21, -0.064],
    [-0.28, -0.072],
    [-0.37, -0.063],
    [-0.41, -0.047],
    [-0.44, -0.019],
    [-0.38, 0.008],
  ];
  const contour = outline.map(([x, y]) => new Vector2(x * width * handedness, y));
  const cap = ShapeUtils.triangulateShape(contour, []);
  const n = contour.length;
  const points: Point[] = [];
  const uv: UV[] = [];
  const indices: number[] = [];
  for (let face = 0; face < 2; face++) {
    for (const [x, y] of outline) {
      const palm = Math.max(0, 1 - Math.abs(y + 0.025) / 0.057);
      const depth = (0.17 + palm * 0.145) * width;
      const curl = Math.max(0, -y - 0.05) * 0.38;
      points.push([x * width * handedness, y, (face === 0 ? depth : -depth) + curl]);
      uv.push([x + 0.46, (y + 0.086) / 0.12]);
    }
  }
  for (const [a, b, c] of cap) {
    indices.push(a, b, c, n + c, n + b, n + a);
  }
  for (let i = 0; i < n; i++) {
    const next = (i + 1) % n;
    if (handedness < 0) indices.push(i, n + i, next, next, n + i, n + next);
    else indices.push(i, next, n + i, next, n + next, n + i);
  }
  return { points, uv, indices };
}

/** Contiguous facial planes and cranium. Only the face uses the center of the painted island. */
export function gravediggerHead(): IndexedSurface {
  const proportions: [height: number, width: number, rear: number, depths: number[]][] = [
    [-0.049, 0.052, -0.038, [0.018, 0.039, 0.054, 0.061, 0.065, 0.062, 0.056, 0.04, 0.019]],
    [-0.012, 0.058, -0.049, [0.04, 0.06, 0.081, 0.096, 0.103, 0.096, 0.081, 0.061, 0.039]],
    [0.023, 0.074, -0.061, [0.049, 0.071, 0.093, 0.107, 0.111, 0.106, 0.094, 0.071, 0.049]],
    [0.049, 0.082, -0.071, [0.051, 0.074, 0.095, 0.107, 0.118, 0.109, 0.095, 0.073, 0.051]],
    [0.071, 0.091, -0.082, [0.052, 0.079, 0.097, 0.115, 0.127, 0.114, 0.098, 0.079, 0.05]],
    [0.095, 0.098, -0.098, [0.051, 0.089, 0.111, 0.117, 0.151, 0.114, 0.111, 0.091, 0.052]],
    [0.119, 0.096, -0.105, [0.053, 0.093, 0.109, 0.116, 0.143, 0.117, 0.105, 0.085, 0.051]],
    [0.142, 0.093, -0.109, [0.052, 0.084, 0.092, 0.106, 0.131, 0.103, 0.091, 0.082, 0.049]],
    [0.162, 0.092, -0.102, [0.046, 0.088, 0.111, 0.121, 0.119, 0.118, 0.111, 0.086, 0.045]],
    [0.191, 0.085, -0.094, [0.036, 0.071, 0.093, 0.104, 0.108, 0.106, 0.094, 0.071, 0.036]],
    [0.215, 0.071, -0.079, [0.024, 0.052, 0.077, 0.09, 0.091, 0.088, 0.077, 0.053, 0.023]],
    [0.234, 0.048, -0.056, [0.009, 0.031, 0.044, 0.054, 0.055, 0.054, 0.044, 0.031, 0.01]],
  ];
  const frontX = [-1, -0.77, -0.56, -0.24, 0, 0.24, 0.56, 0.77, 1];
  const points: Point[] = [];
  const uv: UV[] = [];
  const indices: number[] = [];
  const rearSegments = 8;
  const circumference = frontX.length + rearSegments - 1;
  for (const [row, [y, width, rear, depths]] of proportions.entries()) {
    const v = Math.max(0.015, Math.min(0.98, (y - 0.004) / 0.19));
    frontX.forEach((anatomy, col) => {
      points.push([anatomy * width + (col < 4 ? -0.002 : 0), y, depths[col]]);
      uv.push([0.035 + (col * 0.93) / (frontX.length - 1), v]);
    });
    const averageEdge = (depths[0] + depths[depths.length - 1]) * 0.5;
    for (let i = 1; i < rearSegments; i++) {
      const a = (i * Math.PI) / rearSegments;
      points.push([Math.cos(a) * width, y, rear + (1 - Math.sin(a)) * (averageEdge - rear)]);
      uv.push([0.024 + (i % 2) * 0.012, v]);
    }
    if (!row) continue;
    for (let col = 0; col < circumference; col++) {
      const a = (row - 1) * circumference + col;
      const b = (row - 1) * circumference + ((col + 1) % circumference);
      indices.push(a, b, a + circumference, b, b + circumference, a + circumference);
    }
  }
  for (const row of [0, proportions.length - 1]) {
    const flat = row * circumference;
    const [, y, rear, depths] = proportions[row];
    const center = points.push([0, y, (rear + depths[4]) * 0.48]) - 1;
    uv.push([0.036, row ? 0.98 : 0.02]);
    for (let col = 0; col < circumference; col++) {
      const a = flat + col,
        b = flat + ((col + 1) % circumference);
      if (row) indices.push(center, a, b);
      else indices.push(center, b, a);
    }
  }
  return { points, uv, indices };
}
