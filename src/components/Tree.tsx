import * as THREE from "three";
import React, { useRef } from "react";
import { useGLTF } from "@react-three/drei";
import type { ThreeElements } from "@react-three/fiber";
import { GLTF } from "three-stdlib";

type GLTFResult = GLTF & {
  nodes: {
    leaves: THREE.Mesh;
    trunk: THREE.Mesh;
  };
  materials: {
    tree_green: THREE.MeshStandardMaterial;
    tree_bark_dark: THREE.MeshStandardMaterial;
  };
};

export type TreeVariant = "branched" | "conical" | "oval" | "round" | "spreading";

type TreeProps = ThreeElements["group"] & {
  variant?: TreeVariant;
};

export default function Tree({ variant = "branched", ...props }: TreeProps) {
  const group = useRef<THREE.Group>(null);
  const { nodes, materials } = useGLTF(
    `/assets/trees/tree-${variant}.glb`,
  ) as unknown as GLTFResult;
  return (
    <group ref={group} {...props} dispose={null}>
      <mesh
        castShadow
        receiveShadow
        geometry={nodes.leaves.geometry}
        material={materials.tree_green}
      />
      <mesh
        castShadow
        receiveShadow
        geometry={nodes.trunk.geometry}
        material={materials.tree_bark_dark}
        rotation={[-Math.PI, 0, -Math.PI]}
      />
    </group>
  );
}

(["branched", "conical", "oval", "round", "spreading"] as TreeVariant[]).forEach((variant) =>
  useGLTF.preload(`/assets/trees/tree-${variant}.glb`),
);
