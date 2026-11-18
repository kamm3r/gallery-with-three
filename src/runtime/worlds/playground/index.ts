import RAPIER from "@dimforge/rapier3d-compat";
import * as THREE from "three";
import { Sky } from "three/addons/objects/Sky.js";
import { newParishProgress } from "../../../gameplay/ashenParish";
import { nearestZone, parkZones, type Tuple3 } from "../../../gameplay/collisionCourse";
import {
  ARENA_ROSTERS,
  arenaWorld,
  arenaZoneIndex,
  type ArenaRoster,
} from "../../../gameplay/combatArena";
import { combatTuning } from "../../../gameplay/combatTuning";
import {
  destroyParishEntities,
  stepParishSystems,
  syncParishEntities,
} from "../../../gameplay/ecs/parishSystems";
import { runtimeWorld } from "../../../gameplay/ecs/world";
import { gothicResidents, type Resident } from "../../../gameplay/gothicResidents";
import { createParishEncounter, resetParishEncounter } from "../../../gameplay/parishEncounter";
import { playSound } from "../../../gameplay/sound";
import { createWayfarer } from "../../../gameplay/wayfarer";
import { element } from "../../../ui/dom";
import { mountVitalBar } from "../../../ui/vitalBar";
import { mountZoneMap } from "../../../ui/zoneMap";
import { gameStore } from "../../gameStore";
import type { RouteState } from "../../router";
import { createPortalPainting, createSun, mountLevel, type Vec3 } from "../../level";
import { createParishEnemyViews } from "../parishEnemies";
import { createCourse } from "./course";
import { createTreeShowcase } from "./trees";
import { zoneLabel } from "./course";

const PORTAL_Z = 30;
const DEATH_RESPAWN = 3.2;

