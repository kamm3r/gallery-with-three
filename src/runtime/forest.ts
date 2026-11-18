import { RiverSurface } from "./riverSurface";
import RAPIER from "@dimforge/rapier3d-compat";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { PLAYER_MODEL } from "../gameplay/characterAnimations";
import { HUB_PAINTING_SCALE, HUB_PORTALS, inPortalGarden } from "../gameplay/hubPortals";
import { hubSpawn } from "../gameplay/hubSpawn";
import {
  buildTerrainGrid,
  groundHeight,
  PLAY_RADIUS,
  scatter,
  WATER_LEVEL,
} from "../gameplay/terrain";
import {
  BACKSTEP_DURATION,
  BACKSTEP_SPEED,
  ROLL_DISTANCE,
  canEnterPortal,
  rollPeakFor,
  rollSpeedAt,
  ROLL_WEIGHTS,
} from "../gameplay/playerRules";
import { playSound, setMood } from "../gameplay/sound";
import { shadowSizes } from "../gameplay/graphicsSettings";
import { ps2ShadowSize } from "../gameplay/ps2Style";
import { mountExperienceHud } from "../ui/experienceHud";
import { element } from "../ui/dom";
import { gameStore } from "./gameStore";
import { startFrameLoop } from "./frameLoop";
import { createHubGround } from "./hubGround";
import { createPlayerController } from "./playerController";
import { heldControls, mountPlayerControls, setPlayerControl } from "./playerInput";
import { createViewport } from "./viewport";
import { disposeObjects } from "./disposeObjects";

const HALF_HEIGHT = 0.5;
const RADIUS = 0.42;
const STEP = 1 / 60;
let physicsInit: Promise<void> | undefined;

