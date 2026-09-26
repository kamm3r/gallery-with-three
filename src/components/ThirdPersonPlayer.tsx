import { useFrame, useThree } from "@react-three/fiber";
import { useGame } from "../gameSettings";
import { useRapier } from "@react-three/rapier";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type RefObject,
  type SetStateAction,
} from "react";
import * as THREE from "three";
import { groundHeight } from "../gameplay/terrain";
import { controllerDefaults, type ControllerTuning } from "../gameplay/controllerTuning";
import { PLAYER_HURT_TIME, type Encounter } from "../gameplay/bossEncounter";
import { CLIP_SECONDS, LEDGE_HAND_HEIGHT, climbProgress } from "../gameplay/characterAnimations";
import { playSound } from "../gameplay/sound";
import { isResultScreenActive } from "../gameplay/resultScreen";
import { isSprintAllowed } from "../gameplay/sprintGate";
import { SPIN_COOLDOWN, SPIN_TIME, type PlatformerLink } from "../gameplay/platformerLink";
import { cameraRig } from "../gameplay/cameraRig";
import { useWorld } from "koota/react";
import { PlayerView } from "../gameplay/ecs/traits";
import {
  canEnterPortal,
  canGrabLedge,
  consumeRollPress,
  HANG_TIMEOUT,
  LEDGE_TOP_MAX,
  LEDGE_WALL_REACH,
  ROLL_COOLDOWN,
  ROLL_DURATION,
  ROLL_SPEED,
} from "../gameplay/playerRules";
import { usePlayerControls, type PlayerControls } from "../hooks/usePlayerControls";
import { useReducedMotion } from "../hooks/useReducedMotion";
import { AnimatedCharacter, type ActionName } from "./AnimatedCharacter";
import { CharacterController, type CharacterHandle } from "./CharacterController";
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
  /** Controller overrides (playground tuning panel); defaults elsewhere. */
  tuning?: ControllerTuning;
  /** Set to a spawn point to move the player there on the next frame. */
  teleportRef?: MutableRefObject<Position | null>;
  /** Something carried in the right hand (e.g. Hollow Lane's flashlight). */
  held?: "flashlight";
  /** Warp Room worlds: spin attack, crate bounces, death freeze. */
  platformer?: MutableRefObject<PlatformerLink>;
}

