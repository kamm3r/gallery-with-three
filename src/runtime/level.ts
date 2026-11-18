import RAPIER from "@dimforge/rapier3d-compat";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { PLAYER_MODEL } from "../gameplay/characterAnimations";
import { heldItems } from "../gameplay/heldItems";
import { cameraRig } from "../gameplay/cameraRig";
import { isSprintAllowed } from "../gameplay/sprintGate";
import {
  BACKSTEP_DURATION,
  BACKSTEP_SPEED,
  ROLL_DISTANCE,
  canEnterPortal,
  canGrabLedge,
  dodgeInvulnerable,
  HANG_TIMEOUT,
  LEDGE_TOP_MAX,
  LEDGE_WALL_REACH,
  rollPeakFor,
  rollSpeedAt,
  ROLL_WEIGHTS,
} from "../gameplay/playerRules";
import {
  LEDGE_HAND_HEIGHT,
  climbProgress,
  CLIP_SECONDS,
  JUMP_ATTACK,
  PLUNGE_ATTACK,
  PLUNGE_HEIGHT,
  SWORD_MOVES,
  nextSwordStep,
  swordArmored,
  swordAttackDuration,
  swordProgress,
  swordSpec,
  swordStep,
} from "../gameplay/characterAnimations";
import { PLAYER_HURT_TIME, STAMINA_REGEN_DELAY, type Encounter } from "../gameplay/bossEncounter";
import { createCombatInput, stepCombatInput } from "../gameplay/combatInput";
import { SPIN_COOLDOWN, SPIN_TIME, type PlatformerLink } from "../gameplay/platformerLink";
import { combatTuning } from "../gameplay/combatTuning";
import { PARRY_DURATION, PARRY_STAMINA, stepDeflect } from "../gameplay/playerDefense";
import {
  LOCK_LOST_DELAY,
  dampAngle,
  lockCameraYaw,
  lockFacingYaw,
  lockHolds,
  pickLockTarget,
  type LockTarget,
} from "../gameplay/lockOn";
import { playSound, setMood, type SoundMood } from "../gameplay/sound";
import { shadowSizes } from "../gameplay/graphicsSettings";
import { ps2ShadowSize } from "../gameplay/ps2Style";
import { mountExperienceHud, type ExperienceHudProps } from "../ui/experienceHud";
import { element } from "../ui/dom";
import { gameStore } from "./gameStore";
import { startFrameLoop } from "./frameLoop";
import { createPlayerController } from "./playerController";
import { heldControls, mountPlayerControls, setPlayerControl } from "./playerInput";
import { createViewport, type ViewportPost } from "./viewport";
import { disposeObjects } from "./disposeObjects";

const HALF_HEIGHT = 0.5;
const RADIUS = 0.42;
const STEP = 1 / 60;
let physicsInit: Promise<void> | undefined;

export type Vec3 = readonly [number, number, number];

/** A painting the player can jump into. `y` is the floor height under it. */
export type LevelPortal = {
  id: string;
  x: number;
  y: number;
  z: number;
  prompt?: string;
  /** Horizontal reach that shows the prompt. */
  near?: number;
};

export type LevelContext = {
  scene: THREE.Scene;
  world: RAPIER.World;
  rapier: typeof RAPIER;
  camera: THREE.PerspectiveCamera;
  host: HTMLElement;
  signal: AbortSignal;
};

export type LevelFrame = {
  time: number;
  delta: number;
  player: THREE.Vector3;
  grounded: boolean;
  /** Moves the player (feet position) and clears their velocity. */
  teleport: (feet: Vec3) => void;
  /** Replaces the HUD title, e.g. with the current area name. */
  setTitle: (title: string) => void;
  /** Launches the player upward (jump pads); `planar` scales kept horizontal speed. */
  launch: (speed: number, planar?: number) => void;
};

export type LevelContent = {
  portals: LevelPortal[];
  sun: THREE.DirectionalLight;
  /** Called every unpaused frame; may return a HUD prompt that overrides portal prompts. */
  update?: (frame: LevelFrame) => string | void;
  /** Runs before every fixed physics step, for kinematic platforms. */
  beforeStep?: (step: number) => void;
  /** Sword combat state shared with the world's enemy simulation. */
  combat?: Encounter;
  /** Something held in the right hand (Hollow Lane's flashlight). */
  held?: "flashlight";
  /** Warp-platformer handshake: spin attacks, bounces and the death freeze. */
  platformer?: PlatformerLink;
  /** Lock-on candidates, read when the lock control is pressed. */
  lockTargets?: () => LockTarget[];
  /** Feet position used after a fall; defaults to the spawn. */
  respawn?: () => Vec3;
  dispose?: () => void;
};

