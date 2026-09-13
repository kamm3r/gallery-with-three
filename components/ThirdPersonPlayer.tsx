import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { Casual, type ActionName } from './Casual_Male';
import { usePlayerControls } from '../hooks/usePlayerControls';

type Position = [number, number, number];

interface ThirdPersonPlayerProps {
  start?: Position;
  portalPosition: Position;
  boundary?: number;
  onNearPortal: (near: boolean) => void;
  onEnterPortal: () => void;
  onReady?: () => void;
}

const cameraTarget = new THREE.Vector3();
const cameraPosition = new THREE.Vector3();
const cameraForward = new THREE.Vector3();
const cameraRight = new THREE.Vector3();
const moveDirection = new THREE.Vector3();
const cameraLift = new THREE.Vector3(0, 3.6, 0);
const upAxis = new THREE.Vector3(0, 1, 0);
const targetRotation = new THREE.Quaternion();

export function ThirdPersonPlayer({
  start = [0, 0, 6],
  portalPosition,
  boundary = 24,
  onNearPortal,
  onEnterPortal,
  onReady,
}: ThirdPersonPlayerProps) {
  const character = useRef<THREE.Group>(null);
  const initialPosition = useRef(start);
  const controls = usePlayerControls();
  const { camera } = useThree();
  const verticalSpeed = useRef(0);
  const jumpHeld = useRef(false);
  const proximity = useRef(false);
  const entering = useRef(false);
  const actionRef = useRef<ActionName>('Idle');
  const [action, setAction] = useState<ActionName>('Idle');

  useLayoutEffect(() => {
    if (!character.current) return;
    character.current.position.set(...initialPosition.current);
  }, []);

  useEffect(() => {
    onReady?.();
  }, [onReady]);

  useFrame((_, rawDelta) => {
    const group = character.current;
    if (!group) return;

    const delta = Math.min(rawDelta, 0.05);
    const input = controls.current;
    const stride = Number(input.forward) - Number(input.backward);
    const strafe = Number(input.right) - Number(input.left);
    const moving = stride !== 0 || strafe !== 0;
    const speed = input.run ? 7.5 : 4.8;

    camera.getWorldDirection(cameraForward);
    cameraForward.y = 0;
    cameraForward.normalize();
    cameraRight.crossVectors(cameraForward, camera.up).normalize();
    moveDirection
      .copy(cameraForward)
      .multiplyScalar(stride)
      .addScaledVector(cameraRight, strafe);

    if (moving) {
      moveDirection.normalize();
      group.position.addScaledVector(moveDirection, speed * delta);
      const targetYaw = Math.atan2(moveDirection.x, moveDirection.z) - Math.PI;
      const turnAmount = 1 - Math.exp(-16 * delta);
      group.quaternion.slerp(
        targetRotation.setFromAxisAngle(upAxis, targetYaw),
        turnAmount
      );
    }
    const distanceFromCenter = Math.hypot(group.position.x, group.position.z);
    if (distanceFromCenter > boundary) {
      const scale = boundary / distanceFromCenter;
      group.position.x *= scale;
      group.position.z *= scale;
    }

    if (input.jump && !jumpHeld.current && group.position.y <= 0.001) {
      verticalSpeed.current = 6.2;
    }
    jumpHeld.current = input.jump;
    verticalSpeed.current -= 16 * delta;
    group.position.y = Math.max(
      0,
      group.position.y + verticalSpeed.current * delta
    );
    if (group.position.y === 0) verticalSpeed.current = 0;

    const nextAction: ActionName = moving
      ? input.run
        ? 'Run'
        : 'Walk'
      : 'Idle';
    if (nextAction !== actionRef.current) {
      actionRef.current = nextAction;
      setAction(nextAction);
    }

    cameraTarget.set(group.position.x, group.position.y + 1.25, group.position.z);
    cameraPosition
      .copy(cameraForward)
      .multiplyScalar(-6.5)
      .add(group.position)
      .add(cameraLift);
    const follow = 1 - Math.exp(-5 * delta);
    camera.position.lerp(cameraPosition, follow);
    camera.lookAt(cameraTarget);

    const portalDistance = Math.hypot(
      group.position.x - portalPosition[0],
      group.position.z - portalPosition[2]
    );
    const isNear = portalDistance < 3.25;
    if (isNear !== proximity.current) {
      proximity.current = isNear;
      onNearPortal(isNear);
    }
    if (portalDistance < 1.15 && !entering.current) {
      entering.current = true;
      onEnterPortal();
    }
  });

  return (
    <group ref={character}>
      <Casual animation={action} scale={0.82} rotation={[0, Math.PI, 0]} />
      <mesh position={[0, 0.06, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.42, 24]} />
        <meshBasicMaterial color='#132018' transparent opacity={0.22} />
      </mesh>
    </group>
  );
}
