import { useThree } from "@react-three/fiber";
import {
  CapsuleCollider,
  RigidBody,
  useBeforePhysicsStep,
  useRapier,
  type RapierRigidBody,
  type RapierCollider,
} from "@react-three/rapier";
import {
  forwardRef,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import { controllerDefaults, type ControllerTuning } from "../gameplay/controllerTuning";
import type { PlayerBodyData } from "../gameplay/playerBody";
import { createCharacterMotor, type CharacterHandle } from "../runtime/characterMotor";
export type { CharacterHandle, MovementInput } from "../runtime/characterMotor";

interface CharacterControllerProps {
  children?: ReactNode;
  /** Body center, world space. */
  position: [number, number, number];
  yaw?: number;
  capsuleHalfHeight: number;
  capsuleRadius: number;
  tuning?: ControllerTuning;
  /** Input and steering; gravity and collisions still run when false. */
  enable?: boolean;
  /** Something else owns the body this step (hang, seat, death). */
  suspended?: () => boolean;
}

/** Temporary scene adapter; movement and collision run in the native motor. */
export const CharacterController = forwardRef<CharacterHandle, CharacterControllerProps>(
  function CharacterController(
    {
      children,
      position,
      yaw = 0,
      capsuleHalfHeight,
      capsuleRadius,
      tuning = controllerDefaults,
      enable = true,
      suspended,
    },
    ref,
  ) {
    const { world, rapier } = useRapier();
    const camera = useThree((state) => state.camera);
    const bodyRef = useRef<RapierRigidBody>(null);
    const colliderRef = useRef<RapierCollider>(null);
    const latest = useRef({ tuning, enable, suspended });
    useLayoutEffect(() => {
      latest.current = { tuning, enable, suspended };
    });
    const motor = useMemo(
      () =>
        createCharacterMotor({
          world,
          rapier,
          camera,
          body: () => bodyRef.current,
          collider: () => colliderRef.current,
          capsuleHalfHeight,
          capsuleRadius,
          tuning: () => latest.current.tuning,
          enabled: () => latest.current.enable,
          suspended: () => latest.current.suspended?.() ?? false,
        }),
      [world, rapier, camera, capsuleHalfHeight, capsuleRadius],
    );
    useLayoutEffect(() => motor.mount(), [motor]);
    useLayoutEffect(
      () => motor.configure(),
      [motor, tuning.skinWidth, tuning.slopeMaxAngle, tuning.stepHeight, tuning.snapDistance],
    );
    useImperativeHandle(ref, () => motor.handle, [motor]);
    useBeforePhysicsStep(() => motor.step());
    const bodyTag = useMemo<PlayerBodyData>(
      () => ({ player: true, launch: motor.handle.launch }),
      [motor],
    );
    return (
      <RigidBody
        ref={bodyRef}
        type="kinematicPosition"
        colliders={false}
        position={position}
        rotation={[0, yaw, 0]}
        userData={bodyTag}
        canSleep={false}
      >
        <CapsuleCollider
          ref={colliderRef}
          args={[capsuleHalfHeight, capsuleRadius]}
          // Kinematic pairs are off by default: sensors need KINEMATIC_FIXED,
          // the platform push-out needs KINEMATIC_KINEMATIC contacts.
          activeCollisionTypes={
            rapier.ActiveCollisionTypes.DEFAULT |
            rapier.ActiveCollisionTypes.KINEMATIC_FIXED |
            rapier.ActiveCollisionTypes.KINEMATIC_KINEMATIC
          }
        />
        {children}
      </RigidBody>
    );
  },
);
