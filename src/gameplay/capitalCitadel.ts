import type { ParishPoint } from "./ashenParish.ts";
import { octagon, type CapitalBuilder, type CapitalMaterial } from "./capitalKitLevel.ts";

/** A stone arch with an inset face; the inset follows the curve instead of a rectangle. */
export function citadelArch(
  b: CapitalBuilder,
  position: ParishPoint,
  width: number,
  height: number,
  yaw = 0,
  inset: CapitalMaterial = "shadow",
) {
  const [x, y, z] = position;
  b.piece("arch-panel", [width - 0.3, height - 0.2, 0.08], [x, y + 0.1, z], yaw, inset);
  b.piece(
    "arch-window",
    [width, height, 0.3],
    [x + Math.sin(yaw) * 0.08, y, z + Math.cos(yaw) * 0.08],
    yaw,
    "trim",
    0.18,
  );
}

/** The tower stands beside the court, with diminishing octagonal stages and open lanterns. */
export function authorWhiteTower(b: CapitalBuilder, [x, y, z]: ParishPoint) {
  b.mass(octagon(x, z, 4.2), y - 15, y, "wall");
  b.mass(octagon(x, z, 4), y, y + 1.2, "trim");
  const stages = [
    { bottom: 1.2, height: 20, radius: 3.3 },
    { bottom: 23.2, height: 19, radius: 2.8 },
    { bottom: 44.2, height: 10.8, radius: 2.35 },
    { bottom: 57, height: 10, radius: 1.75 },
  ];
  for (const [index, stage] of stages.entries()) {
    const bottom = y + stage.bottom,
      top = bottom + stage.height;
    b.mass(octagon(x, z, stage.radius), bottom, top, "wall");
    b.mass(octagon(x, z, stage.radius + 0.2), top - 0.45, top + 0.2, "trim");
    const next = stages[index + 1];
    if (next)
      b.piece(
        "tapered-drum",
        [stage.radius * 2, next.bottom - stage.bottom - stage.height, stage.radius * 2],
        [x, top, z],
        0,
        "wall",
        next.radius / stage.radius,
      );
    for (let i = 0; i < 8; i++) {
      const angle = (i * Math.PI) / 4,
        face = stage.radius * Math.cos(Math.PI / 8) + 0.04;
      for (let dy = 1.4; dy < stage.height - 3; dy += 6.5) {
        citadelArch(
          b,
          [x + Math.sin(angle) * face, bottom + dy, z + Math.cos(angle) * face],
          stage.radius * 0.38,
          Math.min(4.9, stage.height - dy - 0.8),
          angle,
          "recess",
        );
      }
      const corner = angle + Math.PI / 8;
      b.piece(
        "pillar",
        [0.24, stage.height, 0.24],
        [x + Math.sin(corner) * stage.radius, bottom, z + Math.cos(corner) * stage.radius],
        corner,
        "trim",
      );
    }
  }
  const lantern = (bottom: number, radius: number, height: number) => {
    b.mass(octagon(x, z, radius + 0.2), y + bottom, y + bottom + 0.45, "trim");
    for (let i = 0; i < 8; i++) {
      const angle = (i * Math.PI) / 4;
      b.piece(
        "pillar",
        [0.35, height, 0.35],
        [x + Math.sin(angle) * radius, y + bottom + 0.45, z + Math.cos(angle) * radius],
        angle,
        "trim",
      );
    }
    b.mass(octagon(x, z, radius + 0.2), y + bottom + height, y + bottom + height + 0.4, "trim");
  };
  lantern(67.2, 1.4, 4.6);
  b.piece("tapered-drum", [3.1, 9.4, 3.1], [x, y + 72.2, z], 0, "trim", 0.05);
  b.piece("tapered-drum", [0.65, 2.4, 0.65], [x, y + 81.4, z], 0, "trim", 0.02);
}

