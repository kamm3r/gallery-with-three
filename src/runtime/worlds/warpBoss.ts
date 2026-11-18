import * as THREE from "three";
import { createPlatformerLink } from "../../gameplay/platformerLink";
import { setResultScreenActive } from "../../gameplay/resultScreen";
import { playSound } from "../../gameplay/sound";
import { BOSS, bossLift, createBoss, stepBoss, type BossEvent } from "../../gameplay/warpBoss";
import { recordBoss } from "../../gameplay/warpProgress";
import { button, element } from "../../ui/dom";
import type { RouteState } from "../router";
import { addCylinder, createSun, mountLevel } from "../level";
import { createAkuMask } from "./warpProps";

const SKIN = "#8a5a3c";
const HIDE = "#6b4128";
type V3 = [number, number, number];
const TAUNTS: Partial<Record<BossEvent["type"], string>> = {
  dazed: "He's dazed! Jump on his head!",
  maskLost: "The mask took the hit",
};

function part(
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  position: V3 = [0, 0, 0],
  rotation: V3 = [0, 0, 0],
  scale?: V3,
  shadow = false,
) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(...position);
  mesh.rotation.set(...rotation);
  if (scale) mesh.scale.set(...scale);
  mesh.castShadow = shadow;
  return mesh;
}

function buildArena(scene: THREE.Scene) {
  scene.background = new THREE.Color("#3a1d2a");
  scene.fog = new THREE.Fog("#4a2230", 30, 90);
  scene.add(new THREE.HemisphereLight("#ffc9a8", "#2a1418", 1.3));
  const floor = part(
    new THREE.CylinderGeometry(BOSS.arenaRadius + 2, BOSS.arenaRadius + 1, 2, 64),
    new THREE.MeshStandardMaterial({ color: "#6e5a4c", roughness: 0.95 }),
    [0, -1, 0],
  );
  floor.receiveShadow = true;
  scene.add(floor);
  const ringMaterial = new THREE.MeshStandardMaterial({ color: "#54443a", roughness: 1 });
  for (const r of [3, 7, 11])
    scene.add(
      part(
        new THREE.RingGeometry(r - 0.12, r + 0.12, 64),
        ringMaterial,
        [0, 0.01, 0],
        [-Math.PI / 2, 0, 0],
      ),
    );
  scene.add(
    part(
      new THREE.RingGeometry(BOSS.arenaRadius + 1.5, 90, 64),
      new THREE.MeshStandardMaterial({
        color: "#ff5a1a",
        emissive: "#ff3a0a",
        emissiveIntensity: 1.6,
        roughness: 0.5,
      }),
      [0, -1.6, 0],
      [-Math.PI / 2, 0, 0],
    ),
  );
  const spike = new THREE.MeshStandardMaterial({
    color: "#3a302c",
    roughness: 0.8,
    flatShading: true,
  });
  for (let i = 0; i < 48; i++) {
    const angle = (i / 48) * Math.PI * 2;
    const h = 1.4 + ((i * 7) % 5) * 0.25;
    scene.add(
      part(
        new THREE.ConeGeometry(0.35, h, 6),
        spike,
        [
          Math.sin(angle) * (BOSS.arenaRadius + 1.6),
          h / 2,
          Math.cos(angle) * (BOSS.arenaRadius + 1.6),
        ],
        undefined,
        undefined,
        true,
      ),
    );
  }
  const pole = new THREE.MeshStandardMaterial({ color: "#3b2a20" });
  const fire = new THREE.MeshBasicMaterial({
    color: new THREE.Color(3, 1.3, 0.3),
    toneMapped: false,
  });
  const flames: THREE.Mesh[] = [];
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2 + Math.PI / 8;
    const torch = new THREE.Group();
    torch.position.set(
      Math.sin(angle) * (BOSS.arenaRadius + 1.2),
      0,
      Math.cos(angle) * (BOSS.arenaRadius + 1.2),
    );
    const flame = part(new THREE.ConeGeometry(0.28, 0.8, 8), fire, [0, 3, 0]);
    flames.push(flame);
    torch.add(
      part(
        new THREE.CylinderGeometry(0.12, 0.18, 2.8, 8),
        pole,
        [0, 1.4, 0],
        undefined,
        undefined,
        true,
      ),
      flame,
    );
    if (i % 2 === 0) {
      const light = new THREE.PointLight("#ff8a3a", 16, 12, 2);
      light.position.y = 3.2;
      torch.add(light);
    }
    scene.add(torch);
  }
  return (t: number) =>
    flames.forEach((flame, i) =>
      flame.scale.setScalar(1 + Math.sin(t * 11 + i * 2.1) * 0.15 + Math.sin(t * 17 + i) * 0.08),
    );
}

