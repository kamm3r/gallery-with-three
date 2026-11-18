import { Euler, Vector3 } from "three";
import obstacleDefinitions from "./playgroundObstacles.json" with { type: "json" };
import {
  SLOPE_ANGLES,
  parkBallPit,
  parkBridge,
  parkDominoes,
  parkLabels,
  parkPushables,
} from "./collisionCourse.ts";

type Vec3 = [number, number, number];
type Transform = { position: Vec3; rotation: Vec3; scale: Vec3 };

export const slug = (text: string) =>
  text
    .toLowerCase()
    .replace(/°/g, "deg")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

export const structureId = (zone: string, part: string) => `zone-${zone}-${slug(part)}`;

const obstacles = obstacleDefinitions as Array<{
  id: string;
  zone: string;
  part?: string;
  position: number[];
}>;

/**
 * Where each group sits on the ground. Course content is authored in world
 * coordinates; a group listed here is placed at its origin and its children
 * are stored relative to it, so the group's Transform is a real pivot.
 *
 * Origins are anchors, not live centres: a zone uses its floor label and a
 * structure its first piece, so appending pieces never shifts saved children.
 */
const origins: Record<string, Vec3> = {
  "zone-trees": [26, 0, 54],
  pushables: [parkPushables[0].position[0], 0, parkPushables[0].position[2]],
  dominoes: [parkDominoes[0].position[0], 0, parkDominoes[0].position[2]],
  "ball-pit-balls": [parkBallPit.center[0], 0, parkBallPit.center[2]],
  bridge: [parkBridge.x, 0, (parkBridge.deckA[2] + parkBridge.deckB[2]) / 2],
};
for (const { zone, position } of parkLabels)
  if (zone) origins[`zone-${zone}`] ??= [position[0], 0, position[2]];

const parents: Record<string, string> = {
  terrain: "zone-terrain",
  "platform-disc": "zone-kinematic",
  "platform-elevator-low": "zone-kinematic",
  "platform-shuttle-x": "zone-kinematic",
  "platform-shuttle-z": "zone-kinematic",
  "platform-tilt": "zone-kinematic",
  "platform-orbit": "zone-kinematic",
  "crate-on-step": structureId("pushables", "Crate on a step"),
  seesaw: structureId("pushables", "Seesaw"),
  pushables: "zone-pushables",
  "platform-sweeper": "zone-sweeper",
  bridge: "zone-bridge",
  "platform-crusher": structureId("platform-edges", "Crusher"),
  "platform-scraper": structureId("platform-edges", "Wall scraper"),
  "platform-fast-elevator": "zone-platform-edges",
  dominoes: "zone-physics-props",
  "ball-pit-balls": structureId("physics-props", "Ball pit"),
};
SLOPE_ANGLES.forEach((degrees, index) => {
  parents[`zone-strip-${index}`] = structureId("slopes", `Lane ${degrees}°`);
});
for (const { id, zone, part, position } of obstacles) {
  if (!part) {
    parents[id] = `zone-${zone}`;
    continue;
  }
  const structure = structureId(zone, part);
  parents[id] = structure;
  parents[structure] = `zone-${zone}`;
  origins[structure] ??= [position[0], 0, position[2]];
}
const parentPrefixes: Array<[string, string]> = [
  ["pushable-", "pushables"],
  ["one-way-", "zone-one-way"],
  ["jump-pad-", "zone-jump-pads"],
  ["super-pad-", "zone-tunnelling"],
  ["tree-", "zone-trees"],
];

/** The ground origin of a group, if it has one. */
export function groupOrigin(id: string): Vec3 | undefined {
  return Object.hasOwn(origins, id) ? origins[id] : undefined;
}

function parentOf(id: string) {
  if (Object.hasOwn(parents, id)) return parents[id];
  return parentPrefixes.find(([prefix]) => id.startsWith(prefix))?.[1];
}

/**
 * Version-2 scenes stored transforms as if every group sat at the world
 * origin. Re-express one in the frame of its positioned parent, keeping the
 * node (and, for a group, all of its children) exactly where it was.
 */
export function rebaseLegacyTransform(id: string, transform: Transform): Transform {
  const own = groupOrigin(id);
  const parent = groupOrigin(parentOf(id) ?? "");
  if (!own && !parent) return transform;
  const position = new Vector3(...transform.position);
  if (own)
    position.add(
      new Vector3(...own)
        .multiply(new Vector3(...transform.scale))
        .applyEuler(new Euler(...transform.rotation)),
    );
  if (parent) position.sub(new Vector3(...parent));
  return { ...transform, position: position.toArray() };
}
