/**
 * Overgrown ruins around the clearing: a gateway arch straddling the path to
 * the gallery painting, a broken arcade on the east rim and scattered column
 * stumps. Pure layout data so scatter filters and tests can share it.
 */

export interface RuinColumn {
  x: number;
  z: number;
  /** Standing height; stumps are short, arch supports carry a spring. */
  height: number;
  radius: number;
  /** Arcade supports share one level top so their arches line up. */
  arcade?: boolean;
}

export interface RuinArch {
  /** Midpoint between the two supports, on the ground. */
  x: number;
  z: number;
  /** Rotation about Y; the arch's local X axis spans the two supports. */
  yaw: number;
  /** Half the clear span between support centres. */
  halfSpan: number;
  /** Height of the supports, where the semicircle springs from. */
  spring: number;
  /** Voussoirs to leave out from the far end, for a broken arch. */
  missing: number;
}

export interface FallenDrum {
  x: number;
  z: number;
  yaw: number;
  length: number;
  radius: number;
}

// A Y rotation of `yaw` maps local +X to (cos yaw, -sin yaw) in XZ.
// Path leg (-15,-3) -> (-24,-6): the gateway spans across it, along (3,-9).
const GATE_YAW = Math.atan2(9, 3);
// The east arcade runs tangentially to the clearing, along (0.28, 0.96).
const EAST_YAW = Math.atan2(-0.96, 0.28);

function along(x: number, z: number, yaw: number, offset: number): [number, number] {
  return [x + Math.cos(yaw) * offset, z - Math.sin(yaw) * offset];
}

export const RUIN_ARCHES: RuinArch[] = [
  { x: -19.5, z: -4.5, yaw: GATE_YAW, halfSpan: 2.7, spring: 4.6, missing: 0 },
  ...[-3.4, 0, 3.4].map((offset, i) => {
    const [x, z] = along(17, -5, EAST_YAW, offset);
    return { x, z, yaw: EAST_YAW, halfSpan: 1.7, spring: 4, missing: i === 2 ? 3 : 0 };
  }),
];

export const RUIN_COLUMNS: RuinColumn[] = [
  // Arcade supports; the last one snapped into a stump.
  ...[-5.1, -1.7, 1.7, 5.1].map((offset, i) => {
    const [x, z] = along(17, -5, EAST_YAW, offset);
    return { x, z, height: i === 3 ? 1.5 : 4, radius: 0.5, arcade: i < 3 };
  }),
  { x: -4, z: 12.5, height: 1.2, radius: 0.55 },
  { x: -13, z: -12, height: 2.3, radius: 0.5 },
  { x: 4, z: -12.2, height: 0.75, radius: 0.6 },
];

export const FALLEN_DRUMS: FallenDrum[] = [
  { x: 20.4, z: 1.6, yaw: 0.5, length: 2.4, radius: 0.48 },
  { x: 12.4, z: 10.6, yaw: 2.1, length: 3, radius: 0.5 },
];

/** Gateway supports sit this far either side of the arch midpoint. */
export function archSupports(arch: RuinArch): [[number, number], [number, number]] {
  return [
    along(arch.x, arch.z, arch.yaw, -arch.halfSpan),
    along(arch.x, arch.z, arch.yaw, arch.halfSpan),
  ];
}

const clearance: Array<[number, number, number]> = [
  ...RUIN_COLUMNS.map((c): [number, number, number] => [c.x, c.z, 2.4]),
  ...RUIN_ARCHES.slice(0, 1).flatMap((arch) =>
    archSupports(arch).map(([x, z]): [number, number, number] => [x, z, 2.4]),
  ),
  ...FALLEN_DRUMS.map((d): [number, number, number] => [d.x, d.z, d.length / 2 + 1.2]),
];

/** Keeps trees, bushes and logs from growing through the stonework. */
export function nearRuins(x: number, z: number) {
  return clearance.some(([cx, cz, r]) => Math.hypot(x - cx, z - cz) < r);
}
