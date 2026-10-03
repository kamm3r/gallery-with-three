import { useThree } from "@react-three/fiber";
import {
  CapsuleCollider,
  RigidBody,
  useBeforePhysicsStep,
  useRapier,
  type RapierCollider,
  type RapierRigidBody,
} from "@react-three/rapier";
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import * as THREE from "three";
import { controllerDefaults, type ControllerTuning } from "../gameplay/controllerTuning";
import { dampYaw, stepPlanarVelocity } from "../gameplay/movement";
import type { PlayerBodyData } from "../gameplay/playerBody";
import { canCoyoteJump, getGravityScale } from "../gameplay/playerRules";

// Kinematic character controller: Rapier's KinematicCharacterController does
// collide-and-slide (skin width, auto-step, snap-to-ground, slope limits) and
// this component owns every velocity decision. No springs, no impulses, so
// the numbers in controllerTuning.ts are exactly what you feel.

export interface MovementInput {
  forward: boolean;
  backward: boolean;
  leftward: boolean;
  rightward: boolean;
  run: boolean;
  jump: boolean;
}

export interface CharacterHandle {
  body: RapierRigidBody | null;
  /** Authoritative velocity (m/s). Write to it to push the character. */
  velocity: THREE.Vector3;
  isOnGround: boolean;
  /** Standing on a moving (non-fixed) body. */
  isOnPlatform: boolean;
  /** Braking against a reversed input at speed. */
  skidding: boolean;
  /** Rising from a player jump (release cuts the arc). */
  jumping: boolean;
  /** Planar velocity relative to whatever the character stands on. */
  relativeVelOnPlane: THREE.Vector3;
  /** Horizontal facing (body +Z). */
  bodyZAxis: THREE.Vector3;
  groundNormal: THREE.Vector3;
  setMovement: (movement: Partial<MovementInput>) => void;
  /** Sets vertical speed and leaves the ground (jump pads, springs). */
  launch: (verticalSpeed: number, planarScale?: number) => void;
}

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

// Rapier types come from @react-three/rapier's own copy of the engine.
type RapierWorld = ReturnType<typeof useRapier>["world"];
type KinematicCharacterController = ReturnType<RapierWorld["createCharacterController"]>;

/** Downward speed held while grounded so contact never lapses. */
const GROUND_STICK_SPEED = -1;

const up = new THREE.Vector3(0, 1, 0);
const wish = { x: 0, z: 0 };
const planar = { x: 0, z: 0 };
const desired = new THREE.Vector3();
const carry = new THREE.Vector3();
const localOffset = new THREE.Vector3();
const scratchQuat = new THREE.Quaternion();
const scratchQuat2 = new THREE.Quaternion();
const landingPosition = new THREE.Vector3();
const landingRotation = new THREE.Quaternion();
const facing = new THREE.Vector3();
const cameraDirection = new THREE.Vector3();
const nextTranslation = { x: 0, y: 0, z: 0 };
const nextRotation = { x: 0, y: 0, z: 0, w: 1 };
const groundRayOrigin = { x: 0, y: 0, z: 0 };
const surfaceOrigin = { x: 0, y: 0, z: 0 };
let ridingHandle = Number.NaN;
const ridden = (other: RapierCollider) => other.parent()?.handle === ridingHandle;
const notRidden = (other: RapierCollider) => !ridden(other);
const groundRayDirection = { x: 0, y: -1, z: 0 };

interface PlatformTrack {
  body: RapierRigidBody | null;
  position: THREE.Vector3;
  rotation: THREE.Quaternion;
}

// Platform pose as of the end of the coming step. Kinematic platforms usually
// queue it before the player runs (they mount first), which makes the carry
// exact. If not, `next` still equals the current pose and the carry trails by
// one step. Either way the same rule on both ends keeps it consistent.
function platformTranslation(body: RapierRigidBody) {
  return body.isKinematic() ? body.nextTranslation() : body.translation();
}

function platformRotation(body: RapierRigidBody) {
  return body.isKinematic() ? body.nextRotation() : body.rotation();
}

