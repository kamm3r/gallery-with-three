import * as THREE from "three";
import { buildCapitalEnvironment } from "../../gameplay/capitalEnvironment";
import {
  capitalKitGeometry,
  capitalKitUv,
  type CapitalKitModel,
} from "../../gameplay/capitalBuildingKit";
import {
  CAPITAL_EXIT,
  capitalAreaAt,
  capitalAreas,
  capitalWorld,
  capitalBeacon,
  capitalBeaconSeal,
  capitalBosses,
  capitalCaches,
  capitalCathedralShortcut,
  capitalGardenGate,
  capitalLanterns,
  capitalLifts,
  capitalNpcs,
  capitalShortcut,
  capitalShrines,
  capitalTownGate,
} from "../../gameplay/capitalLayout";
import { capitalLiftGeometry } from "../../gameplay/capitalLiftGeometry";
import {
  activateCapitalBeacon,
  beginCapitalBoss,
  capitalInteraction,
  claimCapitalCache,
  newCapitalLiftStates,
  requestCapitalLift,
  stepCapitalLift,
  type CapitalInteraction,
} from "../../gameplay/capitalProgress";
import { createParishAutosave, readParishSave, writeParishSave } from "../../gameplay/parishSave";
import {
  createParishEncounter,
  drinkEmber,
  resetParishEncounter,
  parishThreatened,
  restAtParishShrine,
} from "../../gameplay/parishEncounter";
import { keyLabel } from "../../gameplay/controlBindings";
import { playSound } from "../../gameplay/sound";
import { heldControls, pressPlayerAttack } from "../playerInput";
import { mountCapitalHud } from "./capitalHud";
import { createParishEnemyViews } from "./parishEnemies";
import { createAshWarden } from "./ashWarden";
import { openCapitalMap } from "./capitalMap";
import {
  destroyParishEntities,
  stepParishSystems,
  syncParishEntities,
} from "../../gameplay/ecs/parishSystems";
import { runtimeWorld } from "../../gameplay/ecs/world";
import { sunlight } from "../../gameplay/sunlight";
import RAPIER from "@dimforge/rapier3d-compat";
import {
  addBox,
  createPortalPainting,
  createSun,
  mountLevel,
  type LevelPortal,
  type Vec3,
} from "../level";
import { gameStore } from "../gameStore";

/** How far below its place the ground city waits while the sky city floats. */
const GROUND_DROP = 240;
/** Seconds the sky city takes to settle onto the ground once the switch is thrown. */
const GROUND_SETTLE = 7;

function skyDome() {
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    toneMapped: false,
    vertexShader: `varying vec3 vDirection;
      void main(){vDirection=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: `varying vec3 vDirection;
      float hash(vec3 p){p=fract(p*.3183099+.1);p*=17.;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
      float noise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
        return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),
        mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);}
      void main(){vec3 d=normalize(vDirection);float h=smoothstep(-.08,.75,d.y);
        float sun=pow(max(0.,dot(d,normalize(vec3(-.65,.18,.75)))),2.);
        vec3 sky=mix(vec3(.98,.7,.5),vec3(.4,.44,.62),h);
        sky=mix(sky,vec3(1.,.83,.6),sun*(1.-h*.6));
        float cloud=noise(d*7.+vec3(4.,0.,0.))*.57+noise(d*15.)*.28+noise(d*31.)*.15;
        cloud=smoothstep(.46,.7,cloud)*smoothstep(-.04,.12,d.y)*(1.-smoothstep(.5,.9,d.y));
        sky=mix(sky,mix(vec3(.66,.52,.56),vec3(1.,.78,.58),sun),cloud*.7);
        float haze=1.-smoothstep(-.15,.13,d.y);sky=mix(sky,vec3(.92,.72,.6),haze*.45);
        float disc=max(0.,dot(d,normalize(vec3(-.65,.18,.75))));
        sky+=vec3(2.8,2.2,1.5)*pow(disc,900.)+vec3(.35,.22,.1)*pow(disc,60.);
        gl_FragColor=vec4(sky,1.);
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(600, 32, 16), material);
  mesh.renderOrder = -100;
  mesh.frustumCulled = false;
  return mesh;
}

