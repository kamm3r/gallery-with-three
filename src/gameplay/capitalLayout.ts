import { buildCapitalNavigation } from "./capitalNavigation.ts";
import { buildCapitalFoundations } from "./capitalMassing.ts";
import {
  authorCapitalDistricts,
  authorBuildingWalls,
  capitalBuildings as authoredCapitalBuildings,
  type CapitalBuilding,
  CAPITAL_TOWN_Z,
  CAPITAL_TOWN_X,
  CAPITAL_GARDEN_Z,
  CAPITAL_GARDEN_X,
} from "./capitalDistricts.ts";
import type { EnemyKind, ParishArea, ParishPoint, ParishProgress } from "./ashenParish.ts";

export type CapitalSurface = {
  id: string;
  area: ParishArea;
  vertices: ParishPoint[];
  layer: "upper" | "lower";
};
export type CapitalSolid = { position: ParishPoint; size: ParishPoint; yaw: number };
// Own mutable layout records so hot reload cannot reflect district source data twice.
export const capitalBuildings: CapitalBuilding[] = authoredCapitalBuildings.map((b) => ({
  ...b,
  center: [...b.center],
  size: [...b.size],
  doors: b.doors.map((d) => ({ ...d })),
}));
export const capitalSurfaces: CapitalSurface[] = [];
export const capitalSolids: CapitalSolid[] = [];
export const capitalPews: CapitalSolid[] = [];
export const CAPITAL_EXIT: ParishPoint = [0, 0, 85];
export const capitalRetainingWedges = [
  {
    minX: 26,
    maxX: 32,
    minZ: -20,
    maxZ: 9,
    high: 44,
    low: 24,
    bottom: -12,
    arcade: [7.5, 27.5] as const,
  },
  {
    minX: 26,
    maxX: 32,
    minZ: 9,
    maxZ: 29,
    high: 24,
    low: 8,
    bottom: -12,
    arcade: [7.5, 24.5] as const,
  },
];
export const capitalAreas = [
  {
    id: "tunnel",
    name: "Mountain Tunnel",
    center: [-38 + CAPITAL_TOWN_X, 19, -52 + CAPITAL_TOWN_Z],
    description: "The old passage climbs from the buried town.",
  },
  {
    id: "toproad",
    name: "Crown Roads",
    center: [-24 + CAPITAL_TOWN_X, 24, -44 + CAPITAL_TOWN_Z],
    description: "Two high roads overlook the town and beacon.",
  },
  {
    id: "refuge",
    name: "City Wall",
    center: [0, 0, 74],
    description: "The first bridge rises out of the sea of fog.",
  },
  {
    id: "foundry",
    name: "Middle Town",
    center: [-44 + CAPITAL_TOWN_X, 8, -18 + CAPITAL_TOWN_Z],
    description: "Streets and stairs beneath the sacred capital.",
  },
  {
    id: "yard",
    name: "Ultimate Plaza",
    center: [0, 24, -30],
    description: "All roads return beneath the cathedral.",
  },
  {
    id: "kiln",
    name: "Oblivion Chapel",
    center: [0, 24, -4],
    description: "A sanctuary at the meeting of four roads.",
  },
  {
    id: "aqueduct",
    name: "Cathedral Exterior",
    center: [-30, 28, -56],
    description: "A narrow ascent around the great nave.",
  },
  {
    id: "cloister",
    name: "Asylum Cathedral",
    center: [0, 24, -65],
    description: "The cathedral keeper guards the light above the fog.",
  },
  {
    id: "graveyard",
    name: "Royal Backyard",
    center: [-52 + CAPITAL_GARDEN_X, 24, -58 + CAPITAL_GARDEN_Z],
    description: "A quiet garden on the western rock.",
  },
  {
    id: "belfry",
    name: "Beacon Pathway",
    center: [42, 12, -24],
    description: "Follow the beacon down into the revealed city.",
  },
  {
    id: "crypt",
    name: "Grand Street",
    center: [60, -6, 12],
    description: "The forgotten streets below the upper terraces.",
  },
  {
    id: "arena",
    name: "Glory Colosseum",
    center: [0, -12, 0],
    description: "The final keeper waits beneath the capital.",
  },
] satisfies Array<{ id: ParishArea; name: string; center: ParishPoint; description: string }>;

