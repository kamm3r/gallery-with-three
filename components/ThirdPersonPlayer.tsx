import { useFrame, useThree } from '@react-three/fiber';
import { useBeforePhysicsStep, useRapier } from '@react-three/rapier';
import { Ecctrl, type EcctrlHandle } from 'ecctrl';
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type RefObject,
  type SetStateAction,
} from 'react';
import * as THREE from 'three';
import { canEnterPortal, getGravityScale } from '../gameplay/playerRules';
import {
  usePlayerControls,
  type PlayerControls,
} from '../hooks/usePlayerControls';
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

interface PlayerRuntimeProps {
  controllerRef: RefObject<EcctrlHandle | null>;
  headingRef: RefObject<THREE.Group | null>;
  characterVisualRef: RefObject<THREE.Group | null>;
  controlsRef: MutableRefObject<PlayerControls>;
  portals: PlayerPortal[];
  boundary: number;
  bounds?: [number, number];
  cameraDistance: number;
  cameraYawRef: MutableRefObject<number>;
  cameraHeightRef: MutableRefObject<number>;
  enteringRef: MutableRefObject<boolean>;
  setAction: Dispatch<SetStateAction<ActionName>>;
  onNearPortal: (portalId: string | null) => void;
  onEnterPortal: (portalId: string) => void;
}

const PLAYER_CENTER_HEIGHT = 0.94;
const JUMP_SPEED = 8.4;
const WALK_SPEED = 4.8;
const RUN_SPEED = 7.5;

const cameraTarget = new THREE.Vector3();
const desiredCameraPosition = new THREE.Vector3();
const cameraGround = new THREE.Vector3();
const cameraForward = new THREE.Vector3();
const cameraRayDirection = new THREE.Vector3();
const renderedPlayerPosition = new THREE.Vector3();