interface PlayerRuntimeProps {
  combat?: MutableRefObject<Encounter>;
  platformer?: MutableRefObject<PlatformerLink>;
  seatRef: MutableRefObject<{
    active: boolean;
    press: number;
    standing: number;
    elapsed: number;
    /** Buffered sit intent, seconds. Covers E pressed mid-hop or one step out. */
    want: number;
    position: THREE.Vector3;
    yaw: number;
  }>;
  respawn: Position;
  controllerRef: RefObject<CharacterHandle | null>;
  jumpSpeed: number;
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
  teleportRef?: MutableRefObject<Position | null>;
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

const CAPSULE_HALF_HEIGHT = 0.5;
const CAPSULE_RADIUS = 0.42;
/** Body center above the feet: the capsule rests one skin width off the ground. */
const PLAYER_CENTER_HEIGHT = CAPSULE_HALF_HEIGHT + CAPSULE_RADIUS + controllerDefaults.skinWidth;
/** How long an E press keeps trying to sit (landing, walking into range). */
const SIT_BUFFER_SECONDS = 0.45;

const cameraTarget = new THREE.Vector3();
const desiredCameraPosition = new THREE.Vector3();
const cameraGround = new THREE.Vector3();
const cameraForward = new THREE.Vector3();
const cameraRayDirection = new THREE.Vector3();
const renderedPlayerPosition = new THREE.Vector3();
const cameraOffset = new THREE.Vector3();
const IDENTITY_ROTATION = { x: 0, y: 0, z: 0, w: 1 };
/** Clearance kept between the lens and any wall. */
const CAMERA_PROBE_RADIUS = 0.35;
const CAMERA_MIN_DISTANCE = 0.6;
/** Over-the-shoulder framing used indoors (see cameraRig). */
const INDOOR_DISTANCE = 3;
const INDOOR_SHOULDER = 0.95;
const cameraRight = new THREE.Vector3();
let indoorBlend = 0;
// TEMP-PROOF (revert before ship): ?debugseat=N teleports next to log marker N.
const DEBUG_SEAT =
  typeof window === "undefined" ||
  new URLSearchParams(window.location.search).get("debugseat") === null
    ? Number.NaN
    : Number(new URLSearchParams(window.location.search).get("debugseat"));
// Scratch temps for the ledge-grab prototype (no per-frame allocation).
const ledgeOrigin = new THREE.Vector3();
const ledgeDirection = new THREE.Vector3();
const ledgeTopOrigin = new THREE.Vector3();
const ledgeDown = new THREE.Vector3(0, -1, 0);
const hangTarget = new THREE.Vector3();

function PlayerRuntime({
  combat: combatRef,
  platformer: platformerRef,
  seatRef,
  respawn,
  controllerRef,
  jumpSpeed,
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
  teleportRef,
}: PlayerRuntimeProps) {
  const { camera, scene } = useThree();
  const { world, rapier } = useRapier();
  const cameraProbe = useMemo(() => new rapier.Ball(CAMERA_PROBE_RADIUS), [rapier]);
  const wasGrounded = useRef(true);
  const previousVerticalSpeed = useRef(0);
  const landingCompression = useRef(0);
  const proximity = useRef<string | null>(null);
  const notifiedHang = useRef(false);
  const actionRef = useRef<ActionName>("Idle");
  const landingTime = useRef(0);
  const stepTime = useRef(0);
  const dbgTeleported = useRef(false); // TEMP-PROOF: revert.
  const reducedMotion = useReducedMotion();

  useFrame((frame, rawDelta) => {
    const player = controllerRef.current;
    const headingGroup = headingRef.current;
    if (!player || !player.body || !headingGroup) return;

    const delta = Math.min(rawDelta, 0.05);
    const body = player.body;
    const position = body.translation();
    const velocity = player.velocity;
    // TEMP-PROOF: revert before ship.
    if (!Number.isNaN(DEBUG_SEAT) && !dbgTeleported.current) {
      const marker = scene.getObjectByName(`log-seat-${DEBUG_SEAT}`);
      if (marker) {
        const seat = seatRef.current;
        marker.getWorldPosition(seat.position);
        const x = seat.position.x + 1.2;
        const z = seat.position.z + 1.2;
        body.setTranslation({ x, y: groundHeight(x, z) + PLAYER_CENTER_HEIGHT + 0.12, z }, true);
        dbgTeleported.current = true;
      }
    }
    if (!Number.isNaN(DEBUG_SEAT)) {
      (window as unknown as { __seatdbg?: unknown }).__seatdbg = {
        active: seatRef.current.active,
        elapsed: seatRef.current.elapsed,
        action: actionRef.current,
      };
    }
    if (combatRef && combatRef.current.health <= 0) {
      rollRef.current.active = false;
      hangRef.current.active = false;
      velocity.set(0, 0, 0);
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
    const teleport = teleportRef?.current;
    if (position.y < -20 || teleport) {
      const target = teleport ?? respawn;
      if (teleportRef) teleportRef.current = null;
      body.setTranslation(
        { x: target[0], y: target[1] + PLAYER_CENTER_HEIGHT, z: target[2] },
        true,
      );
      velocity.set(0, 0, 0);
      body.setRotation({ x: 0, y: 1, z: 0, w: 0 }, true);
      enteringRef.current = false;
      hangRef.current.active = false;
      rollRef.current.active = false;
      seatRef.current.active = false;
      seatRef.current.standing = 0;
      cameraYawRef.current = 0;
      camera.position.set(target[0], target[1] + 3.6, target[2] + cameraDistance);
      onHangChange(false);
      onNearPortal(null);
      return;
    }
    const grounded = player.isOnGround;
    const input = controlsRef.current;
    const seat = seatRef.current;
    const link = platformerRef?.current;
    if (link) {
      // Mutable handshake with the Warp Room world, not React state.
      // eslint-disable-next-line react-hooks/immutability
      link.x = position.x;
      link.y = position.y - PLAYER_CENTER_HEIGHT;
      link.z = position.z;
      link.vy = velocity.y;
      link.grounded = grounded;
      link.spinTime = Math.max(0, link.spinTime - delta);
      link.spinCooldown = Math.max(0, link.spinCooldown - delta);
      // Click, J or E: all spin. The first frame just learns the counters.
      const spinPresses = input.attackPress + input.interactPress;
      if (link.lastSpinPress < 0) link.lastSpinPress = spinPresses;
      if (spinPresses !== link.lastSpinPress) {
        link.lastSpinPress = spinPresses;
        if (
          link.spinTime === 0 &&
          link.spinCooldown === 0 &&
          !link.frozen &&
          !hangRef.current.active
        ) {
          link.spinTime = SPIN_TIME;
          link.spinCooldown = SPIN_TIME + SPIN_COOLDOWN;
          playSound("spin");
        }
      }
      if (link.bounce > 0) {
        player.launch(link.bounce);
        link.bounce = 0;
      }
    }
    seat.want = Math.max(0, seat.want - delta);
    const sitReady =
      grounded && !hangRef.current.active && !rollRef.current.active && !enteringRef.current;
    const trySit = () => {
      // Tolerate gaps and future logs: scan until the markers run out.
      for (let i = 0; i < 8; i++) {
        const marker = scene.getObjectByName(`log-seat-${i}`);
        if (!marker) continue;
        marker.getWorldPosition(seat.position);
        if (
          Math.hypot(position.x - seat.position.x, position.z - seat.position.z) < 2.1 &&
          Math.abs(position.y - PLAYER_CENTER_HEIGHT - seat.position.y) < 1.5
        ) {
          seat.active = true;
          seat.elapsed = 0;
          seat.want = 0;
          seat.yaw = marker.rotation.y;
          velocity.set(0, 0, 0);
          for (let c = 0; c < body.numColliders(); c++) body.collider(c).setEnabled(false);
          return true;
        }
      }
      return false;
    };
    if (input.interactPress !== seat.press) {
      seat.press = input.interactPress;
      if (seat.active) {
        if (seat.standing === 0) seat.standing = CLIP_SECONDS.SitExit;
      } else if (sitReady) {
        if (!trySit()) seat.want = SIT_BUFFER_SECONDS;
      } else {
        // Pressed mid-hop or mid-roll: hold the intent briefly instead of
        // eating the press.
        seat.want = SIT_BUFFER_SECONDS;
      }
    } else if (!seat.active && seat.want > 0 && sitReady) {
      trySit();
    }
    if (seat.active) {
      seat.elapsed += delta;
      rollRef.current.lastPress = input.rollPress;
      hangRef.current.lastJumpPress = input.jumpPress;
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
          for (let c = 0; c < body.numColliders(); c++) body.collider(c).setEnabled(true);
          velocity.set(0, 0, 0);
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
      // A landed blow interrupts the swing: no trading through hitstun.
      if (fight.hurtTime > 0) fight.attackTime = 0;
    }
    const enabled =
      !enteringRef.current &&
      !seat.active &&
      (!fight || (fight.health > 0 && fight.attackTime === 0 && fight.hurtTime === 0));
    const relativeVelocity = player.relativeVelOnPlane;
    const planarSpeedForAnimation = Math.hypot(relativeVelocity.x, relativeVelocity.z);
    const movementInput = input.forward || input.backward || input.left || input.right;
    const moving =
      enabled &&
      (!player.isOnPlatform || movementInput) &&
      planarSpeedForAnimation > (actionRef.current === "Idle" ? 0.45 : 0.2);
    const hang = hangRef.current;
    const roll = rollRef.current;

    // Roll (F): edge-triggered one-shot burst. The controller keeps owning
    // every physics step after the trigger, so this can't fight it.
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
          // The controller steers body +Z into travel, exposed as bodyZAxis.
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
        velocity.x = roll.dir.x * ROLL_SPEED;
        velocity.z = roll.dir.z * ROLL_SPEED;
      } else if (!grounded) {
        // Swallow presses made mid-air so landing doesn't auto-roll.
        roll.lastPress = input.rollPress;
      }
    }
    if (roll.active) {
      roll.elapsed += delta;
      // Sustain the burst every frame: the controller's speed regulation
      // would bleed it back to run speed. Ease off toward the end.
      const progress = Math.min(roll.elapsed / ROLL_DURATION, 1);
      const speed = ROLL_SPEED * (1 - 0.35 * progress);
      velocity.x = roll.dir.x * speed;
      velocity.z = roll.dir.z * speed;
      if (roll.elapsed >= ROLL_DURATION) {
        roll.active = false;
        roll.lastPress = input.rollPress;
      }
    }

    if (fight && fight.hurtTime > 0 && fight.health > 0) {
      // Staggered: carried by the blow, easing out over the hitstun.
      const carry = fight.hurtTime / PLAYER_HURT_TIME;
      velocity.x = fight.knockX * carry;
      velocity.z = fight.knockZ * carry;
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
            velocity.set(0, 0, 0);
          }
        }
      }
    }

    if (hang.active) {
      hang.time += delta;
      // Pin the body. The controller is suspended while hanging, so it
      // never fights the pin.
      velocity.set(0, 0, 0);
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
        velocity.set(0, 0, 0);
      } else if (hang.climbTime < 0 && (input.backward || hang.time > HANG_TIMEOUT)) {
        // Drop: push gently off the wall, or time out.
        hang.active = false;
        hang.lastJumpPress = input.jumpPress;
        velocity.set(hang.normal.x * 2.5, 0, hang.normal.z * 2.5);
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
      playSound("land", {
        intensity: Math.min(1, (-previousVerticalSpeed.current - 2) / 12),
      });
      landingTime.current = CLIP_SECONDS.JumpLand;
    }
    wasGrounded.current = grounded;
    previousVerticalSpeed.current = velocity.y;

    const visual = characterVisualRef.current;
    if (visual) {
      landingCompression.current = Math.max(0, landingCompression.current - delta * 8);
      const compression = landingCompression.current;
      const stretch = grounded ? 0 : Math.min(Math.abs(velocity.y) / jumpSpeed, 1) * 0.035;
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
      // Tornado spin: two full turns, fastest at the start.
      visual.rotation.y =
        link && link.spinTime > 0
          ? (1 - Math.pow(link.spinTime / SPIN_TIME, 1.6)) * Math.PI * 4
          : 0;
    }

    const nextAction: ActionName =
      (fight && fight.health <= 0) || link?.frozen
        ? "Death"
        : fight && fight.bossHealth <= 0 && grounded
          ? "Victory"
          : fight && fight.hurtTime > 0
            ? "RecieveHit"
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
      if (nextAction === "Roll") playSound("roll");
      if (nextAction === "LedgeGrab") playSound("grab");
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
      if (correctedX !== position.x) velocity.x = 0;
      if (correctedZ !== position.z) velocity.z = 0;
    }

    // Follow the interpolated render transform, not Rapier's discrete pose.
    // Keeping the player and camera on the same timeline removes visual jitter.
    headingGroup.getWorldPosition(renderedPlayerPosition);
    cameraForward.set(-Math.sin(cameraYawRef.current), 0, -Math.cos(cameraYawRef.current));
    // Indoors, blend to a close over-the-shoulder rig: the same mouse pitch,
    // remapped from "high above" to "just over the shoulder".
    indoorBlend = THREE.MathUtils.damp(indoorBlend, cameraRig.indoor ? 1 : 0, 5, delta);
    const pitch = (cameraHeightRef.current - 2.65) / (4.8 - 2.65);
    const height = THREE.MathUtils.lerp(cameraHeightRef.current, 1.7 + pitch * 0.9, indoorBlend);
    const distance = THREE.MathUtils.lerp(cameraDistance, INDOOR_DISTANCE, indoorBlend);
    cameraRight
      .set(Math.cos(cameraYawRef.current), 0, -Math.sin(cameraYawRef.current))
      .multiplyScalar(INDOOR_SHOULDER * indoorBlend);
    cameraTarget.set(
      renderedPlayerPosition.x + cameraRight.x,
      renderedPlayerPosition.y + THREE.MathUtils.lerp(1.25, 1.45, indoorBlend),
      renderedPlayerPosition.z + cameraRight.z,
    );

    desiredCameraPosition
      .copy(cameraForward)
      .multiplyScalar(-distance)
      .setY(renderedPlayerPosition.y + height)
      .add(cameraGround.set(renderedPlayerPosition.x, 0, renderedPlayerPosition.z))
      .add(cameraRight);

    cameraRayDirection.copy(desiredCameraPosition).sub(cameraTarget);
    const desiredCameraDistance = cameraRayDirection.length();
    cameraRayDirection.normalize();
    // Sweep a ball, not a ray: the near plane has width, and a thin ray
    // slips past corners that the frustum still clips into.
    const cameraHit = world.castShape(
      cameraTarget,
      IDENTITY_ROTATION,
      cameraRayDirection,
      cameraProbe,
      0,
      desiredCameraDistance,
      true,
      rapier.QueryFilterFlags.EXCLUDE_SENSORS,
      undefined,
      undefined,
      body,
    );
    const allowedDistance = cameraHit
      ? Math.max(CAMERA_MIN_DISTANCE, cameraHit.time_of_impact - 0.05)
      : desiredCameraDistance;
    desiredCameraPosition
      .copy(cameraRayDirection)
      .multiplyScalar(allowedDistance)
      .add(cameraTarget);
    camera.position.lerp(desiredCameraPosition, 1 - Math.exp(-9 * delta));
    // Never let smoothing drag the lens behind geometry: pull in instantly,
    // ease back out.
    cameraOffset.copy(camera.position).sub(cameraTarget);
    if (cameraOffset.length() > allowedDistance) {
      camera.position.copy(cameraTarget).addScaledVector(cameraOffset.normalize(), allowedDistance);
    }
    camera.lookAt(cameraTarget);
    if (fight && fight.shake > 0 && !reducedMotion) {
      // Smooth pseudo-noise shake; lookAt resets the orientation next frame.
      const amount = fight.shake * fight.shake * 0.03;
      const t = frame.clock.elapsedTime;
      camera.rotateX((Math.sin(t * 47) + Math.sin(t * 29.3)) * amount);
      camera.rotateY((Math.sin(t * 41.7) + Math.sin(t * 23.1)) * amount);
    }

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
  tuning,
  teleportRef,
  platformer,
  held,
}: ThirdPersonPlayerProps) {
  const runtime = useWorld();
  const controllerRef = useRef<CharacterHandle>(null);
  const headingRef = useRef<THREE.Group>(null);
  const characterVisualRef = useRef<THREE.Group>(null);
  const [initialPosition] = useState(start);
  const controlsRef = usePlayerControls(Boolean(combat || platformer));
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
    want: 0,
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
  // Hang, seat and death pin the body themselves; the controller stands down.
  const suspended = useCallback(
    () =>
      hangRef.current.active ||
      seatRef.current.active ||
      Boolean(combat && combat.current.health <= 0),
    [combat],
  );

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
    if (
      paused ||
      platformer?.current.frozen ||
      (combat &&
        (combat.current.health <= 0 ||
          combat.current.bossHealth <= 0 ||
          combat.current.hurtTime > 0))
    ) {
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
      // Souls-like commitment: feed the controller the roll direction as live input
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
      run: enabled && input.run && isSprintAllowed(),
      jump: enabled && input.jump,
    });
  });

  return (
    <>
      <CharacterController
        ref={controllerRef}
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
        suspended={suspended}
        position={[
          initialPosition[0],
          initialPosition[1] + PLAYER_CENTER_HEIGHT,
          initialPosition[2],
        ]}
        // Face away from the spawn camera: the controller steers body +Z
        // toward movement and the Quaternius model faces +Z locally.
        yaw={startYaw}
        capsuleHalfHeight={CAPSULE_HALF_HEIGHT}
        capsuleRadius={CAPSULE_RADIUS}
        tuning={tuning}
      >
        <PlayerRuntime
          combat={combat}
          platformer={platformer}
          seatRef={seatRef}
          respawn={respawn ?? initialPosition}
          controllerRef={controllerRef}
          jumpSpeed={(tuning ?? controllerDefaults).jumpSpeed}
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
          teleportRef={teleportRef}
        />
        <group
          ref={headingRef}
          name="player-grass-interactor"
          position={[0, -PLAYER_CENTER_HEIGHT, 0]}
        >
          <group ref={characterVisualRef}>
            {/* No Y flip: model +Z matches body +Z, so it faces travel direction. */}
            <AnimatedCharacter
              animation={action}
              armed={Boolean(combat)}
              held={held}
              scale={0.82}
            />
          </group>
        </group>
      </CharacterController>
      {/* World-space dust: sibling of the physics body, never inside it. */}
      <DustPuffs controllerRef={controllerRef} headingRef={headingRef} action={action} />
    </>
  );
}