function surface(
  id: string,
  area: ParishArea,
  vertices: ParishPoint[],
  layer: "upper" | "lower" = "upper",
) {
  capitalSurfaces.push({ id, area, vertices, layer });
}
export function capitalRect(
  id: string,
  area: ParishArea,
  x: number,
  y: number,
  z: number,
  w: number,
  d: number,
  layer: "upper" | "lower" = "upper",
) {
  surface(
    id,
    area,
    [
      [x - w / 2, y, z - d / 2],
      [x - w / 2, y, z + d / 2],
      [x + w / 2, y, z + d / 2],
      [x + w / 2, y, z - d / 2],
    ],
    layer,
  );
}
function lane(
  id: string,
  area: ParishArea,
  points: ParishPoint[],
  width: number,
  layer: "upper" | "lower" = "upper",
  levelPads = true,
) {
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1],
      b = points[i],
      length = Math.hypot(b[0] - a[0], b[2] - a[2]);
    const dx = ((-(b[2] - a[2]) / length) * width) / 2,
      dz = (((b[0] - a[0]) / length) * width) / 2;
    const pad = !levelPads || a[1] === b[1] ? 0 : Math.min(width / 2 + 1, length * 0.3);
    const inset = (p: ParishPoint, toward: ParishPoint): ParishPoint => [
      p[0] + ((toward[0] - p[0]) / length) * pad,
      p[1],
      p[2] + ((toward[2] - p[2]) / length) * pad,
    ];
    const segments = pad ? [a, inset(a, b), inset(b, a), b] : [a, b];
    for (let j = 1; j < segments.length; j++) {
      const start = segments[j - 1],
        end = segments[j];
      surface(
        `${id}:${i}:${j}`,
        area,
        [
          [start[0] + dx, start[1], start[2] + dz],
          [end[0] + dx, end[1], end[2] + dz],
          [end[0] - dx, end[1], end[2] - dz],
          [start[0] - dx, start[1], start[2] - dz],
        ],
        layer,
      );
    }
    // Broad square landings close the outer corner between angled strips.
    if (i < points.length - 1)
      capitalRect(`${id}:landing:${i}`, area, b[0], b[1], b[2], width, width, layer);
  }
}
function ring(
  id: string,
  area: ParishArea,
  cx: number,
  cz: number,
  inner: number,
  outer: number,
  start: number,
  end: number,
  y0: number,
  y1 = y0,
  layer: "upper" | "lower" = "upper",
  entryAngle = 0,
  angleStep = 0.08,
) {
  const steps = Math.ceil(Math.abs(end - start) / angleStep);
  const point = (r: number, t: number): ParishPoint => [
    cx + Math.sin(t) * r,
    y0 + (y1 - y0) * Math.max(0, (t - start - entryAngle) / (end - start - entryAngle)),
    cz + Math.cos(t) * r,
  ];
  for (let i = 0; i < steps; i++) {
    const a = start + ((end - start) * i) / steps,
      b = start + ((end - start) * (i + 1)) / steps;
    surface(
      `${id}:${i}`,
      area,
      [point(inner, a), point(outer, a), point(outer, b), point(inner, b)],
      layer,
    );
  }
}
const pi = Math.PI;
ring("outer-wall-left", "refuge", 0, 0, 70, 78, -1.42, -0.32, 0);
ring("outer-wall-right", "refuge", 0, 0, 70, 78, 0.065, 1.16, 0);
capitalRect("entry", "refuge", 0, 0, 79, 12, 20);
lane(
  "first-bridge",
  "refuge",
  [
    [0, 0, 74],
    [0, 8, 44],
  ],
  6,
);
ring("lower-terrace", "foundry", 0, 12, 22, 32, -pi * 0.65, 0.12, 8, 8, "upper", 0, pi / 12);
lane(
  "town-bridge",
  "foundry",
  [
    [-18, 8, 36],
    [-35, 8, 36],
    [-44 + CAPITAL_TOWN_X, 8, -5 + CAPITAL_TOWN_Z],
  ],
  6,
);
lane(
  "second-bridge",
  "refuge",
  [
    [-34, 0, 65],
    [-18, 8, 37],
  ],
  5,
);
capitalRect("town", "foundry", -44 + CAPITAL_TOWN_X, 8, -18 + CAPITAL_TOWN_Z, 36, 36);
lane(
  "town-return",
  "foundry",
  [
    [-44 + CAPITAL_TOWN_X, 8, 36],
    [-76 + CAPITAL_TOWN_X, 8, 36],
    [-76 + CAPITAL_TOWN_X, 0, 52],
    [-59, 0, 45],
  ],
  6,
);
export const capitalShortcut = {
  position: [-48 + CAPITAL_TOWN_X, 8, 36] as ParishPoint,
  yaw: -Math.PI / 2,
  width: 6,
};
// The nave door is a reward for returning through the cathedral. The first
// approach must climb the exterior instead of walking straight to the altar.
export const capitalCathedralShortcut = {
  position: [0, 24, -42] as ParishPoint,
  yaw: 0,
  width: 10,
};