export async function mountForest(
  host: HTMLElement,
  returnPortal: string | undefined,
  onEnter: (portal: (typeof HUB_PORTALS)[number]) => void,
  signal: AbortSignal,
) {
  await (physicsInit ??= RAPIER.init());
  if (signal.aborted) return;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#a6bda9");
  scene.fog = new THREE.FogExp2("#a6bda9", 0.009);
  const camera = new THREE.PerspectiveCamera(52, 1, 0.1, 500);
  const view = element("div", "game-viewport");
  view.tabIndex = -1;
  host.append(view);
  const viewport = createViewport(view, scene, camera);
  const world = new RAPIER.World({ x: 0, y: -30, z: 0 });
  const grid = buildTerrainGrid();
  world.createCollider(
    RAPIER.ColliderDesc.trimesh(new Float32Array(grid.vertices), new Uint32Array(grid.indices)),
  );
  scene.add(createHubGround(grid));
  const water = new RiverSurface();
  const waterMesh = new THREE.Mesh(water.geometry, water.material);
  waterMesh.receiveShadow = true;
  scene.add(waterMesh);
  scene.add(new THREE.HemisphereLight("#edf6df", "#55513a", 2.3));
  const sun = new THREE.DirectionalLight("#fff0cc", 2.4);
  const shadowCamera = sun.shadow.camera;
  shadowCamera.left = shadowCamera.bottom = -24;
  shadowCamera.right = shadowCamera.top = 24;
  shadowCamera.far = 110;
  shadowCamera.updateProjectionMatrix();
  sun.shadow.normalBias = 0.025;
  scene.add(sun, sun.target);

  const spawn = hubSpawn(returnPortal);
  const start = new THREE.Vector3().fromArray(spawn.position);
  start.y = groundHeight(start.x, start.z) + HALF_HEIGHT + RADIUS + 0.05;
  const player = createPlayerController({
    world,
    rapier: RAPIER,
    camera,
    position: start.toArray(),
    yaw: spawn.yaw,
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
  const loader = new GLTFLoader();
  let mixer: THREE.AnimationMixer | undefined;
  const actions = new Map<string, THREE.AnimationAction>();
  let action: THREE.AnimationAction | undefined;
  void loader
    .loadAsync(PLAYER_MODEL.path)
    .then(({ scene: model, animations }) => {
      if (signal.aborted) {
        disposeObjects(model);
        return;
      }
      model.scale.setScalar(PLAYER_MODEL.unitScale);
      model.traverse((object) => {
        if (object instanceof THREE.Mesh) object.castShadow = true;
        if (object.name === "PlayerSword" || object.name === "PlayerShield") object.visible = false;
      });
      avatar.add(model);
      placeholder.visible = false;
      mixer = new THREE.AnimationMixer(model);
      for (const clip of animations) actions.set(clip.name, mixer.clipAction(clip));
    })
    .catch((error: unknown) => console.warn("Could not load player model", error));

  void loader
    .loadAsync("/assets/trees/tree-branched.glb")
    .then(({ scene: tree }) => {
      if (signal.aborted) {
        disposeObjects(tree);
        return;
      }
      const spots: THREE.Matrix4[] = [];
      const placement = new THREE.Object3D();
      for (const point of scatter(550, 12, PLAY_RADIUS - 2, 71, 1.2, 3.3)) {
        if (point.y < WATER_LEVEL || inPortalGarden(point.x, point.z)) continue;
        placement.position.set(point.x, point.y, point.z);
        placement.rotation.y = point.rotation;
        placement.scale.setScalar(point.scale);
        placement.updateMatrix();
        spots.push(placement.matrix.clone());
      }
      tree.updateMatrixWorld(true);
      tree.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        const trees = new THREE.InstancedMesh(object.geometry, object.material, spots.length);
        const matrix = new THREE.Matrix4();
        spots.forEach((spot, index) =>
          trees.setMatrixAt(index, matrix.multiplyMatrices(spot, object.matrixWorld)),
        );
        trees.castShadow = trees.receiveShadow = true;
        scene.add(trees);
      });
    })
    .catch((error: unknown) => console.warn("Could not load forest trees", error));

  const textures = new THREE.TextureLoader();
  const portals = HUB_PORTALS.map((portal) => {
    const group = new THREE.Group();
    const y = groundHeight(portal.x, portal.z);
    group.position.set(portal.x, y + (portal.flat ? 0.08 : 1.8), portal.z);
    group.rotation.set(portal.flat ? -Math.PI / 2 : 0, portal.yaw, 0);
    const map = textures.load(portal.image);
    map.colorSpace = THREE.SRGBColorSpace;
    const frame = new THREE.Mesh(
      new THREE.BoxGeometry(2.3, 2.9, 0.16),
      new THREE.MeshStandardMaterial({ color: "#76532c" }),
    );
    const painting = new THREE.Mesh(
      new THREE.PlaneGeometry(2.05, 2.65),
      new THREE.MeshBasicMaterial({ map, side: THREE.DoubleSide }),
    );
    painting.position.z = 0.087;
    group.add(frame, painting);
    group.scale.setScalar(HUB_PAINTING_SCALE);
    scene.add(group);
    return { portal, y };
  });

  const hudProps = {
    chapter: "The clearing",
    title: "The painted forest",
    prompt: "",
    leaving: false,
    ready: true,
  };
  const hud = mountExperienceHud(host, gameStore, hudProps, setPlayerControl);
  let bindingSettings = gameStore.getSnapshot().settings;
  let disposeInput = mountPlayerControls(bindingSettings);
  const unsubscribe = gameStore.subscribe(() => {
    const { settings } = gameStore.getSnapshot();
    if (
      bindingSettings.bindings !== settings.bindings ||
      bindingSettings.sprintKey !== settings.sprintKey
    ) {
      disposeInput();
      bindingSettings = settings;
      disposeInput = mountPlayerControls(settings);
    }
  });

  let yaw = spawn.yaw - Math.PI;
  let pitch = 0.4;
  let dragging = false;
  const look = (event: PointerEvent) => {
    const { paused, settings } = gameStore.getSnapshot();
    if (!dragging || paused) return;
    const speed = settings.sensitivity * 0.000035;
    yaw -= event.movementX * speed;
    pitch = THREE.MathUtils.clamp(
      pitch + event.movementY * speed * (settings.invertY ? -1 : 1),
      0.1,
      1.25,
    );
  };
  viewport.canvas.addEventListener(
    "pointerdown",
    (event) => {
      if (event.button !== 0) return;
      dragging = true;
      viewport.canvas.setPointerCapture(event.pointerId);
    },
    { signal },
  );
  viewport.canvas.addEventListener(
    "lostpointercapture",
    () => {
      dragging = false;
    },
    { signal },
  );
  viewport.canvas.addEventListener("pointermove", look, { signal });
  const focus = new THREE.Vector3();
  const cameraRay = new THREE.Vector3();

  function placeCamera() {
    focus.copy(avatar.position);
    focus.y += 1.35;
    cameraRay.set(
      Math.sin(yaw) * Math.cos(pitch),
      Math.sin(pitch),
      Math.cos(yaw) * Math.cos(pitch),
    );
    const obstruction = world.castRay(
      new RAPIER.Ray(focus, cameraRay),
      6.5,
      true,
      RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,
      undefined,
      player.collider,
      player.body,
    );
    const distance = obstruction ? Math.max(0.35, obstruction.timeOfImpact - 0.25) : 6.5;
    camera.position.copy(focus).addScaledVector(cameraRay, distance);
    camera.lookAt(focus);
    camera.updateMatrixWorld();
  }

  let accumulator = 0;
  let time = 0;
  let lastRoll = heldControls().rollPress;
  let rollTime = Infinity;
  let rollDuration = 0;
  let rollPeak = 0;
  let cooldown = 0;
  const rollDirection = new THREE.Vector3();
  let portalTime = 0;
  let destination: (typeof HUB_PORTALS)[number] | undefined;
  let mapSize = 0;
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");
  const sunOffset = new THREE.Vector3(-18, 28, 14);
  setMood("meadow");
  const stop = startFrameLoop(({ delta, interval }) => {
    const { paused, settings } = gameStore.getSnapshot();
    const input = heldControls();
    if (!paused) {
      time += delta;
      water.update(time, settings.reducedMotion || reduceMotion.matches);
      accumulator += delta;
      while (accumulator >= STEP) {
        cooldown = Math.max(0, cooldown - STEP);
        if (
          input.rollPress !== lastRoll &&
          player.handle.isOnGround &&
          cooldown === 0 &&
          rollTime >= rollDuration
        ) {
          const roll = ROLL_WEIGHTS[settings.rollWeight];
          const moving = input.forward || input.backward || input.left || input.right;
          rollDuration = moving ? roll.duration : BACKSTEP_DURATION;
          rollPeak = moving
            ? rollPeakFor(ROLL_DISTANCE * roll.distance, rollDuration)
            : BACKSTEP_SPEED;
          cooldown = roll.cooldown;
          rollTime = 0;
          rollDirection.copy(player.handle.bodyZAxis).multiplyScalar(moving ? 1 : -1);
        }
        lastRoll = input.rollPress;
        const speed = rollTime < rollDuration ? rollSpeedAt(rollPeak, rollTime, rollDuration) : 0;
        player.handle.setMovement({
          forward: input.forward,
          backward: input.backward,
          leftward: input.left,
          rightward: input.right,
          run: input.run,
          jump: input.jump && !speed,
          preserveFacing: speed > 0,
          planarOverride: speed ? { x: speed * rollDirection.x, z: speed * rollDirection.z } : null,
        });
        player.step();
        world.step();
        accumulator -= STEP;
        rollTime += STEP;
      }
      const position = player.body.translation();
      if (position.y < -15 || Math.hypot(position.x, position.z) > PLAY_RADIUS) {
        player.body.setTranslation(start, true);
        player.handle.velocity.set(0, 0, 0);
      }
      avatar.position.copy(player.body.translation());
      avatar.position.y -= HALF_HEIGHT + RADIUS;
      avatar.quaternion.copy(player.body.rotation());
      const clip = !player.handle.isOnGround
        ? player.handle.velocity.y > 0
          ? "JumpRise"
          : "JumpFall"
        : rollTime < rollDuration
          ? "Roll"
          : player.handle.relativeVelOnPlane.lengthSq() > 0.3
            ? input.run
              ? "Run"
              : "Walk"
            : "Idle";
      const next = actions.get(clip) ?? actions.get("Idle");
      if (next && next !== action) {
        action?.fadeOut(0.12);
        next.reset().fadeIn(0.12).play();
        action = next;
      }
      mixer?.update(delta);

      const nearby = portals.find(
        ({ portal }) => Math.hypot(position.x - portal.x, position.z - portal.z) < 5,
      );
      const prompt = nearby && settings.showHints ? `Jump into ${nearby.portal.label}` : "";
      if (prompt !== hudProps.prompt) {
        hudProps.prompt = prompt;
        hud.update(hudProps);
      }
      if (
        !destination &&
        nearby &&
        canEnterPortal({
          distance: Math.hypot(position.x - nearby.portal.x, position.z - nearby.portal.z),
          grounded: player.handle.isOnGround,
          feetHeight: avatar.position.y - nearby.y,
        })
      ) {
        destination = nearby.portal;
        portalTime = settings.reducedMotion ? 0.08 : 0.85;
        hudProps.leaving = true;
        hud.update(hudProps);
        playSound("portal");
      }
      if (destination && (portalTime -= delta) <= 0) {
        onEnter(destination);
        return;
      }
    }
    placeCamera();
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
    player.dispose();
    world.free();
    mixer?.stopAllAction();
    sun.shadow.dispose();
    disposeObjects(scene);
    viewport.dispose();
  };
}
