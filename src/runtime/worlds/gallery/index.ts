import * as THREE from "three";
import {
  GALLERY_SEQUENCE,
  GALLERY_SIGILS,
  advanceGallerySequence,
  roomAt,
  type DoorKey,
  type GallerySigil,
  type RoomId,
} from "../../../gameplay/galleryLayout";
import { playSound, setFootstepSurface, setZone, type SoundZone } from "../../../gameplay/sound";
import type { RouteState } from "../../router";
import {
  addCylinder,
  createPortalPainting,
  mountLevel,
  type LevelPortal,
  type Vec3,
} from "../../level";
import { createStars } from "../warpProps";
import { createGalleryArchitecture, createInscription, setInscription } from "./architecture";
import {
  SIGIL_COLORS,
  createGalleryWings,
  createPressureButton,
  createSigilGem,
  stepGalleryMovers,
  type ButtonFeedback,
  type GalleryContext,
} from "./wings";

const DEV_SPAWN =
  import.meta.env.DEV && typeof window !== "undefined"
    ? new URLSearchParams(window.location.search).get("spawn")?.split(",").map(Number)
    : undefined;
const START: Vec3 = DEV_SPAWN ? [DEV_SPAWN[0], 0, DEV_SPAWN[1]] : [0, 0, 23];
const START_YAW = DEV_SPAWN?.[2] === undefined ? Math.PI : (DEV_SPAWN[2] * Math.PI) / 180;
const PORTAL: Vec3 = [0, 2.2, -62.3];
const ROTUNDA: [number, number] = [0, -12];
const RING: GallerySigil[] = ["moon", "star", "ember", "sun", "leaf"];
const ROOM_ZONES: Partial<Record<RoomId, SoundZone>> = {
  archive: "archive",
  study: "archive",
  westHall: "archive",
  mirrors: "mirrors",
  eastHall: "mirrors",
  conservatory: "mirrors",
  garden: "garden",
  gardenPassage: "garden",
  crypt: "crypt",
  cryptPassage: "crypt",
  ossuary: "crypt",
  starStair: "observatory",
  observatory: "observatory",
  vault: "vault",
  vaultHall: "vault",
};

