import RAPIER from "@dimforge/rapier3d-compat";
import * as THREE from "three";
import { createPlatformerLink } from "../../gameplay/platformerLink";
import { setResultScreenActive } from "../../gameplay/resultScreen";
import { playSound } from "../../gameplay/sound";
import { CRATE_SIZE, enemyPosition, type Vec3, type WarpLevel } from "../../gameplay/warpLevels";
import { recordLevel } from "../../gameplay/warpProgress";
import { createRun, stepRun, type RunEvent } from "../../gameplay/warpRun";
import { button, element } from "../../ui/dom";
import type { RouteState } from "../router";
import { addBox, createPortalPainting, createSun, mountLevel } from "../level";
import {
  createAkuMask,
  createCrate,
  createCritter,
  createDebris,
  createFruitField,
  createPowerCrystal,
  makeBurst,
} from "./warpProps";
import { createLevelDressing, createLevelGround } from "./warpScenery";

const WOOD = "#c98a45";
const MOODS = {
  jungle: "meadow",
  snow: "still",
  sewer: "museum",
  canyon: "meadow",
  ruins: "grove",
} as const;
const MESSAGES: Partial<Record<RunEvent["type"], string>> = {
  checkpoint: "Checkpoint!",
  crystal: "Power crystal!",
  gem: "Every crate smashed. Gem!",
  mask: "Aku Aku mask!",
  maskLost: "The mask took the hit",
};

function icon(className: string, label?: string) {
  const node = element("span", className);
  if (label) {
    node.setAttribute("role", "img");
    node.setAttribute("aria-label", label);
  } else node.setAttribute("aria-hidden", "true");
  return node;
}

