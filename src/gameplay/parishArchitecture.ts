/** The replacement concept plan's solid footprints. No coordinates from the prior plan. */
export type ArchitecturePoint = [number, number, number];
export type ParishArchWall = {
  position: ArchitecturePoint;
  width: number;
  height: number;
  opening: number;
  rise: number;
  depth: number;
  yaw: number;
  crypt?: boolean;
};
export const parishBuildings = [
  { position: [-18, 0, 140] as ArchitecturePoint, size: [8, 7, 9] as ArchitecturePoint },
  { position: [18, 0, 144] as ArchitecturePoint, size: [9, 9, 10] as ArchitecturePoint },
  { position: [-18, 0, 124] as ArchitecturePoint, size: [7, 6, 5] as ArchitecturePoint },
];
export const parishBoundaryColumns = [
  ...[-1, 1].flatMap((side) =>
    [64, 80, 90].map((z) => ({
      position: [side * 23, 6, z] as ArchitecturePoint,
      height: 3,
      radius: 0.4,
      vase: true,
    })),
  ),
  ...[-14, 14].flatMap((x) =>
    [122, 150].map((z) => ({
      position: [x, 0, z] as ArchitecturePoint,
      height: 2.6,
      radius: 0.5,
      vase: false,
    })),
  ),
];
export const parishColumnFootprints = parishBoundaryColumns.map((c) => ({
  position: c.position,
  size: [c.radius * 2.6, c.height + (c.vase ? 0.75 : 0.125), c.radius * 2.6] as ArchitecturePoint,
}));
export const parishTowerPiers = [-1, 1].flatMap((s) =>
  [-1, 1].map((t) => ({
    position: [48 + s * 5, 14, 48 + t * 5] as ArchitecturePoint,
    size: [1.7, 17, 1.7] as ArchitecturePoint,
  })),
);
export const parishCathedralMasonry = [-1, 1].flatMap((s) => [
  { position: [s * 21, 12, 24] as ArchitecturePoint, size: [6, 32, 7] as ArchitecturePoint },
  ...[10, 19].map((x) => ({
    position: [s * x, 12, 28] as ArchitecturePoint,
    size: [2.1, 22, 4.6] as ArchitecturePoint,
  })),
]);
export const parishArchWalls: ParishArchWall[] = [
  { position: [0, 0, 116], width: 24, height: 6, opening: 22, rise: 5.7, depth: 1.2, yaw: 0 },
  { position: [10, 0, 142], width: 6, height: 19, opening: 3, rise: 8, depth: 1.6, yaw: 0 },
  {
    position: [-20, 0, 128],
    width: 8,
    height: 8,
    opening: 7.6,
    rise: 6.2,
    depth: 1.4,
    yaw: Math.PI / 2,
  },
  {
    position: [20, 12, 32],
    width: 8,
    height: 8,
    opening: 7.6,
    rise: 6.2,
    depth: 1.4,
    yaw: Math.PI / 2,
  },
  { position: [0, 12, 26], width: 42, height: 25, opening: 9, rise: 13, depth: 2.8, yaw: 0 },
  // Long east arcade below one continuous deck.
  ...[40, 48, 56, 64, 72, 80, 88, 96].flatMap((z) =>
    [-1, 1]
      .filter((side) => !(side === -1 && z === 64))
      .map((side) => ({
        position: [48 + side * 3.65, 6, z] as ArchitecturePoint,
        width: 8,
        height: 7.7,
        opening: 6.3,
        rise: 6.4,
        depth: 1,
        yaw: Math.PI / 2,
      })),
  ),
  // Ruined cloister encloses the west upper garden from behind.
  ...[32, 40, 48, 56].flatMap((z) =>
    [-1, 1].map((side) => ({
      position: [-64 + side * 17, 6, z] as ArchitecturePoint,
      width: 8,
      height: 10,
      opening: 6.2,
      rise: 7,
      depth: 1.4,
      yaw: Math.PI / 2,
      crypt: true,
    })),
  ),
  ...[-72, -64, -56].map((x) => ({
    position: [x, 6, 28] as ArchitecturePoint,
    width: 8,
    height: 14,
    opening: 5,
    rise: 8,
    depth: 1.5,
    yaw: 0,
    crypt: true,
  })),
  // Vaults are under the west terrace, facing the open cliff cutaway.
  {
    position: [-56, -6, 108],
    width: 40,
    height: 11.8,
    opening: 9,
    rise: 10,
    depth: 1.5,
    yaw: 0,
    crypt: true,
  },
  // Roofed foundry on the far east landing.
  ...[-1, 1].map((side) => ({
    position: [84 + side * 15, 14, 40] as ArchitecturePoint,
    width: 32,
    height: 12,
    opening: 7,
    rise: 8,
    depth: 1.5,
    yaw: Math.PI / 2,
  })),
  { position: [84, 14, 20], width: 32, height: 12, opening: 7, rise: 9, depth: 1.5, yaw: 0 },
];
const buildingFootprints = [
  ...parishBuildings,
  ...parishTowerPiers,
  ...parishCathedralMasonry,
  ...parishColumnFootprints,
];
export function parishBuildingBlocked(x: number, y: number, z: number, radius: number) {
  return buildingFootprints.some(
    ({ position: p, size: s }) =>
      y + 1.5 > p[1] &&
      y < p[1] + s[1] &&
      Math.abs(x - p[0]) < s[0] / 2 + radius &&
      Math.abs(z - p[2]) < s[2] / 2 + radius,
  );
}
export function parishArchitectureBlocked(x: number, y: number, z: number, radius: number) {
  return (
    parishBuildingBlocked(x, y, z, radius) ||
    parishArchWalls.some((w) => {
      if (y + 1.5 <= w.position[1] || y >= w.position[1] + w.height) return false;
      const dx = x - w.position[0],
        dz = z - w.position[2],
        across = Math.cos(w.yaw) * dx - Math.sin(w.yaw) * dz,
        depth = Math.sin(w.yaw) * dx + Math.cos(w.yaw) * dz;
      if (Math.abs(depth) >= w.depth / 2 + radius || Math.abs(across) >= w.width / 2 + radius)
        return false;
      return !(
        Math.abs(across) < w.opening / 2 - radius && y + 1.8 < w.position[1] + w.rise * 0.64
      );
    })
  );
}