export function mountPlayground(
  host: HTMLElement,
  state: RouteState | null,
  navigate: (path: string, state: RouteState) => void,
  signal: AbortSignal,
) {
  document.title = "The proving grounds | The painted forest";
  const progress = newParishProgress();
  let roster: ArenaRoster = "mixed";
  const encounter = createParishEncounter(progress, arenaWorld(roster));
  encounter.combat.fatalFalls = false;
  let zone = 0;
  let pendingTeleport: Tuple3 | null = null;
  let mapOpen = false;

  // Arena HUD.
  const arenaHud = element("section", "combat-hud arena-hud");
  arenaHud.setAttribute("aria-label", "Combat status");
  const bars = element("div");
  arenaHud.append(element("div", "player-vitals", bars));
  const health = mountVitalBar(bars, {
    label: "Health",
    value: 100,
    max: combatTuning.playerMaxHealth,
  });
  const stamina = mountVitalBar(bars, { label: "Stamina", value: 100, max: 100, stamina: true });
  const foes = element("p", "arena-foes");
  arenaHud.append(foes);
  host.append(arenaHud);

  let views: ReturnType<typeof createParishEnemyViews> | null = null;
  let rebuildViews: () => void = () => {};
  const resetArena = () => {
    destroyParishEntities(runtimeWorld, encounter);
    resetParishEncounter(encounter, progress);
    encounter.combat.fatalFalls = false;
    syncParishEntities(runtimeWorld, encounter);
  };
  const teleportTo = (index: number) => {
    pendingTeleport = parkZones[index].spawn;
    zone = index;
    syncMap();
  };
  const map = mountZoneMap(host, gameStore, {
    current: zone,
    open: mapOpen,
    onOpenChange: (open) => {
      mapOpen = open;
      syncMap();
    },
    onTeleport: (index) => {
      mapOpen = false;
      teleportTo(index);
    },
    roster,
    onFight: (next) => {
      roster = next;
      encounter.world = arenaWorld(next);
      resetArena();
      rebuildViews();
      mapOpen = false;
      teleportTo(arenaZoneIndex);
    },
  });
  function syncMap() {
    map.update({ ...mapProps(), current: zone, open: mapOpen, roster });
  }
  const mapProps = () => ({
    onOpenChange: (open: boolean) => {
      mapOpen = open;
      syncMap();
    },
    onTeleport: (index: number) => {
      mapOpen = false;
      teleportTo(index);
    },
    onFight: (next: ArenaRoster) => {
      roster = next;
      encounter.world = arenaWorld(next);
      resetArena();
      rebuildViews();
      mapOpen = false;
      teleportTo(arenaZoneIndex);
    },
  });
  window.addEventListener(
    "keydown",
    (event) => {
      if (
        gameStore.getSnapshot().paused ||
        event.repeat ||
        event.target instanceof HTMLInputElement
      )
        return;
      const go = (index: number) => teleportTo((index + parkZones.length) % parkZones.length);
      if (event.code === "BracketRight") go(zone + 1);
      else if (event.code === "BracketLeft") go(zone - 1);
      else if (event.code === "KeyR") teleportTo(zone);
    },
    { signal },
  );

  return mountLevel(host, signal, {
    chapter: "Movement study",
    title: "The proving grounds",
    mood: "meadow",
    spawn: { position: parkZones[0].spawn, yaw: Math.PI },
    killY: -20,
    cameraDistance: 4.8,
    onEnter: () => navigate("/", { returnPortal: state?.fromPortal }),
    build: ({ scene, world, camera }) => {
      scene.background = new THREE.Color("#b9cad3");
      scene.fog = new THREE.Fog("#b9cad3", 95, 190);
      const sky = new Sky();
      sky.scale.setScalar(450000);
      const uniforms = sky.material.uniforms;
      uniforms.turbidity.value = 5;
      uniforms.rayleigh.value = 2;
      uniforms.sunPosition.value.set(5, 7, 3);
      scene.add(sky, new THREE.HemisphereLight("#edf4f0", "#3a4650", 1.7));
      const sun = createSun("#fff0ce", 2.3, 85);
      sun.position.set(-24, 55, 30);
      sun.shadow.camera.far = 200;
      sun.shadow.camera.updateProjectionMatrix();
      const course = createCourse(scene, world);
      createTreeShowcase(scene, world, zoneLabel);

      // Wayfarers.
      const textures = new THREE.TextureLoader();
      const rigs: {
        rig: ReturnType<typeof createWayfarer>;
        resident?: Resident;
        pitch: number;
        yaw: number;
      }[] = [];
      for (const resident of [undefined, "gravedigger", "mourner", "gaoler", "apothecary"] as (
        | Resident
        | undefined
      )[]) {
        const placement = resident ? gothicResidents[resident] : undefined;
        const height = placement?.height ?? 1.72;
        const radius = placement?.radius ?? 0.25;
        const position = (placement?.position ?? [3, 0, 21]) as Vec3;
        const atlas = textures.load(
          resident
            ? "/assets/characters/wayfarer/residents-atlas.png"
            : "/assets/characters/wayfarer/wayfarer-atlas.png",
        );
        atlas.colorSpace = THREE.SRGBColorSpace;
        atlas.magFilter = atlas.minFilter = resident ? THREE.LinearFilter : THREE.NearestFilter;
        atlas.generateMipmaps = false;
        const rig = createWayfarer(atlas, resident);
        rig.root.position.set(...position);
        rig.root.rotation.y = placement?.yaw ?? 0;
        scene.add(rig.root);
        world.createCollider(
          RAPIER.ColliderDesc.capsule(height / 2 - radius, radius).setTranslation(
            position[0],
            position[1] + height / 2 + 0.02,
            position[2],
          ),
        );
        rigs.push({ rig, resident, pitch: rig.joints.head.rotation.x, yaw: placement?.yaw ?? 0 });
      }

      // Exit painting.
      const exit = createPortalPainting("/assets/plaster.jpg");
      exit.position.set(0, 2.2, PORTAL_Z);
      exit.rotation.y = Math.PI;
      scene.add(exit);

      syncParishEntities(runtimeWorld, encounter);
      rebuildViews = () => {
        views?.dispose();
        views?.removeFrom(scene);
        views = createParishEnemyViews(
          scene,
          world,
          encounter,
          () => gameStore.getSnapshot().settings.reducedMotion,
        );
      };
      rebuildViews();
      let deadTime = 0;
      let lastEnemyHit = encounter.enemyHitId;
      let zoneCheck = 0;
      let npcTime = 0;
      const feet = new THREE.Vector3();
      return {
        sun,
        combat: encounter.combat,
        lockTargets: () => views?.targets() ?? [],
        portals: [{ id: "forest", x: 0, y: 0, z: PORTAL_Z, prompt: "Jump through to return" }],
        respawn: () => parkZones[zone].spawn,
        beforeStep: (step) => course.beforeStep(step),
        update: ({ time, delta, player, teleport, launch }) => {
          const c = encounter.combat;
          if (import.meta.env.DEV)
            (window as typeof window & { __playground?: unknown }).__playground = {
              zone,
              pending: pendingTeleport,
              teleport: (to: Tuple3) => (pendingTeleport = to),
              player: player.toArray(),
              encounter,
            };
          if (pendingTeleport) {
            resetArena();
            deadTime = 0;
            teleport(pendingTeleport);
            pendingTeleport = null;
          } else if (c.health <= 0 && (deadTime += delta) > DEATH_RESPAWN)
            teleportTo(arenaZoneIndex);
          stepParishSystems(runtimeWorld, encounter, delta, progress);
          if (encounter.enemyHitId > lastEnemyHit) playSound("bossHit", { intensity: 0.6 });
          lastEnemyHit = encounter.enemyHitId;
          views?.update(camera, time, delta);
          feet.copy(player);
          course.update(feet, launch);
          const motion = gameStore.getSnapshot().settings.reducedMotion ? 0 : 1;
          npcTime += Math.min(delta, 0.05);
          for (const { rig, resident, pitch, yaw } of rigs) {
            const t = npcTime + yaw * 7;
            rig.joints.body.position.y = Math.sin(t * 1.8) * 0.004 * motion;
            rig.joints.head.rotation.y =
              Math.sin(t * 0.43) * (resident === "gaoler" ? 0.1 : 0.22) * motion;
            rig.joints.head.rotation.x = pitch + Math.sin(t * 0.71) * 0.035 * motion;
            for (const side of [-1, 1]) {
              const swing = resident === "mourner" ? 0.004 : resident ? 0.013 : 0.025;
              rig.joints[`arm${side}`].rotation.x =
                ((resident ? 0 : 0.06) + Math.sin(t * 1.8 + side) * swing) * motion;
            }
            rig.joints.scarf.rotation.x = Math.sin(t * 2.1) * 0.05 * motion;
          }
          if ((zoneCheck += delta) >= 0.25) {
            zoneCheck = 0;
            const next = nearestZone(player.x, player.z);
            if (next !== zone) {
              zone = next;
              syncMap();
            }
          }
          const inArena = zone === arenaZoneIndex && !gameStore.getSnapshot().paused;
          arenaHud.hidden = !inArena;
          if (inArena) {
            health.update({ label: "Health", value: c.health, max: combatTuning.playerMaxHealth });
            stamina.update({ label: "Stamina", value: c.stamina, max: 100, stamina: true });
            const standing = encounter.enemies.filter((e) => e.health > 0).length;
            const text = `${ARENA_ROSTERS.find((r) => r.id === roster)?.name} · ${standing}/${encounter.enemies.length} standing · R restock · M pick foes`;
            if (foes.textContent !== text) foes.textContent = text;
          }
          return "";
        },
        dispose: () => {
          course.dispose();
          views?.dispose();
          destroyParishEntities(runtimeWorld, encounter);
          map.dispose();
          health.dispose();
          stamina.dispose();
          arenaHud.remove();
          for (const { rig } of rigs) rig.dispose();
        },
      };
    },
  });
}
