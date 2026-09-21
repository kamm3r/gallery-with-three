import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { CuboidCollider, RigidBody } from '@react-three/rapier';
import * as THREE from 'three';
import { galleryTiles, galleryWalls } from '../gameplay/galleryLayout';
import { FramedArtwork } from './FramedArtwork';

export function GalleryInscription({ text, position, width = 4 }: { text: string; position: [number, number, number]; width?: number }) {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas'); canvas.width = 1024; canvas.height = 512;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#202d34'; ctx.fillRect(0, 0, 1024, 512);
    ctx.strokeStyle = '#ad9562'; ctx.lineWidth = 5; ctx.strokeRect(20, 20, 984, 472);
    ctx.fillStyle = '#ece1c4'; ctx.font = '36px Georgia'; ctx.textAlign = 'center';
    text.split('\n').forEach((line, i) => ctx.fillText(line, 512, 100 + i * 65));
    const result = new THREE.CanvasTexture(canvas); result.colorSpace = THREE.SRGBColorSpace;
    return result;
  }, [text]);
  useEffect(() => () => texture.dispose(), [texture]);
  return <mesh position={position}><planeGeometry args={[width, width / 2]} /><meshBasicMaterial map={texture} /></mesh>;
}

export function GalleryArchitecture() {
  const walls = useRef<THREE.InstancedMesh>(null);
  const floors = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const transform = new THREE.Object3D(); const color = new THREE.Color();
    galleryWalls.forEach((wall, i) => {
      transform.position.fromArray(wall.position); transform.scale.fromArray(wall.size); transform.updateMatrix();
      walls.current!.setMatrixAt(i, transform.matrix);
      walls.current!.setColorAt(i, color.set(i % 3 ? '#35434c' : '#40515a'));
    });
    galleryTiles.forEach(([x, z], i) => {
      transform.position.set(x * 6, -.2, z * 6); transform.scale.set(6, .4, 6); transform.updateMatrix();
      floors.current!.setMatrixAt(i, transform.matrix);
      floors.current!.setColorAt(i, color.set((x + z) % 2 ? '#697575' : '#4c5b60'));
    });
    for (const batch of [walls.current!, floors.current!]) {
      batch.instanceMatrix.needsUpdate = true;
      if (batch.instanceColor) batch.instanceColor.needsUpdate = true;
      batch.computeBoundingSphere();
    }
  }, []);
  return <>
    <RigidBody type='fixed' colliders={false}>
      {galleryTiles.map(([x, z]) => <CuboidCollider key={`${x},${z}`} args={[3, .2, 3]} position={[x * 6, -.2, z * 6]} />)}
      {galleryWalls.map((wall, i) => <CuboidCollider key={`w${i}`} position={wall.position} args={[wall.size[0] / 2, 3.5, wall.size[2] / 2]} />)}
    </RigidBody>
    <instancedMesh ref={walls} args={[undefined, undefined, galleryWalls.length]} castShadow receiveShadow><boxGeometry /><meshStandardMaterial roughness={.88} /></instancedMesh>
    <instancedMesh ref={floors} args={[undefined, undefined, galleryTiles.length]} receiveShadow><boxGeometry /><meshStandardMaterial roughness={.62} /></instancedMesh>
    {[[0, 9], [-24, -12], [24, -12], [24, 18], [0, -39]].map(([x, z], i) => <group key={i} position={[x, 0, z]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, .015, 0]} receiveShadow><planeGeometry args={[4, 12]} /><meshStandardMaterial color={i === 3 ? '#3c6654' : '#633a43'} roughness={1} /></mesh>
      {[-1, 1].map(side => <group key={side}>
        {[-5, 5].map(depth => <RigidBody key={depth} type='fixed' colliders='cuboid' position={[side * 6, 3, depth]}>
          <mesh castShadow receiveShadow><boxGeometry args={[.7, 6, .7]} /><meshStandardMaterial color='#84908b' /></mesh>
          <mesh position={[0, 2.6, 0]}><boxGeometry args={[1.15, .3, 1.15]} /><meshStandardMaterial color='#aa9061' /></mesh>
        </RigidBody>)}
      </group>)}
      <mesh position={[0, 6.3, 0]} rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[3.4, .12, 6, 32]} /><meshStandardMaterial color='#b5a171' emissive='#a78345' emissiveIntensity={.4} /></mesh>
      <pointLight position={[0, 5.4, 0]} color={i === 2 ? '#9bb8e3' : '#ffdba0'} intensity={45} distance={19} decay={2} />
    </group>)}
    {['text', 'sweesh', 'hands', 'mankey', 'oilpainting', 'plaster'].map((name, i) => <FramedArtwork key={name} image={`/assets/${name}.jpg`} position={[i % 2 ? 8.65 : -8.65, 2.6, 2 + Math.floor(i / 2) * 6]} rotation={[0, i % 2 ? -Math.PI / 2 : Math.PI / 2, 0]} />)}
    <GalleryInscription position={[0, 3, -50.7]} text={'The collection remembers.\nEvery journey leaves a trace.\nThe forest is yours again.'} width={7} />
  </>;
}