lane(
  "town-stair",
  "foundry",
  [
    [-44 + CAPITAL_TOWN_X, 8, -32 + CAPITAL_TOWN_Z],
    [-44 + CAPITAL_TOWN_X, 16, -52 + CAPITAL_TOWN_Z],
  ],
  6,
);
lane(
  "mountain-tunnel",
  "tunnel",
  [
    [-44 + CAPITAL_TOWN_X, 16, -52 + CAPITAL_TOWN_Z],
    [-24 + CAPITAL_TOWN_X, 24, -52 + CAPITAL_TOWN_Z],
  ],
  7,
);
lane(
  "top-left-road",
  "toproad",
  [
    [-24 + CAPITAL_TOWN_X, 24, 2],
    [-24 + CAPITAL_TOWN_X, 24, -16],
    [-24 + CAPITAL_TOWN_X, 24, -32],
    [-18, 24, -32],
  ],
  7,
);
capitalRect("tunnel-landing", "tunnel", -44 + CAPITAL_TOWN_X, 16, -52 + CAPITAL_TOWN_Z, 8, 8);
capitalRect("plaza", "yard", 0, 24, -32, 38, 24);
capitalRect("chapel", "kiln", 0, 24, -5, 22, 30);
ring("upper-terrace", "kiln", 0, 12, 16, 25, -pi * 0.65, pi * 0.65, 24, 24, "upper", 0, pi / 8);
lane(
  "chapel-front",
  "kiln",
  [
    [0, 24, 8],
    [0, 24, 31],
  ],
  7,
);
capitalRect("nave", "cloister", 0, 24, -65, 34, 46);
lane(
  "west-exterior",
  "aqueduct",
  [
    [-18, 24, -32],
    [-34, 24, -40],
    [-34, 36, -72],
    [-15, 36, -72],
  ],
  6,
);
capitalRect("west-gallery", "cloister", -12, 36, -65, 8, 46);
capitalRect("east-gallery", "cloister", 12, 36, -65, 8, 46);
capitalRect("transept", "cloister", 0, 36, -84, 36, 8);
lane(
  "east-exterior",
  "aqueduct",
  [
    [15, 36, -84],
    [44, 36, -84],
    [44, 24, -52],
    [18, 24, -32],
  ],
  6,
);
surface("garden", "graveyard", [
  [-66 + CAPITAL_GARDEN_X, 24, -67 + CAPITAL_GARDEN_Z],
  [-60 + CAPITAL_GARDEN_X, 24, -73 + CAPITAL_GARDEN_Z],
  [-44 + CAPITAL_GARDEN_X, 24, -73 + CAPITAL_GARDEN_Z],
  [-38 + CAPITAL_GARDEN_X, 24, -67 + CAPITAL_GARDEN_Z],
  [-38 + CAPITAL_GARDEN_X, 24, -49 + CAPITAL_GARDEN_Z],
  [-44 + CAPITAL_GARDEN_X, 24, -43 + CAPITAL_GARDEN_Z],
  [-60 + CAPITAL_GARDEN_X, 24, -43 + CAPITAL_GARDEN_Z],
  [-66 + CAPITAL_GARDEN_X, 24, -49 + CAPITAL_GARDEN_Z],
]);
lane(
  "garden-bridge",
  "graveyard",
  [
    [-30, 24, -40],
    [-50 + CAPITAL_GARDEN_X, 24, -40],
    [-50 + CAPITAL_GARDEN_X, 24, -48],
  ],
  6,
);
lane(
  "beacon-bridge",
  "belfry",
  [
    [18, 24, -32],
    [42, 24, -24],
  ],
  7,
);
ring("beacon-upper", "belfry", 42, -24, 0, 8, 0, pi * 2, 24);
lane(
  "garden-return",
  "graveyard",
  [
    [-58 + CAPITAL_GARDEN_X, 24, -70 + CAPITAL_GARDEN_Z],
    [-70, 36, -98],
    [-42, 36, -98],
    [-30, 36, -84],
    [-30, 36, -72],
  ],
  5,
);
lane(
  "beacon-ramp-entry",
  "belfry",
  [
    [42, 24, -18],
    [42, 24, -14],
  ],
  5,
);
// The entry stays level until the descending walk clears the straight landing.
ring("beacon-spiral", "belfry", 42, -24, 8, 12, 0, pi * 2.5, 24, -4, "lower", 0.4);
capitalRect("beacon-lower", "belfry", 52, -4, -24, 10, 10, "lower");
lane(
  "beacon-exit",
  "belfry",
  [
    [52, -4, -24],
    [60, -4, -24],
  ],
  5,
  "lower",
);
lane(
  "grand-street",
  "crypt",
  [
    [60, -4, -24],
    [60, -8, 30],
    [20, -8, 38],
    [0, -12, 24],
  ],
  9,
  "lower",
);
capitalRect("colosseum", "arena", 0, -12, -3, 48, 58, "lower");
// Two separate lift wells: their decks are authored as moving surfaces, never duplicated by a fixed floor.
capitalRect("beacon-lift-upper", "belfry", 38, 24, -11, 7, 8);
capitalRect("beacon-lift-lower", "belfry", 38, -4, -11, 7, 8, "lower");
lane(
  "beacon-lift-lower-link",
  "crypt",
  [
    [38, -4, -11],
    [38, -4, -30],
    [42, -4, -38],
    [60, -4, -38],
    [60, -4, -24],
  ],
  5,
  "lower",
);
capitalRect("arena-lift-upper", "kiln", 14, 24, 12, 7, 8);
capitalRect("arena-lift-lower", "arena", 14, -12, 12, 7, 8, "lower");

export const capitalLifts = [
  {
    id: "beacon" as const,
    center: [38, 0, -4] as ParishPoint,
    low: -4,
    high: 24,
    upper: [38, 24, -11] as ParishPoint,
    lower: [38, -4, -11] as ParishPoint,
  },
  {
    id: "arena" as const,
    center: [14, 0, 19] as ParishPoint,
    low: -12,
    high: 24,
    upper: [14, 24, 12] as ParishPoint,
    lower: [14, -12, 12] as ParishPoint,
  },
  {
    id: "town" as const,
    center: [-84, 0, 27] as ParishPoint,
    low: 8,
    high: 20,
    upper: [-84, 20, 34] as ParishPoint,
    lower: [-84, 8, 34] as ParishPoint,
  },
];
export type CapitalLiftId = (typeof capitalLifts)[number]["id"];

for (const [id, y, points] of [
  [
    "town-lift-lower",
    8,
    [
      [-84, 8, 34],
      [-76, 8, 34],
      [-65, 8, 34],
    ],
  ],
  [
    "town-lift-upper",
    20,
    [
      [-84, 20, 34],
      [-76, 20, 34],
      [-76, 20, 29],
      [-65, 20, 29],
    ],
  ],
] as const) {
  capitalRect(`${id}:landing`, "foundry", -84, y, 34, 7, 8);
  lane(
    id,
    "foundry",
    points.map((p) => [...p] as ParishPoint),
    4,
  );
}
lane(
  "arena-lift-upper-link",
  "kiln",
  [
    [8, 24, 10],
    [14, 24, 12],
  ],
  6,
);