/** One lawn circle split by a stone cross, with a branched White Tree at its centre. */
export function authorFountainCourt(b: CapitalBuilder, [x, y, z]: ParishPoint) {
  b.piece("drum", [35, 0.035, 35], [x, y, z], 0, "trim");
  for (let i = 0; i < 4; i++) {
    b.piece("lawn-quadrant", [32, 0.05, 32], [x, y + 0.035, z], (i * Math.PI) / 2, "hedge", 1.45);
  }
  b.piece("ring", [5.4, 0.4, 5.4], [x, y + 0.035, z], 0, "trim", 0.38);
  for (let i = 0; i < 24; i++) {
    const angle = (i * Math.PI) / 12;
    b.solid([x + Math.sin(angle) * 2.51, y, z + Math.cos(angle) * 2.51], [0.66, 0.44, 0.38], angle);
  }
  b.piece("drum", [4.65, 0.04, 4.65], [x, y + 0.2, z], 0, "water");
  b.piece("bare-tree", [8.5, 9.3, 8.5], [x, y + 0.22, z], 0.2, "bark");
  b.solid([x - 0.25, y, z], [1.25, 4.5, 1.2]);
  // Benches sit beside the paths, leaving their full width clear.
  for (const side of [-1, 1]) {
    b.box(x + side * 5.2, z + 1.15, y + 0.45, [2.6, 0.18, 0.65], 0, "trim", false);
    for (const dx of [-0.9, 0.9])
      b.box(x + side * 5.2 + dx, z + 1.15, y, [0.25, 0.45, 0.55], 0, "trim", false);
  }
  // A shallow ceremonial dais at the mouth of the prow, reached by three steps.
  b.flight("court-dais-stair", "kiln", [x, y, z + 14.7], [0, 1], 0.6, 3.2, { fill: y });
  b.rect("court-dais", "kiln", x - 1.6, z + 15.6, x + 1.6, z + 17.9, y + 0.6, { material: "trim" });
  for (const side of [-1, 1]) {
    b.box(x + side * 3.4, z + 17, y, [1.05, 1, 1.05], 0, "trim");
    b.piece(
      "sentinel-statue",
      [1.5, 3, 1.25],
      [x + side * 3.4, y + 1, z + 17],
      side * -0.15,
      "trim",
    );
  }
}

/** A gabled throne hall with lower aisles and tall buttress turrets around its edges. */
export function dressCitadelPalace(b: CapitalBuilder, y: number, front: number, back: number) {
  const middle = (front + back) / 2,
    length = front - back,
    hallBack = front - 25,
    hallMiddle = (front + hallBack) / 2,
    face = front + 0.44;
  // A low nave recedes behind the prominent, raised central hall.
  b.box(0, middle, y + 20, [33, 0.5, length + 1], 0, "trim", false);
  b.piece("roof", [length, 3.8, 33], [0, y + 20.5, middle], Math.PI / 2, "roof", 0.4);
  b.box(0, hallMiddle, y + 20.5, [18, 6.5, 25], 0, "wall", false);
  b.piece("roof", [24.4, 6.5, 18.6], [0, y + 27, hallMiddle], Math.PI / 2, "roof", 0.4);
  b.box(0, hallMiddle, y + 33.5, [0.55, 0.4, 26.5], 0, "trim", false);
  for (const z of [front + 0.4, hallBack - 0.4]) {
    b.piece("gable-panel", [19.4, 7, 0.65], [0, y + 27, z], 0, "wall");
    b.box(0, z, y + 26.65, [19.6, 0.4, 0.75], 0, "trim", false);
  }
  // The front gable is solid masonry with one tall, narrow recess.
  citadelArch(b, [0, y + 27.5, front + 0.8], 1.2, 3.5, 0, "recess");
  b.box(0, face, y + 20.2, [32.6, 0.4, 0.7], 0, "trim", false);
  b.box(0, face, y + 8, [32.4, 0.35, 0.55], 0, "trim", false);
  b.box(0, face, y + 17.3, [32.4, 0.35, 0.55], 0, "trim", false);
  for (let x = -14.3; x <= 14.3; x += 1.3)
    b.piece("arch-panel", [0.42, 1.1, 0.08], [x, y + 18.1, face + 0.05], 0, "recess");
  for (const x of [-11.4, -4.8, 4.8, 11.4]) {
    citadelArch(b, [x, y + 1, face], 3.5, 5.8, 0, "recess");
    citadelArch(b, [x, y + 9.2, face], 3.5, 6.8, 0, "recess");
  }
  citadelArch(b, [0, y + 10.1, face], 4.5, 5.9, 0, "recess");
  b.piece("bridge-arch", [7.6, 6.4, 0.55], [0, y, face + 0.12], 0, "trim", 0.8);
  for (const x of [-16, -13.7, -8.9, -2.5, 2.5, 8.9, 13.7, 16])
    b.box(x, face + 0.12, y, [0.4, 20.2, 0.5], 0, "trim", false);
  // Turret shafts are part of the facade, rather than small ornaments on the roof.
  for (const x of [-15.2, -8.7, 8.7, 15.2]) turret(x, front + 0.35, Math.abs(x) < 10 ? 22 : 20);
  for (const side of [-1, 1]) {
    for (const z of [front - 10.5, front - 22]) turret(side * 15.2, z, 20);
    for (let z = back + 4; z < front - 3; z += 6.5) {
      b.box(side * 16.5, z, y, [0.5, 20.2, 0.65], 0, "trim", false);
      citadelArch(b, [side * 16.5, y + 10.5, z + 2.2], 2, 5.5, (side * Math.PI) / 2, "recess");
    }
    for (let z = hallBack + 3; z < front - 2; z += 4.5)
      citadelArch(b, [side * 9.05, y + 23, z], 1, 2.7, (side * Math.PI) / 2, "recess");
  }

  function turret(x: number, z: number, crown: number) {
    b.piece("pillar", [1.4, crown - 4, 1.4], [x, y, z], 0, "trim");
    b.piece("tapered-drum", [1.5, 1.3, 1.5], [x, y + crown - 4, z], 0, "trim", 1.8);
    b.piece("pillar", [2.8, 2.8, 2.8], [x, y + crown - 2.7, z], 0, "wall");
    for (const side of [-1, 1])
      for (const dx of [-0.65, 0, 0.65])
        b.piece(
          "arch-panel",
          [0.25, 1.65, 0.07],
          [x + dx, y + crown - 2.2, z + side * 1.08],
          side > 0 ? 0 : Math.PI,
          "recess",
        );
    b.piece("drum", [3.2, 0.35, 3.2], [x, y + crown + 0.1, z], 0, "trim");
    for (const dx of [-0.87, 0.87])
      for (const dz of [-0.87, 0.87])
        b.piece("pillar", [0.23, 1.8, 0.23], [x + dx, y + crown + 0.45, z + dz], 0, "trim");
    b.piece("drum", [2.8, 0.25, 2.8], [x, y + crown + 2.25, z], 0, "trim");
    b.piece("dome", [2.8, 1.4, 2.8], [x, y + crown + 2.5, z], 0, "trim");
  }
}

