import { useFrame, useThree } from "@react-three/fiber";
import { useGame } from "../gameSettings";
import { useBeforePhysicsStep, useRapier } from "@react-three/rapier";
import { Ecctrl, type EcctrlHandle } from "ecctrl";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type RefObject,
  type SetStateAction,
} from "react";
import * as THREE from "three";
import { groundHeight } from "../gameplay/terrain";
import type { Encounter } from "../gameplay/bossEncounter";
import { CLIP_SECONDS, LEDGE_HAND_HEIGHT, climbProgress } from "../gameplay/characterAnimations";
import { playSound } from "../gameplay/sound";
import { isResultScreenActive } from "../gameplay/resultScreen";
import { useWorld } from "koota/react";
import { PlayerView } from "../gameplay/ecs/traits";
import {
  canEnterPortal,
  canGrabLedge,
  consumeRollPress,
  getGravityScale,
  HANG_TIMEOUT,
  LEDGE_TOP_MAX,
  LEDGE_WALL_REACH,
  ROLL_COOLDOWN,
  ROLL_DURATION,
  ROLL_SPEED,
} from "../gameplay/playerRules";
import { usePlayerControls, type PlayerControls } from "../hooks/usePlayerControls";
import { AnimatedCharacter, type ActionName } from "./AnimatedCharacter";
import { DustPuffs } from "./DustPuffs";

type Position = [number, number, number];

export interface PlayerPortal {
  id: string;
  position: Position;
  yaw?: number;
  scale?: number;
  flat?: boolean;
}

interface ThirdPersonPlayerProps {
  combat?: MutableRefObject<Encounter>;
  start?: Position;
  startYaw?: number;
  respawn?: Position;
  portals: PlayerPortal[];
  boundary?: number;
  bounds?: [number, number];
  cameraDistance?: number;
  onNearPortal: (portalId: string | null) => void;
  onEnterPortal: (portalId: string) => void;
  onHangChange: (hanging: boolean) => void;
  onReady?: () => void;
}

interface PlayerRuntimeProps {
  combat?: MutableRefObject<Encounter>;
  seatRef: MutableRefObject<{
    active: boolean;
    press: number;
    standing: number;
    elapsed: number;
    position: THREE.Vector3;
    yaw: number;
  }>;
  respawn: Position;
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
  hangRef: MutableRefObject<HangState>;
  rollRef: MutableRefObject<RollState>;
  setAction: Dispatch<SetStateAction<ActionName>>;
  onNearPortal: (portalId: string | null) => void;
  onEnterPortal: (portalId: string) => void;
  onHangChange: (hanging: boolean) => void;
}

interface HangState {
  active: boolean;
  climbTime: number;
  climbStart: THREE.Vector3;
  time: number;
  lastJumpPress: number;
  /** Top surface point of the grabbed ledge (world). */
  point: THREE.Vector3;
  /** Wall normal, pointing back toward the player (horizontal). */
  normal: THREE.Vector3;
  /** Horizontal approach direction at grab time. */
  forward: THREE.Vector3;
}

interface RollState {
  active: boolean;
  elapsed: number;
  cooldown: number;
  lastPress: number;
  /** Horizontal burst direction at trigger time. */
  dir: THREE.Vector3;
}

const PLAYER_CENTER_HEIGHT = 1.12;
const JUMP_SPEED = 8.4;
const WALK_SPEED = 4.8;
const RUN_SPEED = 7.5;

const cameraTarget = new THREE.Vector3();
const desiredCameraPosition = new THREE.Vector3();
const cameraGround = new THREE.Vector3();
const cameraForward = new THREE.Vector3();
const cameraRayDirection = new THREE.Vector3();
const renderedPlayerPosition = new THREE.Vector3();
// Scratch temps for the ledge-grab prototype (no per-frame allocation).
const ledgeOrigin = new THREE.Vector3();
const ledgeDirection = new THREE.Vector3();
const ledgeTopOrigin = new THREE.Vector3();
const ledgeDown = new THREE.Vector3(0, -1, 0);
const hangTarget = new THREE.Vector3();

