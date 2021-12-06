import * as THREE from 'three';
import React, { useEffect, useRef, useState } from 'react';
import { useGLTF, useAnimations } from '@react-three/drei';
import { GLTF } from 'three-stdlib';
import { useFrame } from '@react-three/fiber';

interface GLTFAction extends THREE.AnimationClip {
  name: ActionName;
}

type GLTFResult = GLTF & {
  nodes: {
    Cube004: THREE.SkinnedMesh;
    Cube004_1: THREE.SkinnedMesh;
    Cube004_2: THREE.SkinnedMesh;
    Cube004_3: THREE.SkinnedMesh;
    Cube004_4: THREE.SkinnedMesh;
    Cube004_5: THREE.SkinnedMesh;
    Bone: THREE.Bone;
  };
  materials: {
    Skin: THREE.MeshStandardMaterial;
    Light: THREE.MeshStandardMaterial;
    Main: THREE.MeshStandardMaterial;
    Pants: THREE.MeshStandardMaterial;
    Hair: THREE.MeshStandardMaterial;
    Face: THREE.MeshStandardMaterial;
  };
  animations: GLTFAction[];
};

type ActionName =
  | 'Idle'
  | 'PickUp'
  | 'Punch'
  | 'RecieveHit'
  | 'Run'
  | 'SitDown'
  | 'Walk';

export default function Model(
  index: any,
  { ...props }: JSX.IntrinsicElements['group']
) {
  const { nodes, materials, animations } = useGLTF(
    '/assets/Viking_Female.glb'
  ) as GLTFResult;
  const { ref, actions, names } = useAnimations(animations);

  useEffect(() => {
    actions[names[index]]?.reset().fadeIn(0.5).play();
    return () => void actions[names[index]]?.fadeOut(0.5);
  }, [actions, names, index]);

  return (
    <group ref={ref} {...props} dispose={null}>
      <primitive object={nodes.Bone} />
      <skinnedMesh
        castShadow
        geometry={nodes.Cube004.geometry}
        material={materials.Skin}
        skeleton={nodes.Cube004.skeleton}
      />
      <skinnedMesh
        castShadow
        geometry={nodes.Cube004_1.geometry}
        material={materials.Light}
        skeleton={nodes.Cube004_1.skeleton}
      />
      <skinnedMesh
        castShadow
        geometry={nodes.Cube004_2.geometry}
        material={materials.Main}
        skeleton={nodes.Cube004_2.skeleton}
      />
      <skinnedMesh
        castShadow
        geometry={nodes.Cube004_3.geometry}
        material={materials.Pants}
        skeleton={nodes.Cube004_3.skeleton}
      />
      <skinnedMesh
        castShadow
        geometry={nodes.Cube004_4.geometry}
        material={materials.Hair}
        skeleton={nodes.Cube004_4.skeleton}
      />
      <skinnedMesh
        castShadow
        geometry={nodes.Cube004_5.geometry}
        material={materials.Face}
        skeleton={nodes.Cube004_5.skeleton}
      />
    </group>
  );
}

useGLTF.preload('/assets/Viking_Female.glb');
