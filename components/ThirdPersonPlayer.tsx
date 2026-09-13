import { useFrame, useThree } from '@react-three/fiber';
import {
  CapsuleCollider,
  RigidBody,
  useRapier,
  type RapierRigidBody,
} from '@react-three/rapier';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { canEnterPortal, getGravityScale } from '../gameplay/playerRules';
import { usePlayerControls } from '../hooks/usePlayerControls';
import { Casual, type ActionName } from './Casual_Male';

type Position = [number, number, number];

export interface PlayerPortal {
  id: string;
  position: Position;
}

interface ThirdPersonPlayerProps {
  start?: Position;
  portals: PlayerPortal[];
  boundary?: number;
  bounds?: [number, number];
  cameraDistance?: number;
  onNearPortal: (portalId: string | null) => void;
  onEnterPortal: (portalId: string) => void;
  onReady?: () => void;
}

const PLAYER_CENTER_HEIGHT = 0.94;
const COYOTE_TIME = 0.1;
const JUMP_BUFFER_TIME = 0.12;
const JUMP_SPEED = 8.4;
const MAX_FALL_SPEED = 14;
const WALK_SPEED = 4.8;
const RUN_SPEED = 7.5;

const cameraTarget = new THREE.Vector3();
const cameraPosition = new THREE.Vector3();
const cameraGround = new THREE.Vector3();
const cameraForward = new THREE.Vector3();
const cameraRight = new THREE.Vector3();
const cameraRayDirection = new THREE.Vector3();
const moveDirection = new THREE.Vector3();
const upAxis = new THREE.Vector3(0, 1, 0);
const targetRotation = new THREE.Quaternion();

