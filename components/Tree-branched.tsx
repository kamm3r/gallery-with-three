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
    tree_bark_dark: THREE.MeshStandardMaterial;
  };
};

export default function InstancedModel(props: any) {
  const { nodes } = useGLTF('/assets/trees/tree-branched.glb') as GLTFResult;
  const instances = useMemo(
    () => ({
      Leaves: nodes.leaves,
      Trunk: nodes.trunk,
    }),
    [nodes]
  );
  return (
    <Merged meshes={instances} {...props}>
      {(instances: any) => <Model instances={instances} />}
    </Merged>
  );
}

function Model(instances: any, { ...props }: JSX.IntrinsicElements['group']) {
  const group = useRef<THREE.Group>();
  const { nodes, materials } = useGLTF('/tree-branched.glb') as GLTFResult;
  return (
    <group ref={group} {...props} dispose={null}>
      <instances.Leaves scale={3} />
      <instances.Trunk rotation={[-Math.PI, 0, -Math.PI]} scale={3} />
    </group>
  );
}

useGLTF.preload('/assets/trees/tree-branched.glb');