authorCapitalDistricts({ rect: capitalRect, lane });
lane(
  "lower-backyard",
  "graveyard",
  [
    [-65 + CAPITAL_TOWN_X, 14, -14 + CAPITAL_TOWN_Z],
    [-65 + CAPITAL_TOWN_X, 14, -24 + CAPITAL_TOWN_Z],
    [-65 + CAPITAL_TOWN_X, 16, -52 + CAPITAL_TOWN_Z],
    [-44 + CAPITAL_TOWN_X, 16, -52 + CAPITAL_TOWN_Z],
  ],
  5,
);

// The broad sloping crown and independent eastern clock tower are landmarks
// in the reference silhouette. Their arcade preserves the town route below.
lane(
  "eastern-wall-crown",
  "toproad",
  [
    [24, 44.04, -28],
    [29, 44.04, -20],
    [29, 24.04, 9],
    [18, 24, 10],
  ],
  6,
  "upper",
  false,
);
lane(
  "eastern-clock-approach",
  "belfry",
  [
    [29, 44, -20],
    [29, 44, -28],
    [43, 44, -28],
  ],
  4,
);
capitalRect("eastern-clock-bay", "belfry", 43, 44, -28, 8, 8);

export const capitalRailSurfaces = [...capitalSurfaces];

/** Partition a convex floor around a shaft; never leave a fixed slab under a lift. */
function clipFloor(
  vertices: ParishPoint[],
  axis: 0 | 2,
  boundary: number,
  less: boolean,
): ParishPoint[] {
  const result: ParishPoint[] = [];
  for (let i = 0; i < vertices.length; i++) {
    const a = vertices[i],
      b = vertices[(i + 1) % vertices.length];
    const insideA = less ? a[axis] <= boundary : a[axis] >= boundary;
    const insideB = less ? b[axis] <= boundary : b[axis] >= boundary;
    if (insideA) result.push(a);
    if (insideA !== insideB) {
      const t = (boundary - a[axis]) / (b[axis] - a[axis]);
      result.push(a.map((v, j) => v + (b[j] - v) * t) as ParishPoint);
    }
  }
  return result;
}
/** Remove a stairwell only from the floor above it, leaving the sloping tread intact. */
function floorOpening(ids: string[], x0: number, x1: number, z0: number, z1: number) {
  const cut: CapitalSurface[] = [];
  for (const s of capitalSurfaces) {
    if (!ids.includes(s.id)) {
      cut.push(s);
      continue;
    }
    let remaining = s.vertices;
    for (const [axis, boundary, less] of [
      [0, x0, true],
      [0, x1, false],
      [2, z0, true],
      [2, z1, false],
    ] as const) {
      if (remaining.length < 3) break;
      const outside = clipFloor(remaining, axis, boundary, less);
      if (outside.length >= 3)
        cut.push({ ...s, id: `${s.id}:stairwell:${cut.length}`, vertices: outside });
      remaining = clipFloor(remaining, axis, boundary, !less);
    }
  }
  capitalSurfaces.splice(0, capitalSurfaces.length, ...cut);
}
floorOpening(
  ["town"],
  -38 + CAPITAL_TOWN_X,
  -32 + CAPITAL_TOWN_X,
  -20 + CAPITAL_TOWN_Z,
  -3.8 + CAPITAL_TOWN_Z,
);
floorOpening(
  ["town-hall-gallery", "town-gallery-links:2:1", "town-gallery-links:landing:1"],
  -43.7 + CAPITAL_TOWN_X,
  -40.3 + CAPITAL_TOWN_X,
  -25 + CAPITAL_TOWN_Z,
  -14.8 + CAPITAL_TOWN_Z,
);
floorOpening(["east-gallery"], 13.1, 15.9, -79.5, -46.5);
for (const lift of capitalLifts) {
  const cut: CapitalSurface[] = [];
  for (const s of capitalSurfaces) {
    let remaining = s.vertices;
    let part = 0;
    for (const [axis, boundary, less] of [
      [0, lift.center[0] - 3.05, true],
      [0, lift.center[0] + 3.05, false],
      [2, lift.center[2] - 3.05, true],
      [2, lift.center[2] + 3.05, false],
    ] as const) {
      if (remaining.length < 3) break;
      const outside = clipFloor(remaining, axis, boundary, less);
      if (outside.length >= 3)
        cut.push({ ...s, id: `${s.id}:shaft:${lift.id}:${part++}`, vertices: outside });
      remaining = clipFloor(remaining, axis, boundary, !less);
    }
  }
  capitalSurfaces.splice(0, capitalSurfaces.length, ...cut);
}
// The district diagram is viewed from the opposite side to the playthrough.
// Keep the town east of the chapel and the royal garden west of the cathedral.
const reflectedDistrictFamilies = [
  "lower-terrace",
  "town",
  "second-bridge",
  "mountain-tunnel",
  "tunnel-landing",
  "top-left-road",
  "lower-backyard",
  "wall-watchhouse",
  "beacon",
  "grand-street",
  "street-house",
  "street-wall",
];
for (const s of new Set([...capitalSurfaces, ...capitalRailSurfaces]))
  if (
    reflectedDistrictFamilies.some(
      (id) => s.id === id || s.id.startsWith(id + ":") || s.id.startsWith(id + "-"),
    )
  )
    s.vertices = s.vertices.map(([x, y, z]) => [-x, y, z]);
