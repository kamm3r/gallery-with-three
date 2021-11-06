import * as THREE from 'three';
import React, { useRef, useMemo } from 'react';
import { useGLTF, Merged } from '@react-three/drei';
import { GLTF } from 'three-stdlib';

type GLTFResult = GLTF & {
  nodes: {
    leaves: THREE.Mesh;
    trunk: THREE.Mesh;
  };
  materials: {
    tree_green: THREE.MeshStandardMaterial;
    tree_bark_light?: THREE.MeshStandardMaterial;
    tree_bark_dark?: THREE.MeshStandardMaterial;
  };
};

const imgs = [
  '/assets/trees/tree-branched.glb',
  '/assets/trees/tree-columnar.glb',
  '/assets/trees/tree-conical.glb',
  '/assets/trees/tree-open.glb',
  '/assets/trees/tree-oval.glb',
  '/assets/trees/tree-pyramidal.glb',
  '/assets/trees/tree-round.glb',
  '/assets/trees/tree-spreading.glb',
  '/assets/trees/tree-vase.glb',
];

export default function Trees(props: JSX.IntrinsicElements['group'] | any) {
  const { nodes } = useGLTF(imgs[8]) as GLTFResult;
  const instances = useMemo(
    () => ({
      Leaves: nodes.leaves,
      Trunk: nodes.trunk,
    }),
    [nodes]
  );
  return (
    <Merged meshes={instances} {...props}>
      {(instances: any) => {
        <Parts instances={instances} />;
      }}
    </Merged>
  );
}

function Parts({ instances, ...props }: JSX.IntrinsicElements['group'] | any) {
  const group = useRef<THREE.Group>();
  const { nodes, materials } = useGLTF(imgs[8]) as GLTFResult;
  return (
    <group ref={group} {...props} dispose={null}>
      <instances.Leaves />
      <instances.Trunk />
    </group>
  );
}

useGLTF.preload(imgs[8]);