function buildTusk() {
  const skinMaterials: THREE.MeshStandardMaterial[] = [];
  const skin = (color = SKIN) => {
    const material = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.75,
      emissive: "#ff2a1a",
      emissiveIntensity: 0,
    });
    skinMaterials.push(material);
    return material;
  };
  const tusk = new THREE.MeshStandardMaterial({ color: "#f3ead2", roughness: 0.4 });
  const dark = new THREE.MeshStandardMaterial({ color: "#2a1a12" });
  const body = new THREE.Group();
  body.add(
    part(
      new THREE.SphereGeometry(0.95, 20, 16),
      skin(),
      [0, 1.15, 0],
      undefined,
      [1.15, 1, 1.05],
      true,
    ),
    part(
      new THREE.SphereGeometry(0.95, 16, 12),
      skin(HIDE),
      [0, 1.45, -0.1],
      undefined,
      [0.9, 0.7, 0.9],
      true,
    ),
  );
  const head = new THREE.Group();
  head.position.set(0, 1.55, 0.85);
  head.add(
    part(new THREE.SphereGeometry(0.55, 18, 14), skin(), undefined, undefined, undefined, true),
    part(
      new THREE.CylinderGeometry(0.28, 0.32, 0.35, 16),
      skin("#b07a5a"),
      [0, -0.12, 0.45],
      [Math.PI / 2, 0, 0],
      undefined,
      true,
    ),
  );
  const eye = new THREE.MeshStandardMaterial({
    color: "#ffe65a",
    emissive: "#ff9a1a",
    emissiveIntensity: 0.8,
  });
  for (const side of [-1, 1])
    head.add(
      part(new THREE.SphereGeometry(0.06, 8, 6), dark, [side * 0.1, -0.12, 0.63]),
      part(
        new THREE.ConeGeometry(0.08, 0.55, 8),
        tusk,
        [side * 0.3, -0.2, 0.45],
        [0.4, 0, side * -0.5],
        undefined,
        true,
      ),
      part(
        new THREE.ConeGeometry(0.16, 0.4, 6),
        skin(HIDE),
        [side * 0.42, 0.42, -0.05],
        [0, 0, side * -0.6],
        undefined,
        true,
      ),
      part(new THREE.SphereGeometry(0.08, 10, 8), eye, [side * 0.2, 0.14, 0.45]),
      part(
        new THREE.BoxGeometry(0.24, 0.05, 0.06),
        dark,
        [side * 0.2, 0.26, 0.46],
        [0, 0, side * 0.45],
      ),
    );
  for (let i = 0; i < 4; i++)
    head.add(
      part(
        new THREE.ConeGeometry(0.1, 0.4, 5),
        dark,
        [0, 0.5 - i * 0.05, -0.1 - i * 0.22],
        [-0.4, 0, 0],
      ),
    );
  const stars = new THREE.Group();
  stars.position.y = 0.75;
  stars.visible = false;
  const starMaterial = new THREE.MeshBasicMaterial({
    color: new THREE.Color(3, 2.6, 0.6),
    toneMapped: false,
  });
  for (let i = 0; i < 5; i++)
    stars.add(
      part(new THREE.OctahedronGeometry(0.12, 0), starMaterial, [
        Math.cos((i / 5) * Math.PI * 2) * 0.6,
        0,
        Math.sin((i / 5) * Math.PI * 2) * 0.6,
      ]),
    );
  head.add(stars);
  body.add(head);
  for (const side of [-1, 1])
    body.add(
      part(
        new THREE.CapsuleGeometry(0.24, 0.8, 4, 10),
        skin(),
        [side * 1.1, 1.1, 0.25],
        [0.5, 0, side * 0.5],
        undefined,
        true,
      ),
      part(
        new THREE.SphereGeometry(0.3, 12, 10),
        skin(HIDE),
        [side * 1.35, 0.62, 0.55],
        undefined,
        undefined,
        true,
      ),
      part(
        new THREE.CylinderGeometry(0.24, 0.3, 0.5, 10),
        skin(HIDE),
        [side * 0.5, 0.25, 0],
        undefined,
        undefined,
        true,
      ),
    );
  body.add(
    part(
      new THREE.TorusGeometry(1.02, 0.08, 6, 24),
      new THREE.MeshStandardMaterial({ color: "#2f2a28", metalness: 0.7, roughness: 0.4 }),
      [0, 0.85, 0],
      [Math.PI / 2, 0, 0],
    ),
  );
  return { body, stars, skinMaterials };
}