for (const b of capitalBuildings.filter(
  (b) => b.id.startsWith("town-") || b.id.startsWith("street-house") || b.id === "wall-watchhouse",
)) {
  b.center[0] *= -1;
  b.doors = b.doors.map((d) => ({
    ...d,
    side: d.side === "east" ? "west" : d.side === "west" ? "east" : d.side,
    offset: d.side === "north" || d.side === "south" ? -d.offset : d.offset,
  }));
}
capitalShortcut.position[0] *= -1;
capitalShortcut.yaw *= -1;
for (const lift of capitalLifts.filter((l) => l.id !== "arena"))
  for (const p of [lift.center, lift.upper, lift.lower]) p[0] *= -1;
export const capitalFoundations = buildCapitalFoundations(capitalLifts);

export const capitalShrines = [
  {
    id: "refuge" as const,
    name: "City Wall Ember",
    position: [33, 0, 65] as ParishPoint,
    spawn: [30, 0, 66] as ParishPoint,
  },
  {
    id: "kiln" as const,
    name: "Oblivion Chapel",
    position: [0, 24, -3] as ParishPoint,
    spawn: [0, 24, -12] as ParishPoint,
  },
];
export const capitalCaches = [
  { id: "wall", name: "Watchhouse offering", position: [-59, 0, 45] as ParishPoint, embers: 70 },
  {
    id: "street-home",
    name: "Forgotten household relic",
    position: [70, -6.465116279, 8] as ParishPoint,
    embers: 140,
  },
  {
    id: "town-key",
    name: "Mountain passage key",
    position: [-53 + CAPITAL_TOWN_X, 4, -26 + CAPITAL_TOWN_Z] as ParishPoint,
    embers: 60,
  },
  {
    id: "sky-sigil",
    name: "Sigil of the roof chapel",
    position: [0, 45.45, -5] as ParishPoint,
    embers: 220,
  },
  {
    id: "town-roof",
    name: "Upper town offering",
    position: [-29 + CAPITAL_TOWN_X, 20, -10 + CAPITAL_TOWN_Z] as ParishPoint,
    embers: 100,
  },
  {
    id: "town",
    name: "Townkeeper’s offering",
    position: [-55 + CAPITAL_TOWN_X, 8, -22 + CAPITAL_TOWN_Z] as ParishPoint,
    embers: 80,
  },
  {
    id: "garden",
    name: "Royal offering",
    position: [-59 + CAPITAL_GARDEN_X, 24, -65 + CAPITAL_GARDEN_Z] as ParishPoint,
    embers: 120,
  },
  {
    id: "gallery",
    name: "Cathedral offering",
    position: [12, 36, -80] as ParishPoint,
    embers: 150,
  },
  {
    id: "street",
    name: "Forgotten offering",
    position: [60, -7, 16.5] as ParishPoint,
    embers: 180,
  },
];
export const capitalBosses = {
  cathedral: {
    name: "Keeper of the Asylum",
    origin: [-36, 44, -65] as ParishPoint,
    entry: [-23, 44, -55] as ParishPoint,
    spawn: [-29, 44, -55] as ParishPoint,
    radius: 10,
    yaw: Math.PI / 2,
    entryWidth: 6,
  },
  colosseum: {
    name: "The Ash Warden",
    origin: [0, -12, 0] as ParishPoint,
    entry: [0, -12, 25] as ParishPoint,
    spawn: [0, -12, 18] as ParishPoint,
    radius: 16,
    yaw: 0,
    entryWidth: 9,
  },
};
for (const c of capitalCaches)
  if (c.id.startsWith("town") || c.id.startsWith("street") || c.id === "wall") c.position[0] *= -1;
for (const a of capitalAreas)
  if (["foundry", "tunnel", "toproad", "belfry", "crypt"].includes(a.id)) a.center[0] *= -1;
