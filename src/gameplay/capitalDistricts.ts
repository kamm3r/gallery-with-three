import type { ParishArea, ParishPoint } from "./ashenParish.ts";

export type CapitalDoor = {
  side: "north" | "south" | "east" | "west";
  offset: number;
  width: number;
  y: number;
  height: number;
};
export type CapitalBuilding = {
  id: string;
  area: ParishArea;
  center: [number, number];
  size: [number, number];
  base: number;
  roof: number;
  flat: boolean;
  doors: CapitalDoor[];
};

const door = (
  side: CapitalDoor["side"],
  y: number,
  offset = 0,
  width = 4,
  height = 4.5,
): CapitalDoor => ({ side, y, offset, width, height });

/** Enterable volumes, not solid building-shaped obstacles. */
export const CAPITAL_TOWN_X = -10;
export const CAPITAL_TOWN_Z = 36;
export const CAPITAL_GARDEN_Z = 0;
export const CAPITAL_GARDEN_X = -12;
const authoredBuildings: CapitalBuilding[] = [
  {
    id: "town-west-front",
    area: "foundry",
    center: [-55, -10],
    size: [10, 12],
    base: 8,
    roof: 14,
    flat: true,
    doors: [door("east", 8), door("south", 8)],
  },
  {
    id: "town-west-back",
    area: "foundry",
    center: [-55, -27],
    size: [10, 12],
    base: 8,
    roof: 14,
    flat: true,
    doors: [door("east", 8), door("north", 8)],
  },
  {
    id: "town-east-front",
    area: "foundry",
    center: [-29, -10],
    size: [7, 12],
    base: 8,
    roof: 20,
    flat: true,
    doors: [
      door("west", 8),
      door("west", 14, 0, 3, 4),
      door("west", 14, 4, 4, 4),
      door("north", 14),
      door("south", 14),
    ],
  },
  {
    id: "town-east-back",
    area: "foundry",
    center: [-29, -27],
    size: [7, 12],
    base: 8,
    roof: 20,
    flat: true,
    doors: [
      door("west", 8),
      door("west", 14, 0, 3, 4),
      door("west", 14, 4, 4, 4),
      door("north", 14),
      door("south", 14),
    ],
  },
  {
    id: "town-hall",
    area: "foundry",
    center: [-44, -21],
    size: [12, 14],
    base: 8,
    roof: 20,
    flat: true,
    doors: [
      door("south", 8, 0, 5, 5),
      door("north", 8, 0, 5, 5),
      door("north", 14, -3, 3, 4),
      door("west", 14),
      door("east", 14),
    ],
  },
  {
    id: "town-workshop",
    area: "foundry",
    center: [-44, -35],
    size: [14, 6],
    base: 8,
    roof: 16,
    flat: false,
    doors: [door("south", 8, 0, 5, 6), door("north", 8, 0, 5, 6)],
  },
  {
    id: "town-upper-hall",
    area: "foundry",
    center: [-44, -21],
    size: [12, 14],
    base: 20,
    roof: 26,
    flat: false,
    doors: [door("south", 20, 0, 5, 5), door("north", 20), door("east", 20, 2)],
  },
  {
    id: "town-east-attic-front",
    area: "foundry",
    center: [-29, -10],
    size: [7, 12],
    base: 20,
    roof: 27,
    flat: false,
    doors: [door("south", 20), door("north", 20), door("west", 20)],
  },
  {
    id: "town-east-attic-back",
    area: "foundry",
    center: [-29, -27],
    size: [7, 12],
    base: 20,
    roof: 27,
    flat: false,
    doors: [door("south", 20, 0, 4, 5), door("north", 24, 0, 4, 3), door("west", 20, 4, 4, 5)],
  },
  {
    id: "cathedral-oratory",
    area: "cloister",
    center: [-36, -65],
    size: [26, 28],
    base: 44,
    roof: 58,
    flat: false,
    doors: [door("east", 44, 10, 6, 10)],
  },
  {
    id: "cathedral-side-chapel",
    area: "cloister",
    center: [29, -72],
    size: [20, 22],
    base: 24,
    roof: 37,
    flat: false,
    doors: [door("west", 24, 0, 7, 10), door("south", 24, 0, 6, 8)],
  },
  {
    id: "wall-watchhouse",
    area: "refuge",
    center: [-59, 45],
    size: [10, 10],
    base: 0,
    roof: 7,
    flat: false,
    doors: [door("north", 0), door("south", 0), door("west", 0, 0, 6)],
  },
  ...[-15, 8].flatMap((z) => {
    const base = -4 - ((z + 18.5) * 4) / 43;
    return (z < 0 ? [70] : [50, 70]).map((x) => ({
      id: `street-house:${x}:${z}`,
      area: "crypt" as const,
      center: [x, z] as [number, number],
      size: [8, 12] as [number, number],
      base,
      roof: base + 10,
      flat: false,
      doors: [door(x === 50 ? "east" : "west", base, 0, 4, 5)],
    }));
  }),
];

