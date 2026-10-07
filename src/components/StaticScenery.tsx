import { useLayoutEffect, useRef, type ReactNode } from "react";
import * as THREE from "three";
import { batchStaticMeshes } from "../gameplay/batchStaticMeshes";

/** Children must have immutable transforms/materials; lights remain independent. */
export function StaticScenery({ children }: { children: ReactNode }) {
  const group = useRef<THREE.Group>(null);
  useLayoutEffect(() => {
    if (!group.current) return;
    const merged = batchStaticMeshes(group.current);
    return () => merged.dispose();
  }, []);
  return <group ref={group}>{children}</group>;
}
