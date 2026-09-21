import { Suspense, useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import { CylinderCollider, Physics, RigidBody, type RapierRigidBody } from '@react-three/rapier';
import { useLocation, useNavigate } from 'react-router-dom';
import * as THREE from 'three';
import { GameCanvas } from '../components/GameCanvas';
import { ThirdPersonPlayer } from '../components/ThirdPersonPlayer';
import { PortalPainting } from '../components/PortalPainting';
import { PortalFrameCollider } from '../components/PortalFrameCollider';
import { ExperienceHud } from '../components/ExperienceHud';
import { HalloweenGrove } from '../components/HalloweenGrove';
import { useGame } from '../app/gameSettings';
import { createEncounter, stepEncounter, type Encounter } from '../gameplay/bossEncounter';
import { setResultScreenActive } from '../gameplay/resultScreen';

function Warden({ combat, report }: { combat: MutableRefObject<Encounter>; report: (state: Encounter) => void }) {
  const body = useRef<RapierRigidBody>(null);
  const arms = useRef<THREE.Group>(null);
  const warning = useRef<THREE.Mesh>(null);
  const timer = useRef(0);
  useFrame((_, dt) => {
    const s = combat.current;
    stepEncounter(s, dt);
    body.current?.setNextKinematicTranslation({ x: s.bossX, y: s.bossHealth <= 0 ? -3 : 0, z: s.bossZ });
    body.current?.setNextKinematicRotation(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), s.bossYaw));
    if (arms.current) arms.current.rotation.x = s.phase === 'windup' ? -2.2 : s.phase === 'strike' ? .8 : 0;
    if (warning.current) warning.current.visible = s.phase === 'windup' || s.phase === 'strike';
    timer.current += dt;
    if (timer.current > .1) { timer.current = 0; report({ ...s }); }
  });
  return <RigidBody ref={body} type='kinematicPosition' colliders={false} position={[0, 0, -7]}>
    <CylinderCollider args={[1.8, 1.05]} position={[0, 1.8, 0]} />
    <mesh position={[0, 2.1, 0]} castShadow receiveShadow><dodecahedronGeometry args={[1.4, 0]} /><meshStandardMaterial color='#454b50' roughness={.95} /></mesh>
    <mesh position={[0, 3.6, .1]} castShadow><dodecahedronGeometry args={[.7, 0]} /><meshStandardMaterial color='#68655b' /></mesh>
    {[-.26, .26].map(x => <mesh key={x} position={[x, 3.7, .68]}><boxGeometry args={[.18, .09, .08]} /><meshStandardMaterial color='#ffba63' emissive='#ff7430' emissiveIntensity={3} /></mesh>)}
    <group ref={arms} position={[0, 2.7, 0]}>{[-1.35, 1.35].map(x => <mesh key={x} position={[x, -.6, .35]} castShadow><boxGeometry args={[.8, 1.8, .9]} /><meshStandardMaterial color='#545957' /></mesh>)}</group>
    <mesh ref={warning} rotation={[-Math.PI / 2, 0, 0]} position={[0, .025, 0]}>
      <ringGeometry args={[2, 4.8, 48, 1, Math.PI, Math.PI]} /><meshBasicMaterial color='#ef9c42' transparent opacity={.55} depthWrite={false} side={THREE.DoubleSide} />
    </mesh>
  </RigidBody>;
}