export const capitalTownGate = {
  position: [44 - CAPITAL_TOWN_X, 16, -51 + CAPITAL_TOWN_Z] as ParishPoint,
  width: 6,
};
export const capitalNpcs = [
  {
    id: "sage",
    name: "The Sage",
    position: [32, 24, -26] as ParishPoint,
    dialogue:
      "The town descends beneath its streets. Find the mountain passage key there, then climb the outside of the cathedral. Its keeper waits in the western oratory. Beyond him, the highest rafters hold the switch that lifts the fog.",
  },
  {
    id: "knight",
    name: "The Fearful Knight",
    position: [-6, -12, 21] as ParishPoint,
    dialogue:
      "I watched the beacon reveal this forgotten road. The last keeper waits in the colosseum. Release its lift from below and the chapel will be close again. The royal garden and roof chapel still keep their offerings.",
  },
];
export const capitalBeacon = { position: [0, 50, -77] as ParishPoint };
export const capitalStatues = [
  [36.5, 0, 63, Math.PI + 2],
  [57, 8, 31, 0],
  [51, 8, 5, 0],
  [-31, 24, -29, 0],
  [-7.5, 24, -40, 0],
  [7.5, 24, -40, 0],
  [-14.5, 36, -76, 0],
  [9.5, 44, -51, 0],
  [24, 24, -59, Math.PI / 2],
  [-55, -6, 0, -Math.PI / 2],
  [-11, -12, 18, 0],
  [11, -12, 18, 0],
] as const;
export const capitalStatueSolids: CapitalSolid[] = capitalStatues.map(([x, y, z]) => ({
  position: [x, y, z],
  size: [1.1, 3.6, 1.1],
  yaw: 0,
}));
export const capitalLanterns = (
  [
    [33, 0, 63],
    [52, 0, 53],
    [14, 0, 72],
    [2.2, 8, 44],
    [-5, 24, -41],
    [5, 24, -41],
    [-46 + CAPITAL_TOWN_X, 8, -9 + CAPITAL_TOWN_Z],
    [-40 + CAPITAL_TOWN_X, 8, -28 + CAPITAL_TOWN_Z],
    [-46 + CAPITAL_TOWN_X, 14, -24 + CAPITAL_TOWN_Z],
    [-34, 31, -59],
    [11.5, 24, -47],
    [11.5, 36, -81],
    [-43 + CAPITAL_TOWN_X, 8, -1 + CAPITAL_TOWN_Z],
    [-84, 8, 35.5],
    [-84, 20, 35.5],
    [-8, 24, -13],
    [8, 24, -13],
    [-8, 24, 4],
    [8, 24, 4],
    [-12, 44, -62],
    [40, 24, -24],
    [60, -6, 10],
    [0, -12, 24],
    [-18, -12, -23],
    [18, -12, -23],
    [-18, -12, -11],
    [18, -12, -11],
    [-18, -12, 1],
    [18, -12, 1],
    [-18, -12, 13],
    [18, -12, 13],
    [-8, 24, -57],
    [8, 24, -57],
    [-8, 24, -69],
    [8, 24, -69],
    [-8, 24, -79],
    [8, 24, -79],
    [-4, 50, -77],
  ] as ParishPoint[]
).map(([x, y, z]) => {
  if ((x < -40 && z > -10 && y >= 8 && y <= 20) || (x > 30 && y < 0) || (x === 40 && y === 24))
    x *= -1;
  return [x, capitalFloorHeight(x, z, y) ?? y, z] as ParishPoint;
});
export type CapitalBossId = keyof typeof capitalBosses;
export const capitalEnemySpawns = [
  {
    id: "town-sentinel",
    kind: "sentinel",
    position: [-45 + CAPITAL_TOWN_X, 8, -12 + CAPITAL_TOWN_Z],
    area: "foundry",
  },
  {
    id: "town-penitent",
    kind: "acolyte",
    position: [-52 + CAPITAL_TOWN_X, 8, -27 + CAPITAL_TOWN_Z],
    area: "foundry",
  },
  { id: "wall-watch", kind: "sentinel", position: [-16, 8, 36], area: "foundry" },
  { id: "gallery-penitent", kind: "acolyte", position: [-12, 36, -61], area: "cloister" },
  {
    id: "garden-hound",
    kind: "hound",
    position: [-52 + CAPITAL_GARDEN_X, 24, -59 + CAPITAL_GARDEN_Z],
    area: "graveyard",
  },
  {
    id: "garden-sentinel",
    kind: "sentinel",
    position: [-43 + CAPITAL_GARDEN_X, 24, -66 + CAPITAL_GARDEN_Z],
    area: "graveyard",
  },
  { id: "east-watch", kind: "sentinel", position: [12, 36, -78], area: "cloister" },
  { id: "street-watch", kind: "sentinel", position: [60, -6, 3], area: "crypt" },
  { id: "street-hound", kind: "hound", position: [37, -8, 33.2], area: "crypt" },
] satisfies Array<{ id: string; kind: EnemyKind; position: ParishPoint; area: ParishArea }>;

/** Barycentric height on a real floor triangle, including ramps and stacked galleries. */
for (const e of capitalEnemySpawns)
  if (e.area === "foundry" || e.area === "crypt") e.position[0] *= -1;

