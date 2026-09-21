import { RigidBody, TrimeshCollider } from '@react-three/rapier';
import { lazy, useMemo } from 'react';
import { buildTerrainGrid, groundHeight, PLAY_RADIUS } from '../gameplay/terrain';
import { HUB_PORTALS, HUB_PAINTING_SCALE } from '../gameplay/hubPortals';
import { DistantPeaks, HubGround } from './HubNature';
import { DayNightSky } from './DayNightSky';
import { Waterscape } from './Waterscape';
import { WindFlowers } from './WindFlowers';
import { MeadowGrass } from './MeadowGrass';
import { PortalPainting } from './PortalPainting';
import { ThirdPersonPlayer } from './ThirdPersonPlayer';
import { PortalFrameCollider } from './PortalFrameCollider';
import { Butterflies } from './Butterflies';

const UltimateNature = lazy(() => import('./UltimateNature').then((module) => ({ default: module.UltimateNature })));

interface ForestWorldProps {
  spawn: { position: [number,number,number]; yaw: number };
  nearPortal: string | null;
  portalImpact: string | null;
  onNearPortal: (portalId: string | null) => void;
  onEnterPortal: (portalId: string) => void;
  onHangChange: (hanging: boolean) => void;
  onReady: () => void;
}

export function ForestWorld({ spawn, nearPortal, portalImpact, onNearPortal, onEnterPortal, onHangChange, onReady }: ForestWorldProps) {
  const grid = useMemo(() => buildTerrainGrid(), []);
  const portals = useMemo(() => HUB_PORTALS.map((portal) => ({
    ...portal, position: [portal.x, groundHeight(portal.x, portal.z), portal.z] as [number, number, number], scale: HUB_PAINTING_SCALE,
  })), []);
  return <>
    <DayNightSky />
    <RigidBody type='fixed' colliders={false}><TrimeshCollider args={[grid.vertices, grid.indices]} /></RigidBody>
    <HubGround grid={grid} />
    <mesh position={[0, -2.5, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <circleGeometry args={[400, 32]} /><meshStandardMaterial color='#34452e' roughness={1} />
    </mesh>
    <UltimateNature />
    <MeadowGrass />
    <WindFlowers />
    <Butterflies />
    <Waterscape />
    <DistantPeaks />
    {portals.map((portal) => <group key={portal.id} rotation={[0, portal.yaw, 0]} position={portal.position} name={`hub-portal-${portal.id}`}>
      <PortalPainting image={portal.image} position={[0, portal.flat ? 0.04 : 2.17 * portal.scale, 0]}
        rotation={[portal.flat ? -Math.PI / 2 : 0, 0, 0]} scale={portal.scale} beacon={portal.id === 'gallery'}
        active={nearPortal === portal.id || portalImpact === portal.id} impact={portalImpact === portal.id} />
      <PortalFrameCollider position={[0, portal.flat ? 0.04 : 2.17 * portal.scale, 0]}
        rotation={[portal.flat ? -Math.PI / 2 : 0, 0, 0]} scale={portal.scale} />
    </group>)}
    <ThirdPersonPlayer portals={portals} start={spawn.position} startYaw={spawn.yaw} respawn={[0,0,6]}
      boundary={PLAY_RADIUS} onNearPortal={onNearPortal} onEnterPortal={onEnterPortal} onHangChange={onHangChange} onReady={onReady} />
  </>;
}
