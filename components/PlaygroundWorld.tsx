import { Sky } from '@react-three/drei';
import { CollisionCourse } from './CollisionCourse';
import { KinematicPlatform, PlatformSystem } from './KinematicPlatform';
import { PortalFrameCollider } from './PortalFrameCollider';
import { PortalPainting } from './PortalPainting';
import { ThirdPersonPlayer } from './ThirdPersonPlayer';

interface PlaygroundWorldProps {
  nearPortal: boolean;
  portalImpact: boolean;
  onNearPortal: (near: boolean) => void;
  onExit: () => void;
  onHangChange: (hanging: boolean) => void;
  onReady: () => void;
}

export function PlaygroundWorld({ nearPortal, portalImpact, onNearPortal, onExit, onHangChange, onReady }: PlaygroundWorldProps) {
  return <>
    <color attach='background' args={['#b9cad3']} />
    <fog attach='fog' args={['#b9cad3', 95, 190]} />
    <Sky distance={450000} sunPosition={[5, 7, 3]} turbidity={5} rayleigh={2} />
    <hemisphereLight args={['#edf4f0', '#3a4650', 1.7]} />
    <directionalLight castShadow color='#fff0ce' intensity={2.3} position={[-24, 55, 30]}
      shadow-mapSize-width={2048} shadow-mapSize-height={2048}
      shadow-camera-left={-85} shadow-camera-right={85} shadow-camera-top={85} shadow-camera-bottom={-85}
      shadow-camera-near={.5} shadow-camera-far={200} shadow-normalBias={.025} />
    <CollisionCourse />
    <PlatformSystem />
    <KinematicPlatform position={[-4.5, 1.1, -6.5]} axis='y' distance={.9} speed={1.25} color='#d49b58' />
    <KinematicPlatform position={[4.5, 1.4, -6.5]} axis='x' distance={2.4} speed={.85} />
    <KinematicPlatform position={[8, .8, -30]} axis='z' distance={5} speed={.7} color='#67a1bd' />
    <KinematicPlatform position={[19, .65, -33]} spin={.45} size={[8, .4, 3]} color='#d49b58' />
    <KinematicPlatform position={[7, 1.8, 25]} axis='y' distance={1.5} speed={.65} size={[4, .4, 4]} color='#cead59' />
    <PortalPainting image='/assets/plaster.jpg' position={[0, 2.2, 13.3]} rotation={[0, Math.PI, 0]} active={nearPortal || portalImpact} impact={portalImpact} />
    <PortalFrameCollider position={[0, 2.2, 13.3]} rotation={[0, Math.PI, 0]} />
    <ThirdPersonPlayer start={[0, 0, 7.2]} portals={[{ id: 'forest', position: [0, 0, 13.3] }]} bounds={[78, 78]} cameraDistance={4.8}
      onNearPortal={id => onNearPortal(Boolean(id))} onEnterPortal={onExit} onHangChange={onHangChange} onReady={onReady} />
  </>;
}