export function capitalTriangleHeight(
  a: ParishPoint,
  b: ParishPoint,
  c: ParishPoint,
  x: number,
  z: number,
) {
  const denominator = (b[2] - c[2]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[2] - c[2]);
  if (Math.abs(denominator) < 1e-8) return null;
  const u = ((b[2] - c[2]) * (x - c[0]) + (c[0] - b[0]) * (z - c[2])) / denominator;
  const v = ((c[2] - a[2]) * (x - c[0]) + (a[0] - c[0]) * (z - c[2])) / denominator;
  if (u < -0.001 || v < -0.001 || u + v > 1.001) return null;
  return u * a[1] + v * b[1] + (1 - u - v) * c[1];
}
export function capitalSurfaceHeight(s: CapitalSurface, x: number, z: number) {
  for (let i = 1; i < s.vertices.length - 1; i++) {
    const height = capitalTriangleHeight(s.vertices[0], s.vertices[i], s.vertices[i + 1], x, z);
    if (height !== null) return height;
  }
  return null;
}
export function capitalSurfaceAt(x: number, z: number, nearY: number) {
  let best: CapitalSurface | undefined,
    distance = Infinity;
  for (const s of capitalSurfaces) {
    const y = capitalSurfaceHeight(s, x, z);
    if (y !== null && Math.abs(y - nearY) < distance) {
      best = s;
      distance = Math.abs(y - nearY);
    }
  }
  return best;
}
export function capitalFloorHeight(x: number, z: number, nearY = 0) {
  const s = capitalSurfaceAt(x, z, nearY);
  return s ? capitalSurfaceHeight(s, x, z) : null;
}
export function capitalAreaAt(x: number, z: number, nearY = 0): ParishArea {
  return capitalSurfaceAt(x, z, nearY)?.area ?? "refuge";
}
export function capitalBlocked(x: number, y: number, z: number, radius = 0) {
  for (const f of capitalFoundations) {
    const top = capitalSurfaceHeight(f.surface, x, z);
    if (top !== null && y + 1.8 > f.bottom && y < top) return true;
  }
  for (const w of capitalRetainingWedges) {
    if (x > w.minX - radius && x < w.maxX + radius && z > w.minZ - radius && z < w.maxZ + radius) {
      const height =
        w.high + (w.low - w.high) * Math.max(0, Math.min(1, (z - w.minZ) / (w.maxZ - w.minZ)));
      if ("arcade" in w && w.arcade && y >= w.arcade[0] && y + 1.8 <= w.arcade[1]) continue;
      if (y + 1.8 > w.bottom && y < height) return true;
    }
  }
  return capitalSolids.some((s) => {
    const dx = x - s.position[0],
      dz = z - s.position[2];
    const lx = dx * Math.cos(s.yaw) - dz * Math.sin(s.yaw),
      lz = dx * Math.sin(s.yaw) + dz * Math.cos(s.yaw);
    return (
      y + 1.8 > s.position[1] &&
      y < s.position[1] + s.size[1] &&
      Math.abs(lx) < s.size[0] / 2 + radius &&
      Math.abs(lz) < s.size[2] / 2 + radius
    );
  });
}
export function capitalLineClear(
  ax: number,
  az: number,
  bx: number,
  bz: number,
  progress: ParishProgress,
  nearY: number,
) {
  if (!progress.court && Math.abs(nearY - 24) < 2) {
    const [x, , z] = capitalCathedralShortcut.position;
    if ((az - z) * (bz - z) <= 0 && az !== bz) {
      const t = (z - az) / (bz - az);
      if (Math.abs(ax + (bx - ax) * t - x) < capitalCathedralShortcut.width / 2 + 0.4) return false;
    }
  }
  if (!progress.refuge && Math.abs(nearY - capitalShortcut.position[1]) < 2) {
    const [x, , z] = capitalShortcut.position;
    const nx = Math.sin(capitalShortcut.yaw),
      nz = Math.cos(capitalShortcut.yaw);
    const a = (ax - x) * nx + (az - z) * nz,
      b = (bx - x) * nx + (bz - z) * nz;
    if (a * b <= 0 && a !== b) {
      const t = a / (a - b),
        hitX = ax + (bx - ax) * t - x,
        hitZ = az + (bz - az) * t - z;
      if (Math.abs(hitX * nz - hitZ * nx) < capitalShortcut.width / 2 + 0.4) return false;
    }
  }
  if (
    !progress.caches.includes("town-key") &&
    Math.abs(nearY - 16) < 2 &&
    (az - capitalTownGate.position[2]) * (bz - capitalTownGate.position[2]) <= 0
  ) {
    const t = (capitalTownGate.position[2] - az) / (bz - az);
    if (Number.isFinite(t) && Math.abs(ax + (bx - ax) * t - capitalTownGate.position[0]) < 3.4)
      return false;
  }
  const steps = Math.ceil(Math.hypot(bx - ax, bz - az) * 2) + 1;
  let lastY = nearY;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps,
      x = ax + (bx - ax) * t,
      z = az + (bz - az) * t;
    const y = capitalFloorHeight(x, z, lastY);
    if (y === null || Math.abs(y - lastY) > 0.65 || capitalBlocked(x, y, z, 0.2)) return false;
    if (!progress.fogCleared && y < 0) return false;
    lastY = y;
  }
  return Math.abs(lastY - nearY) < 1.8;
}
export const capitalWorld = {
  campaign: true,
  spawns: capitalEnemySpawns,
  shrines: capitalShrines,
  floorHeight: capitalFloorHeight,
  blocked: capitalBlocked,
  lineClear: capitalLineClear,
  surfaceId: (x: number, z: number, y: number) => capitalSurfaceAt(x, z, y)?.id ?? null,
  connected: (from: string, to: string) => capitalNavigation.connected(from, to),
};

function solid(position: ParishPoint, size: ParishPoint, yaw = 0) {
  capitalSolids.push({ position, size, yaw });
}
// Enclosed town lift well, with matching openings on the two landings.
for (const x of [87.4, 80.6]) solid([x, 8, 27], [0.5, 17, 7]);
solid([84, 8, 23.6], [7, 17, 0.5]);
solid([84, 13, 30.4], [7, 7, 0.5]);
solid([43, 24, -28], [6, 19, 6]);
for (const x of [40.3, 45.7]) for (const z of [-30.7, -25.3]) solid([x, 44, z], [0.6, 19, 0.6]);
solid([43, 49, -28], [6, 18, 6]);
// The final hall in the footage is a broad vaulted chamber, with a central
// forecourt entrance and a lift bay, rather than exposed circular bleachers.
for (const x of [-24.7, 24.7]) solid([x, -12, -3], [1.4, 18, 59]);
solid([0, -12, -32.7], [50.8, 18, 1.4]);
for (const x of [-14.8, 14.8]) solid([x, -12, 26.7], [20, 18, 1.4]);
for (const x of [-21, 21])
  for (const z of [-25, -13, -1, 11, 23]) solid([x, -12, z], [1.8, 18, 1.8]);
