import type { Group } from "three";
import { gloveMesh, gravediggerHead, type IndexedSurface, type Point } from "./residentTopology.ts";

export type { Point } from "./residentTopology.ts";
export type Section = [y: number, width: number, depth: number, x?: number, z?: number];

export const gothicResidents = {
  gravedigger: {
    name: "The Gravedigger",
    position: [-4, 0, 19],
    yaw: 0.45,
    radius: 0.27,
    height: 1.86,
  },
  mourner: {
    name: "The Veiled Mourner",
    position: [6, 0, 17],
    yaw: -0.55,
    radius: 0.28,
    height: 1.77,
  },
  gaoler: { name: "The Iron Gaoler", position: [-6, 0, 15], yaw: 0.4, radius: 0.38, height: 2.08 },
  apothecary: {
    name: "The Apothecary",
    position: [2, 0, 17],
    yaw: -0.24,
    radius: 0.28,
    height: 1.55,
  },
} satisfies Record<
  string,
  { name: string; position: Point; yaw: number; radius: number; height: number }
>;

export type Resident = keyof typeof gothicResidents;

type Sculpt = {
  joint: (parent: Group, name: string, position?: Point) => Group;
  garment: (
    parent: Group,
    tile: number,
    profile: Section[],
    sides?: number,
    shape?: (point: Point, angle: number, row: number) => Point,
  ) => void;
  surface: (parent: Group, tile: number, rows: Point[][]) => void;
  indexed: (parent: Group, tile: number, model: IndexedSurface) => void;
};

// Material islands on residents-atlas.png. Each item gets directional paint.
const paint = {
  graveWool: 16,
  graveLeather: 17,
  graveCape: 18,
  graveFace: 19,
  spade: 20,
  hat: 21,
  habit: 22,
  veil: 23,
  veilLining: 24,
  censer: 25,
  cuirass: 26,
  blackIron: 27,
  oldLivery: 28,
  medicCoat: 29,
  medicHood: 30,
  labeledGlass: 31,
} as const;

