import * as THREE from 'three';
import React, { useRef } from 'react';
import { useGLTF } from '@react-three/drei';
import { GLTF } from 'three-stdlib';
import { trees } from '../utils/store';

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

export default function Tree(props: JSX.IntrinsicElements['group']) {
  const group = useRef<THREE.Group>();
  const { nodes, materials } = useGLTF(trees[0]) as GLTFResult;
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

useGLTF.preload('/assets/tree/tree-branched.glb');