export type LevelConfig = {
  chapter: string;
  title: string;
  mood: SoundMood;
  spawn: { position: Vec3; yaw: number };
  /** Horizontal distance from the origin beyond which the player respawns. */
  boundary?: number;
  killY?: number;
  cameraDistance?: number;
  /** Atmosphere and colour grade for this world. */
  post?: ViewportPost;
  build: (context: LevelContext) => LevelContent | Promise<LevelContent>;
  onEnter: (portalId: string) => void;
};

/** Gilded painting frame shared by every world's portals. Face looks down local +Z. */
export function createPortalPainting(image: string, frameColor = "#76532c") {
  const group = new THREE.Group();
  const map = new THREE.TextureLoader().load(image);
  map.colorSpace = THREE.SRGBColorSpace;
  const frame = new THREE.Mesh(
    new THREE.BoxGeometry(2.3, 2.9, 0.16),
    new THREE.MeshStandardMaterial({ color: frameColor, metalness: 0.3, roughness: 0.5 }),
  );
  frame.castShadow = true;
  const painting = new THREE.Mesh(
    new THREE.PlaneGeometry(2.05, 2.65),
    new THREE.MeshBasicMaterial({ map, side: THREE.DoubleSide }),
  );
  painting.position.z = 0.087;
  group.add(frame, painting);
  return group;
}

/** Fixed cuboid collider; `half` are half extents. */
export function addBox(world: RAPIER.World, half: Vec3, position: Vec3, rotation?: THREE.Euler) {
  const desc = RAPIER.ColliderDesc.cuboid(...half).setTranslation(...position);
  if (rotation) {
    const q = new THREE.Quaternion().setFromEuler(rotation);
    desc.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w });
  }
  return world.createCollider(desc);
}

export function addCylinder(
  world: RAPIER.World,
  halfHeight: number,
  radius: number,
  position: Vec3,
) {
  return world.createCollider(
    RAPIER.ColliderDesc.cylinder(halfHeight, radius).setTranslation(...position),
  );
}

/** Mesh plus matching fixed collider for an axis-aligned (or yawed) box. */
export function solidBox(
  scene: THREE.Object3D,
  world: RAPIER.World,
  size: Vec3,
  position: Vec3,
  material: THREE.Material,
  yaw = 0,
) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
  mesh.position.set(...position);
  mesh.rotation.y = yaw;
  mesh.castShadow = mesh.receiveShadow = true;
  scene.add(mesh);
  addBox(world, [size[0] / 2, size[1] / 2, size[2] / 2], position, new THREE.Euler(0, yaw, 0));
  return mesh;
}

export function createSun(color: THREE.ColorRepresentation, intensity: number, extent = 24) {
  const sun = new THREE.DirectionalLight(color, intensity);
  const shadowCamera = sun.shadow.camera;
  shadowCamera.left = shadowCamera.bottom = -extent;
  shadowCamera.right = shadowCamera.top = extent;
  shadowCamera.far = 110;
  shadowCamera.updateProjectionMatrix();
  sun.shadow.normalBias = 0.025;
  return sun;
}

/** A flashlight gripped where the sword would be; publishes its lens to `heldItems`. */
function mountFlashlight(character: THREE.Object3D) {
  const fist = PLAYER_MODEL.mounts.map((name) => character.getObjectByName(name)).find(Boolean);
  if (!fist) return;
  const torch = new THREE.Group();
  torch.position.set(0, PLAYER_MODEL.torch.offset, 0);
  torch.quaternion.set(Math.SQRT1_2, 0, 0, Math.SQRT1_2);
  const metal = new THREE.MeshStandardMaterial({
    color: "#2a2b30",
    metalness: 0.7,
    roughness: 0.35,
  });
  const lensMaterial = new THREE.MeshBasicMaterial({
    color: new THREE.Color(0.15, 0.15, 0.12),
    toneMapped: false,
  });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.3, 12), metal);
  body.position.y = 0.1;
  const head = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.05, 0.1, 14), metal);
  head.position.y = 0.3;
  const lens = new THREE.Mesh(new THREE.CircleGeometry(0.066, 14), lensMaterial);
  lens.position.y = 0.352;
  lens.rotation.x = -Math.PI / 2;
  const halo = new THREE.Mesh(
    new THREE.SphereGeometry(0.06, 12, 8),
    new THREE.MeshBasicMaterial({
      color: new THREE.Color(2.4, 2.1, 1.6),
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    }),
  );
  halo.position.y = 0.37;
  body.castShadow = head.castShadow = true;
  torch.add(body, head, lens, halo);
  torch.scale.setScalar(PLAYER_MODEL.torch.scale);
  fist.add(torch);
  heldItems.flashlightLens = lens;
  torch.onBeforeRender = () => {};
  lens.onBeforeRender = () => {
    lensMaterial.color.setScalar(heldItems.flashlightOn ? 3 : 0.12);
    halo.visible = heldItems.flashlightOn;
  };
  for (const name of ["PlayerSword", "PlayerShield"]) {
    const item = character.getObjectByName(name);
    if (item) item.visible = false;
  }
}