export function mountGallery(
  host: HTMLElement,
  state: RouteState | null,
  navigate: (path: string, state: RouteState) => void,
  signal: AbortSignal,
) {
  document.title = "The collection | The painted forest";
  const found: GallerySigil[] = [];
  let progress = 0;
  let respawn: Vec3 = START;
  let notice = "";
  let noticeTime = 0;
  const showNotice = (message: string) => {
    notice = message;
    noticeTime = 3.6;
  };
  setFootstepSurface("stone");

  return mountLevel(host, signal, {
    chapter: "Beyond the frame",
    title: "The collection",
    mood: "museum",
    spawn: { position: START, yaw: START_YAW },
    killY: -20,
    cameraDistance: 4.2,
    onEnter: () => navigate("/", { returnPortal: state?.fromPortal }),
    build: ({ scene, world, camera }) => {
      scene.background = new THREE.Color("#0e1420");
      scene.fog = new THREE.Fog("#0e1420", 34, 95);
      scene.add(new THREE.HemisphereLight("#b9c6de", "#2a2622", 0.55), createStars(140, 40, 2500));
      const architecture = createGalleryArchitecture(scene, world);
      const ctx: GalleryContext = {
        scene,
        world,
        animate: [],
        triggers: [],
        movers: [],
        textures: new THREE.TextureLoader(),
      };
      const portals: LevelPortal[] = [];
      let statueGlow: (() => void) | null = null;
      let plaque: THREE.Mesh;
      const plaqueText = () =>
        progress === GALLERY_SEQUENCE.length
          ? "The journey is complete.\nThe vault stands open."
          : found.length < GALLERY_SIGILS.length
            ? `The hall of sigils\nThe plates wait for their sigils.\nRecovered: ${found.length} / ${GALLERY_SIGILS.length}`
            : `The hall of sigils\nWalk the keeper's journey.\nSteps taken: ${progress} / ${GALLERY_SEQUENCE.length}`;
      const plateGems = new Map<GallerySigil, { setLit: (n: number) => void }>();
      const plateButtons = new Map<GallerySigil, { setLit: (n: number) => void }>();
      const openKey = (key: DoorKey) => architecture.open(key);
      let lightVault: (lit: boolean) => void = () => {};

      const find = (sigil: GallerySigil) => {
        if (found.includes(sigil)) return;
        found.push(sigil);
        playSound("sigil", { intensity: found.length / GALLERY_SIGILS.length });
        plateGems.get(sigil)?.setLit(1);
        plateButtons.get(sigil)?.setLit(1);
        setInscription(plaque, plaqueText(), 4.6);
        showNotice(
          found.length === GALLERY_SIGILS.length
            ? "All five sigils recovered. Return to the hall of sigils."
            : `The ${sigil} sigil recovered (${found.length} / ${GALLERY_SIGILS.length})`,
        );
      };
      const press = (sigil: GallerySigil): ButtonFeedback => {
        if (found.length < GALLERY_SIGILS.length) {
          playSound("deny");
          showNotice(
            `The plates stay cold. ${found.length} / ${GALLERY_SIGILS.length} sigils recovered.`,
          );
          return "neutral";
        }
        const before = progress;
        if (before >= GALLERY_SEQUENCE.length) return "neutral";
        progress = advanceGallerySequence(before, sigil, found);
        if (progress !== before) {
          setInscription(plaque, plaqueText(), 4.6);
          statueGlow?.();
        }
        if (progress === GALLERY_SEQUENCE.length) {
          openKey("vault");
          lightVault(true);
          openPortal();
          playSound("solve");
          playSound("rumble");
          showNotice("The vault door grinds open.");
          return "good";
        }
        if (progress > before) {
          playSound("correct", { intensity: progress / GALLERY_SEQUENCE.length });
          return "good";
        }
        playSound("wrong");
        showNotice("A wrong step. The journey starts again.");
        return "bad";
      };
      let conservatoryOpen = false;
      const openConservatory = () => {
        if (conservatoryOpen) return;
        conservatoryOpen = true;
        openKey("conservatory");
        playSound("secret");
        playSound("rumble");
        showNotice("Somewhere in the moon chamber, stone slides against stone.");
      };

      lightVault = createGalleryWings(ctx, found, false, find, openConservatory);

      // Keeper statue.
      const statue = new THREE.Group();
      statue.position.set(ROTUNDA[0], 0, ROTUNDA[1]);
      scene.add(statue);
      addCylinder(world, 0.6, 1.4, [ROTUNDA[0], 0.6, ROTUNDA[1]]);
      addCylinder(world, 1.6, 0.55, [ROTUNDA[0], 2.8, ROTUNDA[1]]);
      const marble = new THREE.MeshStandardMaterial({ color: "#d8d0bd", roughness: 0.45 });
      const piece = (geometry: THREE.BufferGeometry, material: THREE.Material, y: number) => {
        const m = new THREE.Mesh(geometry, material);
        m.position.y = y;
        m.castShadow = true;
        statue.add(m);
        return m;
      };
      piece(
        new THREE.CylinderGeometry(1.4, 1.6, 1.2, 24),
        new THREE.MeshStandardMaterial({ color: "#8f866f", roughness: 0.6 }),
        0.6,
      );
      piece(new THREE.ConeGeometry(0.75, 2.6, 16), marble, 2.5);
      piece(new THREE.SphereGeometry(0.38, 20, 14), marble, 4.05);
      const haloMaterial = new THREE.MeshBasicMaterial({ toneMapped: false });
      const halo = piece(new THREE.TorusGeometry(0.8, 0.05, 8, 40), haloMaterial, 4.6);
      halo.rotation.x = Math.PI / 2.4;
      const beads = GALLERY_SEQUENCE.map((_, i) => {
        const angle = (i / GALLERY_SEQUENCE.length) * Math.PI * 2;
        const material = new THREE.MeshBasicMaterial({ toneMapped: false });
        const bead = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 8), material);
        bead.position.set(Math.sin(angle) * 1.25, 5.3, Math.cos(angle) * 1.25);
        statue.add(bead);
        return material;
      });
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(6.1, 6.45, 72),
        new THREE.MeshStandardMaterial({ color: "#c9a45c", metalness: 0.6, roughness: 0.35 }),
      );
      ring.position.y = 0.015;
      ring.rotation.x = -Math.PI / 2;
      statue.add(ring);
      statueGlow = () => {
        haloMaterial.color
          .set("#ffd68a")
          .multiplyScalar(1 + (progress / GALLERY_SEQUENCE.length) * 3);
        beads.forEach((material, i) =>
          material.color.copy(
            i < progress ? new THREE.Color(3, 2.4, 1.2) : new THREE.Color("#3a3a44"),
          ),
        );
      };
      statueGlow();
      ctx.animate.push((t, delta) => {
        halo.rotation.z += delta * (0.3 + progress * 0.25);
        halo.position.y = 4.6 + Math.sin(t) * 0.08;
      });

      // Sigil plates around the statue.
      RING.forEach((sigil, i) => {
        const angle = ((i * 72 + 36) * Math.PI) / 180;
        const plate = new THREE.Group();
        plate.position.set(ROTUNDA[0] + Math.sin(angle) * 5, 0, ROTUNDA[1] + Math.cos(angle) * 5);
        scene.add(plate);
        plateButtons.set(
          sigil,
          createPressureButton(ctx, plate, SIGIL_COLORS[sigil], () => press(sigil), { lit: 0 }),
        );
        const gem = createSigilGem(ctx, sigil, 0, 0.8);
        const holder = new THREE.Group();
        holder.position.y = 1.8;
        holder.add(gem.mesh);
        plate.add(holder);
        plateGems.set(sigil, gem);
        const label = new THREE.Group();
        label.rotation.y = angle + Math.PI;
        label.add(createInscription(sigil, [0, 0.6, -1.45], undefined, 1.1));
        plate.add(label);
      });
      plaque = createInscription(plaqueText(), [-5.5, 3.8, -20.6], undefined, 4.6);
      scene.add(
        plaque,
        createInscription(
          "The vault\nSix steps, as the verses tell.\nA wrong step undoes them all.",
          [5.5, 3.8, -20.6],
          undefined,
          4.6,
        ),
      );

      // Checkpoints.
      const checkpoint = (center: Vec3, half: Vec3, to: Vec3) =>
        ctx.triggers.push({
          center: new THREE.Vector3(...center),
          half: new THREE.Vector3(...half),
          inside: false,
          enabled: true,
          enter: () => (respawn = to),
        });
      checkpoint([12, 1, 18], [2.5, 1, 2.5], [12, 0, 18]);
      checkpoint([-12, 1, 18], [2.5, 1, 2.5], [-12, 0, 18]);
      checkpoint([0, 1, 18], [8.5, 1, 8.5], START);

      // Exit painting: opens once the journey is complete.
      const exit = createPortalPainting("/assets/tree.jpg");
      exit.position.set(...PORTAL);
      scene.add(exit);
      const openPortal = () =>
        portals.push({
          id: "forest",
          x: PORTAL[0],
          y: 0,
          z: PORTAL[2],
          prompt: "Jump through to return",
        });

      let elapsed = 0;
      let zone: SoundZone | null = null;
      let falling = false;
      let audioTime = 0;
      const probe = new THREE.Vector3();
      return {
        sun: architecture.sun,
        portals,
        respawn: () => respawn,
        beforeStep: (step) => stepGalleryMovers(ctx.movers, (elapsed += step)),
        update: ({ time, delta, player }) => {
          for (const m of ctx.movers) {
            m.mesh.position.copy(m.body.translation());
            m.mesh.quaternion.copy(m.body.rotation());
          }
          for (const animate of ctx.animate) animate(time, delta);
          // Player touch triggers: capsule center against each box, padded by the capsule.
          probe.set(player.x, player.y + 0.92, player.z);
          for (const t of ctx.triggers) {
            if (!t.enabled) continue;
            const inside =
              Math.abs(probe.x - t.center.x) < t.half.x + 0.42 &&
              Math.abs(probe.y - t.center.y) < t.half.y + 0.92 &&
              Math.abs(probe.z - t.center.z) < t.half.z + 0.42;
            if (inside && !t.inside) t.enter();
            else if (!inside && t.inside) t.exit?.();
            t.inside = inside;
          }
          architecture.update(camera, delta);
          audioTime += delta;
          if (audioTime >= 0.25) {
            audioTime = 0;
            if (player.y < -3 && !falling) {
              falling = true;
              playSound("fall");
            } else if (player.y > 0) falling = false;
            const room = roomAt(player.x, player.z);
            const next = (room && ROOM_ZONES[room.id]) ?? "halls";
            if (next !== zone) setZone((zone = next));
          }
          if (noticeTime > 0 && (noticeTime -= delta) <= 0) notice = "";
          if (notice) return notice;
          if (
            progress === GALLERY_SEQUENCE.length &&
            Math.hypot(player.x - PORTAL[0], player.z - PORTAL[2]) >= 5
          )
            return "The painting is open";
          return "";
        },
        dispose: () => {
          setFootstepSurface("grass");
          setZone(null);
        },
      };
    },
  });
}
