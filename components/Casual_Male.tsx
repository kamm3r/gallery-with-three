import * as THREE from 'three';
import { useEffect, useRef } from 'react';
import { useGLTF, useAnimations } from '@react-three/drei';
import type { ThreeElements } from '@react-three/fiber';
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
    Bone: THREE.Bone;
  };
  materials: {
    Skin: THREE.MeshStandardMaterial;
    Shirt: THREE.MeshStandardMaterial;
    Pants: THREE.MeshStandardMaterial;
    Belt: THREE.MeshStandardMaterial;
    Face: THREE.MeshStandardMaterial;
    Hair: THREE.MeshStandardMaterial;
  };
  animations: GLTFAction[];
};

export type ActionName =
  | 'Idle'
  | 'PickUp'
  | 'Punch'
  | 'RecieveHit'
  | 'Run'
  | 'SitDown'
  | 'Walk';

type CasualProps = ThreeElements['group'] & {
  animation?: ActionName;
};

export const Casual = ({ animation = 'Idle', ...props }: CasualProps) => {
  const group = useRef<THREE.Group>(null!);
  const { nodes, materials, animations } = useGLTF(
    '/assets/Casual_Male.glb'
  ) as unknown as GLTFResult;
  const { actions } = useAnimations(animations, group);
  useEffect(() => {
    const action = actions[animation];
    action?.reset().fadeIn(0.18).play();
    return () => void action?.fadeOut(0.18);
  }, [actions, animation]);

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
        material={materials.Shirt}
        skeleton={nodes.Cube004_1.skeleton}
      />
      <skinnedMesh
        castShadow
        geometry={nodes.Cube004_2.geometry}
        material={materials.Pants}
        skeleton={nodes.Cube004_2.skeleton}
      />
      <skinnedMesh
        castShadow
        geometry={nodes.Cube004_3.geometry}
        material={materials.Belt}
        skeleton={nodes.Cube004_3.skeleton}
      />
      <skinnedMesh
        castShadow
        geometry={nodes.Cube004_4.geometry}
        material={materials.Face}
        skeleton={nodes.Cube004_4.skeleton}
      />
      <skinnedMesh
        castShadow
        geometry={nodes.Cube004_5.geometry}
        material={materials.Hair}
        skeleton={nodes.Cube004_5.skeleton}
      />
    </group>
  );
};

useGLTF.preload('/assets/Casual_Male.glb');