capitalSolids.push(...capitalStatueSolids);
for (const x of [-5.5, 5.5])
  for (const z of [-53, -59, -65, -71]) {
    const seat = { position: [x, 24, z] as ParishPoint, size: [4, 0.7, 1] as ParishPoint, yaw: 0 };
    const back = {
      position: [x, 24, z + 0.5] as ParishPoint,
      size: [4, 1.25, 0.2] as ParishPoint,
      yaw: 0,
    };
    capitalPews.push(seat, back);
    capitalSolids.push(seat, back);
  }
for (const x of [-7, 7])
  for (const z of [-14, -7, 0, 7]) {
    const seat = { position: [x, 24, z] as ParishPoint, size: [4, 0.7, 1] as ParishPoint, yaw: 0 };
    const back = {
      position: [x, 24, z + 0.5] as ParishPoint,
      size: [4, 1.25, 0.2] as ParishPoint,
      yaw: 0,
    };
    capitalPews.push(seat, back);
    capitalSolids.push(seat, back);
  }
solid([0, 24, -85], [8, 1.2, 2]);
// Bases are real masonry volumes beneath the occupied floors, not render-only
// blocks that actors can walk through. The cellar remains hollow above +4 m.
solid([0, -18, -65], [32, 41.5, 44]);
solid([44 - CAPITAL_TOWN_X, -16, -18 + CAPITAL_TOWN_Z], [34, 19.5, 34]);
for (const x of [-27, 27]) for (const z of [-47, -61, -78]) solid([x, 0, z], [1.5, 45, 2]);
for (const x of [-49, -37]) for (const z of [-51, -79]) solid([x, 12, z], [3, 32, 3]);
// Author collision and AI footprints once. View meshes consume these same records.
authorBuildingWalls(
  {
    id: "nave",
    area: "cloister",
    center: [0, -65],
    size: [34, 46],
    base: 24,
    roof: 51,
    flat: false,
    doors: [
      { side: "west", offset: -7, width: 8, y: 24, height: 27 },
      { side: "west", offset: -19, width: 8, y: 36, height: 7 },
      { side: "east", offset: -18, width: 10, y: 24, height: 27 },
      { side: "west", offset: 10, width: 8, y: 41, height: 8 },
      { side: "east", offset: 10, width: 8, y: 41, height: 8 },
      { side: "east", offset: -7, width: 8, y: 24, height: 10 },
      { side: "south", offset: 0, width: 10, y: 24, height: 13 },
    ],
  },
  solid,
);
for (let i = 0; i < 8; i++) {
  const a = ((i + 0.5) * Math.PI) / 4;
  solid([Math.sin(a) * 13.5, 24, -5 + Math.cos(a) * 13.5], [1, 11, 1]);
}
for (const x of [-11, 11]) solid([x, 24, -5], [1, 11, 30]);
for (const z of [-20, 10]) {
  for (const x of [-7.5, 7.5]) solid([x, 24, z], [6, 11, 1]);
  solid([0, 31, z], [9, 4, 1]);
}
for (const b of capitalBuildings) authorBuildingWalls(b, solid);
// Buried town perimeter keeps the lower streets beneath the inhabited floor.
for (const x of [-61, -27]) solid([-x - CAPITAL_TOWN_X, 4, -18 + CAPITAL_TOWN_Z], [0.65, 4, 34]);
for (const z of [-35, -1]) solid([44 - CAPITAL_TOWN_X, 4, z + CAPITAL_TOWN_Z], [34, 4, 0.65]);
for (const z of [-30, -10]) solid([44 - CAPITAL_TOWN_X, 4, z + CAPITAL_TOWN_Z], [0.65, 4, 10]);
for (const x of [-10.5, 10.5]) for (const z of [-52, -65, -78]) solid([x, 24, z], [1.1, 12, 1.1]);
for (const x of [-62, -42])
  for (const z of [-66, -50])
    solid([x + CAPITAL_GARDEN_X, 24, z + CAPITAL_GARDEN_Z], [1.2, 3.5, 1.2]);

for (const x of [-3.5, 3.5]) for (const z of [-8.5, -1.5]) solid([x, 45.45, z], [0.6, 5.3, 0.6]);
solid([0, 50, -77], [1.3, 1, 1.3]);

for (let i = 0; i < 6; i++) {
  const a = (i * Math.PI) / 3;
  solid(
    [-58 + CAPITAL_GARDEN_X + Math.cos(a) * 3.7, 24, -58 + Math.sin(a) * 3.7 + CAPITAL_GARDEN_Z],
    [0.5, 8.6, 0.5],
  );
}
// The beacon is a hollow octagonal tower with an arrival arcade and a south
// exit. A closed decorative cylinder would hide the route through its body.
for (let i = 0; i < 8; i++) {
  const a = (i * Math.PI) / 4,
    r = 4.3 * Math.cos(Math.PI / 8);
  const point: ParishPoint = [-42 - Math.sin(a) * r, 20, -24 + Math.cos(a) * r];
  const width = 8.6 * Math.sin(Math.PI / 8);
  if (i === 0 || i === 5 || i === 6) {
    solid(point, [width, 4, 0.6], -a);
    solid([point[0], 33, point[2]], [width, 19, 0.6], -a);
  } else solid(point, [width, 32, 0.6], -a);
}
export const capitalNavigation = buildCapitalNavigation(
  capitalSurfaces,
  capitalSurfaceHeight,
  capitalBlocked,
);