export const capitalBuildings: CapitalBuilding[] = authoredBuildings.map((b) =>
  b.id.startsWith("town-")
    ? { ...b, center: [b.center[0] + CAPITAL_TOWN_X, b.center[1] + CAPITAL_TOWN_Z] }
    : b,
);

type Builders = {
  rect: (
    id: string,
    area: ParishArea,
    x: number,
    y: number,
    z: number,
    w: number,
    d: number,
    layer?: "upper" | "lower",
  ) => void;
  lane: (
    id: string,
    area: ParishArea,
    points: ParishPoint[],
    width: number,
    layer?: "upper" | "lower",
  ) => void;
};
export function authorCapitalDistricts({ rect: rectSurface, lane: laneSurface }: Builders) {
  const rect: Builders["rect"] = (id, area, x, y, z, w, d, layer) =>
    rectSurface(
      id,
      area,
      x + (id.startsWith("town-") ? CAPITAL_TOWN_X : 0),
      y,
      z + (id.startsWith("town-") ? CAPITAL_TOWN_Z : 0),
      w,
      d,
      layer,
    );
  const lane: Builders["lane"] = (id, area, points, width, layer) =>
    laneSurface(
      id,
      area,
      points.map(([x, y, z]) => [
        x + (id.startsWith("town-") ? CAPITAL_TOWN_X : 0),
        y,
        z + (id.startsWith("town-") ? CAPITAL_TOWN_Z : 0),
      ]),
      width,
      layer,
    );

  for (const b of capitalBuildings)
    rectSurface(
      `${b.id}:floor`,
      b.area,
      b.center[0],
      b.base,
      b.center[1],
      ...b.size,
      b.base < 0 ? "lower" : "upper",
    );
  for (const b of capitalBuildings.filter((b) => b.area === "crypt"))
    lane(
      `${b.id}:entry`,
      "crypt",
      [
        [60, b.base, b.center[1]],
        [b.center[0], b.base, b.center[1]],
      ],
      4,
      "lower",
    );
  rect("crown-beacon-platform", "cloister", 0, 50, -77, 5, 5);
  // A stair inside the east aisle closes the exterior/gallery/nave loop.
  // Its opening leaves the inner half of the gallery available for through traffic.
  lane(
    "cathedral-nave-stair",
    "cloister",
    [
      [14.5, 24, -48],
      [14.5, 36, -82],
    ],
    2.5,
  );
  rect("town-lower", "foundry", -44, 4, -18, 34, 34);
  lane(
    "town-cellar-stair",
    "foundry",
    [
      [-35, 8, -4],
      [-35, 4, -18],
    ],
    6,
  );
  rect("town-hall-gallery", "foundry", -44, 14, -21, 12, 14);
  lane(
    "town-hall-stair",
    "foundry",
    [
      [-42, 8, -15],
      [-42, 14, -27],
    ],
    3,
  );
  for (const z of [-10, -27]) rect(`town-west-roof:${z}`, "foundry", -55, 14, z, 10, 12);
  rect("town-east-gallery", "foundry", -29, 14, -18, 7, 30);
  lane(
    "town-gallery-links",
    "foundry",
    [
      [-49, 14, -21],
      [-44, 14, -21],
      [-29, 14, -21],
    ],
    4,
  );
  lane(
    "town-roof-approach",
    "foundry",
    [
      [-44, 14, -21],
      [-47, 14, -21],
      [-47, 14, -30],
      [-55, 14, -30],
      [-55, 14, -29],
    ],
    3,
  );
  lane(
    "town-west-walk",
    "foundry",
    [
      [-55, 14, -10],
      [-62, 14, -10],
      [-62, 14, -30],
      [-55, 14, -30],
    ],
    3,
  );
  lane(
    "town-roof-stair",
    "foundry",
    [
      [-55, 14, -29],
      [-55, 20, -7],
    ],
    3,
  );
  rect("town-roof-landing", "foundry", -55, 20, -6.5, 6, 5);
  rect("town-hall-roof", "foundry", -44, 20, -21, 12, 14);
  rect("town-east-roof", "foundry", -29, 20, -18, 7, 30);
  lane(
    "town-third-floor",
    "foundry",
    [
      [-55, 20, -7],
      [-44, 20, -7],
      [-44, 20, -21],
      [-44, 20, -19],
      [-29, 20, -19],
      [-29, 20, -21],
    ],
    4,
  );
  lane(
    "town-top-return",
    "toproad",
    [
      [-29, 20, -21],
      [-29, 24, -34],
      [-24, 24, -34],
    ],
    4,
  );
  lane(
    "top-right-road",
    "toproad",
    [
      [18, 24, -32],
      [18.5, 24, -18],
      [18.5, 24, 9],
      [18, 24, 10],
    ],
    5,
  );
  for (const x of [-12, 12]) rect(`cathedral-third:${x}`, "cloister", x, 44, -65, 7, 46);
  for (const z of [-55, -77]) rect(`cathedral-third-cross:${z}`, "cloister", 0, 44, z, 30, 3);
  lane(
    "cathedral-third-ascent",
    "aqueduct",
    [
      [-12, 36, -84],
      [-20, 36, -84],
      [-20, 44, -54],
      [-12, 44, -54],
    ],
    3,
  );
  lane(
    "oratory-entry",
    "cloister",
    [
      [-12, 44, -54],
      [-26, 44, -54],
    ],
    5,
  );
  lane(
    "cathedral-side-return",
    "aqueduct",
    [
      [29, 24, -61],
      [29, 24, -52],
      [44, 24, -52],
    ],
    6,
  );
  lane(
    "cathedral-side-entry",
    "cloister",
    [
      [12, 24, -72],
      [29, 24, -72],
    ],
    7,
  );
  lane(
    "cathedral-rafter-stair",
    "cloister",
    [
      [-12, 44, -54],
      [-12, 50, -76],
      [-7, 50, -76],
    ],
    3,
  );
  for (const x of [-7, 7]) rect(`cathedral-rafter:${x}`, "cloister", x, 50, -65, 2.5, 38);
  for (const z of [-58, -77]) rect(`cathedral-rafter-cross:${z}`, "cloister", 0, 50, z, 18, 2.5);
  lane(
    "chapel-rooftop-return",
    "kiln",
    [
      [12, 44, -54],
      [24, 44, -54],
      [24, 44, -28],
      [0, 45.45, -17],
      [0, 45.45, -5],
    ],
    3,
  );
  rect("chapel-rooftop", "kiln", 0, 45.45, -5, 10, 10);
  lane(
    "garden-town-return",
    "graveyard",
    [
      [-70, 24, -48],
      [-70, 14, -28],
      [88, 14, -28],
      [88, 14, 22],
      [75, 14, 22],
      [65, 14, 22],
    ],
    5,
  );
  lane(
    "street-wall-return",
    "crypt",
    [
      [60, -8, 30],
      [70, -8, 30],
      [70, -8, 49],
      [74, 0, 65],
      [54, 0, 51],
    ],
    5,
    "lower",
  );
  rect("street-wall-landing", "refuge", 54, 0, 51, 7, 7);
}