function RealmRun({ boss, retry }: { boss: boolean; retry: () => void }) {
  const { paused } = useGame();
  const navigate = useNavigate();
  const { state } = useLocation();
  const combat = useRef(createEncounter());
  const [snapshot, setSnapshot] = useState(createEncounter);
  const [ready, setReady] = useState(false);
  const [near, setNear] = useState(false);
  const resultOpen = boss && (snapshot.health <= 0 || snapshot.bossHealth <= 0);
  const retryButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    setResultScreenActive(resultOpen);
    if (resultOpen) retryButton.current?.focus();
    return () => setResultScreenActive(false);
  }, [resultOpen]);
  const markReady = useCallback(() => setReady(true), []);
  const exit = useCallback(() => navigate('/', { state: { returnPortal: state?.fromPortal } }), [navigate, state]);
  return <main className='experience'>
    <GameCanvas shadows='percentage' camera={{ position: [0, 4, 14], fov: 52 }}>
      <color attach='background' args={[boss ? '#20252b' : '#191426']} />
      <fog attach='fog' args={[boss ? '#20252b' : '#30263d', boss ? 25 : 16, boss ? 65 : 48]} />
      <hemisphereLight args={[boss ? '#abbacb' : '#a0a6dc', boss ? '#586047' : '#473325', boss ? 1.5 : 1]} />
      <directionalLight position={[8, 16, 6]} intensity={boss ? 2 : 1.8} color={boss ? '#edb784' : '#bac9f6'} castShadow shadow-mapSize={[2048, 2048]} shadow-camera-left={-24} shadow-camera-right={24} shadow-camera-top={24} shadow-camera-bottom={-24} shadow-bias={-.0003} />
      <Suspense fallback={null}><Physics gravity={[0, -30, 0]} paused={paused}>
        <RigidBody type='fixed' colliders='cuboid' position={[0, -.5, 0]}><mesh receiveShadow><boxGeometry args={[48, 1, 48]} /><meshStandardMaterial color={boss ? '#555852' : '#514333'} roughness={1} /></mesh></RigidBody>
        {boss ? <>
          <Warden combat={combat} report={setSnapshot} />
          {Array.from({ length: 14 }, (_, i) => {
            const a = (i + 1) / 16 * Math.PI * 2;
            return <RigidBody key={i} type='fixed' colliders='cuboid' position={[Math.sin(a) * 19, 3, Math.cos(a) * 19]}><mesh castShadow receiveShadow rotation={[0, a, 0]}><boxGeometry args={[1.5, 6, 1.5]} /><meshStandardMaterial color='#454d52' /></mesh></RigidBody>;
          })}
        </> : <HalloweenGrove />}
        <PortalPainting image='/assets/tree.jpg' position={[0, 2.6, 14]} rotation={[0, Math.PI, 0]} scale={1.2} active={near} />
        <PortalFrameCollider position={[0, 2.6, 14]} rotation={[0, Math.PI, 0]} scale={1.2} />
        <ThirdPersonPlayer combat={boss ? combat : undefined} start={[0, 0, 5]} boundary={21} portals={[{ id: 'forest', position: [0, 0, 14], yaw: Math.PI, scale: 1.2 }]} onNearPortal={id => setNear(Boolean(id))} onEnterPortal={exit} onHangChange={() => {}} onReady={markReady} />
      </Physics></Suspense>
    </GameCanvas>
    <ExperienceHud chapter={boss ? 'Trial of ash' : 'Halloween'} title={boss ? 'The Ash Warden' : 'Halloween Hollow'} ready={ready} leaving={false} prompt={near ? 'Jump through to return to the forest' : undefined} />
    {ready && !paused && boss && <section className='combat-hud' aria-label='Combat status'>
      {boss ? <>
        <div className='player-vitals'>
          <span className='vital-crest' aria-hidden='true'>✧</span>
          <div><VitalBar label='Health' value={snapshot.health} max={100} /><VitalBar label='Stamina' value={snapshot.stamina} max={100} stamina /></div>
        </div>
        <div className='warden-vitals'><h2>The Ash Warden</h2><VitalBar label='The Ash Warden health' value={snapshot.bossHealth} max={300} /></div>
        {resultOpen && <div className='combat-result' role='dialog' aria-label='Encounter result'><h2>{snapshot.health <= 0 ? 'You fell' : 'Warden defeated'}</h2><button ref={retryButton} onClick={retry}>Retry encounter</button> <button onClick={exit}>Return to the forest</button></div>}
      </> : <p>Follow the jack-o’-lantern trail. The painting leads home.</p>}
    </section>}
  </main>;
}

function VitalBar({ label, value, max, stamina = false }: { label: string; value: number; max: number; stamina?: boolean }) {
  const bounded = Math.max(0, Math.min(max, value));
  return <div className={`vital-bar${stamina ? ' is-stamina' : ''}`} role='meter' aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={Math.round(bounded)}>
    <span style={{ transform: `scaleX(${bounded / max})` }} />
  </div>;
}

export default function RealmLevel({ boss = false }: { boss?: boolean }) {
  const [attempt, setAttempt] = useState(0);
  return <RealmRun key={`${boss}-${attempt}`} boss={boss} retry={() => setAttempt(n => n + 1)} />;
}