function PlayerRuntime({
  controllerRef,
  headingRef,
  characterVisualRef,
  controlsRef,
  portals,
  boundary,
  bounds,
  cameraDistance,
  cameraYawRef,
  cameraHeightRef,
  enteringRef,
  setAction,
  onNearPortal,
  onEnterPortal,
}: PlayerRuntimeProps) {
  const { camera } = useThree();
  const { world, rapier } = useRapier();
  const wasGrounded = useRef(true);
  const previousVerticalSpeed = useRef(0);
  const landingCompression = useRef(0);
  const proximity = useRef<string | null>(null);
  const actionRef = useRef<ActionName>('Idle');

  useBeforePhysicsStep(() => {
    const player = controllerRef.current;
    if (!player || player.isOnGround) return;
    const velocity = player.body.linvel();
    player.body.setGravityScale(
      getGravityScale(velocity.y, controlsRef.current.jump),
      true
    );
  });

  useFrame((_, rawDelta) => {
    const player = controllerRef.current;
    const headingGroup = headingRef.current;
    if (!player || !headingGroup) return;

    const delta = Math.min(rawDelta, 0.05);
    const body = player.body;
    const position = body.translation();
    const velocity = body.linvel();
    const grounded = player.isOnGround;
    const input = controlsRef.current;
    const moving =
      !enteringRef.current &&
      (input.forward || input.backward || input.left || input.right);

    if (
      grounded &&
      !wasGrounded.current &&
      previousVerticalSpeed.current < -2
    ) {
      landingCompression.current = 1;
    }
    wasGrounded.current = grounded;
    previousVerticalSpeed.current = velocity.y;

    const visual = characterVisualRef.current;
    if (visual) {
      landingCompression.current = Math.max(
        0,
        landingCompression.current - delta * 8
      );
      const compression = landingCompression.current;
      const stretch = grounded
        ? 0
        : Math.min(Math.abs(velocity.y) / JUMP_SPEED, 1) * 0.035;
      visual.scale.set(
        1 + compression * 0.05 - stretch * 0.25,
        1 - compression * 0.1 + stretch,
        1 + compression * 0.05 - stretch * 0.25
      );
      visual.rotation.x = THREE.MathUtils.damp(
        visual.rotation.x,
        grounded ? 0 : velocity.y > 0 ? -0.08 : 0.1,
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

    let correctedX = position.x;
    let correctedZ = position.z;
    if (bounds) {
      correctedX = THREE.MathUtils.clamp(position.x, -bounds[0], bounds[0]);
      correctedZ = THREE.MathUtils.clamp(position.z, -bounds[1], bounds[1]);
    } else {
      const distanceFromCenter = Math.hypot(position.x, position.z);
      if (distanceFromCenter > boundary) {
        const scale = boundary / distanceFromCenter;
        correctedX = position.x * scale;
        correctedZ = position.z * scale;
      }
    }
    if (correctedX !== position.x || correctedZ !== position.z) {
      body.setTranslation(
        { x: correctedX, y: position.y, z: correctedZ },
        true
      );
      body.setLinvel(
        {
          x: correctedX === position.x ? velocity.x : 0,
          y: velocity.y,
          z: correctedZ === position.z ? velocity.z : 0,
        },
        true
      );
    }

    // Follow the interpolated render transform, not Rapier's discrete pose.
    // Keeping the player and camera on the same timeline removes visual jitter.
    headingGroup.getWorldPosition(renderedPlayerPosition);
    cameraForward.set(
      -Math.sin(cameraYawRef.current),
      0,
      -Math.cos(cameraYawRef.current)
    );
    cameraTarget.set(
      renderedPlayerPosition.x,
      renderedPlayerPosition.y + 1.25,
      renderedPlayerPosition.z
    );

    desiredCameraPosition
      .copy(cameraForward)
      .multiplyScalar(-cameraDistance)
      .setY(renderedPlayerPosition.y + cameraHeightRef.current)
      .add(cameraGround.set(renderedPlayerPosition.x, 0, renderedPlayerPosition.z));

    cameraRayDirection.copy(desiredCameraPosition).sub(cameraTarget);
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
      desiredCameraPosition
        .copy(cameraRayDirection)
        .multiplyScalar(Math.max(1, cameraHit.timeOfImpact - 0.2))
        .add(cameraTarget);
    }
    camera.position.lerp(desiredCameraPosition, 1 - Math.exp(-9 * delta));
    camera.lookAt(cameraTarget);

    const feetHeight = position.y - PLAYER_CENTER_HEIGHT;
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
      !enteringRef.current &&
      canEnterPortal({ distance: nearestDistance, grounded, feetHeight })
    ) {
      enteringRef.current = true;
      onEnterPortal(nearestPortal.id);
    }
  });

  return null;
}

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
  const controllerRef = useRef<EcctrlHandle>(null);
  const headingRef = useRef<THREE.Group>(null);
  const characterVisualRef = useRef<THREE.Group>(null);
  const [initialPosition] = useState(start);
  const controlsRef = usePlayerControls();
  const { camera, gl } = useThree();
  const cameraYawRef = useRef(0);
  const cameraHeightRef = useRef(3.6);
  const enteringRef = useRef(false);
  const [action, setAction] = useState<ActionName>('Idle');

  useLayoutEffect(() => {
    const [x, y, z] = initialPosition;
    camera.position.set(x, y + 3.6, z + cameraDistance);
    cameraTarget.set(x, y + 1.25, z);
    camera.lookAt(cameraTarget);
  }, [camera, cameraDistance, initialPosition]);

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
      cameraYawRef.current -= deltaX * 0.004;
      cameraHeightRef.current = THREE.MathUtils.clamp(
        cameraHeightRef.current + deltaY * 0.008,
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

  useFrame(() => {
    const player = controllerRef.current;
    if (!player) return;
    const input = controlsRef.current;
    const enabled = !enteringRef.current;
    player.setMovement({
      forward: enabled && input.forward,
      backward: enabled && input.backward,
      leftward: enabled && input.left,
      rightward: enabled && input.right,
      run: enabled && input.run,
      jump: enabled && input.jump,
    });
  });

  return (
    <Ecctrl
      ref={controllerRef}
      position={[
        initialPosition[0],
        initialPosition[1] + PLAYER_CENTER_HEIGHT,
        initialPosition[2],
      ]}
      capsuleHalfHeight={0.5}
      capsuleRadius={0.42}
      floatHeight={0.02}
      rayHitForgiveness={0.18}
      maxWalkVel={WALK_SPEED}
      maxRunVel={RUN_SPEED}
      accDeltaTime={0.34}
      decDeltaTime={0.3}
      jumpVel={JUMP_SPEED}
      jumpDuration={0.12}
      fallingGravityScale={1}
      enableToggleRun={false}
      slopeMaxAngle={THREE.MathUtils.degToRad(50)}
      autoBalanceSpringOnY={0.2}
      autoBalanceDampingOnY={0.02}
      canSleep={false}
      ccd
      friction={0}
      restitution={0}
    >
      <PlayerRuntime
        controllerRef={controllerRef}
        headingRef={headingRef}
        characterVisualRef={characterVisualRef}
        controlsRef={controlsRef}
        portals={portals}
        boundary={boundary}
        bounds={bounds}
        cameraDistance={cameraDistance}
        cameraYawRef={cameraYawRef}
        cameraHeightRef={cameraHeightRef}
        enteringRef={enteringRef}
        setAction={setAction}
        onNearPortal={onNearPortal}
        onEnterPortal={onEnterPortal}
      />
      <group ref={headingRef} position={[0, -PLAYER_CENTER_HEIGHT, 0]}>
        <group ref={characterVisualRef}>
          <Casual animation={action} scale={0.82} />
        </group>
      </group>
    </Ecctrl>
  );
}
