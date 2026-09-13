import { Sky } from '@react-three/drei';
import { CylinderCollider, RigidBody } from '@react-three/rapier';
import Tree from './Tree';
import { PortalPainting } from './PortalPainting';
import { ThirdPersonPlayer } from './ThirdPersonPlayer';
import { PortalFrameCollider } from './PortalFrameCollider';

interface ForestWorldProps {
  nearPortal: string | null;
  portalImpact: string | null;
  onNearPortal: (portalId: string | null) => void;
  onEnterPortal: (portalId: string) => void;
  onReady: () => void;
}

const trees: Array<[number, number, number, number]> = [
  [-10, 0, -8, 2.5], [-7, 0, -13, 3.1], [-2.5, 0, -15, 2.4],
  [5, 0, -14, 3.2], [10, 0, -10, 2.7], [13, 0, -3, 3.4],
  [13, 0, 6, 2.6], [9, 0, 12, 3], [2, 0, 15, 2.7],
  [-6, 0, 14, 3.3], [-12, 0, 9, 2.8], [-14, 0, 1, 3.1],
  [-5, 0, -5, 1.8], [6, 0, -6, 2],
];

export function ForestWorld({ nearPortal, portalImpact, onNearPortal, onEnterPortal, onReady }: ForestWorldProps) {
  return (
    <>
      <color attach='background' args={['#b9c7b0']} />
      <fog attach='fog' args={['#b9c7b0', 13, 35]} />
      <Sky distance={450000} sunPosition={[3, 4, 2]} turbidity={8} rayleigh={2.5} />
      <hemisphereLight args={['#e7ecd9', '#26372b', 1.7]} />
      <directionalLight
        castShadow
        color='#fff1c9'
        intensity={2.2}
        position={[7, 12, 5]}
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-left={-28}
        shadow-camera-right={28}
        shadow-camera-top={28}
        shadow-camera-bottom={-28}
        shadow-camera-near={0.5}
        shadow-camera-far={60}
      />
      <RigidBody type='fixed' colliders={false}>
        <CylinderCollider args={[0.15, 35]} position={[0, -0.15, 0]} />
        <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[35, 64]} />
          <meshStandardMaterial color='#38523c' roughness={1} />
        </mesh>
        <mesh position={[0, -0.16, 0]} receiveShadow>
          <cylinderGeometry args={[35.2, 35.8, 0.3, 64]} />
          <meshStandardMaterial color='#25372a' roughness={1} />
        </mesh>
      </RigidBody>
      {trees.map(([x, y, z, scale]) => (
        <RigidBody
          key={`${x}-${z}`}
          type='fixed'
          colliders={false}
          position={[x, y, z]}
        >
          <CylinderCollider
            args={[scale * 0.9, scale * 0.2]}
            position={[0, scale * 0.9, 0]}
          />
          <Tree scale={scale} />
        </RigidBody>
      ))}
      <PortalPainting
        image='/assets/fieldhouse.jpg'
        position={[0, 2.2, -10.5]}
        active={nearPortal === 'gallery' || portalImpact === 'gallery'}
        impact={portalImpact === 'gallery'}
      />
      <PortalFrameCollider position={[0, 2.2, -10.5]} />
      <PortalPainting
        image='/assets/plaster.jpg'
        position={[10.5, 2.2, 0]}
        rotation={[0, -Math.PI / 2, 0]}
        active={nearPortal === 'playground' || portalImpact === 'playground'}
        impact={portalImpact === 'playground'}
      />
      <PortalFrameCollider
        position={[10.5, 2.2, 0]}
        rotation={[0, -Math.PI / 2, 0]}
      />
      <mesh position={[0, 0.12, -8]} receiveShadow>
        <cylinderGeometry args={[2.6, 3.1, 0.24, 32]} />
        <meshStandardMaterial color='#6c7051' roughness={0.95} />
      </mesh>
      <ThirdPersonPlayer
        portals={[
          { id: 'gallery', position: [0, 0, -10.5] },
          { id: 'playground', position: [10.5, 0, 0] },
        ]}
        onNearPortal={onNearPortal}
        onEnterPortal={onEnterPortal}
        onReady={onReady}
      />
    </>
  );
}
