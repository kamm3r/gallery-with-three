import * as THREE from "three";
import { playSound } from "../../gameplay/sound";
import { isWarpLevelId, WARP_LEVEL_IDS, WARP_LEVELS } from "../../gameplay/warpLevels";
import { bossUnlocked, readWarpProgress } from "../../gameplay/warpProgress";
import {
  BOSS_PAD,
  WARP_ROOM_PORTALS,
  WARP_ROOM_RADIUS,
  warpRoomSpawn,
} from "../../gameplay/warpRoom";
import type { RouteState } from "../router";
import { element } from "../../ui/dom";
import {
  addBox,
  addCylinder,
  createPortalPainting,
  createSun,
  mountLevel,
  type LevelPortal,
} from "../level";
import { createGem, createPowerCrystal, createStars } from "./warpProps";

function arrivalMessage(state: RouteState | null, bossOpen: boolean) {
  if (state?.bossBeaten) return "Tiny Tusk is beaten. The Warp Room is yours.";
  const cleared = state?.cleared;
  if (!cleared || !isWarpLevelId(cleared.level)) return "";
  const name = WARP_LEVELS[cleared.level].name;
  if (cleared.crystal && bossOpen)
    return `${name} cleared. All five crystals: the boss portal is open!`;
  if (cleared.crystal)
    return `${name} cleared. Crystal secured${cleared.gem ? ", and the gem!" : "."}`;
  return `${name} finished, but the crystal is still in there.`;
}

const basic = (color: THREE.ColorRepresentation, extra: THREE.MeshBasicMaterialParameters = {}) =>
  new THREE.MeshBasicMaterial({ color, toneMapped: false, ...extra });

