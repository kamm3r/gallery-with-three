/** Local supplies tell each space's story; solid footprints also serve physics and AI. */
export type DressingPoint = [number, number, number];
export const parishCanopy = {
  position: [-9, 0, 132] as DressingPoint,
  width: 7,
  depth: 3.2,
  rearHeight: 3.8,
  frontHeight: 3.35,
};
export const parishCanopyPosts = [-1, 1].flatMap((side) =>
  [-1, 1].map((end) => ({
    position: [
      parishCanopy.position[0] + (side * parishCanopy.width) / 2,
      parishCanopy.position[1],
      parishCanopy.position[2] + (end * parishCanopy.depth) / 2,
    ] as DressingPoint,
    size: [
      0.18,
      end === -1 ? parishCanopy.rearHeight : parishCanopy.frontHeight,
      0.18,
    ] as DressingPoint,
  })),
);
export const parishSupplies: Array<{
  kind: "crates" | "barrels" | "bench" | "cart" | "urns" | "workbench";
  position: DressingPoint;
  size: DressingPoint;
}> = [
  { kind: "crates", position: [-12.5, 0, 143], size: [2.5, 1.8, 2] },
  { kind: "barrels", position: [13, 0, 137], size: [2.4, 1.5, 1.3] },
  { kind: "crates", position: [-12, 0, 124], size: [2.5, 1.7, 2] },
  { kind: "bench", position: [-6, 0, 140], size: [3.2, 1.1, 1] },
  { kind: "cart", position: [-20, 6, 100], size: [3.5, 1.8, 2] },
  { kind: "urns", position: [-48, 6, 114], size: [2, 1.6, 1.5] },
  { kind: "workbench", position: [-77, 6, 46], size: [2.8, 1.8, 1.8] },
  { kind: "workbench", position: [80, 14, 54], size: [3.4, 1.5, 2] },
  { kind: "crates", position: [94, 14, 40], size: [2.5, 2.2, 2] },
];
export const parishTreePlantings: Array<{
  position: DressingPoint;
  height: number;
  autumn: boolean;
}> = [
  ...[
    [-76, 70],
    [-76, 90],
    [-48, 70],
    [-48, 96],
    [-32, 86],
    [22, 88],
    [-24, 64],
    [-56, 106],
    [-64, 104],
    [-42, 84],
    [-69, 54],
    [-28, 110],
  ].map(([x, z], i) => ({
    position: [x, 6, z] as DressingPoint,
    height: 8 + (i % 3) * 1.4,
    autumn: true,
  })),
  ...[
    [-76, 36],
    [-52, 52],
    [22, 62],
    [-22, 58],
  ].map(([x, z]) => ({ position: [x, 6, z] as DressingPoint, height: 12, autumn: false })),
  { position: [-24, 0, 134], height: 10, autumn: false },
  { position: [25, 0, 132], height: 11, autumn: false },
];
export const parishTorches: Array<{
  position: DressingPoint;
  blue: boolean;
  scale: number;
  smoke?: boolean;
}> = [
  { position: [0, 0, 136], blue: false, scale: 1.25, smoke: true },
  { position: [-8, 12, 28], blue: false, scale: 0.75 },
  ...[
    [-56, -6, 120],
    [-56, -6, 140],
    [-65.5, -6, 132],
    [-46.5, -6, 132],
  ].map((p) => ({ position: p as DressingPoint, blue: true, scale: 0.7 })),
  ...[
    [-9.5, 0, 118],
    [9.5, 0, 118],
    [-20.5, 6, 76.5],
    [20.5, 6, 76.5],
    [-6, 12, 30],
    [6, 12, 30],
  ].map((p) => ({ position: p as DressingPoint, blue: false, scale: 0.6 })),
  { position: [76, 14, 31.7], blue: false, scale: 1.4, smoke: true },
  { position: [92, 14, 51.7], blue: false, scale: 1.4, smoke: true },
];
