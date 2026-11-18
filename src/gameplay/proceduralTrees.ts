export type TreeKind = "broad" | "spreading" | "evergreen" | "young";
export type TreeVariant = "day" | "halloween";
export type Point = [number, number, number];

export type TreeLobe = { center: Point; radius: Point; seed: number };
export type TreeSegment = { from: Point; to: Point; baseRadius: number; tipRadius: number };
export type TreeBlueprint = {
  foliage: TreeLobe[];
  wood: TreeSegment[];
  trunkRadius: number;
};
export type TreeShape = {
  spread: number;
  height: number;
  clusterSize: number;
  density: number;
};

export const defaultTreeShape: TreeShape = {
  spread: 1,
  height: 1,
  clusterSize: 1,
  density: 1,
};

type CrownProfile = {
  width: number;
  depth: number;
  crownY: number;
  crownHeight: number;
  coreRadius: Point;
  trunkRadius: number;
  ringCount: number;
  lowerCount: number;
};

// These parameters describe species, not individual branch or leaf positions.
const profiles: Record<TreeKind, CrownProfile> = {
  broad: {
    width: 4.1,
    depth: 3.65,
    crownY: 7,
    crownHeight: 3.2,
    coreRadius: [2.1, 2, 1.9],
    trunkRadius: 0.52,
    ringCount: 7,
    lowerCount: 3,
  },
  spreading: {
    width: 4.7,
    depth: 3.3,
    crownY: 7,
    crownHeight: 2.8,
    coreRadius: [2.4, 1.4, 1.8],
    trunkRadius: 0.48,
    ringCount: 8,
    lowerCount: 3,
  },
  evergreen: {
    width: 1.6,
    depth: 1.6,
    crownY: 7.5,
    crownHeight: 5.4,
    coreRadius: [0.7, 4.7, 0.7],
    trunkRadius: 0.4,
    ringCount: 0,
    lowerCount: 0,
  },
  young: {
    width: 2.7,
    depth: 2.55,
    crownY: 5.8,
    crownHeight: 2.5,
    coreRadius: [1.2, 1.25, 1.1],
    trunkRadius: 0.34,
    ringCount: 5,
    lowerCount: 2,
  },
};

function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function between(random: () => number, min: number, max: number) {
  return min + random() * (max - min);
}

function limb(from: Point, to: Point, baseRadius: number, tipRadius: number): TreeSegment {
  return { from: [...from], to: [...to], baseRadius, tipRadius };
}