/** Moves `point` by the platform's rigid motion between two poses. */
function platformDisplacement(
  point: THREE.Vector3,
  fromPosition: THREE.Vector3,
  fromRotation: THREE.Quaternion,
  toPosition: { x: number; y: number; z: number },
  toRotation: { x: number; y: number; z: number; w: number },
  out: THREE.Vector3,
) {
  localOffset
    .copy(point)
    .sub(fromPosition)
    .applyQuaternion(scratchQuat.copy(fromRotation).invert());
  scratchQuat2.set(toRotation.x, toRotation.y, toRotation.z, toRotation.w);
  return out
    .copy(localOffset)
    .applyQuaternion(scratchQuat2)
    .add(localOffset.set(toPosition.x, toPosition.y, toPosition.z))
    .sub(point);
}

/** Yaw change of a platform rotation, measured on its projected forward axis. */
function platformYawDelta(
  fromRotation: THREE.Quaternion,
  toRotation: { x: number; y: number; z: number; w: number },
) {
  facing.set(0, 0, 1).applyQuaternion(fromRotation);
  const before = Math.atan2(facing.x, facing.z);
  scratchQuat2.set(toRotation.x, toRotation.y, toRotation.z, toRotation.w);
  facing.set(0, 0, 1).applyQuaternion(scratchQuat2);
  return Math.atan2(facing.x, facing.z) - before;
}

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
    const kccRef = useRef<KinematicCharacterController | null>(null);
    const movement = useRef<MovementInput>({
      forward: false,
      backward: false,
      leftward: false,
      rightward: false,
      run: false,
      jump: false,
    });
    const jumpWasHeld = useRef(false);
    const jumpBuffer = useRef(0);
    const airTime = useRef(0);
    const launched = useRef(false);
    const platform = useRef<PlatformTrack>({
      body: null,
      position: new THREE.Vector3(),
      rotation: new THREE.Quaternion(),
    });
    const enableRef = useRef(enable);
    const suspendedRef = useRef(suspended);
    const tuningRef = useRef(tuning);
    useLayoutEffect(() => {
      enableRef.current = enable;
      suspendedRef.current = suspended;
      tuningRef.current = tuning;
    });
    const { skinWidth, slopeMaxAngle, stepHeight, snapDistance } = tuning;

    const handle = useMemo<CharacterHandle>(
      () => ({
        body: null,
        velocity: new THREE.Vector3(),
        isOnGround: false,
        isOnPlatform: false,
        skidding: false,
        jumping: false,
        relativeVelOnPlane: new THREE.Vector3(),
        bodyZAxis: new THREE.Vector3(0, 0, 1),
        groundNormal: new THREE.Vector3(0, 1, 0),
        setMovement(next) {
          Object.assign(movement.current, next);
        },
        launch(verticalSpeed, planarScale = 1) {
          handle.velocity.set(
            handle.velocity.x * planarScale,
            verticalSpeed,
            handle.velocity.z * planarScale,
          );
          handle.jumping = false;
          handle.isOnGround = false;
          launched.current = true;
        },
      }),
      [],
    );
    // Sensors (pads, checkpoints) find the player through this tag.
    const bodyTag = useMemo<PlayerBodyData>(
      () => ({ player: true, launch: handle.launch }),
      [handle],
    );

    useImperativeHandle(ref, () => handle, [handle]);

    useEffect(() => {
      const kcc = world.createCharacterController(skinWidth);
      kcc.setUp(up);
      kcc.setMaxSlopeClimbAngle(slopeMaxAngle);
      kcc.setMinSlopeSlideAngle(slopeMaxAngle + THREE.MathUtils.degToRad(5));
      kcc.enableAutostep(stepHeight, capsuleRadius * 0.5, false);
      kcc.enableSnapToGround(snapDistance);
      kcc.setSlideEnabled(true);
      // Pushing is done below as an inelastic collision, so its strength
      // follows `mass` predictably instead of the controller's impulses.
      kcc.setApplyImpulsesToDynamicBodies(false);
      kccRef.current = kcc;
      return () => {
        kccRef.current = null;
        world.removeCharacterController(kcc);
      };
    }, [world, skinWidth, slopeMaxAngle, stepHeight, snapDistance, capsuleRadius]);

    useBeforePhysicsStep(() => {
      const body = bodyRef.current;
      const collider = colliderRef.current;
      const kcc = kccRef.current;
      handle.body = body;
      if (!body || !collider || !kcc) return;
      if (suspendedRef.current?.()) {
        platform.current.body = null;
        jumpBuffer.current = 0;
        return;
      }
      const dt = world.timestep;
      const settings = tuningRef.current;
      const velocity = handle.velocity;
      const input = movement.current;
      const enabled = enableRef.current;
      const position = body.translation();
      const rotation = body.rotation();
      let bodyYaw = 2 * Math.atan2(rotation.y, rotation.w);

      // Moving ground we stand on. Its motion is applied after the sweep.
      const track = platform.current;
      const riding = track.body && handle.isOnGround && track.body.isValid() ? track.body : null;

      // --- Kinematic shoves: platforms and sweepers don't collide with a
      // kinematic character, so push out of whatever they drove into us.
      // The platform we ride is left out: the carry keeps us on it exactly.
      carry.set(0, 0, 0);
      world.contactPairsWith(collider, (other) => {
        const otherBody = other.parent();
        if (!otherBody?.isKinematic() || other.isSensor()) return;
        if (riding && otherBody.handle === riding.handle) return;
        world.contactPair(collider, other, (manifold, flipped) => {
          let depth = 0;
          for (let i = 0; i < manifold.numContacts(); i++) {
            depth = Math.max(depth, -manifold.contactDist(i));
          }
          if (depth <= 0) return;
          // The manifold normal points from its first collider to its second.
          const n = manifold.normal();
          const sign = flipped ? 1 : -1;
          carry.x += n.x * depth * sign;
          carry.y += n.y * depth * sign;
          carry.z += n.z * depth * sign;
        });
      });

      // --- Input, relative to the camera.
      const forward = enabled ? Number(input.forward) - Number(input.backward) : 0;
      const side = enabled ? Number(input.rightward) - Number(input.leftward) : 0;
      camera.getWorldDirection(cameraDirection);
      const camYaw = Math.atan2(cameraDirection.x, cameraDirection.z);
      wish.x = Math.sin(camYaw) * forward - Math.cos(camYaw) * side;
      wish.z = Math.cos(camYaw) * forward + Math.sin(camYaw) * side;
      const wishLength = Math.hypot(wish.x, wish.z);
      if (wishLength > 0) {
        wish.x /= wishLength;
        wish.z /= wishLength;
      }

      // --- Planar velocity.
      planar.x = velocity.x;
      planar.z = velocity.z;
      handle.skidding = stepPlanarVelocity(
        planar,
        {
          wish,
          maxSpeed: input.run ? settings.runSpeed : settings.walkSpeed,
          grounded: handle.isOnGround,
          skidding: handle.skidding,
          dt,
        },
        settings,
      );
      velocity.x = planar.x;
      velocity.z = planar.z;

      // --- Jump: buffered presses, coyote time, variable height.
      const jumpHeld = enabled && input.jump;
      if (jumpHeld && !jumpWasHeld.current) jumpBuffer.current = settings.jumpBuffer;
      jumpWasHeld.current = jumpHeld;
      jumpBuffer.current = Math.max(0, jumpBuffer.current - dt);
      airTime.current = handle.isOnGround ? 0 : airTime.current + dt;
      if (
        jumpBuffer.current > 0 &&
        (handle.isOnGround ||
          canCoyoteJump(
            { airTime: airTime.current, jumping: handle.jumping, verticalSpeed: velocity.y },
            settings.coyoteTime,
          ))
      ) {
        velocity.y = settings.jumpSpeed;
        handle.jumping = true;
        handle.isOnGround = false;
        jumpBuffer.current = 0;
        airTime.current = Number.POSITIVE_INFINITY;
      }

      // --- Gravity.
      const gravity = -world.gravity.y;
      if (handle.isOnGround && !launched.current) {
        velocity.y = GROUND_STICK_SPEED;
      } else {
        if (velocity.y <= 0) handle.jumping = false;
        velocity.y -=
          gravity * getGravityScale(velocity.y, jumpHeld, handle.jumping, settings) * dt;
        velocity.y = Math.max(velocity.y, -settings.fallMaxSpeed);
      }
      launched.current = false;

      // --- Collide and slide.
      desired.set(velocity.x * dt + carry.x, velocity.y * dt + carry.y, velocity.z * dt + carry.z);
      // Rapier's controller drags the character along kinematic ground on
      // its own (`kinematic_friction_translation`), but only on steps where
      // its sweep touches it, and along last step's linear velocity: that
      // stutters, and spirals you off anything that spins. So the platform
      // we ride is left out of the sweep and followed exactly below.
      ridingHandle = riding ? riding.handle : Number.NaN;
      kcc.computeColliderMovement(
        collider,
        desired,
        rapier.QueryFilterFlags.EXCLUDE_SENSORS,
        undefined,
        riding ? notRidden : undefined,
      );
      const moved = kcc.computedMovement();
      let grounded = kcc.computedGrounded() && velocity.y <= 0;
      let floorBody: RapierRigidBody | null = null;

      // Stand on the ridden platform: drop onto its surface from step height,
      // which also walks up its slopes. Missing it means we walked off.
      if (riding && velocity.y <= 0) {
        surfaceOrigin.x = position.x + moved.x;
        surfaceOrigin.y = position.y + moved.y + settings.stepHeight;
        surfaceOrigin.z = position.z + moved.z;
        const surface = world.castShape(
          surfaceOrigin,
          collider.rotation(),
          groundRayDirection,
          collider.shape,
          settings.skinWidth,
          settings.stepHeight + settings.snapDistance,
          false,
          rapier.QueryFilterFlags.EXCLUDE_SENSORS,
          undefined,
          undefined,
          undefined,
          ridden,
        );
        if (surface) {
          moved.y = surfaceOrigin.y - surface.time_of_impact - position.y;
          grounded = true;
          floorBody = riding;
        }
      }

      // Strip velocity going into walls and ceilings so it doesn't build up.
      for (let i = 0; i < kcc.numComputedCollisions(); i++) {
        const hit = kcc.computedCollision(i);
        if (!hit) continue;
        // normal1 is on the character, pointing at the obstacle.
        const n = hit.normal1;
        if (n.y < -0.6) {
          floorBody ??= hit.collider?.parent() ?? null;
          continue;
        }
        if (n.y > 0.6) {
          if (velocity.y > 0) velocity.y = 0; // head bump
          continue;
        }
        const planarLength = Math.hypot(n.x, n.z);
        if (planarLength < 1e-4) continue;
        const nx = n.x / planarLength;
        const nz = n.z / planarLength;
        const into = velocity.x * nx + velocity.z * nz;
        if (into <= 0) continue;
        // Dynamic obstacle: both leave at the shared (inelastic) speed, so
        // light crates slide ahead and heavy ones barely budge.
        let keep = 0;
        const obstacle = hit.collider?.parent();
        if (obstacle?.isDynamic()) {
          const obstacleMass = obstacle.mass();
          const obstacleVelocity = obstacle.linvel();
          const obstacleInto = obstacleVelocity.x * nx + obstacleVelocity.z * nz;
          const shared =
            (settings.mass * into + obstacleMass * obstacleInto) / (settings.mass + obstacleMass);
          if (shared > obstacleInto) {
            const impulse = obstacleMass * (shared - obstacleInto);
            obstacle.applyImpulse({ x: nx * impulse, y: 0, z: nz * impulse }, true);
          }
          keep = Math.max(0, shared);
        }
        velocity.x -= nx * (into - keep);
        velocity.z -= nz * (into - keep);
      }

      nextTranslation.x = position.x + moved.x;
      nextTranslation.y = position.y + moved.y;
      nextTranslation.z = position.z + moved.z;

      // --- Ground probe: normal and which body carries us. Cast from the
      // swept position, which matches the world's current poses.
      groundRayOrigin.x = nextTranslation.x;
      groundRayOrigin.y = nextTranslation.y;
      groundRayOrigin.z = nextTranslation.z;
      const groundHit = grounded
        ? world.castRayAndGetNormal(
            new rapier.Ray(groundRayOrigin, groundRayDirection),
            capsuleHalfHeight + capsuleRadius + settings.snapDistance,
            true,
            rapier.QueryFilterFlags.EXCLUDE_SENSORS,
            undefined,
            undefined,
            body,
          )
        : null;
      // The sweep's floor contact covers the whole capsule base; the ray only
      // the center, which misses when standing near a platform's edge.
      const groundBody = grounded ? (floorBody ?? groundHit?.collider.parent() ?? null) : null;
      const moving = groundBody && !groundBody.isFixed() ? groundBody : null;
      if (groundHit && groundBody?.isDynamic()) {
        // Stand with real weight on seesaws, bridges and crates.
        const weight = settings.mass * gravity * dt;
        groundBody.applyImpulseAtPoint(
          { x: 0, y: -weight, z: 0 },
          {
            x: groundRayOrigin.x,
            y: groundRayOrigin.y - groundHit.timeOfImpact,
            z: groundRayOrigin.z,
          },
          true,
        );
      }

      // --- Moving ground: the sweep ran against the platform's current pose,
      // so the result is exact in the platform's frame. Carry it rigidly to
      // the platform's pose after this step. Sweeping the carry instead
      // collides with where the platform is now and fights the ride.
      const carrier = riding ?? moving;
      if (carrier) {
        // Riding: measure from the tracked pose (the same rule as the end
        // pose, so a platform that moves after us still carries, one step
        // late). Just landed: the sweep saw its current pose.
        const tracked = carrier === riding;
        const at = carrier.translation();
        const turn = carrier.rotation();
        const from = tracked ? track.position : landingPosition.set(at.x, at.y, at.z);
        const fromRotation = tracked
          ? track.rotation
          : landingRotation.set(turn.x, turn.y, turn.z, turn.w);
        const to = platformTranslation(carrier);
        const toRotation = platformRotation(carrier);
        platformDisplacement(
          desired.set(nextTranslation.x, nextTranslation.y, nextTranslation.z),
          from,
          fromRotation,
          to,
          toRotation,
          carry,
        );
        nextTranslation.x += carry.x;
        nextTranslation.y += carry.y;
        nextTranslation.z += carry.z;
        bodyYaw += platformYawDelta(fromRotation, toRotation);
        if (!grounded) {
          // Leaving the platform (jump or walk-off): keep its momentum.
          velocity.x += carry.x / dt;
          velocity.z += carry.z / dt;
          if (carry.y > 0) velocity.y += carry.y / dt;
        }
      }
      body.setNextKinematicTranslation(nextTranslation);
      track.body = moving;
      if (moving) {
        const at = platformTranslation(moving);
        const turn = platformRotation(moving);
        track.position.set(at.x, at.y, at.z);
        track.rotation.set(turn.x, turn.y, turn.z, turn.w);
      }

      // --- Facing: turn toward input, slower in the air.
      if (wishLength > 0) {
        bodyYaw = dampYaw(
          bodyYaw,
          Math.atan2(wish.x, wish.z),
          grounded ? settings.facingDampGround : settings.facingDampAir,
          dt,
        );
      }
      nextRotation.y = Math.sin(bodyYaw / 2);
      nextRotation.w = Math.cos(bodyYaw / 2);
      body.setNextKinematicRotation(nextRotation);

      if (grounded && handle.jumping) handle.jumping = false;
      handle.isOnGround = grounded;
      handle.isOnPlatform = moving !== null;
      if (groundHit)
        handle.groundNormal.set(groundHit.normal.x, groundHit.normal.y, groundHit.normal.z);
      else handle.groundNormal.set(0, 1, 0);
      handle.relativeVelOnPlane.set(velocity.x, 0, velocity.z);
      handle.bodyZAxis.set(Math.sin(bodyYaw), 0, Math.cos(bodyYaw));
    });

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