/** Horizontal and vertical door cuts share the exact collision/render wall records. */
export function authorBuildingWalls(
  b: CapitalBuilding,
  solid: (position: ParishPoint, size: ParishPoint, yaw?: number) => void,
) {
  const [cx, cz] = b.center,
    [w, d] = b.size;
  for (const side of ["north", "south", "east", "west"] as const) {
    const across = side === "north" || side === "south",
      length = across ? w : d;
    const doors = b.doors.filter((v) => v.side === side);
    const cuts = [
      -length / 2,
      length / 2,
      ...doors.flatMap((v) => [v.offset - v.width / 2, v.offset + v.width / 2]),
    ].sort((a, c) => a - c);
    for (let i = 1; i < cuts.length; i++) {
      const a = cuts[i - 1],
        c = cuts[i];
      if (c - a < 0.01) continue;
      const openings = doors
        .filter((v) => (a + c) / 2 > v.offset - v.width / 2 && (a + c) / 2 < v.offset + v.width / 2)
        .sort((a, c) => a.y - c.y);
      let floor = b.base;
      const place = (bottom: number, top: number) => {
        if (top - bottom < 0.01) return;
        solid(
          [
            cx + (across ? (a + c) / 2 : side === "east" ? w / 2 : -w / 2),
            bottom,
            cz + (across ? (side === "south" ? d / 2 : -d / 2) : (a + c) / 2),
          ],
          across ? [c - a, top - bottom, 0.65] : [0.65, top - bottom, c - a],
        );
      };
      for (const o of openings) {
        place(floor, o.y);
        floor = Math.max(floor, o.y + o.height);
      }
      place(floor, b.roof);
    }
  }
}