export function createTreeBlueprint(
  kind: TreeKind,
  seed: number,
  variant: TreeVariant = "day",
  options: Partial<TreeShape> = {},
): TreeBlueprint {
  const shape = { ...defaultTreeShape, ...options };
  const profile = profiles[kind];
  const random = seededRandom(seed);
  const foliage: TreeLobe[] = [];
  const wood: TreeSegment[] = [];
  const swayX = between(random, -0.23, 0.23);
  const swayZ = between(random, -0.23, 0.23);
  const shoulderY = kind === "evergreen" ? 5.7 : profile.crownY - 1.5;
  const trunkTop: Point = [
    swayX * 1.8,
    kind === "evergreen" ? 11.2 : profile.crownY + 0.5,
    swayZ * 1.8,
  ];

  wood.push(
    limb([0, 0, 0], [swayX, shoulderY, swayZ], profile.trunkRadius, profile.trunkRadius * 0.53),
  );
  wood.push(
    limb(
      [swayX, shoulderY, swayZ],
      trunkTop,
      profile.trunkRadius * 0.53,
      profile.trunkRadius * 0.2,
    ),
  );

  foliage.push({
    center: [swayX, profile.crownY, swayZ],
    radius: profile.coreRadius,
    seed: between(random, 0, 100),
  });

  if (kind === "evergreen") {
    // Staggered whorls wrap all the way around the stem. Their taper makes the
    // crown read as an evergreen from the back and either side as well.
    const tiers = [
      { y: 4.2, count: 4, spread: 1.6, radius: 1.38 },
      { y: 6.6, count: 4, spread: 1.28, radius: 1.2 },
      { y: 8.9, count: 3, spread: 0.96, radius: 1.02 },
      { y: 11, count: 3, spread: 0.6, radius: 0.8 },
    ];
    for (let tierIndex = 0; tierIndex < tiers.length; tierIndex++) {
      const tier = tiers[tierIndex];
      const phase = random() * Math.PI * 2;
      const count = Math.max(2, Math.round(tier.count * shape.density));
      for (let i = 0; i < count; i++) {
        const angle = phase + (i / count) * Math.PI * 2 + between(random, -0.16, 0.16);
        const radial = tier.spread * between(random, 0.84, 1.16);
        const center: Point = [
          swayX + Math.cos(angle) * radial,
          tier.y + between(random, -0.27, 0.27),
          swayZ + Math.sin(angle) * radial,
        ];
        foliage.push({
          center,
          radius: [
            tier.radius * between(random, 0.9, 1.1),
            (tierIndex === 3 ? 1.2 : 1.35) * between(random, 0.9, 1.1),
            tier.radius * between(random, 0.9, 1.1),
          ],
          seed: between(random, 0, 100),
        });
        wood.push(limb([swayX, tier.y - 0.7, swayZ], center, 0.13, 0.035));
      }
    }
  } else {
    const phase = between(random, 0, Math.PI * 2);
    const rings = [
      {
        count: profile.ringCount,
        radial: kind === "spreading" ? 0.82 : 0.75,
        y: 0,
        lobeSize: kind === "young" ? 0.43 : 0.46,
      },
      { count: profile.lowerCount, radial: 0.66, y: -1.25, lobeSize: 0.38 },
      {
        count: kind === "young" ? 2 : 4,
        radial: 0.43,
        y: kind === "young" ? 1.25 : kind === "spreading" ? 1.25 : 1.8,
        lobeSize: kind === "spreading" ? 0.35 : 0.42,
      },
    ];
    for (let ringIndex = 0; ringIndex < rings.length; ringIndex++) {
      const ring = rings[ringIndex];
      const count = Math.max(2, Math.round(ring.count * shape.density));
      for (let i = 0; i < count; i++) {
        const angle = phase + ((i + ringIndex * 0.5) / count) * Math.PI * 2;
        const radial = between(random, 0.86, 1.12) * ring.radial;
        const center: Point = [
          swayX + Math.cos(angle) * profile.width * radial,
          profile.crownY +
            ring.y +
            between(
              random,
              kind === "spreading" ? -0.46 : -0.78,
              kind === "spreading" ? 0.46 : 0.78,
            ),
          swayZ + Math.sin(angle) * profile.depth * radial,
        ];
        const size = ring.lobeSize * between(random, 0.86, 1.14);
        foliage.push({
          center,
          radius: [
            profile.width * size,
            profile.crownHeight * size * between(random, 1.12, 1.37),
            profile.depth * size,
          ],
          seed: between(random, 0, 100),
        });
        const anchor: Point = [
          swayX,
          shoulderY + (ringIndex === 1 ? -0.75 : ringIndex === 2 ? 0.5 : -0.15),
          swayZ,
        ];
        const elbow: Point = [
          swayX + (center[0] - swayX) * 0.54,
          anchor[1] + (center[1] - anchor[1]) * 0.68 + 0.2,
          swayZ + (center[2] - swayZ) * 0.54,
        ];
        const baseRadius = profile.trunkRadius * (ringIndex === 0 ? 0.38 : 0.23);
        wood.push(limb(anchor, elbow, baseRadius, baseRadius * 0.58));
        wood.push(limb(elbow, center, baseRadius * 0.58, profile.trunkRadius * 0.09));
      }
    }
  }

  if (variant === "halloween") {
    // Bare tips emerge from different compass directions, with the same seed
    // retaining the underlying daytime crown and branching structure.
    const outerCount = Math.max(
      2,
      Math.round((kind === "evergreen" ? 4 : profile.ringCount) * shape.density),
    );
    const twigCount = Math.min(kind === "evergreen" ? 3 : 4, outerCount);
    for (let i = 0; i < twigCount; i++) {
      const lobeIndex = 1 + Math.floor((i * outerCount) / twigCount);
      const source = foliage[lobeIndex].center;
      const angle = Math.atan2(source[2] - swayZ, source[0] - swayX);
      const outward = kind === "evergreen" ? 1.15 : 1.85;
      const start: Point = [source[0], source[1] + 0.05, source[2]];
      const elbow: Point = [
        source[0] + Math.cos(angle) * outward,
        source[1] + between(random, 1.25, 1.8),
        source[2] + Math.sin(angle) * outward,
      ];
      const tip: Point = [
        elbow[0] + Math.cos(angle + between(random, -0.45, 0.45)) * outward * 0.72,
        elbow[1] + between(random, 1.3, 1.9),
        elbow[2] + Math.sin(angle + between(random, -0.45, 0.45)) * outward * 0.72,
      ];
      wood.push(limb(start, elbow, 0.13, 0.065));
      wood.push(limb(elbow, tip, 0.065, 0.012));
    }
  }

  for (const lobe of foliage) {
    lobe.center[0] *= shape.spread;
    lobe.center[1] *= shape.height;
    lobe.center[2] *= shape.spread;
    lobe.radius[0] *= shape.spread * shape.clusterSize;
    lobe.radius[1] *= shape.height * shape.clusterSize;
    lobe.radius[2] *= shape.spread * shape.clusterSize;
  }
  for (const segment of wood) {
    for (const point of [segment.from, segment.to]) {
      point[0] *= shape.spread;
      point[1] *= shape.height;
      point[2] *= shape.spread;
    }
  }

  return { foliage, wood, trunkRadius: profile.trunkRadius };
}
