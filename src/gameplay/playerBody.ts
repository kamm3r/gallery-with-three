// The player is a kinematic body, so sensors can't spot it with isDynamic()
// and can't push it with setLinvel(). It tags its rigid body instead.

export interface PlayerBodyData {
  player: true;
  /** Sets vertical speed and scales planar speed, like setLinvel on a dynamic body. */
  launch: (verticalSpeed: number, planarScale?: number) => void;
}

interface TaggedBody {
  userData?: unknown;
}

export function playerBodyData(body: TaggedBody | null | undefined): PlayerBodyData | null {
  const data = body?.userData as Partial<PlayerBodyData> | undefined;
  return data?.player === true ? (data as PlayerBodyData) : null;
}

export function isPlayerBody(body: TaggedBody | null | undefined) {
  return playerBodyData(body) !== null;
}