function PlayerRuntime({
  combat: combatRef,
  seatRef,
  respawn,
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
  hangRef,
  rollRef,
  setAction,
  onNearPortal,
  onEnterPortal,
  onHangChange,
}: PlayerRuntimeProps) {
  const { camera, scene } = useThree();
  const { world, rapier } = useRapier();
  const wasGrounded = useRef(true);
  const previousVerticalSpeed = useRef(0);
  const landingCompression = useRef(0);
  const proximity = useRef<string | null>(null);
  const notifiedHang = useRef(false);
  const actionRef = useRef<ActionName>("Idle");
  const landingTime = useRef(0);
  const stepTime = useRef(0);

  useBeforePhysicsStep(() => {
    const player = controllerRef.current;
    if (!player || !player.body || player.isOnGround) return;
    // Hanging freezes gravity; the hang branch in useFrame owns the body.
    if (hangRef.current.active || seatRef.current.active) {
      player.body.setGravityScale(0, true);
      return;
    }
    const velocity = player.body.linvel();
    player.body.setGravityScale(getGravityScale(velocity.y, controlsRef.current.jump), true);
  });

  useFrame((_, rawDelta) => {
    const player = controllerRef.current;
    const headingGroup = headingRef.current;
    if (!player || !player.body || !headingGroup) return;

    const delta = Math.min(rawDelta, 0.05);
    const body = player.body;
    const position = body.translation();
    const velocity = body.linvel();
    if (combatRef && combatRef.current.health <= 0) {
      rollRef.current.active = false;
      hangRef.current.active = false;
      body.setBodyType(rapier.RigidBodyType.KinematicPositionBased, true);
      body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      body.setAngvel({ x: 0, y: 0, z: 0 }, true);
      body.setNextKinematicTranslation(position);
      body.setNextKinematicRotation(body.rotation());
      if (characterVisualRef.current) {
        characterVisualRef.current.rotation.x = 0;
        characterVisualRef.current.scale.setScalar(1);
      }
      if (actionRef.current !== "Death") {
        actionRef.current = "Death";
        setAction("Death");
      }
      return;
    }
    if (position.y < -20) {
      body.setTranslation(
        { x: respawn[0], y: respawn[1] + PLAYER_CENTER_HEIGHT, z: respawn[2] },
        true,
      );
      body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      body.setAngvel({ x: 0, y: 0, z: 0 }, true);
      body.setRotation({ x: 0, y: 1, z: 0, w: 0 }, true);
      enteringRef.current = false;
      hangRef.current.active = false;
      rollRef.current.active = false;
      seatRef.current.active = false;
      seatRef.current.standing = 0;
      cameraYawRef.current = 0;
      camera.position.set(respawn[0], respawn[1] + 3.6, respawn[2] + cameraDistance);
      onHangChange(false);
      onNearPortal(null);
      return;
    }
    const grounded = player.isOnGround;
    const input = controlsRef.current;
    const seat = seatRef.current;
    if (input.interactPress !== seat.press) {
      seat.press = input.interactPress;
      if (seat.active) {
        if (seat.standing === 0) seat.standing = CLIP_SECONDS.SitExit;
      } else if (
        grounded &&
        !hangRef.current.active &&
        !rollRef.current.active &&
        !enteringRef.current
      ) {
        for (let i = 0; i < 3; i++) {
          const marker = scene.getObjectByName(`log-seat-${i}`);
          if (!marker) continue;
          marker.getWorldPosition(seat.position);
          if (
            Math.hypot(position.x - seat.position.x, position.z - seat.position.z) < 2.1 &&
            Math.abs(position.y - PLAYER_CENTER_HEIGHT - seat.position.y) < 1.5
          ) {
            seat.active = true;
            seat.elapsed = 0;
            seat.yaw = marker.rotation.y;
            body.setBodyType(rapier.RigidBodyType.KinematicPositionBased, true);
            for (let c = 0; c < body.numColliders(); c++) body.collider(c).setEnabled(false);
            body.resetForces(true);
            body.resetTorques(true);
            break;
          }
        }
      }
    }
    if (seat.active) {
      seat.elapsed += delta;
      rollRef.current.lastPress = input.rollPress;
      hangRef.current.lastJumpPress = input.jumpPress;
      body.setGravityScale(0, true);
      body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      body.setAngvel({ x: 0, y: 0, z: 0 }, true);
      body.setTranslation(
        { x: seat.position.x, y: seat.position.y + PLAYER_CENTER_HEIGHT, z: seat.position.z },
        true,
      );
      body.setRotation({ x: 0, y: Math.sin(seat.yaw / 2), z: 0, w: Math.cos(seat.yaw / 2) }, true);
      body.setNextKinematicTranslation({
        x: seat.position.x,
        y: seat.position.y + PLAYER_CENTER_HEIGHT,
        z: seat.position.z,
      });
      body.setNextKinematicRotation({
        x: 0,
        y: Math.sin(seat.yaw / 2),
        z: 0,
        w: Math.cos(seat.yaw / 2),
      });
      if (seat.standing > 0) {
        seat.standing = Math.max(0, seat.standing - delta);
        if (seat.standing === 0) {
          seat.active = false;
          const x = seat.position.x + Math.sin(seat.yaw) * 1.3;
          const z = seat.position.z + Math.cos(seat.yaw) * 1.3;
          body.setTranslation({ x, y: groundHeight(x, z) + PLAYER_CENTER_HEIGHT + 0.12, z }, true);
          body.setNextKinematicTranslation({
            x,
            y: groundHeight(x, z) + PLAYER_CENTER_HEIGHT + 0.12,
            z,
          });
          body.setBodyType(rapier.RigidBodyType.Dynamic, true);
          for (let c = 0; c < body.numColliders(); c++) body.collider(c).setEnabled(true);
          body.setLinvel({ x: 0, y: 0, z: 0 }, true);
          body.setAngvel({ x: 0, y: 0, z: 0 }, true);
          body.setGravityScale(1, true);
        }
      }
    }
    const fight = combatRef?.current;
    if (fight) {
      // Mutable simulation state shared with the boss, not React render state.
      // eslint-disable-next-line react-hooks/immutability
      fight.playerX = position.x;
      fight.playerZ = position.z;
      fight.playerYaw = Math.atan2(player.bodyZAxis.x, player.bodyZAxis.z);
      fight.attackTime = Math.max(0, fight.attackTime - delta);
      if (fight.inputAttack !== input.attackPress) {
        fight.inputAttack = input.attackPress;
        if (
          fight.health > 0 &&
          fight.bossHealth > 0 &&
          grounded &&
          !rollRef.current.active &&
          !hangRef.current.active &&
          fight.attackTime === 0 &&
          fight.stamina >= 20
        ) {
          fight.stamina -= 20;
          fight.attackId++;
          fight.attackTime =
            CLIP_SECONDS[fight.attackId % 2 ? "SwordSlashQuick" : "SwordSlashHeavy"];
        }
      }
      fight.invulnerable =
        rollRef.current.active && rollRef.current.elapsed > 0.08 && rollRef.current.elapsed < 0.55;
    }
    const enabled =
      !enteringRef.current &&
      !seat.active &&
      (!fight || (fight.health > 0 && fight.attackTime === 0));
    const relativeVelocity = player.relativeVelOnPlane;
    const planarSpeedForAnimation = Math.hypot(relativeVelocity.x, relativeVelocity.z);
    const movementInput = input.forward || input.backward || input.left || input.right;
    const moving =
      enabled &&
      (!player.isOnPlatform || movementInput) &&
      planarSpeedForAnimation > (actionRef.current === "Idle" ? 0.45 : 0.2);
    const hang = hangRef.current;
    const roll = rollRef.current;

    // Roll (F): edge-triggered one-shot burst. Ecctrl keeps owning every
    // physics frame after the trigger, so this can't fight the controller.
    roll.cooldown = Math.max(0, roll.cooldown - delta);
    const rollRequest = consumeRollPress({
      grounded: grounded && enabled && !hang.active && (!fight || fight.stamina >= 25),
      rolling: roll.active,
      cooldownRemaining: roll.cooldown,
      rollPress: input.rollPress,
      lastRollPress: roll.lastPress,
    });
    // Always consume the edge, even when unavailable. Never queue a burst.
    roll.lastPress = rollRequest.lastPress;
    if (!roll.active && enabled && !hang.active) {
      if (rollRequest.start) {
        const forwardAmount = (input.forward ? 1 : 0) - (input.backward ? 1 : 0);
        const sideAmount = (input.right ? 1 : 0) - (input.left ? 1 : 0);
        const yaw = cameraYawRef.current;
        if (forwardAmount !== 0 || sideAmount !== 0) {
          roll.dir
            .set(
              -Math.sin(yaw) * forwardAmount + Math.cos(yaw) * sideAmount,
              0,
              -Math.cos(yaw) * forwardAmount - Math.sin(yaw) * sideAmount,
            )
            .normalize();
        } else {
          // Souls-like: no input rolls toward where the character faces.
          // Ecctrl steers body +Z into travel, exposed as bodyZAxis.
          const facing = player.bodyZAxis;
          const facingLength = Math.hypot(facing.x, facing.z);
          if (facingLength > 0.01) {
            roll.dir.set(facing.x / facingLength, 0, facing.z / facingLength);
          } else {
            roll.dir.set(-Math.sin(yaw), 0, -Math.cos(yaw));
          }
        }
        roll.active = true;
        if (fight) fight.stamina -= 25;
        roll.elapsed = 0;
        roll.cooldown = ROLL_COOLDOWN;
        roll.lastPress = input.rollPress;
        body.setLinvel(
          { x: roll.dir.x * ROLL_SPEED, y: velocity.y, z: roll.dir.z * ROLL_SPEED },
          true,
        );
      } else if (!grounded) {
        // Swallow presses made mid-air so landing doesn't auto-roll.
        roll.lastPress = input.rollPress;
      }
    }
    if (roll.active) {
      roll.elapsed += delta;
      // Sustain the burst every frame: Ecctrl's speed regulation would eat
      // a one-shot impulse within a frame or two. Ease off toward the end.
      const progress = Math.min(roll.elapsed / ROLL_DURATION, 1);
      const speed = ROLL_SPEED * (1 - 0.35 * progress);
      body.setLinvel({ x: roll.dir.x * speed, y: velocity.y, z: roll.dir.z * speed }, true);
      if (roll.elapsed >= ROLL_DURATION) {
        roll.active = false;
        roll.lastPress = input.rollPress;
      }
    }

    if (!hang.active && enabled && !grounded && velocity.y < -0.5) {
      // Ledge-grab prototype: chest-height wall ray, then a downward ray
      // to find a walkable top surface above the wall hit.
      const planarSpeed = Math.hypot(velocity.x, velocity.z);
      let approachX = -Math.sin(cameraYawRef.current);
      let approachZ = -Math.cos(cameraYawRef.current);
      if (planarSpeed > 1) {
        approachX = velocity.x / planarSpeed;
        approachZ = velocity.z / planarSpeed;
      }
      ledgeOrigin.set(position.x, position.y + 0.35, position.z);
      ledgeDirection.set(approachX, 0, approachZ);
      const wallHit = world.castRayAndGetNormal(
        new rapier.Ray(ledgeOrigin, ledgeDirection),
        LEDGE_WALL_REACH,
        true,
        rapier.QueryFilterFlags.EXCLUDE_SENSORS,
        undefined,
        undefined,
        body,
      );
      if (wallHit) {
        ledgeTopOrigin.set(
          position.x + approachX * 0.6,
          position.y + 1.5,
          position.z + approachZ * 0.6,
        );
        const topHit = world.castRayAndGetNormal(
          new rapier.Ray(ledgeTopOrigin, ledgeDown),
          1.5 + LEDGE_TOP_MAX,
          true,
          rapier.QueryFilterFlags.EXCLUDE_SENSORS,
          undefined,
          undefined,
          body,
        );
        if (topHit) {
          const topY = ledgeTopOrigin.y - topHit.timeOfImpact;
          const topHeight = topY - (position.y - PLAYER_CENTER_HEIGHT);
          if (
            canGrabLedge({
              grounded,
              verticalSpeed: velocity.y,
              wallDist: wallHit.timeOfImpact,
              topHeight,
              wallNormalY: wallHit.normal.y,
              topNormalY: topHit.normal.y,
            })
          ) {
            hang.active = true;
            hang.climbTime = -1;
            hang.time = 0;
            hang.point.set(
              position.x + approachX * wallHit.timeOfImpact,
              topY,
              position.z + approachZ * wallHit.timeOfImpact,
            );
            hang.forward.set(approachX, 0, approachZ);
            hang.normal.set(-approachX, 0, -approachZ);
            hang.lastJumpPress = input.jumpPress;
            body.setGravityScale(0, true);
            body.setBodyType(rapier.RigidBodyType.KinematicPositionBased, true);
            body.setLinvel({ x: 0, y: 0, z: 0 }, true);
            body.setAngvel({ x: 0, y: 0, z: 0 }, true);
          }
        }
      }
    }

    if (hang.active) {
      hang.time += delta;
      // Pin the body. The parent movement frame feeds zeros while hanging
      // (enabled is false), so Ecctrl never fights the pin.
      body.setGravityScale(0, true);
      body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      body.setAngvel({ x: 0, y: 0, z: 0 }, true);
      // Ease into the hang pose: chest below the lip, close to the wall.
      hangTarget.set(
        hang.point.x - hang.forward.x * 0.43,
        hang.point.y - LEDGE_HAND_HEIGHT + PLAYER_CENTER_HEIGHT,
        hang.point.z - hang.forward.z * 0.43,
      );
      const blend = 1 - Math.exp(-10 * delta);
      if (input.jumpPress !== hang.lastJumpPress && hang.climbTime < 0) {
        hang.lastJumpPress = input.jumpPress;
        const clearance = world.castRay(
          new rapier.Ray(
            {
              x: hang.point.x + hang.forward.x * 0.55,
              y: hang.point.y + 0.05,
              z: hang.point.z + hang.forward.z * 0.55,
            },
            { x: 0, y: 1, z: 0 },
          ),
          2.4,
          true,
          rapier.QueryFilterFlags.EXCLUDE_SENSORS,
          undefined,
          undefined,
          body,
        );
        if (!clearance) {
          hang.climbTime = 0;
          hang.climbStart.copy(position);
        }
      }
      if (hang.climbTime >= 0) {
        hang.climbTime += delta;
        const progress = climbProgress(hang.climbTime);
        hangTarget.set(
          THREE.MathUtils.lerp(
            hang.climbStart.x,
            hang.point.x + hang.forward.x * 0.55,
            progress.forward,
          ),
          THREE.MathUtils.lerp(
            hang.climbStart.y,
            hang.point.y + PLAYER_CENTER_HEIGHT + 0.06,
            progress.up,
          ),
          THREE.MathUtils.lerp(
            hang.climbStart.z,
            hang.point.z + hang.forward.z * 0.55,
            progress.forward,
          ),
        );
        if (progress.done) hang.active = false;
      } else {
        hangTarget.set(
          position.x + (hangTarget.x - position.x) * blend,
          position.y + (hangTarget.y - position.y) * blend,
          position.z + (hangTarget.z - position.z) * blend,
        );
      }
      body.setTranslation(hangTarget, true);
      body.setNextKinematicTranslation(hangTarget);
      const yaw = Math.atan2(hang.forward.x, hang.forward.z);
      const facing = { x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) };
      body.setRotation(facing, true);
      body.setNextKinematicRotation(facing);
      if (!hang.active) {
        body.setBodyType(rapier.RigidBodyType.Dynamic, true);
        body.setGravityScale(1, true);
        body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      } else if (hang.climbTime < 0 && (input.backward || hang.time > HANG_TIMEOUT)) {
        // Drop: push gently off the wall, or time out.
        hang.active = false;
        body.setBodyType(rapier.RigidBodyType.Dynamic, true);
        hang.lastJumpPress = input.jumpPress;
        body.setGravityScale(1, true);
        body.setLinvel({ x: hang.normal.x * 2.5, y: 0, z: hang.normal.z * 2.5 }, true);
      }
    }

    // Reflect hang transitions to the HUD exactly once each.
    if (notifiedHang.current !== hang.active) {
      notifiedHang.current = hang.active;
      onHangChange(hang.active);
    }

    landingTime.current = Math.max(0, landingTime.current - delta);
    if (grounded && !wasGrounded.current && previousVerticalSpeed.current < -2) {
      landingCompression.current = 1;
      playSound("land");
      landingTime.current = CLIP_SECONDS.JumpLand;
    }
    wasGrounded.current = grounded;
    previousVerticalSpeed.current = velocity.y;

    const visual = characterVisualRef.current;
    if (visual) {
      landingCompression.current = Math.max(0, landingCompression.current - delta * 8);
      const compression = landingCompression.current;
      const stretch = grounded ? 0 : Math.min(Math.abs(velocity.y) / JUMP_SPEED, 1) * 0.035;
      visual.scale.set(
        1 + compression * 0.05 - stretch * 0.25,
        1 - compression * 0.1 + stretch,
        1 + compression * 0.05 - stretch * 0.25,
      );
      visual.rotation.x = THREE.MathUtils.damp(
        visual.rotation.x,
        grounded ? 0 : velocity.y > 0 ? -0.08 : 0.1,
        10,
        delta,
      );
    }

    const nextAction: ActionName =
      fight && fight.health <= 0
        ? "Death"
        : fight && fight.attackTime > 0
          ? fight.attackId % 2
            ? "SwordSlashQuick"
            : "SwordSlashHeavy"
          : seat.active
            ? seat.standing > 0
              ? "SitExit"
              : seat.elapsed < CLIP_SECONDS.SitEnter
                ? "SitEnter"
                : "SeatedIdle"
            : hang.active
              ? hang.climbTime >= 0
                ? "LedgeClimb"
                : hang.time < CLIP_SECONDS.LedgeGrab
                  ? "LedgeGrab"
                  : "LedgeHang"
              : roll.active
                ? "Roll"
                : !grounded
                  ? velocity.y > 0
                    ? "JumpRise"
                    : "JumpFall"
                  : landingTime.current > 0 && !moving
                    ? "JumpLand"
                    : moving
                      ? planarSpeedForAnimation > 5.4
                        ? "Run"
                        : "Walk"
                      : "Idle";
    if (nextAction !== actionRef.current) {
      if (nextAction === "JumpRise") playSound("jump");
      if (nextAction === "SwordSlashQuick" || nextAction === "SwordSlashHeavy") playSound("slash");
      actionRef.current = nextAction;
      setAction(nextAction);
    }
    if (nextAction === "Walk" || nextAction === "Run") {
      stepTime.current += delta;
      if (stepTime.current >= (nextAction === "Run" ? 0.25 : 0.4)) {
        stepTime.current = 0;
        playSound("step");
      }
    } else stepTime.current = 0;

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
      body.setTranslation({ x: correctedX, y: position.y, z: correctedZ }, true);
      body.setLinvel(
        {
          x: correctedX === position.x ? velocity.x : 0,
          y: velocity.y,
          z: correctedZ === position.z ? velocity.z : 0,
        },
        true,
      );
    }

    // Follow the interpolated render transform, not Rapier's discrete pose.
    // Keeping the player and camera on the same timeline removes visual jitter.
    headingGroup.getWorldPosition(renderedPlayerPosition);
    cameraForward.set(-Math.sin(cameraYawRef.current), 0, -Math.cos(cameraYawRef.current));
    cameraTarget.set(
      renderedPlayerPosition.x,
      renderedPlayerPosition.y + 1.25,
      renderedPlayerPosition.z,
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
      body,
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
      const dx = position.x - portal.position[0];
      const dz = position.z - portal.position[2];
      const yaw = portal.yaw ?? 0;
      const lateral = Math.abs(dx * Math.cos(yaw) - dz * Math.sin(yaw));
      const depth = Math.abs(dx * Math.sin(yaw) + dz * Math.cos(yaw));
      const distance = portal.flat
        ? Math.hypot(
            Math.max(0, lateral - 2.1 * (portal.scale ?? 1)),
            Math.max(0, depth - 1.55 * (portal.scale ?? 1)),
          )
        : portal.scale
          ? lateral <= 2.1 * portal.scale
            ? depth
            : Number.POSITIVE_INFINITY
          : Math.hypot(dx, dz);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestPortal = portal;
      }
    }

    const nearPortal = nearestDistance < 3.25 ? (nearestPortal?.id ?? null) : null;
    if (nearPortal !== proximity.current) {
      proximity.current = nearPortal;
      onNearPortal(nearPortal);
    }
    if (
      nearestPortal &&
      !enteringRef.current &&
      !hang.active &&
      canEnterPortal({
        distance: nearestDistance,
        grounded,
        feetHeight: feetHeight - nearestPortal.position[1],
      }) &&
      feetHeight <
        nearestPortal.position[1] +
          (nearestPortal.flat ? 0.75 : 4.4 * (nearestPortal.scale ?? 1)) &&
      (!nearestPortal.flat || (velocity.y < -0.1 && nearestDistance < 0.05))
    ) {
      enteringRef.current = true;
      playSound("portal");
      onEnterPortal(nearestPortal.id);
    }
  });

  return null;
}