/** Native third-person level: physics, player, camera, HUD and portal entry. */
export async function mountLevel(host: HTMLElement, signal: AbortSignal, config: LevelConfig) {
  await (physicsInit ??= RAPIER.init());
  if (signal.aborted) return;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(52, 1, 0.1, 500);
  const view = element("div", "game-viewport");
  view.tabIndex = -1;
  host.append(view);
  const viewport = createViewport(view, scene, camera, config.post);
  const world = new RAPIER.World({ x: 0, y: -30, z: 0 });
  const content = await config.build({ scene, world, rapier: RAPIER, camera, host, signal });
  if (signal.aborted) {
    content.dispose?.();
    world.free();
    disposeObjects(scene);
    viewport.dispose();
    return;
  }
  const { sun, portals } = content;
  if (!sun.parent) scene.add(sun, sun.target);

  const start = new THREE.Vector3(...config.spawn.position);
  start.y += HALF_HEIGHT + RADIUS + 0.05;
  const player = createPlayerController({
    world,
    rapier: RAPIER,
    camera,
    position: start.toArray(),
    yaw: config.spawn.yaw,
    capsuleHalfHeight: HALF_HEIGHT,
    capsuleRadius: RADIUS,
  });
  world.step();
  const avatar = new THREE.Group();
  scene.add(avatar);
  const placeholder = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.32, 0.9),
    new THREE.MeshStandardMaterial({ color: "#514536" }),
  );
  placeholder.position.y = 0.78;
  avatar.add(placeholder);
  let mixer: THREE.AnimationMixer | undefined;
  const actions = new Map<string, THREE.AnimationAction>();
  let action: THREE.AnimationAction | undefined;
  void new GLTFLoader()
    .loadAsync(PLAYER_MODEL.path)
    .then(({ scene: model, animations }) => {
      if (signal.aborted) {
        disposeObjects(model);
        return;
      }
      model.scale.setScalar(PLAYER_MODEL.unitScale);
      model.traverse((object) => {
        if (object instanceof THREE.Mesh) object.castShadow = true;
        if (object.name === "PlayerSword" || object.name === "PlayerShield")
          object.visible = Boolean(content.combat);
      });
      if (content.held === "flashlight") mountFlashlight(model);
      avatar.add(model);
      placeholder.visible = false;
      mixer = new THREE.AnimationMixer(model);
      for (const clip of animations) actions.set(clip.name, mixer.clipAction(clip));
    })
    .catch((error: unknown) => console.warn("Could not load player model", error));

  const hudProps: ExperienceHudProps = {
    chapter: config.chapter,
    title: config.title,
    prompt: "",
    leaving: false,
    ready: true,
  };
  const hud = mountExperienceHud(host, gameStore, hudProps, setPlayerControl);
  let bindingSettings = gameStore.getSnapshot().settings;
  const armed = Boolean(content.combat || content.platformer);
  let disposeInput = mountPlayerControls(bindingSettings, armed);
  const unsubscribe = gameStore.subscribe(() => {
    const { settings } = gameStore.getSnapshot();
    if (
      bindingSettings.bindings !== settings.bindings ||
      bindingSettings.sprintKey !== settings.sprintKey
    ) {
      disposeInput();
      bindingSettings = settings;
      disposeInput = mountPlayerControls(settings, armed);
    }
  });

  let yaw = config.spawn.yaw - Math.PI;
  let pitch = 0.4;
  let dragging = false;
  viewport.canvas.addEventListener(
    "pointerdown",
    (event) => {
      if (event.button !== 0) return;
      if (armed) {
        if (!document.pointerLockElement && !gameStore.getSnapshot().paused)
          void Promise.resolve(viewport.canvas.requestPointerLock()).catch(() => {});
        return;
      }
      dragging = true;
      viewport.canvas.setPointerCapture(event.pointerId);
    },
    { signal },
  );
  viewport.canvas.addEventListener("lostpointercapture", () => (dragging = false), { signal });
  viewport.canvas.addEventListener(
    "pointermove",
    (event) => {
      const { paused, settings } = gameStore.getSnapshot();
      if (!(dragging || (armed && document.pointerLockElement === viewport.canvas)) || paused)
        return;
      const speed = settings.sensitivity * 0.000035;
      yaw -= event.movementX * speed;
      pitch = THREE.MathUtils.clamp(
        pitch + event.movementY * speed * (settings.invertY ? -1 : 1),
        0.1,
        1.25,
      );
    },
    { signal },
  );
  const cameraDistance = config.cameraDistance ?? 6.5;
  const focus = new THREE.Vector3();
  const cameraRay = new THREE.Vector3();
  let indoorBlend = 0;
  function placeCamera(delta: number) {
    // Indoors the rig closes in over the right shoulder.
    indoorBlend = THREE.MathUtils.damp(indoorBlend, cameraRig.indoor ? 1 : 0, 5, delta);
    focus.copy(avatar.position);
    focus.y += THREE.MathUtils.lerp(1.35, 1.45, indoorBlend);
    focus.x += Math.cos(yaw) * 0.95 * indoorBlend;
    focus.z -= Math.sin(yaw) * 0.95 * indoorBlend;
    const reach = THREE.MathUtils.lerp(cameraDistance, 3, indoorBlend);
    cameraRay.set(
      Math.sin(yaw) * Math.cos(pitch),
      Math.sin(pitch),
      Math.cos(yaw) * Math.cos(pitch),
    );
    const obstruction = world.castRay(
      new RAPIER.Ray(focus, cameraRay),
      reach,
      true,
      RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,
      undefined,
      player.collider,
      player.body,
    );
    const distance = obstruction ? Math.max(0.35, obstruction.timeOfImpact - 0.25) : cameraDistance;
    camera.position.copy(focus).addScaledVector(cameraRay, distance);
    camera.lookAt(focus);
    camera.updateMatrixWorld();
  }

  const setHud = (prompt: string, leaving = hudProps.leaving) => {
    if (prompt === hudProps.prompt && leaving === hudProps.leaving) return;
    hudProps.prompt = prompt;
    hudProps.leaving = leaving;
    hud.update(hudProps);
  };

  function teleport(feet: Vec3) {
    player.body.setTranslation(
      { x: feet[0], y: feet[1] + HALF_HEIGHT + RADIUS + 0.05, z: feet[2] },
      true,
    );
    player.handle.velocity.set(0, 0, 0);
    accumulator = 0;
  }
  const setTitle = (title: string) => {
    if (title === hudProps.title) return;
    hudProps.title = title;
    hud.update(hudProps);
  };

  let accumulator = 0;
  let time = 0;
  let lastRoll = heldControls().rollPress;
  let rollTime = Infinity;
  let rollDuration = 0;
  let rollPeak = 0;
  let backstep = false;
  let cooldown = 0;
  const rollDirection = new THREE.Vector3();
  let portalTime = 0;
  let destination: LevelPortal | undefined;
  let mapSize = 0;
  const playerPosition = new THREE.Vector3();
  const sunOffset = sun.position.lengthSq() ? sun.position.clone() : new THREE.Vector3(-18, 28, 14);
  const link = content.platformer;
  let spinSeen = heldControls().attackPress + heldControls().interactPress;
  const hang = {
    active: false,
    time: 0,
    climbTime: -1,
    point: new THREE.Vector3(),
    forward: new THREE.Vector3(),
    normal: new THREE.Vector3(),
    climbStart: new THREE.Vector3(),
    lastJumpPress: heldControls().jumpPress,
  };
  const hangTarget = new THREE.Vector3();
  const CENTER = HALF_HEIGHT + RADIUS;
  const fight = content.combat;
  let shownAttack = fight?.attackId ?? 0;
  const buffer = createCombatInput(heldControls().attackPress, heldControls().rollPress);
  let parrySeen = heldControls().parryPress;
  let lockSeen = heldControls().lockPress;
  let guardHeld = false;
  let lock: { id: string; hidden: number } | null = null;
  let lastPlayerHit = fight?.playerHitId ?? 0;
  const SPRINT_DRAIN = 14;
  const SPRINT_RECOVER = 30;
  const bodyYaw = () => Math.atan2(player.handle.bodyZAxis.x, player.handle.bodyZAxis.z);
  /** Body yaw the movement keys point toward, relative to the camera, or null. */
  const inputYaw = (input: ReturnType<typeof heldControls>) => {
    const ahead = (input.forward ? 1 : 0) - (input.backward ? 1 : 0),
      side = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    if (!ahead && !side) return null;
    return Math.atan2(
      -Math.sin(yaw) * ahead + Math.cos(yaw) * side,
      -Math.cos(yaw) * ahead - Math.sin(yaw) * side,
    );
  };
  const lockedTarget = () =>
    lock ? content.lockTargets?.().find((t) => t.id === lock!.id) : undefined;
  setMood(config.mood);
  const stop = startFrameLoop(({ delta, interval }) => {
    const { paused, settings } = gameStore.getSnapshot();
    const input = heldControls();
    if (!paused) {
      time += delta;
      const grounded = player.handle.isOnGround;
      const feet = player.body.translation();
      const rolling = rollTime < rollDuration;
      cooldown = Math.max(0, cooldown - delta);

      // Lock-on: press to pick the best target in view, again to release.
      if (input.lockPress !== lockSeen) {
        lockSeen = input.lockPress;
        if (lock) lock = null;
        else if (content.lockTargets) {
          const target = pickLockTarget(
            content.lockTargets(),
            feet.x,
            feet.y - HALF_HEIGHT - RADIUS,
            feet.z,
            yaw,
          );
          lock = target ? { id: target.id, hidden: 0 } : null;
        }
      }
      const target = lockedTarget();
      if (lock && !lockHolds(target, feet.x, feet.y - HALF_HEIGHT - RADIUS, feet.z)) {
        lock.hidden += delta;
        if (!target || lock.hidden > LOCK_LOST_DELAY) lock = null;
      } else if (lock) lock.hidden = 0;
      const lockYaw = lock && target ? lockFacingYaw(target, feet.x, feet.z) : null;
      if (lock && target) yaw = dampAngle(yaw, lockCameraYaw(target, feet.x, feet.z), 8, delta);

      if (link) {
        link.x = feet.x;
        link.y = feet.y - HALF_HEIGHT - RADIUS;
        link.z = feet.z;
        link.vy = player.handle.velocity.y;
        link.grounded = grounded;
        link.spinTime = Math.max(0, link.spinTime - delta);
        link.spinCooldown = Math.max(0, link.spinCooldown - delta);
        const presses = input.attackPress + input.interactPress;
        if (presses !== spinSeen) {
          spinSeen = presses;
          if (link.spinTime === 0 && link.spinCooldown === 0 && !link.frozen) {
            link.spinTime = SPIN_TIME;
            link.spinCooldown = SPIN_TIME + SPIN_COOLDOWN;
            playSound("spin");
          }
        }
        if (link.bounce > 0) {
          player.handle.launch(link.bounce);
          link.bounce = 0;
        }
      }
      let requested = { attack: false, dodge: false };
      if (fight) {
        fight.playerX = feet.x;
        fight.playerY = feet.y - HALF_HEIGHT - RADIUS;
        fight.playerZ = feet.z;
        fight.playerYaw = bodyYaw();
        fight.rolling = rolling;
        if (fight.hurtTime > 0) fight.drinkTime = 0;
        if (fight.hitStop <= 0) {
          if (fight.parryTime >= 0) {
            fight.parryTime += delta;
            if (fight.parryTime > PARRY_DURATION) fight.parryTime = -1;
          }
          if (fight.plunging) {
            if (grounded) {
              fight.plunging = false;
              fight.attackId++;
              fight.attackTime = swordAttackDuration(PLUNGE_ATTACK);
              fight.shake = Math.max(fight.shake, 0.7);
              playSound("land", { intensity: 1 });
            }
          } else if (fight.attackTime > 0) {
            fight.attackTime = Math.max(0, fight.attackTime - delta);
            if (fight.attackTime === 0) fight.sinceSwing = 0;
          } else fight.sinceSwing += delta;
        }
        requested = stepCombatInput(
          buffer,
          input,
          {
            blocked: fight.health <= 0 || (fight.bossHealth <= 0 && fight.freezeOnVictory),
            stunned: fight.hurtTime > 0 || fight.parryTime >= 0 || fight.drinkTime > 0,
            grounded,
            rolling,
            rollElapsed: rollTime,
            cooldown,
            attackStep: fight.attackStep,
            attackRemaining: fight.attackTime,
            stamina: fight.stamina,
            canAttack: true,
          },
          delta,
        );
        fight.inputAttack = input.attackPress;
        if (requested.attack) {
          let step = rolling
            ? 0
            : nextSwordStep(fight.attackStep, fight.attackTime > 0, fight.sinceSwing);
          if (!grounded) {
            const below = world.castRay(
              new RAPIER.Ray(
                { x: feet.x, y: fight.playerY + 0.1, z: feet.z },
                { x: 0, y: -1, z: 0 },
              ),
              40,
              true,
              RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,
              undefined,
              player.collider,
              player.body,
            );
            const drop = below ? below.timeOfImpact - 0.1 : Infinity;
            step =
              player.handle.velocity.y < 1 && drop >= PLUNGE_HEIGHT ? PLUNGE_ATTACK : JUMP_ATTACK;
          }
          rollTime = rollDuration;
          fight.attackStep = step;
          fight.stamina = Math.max(
            0,
            fight.stamina - swordSpec(step).stamina * combatTuning.attackStaminaScale,
          );
          fight.attackId++;
          fight.attackTime = swordAttackDuration(step);
          fight.plunging = step === PLUNGE_ATTACK;
          fight.sinceSwing = 0;
          fight.staminaDelay = STAMINA_REGEN_DELAY;
          const aim = lockYaw ?? inputYaw(input);
          if (aim !== null) player.handle.turnTo(aim);
          playSound("slash");
        } else if (
          fight.attackTime > 0 &&
          swordProgress(fight.attackStep, fight.attackTime) < 0.25
        ) {
          const aim = lockYaw ?? inputYaw(input);
          if (aim !== null) player.handle.turnTo(dampAngle(bodyYaw(), aim, 12, delta));
        }
        if (requested.dodge) fight.attackTime = 0;
        fight.invulnerable = rolling && dodgeInvulnerable(backstep, rollTime, settings.rollWeight);
        if (input.parryPress !== parrySeen) {
          parrySeen = input.parryPress;
          if (
            grounded &&
            !rolling &&
            fight.attackTime <= 0 &&
            fight.hurtTime <= 0 &&
            fight.parryTime < 0 &&
            fight.drinkTime <= 0 &&
            fight.stamina > 0
          ) {
            fight.parryTime = 0;
            fight.stamina = Math.max(0, fight.stamina - PARRY_STAMINA);
            fight.staminaDelay = STAMINA_REGEN_DELAY;
            if (lockYaw !== null) player.handle.turnTo(lockYaw);
          }
        }
        stepDeflect(fight, input.guard && !guardHeld, fight.hitStop > 0 ? 0 : delta);
        guardHeld = input.guard;
        fight.guarding =
          input.guard &&
          grounded &&
          !rolling &&
          fight.attackTime <= 0 &&
          fight.hurtTime <= 0 &&
          fight.parryTime < 0 &&
          fight.drinkTime <= 0 &&
          fight.stamina > 0;
        fight.hyperArmor = fight.plunging || swordArmored(fight.attackStep, fight.attackTime);
        if (fight.hurtTime > 0) fight.attackTime = 0;
        if (fight.playerHitId > lastPlayerHit && !fight.bossActive) playSound("hurt");
        lastPlayerHit = fight.playerHitId;
      } else {
        requested.dodge = input.rollPress !== lastRoll && grounded && cooldown === 0 && !rolling;
      }
      lastRoll = input.rollPress;
      const enabled =
        !link?.frozen &&
        (!fight ||
          (fight.health > 0 &&
            fight.attackTime === 0 &&
            fight.hurtTime === 0 &&
            fight.parryTime < 0 &&
            fight.guardHitTime === 0 &&
            !fight.plunging));
      const moveInput = input.forward || input.backward || input.left || input.right;
      if (fight) {
        if (input.run && moveInput && grounded && !rolling && fight.inCombat && !fight.winded) {
          fight.stamina = Math.max(0, fight.stamina - SPRINT_DRAIN * delta);
          fight.staminaDelay = Math.max(fight.staminaDelay, 0.25);
          if (fight.stamina === 0) fight.winded = true;
        }
        if (fight.winded && fight.stamina >= SPRINT_RECOVER) fight.winded = false;
      }
      if (requested.dodge && enabled && !rolling) {
        const roll = ROLL_WEIGHTS[settings.rollWeight];
        const aim = inputYaw(input);
        backstep = aim === null;
        rollDuration = backstep ? BACKSTEP_DURATION : roll.duration;
        rollPeak = backstep
          ? BACKSTEP_SPEED
          : rollPeakFor(ROLL_DISTANCE * roll.distance, rollDuration);
        cooldown = backstep ? BACKSTEP_DURATION : roll.cooldown;
        rollTime = 0;
        if (aim === null) rollDirection.copy(player.handle.bodyZAxis).multiplyScalar(-1);
        else {
          rollDirection.set(Math.sin(aim), 0, Math.cos(aim));
          player.handle.turnTo(aim);
        }
        rollDirection.y = 0;
        rollDirection.normalize();
        if (fight) {
          fight.stamina = Math.max(0, fight.stamina - combatTuning.rollStaminaCost);
          fight.staminaDelay = STAMINA_REGEN_DELAY;
        }
        playSound("roll");
      }
      if (lockYaw !== null && enabled && rollTime >= rollDuration && grounded)
        player.handle.turnTo(dampAngle(bodyYaw(), lockYaw, 14, delta));

      // Ledge grab: a chest-height wall ray, then a downward ray for a walkable top.
      const velocity = player.handle.velocity;
      if (!hang.active && enabled && !grounded && velocity.y < -0.5 && !link?.frozen) {
        const planar = Math.hypot(velocity.x, velocity.z);
        let ax = -Math.sin(yaw);
        let az = -Math.cos(yaw);
        if (planar > 1) {
          ax = velocity.x / planar;
          az = velocity.z / planar;
        }
        const wallHit = world.castRayAndGetNormal(
          new RAPIER.Ray({ x: feet.x, y: feet.y + 0.35, z: feet.z }, { x: ax, y: 0, z: az }),
          LEDGE_WALL_REACH,
          true,
          RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,
          undefined,
          player.collider,
          player.body,
        );
        if (wallHit) {
          const top = { x: feet.x + ax * 0.6, y: feet.y + 1.5, z: feet.z + az * 0.6 };
          const topHit = world.castRayAndGetNormal(
            new RAPIER.Ray(top, { x: 0, y: -1, z: 0 }),
            1.5 + LEDGE_TOP_MAX,
            true,
            RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,
            undefined,
            player.collider,
            player.body,
          );
          if (topHit) {
            const topY = top.y - topHit.timeOfImpact;
            if (
              canGrabLedge({
                grounded,
                verticalSpeed: velocity.y,
                wallDist: wallHit.timeOfImpact,
                topHeight: topY - (feet.y - CENTER),
                wallNormalY: wallHit.normal.y,
                topNormalY: topHit.normal.y,
              })
            ) {
              hang.active = true;
              hang.climbTime = -1;
              hang.time = 0;
              hang.point.set(
                feet.x + ax * wallHit.timeOfImpact,
                topY,
                feet.z + az * wallHit.timeOfImpact,
              );
              hang.forward.set(ax, 0, az);
              hang.normal.set(-ax, 0, -az);
              hang.lastJumpPress = input.jumpPress;
              velocity.set(0, 0, 0);
              playSound("grab");
            }
          }
        }
      }
      if (hang.active) {
        hang.time += delta;
        velocity.set(0, 0, 0);
        hangTarget.set(
          hang.point.x - hang.forward.x * 0.43,
          hang.point.y - LEDGE_HAND_HEIGHT + CENTER,
          hang.point.z - hang.forward.z * 0.43,
        );
        if (input.jumpPress !== hang.lastJumpPress && hang.climbTime < 0) {
          hang.lastJumpPress = input.jumpPress;
          const clearance = world.castRay(
            new RAPIER.Ray(
              {
                x: hang.point.x + hang.forward.x * 0.55,
                y: hang.point.y + 0.05,
                z: hang.point.z + hang.forward.z * 0.55,
              },
              { x: 0, y: 1, z: 0 },
            ),
            2.4,
            true,
            RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,
            undefined,
            player.collider,
            player.body,
          );
          if (!clearance) {
            hang.climbTime = 0;
            hang.climbStart.copy(feet);
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
            THREE.MathUtils.lerp(hang.climbStart.y, hang.point.y + CENTER + 0.06, progress.up),
            THREE.MathUtils.lerp(
              hang.climbStart.z,
              hang.point.z + hang.forward.z * 0.55,
              progress.forward,
            ),
          );
          if (progress.done) hang.active = false;
        } else {
          const blend = 1 - Math.exp(-10 * delta);
          hangTarget.set(
            feet.x + (hangTarget.x - feet.x) * blend,
            feet.y + (hangTarget.y - feet.y) * blend,
            feet.z + (hangTarget.z - feet.z) * blend,
          );
        }
        player.body.setTranslation(hangTarget, true);
        player.body.setNextKinematicTranslation(hangTarget);
        player.handle.turnTo(Math.atan2(hang.forward.x, hang.forward.z));
        if (hang.active && hang.climbTime < 0 && (input.backward || hang.time > HANG_TIMEOUT)) {
          hang.active = false;
          hang.lastJumpPress = input.jumpPress;
          velocity.set(hang.normal.x * 2.5, 0, hang.normal.z * 2.5);
        }
      } else hang.lastJumpPress = input.jumpPress;

      accumulator += delta;
      while (accumulator >= STEP) {
        const speed = rollTime < rollDuration ? rollSpeedAt(rollPeak, rollTime, rollDuration) : 0;
        const stagger =
          fight && fight.hurtTime > 0 && fight.health > 0 ? fight.hurtTime / PLAYER_HURT_TIME : 0;
        const planarOverride = speed
          ? { x: speed * rollDirection.x, z: speed * rollDirection.z }
          : stagger
            ? { x: fight!.knockX * stagger, z: fight!.knockZ * stagger }
            : !enabled && grounded
              ? { x: 0, z: 0 }
              : null;
        player.handle.setMovement({
          forward: enabled && input.forward,
          backward: enabled && input.backward,
          leftward: enabled && input.left,
          rightward: enabled && input.right,
          run: input.run && isSprintAllowed() && !(fight?.winded ?? false) && !fight?.guarding,
          jump: enabled && input.jump && !speed,
          preserveFacing: speed > 0 || !enabled || lockYaw !== null,
          planarOverride,
        });
        content.beforeStep?.(STEP);
        if (!hang.active) player.step();
        world.step();
        accumulator -= STEP;
        rollTime += STEP;
      }
      const position = player.body.translation();
      if (
        position.y < (config.killY ?? -15) ||
        (config.boundary !== undefined && Math.hypot(position.x, position.z) > config.boundary)
      ) {
        teleport(content.respawn?.() ?? config.spawn.position);
      }
      avatar.position.copy(player.body.translation());
      avatar.position.y -= HALF_HEIGHT + RADIUS;
      avatar.quaternion.copy(player.body.rotation());
      // Tornado spin: two full turns, fastest at the start.
      if (link && link.spinTime > 0)
        avatar.rotateY((1 - Math.pow(link.spinTime / SPIN_TIME, 1.6)) * Math.PI * 4);
      const walking = player.handle.relativeVelOnPlane.lengthSq() > 0.3;
      const clip =
        (fight && fight.health <= 0) || link?.frozen
          ? "Death"
          : fight && fight.hurtTime > 0
            ? "RecieveHit"
            : fight && fight.guardHitTime > 0
              ? "GuardHit"
              : fight && fight.parryTime >= 0
                ? "Parry"
                : fight?.plunging
                  ? "PlungeFall"
                  : fight && fight.attackTime > 0
                    ? SWORD_MOVES[swordStep(fight.attackStep)].clip
                    : hang.active
                      ? hang.climbTime >= 0
                        ? "LedgeClimb"
                        : hang.time < CLIP_SECONDS.LedgeGrab
                          ? "LedgeGrab"
                          : "LedgeHang"
                      : rollTime < rollDuration
                        ? backstep
                          ? "Backstep"
                          : "Roll"
                        : !player.handle.isOnGround
                          ? player.handle.velocity.y > 0
                            ? "JumpRise"
                            : "JumpFall"
                          : walking
                            ? input.run
                              ? "Run"
                              : "Walk"
                            : fight?.guarding
                              ? "Guard"
                              : "Idle";
      const next = actions.get(clip) ?? actions.get("Idle");
      const restart = fight && clip.startsWith("Sword") && fight.attackId !== shownAttack;
      if (next && (next !== action || restart)) {
        if (fight) shownAttack = fight.attackId;
        action?.fadeOut(0.08);
        const once = clip !== "Idle" && clip !== "Walk" && clip !== "Run" && clip !== "Guard";
        next.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
        next.clampWhenFinished = once;
        next.timeScale =
          fight && clip.startsWith("Sword") && fight.attackTime > 0
            ? next.getClip().duration / Math.max(0.05, swordAttackDuration(fight.attackStep))
            : CLIP_SECONDS[clip]
              ? next.getClip().duration / CLIP_SECONDS[clip]
              : clip === "Roll" || clip === "Backstep"
                ? next.getClip().duration / Math.max(0.05, rollDuration)
                : 1;
        next.reset().fadeIn(0.08).play();
        action = next;
      }
      mixer?.update(fight && fight.hitStop > 0 ? 0 : delta);

      playerPosition.copy(avatar.position);
      const override = content.update?.({
        time,
        delta,
        player: playerPosition,
        grounded: player.handle.isOnGround,
        teleport,
        setTitle,
        launch: (speed, planar) => player.handle.launch(speed, planar),
      });
      const nearby = portals.find(
        (portal) => Math.hypot(position.x - portal.x, position.z - portal.z) < (portal.near ?? 5),
      );
      const prompt =
        override || (nearby && settings.showHints ? (nearby.prompt ?? "Jump through") : "");
      setHud(prompt);
      if (
        !destination &&
        nearby &&
        canEnterPortal({
          distance: Math.hypot(position.x - nearby.x, position.z - nearby.z),
          grounded: player.handle.isOnGround,
          feetHeight: avatar.position.y - nearby.y,
        })
      ) {
        destination = nearby;
        portalTime = settings.reducedMotion ? 0.08 : 0.85;
        setHud(prompt, true);
        playSound("portal");
      }
      if (destination && (portalTime -= delta) <= 0) {
        config.onEnter(destination.id);
        return;
      }
    }
    placeCamera(paused ? 0 : interval / 1000);
    sun.target.position.copy(avatar.position);
    sun.position.copy(avatar.position).add(sunOffset);
    const nextSize = ps2ShadowSize(shadowSizes[settings.shadows], settings.ps2Style);
    if (nextSize !== mapSize) {
      mapSize = nextSize;
      sun.castShadow = mapSize > 0;
      sun.shadow.map?.dispose();
      sun.shadow.map = null;
      sun.shadow.mapSize.setScalar(Math.max(1, mapSize));
    }
    if (view.inert !== paused) view.inert = paused;
    viewport.render(settings, paused ? 0 : interval);
  });
  return () => {
    stop();
    unsubscribe();
    disposeInput();
    hud.dispose();
    content.dispose?.();
    player.dispose();
    world.free();
    mixer?.stopAllAction();
    sun.shadow.dispose();
    disposeObjects(scene);
    viewport.dispose();
  };
}
