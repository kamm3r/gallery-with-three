import * as THREE from 'three';
import React, { useEffect, useRef } from 'react';
import { useGLTF, useAnimations } from '@react-three/drei';
import { GLTF } from 'three-stdlib';

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
    Cube004_6: THREE.SkinnedMesh;
    Bone: THREE.Bone;
  };
  materials: {
    Skin: THREE.MeshStandardMaterial;
    Clothes: THREE.MeshStandardMaterial;
    Belt: THREE.MeshStandardMaterial;
    Gold: THREE.MeshStandardMaterial;
    Hat: THREE.MeshStandardMaterial;
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

export default function Wizard({ ...props }: JSX.IntrinsicElements['group']) {
  const group = useRef<THREE.Group>();
  const { nodes, materials, animations } = useGLTF(
    '/assets/Wizard.glb'
  ) as GLTFResult;
  const { actions } = useAnimations(animations, group);
  useEffect(() => {
    actions['Idle']?.reset().fadeIn(0.5).play();
    return () => void actions['Idle']?.fadeOut(0.5);
  }, [actions]);
  return (
    <group ref={group} {...props} dispose={null}>
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
        material={materials.Clothes}
        skeleton={nodes.Cube004_1.skeleton}
      />
      <skinnedMesh
        castShadow
        geometry={nodes.Cube004_2.geometry}
        material={materials.Belt}
        skeleton={nodes.Cube004_2.skeleton}
      />
      <skinnedMesh
        castShadow
        geometry={nodes.Cube004_3.geometry}
        material={materials.Gold}
        skeleton={nodes.Cube004_3.skeleton}
      />
      <skinnedMesh
        castShadow
        geometry={nodes.Cube004_4.geometry}
        material={materials.Hat}
        skeleton={nodes.Cube004_4.skeleton}
      />
      <skinnedMesh
        castShadow
        geometry={nodes.Cube004_5.geometry}
        material={materials.Hair}
        skeleton={nodes.Cube004_5.skeleton}
      />
      <skinnedMesh
        castShadow
        geometry={nodes.Cube004_6.geometry}
        material={materials.Face}
        skeleton={nodes.Cube004_6.skeleton}
      />
    </group>
  );
}

useGLTF.preload('/assets/Wizard.glb');