export function ThirdPersonPlayer({
  combat,
  start = [0, 0, 6],
  startYaw = Math.PI,
  respawn,
  portals,
  boundary = 24,
  bounds,
  cameraDistance = 6.5,
  onNearPortal,
  onEnterPortal,
  onHangChange,
  onReady,
}: ThirdPersonPlayerProps) {
  const runtime = useWorld();
  const controllerRef = useRef<EcctrlHandle>(null);
  const headingRef = useRef<THREE.Group>(null);
  const characterVisualRef = useRef<THREE.Group>(null);
  const [initialPosition] = useState(start);
  const controlsRef = usePlayerControls(Boolean(combat));
  const { paused, settings } = useGame();
  const { camera, gl } = useThree();
  const cameraYawRef = useRef(startYaw - Math.PI);
  const cameraHeightRef = useRef(3.6);
  const enteringRef = useRef(false);
  const seatRef = useRef({
    active: false,
    press: 0,
    standing: 0,
    elapsed: 0,
    position: new THREE.Vector3(),
    yaw: 0,
  });
  const hangRef = useRef<HangState>({
    active: false,
    climbTime: -1,
    climbStart: new THREE.Vector3(),
    time: 0,
    lastJumpPress: 0,
    point: new THREE.Vector3(),
    normal: new THREE.Vector3(0, 0, 1),
    forward: new THREE.Vector3(0, 0, -1),
  });
  const rollRef = useRef<RollState>({
    active: false,
    elapsed: 0,
    cooldown: 0,
    lastPress: 0,
    dir: new THREE.Vector3(0, 0, -1),
  });
  const [action, setAction] = useState<ActionName>("Idle");

  useLayoutEffect(() => {
    const entity = runtime.spawn(PlayerView({ object: headingRef.current }));
    return () => entity.destroy();
  }, [runtime]);

  useLayoutEffect(() => {
    rollRef.current.lastPress = controlsRef.current.rollPress;
    seatRef.current.press = controlsRef.current.interactPress;
  }, [controlsRef]);

  useLayoutEffect(() => {
    const [x, y, z] = initialPosition;
    camera.position.set(
      x + Math.sin(startYaw - Math.PI) * cameraDistance,
      y + 3.6,
      z + Math.cos(startYaw - Math.PI) * cameraDistance,
    );
    cameraTarget.set(x, y + 1.25, z);
    camera.lookAt(cameraTarget);
  }, [camera, cameraDistance, initialPosition, startYaw]);

  useLayoutEffect(() => {
    onReady?.();
  }, [onReady]);

  useEffect(() => {
    // A level change while hanging must not leave a stale prompt behind.
    return () => {
      onHangChange(false);
    };
  }, [onHangChange]);

  useEffect(() => {
    const canvas = gl.domElement;
    if (paused) return;
    let dragging = false;
    let previousX = 0;
    let previousY = 0;

    const startOrbit = (event: PointerEvent) => {
      // Pointer-lock owns the mouse once engaged; drag stays as the
      // fallback (touch / lock unavailable / user pressed Esc).
      if (document.pointerLockElement) return;
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
      cameraYawRef.current -= (deltaX * 0.004 * settings.sensitivity) / 100;
      cameraHeightRef.current = THREE.MathUtils.clamp(
        cameraHeightRef.current +
          ((deltaY * 0.008 * settings.sensitivity) / 100) * (settings.invertY ? -1 : 1),
        2.65,
        4.8,
      );
    };
    const stopOrbit = (event: PointerEvent) => {
      dragging = false;
      if (canvas.hasPointerCapture(event.pointerId)) {
        canvas.releasePointerCapture(event.pointerId);
      }
    };

    canvas.addEventListener("pointerdown", startOrbit);
    canvas.addEventListener("pointermove", orbit);
    canvas.addEventListener("pointerup", stopOrbit);
    canvas.addEventListener("pointercancel", stopOrbit);

    // Click-to-look: first click locks the pointer, then raw mouse deltas
    // drive the camera with no dragging and no screen-edge limit.
    const engagePointerLock = () => {
      if (isResultScreenActive()) return;
      if (document.pointerLockElement) return;
      try {
        const result = document.body.requestPointerLock() as unknown as Promise<void> | undefined;
        // Chrome rejects if re-locking within ~1.2s of an Esc exit.
        result?.catch(() => {
          // Next click will engage; nothing to show the user.
        });
      } catch {
        // Lock unavailable (touch / iframe permissions); drag still works.
      }
    };
    const lookWithMouse = (event: MouseEvent) => {
      if (!document.pointerLockElement) return;
      cameraYawRef.current -= (event.movementX * 0.004 * settings.sensitivity) / 100;
      cameraHeightRef.current = THREE.MathUtils.clamp(
        cameraHeightRef.current +
          ((event.movementY * 0.008 * settings.sensitivity) / 100) * (settings.invertY ? -1 : 1),
        2.65,
        4.8,
      );
    };
    canvas.addEventListener("click", engagePointerLock);
    document.addEventListener("mousemove", lookWithMouse);
    return () => {
      canvas.removeEventListener("pointerdown", startOrbit);
      canvas.removeEventListener("pointermove", orbit);
      canvas.removeEventListener("pointerup", stopOrbit);
      canvas.removeEventListener("pointercancel", stopOrbit);
      canvas.removeEventListener("click", engagePointerLock);
      document.removeEventListener("mousemove", lookWithMouse);
    };
  }, [gl, paused, settings.sensitivity, settings.invertY]);

  useFrame(() => {
    const player = controllerRef.current;
    if (!player) return;
    const input = controlsRef.current;
    const roll = rollRef.current;
    if (paused || (combat && (combat.current.health <= 0 || combat.current.bossHealth <= 0))) {
      roll.active = false;
      player.setMovement({
        forward: false,
        backward: false,
        leftward: false,
        rightward: false,
        run: false,
        jump: false,
      });
      return;
    }
    if (roll.active) {
      // Souls-like commitment: feed Ecctrl the roll direction as live input
      // so it accelerates with the burst (instead of braking against it)
      // and keeps the body facing the roll. Jump stays off mid-roll.
      const yaw = cameraYawRef.current;
      const camForwardX = -Math.sin(yaw);
      const camForwardZ = -Math.cos(yaw);
      const camRightX = Math.cos(yaw);
      const camRightZ = -Math.sin(yaw);
      const forwardDot = roll.dir.x * camForwardX + roll.dir.z * camForwardZ;
      const rightDot = roll.dir.x * camRightX + roll.dir.z * camRightZ;
      player.setMovement({
        forward: forwardDot > 0.3,
        backward: forwardDot < -0.3,
        leftward: rightDot < -0.3,
        rightward: rightDot > 0.3,
        run: true,
        jump: false,
      });
      return;
    }
    // Hanging also disables input; the hang branch owns the body instead.
    const enabled = !enteringRef.current && !hangRef.current.active && !seatRef.current.active;
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
    <>
      <Ecctrl
        enabledRotations={[false, true, false]}
        enable={
          ![
            "SitEnter",
            "SeatedIdle",
            "SitExit",
            "Death",
            "SwordSlashQuick",
            "SwordSlashHeavy",
            "LedgeGrab",
            "LedgeHang",
            "LedgeClimb",
          ].includes(action)
        }
        autoBalance={
          ![
            "Death",
            "SitEnter",
            "SeatedIdle",
            "SitExit",
            "LedgeGrab",
            "LedgeHang",
            "LedgeClimb",
          ].includes(action)
        }
        ref={controllerRef}
        position={[
          initialPosition[0],
          initialPosition[1] + PLAYER_CENTER_HEIGHT,
          initialPosition[2],
        ]}
        // Face away from the spawn camera: Ecctrl steers body +Z toward
        // movement and the Quaternius model faces +Z locally.
        rotation={[0, startYaw, 0]}
        capsuleHalfHeight={0.5}
        capsuleRadius={0.42}
        floatHeight={0.2}
        springK={180}
        dampingC={24}
        moveImpulsePointOffset={0}
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
          combat={combat}
          seatRef={seatRef}
          respawn={respawn ?? initialPosition}
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
          hangRef={hangRef}
          rollRef={rollRef}
          setAction={setAction}
          onNearPortal={onNearPortal}
          onEnterPortal={onEnterPortal}
          onHangChange={onHangChange}
        />
        <group
          ref={headingRef}
          name="player-grass-interactor"
          position={[0, -PLAYER_CENTER_HEIGHT, 0]}
        >
          <group ref={characterVisualRef}>
            {/* No Y flip: model +Z matches body +Z, so it faces travel direction. */}
            <AnimatedCharacter animation={action} armed={Boolean(combat)} scale={0.82} />
          </group>
        </group>
      </Ecctrl>
      {/* World-space dust: sibling of the physics body, never inside it. */}
      <DustPuffs controllerRef={controllerRef} headingRef={headingRef} action={action} />
    </>
  );
}