/** Rear side wings frame the lawn; the front half of the court remains open. */
export function authorCourtWings(b: CapitalBuilder, y: number) {
  for (const side of [-1, 1]) {
    const x = side * 21,
      z0 = side < 0 ? -9 : -11,
      z1 = 2,
      middle = (z0 + z1) / 2,
      outline = (a: number, c: number) =>
        [
          [x - 3, a],
          [x - 3, c],
          [x + 3, c],
          [x + 3, a],
        ] as const;
    if (side < 0) {
      // The upper city stair enters the court through this wing, as an arched gate.
      b.mass([...outline(z0, -4.3)], y - 1, y + 7.5, "wall");
      b.mass([...outline(0.3, z1)], y - 1, y + 7.5, "wall");
      b.mass([...outline(-4.3, 0.3)], y + 5.2, y + 7.5, "wall");
      b.rect("court-west-wing-passage", "kiln", x - 9, -4.3, x + 5, 0.3, y, { thickness: 0.3 });
      for (const edge of [-1, 1])
        b.piece(
          "bridge-arch",
          [5.2, 5.5, 0.45],
          [x + edge * 3.05, y, -2],
          Math.PI / 2,
          "trim",
          0.3,
        );
    } else b.mass([...outline(z0, z1)], y - 1, y + 7.5, "wall");
    b.piece("roof", [z1 - z0 + 0.4, 3.1, 6.4], [x, y + 7.5, middle], Math.PI / 2, "roof", 0.35);
    b.box(x, middle, y + 7.2, [6.5, 0.35, z1 - z0 + 0.6], 0, "trim", false);
    for (let z = z0 + 1.8; z < z1 - 1; z += 2.8) {
      if (side < 0 && z > -5.2 && z < 1.2) continue;
      citadelArch(b, [side * 17.9, y + 1.1, z], 1.5, 4.9, (-side * Math.PI) / 2, "recess");
      b.box(side * 17.8, z + 1.2, y, [0.35, 7.5, 0.4], 0, "trim", false);
    }
    const end = z1 - 0.2;
    b.mass(octagon(x, end, 2.15), y, y + 10.2, "wall");
    b.piece("tapered-drum", [4.3, 1.2, 4.3], [x, y + 10.2, end], 0, "trim", 0.75);
    b.piece("dome", [3.4, 2.2, 3.4], [x, y + 11.4, end], 0, "roof");
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      citadelArch(
        b,
        [x + Math.sin(a) * 2.02, y + 6.5, end + Math.cos(a) * 2.02],
        0.65,
        2.5,
        a,
        "recess",
      );
    }
  }
}
