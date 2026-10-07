import * as THREE from "three";
import { batchStaticMeshes } from "./batchStaticMeshes.ts";

/** Reversible batching for React-owned rigs: joints and their refs stay alive. */
export function batchArticulatedMeshes(root: THREE.Group) {
  const joints: THREE.Group[] = [];
  root.traverse((object) => {
    if (object instanceof THREE.Group) joints.push(object);
  });
  const batches = joints.map((joint) => batchStaticMeshes(joint, Infinity, false));
  return () => {
    for (const batch of batches.reverse()) batch.dispose();
  };
}