export function mountCapital(host: HTMLElement, onExit: () => void, signal: AbortSignal) {
  const { progress, embers } = readParishSave();
  const shrine = capitalShrines.find((s) => s.id === progress.checkpoint) ?? capitalShrines[0];
  document.title = "The Sacred Capital | The painted forest";
  const environment = buildCapitalEnvironment();
  environment.fogReveal.value = progress.fogCleared ? 1 : 0;
  environment.ground.position.y = progress.fogCleared ? 0 : -GROUND_DROP;
  environment.ground.visible = progress.fogCleared;
  const kit = environment.kitMaterials;
  const geometries: THREE.BufferGeometry[] = [];
  const piece = (
    model: CapitalKitModel,
    size: Vec3,
    material: THREE.Material,
    position: Vec3 = [0, 0, 0],
    rotation: Vec3 = [0, 0, 0],
  ) => {
    const geometry = capitalKitUv(capitalKitGeometry(model, [...size]));
    geometries.push(geometry);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(...position);
    mesh.rotation.set(...rotation);
    mesh.castShadow = mesh.receiveShadow = true;
    return mesh;
  };

  return mountLevel(host, signal, {
    chapter: "The Sacred Capital",
    title: "The Sacred Capital",
    mood: "ash",
    spawn: { position: shrine.spawn, yaw: shrine.id === "refuge" ? Math.PI + 2 : Math.PI },
    killY: -60,
    cameraDistance: 6,
    onEnter: onExit,
    build: ({ scene, world, camera, host, signal }) => {
      scene.background = new THREE.Color("#e3b08f");
      scene.fog = new THREE.Fog("#d9aa8e", 200, 880);
      sunlight.fogColor.value.set("#d9aa8e");
      sunlight.color.value.set("#ffcf9e");
      sunlight.direction.value.set(-0.62, 0.3, 0.72).normalize();
      scene.add(skyDome(), environment.root);
      scene.add(new THREE.HemisphereLight("#f4d3b4", "#4f4250", 1.05));
      const sun = createSun("#ffb47c", 3.6, 32);
      sun.position.set(-40, 19, 46);
      sun.shadow.bias = -0.0004;

      for (const c of environment.colliders) {
        const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), c.yaw);
        world.createCollider(
          RAPIER.ColliderDesc.trimesh(c.vertices, c.indices)
            .setTranslation(...c.position)
            .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }),
        );
      }
      for (const s of environment.solids)
        addBox(
          world,
          [s.size[0] / 2, s.size[1] / 2, s.size[2] / 2],
          [s.position[0], s.position[1] + s.size[1] / 2, s.position[2]],
          new THREE.Euler(0, s.yaw, 0),
        );

      const place = (object: THREE.Object3D, position: Vec3, yaw: number) => {
        object.position.set(...position);
        object.rotation.y = yaw;
        scene.add(object);
        object.updateMatrixWorld(true);
        return object;
      };
      const wallAt = (position: Vec3, yaw: number, half: Vec3, offset: Vec3) => {
        const o = new THREE.Vector3(...offset).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
        return addBox(
          world,
          half,
          [position[0] + o.x, position[1] + o.y, position[2] + o.z],
          new THREE.Euler(0, yaw, 0),
        );
      };
      const sealMaterial = new THREE.MeshBasicMaterial({
        color: "#c7e1e9",
        transparent: true,
        opacity: 0.35,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const seal = (position: Vec3, width: number, yaw: number) => {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, 6, 0.05), sealMaterial);
        mesh.position.y = 3;
        const group = place(new THREE.Group().add(mesh), position, yaw);
        const collider = wallAt(position, yaw, [width / 2, 3, 0.25], [0, 3, 0]);
        return () => {
          group.removeFromParent();
          world.removeCollider(collider, false);
        };
      };
      const seals = new Map<string, () => void>();
      if (!progress.cathedralFelled)
        seals.set(
          "cathedral",
          seal(
            capitalBosses.cathedral.entry,
            capitalBosses.cathedral.entryWidth,
            capitalBosses.cathedral.yaw,
          ),
        );
      if (!progress.finalFelled)
        seals.set(
          "colosseum",
          seal(
            capitalBosses.colosseum.entry,
            capitalBosses.colosseum.entryWidth,
            capitalBosses.colosseum.yaw,
          ),
        );
      if (!progress.fogCleared)
        seals.set(
          "beacon",
          seal(capitalBeaconSeal.position, capitalBeaconSeal.width, capitalBeaconSeal.yaw),
        );
      if (!progress.caches.includes("town-key"))
        seals.set(
          "town",
          seal(capitalTownGate.position, capitalTownGate.width, capitalTownGate.yaw),
        );

      const gates = new Map<string, () => void>();
      for (const { id, gate } of [
        { id: "refuge" as const, gate: capitalShortcut },
        { id: "court" as const, gate: capitalCathedralShortcut },
        { id: "garden" as const, gate: capitalGardenGate },
      ]) {
        if (progress[id]) continue;
        const group = new THREE.Group();
        if (id === "court") {
          group.add(
            piece("arch-panel", [gate.width, 5, 0.28], kit.iron),
            piece("block", [0.08, 4.6, 0.12], kit.floor, [0, 2.3, 0.2]),
            ...[-0.65, 0.65].map((x) =>
              piece("ring", [0.45, 0.08, 0.45], kit.iron, [x, 2.2, 0.23], [Math.PI / 2, 0, 0]),
            ),
          );
        } else {
          const bars = Math.ceil(gate.width / 0.9);
          for (let i = 0; i < bars; i++) {
            const x = -gate.width / 2 + 0.3 + (i * (gate.width - 0.6)) / (bars - 1);
            group.add(piece("block", [0.16, 5, 0.22], kit.iron, [x, 2.5, 0]));
          }
          group.add(piece("block", [gate.width, 0.22, 0.3], kit.floor, [0, 4.5, 0]));
        }
        place(group, gate.position, gate.yaw);
        const collider = wallAt(gate.position, gate.yaw, [gate.width / 2, 2.5, 0.22], [0, 2.5, 0]);
        gates.set(id, () => {
          group.removeFromParent();
          world.removeCollider(collider, false);
        });
      }

      const lever = piece(
        "block",
        [0.12, 1.3, 0.12],
        kit.floor,
        [0, 1.25, 0],
        [0, 0, progress.fogCleared ? -0.7 : 0.7],
      );
      const lamp = piece(
        "block",
        [0.45, 0.45, 0.45],
        progress.fogCleared ? kit.marker : kit.glow,
        [0, 1.7, 0],
        [Math.PI / 4, 0, Math.PI / 4],
      );
      const beacon = new THREE.Group().add(piece("crate", [1.4, 1, 1.4], kit.wall), lever, lamp);
      place(beacon, capitalBeacon.position, 0);
      for (const n of capitalNpcs) {
        place(
          new THREE.Group().add(
            piece("crate", [0.6, 1.5, 0.6], n.id === "sage" ? kit.wall : kit.floor),
            piece("crate", [0.42, 0.42, 0.42], kit.floor, [0, 1.5, 0]),
            piece("post", [0.2, 1.8, 0.2], kit.iron, [0.4, 0, 0]),
          ),
          n.position,
          0,
        );
        addBox(world, [0.3, 0.9, 0.3], [n.position[0], n.position[1] + 0.9, n.position[2]]);
      }
      const caches = new Map<string, THREE.Object3D>();
      for (const c of capitalCaches) {
        if (progress.caches.includes(c.id)) continue;
        caches.set(
          c.id,
          piece(
            "block",
            [0.36, 0.36, 0.36],
            kit.glow,
            [c.position[0], c.position[1] + 0.65, c.position[2]],
            [Math.PI / 4, 0, Math.PI / 4],
          ),
        );
      }
      for (const cache of caches.values()) scene.add(cache);
      for (const s of capitalShrines) {
        const light = new THREE.PointLight("#4cd5ea", 12, 12);
        light.position.set(s.position[0], s.position[1] + 2, s.position[2]);
        scene.add(light);
      }
      const lanterns = [0, 1].map(() => {
        const light = new THREE.PointLight("#ffb36e", 18, 14);
        scene.add(light);
        return light;
      });

      // Lifts ride on kinematic bodies the character motor follows.
      const liftStates = newCapitalLiftStates();
      const lifts = capitalLifts.map((spec) => {
        const state = liftStates[spec.id];
        const body = world.createRigidBody(
          RAPIER.RigidBodyDesc.kinematicPositionBased()
            .setTranslation(spec.center[0], state.y - 0.3, spec.center[2])
            .setRotation({ x: 0, y: Math.sin(spec.yaw / 2), z: 0, w: Math.cos(spec.yaw / 2) }),
        );
        const group = new THREE.Group();
        capitalLiftGeometry.forEach(({ size, position }, index) => {
          world.createCollider(
            RAPIER.ColliderDesc.cuboid(size[0] / 2, size[1] / 2, size[2] / 2)
              .setTranslation(...position)
              .setFriction(1),
            body,
          );
          group.add(piece("block", size, index === 0 ? kit.floor : kit.wall, position));
        });
        group.add(piece("post", [1.2, 0.9, 1.2], kit.floor, [0, 0.3, 0]));
        group.rotation.y = spec.yaw;
        scene.add(group);
        return { spec, state, body, group };
      });

      const portals: LevelPortal[] = [];
      const openExit = () => {
        portals.push({
          id: "forest",
          x: CAPITAL_EXIT[0],
          y: CAPITAL_EXIT[1],
          z: CAPITAL_EXIT[2],
          prompt: "Jump through to return to the forest",
        });
        const painting = createPortalPainting("/assets/tree.jpg");
        painting.scale.setScalar(1.2);
        place(painting, [CAPITAL_EXIT[0], CAPITAL_EXIT[1] + 2, CAPITAL_EXIT[2]], -Math.PI / 2);
      };
      if (progress.finalFelled) openExit();

      const encounter = createParishEncounter(progress, capitalWorld);
      encounter.embers = embers;
      const save = createParishAutosave();
      syncParishEntities(runtimeWorld, encounter);
      const enemies = createParishEnemyViews(
        scene,
        world,
        encounter,
        () => gameStore.getSnapshot().settings.reducedMotion,
      );
      let deathTime = 0;
      let closeMap: (() => void) | null = null;
      const lastPlayer = { x: 0, y: 0, z: 0 };
      const toggleMap = () => {
        if (closeMap) {
          closeMap();
          closeMap = null;
        } else if (!gameStore.getSnapshot().paused && encounter.combat.health > 0)
          closeMap = openCapitalMap(host, progress, { ...lastPlayer }, toggleMap);
      };
      window.addEventListener(
        "keydown",
        (event) => {
          if (event.code === "KeyM" && !event.repeat) toggleMap();
          else if (event.code === "Escape" && closeMap) toggleMap();
        },
        { signal },
      );
      let pendingTeleport: Vec3 | null = null;
      let boss: { id: string; view: ReturnType<typeof createAshWarden> } | null = null;
      let cathedralFelled = progress.cathedralFelled;
      let finalFelled = progress.finalFelled;
      let lastEnemyHit = encounter.enemyHitId;
      const hud = mountCapitalHud(host, () => drinkEmber(encounter));
      let interactPress = heldControls().interactPress;
      let settleTime = progress.fogCleared ? 1 : 0;
      const checkpointSpawn = () =>
        (capitalShrines.find((s) => s.id === progress.checkpoint) ?? capitalShrines[0]).spawn;
      const showDialogue = (text: string) => {
        encounter.dialogue = text;
        encounter.dialogueTime = 6;
      };
      const interact = (interaction: CapitalInteraction) => {
        switch (interaction.kind) {
          case "shrine":
            if (restAtParishShrine(encounter)) {
              progress.checkpoint = interaction.id;
              playSound("bossHit", { intensity: 0.2 });
              showDialogue("Rested at the ember. Flasks refilled.");
            }
            break;
          case "cache":
            if (claimCapitalCache(encounter, progress, interaction.id)) {
              caches.get(interaction.id)?.removeFromParent();
              if (interaction.id === "town-key") seals.get("town")?.();
              playSound("bossHit", { intensity: 0.2 });
            }
            break;
          case "lift":
            requestCapitalLift(interaction.id, encounter.combat.playerY, progress, liftStates);
            break;
          case "switch":
            if (activateCapitalBeacon(progress)) {
              seals.get("beacon")?.();
              lever.rotation.z = -0.7;
              lamp.material = kit.marker;
              playSound("bossHit", { intensity: 0.5 });
              playSound("rumble", { intensity: 1 });
            }
            break;
          case "talk": {
            const npc = capitalNpcs.find((n) => n.id === interaction.id);
            if (npc) {
              encounter.dialogue = `${npc.name}: ${npc.dialogue}`;
              encounter.dialogueTime = 18;
            }
            break;
          }
          case "gate":
            progress[interaction.id] = true;
            gates.get(interaction.id)?.();
            break;
          case "boss": {
            const spawn = beginCapitalBoss(encounter, interaction.id, progress);
            if (spawn) pendingTeleport = spawn;
            break;
          }
        }
      };
      let ps2 = gameStore.getSnapshot().settings.ps2Style;
      environment.setPs2(ps2);
      return {
        sun,
        portals,
        beforeStep: (step) => {
          for (const lift of lifts) {
            stepCapitalLift(lift.state, step);
            lift.body.setNextKinematicTranslation({
              x: lift.spec.center[0],
              y: lift.state.y - 0.3,
              z: lift.spec.center[2],
            });
          }
        },
        combat: encounter.combat,
        lockTargets: () => {
          const targets = enemies.targets();
          const c = encounter.combat;
          if (c.bossActive && c.bossHealth > 0)
            targets.push({ id: "boss", x: c.bossX, y: c.bossY, z: c.bossZ, height: 2.6 });
          return targets;
        },
        respawn: () => checkpointSpawn(),
        update: ({ player, time, delta, teleport, setTitle }) => {
          const c = encounter.combat;
          Object.assign(lastPlayer, { x: player.x, y: player.y, z: player.z });
          setTitle(
            capitalAreas.find((a) => a.id === capitalAreaAt(player.x, player.z, player.y))?.name ??
              "The Sacred Capital",
          );
          const input = heldControls();
          // The sealed lower city, and the cloud below it, are deaths: resume at the ember.
          if ((!progress.fogCleared && player.y < -1) || player.y < -40) {
            c.health = 0;
            playSound("hurt");
          }
          if (import.meta.env.DEV)
            (window as typeof window & { __parish?: unknown }).__parish = {
              state: encounter,
              progress,
              teleport: (to: Vec3) => (pendingTeleport = to),
              interact,
              attack: pressPlayerAttack,
              player: { x: player.x, y: player.y, z: player.z },
              capitalInteraction: () =>
                capitalInteraction(player.x, player.y, player.z, progress, false, c.bossActive),
            };
          if (pendingTeleport) {
            teleport(pendingTeleport);
            pendingTeleport = null;
          }
          stepParishSystems(runtimeWorld, encounter, delta, progress);
          const activeBoss = encounter.activeBoss;
          if (boss && boss.id !== activeBoss) {
            boss.view.dispose();
            boss = null;
          }
          if (activeBoss && !boss)
            boss = {
              id: activeBoss,
              view: createAshWarden(
                scene,
                world,
                c,
                activeBoss === "cathedral" ? "asylum" : "ember",
              ),
            };
          boss?.view.update(camera, time, delta);
          hud.boss(
            activeBoss && c.bossActive
              ? {
                  name: capitalBosses[activeBoss].name,
                  health: c.bossHealth,
                  max: capitalBosses[activeBoss].health,
                }
              : null,
          );
          if (progress.cathedralFelled && !cathedralFelled) {
            cathedralFelled = true;
            seals.get("cathedral")?.();
            showDialogue("The keeper of the apse falls. The crown beacon can be lit.");
          }
          if (progress.finalFelled && !finalFelled) {
            finalFelled = true;
            seals.get("colosseum")?.();
            openExit();
            encounter.dialogue =
              "Warden felled. The capital is free of its last keeper. A way home opens in the colosseum.";
            encounter.dialogueTime = 10;
          }
          if (encounter.enemyHitId > lastEnemyHit) playSound("bossHit", { intensity: 0.6 });
          lastEnemyHit = encounter.enemyHitId;
          enemies.update(camera, time, delta);
          if (c.health <= 0) {
            // Death: the words fade in, then the run resumes at the last ember.
            if (deathTime === 0) hud.died(true);
            deathTime += delta;
            if (deathTime < 4.6) return "";
            deathTime = 0;
            hud.died(false);
            destroyParishEntities(runtimeWorld, encounter);
            resetParishEncounter(encounter, progress);
            syncParishEntities(runtimeWorld, encounter);
            teleport(checkpointSpawn());
          }
          const interaction = capitalInteraction(
            player.x,
            player.y,
            player.z,
            progress,
            parishThreatened(encounter),
            c.bossActive,
          );
          if (interactPress !== input.interactPress) {
            interactPress = input.interactPress;
            if (interaction?.available) interact(interaction);
          }
          if (encounter.dialogueTime > 0 && (encounter.dialogueTime -= delta) <= 0)
            encounter.dialogue = "";
          if (settleTime < 1 && progress.fogCleared) {
            settleTime = Math.min(1, settleTime + delta / GROUND_SETTLE);
            environment.ground.visible = true;
            environment.ground.position.y = -GROUND_DROP * (1 - (1 - (1 - settleTime) ** 3));
            environment.fogReveal.value = settleTime;
          }
          save(progress, encounter.embers);
          hud.update(encounter);
          for (const lift of lifts) lift.group.position.copy(lift.body.translation());
          const next = gameStore.getSnapshot().settings.ps2Style;
          if (next !== ps2) environment.setPs2((ps2 = next));
          const nearest = [...capitalLanterns].sort(
            (a, b) =>
              Math.hypot(a[0] - player.x, a[1] - player.y, a[2] - player.z) -
              Math.hypot(b[0] - player.x, b[1] - player.y, b[2] - player.z),
          );
          lanterns.forEach(
            (light, i) =>
              nearest[i] && light.position.set(nearest[i][0], nearest[i][1] + 2.2, nearest[i][2]),
          );
          const label = keyLabel(gameStore.getSnapshot().settings.bindings.interact);
          return interaction?.prompt.replace(/^E ·/, `${label} ·`) ?? "";
        },
        dispose: () => {
          writeParishSave(progress, encounter.embers);
          enemies.dispose();
          destroyParishEntities(runtimeWorld, encounter);
          hud.dispose();
          boss?.view.dispose();
          closeMap?.();
          if (import.meta.env.DEV)
            delete (window as typeof window & { __parish?: unknown }).__parish;
          for (const geometry of geometries) geometry.dispose();
          environment.dispose();
        },
      };
    },
  });
}
