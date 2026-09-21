import { lazy, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { CylinderCollider, RigidBody } from '@react-three/rapier';
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const NatureBatch = lazy(() => import('./UltimateNature').then(module => ({ default: module.NatureBatch })));
const trees = Array.from({ length: 28 }, (_, i) => {
  const angle = i / 28 * Math.PI * 2, radius = 13 + i % 3 * 2;
  return { x: Math.sin(angle) * radius, y: 0, z: Math.cos(angle) * radius - 4, scale: 6 + i % 4, rotation: angle, tint: .5 };
}).filter(p => Math.abs(p.x) > 4 || p.z < 0);
const deadTrees = trees.filter((_, i) => i % 2 === 0);
const autumnTrees = trees.filter((_, i) => i % 2 !== 0);
const pumpkins = Array.from({ length: 24 }, (_, i) => ({
  x: i < 12 ? (i % 2 ? 1 : -1) * (2.6 + Math.sin(i) * .5) : Math.sin(i * 2.4) * 10,
  z: i < 12 ? 9 - Math.floor(i / 2) * 2.8 : Math.cos(i * 2.4) * 9 - 5,
  scale: .65 + (i % 4) * .18,
  yaw: i % 2 ? -.5 : .5,
}));

function PumpkinPatch() {
  const body = useRef<THREE.InstancedMesh>(null);
  const faces = useRef<THREE.InstancedMesh>(null);
  const geometry = useMemo(() => {
    const parts: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * Math.PI * 2;
      const lobe = new THREE.SphereGeometry(.3, 8, 6).scale(.72, 1.25, .72).translate(Math.sin(a) * .23, .4, Math.cos(a) * .23);
      parts.push(lobe);
    }
    const result = mergeGeometries(parts);
    parts.forEach(part => part.dispose());
    return result!;
  }, []);
  const face = useMemo(() => {
    const shapes = [
      [[-.27, .48], [-.08, .48], [-.17, .64]],
      [[.08, .48], [.27, .48], [.17, .64]],
      [[-.24, .33], [-.13, .18], [.13, .18], [.24, .33], [.08, .28], [0, .33], [-.08, .28]],
    ].map(points => new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y))));
    return new THREE.ShapeGeometry(shapes).translate(0, 0, .445);
  }, []);
  useLayoutEffect(() => {
    const transform = new THREE.Object3D();
    pumpkins.forEach((p, i) => {
      transform.position.set(p.x, 0, p.z); transform.rotation.y = p.yaw; transform.scale.setScalar(p.scale); transform.updateMatrix();
      body.current!.setMatrixAt(i, transform.matrix); faces.current!.setMatrixAt(i, transform.matrix);
    });
    for (const mesh of [body.current!, faces.current!]) { mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingSphere(); }
  }, []);
  useEffect(() => () => { geometry.dispose(); face.dispose(); }, [geometry, face]);
  return <>
    <instancedMesh ref={body} args={[geometry, undefined, pumpkins.length]} castShadow receiveShadow><meshStandardMaterial color='#c65b1e' roughness={.9} /></instancedMesh>
    <instancedMesh ref={faces} args={[face, undefined, pumpkins.length]}><meshBasicMaterial color='#ffd67b' toneMapped={false} side={THREE.DoubleSide} /></instancedMesh>
    {pumpkins.map((p, i) => <RigidBody key={i} type='fixed' colliders={false} position={[p.x, 0, p.z]}>
      <CylinderCollider args={[.35 * p.scale, .42 * p.scale]} position={[0, .36 * p.scale, 0]} />
      <mesh position={[0, .82 * p.scale, 0]} rotation={[0, 0, -.15]} castShadow><cylinderGeometry args={[.04, .07, .2 * p.scale, 5]} /><meshStandardMaterial color='#455033' /></mesh>
    </RigidBody>)}
  </>;
}

export function HalloweenGrove() {
  return <>
    <NatureBatch model='CommonTree_1' tree points={autumnTrees} leafColor='#ad5727' />
    <NatureBatch model='CommonTree_Dead_1' tree points={deadTrees} />
    {trees.map((p, i) => <RigidBody key={i} type='fixed' colliders={false} position={[p.x, 1, p.z]}><CylinderCollider args={[1, .45]} /></RigidBody>)}
    <PumpkinPatch />
    <pointLight position={[-3, 1.1, 3]} color='#ff9c39' intensity={18} distance={9} decay={2} />
    <pointLight position={[3, 1.1, -9]} color='#ff9c39' intensity={22} distance={10} decay={2} />
    <mesh position={[-18, 23, -35]}><sphereGeometry args={[2, 20, 12]} /><meshBasicMaterial color='#d7dcba' fog={false} /></mesh>
    {Array.from({ length: 8 }, (_, i) => <RigidBody key={i} type='fixed' colliders='cuboid' position={[(i % 2 ? 1 : -1) * (7 + i % 3), .65, -2 - Math.floor(i / 2) * 3]} rotation={[0, i * .3, (i % 3 - 1) * .1]}>
      <mesh castShadow receiveShadow><boxGeometry args={[.85, 1.3, .25]} /><meshStandardMaterial color='#676773' roughness={1} /></mesh>
      <mesh position={[0, .15, .14]}><boxGeometry args={[.08, .55, .02]} /><meshStandardMaterial color='#292834' /></mesh>
      <mesh position={[0, .26, .14]}><boxGeometry args={[.35, .08, .02]} /><meshStandardMaterial color='#292834' /></mesh>
    </RigidBody>)}
    {Array.from({ length: 11 }, (_, i) => <mesh key={i} position={[Math.sin(i * .7) * .6, .015, 10 - i * 2]} rotation={[-Math.PI / 2, 0, i * .23]} receiveShadow>
      <circleGeometry args={[1.25, 7]} /><meshStandardMaterial color='#79654c' roughness={1} />
    </mesh>)}
  </>;
}