export function sculptResident(
  root: Group,
  kind: Resident,
  { joint, garment, surface, indexed }: Sculpt,
) {
  const body = joint(root, "body");
  const head = joint(body, "head");
  const scarf = joint(body, "scarf");
  const arms: Record<string, Group> = {};

  function boots(stance: number, height: number, bulk: number, stride = 0) {
    // Cross-sections come from a boot last: wide toe, narrow instep, squared heel.
    const perimeter: Point[] = [
      [0, 0, -0.081],
      [0.55, 0, -0.077],
      [0.77, 0, -0.043],
      [0.79, 0, 0.011],
      [0.84, 0, 0.066],
      [1, 0, 0.131],
      [0.8, 0, 0.173],
      [0.34, 0, 0.191],
      [-0.24, 0, 0.177],
      [-0.76, 0, 0.158],
      [-0.93, 0, 0.091],
      [-0.68, 0, 0.023],
      [-0.68, 0, -0.051],
      [-0.47, 0, -0.079],
      [0, 0, -0.081],
    ];
    for (const side of [-1, 1]) {
      const foot = joint(root, "boot", [side * stance, 0, side * stride]);
      const loops = (sections: [number, number, number, number][]) =>
        sections.map(([y, width, rear, toe]) =>
          perimeter.map(([x, , z], index): Point => {
            const mirror = side === 1 ? x : perimeter[perimeter.length - 1 - index][0] * -1;
            const length = side === 1 ? z : perimeter[perimeter.length - 1 - index][2];
            return [
              mirror * bulk * width,
              y + (length > 0.16 && y > 0.03 ? 0.007 : 0),
              length * (length < 0 ? rear : toe),
            ];
          }),
        );
      surface(
        foot,
        8,
        loops([
          [0.003, 0.92, 0.94, 0.99],
          [0.02, 1.04, 1.04, 1.04],
          [0.035, 1, 1, 1],
        ]),
      );
      surface(
        foot,
        3,
        loops([
          [0.03, 1, 1, 1],
          [0.071, 0.96, 0.98, 0.96],
          [0.106, 0.84, 1, 0.74],
          [0.143, 0.71, 1.06, 0.49],
          [0.143 + (height - 0.143) * 0.52, 0.74, 1.13, 0.43],
          [height, 0.86, 1.12, 0.48],
        ]),
      );
    }
  }

  /** Make both sides and join their perimeter so a panel has real thickness. */
  function shell(
    parent: Group,
    outerTile: number,
    liningTile: number,
    rows: Point[][],
    offset: Point,
  ) {
    const inner = rows.map((row) =>
      row.map(([x, y, z]): Point => [x + offset[0], y + offset[1], z + offset[2]]),
    );
    surface(parent, outerTile, rows);
    surface(
      parent,
      liningTile,
      inner.map((row) => row.slice().reverse()),
    );
    const sides = (grid: Point[][]) => [
      grid[0],
      grid.map((row) => row[row.length - 1]),
      grid[grid.length - 1].slice().reverse(),
      grid.map((row) => row[0]).reverse(),
    ];
    const rims = sides(inner);
    sides(rows).forEach((edge, i) => surface(parent, liningTile, [rims[i], edge]));
  }

  /** Fold-formed steel with a crisp rim and a pressed ridge. */
  function pauldron(parent: Group, side: number) {
    const shoulder = joint(parent, "layered shoulder plate", [0, -0.04, side * 0.009]);
    shoulder.rotation.z = side * 0.17;
    const plates: Section[][] = [
      [
        [-0.024, 0.16, 0.144],
        [0.027, 0.176, 0.146],
        [0.084, 0.132, 0.121],
        [0.135, 0.047, 0.056],
        [0.145, 0.013, 0.021],
      ],
      [
        [-0.121, 0.123, 0.128, side * 0.02],
        [-0.063, 0.161, 0.148, side * 0.019],
        [-0.022, 0.164, 0.145, side * 0.009],
        [0.005, 0.108, 0.109],
      ],
      [
        [-0.182, 0.09, 0.104, side * 0.018],
        [-0.14, 0.124, 0.121, side * 0.025],
        [-0.102, 0.129, 0.128, side * 0.021],
      ],
    ];
    for (const [index, shape] of plates.entries()) {
      const rows = shape.map(([y, w, d, x = 0, z = 0]) =>
        Array.from({ length: 9 }, (_, col): Point => {
          const a = (col / 8 - 0.5) * Math.PI * 1.74;
          const ridge = col === 4 ? (2 - index) * 0.011 : 0;
          return [
            x + Math.sin(a) * w,
            y + ridge + Math.sin(a) * side * 0.029,
            z + Math.cos(a) * d + ridge,
          ];
        }),
      );
      shell(shoulder, index === 0 ? paint.cuirass : paint.blackIron, 8, rows, [0, -0.008, -0.009]);
    }
  }

  function spats(
    stance: number,
    stride: number,
    low: number,
    high: number,
    width: number,
    tile: number,
  ) {
    for (const side of [-1, 1]) {
      const x = stance * side;
      garment(
        root,
        tile,
        [
          [low, width, 0.11, x, side * stride + 0.005],
          [low + 0.042, width * 1.04, 0.102, x, side * stride],
          [high, width * 0.96, 0.096, x, side * stride],
        ],
        8,
      );
    }
  }

  function arm(
    side: number,
    shoulder: Point,
    reach: Point,
    width: number,
    tile: number,
    elbow?: Point,
  ) {
    const part = joint(body, "arm" + side, shoulder);
    arms[part.name] = part;
    const [x, y, z] = reach;
    const bend = elbow ?? [x * 0.76, y * 0.56, z * 0.33];
    const [ex, ey, ez] = bend;
    const sleeve: [center: Point, width: number, depth: number][] = [
      [reach, width * 0.47, width * 0.52],
      [
        [x * 0.83 + ex * 0.17, y * 0.83 + ey * 0.17, z * 0.83 + ez * 0.17],
        width * 0.56,
        width * 0.59,
      ],
      [
        [x * 0.44 + ex * 0.56, y * 0.44 + ey * 0.56, z * 0.44 + ez * 0.56],
        width * 0.72,
        width * 0.62,
      ],
      [bend, width * 0.61, width * 0.61],
      [[ex * 0.6, ey * 0.59, ez * 0.52], width * 0.88, width * 0.81],
      [[ex * 0.23, ey * 0.23, ez * 0.18], width * 0.93, width * 0.89],
      [[0, 0.042, 0], width * 0.77, width * 0.74],
      [[0, 0.065, 0], width * 0.12, width * 0.2],
    ];
    // Orient the sections along the arm, including the fold at the bent elbow.
    surface(
      part,
      tile,
      sleeve.map(([center, rx, rz], row) => {
        const lower = sleeve[Math.max(0, row - 1)][0];
        const upper = sleeve[Math.min(sleeve.length - 1, row + 1)][0];
        const [dx, dy, dz] = upper.map((item, i) => item - lower[i]);
        const axisLength = Math.hypot(dx, dy, dz) || 1;
        const lateralLength = Math.hypot(dx, dy) || 1;
        const sideX = dy / lateralLength;
        const sideY = -dx / lateralLength;
        const forwardX = (-sideY * dz) / axisLength;
        const forwardY = (sideX * dz) / axisLength;
        const forwardZ = (sideY * dx - sideX * dy) / axisLength;
        return Array.from({ length: 11 }, (_, i): Point => {
          const a = (i / 10 - 0.5) * Math.PI * 2;
          const crease = 1 + Math.cos(3 * a + row) * (0.065 + (row === 3 ? 0.075 : 0));
          const lateral = Math.sin(a) * rx * crease;
          const forward = -Math.cos(a) * rz * crease;
          return [
            center[0] + sideX * lateral + forwardX * forward,
            center[1] + sideY * lateral + forwardY * forward,
            center[2] + forwardZ * forward,
          ];
        });
      }),
    );
    const grip = joint(part, "grip", reach);
    const hand = joint(grip, "gloved hand");
    hand.rotation.x = -Math.atan2(z - ez, Math.max(0.038, ey - y)) * 0.46;
    hand.rotation.z = side * 0.16;
    indexed(hand, 8, gloveMesh(width, side));
    return grip;
  }

  // An open solid link reads from every angle, including edge-on.
  function ironLoop(
    parent: Group,
    position: Point,
    radius: number,
    pitch = 0,
    length = 1.25,
    tile = paint.blackIron,
  ) {
    const link = joint(parent, "forged link", position);
    link.rotation.y = pitch;
    const segments = 10;
    const thickness = radius * 0.19;
    const crossSections: Point[][] = Array.from({ length: segments + 1 }, (_, i) => {
      const a = (i * Math.PI * 2) / segments;
      return Array.from({ length: 5 }, (_, j): Point => {
        const b = (j * Math.PI) / 2;
        const outer = radius + Math.cos(b) * thickness;
        return [Math.cos(a) * outer, Math.sin(a) * outer * length, Math.sin(b) * thickness];
      });
    });
    surface(link, tile, crossSections);
    return link;
  }

  function oval(parent: Group, tile: number, at: Point, size: Point, sides = 8) {
    const [w, h, d] = size;
    const part = joint(parent, "fitting", at);
    garment(
      part,
      tile,
      [
        [-h, 0.005, 0.005],
        [-h * 0.77, w * 0.71, d * 0.72],
        [-h * 0.24, w, d],
        [h * 0.42, w * 0.98, d * 0.98],
        [h * 0.87, w * 0.65, d * 0.67],
        [h, 0.004, 0.004],
      ],
      sides,
    );
    return part;
  }

  // A flat-backed strap is mapped across the costume instead of floating over it.
  function strap(parent: Group, path: Point[], width: number, tile = 8) {
    surface(
      parent,
      tile,
      path.map(([x, y, z]): Point[] => [
        [x - width, y, z],
        [x + width, y, z],
      ]),
    );
  }

  switch (kind) {
    case "gravedigger": {
      boots(0.157, 0.36, 0.076, 0.045);
      spats(0.157, 0.045, 0.21, 0.4, 0.078, paint.graveLeather);
      for (const side of [-1, 1]) {
        const x = side * 0.156;
        garment(
          root,
          2,
          [
            [0.27, 0.061, 0.064, x, side * 0.045],
            [0.57, 0.076, 0.081, x + side * 0.014, 0.028 + side * 0.025],
            [0.75, 0.088, 0.101, x],
            [0.99, 0.115, 0.11, x],
          ],
          8,
        );
      }
      garment(
        body,
        paint.graveWool,
        [
          [0.76, 0.216, 0.159],
          [0.92, 0.233, 0.159],
          [1.1, 0.218, 0.153],
          [1.33, 0.233, 0.15, 0, 0.025],
          [1.47, 0.236, 0.167, -0.035, 0.082],
          [1.576, 0.162, 0.133, -0.05, 0.112],
          [1.615, 0.108, 0.112, -0.046, 0.161],
        ],
        12,
      );
      // Leather apron, with a pointed stained hem and straps over the chest.
      surface(body, paint.graveLeather, [
        [
          [-0.179, 0.57, 0.172],
          [-0.029, 0.54, 0.199],
          [0.136, 0.6, 0.174],
        ],
        [
          [-0.191, 0.79, 0.156],
          [-0.018, 0.77, 0.204],
          [0.168, 0.8, 0.151],
        ],
        [
          [-0.176, 1.01, 0.149],
          [0, 1.0, 0.168],
          [0.156, 1.02, 0.145],
        ],
        [
          [-0.112, 1.36, 0.194],
          [0.013, 1.37, 0.219],
          [0.105, 1.34, 0.197],
        ],
      ]);
      strap(
        body,
        [
          [-0.083, 1.32, 0.209],
          [-0.13, 1.46, 0.207],
          [-0.15, 1.575, 0.191],
          [-0.125, 1.62, 0.145],
        ],
        0.013,
      );
      strap(
        body,
        [
          [0.081, 1.32, 0.207],
          [0.12, 1.45, 0.215],
          [0.137, 1.56, 0.196],
          [0.119, 1.62, 0.154],
        ],
        0.012,
      );
      oval(body, 9, [-0.084, 1.333, 0.219], [0.017, 0.017, 0.007], 6);
      oval(body, 9, [0.084, 1.337, 0.217], [0.017, 0.017, 0.007], 6);
      const grip = arm(
        -1,
        [-0.213, 1.45, 0.104],
        [-0.133, -0.465, 0.34],
        0.089,
        paint.graveWool,
        [-0.107, -0.288, 0.166],
      );
      arm(1, [0.178, 1.469, 0.056], [0.107, -0.573, -0.054], 0.084, paint.graveWool);
      const spade = joint(grip, "gravedigger's spade", [-0.031, -0.045, 0.025]);
      spade.rotation.set(-0.15, 0, -0.29);
      garment(
        spade,
        11,
        [
          [-0.84, 0.018, 0.017],
          [0.475, 0.021, 0.02],
          [0.49, 0.016, 0.015],
        ],
        6,
      );
      shell(
        spade,
        paint.spade,
        paint.blackIron,
        [
          [
            [-0.075, -0.85, 0.004],
            [0, -0.947, 0.034],
            [0.077, -0.85, 0.005],
          ],
          [
            [-0.094, -0.725, 0.01],
            [0, -0.769, 0.039],
            [0.096, -0.725, 0.01],
          ],
          [
            [-0.086, -0.662, 0.01],
            [0, -0.676, 0.026],
            [0.084, -0.662, 0.01],
          ],
        ],
        [0, 0, -0.013],
      );
      // One side of the storm cape hangs clear of the arm, leaving the apron visible.
      shell(
        body,
        paint.graveCape,
        paint.graveWool,
        [
          [
            [-0.118, 0.96, -0.2],
            [-0.252, 1.04, -0.156],
            [-0.307, 1.125, -0.063],
            [-0.304, 1.19, 0.083],
            [-0.211, 1.25, 0.176],
          ],
          [
            [-0.048, 1.218, -0.187],
            [-0.236, 1.23, -0.176],
            [-0.329, 1.316, -0.081],
            [-0.359, 1.36, 0.093],
            [-0.224, 1.388, 0.193],
          ],
          [
            [-0.054, 1.475, -0.124],
            [-0.2, 1.455, -0.126],
            [-0.323, 1.468, -0.012],
            [-0.312, 1.484, 0.117],
            [-0.218, 1.479, 0.203],
          ],
          [
            [-0.023, 1.658, -0.08],
            [-0.106, 1.641, -0.083],
            [-0.155, 1.598, 0.008],
            [-0.141, 1.608, 0.132],
            [-0.113, 1.626, 0.181],
          ],
        ],
        [0.007, 0.006, -0.008],
      );
      oval(body, 9, [-0.135, 1.574, 0.191], [0.024, 0.025, 0.011], 6);
      garment(
        spade,
        8,
        [
          [0.45, 0.021, 0.021],
          [0.505, 0.025, 0.022],
          [0.527, 0.017, 0.018],
        ],
        6,
      );
      head.position.set(-0.066, 1.548, 0.238);
      indexed(head, paint.graveFace, gravediggerHead());
      head.rotation.z = 0.067;
      head.rotation.x = 0.29;
      // An open-sided oilskin cowl frames the face and hangs between the shoulder blades.
      const cowl: Section[] = [
        [-0.162, 0.168, 0.146, 0.016, -0.148],
        [-0.083, 0.135, 0.13, 0.004, -0.112],
        [0.04, 0.12, 0.106, -0.005, -0.065],
        [0.15, 0.121, 0.112, -0.008, -0.028],
        [0.228, 0.103, 0.107, -0.014, -0.038],
        [0.275, 0.071, 0.07, -0.022, -0.051],
        [0.293, 0.012, 0.013, -0.034, -0.064],
      ];
      surface(
        head,
        paint.graveCape,
        cowl.map(([y, w, d, x = 0, z = 0], row) =>
          Array.from({ length: 17 }, (_, index): Point => {
            const step = index / 16;
            const angle = (step - 0.5) * (row < 3 ? 4.47 : 4.98);
            const wave = row < 3 ? 0.01 * Math.sin(step * 20) : 0;
            return [x + Math.sin(angle) * w, y + wave, z - Math.cos(angle) * (d + wave)];
          }),
        ),
      );
      surface(head, paint.graveCape, [
        [
          [-0.106, 0.206, -0.018],
          [-0.064, 0.214, 0.068],
          [0, 0.212, 0.12],
          [0.061, 0.212, 0.075],
          [0.098, 0.199, 0.005],
        ],
        [
          [-0.111, 0.239, -0.028],
          [-0.063, 0.244, 0.048],
          [0, 0.248, 0.087],
          [0.058, 0.245, 0.052],
          [0.101, 0.229, -0.003],
        ],
        [
          [-0.079, 0.27, -0.052],
          [-0.05, 0.278, -0.012],
          [0, 0.287, 0.033],
          [0.051, 0.275, -0.018],
          [0.073, 0.261, -0.048],
        ],
      ]);
      // Torn scarf covers the windward jaw and continues down the front of the cape.
      surface(head, paint.veilLining, [
        [
          [-0.11, -0.047, 0.027],
          [-0.09, -0.06, 0.09],
          [-0.065, -0.052, 0.12],
          [-0.031, -0.031, 0.127],
        ],
        [
          [-0.116, 0.003, 0.03],
          [-0.104, 0.001, 0.074],
          [-0.087, 0.009, 0.109],
          [-0.053, 0.009, 0.131],
        ],
        [
          [-0.112, 0.066, 0.01],
          [-0.107, 0.045, 0.07],
          [-0.094, 0.038, 0.094],
          [-0.062, 0.03, 0.124],
        ],
      ]);
      surface(body, paint.graveCape, [
        [
          [-0.204, 1.019, 0.127],
          [-0.166, 1.011, 0.139],
          [-0.135, 1.037, 0.152],
        ],
        [
          [-0.202, 1.174, 0.146],
          [-0.17, 1.189, 0.177],
          [-0.131, 1.19, 0.177],
        ],
        [
          [-0.179, 1.369, 0.181],
          [-0.148, 1.403, 0.22],
          [-0.11, 1.409, 0.216],
        ],
        [
          [-0.159, 1.544, 0.183],
          [-0.13, 1.591, 0.207],
          [-0.086, 1.573, 0.216],
        ],
      ]);
      // Oilcloth hangs below and behind the waist, with an offset torn corner.
      const coatTail: Section[] = [
        [0.455, 0.225, 0.171, -0.035, -0.052],
        [0.67, 0.245, 0.17, -0.02, -0.054],
        [0.91, 0.23, 0.164, 0, -0.039],
        [1.13, 0.224, 0.151, -0.01, -0.029],
        [1.38, 0.245, 0.172, -0.024, 0.003],
      ];
      surface(
        body,
        paint.graveCape,
        coatTail.map(([y, w, d, x = 0, z = 0], row) =>
          Array.from({ length: 12 }, (_, column): Point => {
            const angle = Math.PI * (0.42 + (1.15 * column) / 11);
            const fray = row === 0 ? 0.105 * Math.sin(column * 0.8) - 0.04 * (column % 2) : 0;
            return [x + Math.sin(angle) * w, y + fray, z + Math.cos(angle) * d];
          }),
        ),
      );
      // An iron burial tally and a tool roll ride under the weather cape.
      const roll = joint(body, "uneven tool roll", [-0.16, 1.14, -0.211]);
      roll.rotation.z = 1.17;
      garment(
        roll,
        paint.graveLeather,
        [
          [-0.197, 0.025, 0.031],
          [-0.174, 0.072, 0.071],
          [0.148, 0.074, 0.067],
          [0.195, 0.036, 0.041],
        ],
        8,
      );
      for (const y of [-0.122, 0.102])
        garment(
          roll,
          8,
          [
            [y, 0.075, 0.074],
            [y + 0.022, 0.077, 0.074],
          ],
          8,
        );
      for (const [idx, x] of [-0.07, -0.029, 0.016].entries()) {
        const tally = joint(body, "grave marker", [x, 1.038 - idx * 0.015, -0.261]);
        tally.rotation.z = 0.08 + idx * 0.19;
        garment(
          tally,
          paint.spade,
          [
            [-0.104, 0.013, 0.007],
            [-0.082, 0.022, 0.008],
            [-0.027, 0.022, 0.008],
            [-0.014, 0.01, 0.007],
          ],
          4,
        );
      }
      break;
    }
    case "mourner": {
      boots(0.097, 0.16, 0.067);
      const habit: Section[] = [
        [0.05, 0.338, 0.248, -0.013, -0.015],
        [0.108, 0.335, 0.236, -0.014, -0.013],
        [0.24, 0.306, 0.217, -0.011, -0.008],
        [0.45, 0.265, 0.196, -0.005, -0.003],
        [0.67, 0.225, 0.165],
        [0.91, 0.177, 0.13, 0.013, 0.005],
        [1.03, 0.175, 0.123, 0.013, 0.006],
        [1.172, 0.181, 0.138, 0.009, 0.004],
        [1.315, 0.215, 0.111],
        [1.395, 0.135, 0.088, -0.013, 0.023],
        [1.49, 0.089, 0.083, -0.014, 0.042],
      ];
      const folds = [0.01, 0.018, 0.037, 0.027, 0.034, 0.025, 0.011, 0.014, 0.007, 0.003, 0.002];
      garment(body, paint.habit, habit, 28, ([x, y, z], angle, row) => {
        const bias = angle + row * 0.019 + 0.31 * Math.sin(angle);
        const ridge = Math.cos(7 * bias);
        const cloth = (ridge > 0 ? ridge * 0.54 : ridge) * folds[row];
        const balance = 0.01 * Math.sin(3 * angle) * Math.max(0, 1 - row * 0.12);
        return [
          x + Math.sin(angle) * cloth,
          y + balance + (row === 0 ? cloth * 0.27 : 0),
          z + Math.cos(angle) * cloth,
        ];
      });
      shell(
        body,
        paint.veilLining,
        paint.habit,
        [
          [
            [-0.131, 0.071, 0.219],
            [-0.072, 0.067, 0.25],
            [0.001, 0.053, 0.276],
            [0.081, 0.08, 0.265],
            [0.142, 0.091, 0.228],
          ],
          [
            [-0.124, 0.254, 0.181],
            [-0.061, 0.248, 0.21],
            [0.015, 0.232, 0.232],
            [0.078, 0.255, 0.234],
            [0.136, 0.258, 0.198],
          ],
          [
            [-0.122, 0.463, 0.165],
            [-0.047, 0.454, 0.2],
            [0.009, 0.444, 0.227],
            [0.069, 0.466, 0.206],
            [0.129, 0.467, 0.185],
          ],
          [
            [-0.096, 0.705, 0.149],
            [-0.044, 0.698, 0.172],
            [0.009, 0.693, 0.191],
            [0.061, 0.709, 0.167],
            [0.108, 0.722, 0.156],
          ],
          [
            [-0.08, 0.905, 0.125],
            [-0.041, 0.915, 0.143],
            [0.007, 0.923, 0.16],
            [0.048, 0.92, 0.15],
            [0.091, 0.934, 0.126],
          ],
        ],
        [0, 0.005, -0.008],
      );
      garment(
        body,
        8,
        [
          [0.99, 0.201, 0.136],
          [1.022, 0.199, 0.14],
        ],
        12,
      );
      arm(-1, [-0.173, 1.28, -0.009], [0.102, -0.262, 0.234], 0.09, paint.habit);
      const grip = arm(1, [0.178, 1.28, -0.012], [-0.084, -0.272, 0.283], 0.086, paint.habit);
      const chain = joint(grip, "censer chain", [-0.014, -0.064, 0.025]);
      for (let link = 0; link < 6; link++) {
        const linkPivot = joint(chain, "chain link", [
          Math.sin(link * 0.4) * 0.013,
          -link * 0.033,
          Math.cos(link * 0.5) * 0.012,
        ]);
        linkPivot.rotation.y = link % 2 ? Math.PI * 0.43 : 0.09;
        surface(
          linkPivot,
          9,
          [0.011, 0.018].map((radius) =>
            Array.from({ length: 9 }, (_, step): Point => [
              Math.cos((step * Math.PI) / 4) * radius,
              Math.sin((step * Math.PI) / 4) * radius * 1.35,
              0,
            ]),
          ),
        );
      }
      const censer = joint(chain, "smoldering censer", [0.004, -0.284, 0.002]);
      garment(
        censer,
        paint.censer,
        [
          [-0.111, 0.012, 0.011],
          [-0.084, 0.039, 0.037],
          [-0.042, 0.068, 0.06],
          [0.011, 0.058, 0.054],
          [0.03, 0.062, 0.058],
          [0.061, 0.031, 0.03],
          [0.086, 0.009, 0.011],
        ],
        10,
      );
      garment(
        censer,
        9,
        [
          [-0.047, 0.067, 0.061],
          [-0.036, 0.069, 0.063],
        ],
        10,
      );
      garment(
        censer,
        9,
        [
          [0.033, 0.063, 0.059],
          [0.043, 0.057, 0.056],
        ],
        10,
      );
      // A single folded veil wraps the skull and shoulders without intersecting a second hood.
      head.position.set(-0.019, 1.45, 0.064);
      head.rotation.x = 0.31;
      head.rotation.z = 0.064;
      garment(
        head,
        paint.veil,
        [
          [-0.23, 0.203, 0.139, 0, -0.032],
          [-0.153, 0.173, 0.128, 0, -0.028],
          [-0.054, 0.139, 0.12, 0, -0.006],
          [0.048, 0.116, 0.119],
          [0.136, 0.119, 0.122],
          [0.202, 0.113, 0.097, 0, -0.013],
          [0.242, 0.081, 0.073, 0, -0.023],
          [0.266, 0.012, 0.014, 0, -0.026],
        ],
        20,
        ([x, y, z], angle, row) => {
          const hem = row < 3 ? Math.cos(5 * angle) * (0.014 - row * 0.003) : 0;
          return [x + Math.sin(angle) * hem, y + hem, z + Math.cos(angle) * hem];
        },
      );
      // The train spreads across the flagstones behind her.
      surface(body, paint.habit, [
        [
          [-0.396, 0.033, -0.455],
          [-0.211, 0.019, -0.536],
          [0.022, 0.015, -0.57],
          [0.238, 0.023, -0.533],
          [0.401, 0.033, -0.427],
        ],
        [
          [-0.342, 0.064, -0.365],
          [-0.193, 0.055, -0.435],
          [0.012, 0.043, -0.467],
          [0.209, 0.059, -0.431],
          [0.342, 0.062, -0.357],
        ],
        [
          [-0.244, 0.166, -0.211],
          [-0.131, 0.183, -0.29],
          [0.002, 0.161, -0.301],
          [0.14, 0.17, -0.275],
          [0.218, 0.152, -0.203],
        ],
        [
          [-0.159, 0.395, -0.129],
          [-0.08, 0.411, -0.199],
          [0.018, 0.423, -0.218],
          [0.118, 0.407, -0.187],
          [0.163, 0.401, -0.129],
        ],
      ]);
      // A split funerary stole hangs from the back of the veil to the knees.
      for (const side of [-1, 1]) {
        const bias = side * 0.095;
        surface(head, paint.veil, [
          [
            [bias - 0.038, -0.83, -0.095],
            [bias, -0.88, -0.112],
            [bias + 0.042, -0.82, -0.09],
          ],
          [
            [bias - 0.034, -0.65, -0.169],
            [bias, -0.642, -0.185],
            [bias + 0.04, -0.661, -0.17],
          ],
          [
            [bias - 0.042, -0.32, -0.166],
            [bias, -0.314, -0.186],
            [bias + 0.042, -0.312, -0.156],
          ],
          [
            [bias - 0.03, -0.068, -0.108],
            [bias, -0.042, -0.134],
            [bias + 0.031, -0.061, -0.113],
          ],
        ]);
      }
      for (const side of [-1, 1]) {
        const fold: Point[][] = [
          [
            [side * 0.028, -0.175, 0.119],
            [side * 0.067, -0.155, 0.14],
            [side * 0.129, -0.144, 0.105],
          ],
          [
            [side * 0.045, -0.09, 0.139],
            [side * 0.076, -0.086, 0.153],
            [side * 0.109, -0.082, 0.118],
          ],
          [
            [side * 0.055, 0.018, 0.139],
            [side * 0.082, 0.009, 0.15],
            [side * 0.107, 0.004, 0.12],
          ],
          [
            [side * 0.056, 0.107, 0.127],
            [side * 0.08, 0.107, 0.134],
            [side * 0.101, 0.105, 0.105],
          ],
          [
            [side * 0.044, 0.182, 0.093],
            [side * 0.069, 0.176, 0.097],
            [side * 0.094, 0.171, 0.071],
          ],
        ];
        shell(head, paint.veil, paint.habit, fold, [0, 0.002, -0.009]);
      }
      // An aged funerary mask protrudes just enough from beneath the folded hood.
      surface(head, paint.veilLining, [
        [
          [-0.056, 0.02, 0.119],
          [-0.034, -0.011, 0.139],
          [0, -0.024, 0.15],
          [0.033, -0.009, 0.139],
          [0.054, 0.018, 0.12],
        ],
        [
          [-0.068, 0.07, 0.117],
          [-0.037, 0.057, 0.136],
          [0, 0.053, 0.161],
          [0.036, 0.056, 0.141],
          [0.066, 0.073, 0.118],
        ],
        [
          [-0.064, 0.137, 0.104],
          [-0.032, 0.13, 0.126],
          [0, 0.121, 0.14],
          [0.032, 0.125, 0.129],
          [0.061, 0.134, 0.109],
        ],
        [
          [-0.05, 0.162, 0.095],
          [-0.03, 0.17, 0.109],
          [0, 0.172, 0.123],
          [0.029, 0.165, 0.112],
          [0.051, 0.156, 0.096],
        ],
      ]);
      for (const side of [-1, 1]) {
        const eye = oval(head, paint.hat, [side * 0.032, 0.099, 0.136], [0.02, 0.007, 0.005], 6);
        eye.rotation.z = side * 0.14;
      }
      oval(head, 9, [0.01, 0.177, 0.112], [0.012, 0.018, 0.008], 6);
      break;
    }
    case "gaoler": {
      boots(0.22, 0.29, 0.112, 0.103);

      for (const side of [-1, 1]) {
        garment(
          root,
          2,
          [
            [0.239, 0.101, 0.09, side * 0.219, side * 0.103],
            [0.48, 0.11, 0.105, side * 0.212, side * 0.077 + 0.025],
            [0.681, 0.132, 0.125, side * 0.173, side * 0.034],
            [0.971, 0.143, 0.133, side * 0.139],
          ],
          10,
        );
      }
      for (const side of [-1, 1]) {
        const x = side * 0.218,
          z = side * 0.1;
        surface(root, paint.blackIron, [
          [
            [x - 0.073, 0.114, z + 0.078],
            [x, 0.108, z + 0.128],
            [x + 0.079, 0.121, z + 0.08],
          ],
          [
            [x - 0.091, 0.215, z + 0.079],
            [x, 0.208, z + 0.128],
            [x + 0.097, 0.222, z + 0.082],
          ],
          [
            [x - 0.082, 0.318, z + 0.063],
            [x, 0.327, z + 0.121],
            [x + 0.082, 0.342, z + 0.058],
          ],
          [
            [x - 0.066, 0.416, z + 0.056],
            [x, 0.457, z + 0.103],
            [x + 0.074, 0.419, z + 0.055],
          ],
        ]);
      }
      garment(
        body,
        7,
        [
          [0.73, 0.335, 0.214],
          [0.91, 0.303, 0.23],
          [1.13, 0.348, 0.244],
          [1.39, 0.358, 0.244, -0.021, -0.025],
          [1.55, 0.349, 0.216, -0.025, -0.04],
          [1.68, 0.227, 0.155],
          [1.728, 0.15, 0.127],
        ],
        14,
      );
      garment(
        body,
        8,
        [
          [0.92, 0.314, 0.242],
          [1.035, 0.33, 0.243],
        ],
        14,
      );
      garment(
        body,
        14,
        [
          [1.46, 0.159, 0.19],
          [1.51, 0.357, 0.22],
          [1.58, 0.404, 0.211],
          [1.655, 0.29, 0.18],
          [1.714, 0.171, 0.14],
        ],
        14,
      );
      arm(-1, [-0.362, 1.482, 0.001], [0.18, -0.334, 0.321], 0.143, 7, [-0.086, -0.25, 0.104]);
      const grip = arm(
        1,
        [0.343, 1.463, 0.009],
        [0.064, -0.493, 0.236],
        0.139,
        7,
        [0.04, -0.275, 0.082],
      );
      pauldron(arms["arm-1"], -1);
      pauldron(arms.arm1, 1);
      garment(
        arms["arm-1"],
        14,
        [
          [-0.357, 0.074, 0.075, 0.161, 0.296],
          [-0.311, 0.094, 0.098, 0.127, 0.234],
          [-0.268, 0.099, 0.105, 0.114, 0.184],
        ],
        8,
      );
      // A dented breastplate over the jerkin, with offset rivets and hanging faulds.
      const breast: Point[][] = [
        [
          [-0.248, 1.085, 0.174],
          [-0.157, 1.073, 0.231],
          [0, 1.052, 0.253],
          [0.158, 1.09, 0.228],
          [0.243, 1.097, 0.174],
        ],
        [
          [-0.28, 1.24, 0.171],
          [-0.172, 1.246, 0.248],
          [0, 1.221, 0.279],
          [0.177, 1.253, 0.244],
          [0.272, 1.246, 0.18],
        ],
        [
          [-0.302, 1.406, 0.155],
          [-0.181, 1.417, 0.242],
          [0, 1.411, 0.287],
          [0.18, 1.416, 0.239],
          [0.288, 1.412, 0.158],
        ],
        [
          [-0.212, 1.54, 0.162],
          [-0.137, 1.572, 0.195],
          [0, 1.576, 0.242],
          [0.153, 1.565, 0.201],
          [0.209, 1.54, 0.161],
        ],
      ];
      shell(body, paint.cuirass, paint.blackIron, breast, [0, -0.004, -0.013]);
      shell(
        body,
        paint.blackIron,
        8,
        [
          [
            [-0.018, 1.064, 0.263],
            [0, 1.043, 0.277],
            [0.02, 1.067, 0.262],
          ],
          [
            [-0.023, 1.245, 0.278],
            [0, 1.249, 0.302],
            [0.023, 1.247, 0.277],
          ],
          [
            [-0.02, 1.427, 0.284],
            [0, 1.439, 0.305],
            [0.018, 1.431, 0.283],
          ],
          [
            [-0.015, 1.564, 0.244],
            [0, 1.584, 0.247],
            [0.013, 1.566, 0.243],
          ],
        ],
        [0, 0, -0.009],
      );
      for (const side of [-1, 1]) {
        for (const [y, x, z] of [
          [1.13, 0.207, 0.224],
          [1.24, 0.237, 0.227],
          [1.38, 0.255, 0.215],
          [1.5, 0.201, 0.216],
        ]) {
          oval(body, 9, [side * x, y, z], [0.013, 0.013, 0.008], 6);
        }
        const hip = joint(body, "hinged hip plates", [side * 0.137, 0.909, 0.209]);
        hip.rotation.z = side * 0.21;
        for (let row = 0; row < 3; row++) {
          const y = -row * 0.057;
          shell(
            hip,
            paint.blackIron,
            8,
            [
              [
                [-0.077, y - 0.064, 0.014],
                [0, y - 0.075, 0.041],
                [0.079, y - 0.063, 0.011],
              ],
              [
                [-0.085, y - 0.025, 0.015],
                [0, y - 0.027, 0.044],
                [0.087, y - 0.026, 0.012],
              ],
              [
                [-0.074, y + 0.019, 0.004],
                [0, y + 0.013, 0.031],
                [0.077, y + 0.018, 0.004],
              ],
            ],
            [0, 0, -0.008],
          );
        }
      }
      surface(body, paint.oldLivery, [
        [
          [-0.219, 0.421, 0.141],
          [-0.14, 0.395, 0.186],
          [-0.084, 0.46, 0.189],
        ],
        [
          [-0.245, 0.612, 0.164],
          [-0.164, 0.608, 0.203],
          [-0.051, 0.643, 0.199],
        ],
        [
          [-0.239, 0.756, 0.176],
          [-0.159, 0.747, 0.222],
          [-0.03, 0.762, 0.213],
        ],
        [
          [-0.225, 0.923, 0.169],
          [-0.147, 0.924, 0.235],
          [-0.016, 0.924, 0.245],
        ],
      ]);
      // Replacement elbow plate and a binding across the opposite arm.
      const bracer = joint(arms["arm1"], "right wrist binding", [0.016, -0.399, 0.257]);
      garment(
        bracer,
        8,
        [
          [-0.051, 0.087, 0.089],
          [0.039, 0.104, 0.1],
          [0.076, 0.1, 0.095],
        ],
        8,
      );
      strap(
        body,
        [
          [-0.225, 1.066, 0.199],
          [-0.17, 1.25, 0.26],
          [-0.112, 1.414, 0.278],
          [-0.07, 1.589, 0.218],
        ],
        0.016,
        8,
      );
      const keyRing = joint(grip, "iron key ring", [0.012, -0.137, 0.035]);
      const keyLoop: Point[][] = [0.059, 0.076].map((radius) =>
        Array.from({ length: 13 }, (_, i): Point => [
          Math.cos((i * Math.PI) / 6) * radius,
          Math.sin((i * Math.PI) / 6) * radius,
          0,
        ]),
      );
      surface(keyRing, 14, keyLoop);
      for (const x of [-0.047, 0.014, 0.057]) {
        garment(
          keyRing,
          9,
          [
            [-0.16 - Math.abs(x), 0.013, 0.007, x],
            [-0.135, 0.018, 0.009, x],
            [-0.036, 0.009, 0.009, x],
          ],
          4,
        );
      }
      head.position.set(-0.04, 1.603, 0.072);
      head.rotation.x = 0.1;
      garment(
        head,
        paint.hat,
        [
          [-0.067, 0.111, 0.108],
          [-0.016, 0.141, 0.113],
          [0.146, 0.133, 0.109],
          [0.251, 0.11, 0.097],
          [0.295, 0.078, 0.066],
          [0.315, 0.009, 0.009],
        ],
        12,
      );
      const cage = joint(head, "riveted head cage", [-0.021, 0.02, -0.009]);
      cage.rotation.z = 0.125;
      garment(
        cage,
        paint.blackIron,
        [
          [-0.031, 0.192, 0.164],
          [-0.014, 0.204, 0.168],
          [0.005, 0.195, 0.164],
        ],
        8,
      );
      garment(
        cage,
        paint.blackIron,
        [
          [0.263, 0.191, 0.158],
          [0.277, 0.198, 0.164],
          [0.3, 0.179, 0.153],
        ],
        8,
      );
      garment(
        cage,
        paint.cuirass,
        [
          [0.294, 0.181, 0.154],
          [0.324, 0.174, 0.151],
          [0.401, 0.09, 0.09],
          [0.426, 0.016, 0.017],
        ],
        8,
      );
      for (let bar = 0; bar < 9; bar++) {
        const a = ((bar - 0.5) * Math.PI * 2) / 9;
        const x = 0.181 * Math.sin(a);
        const z = 0.152 * Math.cos(a);
        garment(
          cage,
          paint.blackIron,
          [
            [0.003, 0.012, 0.011, x, z],
            [0.17, 0.012, 0.011, x * 0.97, z],
            [0.275, 0.013, 0.012, x * 0.96, z * 0.96],
          ],
          4,
        );
        oval(cage, 9, [x, 0.017, z + 0.005], [0.014, 0.015, 0.012], 6);
      }
      // The keeper carries lengths of chain, hinged cuffs and a weighted lock.
      for (let link = 0; link < 13; link++) {
        const t = link / 12;
        const x = -0.236 + t * 0.469;
        const y = 1.524 - Math.sin(t * Math.PI) * 0.48 - t * 0.115;
        const z = -0.193 - Math.sin(t * Math.PI) * 0.096;
        const iron = ironLoop(body, [x, y, z], 0.036, link % 2 ? 1.06 : 0.29);
        iron.rotation.z = 0.76 - Math.cos(t * Math.PI) * 0.88;
      }
      const cuffs = joint(body, "hanging shackles", [0.183, 0.932, -0.185]);
      cuffs.rotation.z = -0.15;
      for (let link = 0; link < 6; link++) {
        ironLoop(
          cuffs,
          [Math.sin(link * 0.7) * 0.023, -link * 0.063, 0],
          0.036,
          link % 2 ? 1.11 : 0.12,
        );
      }
      ironLoop(cuffs, [-0.048, -0.4, 0.015], 0.067, 0.21, 1.03);
      ironLoop(cuffs, [0.065, -0.442, 0.021], 0.069, 1.1, 1.02);
      garment(
        cuffs,
        paint.cuirass,
        [
          [-0.319, 0.056, 0.038],
          [-0.293, 0.063, 0.046],
          [-0.209, 0.059, 0.042],
        ],
        6,
      );
      strap(
        body,
        [
          [0.136, 0.968, -0.233],
          [0.142, 1.14, -0.25],
          [0.18, 1.397, -0.226],
          [0.23, 1.547, -0.178],
        ],
        0.032,
        8,
      );
      break;
    }
    case "apothecary": {
      boots(0.107, 0.237, 0.074, -0.036);
      spats(0.107, -0.036, 0.164, 0.297, 0.073, paint.veilLining);
      for (const side of [-1, 1]) {
        garment(
          root,
          2,
          [
            [0.195, 0.063, 0.067, side * 0.106, -side * 0.036],
            [0.38, 0.083, 0.088, side * 0.105, -side * 0.025],
            [0.692, 0.103, 0.107, side * 0.097],
          ],
          9,
        );
      }

      garment(
        body,
        paint.medicCoat,
        [
          [0.64, 0.19, 0.148],
          [0.76, 0.225, 0.156],
          [0.91, 0.207, 0.162],
          [1.08, 0.204, 0.165, 0, 0.016],
          [1.21, 0.21, 0.167, -0.016, 0.052],
          [1.303, 0.137, 0.111, -0.017, 0.113],
          [1.34, 0.102, 0.094, -0.029, 0.145],
        ],
        14,
      );
      // Split coat panels flare back from the knees, with a different fall on either side.
      const skirt: Section[] = [
        [0.284, 0.26, 0.17, -0.019, -0.071],
        [0.416, 0.255, 0.17, -0.016, -0.051],
        [0.554, 0.225, 0.165, -0.01, -0.027],
        [0.711, 0.208, 0.158],
        [0.834, 0.22, 0.161],
      ];
      for (const side of [-1, 1]) {
        shell(
          body,
          paint.medicCoat,
          paint.medicHood,
          skirt.map(([y, w, d, x = 0, z = 0], row) =>
            Array.from({ length: 10 }, (_, column): Point => {
              const step = (side === 1 ? column : 9 - column) / 9;
              const angle = side * (0.28 + step * 2.91);
              const fold = (4 - row) * 0.004 * Math.sin(step * 20 + side);
              return [
                x + Math.sin(angle) * (w + fold),
                y + (row < 2 ? 0.055 * Math.sin(step * 7 + side) : 0) + side * (4 - row) * 0.009,
                z + Math.cos(angle) * (d + fold),
              ];
            }),
          ),
          [0, 0.005, -0.008],
        );
      }
      surface(body, paint.graveLeather, [
        [
          [-0.132, 0.393, 0.117],
          [-0.019, 0.36, 0.15],
          [0.106, 0.42, 0.127],
        ],
        [
          [-0.154, 0.59, 0.108],
          [-0.02, 0.574, 0.159],
          [0.124, 0.6, 0.119],
        ],
        [
          [-0.146, 0.798, 0.121],
          [-0.018, 0.795, 0.166],
          [0.13, 0.8, 0.13],
        ],
        [
          [-0.099, 1.083, 0.154],
          [-0.006, 1.079, 0.192],
          [0.108, 1.066, 0.165],
        ],
      ]);
      garment(
        body,
        8,
        [
          [0.788, 0.215, 0.168],
          [0.824, 0.219, 0.169],
        ],
        12,
      );
      strap(
        body,
        [
          [-0.18, 0.82, 0.127],
          [-0.087, 0.929, 0.171],
          [0.024, 1.04, 0.184],
          [0.107, 1.14, 0.173],
          [0.146, 1.252, 0.155],
        ],
        0.016,
        8,
      );

      // Five labeled tinctures are held in a leather carrier over the near hip.
      const bottles = joint(body, "tincture bandolier", [-0.126, 0.861, 0.163]);
      bottles.rotation.z = -0.31;
      garment(
        bottles,
        8,
        [
          [-0.05, 0.109, 0.025],
          [-0.02, 0.119, 0.049],
          [0.039, 0.119, 0.044],
        ],
        8,
      );
      for (const [index, x] of [-0.093, -0.047, 0.002, 0.049, 0.096].entries()) {
        const h = 0.065 + ((index * 3) % 4) * 0.015;
        const vial = joint(bottles, "labeled tincture", [x, 0.014, 0.029 - Math.abs(x) * 0.11]);
        garment(
          vial,
          paint.labeledGlass,
          [
            [-0.021, 0.012, 0.012],
            [-0.006, 0.02, 0.019],
            [h * 0.57, 0.019, 0.019],
            [h * 0.76, 0.012, 0.012],
            [h, 0.01, 0.011],
          ],
          6,
        );
        garment(
          vial,
          paint.graveLeather,
          [
            [h - 0.004, 0.014, 0.013],
            [h + 0.014, 0.014, 0.012],
          ],
          6,
        );
      }
      oval(body, paint.graveLeather, [0.179, 0.683, -0.075], [0.106, 0.124, 0.069], 8);

      arm(-1, [-0.19, 1.182, 0.037], [-0.085, -0.49, -0.018], 0.077, paint.medicCoat);
      const grip = arm(
        1,
        [0.183, 1.175, 0.056],
        [-0.112, -0.251, 0.271],
        0.084,
        paint.medicCoat,
        [0.042, -0.301, 0.094],
      );
      const mortar = joint(grip, "stone mortar", [0.009, -0.057, 0.056]);
      mortar.rotation.z = 0.095;
      garment(
        mortar,
        paint.spade,
        [
          [-0.062, 0.041, 0.037],
          [-0.052, 0.059, 0.052],
          [-0.027, 0.083, 0.074],
          [0.015, 0.096, 0.086],
          [0.03, 0.093, 0.083],
          [0.033, 0.077, 0.071],
          [0.023, 0.073, 0.067],
          [0.003, 0.052, 0.045],
          [-0.012, 0.005, 0.005],
        ],
        10,
      );
      const pestle = joint(mortar, "pestle", [0.013, 0.012, 0.004]);
      pestle.rotation.set(-0.48, 0.19, -0.57);
      garment(
        pestle,
        paint.veilLining,
        [
          [0, 0.025, 0.023],
          [0.027, 0.03, 0.024],
          [0.107, 0.016, 0.016],
          [0.135, 0.013, 0.012],
        ],
        7,
      );

      // A buckled medicine pouch and dried herbs hang off the back of the belt.
      oval(body, paint.graveLeather, [-0.133, 0.734, -0.163], [0.114, 0.119, 0.064], 8);
      const herbs = joint(body, "dried herb bundle", [0.093, 0.734, -0.178]);
      herbs.rotation.z = 0.32;
      for (const x of [-0.053, -0.017, 0.025, 0.053]) {
        garment(
          herbs,
          paint.labeledGlass,
          [
            [-0.186 - Math.abs(x) * 0.58, 0.005, 0.006, x * 1.37],
            [-0.127, 0.024, 0.014, x * 1.21],
            [-0.069, 0.017, 0.015, x],
            [0.06, 0.006, 0.009, x * 0.67],
          ],
          5,
        );
      }
      garment(
        herbs,
        8,
        [
          [0.019, 0.055, 0.029],
          [0.043, 0.051, 0.03],
        ],
        8,
      );

      surface(body, paint.medicHood, [
        [
          [-0.205, 1.102, -0.023],
          [-0.188, 1.164, 0.104],
          [-0.13, 1.191, 0.156],
          [-0.081, 1.172, 0.172],
        ],
        [
          [-0.169, 1.209, -0.039],
          [-0.182, 1.225, 0.059],
          [-0.133, 1.224, 0.13],
          [-0.075, 1.239, 0.174],
        ],
        [
          [-0.092, 1.36, -0.022],
          [-0.113, 1.375, 0.031],
          [-0.089, 1.358, 0.094],
          [-0.058, 1.351, 0.142],
        ],
      ]);
      surface(body, paint.medicHood, [
        [
          [0.065, 1.121, 0.182],
          [0.137, 1.106, 0.155],
          [0.187, 1.07, 0.072],
          [0.201, 1.147, -0.082],
        ],
        [
          [0.04, 1.241, 0.181],
          [0.093, 1.234, 0.151],
          [0.133, 1.229, 0.043],
          [0.147, 1.241, -0.081],
        ],
        [
          [0.017, 1.342, 0.133],
          [0.064, 1.342, 0.121],
          [0.075, 1.357, 0.024],
          [0.049, 1.358, -0.051],
        ],
      ]);
      // A pale, frayed neck stock breaks the mask away from the dense wool.
      garment(
        body,
        paint.veilLining,
        [
          [1.173, 0.103, 0.106, -0.026, 0.1],
          [1.197, 0.121, 0.114, -0.027, 0.113],
          [1.237, 0.111, 0.109, -0.033, 0.122],
          [1.257, 0.087, 0.095, -0.034, 0.135],
        ],
        12,
        ([x, y, z], angle, row) => [x, y + Math.sin(angle * 3) * 0.007 * (row === 0 ? 1 : 0.5), z],
      );
      // Soot-colored hood and long pointed leather facepiece.
      head.position.set(-0.033, 1.235, 0.124);
      head.rotation.set(0.315, -0.115, -0.063);
      garment(
        head,
        paint.hat,
        [
          [-0.086, 0.114, 0.105, 0, -0.059],
          [-0.014, 0.139, 0.114, 0, -0.038],
          [0.094, 0.126, 0.11, 0, -0.027],
          [0.179, 0.109, 0.116, 0, -0.035],
          [0.249, 0.091, 0.092, -0.02, -0.052],
          [0.28, 0.065, 0.051, -0.029, -0.061],
          [0.318, 0.009, 0.011, -0.056, -0.081],
        ],
        14,
      );
      const mask: Point[][] = [
        [
          [-0.082, 0.003, 0.071],
          [-0.045, -0.033, 0.112],
          [-0.018, -0.063, 0.208],
          [0, -0.078, 0.251],
          [0.015, -0.058, 0.224],
          [0.044, -0.032, 0.112],
          [0.082, 0.004, 0.07],
        ],
        [
          [-0.099, 0.047, 0.064],
          [-0.066, 0.048, 0.12],
          [-0.034, 0.008, 0.199],
          [0, -0.041, 0.265],
          [0.036, 0.01, 0.187],
          [0.061, 0.036, 0.136],
          [0.094, 0.051, 0.072],
        ],
        [
          [-0.097, 0.094, 0.065],
          [-0.055, 0.102, 0.129],
          [-0.031, 0.074, 0.156],
          [0, 0.046, 0.216],
          [0.032, 0.064, 0.16],
          [0.054, 0.098, 0.134],
          [0.095, 0.094, 0.06],
        ],
        [
          [-0.086, 0.128, 0.062],
          [-0.054, 0.139, 0.117],
          [-0.028, 0.144, 0.125],
          [0, 0.125, 0.143],
          [0.029, 0.14, 0.122],
          [0.055, 0.135, 0.118],
          [0.084, 0.129, 0.061],
        ],
        [
          [-0.071, 0.154, 0.055],
          [-0.047, 0.184, 0.095],
          [-0.024, 0.185, 0.102],
          [0, 0.181, 0.118],
          [0.024, 0.179, 0.1],
          [0.05, 0.172, 0.09],
          [0.067, 0.151, 0.053],
        ],
      ];
      shell(head, paint.veilLining, paint.medicHood, mask, [0, 0.005, -0.013]);
      for (const x of [-0.054, 0.054]) {
        oval(head, 9, [x, 0.1, 0.115], [0.028, 0.033, 0.016], 8);
        oval(head, paint.blackIron, [x, 0.102, 0.131], [0.02, 0.024, 0.01], 8);
      }
      strap(
        head,
        [
          [-0.01, -0.058, 0.246],
          [-0.005, 0.018, 0.23],
          [0, 0.092, 0.149],
        ],
        0.005,
        8,
      );
      break;
    }
  }

  const joints: Record<string, Group> = { body, head, scarf, ...arms };
  return joints;
}