export function mountWarpRoom(
  host: HTMLElement,
  state: RouteState | null,
  navigate: (path: string, state: RouteState) => void,
  signal: AbortSignal,
) {
  const progress = readWarpProgress();
  const open = bossUnlocked(progress);
  const spawn = warpRoomSpawn(state?.returnPortal);
  document.title = "The Warp Room | The painted forest";

  const overlay = element("section", "warp-hud");
  overlay.setAttribute("aria-label", "Warp Room progress");
  const counters = element("div", "warp-counters");
  for (const [kind, count] of [
    ["crystal", progress.crystals.length],
    ["gem", progress.gems.length],
  ] as const) {
    const icon = element("span", `warp-${kind}-icon is-owned`);
    icon.setAttribute("aria-hidden", "true");
    const line = element("p", "", icon, `${count}/5`);
    line.setAttribute("aria-label", `${count} of 5 ${kind}s`);
    counters.append(line);
  }
  const card = element("div", "warp-level-card");
  card.setAttribute("role", "status");
  const help = element(
    "p",
    "warp-help",
    `Find the power crystal in each level. With all five, the center pad opens. ${WARP_LEVEL_IDS.length - progress.crystals.length} to go.`,
  );
  const message = element("p", "warp-message");
  message.setAttribute("role", "status");
  overlay.append(counters, card, help, message);
  host.append(overlay);
  let shownCard: string | null | undefined;
  const intro = arrivalMessage(state, open);
  let messageTime = intro ? 5.2 : 0;
  if (intro) {
    message.textContent = intro;
    message.classList.add("is-visible");
    if (state?.cleared?.crystal) playSound(open ? "solve" : "sigil");
  }

  return mountLevel(host, signal, {
    chapter: "Warp",
    title: "The Warp Room",
    mood: "still",
    spawn,
    boundary: WARP_ROOM_RADIUS - 0.8,
    cameraDistance: 7,
    onEnter: (id) => {
      const destination = id === "forest" ? "/" : id === "boss" ? "/warp/boss" : `/warp/${id}`;
      navigate(destination, id === "forest" ? { returnPortal: "island" } : { fromPortal: id });
    },
    build: ({ scene, world }) => {
      scene.background = new THREE.Color("#0d0b1f");
      scene.fog = new THREE.Fog("#140f2e", 40, 120);
      scene.add(createStars());
      scene.add(new THREE.HemisphereLight("#b9b0ff", "#1d1830", 1.4));
      const sun = createSun("#e6dcff", 1.8, 22);
      sun.position.set(-12, 26, 14);
      const animated: ((time: number, delta: number) => void)[] = [];

      // Halos.
      const halos = new THREE.Group();
      halos.position.y = 16;
      [22, 27, 33].forEach((radius, i) => {
        halos.add(
          new THREE.Mesh(
            new THREE.TorusGeometry(radius, 0.18 + i * 0.05, 8, 128),
            basic(["#8a6bff", "#4fb6ff", "#ff7ad9"][i]),
          ),
        );
      });
      animated.push((t) =>
        halos.children.forEach((child, i) =>
          child.rotation.set(0.5 + i * 0.3, t * (0.1 + i * 0.05) * (i % 2 ? -1 : 1), 0.2 * i),
        ),
      );
      scene.add(halos);

      // Islands.
      const rock = new THREE.MeshStandardMaterial({
        color: "#5b5070",
        roughness: 1,
        flatShading: true,
      });
      const turf = new THREE.MeshStandardMaterial({
        color: "#4f8a5a",
        roughness: 1,
        flatShading: true,
      });
      const islands = Array.from({ length: 14 }, (_, i) => {
        const angle = (i / 14) * Math.PI * 2 + 0.3;
        const distance = 45 + ((i * 37) % 30);
        const island = new THREE.Group();
        const baseY = -8 + ((i * 13) % 18);
        island.position.set(Math.sin(angle) * distance, baseY, Math.cos(angle) * distance);
        island.scale.setScalar(2 + ((i * 7) % 5));
        const cone = new THREE.Mesh(new THREE.ConeGeometry(1, 1.8, 7), rock);
        cone.rotation.set(Math.PI, i, 0);
        const top = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.3, 7), turf);
        top.position.y = -0.85;
        island.add(cone, top);
        scene.add(island);
        return { island, baseY };
      });
      animated.push((t) =>
        islands.forEach(
          ({ island, baseY }, i) => (island.position.y = baseY + Math.sin(t * 0.4 + i) * 0.8),
        ),
      );

      // Floor.
      addCylinder(world, 1, WARP_ROOM_RADIUS, [0, -1, 0]);
      addCylinder(world, BOSS_PAD.top / 2, BOSS_PAD.radius, [0, BOSS_PAD.top / 2, 0]);
      const floor = new THREE.Mesh(
        new THREE.CylinderGeometry(WARP_ROOM_RADIUS, WARP_ROOM_RADIUS - 1.5, 2, 72),
        new THREE.MeshStandardMaterial({ color: "#353a5c", metalness: 0.35, roughness: 0.55 }),
      );
      floor.position.y = -1;
      floor.receiveShadow = true;
      const underside = new THREE.Mesh(
        new THREE.ConeGeometry(WARP_ROOM_RADIUS - 1.5, 9, 72),
        new THREE.MeshStandardMaterial({ color: "#231f3a", roughness: 0.9 }),
      );
      underside.position.y = -6;
      underside.rotation.x = Math.PI;
      scene.add(floor, underside);

      // Floor rings.
      const rings = new THREE.Group();
      rings.position.y = 0.012;
      rings.rotation.x = -Math.PI / 2;
      const pulse = basic("#7fb6ff");
      for (const radius of [4.2, 8.5, 15.8])
        rings.add(
          new THREE.Mesh(
            new THREE.RingGeometry(radius - 0.08, radius + 0.08, 96),
            radius === 8.5 ? pulse : basic("#7fb6ff"),
          ),
        );
      const spoke = basic("#3d4f86");
      for (let i = 0; i < 12; i++) {
        const line = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 31.6), spoke);
        line.rotation.z = (i * Math.PI) / 6;
        line.position.z = 0.001;
        rings.add(line);
      }
      animated.push((t) => pulse.color.setScalar(0.6 + Math.sin(t * 1.4) * 0.25));
      scene.add(rings);

      // Boss pad.
      const pad = new THREE.Mesh(
        new THREE.CylinderGeometry(BOSS_PAD.radius, BOSS_PAD.radius + 0.2, BOSS_PAD.top, 40),
        new THREE.MeshStandardMaterial({
          color: open ? "#4b3d7a" : "#2f3140",
          metalness: 0.6,
          roughness: 0.35,
        }),
      );
      pad.position.y = BOSS_PAD.top / 2;
      pad.castShadow = pad.receiveShadow = true;
      scene.add(pad);
      const socket = new THREE.MeshStandardMaterial({
        color: "#3c4260",
        metalness: 0.5,
        roughness: 0.4,
      });
      for (const level of Object.values(WARP_LEVELS)) {
        const angle = (level.index / 5) * Math.PI * 2;
        const x = Math.sin(angle) * (BOSS_PAD.radius + 1.1);
        const z = Math.cos(angle) * (BOSS_PAD.radius + 1.1);
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.42, 0.7, 10), socket);
        post.position.set(x, 0.35, z);
        post.castShadow = true;
        const crystal = createPowerCrystal(0.55, !progress.crystals.includes(level.id));
        crystal.group.position.set(x, 1.25, z);
        crystal.anchor();
        animated.push((t, d) => crystal.update(t, d));
        scene.add(post, crystal.group);
      }
      const portals: LevelPortal[] = [];
      if (open) {
        const painting = createPortalPainting("/assets/tree.jpg", "#6a4fb0");
        painting.position.y = BOSS_PAD.top + 0.04;
        painting.rotation.x = -Math.PI / 2;
        painting.scale.setScalar(0.9);
        const beamMaterial = basic(new THREE.Color(1.6, 0.9, 2.6), {
          transparent: true,
          opacity: 0.2,
          side: THREE.DoubleSide,
          depthWrite: false,
        });
        const beam = new THREE.Mesh(
          new THREE.CylinderGeometry(1.6, 2.4, 28, 32, 1, true),
          beamMaterial,
        );
        beam.position.y = 14;
        const light = new THREE.PointLight("#b48aff", 30, 14, 2);
        light.position.y = 3;
        scene.add(painting, beam, light);
        animated.push((t) => {
          const s = 1 + Math.sin(t * 3) * 0.05;
          beam.scale.set(s, 1, s);
          beamMaterial.opacity = 0.08 + Math.sin(t * 2) * 0.03;
        });
        portals.push({
          id: "boss",
          x: 0,
          y: BOSS_PAD.top,
          z: 0,
          prompt: "Jump onto the pad to face Tiny Tusk",
          near: 3,
        });
      } else {
        const lid = new THREE.Mesh(
          new THREE.CircleGeometry(BOSS_PAD.radius - 0.4, 40),
          new THREE.MeshStandardMaterial({ color: "#1b1d2a", metalness: 0.8, roughness: 0.3 }),
        );
        lid.position.y = BOSS_PAD.top + 0.02;
        lid.rotation.x = -Math.PI / 2;
        scene.add(lid);
      }

      // Rim portals.
      const dais = new THREE.MeshStandardMaterial({
        color: "#474d78",
        metalness: 0.5,
        roughness: 0.4,
      });
      const stud = basic(new THREE.Color(1.6, 1.3, 0.5));
      for (const portal of WARP_ROOM_PORTALS) {
        const level = portal.id === "forest" ? null : WARP_LEVELS[portal.id];
        const group = new THREE.Group();
        group.position.set(...portal.position);
        group.rotation.y = portal.yaw;
        const base = new THREE.Mesh(new THREE.BoxGeometry(6.4, 0.2, 2.6), dais);
        base.position.set(0, 0.1, -0.2);
        base.receiveShadow = true;
        const painting = createPortalPainting(
          level ? level.image : "/assets/tree.jpg",
          level ? "#4a5a9a" : "#b08a3c",
        );
        painting.position.y = 2.17;
        group.add(base, painting);
        if (level) {
          const crystal = createPowerCrystal(0.5, !progress.crystals.includes(level.id));
          crystal.group.position.set(-0.6, 5.1, 0.2);
          crystal.anchor();
          const gem = createGem(progress.gems.includes(level.id));
          gem.mesh.position.set(0.6, 5.0, 0.2);
          animated.push((t, d) => {
            crystal.update(t, d);
            gem.update(t);
          });
          group.add(crystal.group, gem.mesh);
          for (let i = 0; i <= level.index; i++) {
            const dot = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), stud);
            dot.position.set((i - level.index / 2) * 0.45, 0.24, 0.9);
            group.add(dot);
          }
        }
        scene.add(group);
        // Solid backing so the camera never ends up behind a painting.
        group.updateMatrixWorld();
        const back = new THREE.Vector3(0, 2.17, -0.18).applyMatrix4(group.matrixWorld);
        addBox(world, [2.62, 2.07, 0.17], back.toArray(), new THREE.Euler(0, portal.yaw, 0));
        portals.push({
          id: portal.id,
          x: portal.position[0],
          y: 0,
          z: portal.position[2],
          prompt: level ? `Jump into ${level.name}` : "Jump through to return to the forest",
        });
      }

      return {
        sun,
        portals,
        update: ({ time, delta, player }) => {
          for (const animate of animated) animate(time, delta);
          if (messageTime > 0 && (messageTime -= delta) <= 0)
            message.classList.remove("is-visible");
          const near = portals.find(
            (p) => Math.hypot(player.x - p.x, player.z - p.z) < (p.near ?? 5),
          );
          const id = near?.id ?? null;
          if (id === shownCard) return;
          shownCard = id;
          const level = id && isWarpLevelId(id) ? WARP_LEVELS[id] : null;
          card.hidden = !level;
          help.hidden = id !== null || open;
          if (level) {
            card.replaceChildren();
            const title = element(
              "h2",
              "",
              element("small", "", `Level ${level.index + 1}`),
              level.name,
            );
            const rewards = element("p", "warp-level-rewards");
            for (const [label, done] of [
              ["Crystal", progress.crystals.includes(level.id)],
              ["Gem", progress.gems.includes(level.id)],
            ] as const)
              rewards.append(element("span", done ? "is-done" : "", label));
            card.append(title, element("p", "", level.blurb), rewards);
          }
        },
        dispose: () => overlay.remove(),
      };
    },
  });
}