export function mountWarpLevel(
  host: HTMLElement,
  level: WarpLevel,
  navigate: (path: string, state: RouteState) => void,
  signal: AbortSignal,
) {
  document.title = `${level.name} | The Warp Room`;
  const run = createRun(level);
  const link = createPlatformerLink();
  let finished = false;
  let leaving = false;

  // HUD.
  const overlay = element("section", "warp-hud");
  overlay.setAttribute("aria-label", "Level status");
  const fruitCount = element("p", "warp-fruit");
  const crateCount = element("p", "warp-crates");
  const slots = element("p", "warp-slots");
  const message = element("p", "warp-message");
  message.setAttribute("role", "status");
  const help = element("p", "warp-help");
  help.append(
    element("kbd", "", "Click"),
    "/",
    element("kbd", "", "J"),
    "/",
    element("kbd", "", "E"),
    " spin · jump on crates and critters",
  );
  overlay.append(element("div", "warp-counters", fruitCount, crateCount, slots), message, help);
  host.append(overlay);
  let messageTime = 0;
  const drawHud = () => {
    fruitCount.replaceChildren(icon("warp-fruit-icon"), String(run.fruit));
    fruitCount.setAttribute("aria-label", `${run.fruit} fruit`);
    crateCount.replaceChildren(icon("warp-crate-icon"), `${run.cratesBroken}/${run.crateTotal}`);
    crateCount.setAttribute("aria-label", `${run.cratesBroken} of ${run.crateTotal} crates`);
    slots.replaceChildren(
      icon(
        `warp-crystal-icon${run.crystal ? " is-owned" : ""}`,
        run.crystal ? "Crystal found" : "Crystal not found yet",
      ),
      icon(
        `warp-gem-icon${run.gem ? " is-owned" : ""}`,
        run.gem ? "Gem earned" : "Gem not earned yet",
      ),
    );
    if (run.masks > 0) {
      const mask = icon("warp-mask-icon", `${run.masks} masks`);
      mask.textContent = run.masks > 1 ? "×2" : "";
      slots.append(mask);
    }
  };
  drawHud();
  const back = () => {
    if (leaving) return;
    leaving = true;
    setResultScreenActive(false);
    navigate("/warp", {
      returnPortal: level.id,
      cleared: { level: level.id, crystal: run.crystal, gem: run.gem },
    });
  };
  const finish = () => {
    if (finished) return;
    finished = true;
    recordLevel(level.id, { crystal: run.crystal, gem: run.gem });
    setResultScreenActive(true);
    const tally = element(
      "ul",
      "warp-tally",
      element(
        "li",
        run.crystal ? "is-done" : "is-missing",
        run.crystal ? "Power crystal collected" : "Power crystal missed",
      ),
      element(
        "li",
        run.gem ? "is-done" : "is-missing",
        `Crates ${run.cratesBroken}/${run.crateTotal}${run.gem ? " · gem earned" : ""}`,
      ),
      element("li", "", `${run.fruit} fruit`),
    );
    const resume = button("Back to the Warp Room", back);
    const dialog = element(
      "div",
      "combat-result is-victory warp-result",
      element("h2", "", `${level.name} complete`),
      tally,
      element("div", "combat-result-actions", resume),
    );
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-label", "Level complete");
    overlay.append(dialog);
    document.exitPointerLock?.();
    resume.focus();
  };

  return mountLevel(host, signal, {
    chapter: "The Warp Room",
    title: level.name,
    mood: MOODS[level.theme.deco],
    spawn: { position: level.spawn, yaw: Math.PI },
    killY: level.killY - 30,
    cameraDistance: 7,
    onEnter: () => finish(),
    build: ({ scene, world, camera }) => {
      const { theme } = level;
      scene.background = new THREE.Color(theme.sky);
      scene.fog = new THREE.Fog(theme.sky, theme.fog[0], theme.fog[1]);
      scene.add(new THREE.HemisphereLight(theme.hemi[0], theme.hemi[1], 1.5));
      const sun = createSun(theme.light, theme.sun, 28);
      sun.position.set(-14, 30, 14);
      for (const solid of level.solids) {
        const bottom = solid.bottom ?? -16;
        const height = solid.top - bottom;
        addBox(
          world,
          [solid.w / 2, height / 2, solid.d / 2],
          [solid.x, bottom + height / 2, solid.z],
        );
      }
      scene.add(createLevelGround(level));
      const animateDressing = createLevelDressing(level, scene);

      // Moving platforms.
      const moverMaterial = new THREE.MeshStandardMaterial({
        color: theme.deco === "snow" ? "#bfe3f5" : theme.trim,
        roughness: 0.6,
      });
      const movers = level.movers.map((mover) => {
        const origin = new THREE.Vector3(mover.x, mover.top - 0.2, mover.z);
        const body = world.createRigidBody(
          RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(
            origin.x,
            origin.y,
            origin.z,
          ),
        );
        world.createCollider(
          RAPIER.ColliderDesc.cuboid(mover.w / 2, 0.2, mover.d / 2).setFriction(1),
          body,
        );
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(mover.w, 0.4, mover.d), moverMaterial);
        mesh.castShadow = mesh.receiveShadow = true;
        mesh.position.copy(origin);
        scene.add(mesh);
        return { mover, origin, body, mesh };
      });
      let simTime = 0;

      // Crates.
      const crates = level.crates.map((crate) => {
        const view = createCrate(crate.kind);
        const group = new THREE.Group();
        group.position.set(crate.x, crate.y, crate.z);
        group.add(view.mesh);
        scene.add(group);
        const collider = addBox(
          world,
          [CRATE_SIZE / 2, CRATE_SIZE / 2, CRATE_SIZE / 2],
          [crate.x, crate.y + CRATE_SIZE / 2, crate.z],
        );
        return { view, group, collider, gone: false };
      });
      const debris = createDebris();
      const fruit = createFruitField(level.fruit);
      const crystal = createPowerCrystal();
      crystal.group.position.set(...level.crystal);
      crystal.anchor();
      const mask = createAkuMask();
      scene.add(debris.group, fruit.mesh, crystal.group, mask.group);

      // Critters.
      const critters = level.enemies.map((enemy) => {
        const group = new THREE.Group();
        group.position.set(enemy.x, enemy.y, enemy.z);
        group.add(createCritter(enemy.kind, theme.enemy, enemy.spiky));
        scene.add(group);
        return group;
      });
      const deadAt = level.enemies.map(() => -1);

      // Boulder.
      let boulder: THREE.Group | null = null;
      if (level.boulder) {
        boulder = new THREE.Group();
        boulder.position.set(0, level.boulder.radius, level.boulder.startZ);
        const rock = new THREE.Mesh(
          new THREE.IcosahedronGeometry(level.boulder.radius, 1),
          new THREE.MeshStandardMaterial({ color: "#8a6a4f", roughness: 1, flatShading: true }),
        );
        rock.castShadow = true;
        const band = new THREE.Mesh(
          new THREE.TorusGeometry(level.boulder.radius * 0.98, 0.12, 6, 18),
          new THREE.MeshStandardMaterial({ color: "#6b4f38", roughness: 1, flatShading: true }),
        );
        band.rotation.z = Math.PI / 2;
        boulder.add(rock, band);
        scene.add(boulder);
      }
      let rumble = 0;

      // Exit painting.
      const exit = createPortalPainting("/assets/pocket_monsters.jpg", "#4a5a9a");
      exit.position.set(level.exit[0], level.exit[1] + 2.17, level.exit[2]);
      scene.add(exit);
      addBox(world, [1.15, 1.45, 0.1], [level.exit[0], level.exit[1] + 2.17, level.exit[2] - 0.2]);

      let pendingTeleport: Vec3 | null = null;
      const follow = new THREE.Vector3();
      return {
        sun,
        platformer: link,
        portals: [
          {
            id: "exit",
            x: level.exit[0],
            y: level.exit[1],
            z: level.exit[2],
            prompt: "Jump through to finish the level",
          },
        ],
        beforeStep: (step) => {
          simTime += step;
          for (const { mover, origin, body } of movers) {
            const offset = Math.sin(simTime * mover.speed + (mover.phase ?? 0)) * mover.distance;
            body.setNextKinematicTranslation({
              x: origin.x + (mover.axis === "x" ? offset : 0),
              y: origin.y + (mover.axis === "y" ? offset : 0),
              z: origin.z + (mover.axis === "z" ? offset : 0),
            });
          }
        },
        update: ({ time, delta, teleport, player }) => {
          if (pendingTeleport) {
            teleport(pendingTeleport);
            pendingTeleport = null;
          }
          for (const { body, mesh } of movers) mesh.position.copy(body.translation());
          const dt = Math.min(delta, 0.05);
          const events = finished
            ? []
            : stepRun(
                run,
                {
                  x: link.x,
                  y: link.y,
                  z: link.z,
                  vy: link.vy,
                  grounded: link.grounded,
                  spinning: link.spinTime > 0,
                },
                dt,
              );
          for (const event of events) {
            switch (event.type) {
              case "crate": {
                const crate = level.crates[event.index];
                debris.add(
                  makeBurst(
                    [crate.x, crate.y + CRATE_SIZE / 2, crate.z],
                    crate.kind === "nitro" ? "#39c94a" : WOOD,
                  ),
                );
                playSound("crate");
                break;
              }
              case "bounce": {
                link.bounce = event.speed;
                const kind = event.index >= 0 ? level.crates[event.index].kind : "";
                if (kind === "spring" || kind === "bounce" || event.index < 0) playSound("boing");
                break;
              }
              case "fuse":
                playSound("fuse");
                break;
              case "explode":
                debris.add(makeBurst([event.x, event.y, event.z], "#3a2a1a", true));
                playSound("boom");
                break;
              case "fruit":
                playSound("fruit", { intensity: (event.total % 10) / 9 });
                break;
              case "mask":
                playSound("mask");
                break;
              case "maskLost":
                playSound("hurt");
                break;
              case "checkpoint":
                playSound("checkpoint");
                break;
              case "enemy":
                deadAt[event.index] = time;
                playSound(event.stomped ? "boing" : "slash");
                break;
              case "crystal":
                playSound("crystal");
                break;
              case "gem":
                playSound("gem");
                break;
              case "death":
                link.frozen = true;
                playSound(event.cause === "fall" ? "fall" : "whoa");
                if (event.cause === "explosion" || event.cause === "boulder") playSound("hurt");
                break;
              case "respawn":
                pendingTeleport = event.position;
                link.frozen = false;
                link.spinTime = 0;
                deadAt.forEach((_, i) => {
                  if (!run.enemyDead[i]) deadAt[i] = -1;
                });
                break;
              case "boulder":
                playSound(event.state === "rolling" ? "rumble" : "bossImpact");
                break;
            }
          }
          if (events.length) {
            drawHud();
            const said = events.map((event) => MESSAGES[event.type]).find(Boolean);
            const rolling = events.find((event) => event.type === "boulder");
            const text =
              said ??
              (rolling?.type === "boulder" && rolling.state === "rolling" ? "RUN!" : undefined);
            if (text) {
              message.textContent = text;
              message.classList.add("is-visible");
              messageTime = 1.8;
            }
          }
          if (messageTime > 0 && (messageTime -= delta) <= 0)
            message.classList.remove("is-visible");

          crates.forEach((crate, i) => {
            const state = run.crates[i];
            if (state.broken && !crate.gone) {
              crate.gone = true;
              crate.group.removeFromParent();
              world.removeCollider(crate.collider, false);
            }
            if (!crate.gone) crate.view.update(time, state.squash, state.fuse);
          });
          debris.update(delta);
          fruit.update(time, run.fruitTaken);
          crystal.update(time, delta, run.crystal);
          animateDressing(delta);
          follow.set(link.x, link.y, link.z);
          mask.update(time, delta, follow, camera, run.masks);

          level.enemies.forEach((enemy, i) => {
            const group = critters[i];
            const at = enemyPosition(enemy, run.time);
            if (run.enemyDead[i]) {
              const since = time - deadAt[i];
              if (deadAt[i] < 0 || since > 1.2) {
                group.visible = false;
                return;
              }
              group.position.y = enemy.y + since * 6 - since * since * 9;
              group.position.z -= dt * 5;
              group.rotation.x += dt * 14;
              return;
            }
            group.visible = true;
            const bob = Math.abs(Math.sin(run.time * enemy.speed * 4)) * 0.08;
            group.position.set(at.x, enemy.y + bob, at.z);
            const along = enemy.axis === "x" ? Math.PI / 2 : 0;
            group.rotation.set(0, along + (at.heading < 0 ? Math.PI : 0), 0);
          });
          if (boulder && level.boulder) {
            boulder.position.z = run.boulder.z;
            boulder.rotation.x = -(run.boulder.z - level.boulder.startZ) / level.boulder.radius;
            if (run.boulder.active && !run.boulder.stopped && (rumble -= dt) <= 0) {
              rumble = 0.9;
              playSound("rumble");
            }
          }
          void player;
          return "";
        },
        dispose: () => {
          setResultScreenActive(false);
          overlay.remove();
          for (const crate of crates) crate.view.dispose();
        },
      };
    },
  });
}