export function mountWarpBoss(
  host: HTMLElement,
  navigate: (path: string, state: RouteState) => void,
  retry: () => void,
  signal: AbortSignal,
) {
  document.title = "Tiny Tusk | The Warp Room";
  const fight = createBoss();
  const link = createPlatformerLink();
  let outcome: "won" | "lost" | null = null;
  let resultIn = 0;

  const overlay = element("section", "warp-hud");
  overlay.setAttribute("aria-label", "Boss fight");
  const counters = element("div", "warp-counters");
  const health = element("div", "warp-boss-health");
  health.setAttribute("role", "meter");
  health.setAttribute("aria-label", "Tiny Tusk health");
  health.setAttribute("aria-valuemin", "0");
  health.setAttribute("aria-valuemax", String(BOSS.maxHealth));
  const pips = element("p");
  health.append(element("h2", "", "Tiny Tusk"), pips);
  const message = element("p", "warp-message is-visible", "Tiny Tusk wants his crystals back!");
  message.setAttribute("role", "status");
  overlay.append(
    counters,
    health,
    message,
    element(
      "p",
      "warp-help",
      "Watch his shadow and get clear. Hop the shockwave. Stomp his head while he's dazed.",
    ),
  );
  host.append(overlay);
  let messageTime = 3;
  let shown = "";
  const drawHud = () => {
    const key = `${fight.health}:${fight.masks}`;
    if (key === shown) return;
    shown = key;
    health.setAttribute("aria-valuenow", String(fight.health));
    pips.replaceChildren(
      ...Array.from({ length: BOSS.maxHealth }, (_, i) =>
        element("span", i < fight.health ? "is-full" : ""),
      ),
    );
    counters.replaceChildren();
    if (fight.masks > 0) {
      const mask = element("span", "warp-mask-icon");
      mask.setAttribute("role", "img");
      mask.setAttribute("aria-label", `${fight.masks} mask`);
      counters.append(mask);
    }
  };
  drawHud();
  const toWarpRoom = () => navigate("/warp", { bossBeaten: outcome === "won" });
  const showResult = () => {
    setResultScreenActive(true);
    document.exitPointerLock?.();
    health.hidden = true;
    const actions = element("div", "combat-result-actions");
    if (outcome === "lost") actions.append(button("Try again", retry));
    actions.append(button("Back to the Warp Room", toWarpRoom));
    const dialog = element(
      "div",
      `combat-result ${outcome === "won" ? "is-victory" : "is-death"}`,
      element("h2", "", outcome === "won" ? "Tiny Tusk is down!" : "Flattened"),
      actions,
    );
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-label", "Boss result");
    overlay.append(dialog);
    actions.querySelector("button")?.focus();
  };

  return mountLevel(host, signal, {
    chapter: "Boss",
    title: "Tiny Tusk",
    mood: "ash",
    spawn: { position: [0, 0, 8], yaw: Math.PI },
    boundary: BOSS.arenaRadius,
    cameraDistance: 8,
    onEnter: () => {},
    build: ({ scene, world, camera }) => {
      const animateArena = buildArena(scene);
      addCylinder(world, 1, BOSS.arenaRadius + 2, [0, -1, 0]);
      const sun = createSun("#ffd1a0", 2.2, 18);
      sun.position.set(-10, 24, 12);
      const tusk = buildTusk();
      scene.add(tusk.body);
      const shadow = part(
        new THREE.CircleGeometry(1, 32),
        new THREE.MeshBasicMaterial({
          color: "#000000",
          transparent: true,
          opacity: 0.4,
          depthWrite: false,
        }),
        undefined,
        [-Math.PI / 2, 0, 0],
      );
      const warningMaterial = new THREE.MeshBasicMaterial({
        color: new THREE.Color(3, 0.4, 0.2),
        transparent: true,
        opacity: 0.5,
        depthWrite: false,
        toneMapped: false,
      });
      const warning = part(new THREE.RingGeometry(0.9, 1, 48), warningMaterial, undefined, [
        -Math.PI / 2,
        0,
        0,
      ]);
      warning.visible = false;
      const rings = new THREE.InstancedMesh(
        new THREE.TorusGeometry(1, 0.035, 6, 72),
        new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 1.6, 0.6), toneMapped: false }),
        8,
      );
      rings.frustumCulled = false;
      rings.count = 0;
      const mask = createAkuMask();
      scene.add(shadow, warning, rings, mask.group);
      const ringScratch = new THREE.Object3D();
      const follow = new THREE.Vector3();
      let flash = 0;
      return {
        sun,
        platformer: link,
        portals: [],
        update: ({ time: t, delta }) => {
          const dt = Math.min(delta, 0.05);
          animateArena(t);
          const events = stepBoss(
            fight,
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
              case "leap":
                playSound("bossWindup");
                break;
              case "slam":
                playSound("bossImpact");
                break;
              case "pound":
                playSound("boom");
                break;
              case "dazed":
                playSound("roar");
                break;
              case "hit":
                flash = 1;
                playSound("bossHit");
                break;
              case "bounce":
                link.bounce = event.speed;
                playSound("boing");
                break;
              case "defeated":
                playSound("bossDeath");
                recordBoss();
                outcome = "won";
                resultIn = 2.8;
                break;
              case "maskLost":
                playSound("hurt");
                break;
              case "dead":
                link.frozen = true;
                playSound("whoa");
                outcome = "lost";
                resultIn = 1.4;
                break;
            }
            const text = TAUNTS[event.type];
            if (text) {
              message.textContent = text;
              message.classList.add("is-visible");
              messageTime = 2;
            }
          }
          if (events.length) drawHud();
          if (messageTime > 0 && (messageTime -= delta) <= 0)
            message.classList.remove("is-visible");
          if (resultIn > 0 && (resultIn -= delta) <= 0) showResult();

          const g = tusk.body;
          g.position.set(fight.x, bossLift(fight), fight.z);
          if (fight.mode !== "dazed" && fight.mode !== "defeated")
            g.rotation.y = THREE.MathUtils.damp(
              g.rotation.y,
              Math.atan2(link.x - fight.x, link.z - fight.z),
              6,
              dt,
            );
          const progress = fight.duration > 0 ? 1 - fight.timer / fight.duration : 1;
          let squashY = 1;
          let tilt = 0;
          if (fight.mode === "leap") squashY = 1 + Math.sin(progress * Math.PI) * 0.15;
          else if (fight.mode === "land") {
            const rear = BOSS.poundDelay / BOSS.landRest;
            tilt =
              progress < rear
                ? -(progress / rear) * 0.45
                : -0.45 * Math.max(0, 1 - (progress - rear) * 6);
            squashY = progress < 0.12 ? 0.8 : 1;
          } else if (fight.mode === "dazed") {
            squashY = BOSS.dazedHeadHeight / BOSS.headHeight;
            tilt = 0.25 + Math.sin(t * 3) * 0.08;
          } else if (fight.mode === "defeated")
            tilt = THREE.MathUtils.damp(g.rotation.x, 1.45, 3, dt);
          else if (fight.mode === "intro") squashY = 1 + Math.sin(t * 8) * 0.04;
          g.rotation.x =
            fight.mode === "defeated" ? tilt : THREE.MathUtils.damp(g.rotation.x, tilt, 14, dt);
          g.scale.set(1 / Math.sqrt(squashY), squashY, 1 / Math.sqrt(squashY));
          flash = Math.max(0, flash - dt * 3);
          for (const material of tusk.skinMaterials) material.emissiveIntensity = flash * 2;
          tusk.stars.visible = fight.mode === "dazed";
          tusk.stars.rotation.y = t * 4;

          const leaping = fight.mode === "leap";
          shadow.position.set(leaping ? fight.toX : fight.x, 0.03, leaping ? fight.toZ : fight.z);
          shadow.scale.setScalar((leaping ? 0.4 + progress * 0.6 : 0.9) * BOSS.crushRadius);
          warning.visible = leaping;
          warning.position.set(fight.toX, 0.04, fight.toZ);
          warning.scale.setScalar(BOSS.crushRadius);
          warningMaterial.opacity = 0.35 + Math.sin(t * 20) * 0.2;
          fight.rings.forEach((ring, i) => {
            ringScratch.position.set(ring.x, 0.2, ring.z);
            ringScratch.rotation.set(-Math.PI / 2, 0, 0);
            ringScratch.scale.set(ring.radius, ring.radius, 1);
            ringScratch.updateMatrix();
            rings.setMatrixAt(i, ringScratch.matrix);
          });
          rings.count = fight.rings.length;
          rings.instanceMatrix.needsUpdate = true;
          follow.set(link.x, link.y, link.z);
          mask.update(t, delta, follow, camera, fight.masks);
          return "";
        },
        dispose: () => {
          setResultScreenActive(false);
          overlay.remove();
        },
      };
    },
  });
}
