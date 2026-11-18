import { useEffect, useMemo } from "react";
import * as THREE from "three";
import type { TerrainGrid } from "../gameplay/terrain";

import { createHubGround } from "../runtime/hubGround";

export function HubGround({ grid }: { grid: TerrainGrid }) {
  const ground = useMemo(() => createHubGround(grid), [grid]);
  useEffect(
    () => () => {
      ground.geometry.dispose();
      ground.material.dispose();
    },
    [ground],
  );
  return <primitive object={ground} />;
}

const peaks: Array<{ x: number; z: number; size: number; color: string }> = [
  { x: -70, z: -55, size: 34, color: "#5d705f" },
  { x: 75, z: -40, size: 28, color: "#66765f" },
  { x: 10, z: -95, size: 40, color: "#596b62" },
  { x: -85, z: 35, size: 30, color: "#5d705f" },
  { x: 80, z: 55, size: 26, color: "#66765f" },
];

export function DistantPeaks() {
  return (
    <group>
      {peaks.map(({ x, z, size, color }, index) => (
        <mesh key={index} position={[x * 2.8, size * 0.6, z * 2.8]}>
          <coneGeometry args={[size * 1.8, size * 2, 7]} />
          <meshStandardMaterial color={color} roughness={1} flatShading />
        </mesh>
      ))}
    </group>
  );
}
