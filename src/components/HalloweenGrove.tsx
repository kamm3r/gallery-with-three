import { lazy, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { CylinderCollider, RigidBody } from "@react-three/rapier";
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

const NatureBatch = lazy(() =>
  import("./UltimateNature").then((module) => ({ default: module.NatureBatch })),
);
const trees = Array.from({ length: 28 }, (_, i) => {
  const angle = (i / 28) * Math.PI * 2,
    radius = 13 + (i % 3) * 2;
  return {
    x: Math.sin(angle) * radius,
    y: 0,
    z: Math.cos(angle) * radius - 4,
    scale: 6 + (i % 4),
    rotation: angle,
    tint: 0.5,
  };
}).filter((p) => Math.abs(p.x) > 4 || p.z < 0);
const deadTrees = trees.filter((_, i) => i % 2 === 0);
const autumnTrees = trees.filter((_, i) => i % 2 !== 0);
const pumpkins = Array.from({ length: 24 }, (_, i) => ({
  x: i < 12 ? (i % 2 ? 1 : -1) * (2.6 + Math.sin(i) * 0.5) : Math.sin(i * 2.4) * 10,
  z: i < 12 ? 9 - Math.floor(i / 2) * 2.8 : Math.cos(i * 2.4) * 9 - 5,
  scale: 0.65 + (i % 4) * 0.18,
  yaw: i % 2 ? -0.5 : 0.5,
}));

function PumpkinPatch() {
  const body = useRef<THREE.InstancedMesh>(null);
  const faces = useRef<THREE.InstancedMesh>(null);
  const geometry = useMemo(() => {
    const parts: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const lobe = new THREE.SphereGeometry(0.3, 8, 6)
        .scale(0.72, 1.25, 0.72)
        .translate(Math.sin(a) * 0.23, 0.4, Math.cos(a) * 0.23);
      parts.push(lobe);
    }
    const result = mergeGeometries(parts);
    parts.forEach((part) => part.dispose());
    return result!;
  }, []);
  const face = useMemo(() => {
    const shapes = [
      [
        [-0.27, 0.48],
        [-0.08, 0.48],
        [-0.17, 0.64],
      ],
      [
        [0.08, 0.48],
        [0.27, 0.48],
        [0.17, 0.64],
      ],
      [
        [-0.24, 0.33],
        [-0.13, 0.18],
        [0.13, 0.18],
        [0.24, 0.33],
        [0.08, 0.28],
        [0, 0.33],
        [-0.08, 0.28],
      ],
    ].map((points) => new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y))));
    return new THREE.ShapeGeometry(shapes).translate(0, 0, 0.445);
  }, []);
  useLayoutEffect(() => {
    const transform = new THREE.Object3D();
    pumpkins.forEach((p, i) => {
      transform.position.set(p.x, 0, p.z);
      transform.rotation.y = p.yaw;
      transform.scale.setScalar(p.scale);
      transform.updateMatrix();
      body.current!.setMatrixAt(i, transform.matrix);
      faces.current!.setMatrixAt(i, transform.matrix);
    });
    for (const mesh of [body.current!, faces.current!]) {
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
    }
  }, []);
  useEffect(
    () => () => {
      geometry.dispose();
      face.dispose();
    },
    [geometry, face],
  );
  return (
    <>
      <instancedMesh
        ref={body}
        args={[geometry, undefined, pumpkins.length]}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial color="#c65b1e" roughness={0.9} />
      </instancedMesh>
      <instancedMesh ref={faces} args={[face, undefined, pumpkins.length]}>
        <meshBasicMaterial color="#ffd67b" toneMapped={false} side={THREE.DoubleSide} />
      </instancedMesh>
      {pumpkins.map((p, i) => (
        <RigidBody key={i} type="fixed" colliders={false} position={[p.x, 0, p.z]}>
          <CylinderCollider
            args={[0.35 * p.scale, 0.42 * p.scale]}
            position={[0, 0.36 * p.scale, 0]}
          />
          <mesh position={[0, 0.82 * p.scale, 0]} rotation={[0, 0, -0.15]} castShadow>
            <cylinderGeometry args={[0.04, 0.07, 0.2 * p.scale, 5]} />
            <meshStandardMaterial color="#455033" />
          </mesh>
        </RigidBody>
      ))}
    </>
  );
}

export function HalloweenGrove() {
  return (
    <>
      <NatureBatch model="CommonTree_1" tree points={autumnTrees} leafColor="#ad5727" />
      <NatureBatch model="CommonTree_Dead_1" tree points={deadTrees} />
      {trees.map((p, i) => (
        <RigidBody key={i} type="fixed" colliders={false} position={[p.x, 1, p.z]}>
          <CylinderCollider args={[1, 0.45]} />
        </RigidBody>
      ))}
      <PumpkinPatch />
      <pointLight position={[-3, 1.1, 3]} color="#ff9c39" intensity={18} distance={9} decay={2} />
      <pointLight position={[3, 1.1, -9]} color="#ff9c39" intensity={22} distance={10} decay={2} />
      <mesh position={[-18, 23, -35]}>
        <sphereGeometry args={[2, 20, 12]} />
        <meshBasicMaterial color="#d7dcba" fog={false} />
      </mesh>
      {Array.from({ length: 8 }, (_, i) => (
        <RigidBody
          key={i}
          type="fixed"
          colliders="cuboid"
          position={[(i % 2 ? 1 : -1) * (7 + (i % 3)), 0.65, -2 - Math.floor(i / 2) * 3]}
          rotation={[0, i * 0.3, ((i % 3) - 1) * 0.1]}
        >
          <mesh castShadow receiveShadow>
            <boxGeometry args={[0.85, 1.3, 0.25]} />
            <meshStandardMaterial color="#676773" roughness={1} />
          </mesh>
          <mesh position={[0, 0.15, 0.14]}>
            <boxGeometry args={[0.08, 0.55, 0.02]} />
            <meshStandardMaterial color="#292834" />
          </mesh>
          <mesh position={[0, 0.26, 0.14]}>
            <boxGeometry args={[0.35, 0.08, 0.02]} />
            <meshStandardMaterial color="#292834" />
          </mesh>
        </RigidBody>
      ))}
      {Array.from({ length: 11 }, (_, i) => (
        <mesh
          key={i}
          position={[Math.sin(i * 0.7) * 0.6, 0.015, 10 - i * 2]}
          rotation={[-Math.PI / 2, 0, i * 0.23]}
          receiveShadow
        >
          <circleGeometry args={[1.25, 7]} />
          <meshStandardMaterial color="#79654c" roughness={1} />
        </mesh>
      ))}
    </>
  );
}
