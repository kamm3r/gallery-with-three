// Layout of the Warp Room: a round platform floating in the void, with the
// way home and the five level portals spaced around the rim, facing the boss
// pad in the middle.

import { WARP_LEVEL_IDS, type Vec3, type WarpLevelId } from "./warpLevels.ts";

export const WARP_ROOM_RADIUS = 17;
export const PORTAL_RING = 12.5;
/** Raised center pad that becomes the boss portal. */
export const BOSS_PAD = { radius: 2.8, top: 0.35 };

export type WarpRoomPortalId = "forest" | WarpLevelId;

export interface WarpRoomPortal {
  id: WarpRoomPortalId;
  position: Vec3;
  /** Painting yaw: its face (+Z local) looks at the room's center. */
  yaw: number;
}

export const WARP_ROOM_PORTALS: WarpRoomPortal[] = (["forest", ...WARP_LEVEL_IDS] as const).map(
  (id, i) => {
    const angle = (i * Math.PI * 2) / 6;
    const x = Math.sin(angle) * PORTAL_RING;
    const z = Math.cos(angle) * PORTAL_RING;
    return { id, position: [x, 0, z] as Vec3, yaw: angle + Math.PI };
  },
);

/** Where you stand on arrival: in front of the portal you came through, facing in. */
export function warpRoomSpawn(from?: string) {
  const portal = WARP_ROOM_PORTALS.find((p) => p.id === from) ?? WARP_ROOM_PORTALS[0];
  // Close to the middle so the camera starts inside the ring of paintings.
  const inward = BOSS_PAD.radius + 1.9;
  const angle = portal.yaw - Math.PI;
  return {
    position: [Math.sin(angle) * inward, 0, Math.cos(angle) * inward] as Vec3,
    yaw: portal.yaw,
  };
}
