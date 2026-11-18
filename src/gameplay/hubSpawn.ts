import { HUB_PORTALS } from "./hubPortals.ts";
import { groundHeight } from "./terrain.ts";

export function hubSpawn(portalId?: string) {
  const portal = HUB_PORTALS.find((p) => p.id === portalId);
  if (!portal) return { position: [0, 0, 6] as [number, number, number], yaw: Math.PI };
  const x = portal.x + Math.sin(portal.yaw) * 9;
  const z = portal.z + Math.cos(portal.yaw) * 9;
  return {
    position: [x, groundHeight(x, z) + 0.05, z] as [number, number, number],
    yaw: portal.yaw,
  };
}