export function ThirdPersonPlayer({
  start = [0, 0, 6],
  portals,
  boundary = 24,
  bounds,
  cameraDistance = 6.5,
  onNearPortal,
  onEnterPortal,
  onReady,
}: ThirdPersonPlayerProps) {
  const playerBody = useRef<RapierRigidBody>(null);
  const heading = useRef<THREE.Group>(null);
  const characterVisual = useRef<THREE.Group>(null);
  const initialPosition = useRef(start);
  const controls = usePlayerControls();
  const { camera, gl } = useThree();
  const { world, rapier } = useRapier();
  const lastJumpPress = useRef(controls.current.jumpPress);
  const coyoteTime = useRef(COYOTE_TIME);
  const jumpBuffer = useRef(0);
  const landingCompression = useRef(0);
  const cameraYaw = useRef(0);
  const cameraHeight = useRef(3.6);
  const wasGrounded = useRef(true);
  const previousVerticalSpeed = useRef(0);
  const proximity = useRef<string | null>(null);
  const entering = useRef(false);
  const actionRef = useRef<ActionName>('Idle');
  const [action, setAction] = useState<ActionName>('Idle');

  useLayoutEffect(() => {
    const [x, y, z] = initialPosition.current;
    camera.position.set(x, y + 3.6, z + cameraDistance);
    cameraTarget.set(x, y + 1.25, z);
    camera.lookAt(cameraTarget);
  }, [camera, cameraDistance]);

  useEffect(() => {
    onReady?.();
  }, [onReady]);

  useEffect(() => {
    const canvas = gl.domElement;
    let dragging = false;
    let previousX = 0;
    let previousY = 0;

    const startOrbit = (event: PointerEvent) => {
      if (!event.isPrimary || event.button !== 0) return;
      dragging = true;
      previousX = event.clientX;
      previousY = event.clientY;
      canvas.setPointerCapture(event.pointerId);
    };
    const orbit = (event: PointerEvent) => {
      if (!dragging) return;
      const deltaX = event.clientX - previousX;
      const deltaY = event.clientY - previousY;
      previousX = event.clientX;
      previousY = event.clientY;
      cameraYaw.current -= deltaX * 0.004;
      cameraHeight.current = THREE.MathUtils.clamp(
        cameraHeight.current + deltaY * 0.008,
        2.65,
        4.8
      );
    };
    const stopOrbit = (event: PointerEvent) => {
      dragging = false;
      if (canvas.hasPointerCapture(event.pointerId)) {
        canvas.releasePointerCapture(event.pointerId);
      }
    };

    canvas.addEventListener('pointerdown', startOrbit);
    canvas.addEventListener('pointermove', orbit);
    canvas.addEventListener('pointerup', stopOrbit);
    canvas.addEventListener('pointercancel', stopOrbit);
    return () => {
      canvas.removeEventListener('pointerdown', startOrbit);
      canvas.removeEventListener('pointermove', orbit);
      canvas.removeEventListener('pointerup', stopOrbit);
      canvas.removeEventListener('pointercancel', stopOrbit);
    };
  }, [gl]);

  useFrame((_, rawDelta) => {
    const body = playerBody.current;
    const headingGroup = heading.current;
    if (!body || !headingGroup) return;

    const delta = Math.min(rawDelta, 0.05);
    const input = controls.current;
    const position = body.translation();
    const velocity = body.linvel();
    const groundRay = new rapier.Ray(position, { x: 0, y: -1, z: 0 });
    const groundHit = world.castRayAndGetNormal(
      groundRay,
      1.08,
      true,
      rapier.QueryFilterFlags.EXCLUDE_SENSORS,
      undefined,
      undefined,
      body
    );
    const grounded = Boolean(groundHit && groundHit.normal.y > 0.42);

    coyoteTime.current = grounded
      ? COYOTE_TIME
      : Math.max(0, coyoteTime.current - delta);
    if (input.jumpPress !== lastJumpPress.current) {
      jumpBuffer.current = JUMP_BUFFER_TIME;
      lastJumpPress.current = input.jumpPress;
    } else {
      jumpBuffer.current = Math.max(0, jumpBuffer.current - delta);
    }

    const stride = Number(input.forward) - Number(input.backward);
    const strafe = Number(input.right) - Number(input.left);
    const moving = !entering.current && (stride !== 0 || strafe !== 0);
    const speed = input.run ? RUN_SPEED : WALK_SPEED;

    cameraForward.set(
      -Math.sin(cameraYaw.current),
      0,
      -Math.cos(cameraYaw.current)
    );
    cameraRight.crossVectors(cameraForward, camera.up).normalize();
    moveDirection
      .copy(cameraForward)
      .multiplyScalar(stride)
      .addScaledVector(cameraRight, strafe);

    if (moving) {
      moveDirection.normalize();
      const targetYaw = Math.atan2(moveDirection.x, moveDirection.z) - Math.PI;
      headingGroup.quaternion.slerp(
        targetRotation.setFromAxisAngle(upAxis, targetYaw),
        1 - Math.exp(-16 * delta)
      );
    } else {
      moveDirection.set(0, 0, 0);
    }

    const platformVelocity = groundHit?.collider.parent()?.linvel();
    const targetX = moveDirection.x * speed + (platformVelocity?.x ?? 0);
    const targetZ = moveDirection.z * speed + (platformVelocity?.z ?? 0);
    const response = moving ? (grounded ? 22 : 8) : grounded ? 28 : 3.5;
    let nextX = THREE.MathUtils.damp(velocity.x, targetX, response, delta);
    let nextZ = THREE.MathUtils.damp(velocity.z, targetZ, response, delta);

    if (bounds) {
      if (Math.abs(position.x) >= bounds[0] && position.x * nextX > 0) nextX = 0;
      if (Math.abs(position.z) >= bounds[1] && position.z * nextZ > 0) nextZ = 0;
    } else if (
      Math.hypot(position.x + nextX * delta, position.z + nextZ * delta) >
      boundary
    ) {
      nextX = 0;
      nextZ = 0;
    }

    let nextY = Math.max(velocity.y, -MAX_FALL_SPEED);
    if (
      !entering.current &&
      jumpBuffer.current > 0 &&
      coyoteTime.current > 0
    ) {
      nextY = JUMP_SPEED;
      jumpBuffer.current = 0;
      coyoteTime.current = 0;
    }
    body.setGravityScale(getGravityScale(nextY, input.jump), true);
    body.setLinvel({ x: nextX, y: nextY, z: nextZ }, true);

    if (
      grounded &&
      !wasGrounded.current &&
      previousVerticalSpeed.current < -2
    ) {
      landingCompression.current = 1;
    }
    wasGrounded.current = grounded;
    previousVerticalSpeed.current = nextY;

    const visual = characterVisual.current;
    if (visual) {
      landingCompression.current = Math.max(
        0,
        landingCompression.current - delta * 8
      );
      const compression = landingCompression.current;
      const stretch = grounded
        ? 0
        : Math.min(Math.abs(nextY) / JUMP_SPEED, 1) * 0.035;
      visual.scale.set(
        1 + compression * 0.05 - stretch * 0.25,
        1 - compression * 0.1 + stretch,
        1 + compression * 0.05 - stretch * 0.25
      );
      visual.rotation.x = THREE.MathUtils.damp(
        visual.rotation.x,
        grounded ? 0 : nextY > 0 ? -0.08 : 0.1,
        10,
        delta
      );
    }

    const nextAction: ActionName = !grounded
      ? 'Idle'
      : moving
        ? input.run
          ? 'Run'
          : 'Walk'
        : 'Idle';
    if (nextAction !== actionRef.current) {
      actionRef.current = nextAction;
      setAction(nextAction);
    }

    const feetHeight = position.y - PLAYER_CENTER_HEIGHT;
    cameraTarget.set(position.x, feetHeight + 1.25, position.z);
    cameraPosition
      .copy(cameraForward)
      .multiplyScalar(-cameraDistance)
      .setY(feetHeight + cameraHeight.current)
      .add(cameraGround.set(position.x, 0, position.z));
    cameraRayDirection.copy(cameraPosition).sub(cameraTarget);
    const desiredCameraDistance = cameraRayDirection.length();
    cameraRayDirection.normalize();
    const cameraHit = world.castRay(
      new rapier.Ray(cameraTarget, cameraRayDirection),
      desiredCameraDistance,
      true,
      rapier.QueryFilterFlags.EXCLUDE_SENSORS,
      undefined,
      undefined,
      body
    );
    if (cameraHit) {
      cameraPosition
        .copy(cameraRayDirection)
        .multiplyScalar(Math.max(1, cameraHit.timeOfImpact - 0.2))
        .add(cameraTarget);
    }
    camera.position.lerp(cameraPosition, 1 - Math.exp(-7 * delta));
    camera.lookAt(cameraTarget);

    let nearestPortal: PlayerPortal | undefined;
    let nearestDistance = Number.POSITIVE_INFINITY;
    for (const portal of portals) {
      const distance = Math.hypot(
        position.x - portal.position[0],
        position.z - portal.position[2]
      );
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestPortal = portal;
      }
    }

    const nearPortal = nearestDistance < 3.25 ? nearestPortal?.id ?? null : null;
    if (nearPortal !== proximity.current) {
      proximity.current = nearPortal;
      onNearPortal(nearPortal);
    }
    if (
      nearestPortal &&
      !entering.current &&
      canEnterPortal({ distance: nearestDistance, grounded, feetHeight })
    ) {
      entering.current = true;
      onEnterPortal(nearestPortal.id);
    }

  });

  return (
    <RigidBody
      ref={playerBody}
      colliders={false}
      enabledRotations={[false, false, false]}
      canSleep={false}
      ccd
      friction={0.7}
      restitution={0}
      position={[
        start[0],
        start[1] + PLAYER_CENTER_HEIGHT,
        start[2],
      ]}
    >
      <CapsuleCollider args={[0.5, 0.42]} friction={0.7} />
      <group ref={heading} position={[0, -PLAYER_CENTER_HEIGHT, 0]}>
        <group ref={characterVisual}>
          <Casual animation={action} scale={0.82} rotation={[0, Math.PI, 0]} />
        </group>
      </group>
    </RigidBody>
  );
}
