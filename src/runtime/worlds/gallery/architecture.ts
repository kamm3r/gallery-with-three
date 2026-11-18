import RAPIER from "@dimforge/rapier3d-compat";
import * as THREE from "three";
import {
  CELL,
  DOOR_HEIGHT,
  DOOR_WIDTH,
  WALL_BOTTOM,
  WALL_HEIGHT,
  corniceCapBoxes,
  cornices,
  doorFrames,
  galleryDoors,
  galleryFloors,
  galleryRooms,
  lightAnchors,
  roomBounds,
  sealedDoors,
  wallCores,
  wallLinings,
  type Box,
  type DoorKey,
  type RoomId,
} from "../../../gameplay/galleryLayout";

/** Wall colliders rise past the visible cornice so no ledge can be grabbed on top. */
const COLLIDER_TOP = 15;
type V3 = [number, number, number];

/** Painted plaque with a title line and body lines. */
export function createInscription(text: string, position: V3, rotation?: V3, width = 4) {
  const lines = text.split("\n");
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = Math.max(256, 110 + lines.length * 62);
  const ctx = canvas.getContext("2d")!;
  const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, "#26333b");
  gradient.addColorStop(1, "#1a2329");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 1024, canvas.height);
  ctx.strokeStyle = "#b99a5e";
  ctx.lineWidth = 6;
  ctx.strokeRect(18, 18, 988, canvas.height - 36);
  ctx.lineWidth = 2;
  ctx.strokeRect(34, 34, 956, canvas.height - 68);
  ctx.textAlign = "center";
  lines.forEach((line, i) => {
    ctx.fillStyle = i === 0 ? "#e8c888" : "#ece1c4";
    ctx.font = i === 0 ? "italic 46px Georgia" : "36px Georgia";
    ctx.fillText(line, 512, 96 + i * 62);
  });
  const result = new THREE.CanvasTexture(canvas);
  result.colorSpace = THREE.SRGBColorSpace;
  result.anisotropy = 4;
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(width, (width * canvas.height) / canvas.width),
    new THREE.MeshBasicMaterial({ map: result, toneMapped: false }),
  );
  mesh.position.set(...position);
  if (rotation) mesh.rotation.set(...rotation);
  return mesh;
}

/** Replaces an inscription's text in place. */
export function setInscription(mesh: THREE.Mesh, text: string, width = 4) {
  const next = createInscription(text, [0, 0, 0], undefined, width);
  const old = mesh.material as THREE.MeshBasicMaterial;
  old.map?.dispose();
  old.dispose();
  mesh.geometry.dispose();
  mesh.geometry = next.geometry;
  mesh.material = next.material;
}

/** Floor plan of the public rooms. Secret rooms are, naturally, left off. */
export function createGalleryMap(position: V3, rotation?: V3, width = 4.4) {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 1024;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#e4d6b4";
  ctx.fillRect(0, 0, 1024, 1024);
  ctx.strokeStyle = "#6b5431";
  ctx.lineWidth = 8;
  ctx.strokeRect(14, 14, 996, 996);
  const scale = 52;
  const toX = (x: number) => 512 + x * scale;
  const toY = (z: number) => 560 + z * scale;
  ctx.textAlign = "center";
  ctx.font = "bold 44px Georgia";
  ctx.fillStyle = "#4a3820";
  ctx.fillText("The Keeper's Collection", 512, 72);
  for (const room of galleryRooms) {
    if (room.secret) continue;
    const [x1, x2, z1, z2] = room.rect;
    ctx.fillStyle = room.pit ? "#3b3026" : "#c9b58c";
    ctx.fillRect(toX(x1 - 0.5), toY(z1 - 0.5), (x2 - x1 + 1) * scale, (z2 - z1 + 1) * scale);
    ctx.strokeStyle = "#4a3820";
    ctx.lineWidth = 4;
    ctx.strokeRect(toX(x1 - 0.5), toY(z1 - 0.5), (x2 - x1 + 1) * scale, (z2 - z1 + 1) * scale);
  }
  for (const door of galleryDoors) {
    if (door.kind === "illusory" || door.key === "conservatory") continue;
    const x = (door.a[0] + door.b[0]) / 2;
    const z = (door.a[1] + door.b[1]) / 2;
    ctx.fillStyle = door.kind === "sealed" ? "#8a2f2a" : "#c9b58c";
    const alongX = door.a[1] !== door.b[1];
    ctx.fillRect(
      toX(x) - (alongX ? 12 : 5),
      toY(z) - (alongX ? 5 : 12),
      alongX ? 24 : 10,
      alongX ? 10 : 24,
    );
  }
  ctx.font = "italic 22px Georgia";
  for (const room of galleryRooms) {
    if (room.secret || room.id.endsWith("Passage")) continue;
    const [x1, x2, z1, z2] = room.rect;
    ctx.fillStyle = room.pit ? "#e4d6b4" : "#3a2c18";
    ctx.fillText(room.name, toX((x1 + x2) / 2), toY((z1 + z2) / 2) + 8);
  }
  ctx.fillStyle = "#a33a2a";
  ctx.beginPath();
  ctx.arc(toX(0), toY(3.6), 12, 0, Math.PI * 2);
  ctx.fill();
  ctx.font = "22px Georgia";
  ctx.fillText("you are here", toX(0), toY(3.6) + 40);
  const result = new THREE.CanvasTexture(canvas);
  result.colorSpace = THREE.SRGBColorSpace;
  result.anisotropy = 4;
  const group = new THREE.Group();
  group.position.set(...position);
  if (rotation) group.rotation.set(...rotation);
  const back = new THREE.Mesh(
    new THREE.BoxGeometry(width + 0.3, width + 0.3, 0.08),
    new THREE.MeshStandardMaterial({ color: "#3a2a18", roughness: 0.6 }),
  );
  back.position.z = -0.04;
  const face = new THREE.Mesh(
    new THREE.PlaneGeometry(width, width),
    new THREE.MeshBasicMaterial({ map: result, toneMapped: false }),
  );
  face.position.z = 0.012;
  group.add(back, face);
  return group;
}

function instancedBoxes(
  boxes: Array<Box & { color?: string }>,
  {
    color = "#ffffff",
    roughness = 0.85,
    metalness = 0,
    castShadow = false,
    receiveShadow = true,
  } = {},
) {
  const batch = new THREE.InstancedMesh(
    new THREE.BoxGeometry(),
    new THREE.MeshStandardMaterial({ roughness, metalness }),
    boxes.length,
  );
  const transform = new THREE.Object3D();
  const tint = new THREE.Color();
  boxes.forEach((box, i) => {
    transform.position.fromArray(box.position);
    transform.scale.fromArray(box.size);
    transform.updateMatrix();
    batch.setMatrixAt(i, transform.matrix);
    batch.setColorAt(i, tint.set(box.color ?? color));
  });
  batch.instanceMatrix.needsUpdate = true;
  if (batch.instanceColor) batch.instanceColor.needsUpdate = true;
  batch.computeBoundingSphere();
  batch.castShadow = castShadow;
  batch.receiveShadow = receiveShadow;
  return batch;
}

function shade(color: string, amount: number) {
  return `#${new THREE.Color(color).multiplyScalar(amount).getHexString()}`;
}

function shellGeometry() {
  const floors = galleryFloors.map(({ cell: [x, z], color }) => ({
    position: [x * CELL, -0.2, z * CELL] as Box["position"],
    size: [CELL, 0.4, CELL] as Box["size"],
    color,
  }));
  // A dark wainscot and a thin gilded rail on every lining that reaches the floor.
  const wainscots: Array<Box & { color: string }> = [];
  const rails: Box[] = [];
  for (const lining of wallLinings) {
    const [px, py, pz] = lining.position;
    const [sx, sy, sz] = lining.size;
    const bottom = py - sy / 2;
    const top = py + sy / 2;
    const thick = (s: number) => (s === 0.06 ? 0.14 : s);
    // Perpendicular runs overlap in the corners; a hair of height apart
    // keeps their top faces from sharing a plane.
    const lift = sx > sz ? 0 : 0.02;
    if (bottom <= 0 && top >= 1.4 && bottom > WALL_BOTTOM) {
      wainscots.push({
        position: [px, (1.3 + lift) / 2, pz],
        size: [thick(sx), 1.3 + lift, thick(sz)],
        color: shade(lining.color, 0.55),
      });
    }
    if (bottom <= 4.8 && top >= 5)
      rails.push({ position: [px, 4.9 + lift, pz], size: [thick(sx), 0.12, thick(sz)] });
  }
  const trims: Box[] = [];
  for (const frame of doorFrames) {
    if (frame.kind === "illusory") continue;
    const [x, , z] = frame.position;
    const at = (a: number, y: number, along: number, height: number): Box => ({
      position: frame.alongX ? [x + a, y, z] : [x, y, z + a],
      size: frame.alongX ? [along, height, 0.8] : [0.8, height, along],
    });
    // Jambs stand 4 cm proud of the opening so they never share the
    // wall's cut face.
    const side = DOOR_WIDTH / 2 + 0.14;
    trims.push(at(-side, (DOOR_HEIGHT + 0.3) / 2, 0.36, DOOR_HEIGHT + 0.3));
    trims.push(at(side, (DOOR_HEIGHT + 0.3) / 2, 0.36, DOOR_HEIGHT + 0.3));
    trims.push(at(0, DOOR_HEIGHT + 0.25, DOOR_WIDTH + 0.7, 0.45));
    trims.push(at(0, DOOR_HEIGHT + 0.62, 0.6, 0.35));
  }
  return { floors, wainscots, rails, trims };
}

const POOL_SIZE = 6;
const POOL_RANK_INTERVAL = 0.2;
const focus = new THREE.Vector3();
const forward = new THREE.Vector3();
const abyssGlow: Partial<Record<RoomId, string>> = { garden: "#2f8a55", crypt: "#ff5a1c" };

/** The fixed museum shell: floors, walls, trims, sealed doors, lights. */
export function createGalleryArchitecture(scene: THREE.Scene, world: RAPIER.World) {
  const { floors, wainscots, rails, trims } = shellGeometry();
  for (const floor of floors)
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(CELL / 2, 0.2, CELL / 2).setTranslation(...floor.position),
    );
  for (const core of wallCores) {
    if (!core.collide) continue;
    const bottom = core.position[1] - core.size[1] / 2;
    const top =
      core.position[1] + core.size[1] / 2 === WALL_HEIGHT
        ? COLLIDER_TOP
        : core.position[1] + core.size[1] / 2;
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(
        core.size[0] / 2,
        (top - bottom) / 2,
        core.size[2] / 2,
      ).setTranslation(core.position[0], (bottom + top) / 2, core.position[2]),
    );
  }
  scene.add(
    instancedBoxes(floors, { roughness: 0.55 }),
    instancedBoxes(wallCores, { color: "#2a2b2e", castShadow: true }),
    instancedBoxes(wallLinings, { roughness: 0.92 }),
    instancedBoxes(wainscots, { roughness: 0.7 }),
    instancedBoxes(rails, { color: "#b8955a", metalness: 0.6, roughness: 0.35 }),
    instancedBoxes(cornices, { color: "#8c826c", castShadow: true }),
    instancedBoxes(corniceCapBoxes, { color: "#9a8f76", castShadow: true }),
    instancedBoxes(trims, { color: "#a78a58", metalness: 0.25, roughness: 0.55, castShadow: true }),
  );

  // Sealed doors slide down into the floor once their key opens.
  const slabMaterial = new THREE.MeshStandardMaterial({
    color: "#6d5a3a",
    metalness: 0.55,
    roughness: 0.38,
  });
  const ringMaterial = new THREE.MeshBasicMaterial({
    color: new THREE.Color(2.4, 1.8, 0.9),
    toneMapped: false,
  });
  const slabs = sealedDoors.map((door) => {
    const [w, h, d] = door.size;
    const alongX = w > d;
    const outer = new THREE.Group();
    outer.position.fromArray(door.position);
    const inner = new THREE.Group();
    const slab = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), slabMaterial);
    slab.castShadow = slab.receiveShadow = true;
    inner.add(slab);
    for (const side of [-1, 1]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.72, 0.06, 8, 36), ringMaterial);
      ring.position.set(alongX ? 0 : (side * w) / 2, 0.3, alongX ? (side * d) / 2 : 0);
      ring.rotation.y = alongX ? 0 : Math.PI / 2;
      inner.add(ring);
    }
    outer.add(inner);
    scene.add(outer);
    const collider = world.createCollider(
      RAPIER.ColliderDesc.cuboid(w / 2, h / 2, d / 2).setTranslation(...door.position),
    );
    return { key: door.key as DoorKey, inner, collider: collider as RAPIER.Collider | null };
  });

  // Chandeliers.
  const ringBatch = new THREE.InstancedMesh(
    new THREE.TorusGeometry(0.85, 0.07, 6, 28),
    new THREE.MeshBasicMaterial({ toneMapped: false }),
    lightAnchors.length,
  );
  const chainBatch = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.03, 0.03, 1, 5),
    new THREE.MeshStandardMaterial({ color: "#3a332a", metalness: 0.6, roughness: 0.5 }),
    lightAnchors.length,
  );
  const transform = new THREE.Object3D();
  const tint = new THREE.Color();
  lightAnchors.forEach((anchor, i) => {
    transform.position.fromArray(anchor.position);
    transform.rotation.set(Math.PI / 2, 0, 0);
    transform.scale.setScalar(1);
    transform.updateMatrix();
    ringBatch.setMatrixAt(i, transform.matrix);
    ringBatch.setColorAt(i, tint.set(anchor.color).multiplyScalar(2.6));
    const length = WALL_HEIGHT + 1 - anchor.position[1];
    transform.position.set(anchor.position[0], anchor.position[1] + length / 2, anchor.position[2]);
    transform.rotation.set(0, 0, 0);
    transform.scale.set(1, length, 1);
    transform.updateMatrix();
    chainBatch.setMatrixAt(i, transform.matrix);
  });
  for (const batch of [ringBatch, chainBatch]) {
    batch.instanceMatrix.needsUpdate = true;
    if (batch.instanceColor) batch.instanceColor.needsUpdate = true;
    batch.computeBoundingSphere();
  }
  scene.add(ringBatch, chainBatch);

  // A fixed pool of point lights follows the camera between fixtures.
  const lights = Array.from({ length: POOL_SIZE }, () => {
    const light = new THREE.PointLight("#ffffff", 0, 18, 1.6);
    scene.add(light);
    return light;
  });
  const slots = lights.map(() => ({ anchor: -1 }));
  let ranked = new Set<number>();
  let sinceRank = Infinity;

  // Skylight sun with a tight frustum that travels with the camera.
  const sun = new THREE.DirectionalLight("#f3dfbf", 0.8);
  const shadowCamera = sun.shadow.camera;
  shadowCamera.left = shadowCamera.bottom = -26;
  shadowCamera.right = shadowCamera.top = 26;
  shadowCamera.near = 1;
  shadowCamera.far = 90;
  shadowCamera.updateProjectionMatrix();
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.06;
  scene.add(sun, sun.target);

  for (const room of galleryRooms) {
    if (!room.pit) continue;
    const [minX, maxX, minZ, maxZ] = roomBounds(room.id);
    const glow = new THREE.Color(abyssGlow[room.id] ?? "#223").multiplyScalar(1.6);
    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(maxX - minX, maxZ - minZ),
      new THREE.MeshBasicMaterial({ color: glow, toneMapped: false }),
    );
    plane.position.set((minX + maxX) / 2, WALL_BOTTOM + 0.4, (minZ + maxZ) / 2);
    plane.rotation.x = -Math.PI / 2;
    scene.add(plane);
  }

  return {
    sun,
    open(key: DoorKey) {
      for (const slab of slabs)
        if (slab.key === key && slab.collider) {
          world.removeCollider(slab.collider, false);
          slab.collider = null;
        }
    },
    update(camera: THREE.Camera, rawDelta: number) {
      const delta = Math.min(rawDelta, 0.05);
      for (const slab of slabs) {
        const target = slab.collider ? 0 : -DOOR_HEIGHT - 0.2;
        slab.inner.position.y += (target - slab.inner.position.y) * (1 - Math.exp(-1.6 * delta));
      }
      sinceRank += delta;
      camera.getWorldDirection(forward);
      forward.setY(0).normalize();
      if (sinceRank >= POOL_RANK_INTERVAL) {
        sinceRank = 0;
        focus.copy(camera.position).addScaledVector(forward, 3);
        ranked = new Set(
          lightAnchors
            .map((anchor, i) => ({
              i,
              d: (anchor.position[0] - focus.x) ** 2 + (anchor.position[2] - focus.z) ** 2,
            }))
            .sort((a, b) => a.d - b.d)
            .slice(0, POOL_SIZE)
            .map(({ i }) => i),
        );
      }
      const wanted = new Set(ranked);
      const blend = 1 - Math.exp(-5 * delta);
      slots.forEach((slot, k) => {
        const keep = wanted.delete(slot.anchor);
        const target = keep ? lightAnchors[slot.anchor].intensity : 0;
        lights[k].intensity += (target - lights[k].intensity) * blend;
        if (!keep && lights[k].intensity < 0.4) slot.anchor = -1;
      });
      for (const anchor of wanted) {
        const k = slots.findIndex((slot) => slot.anchor === -1);
        if (k < 0) break;
        slots[k].anchor = anchor;
        lights[k].position.fromArray(lightAnchors[anchor].position);
        lights[k].position.y -= 0.6;
        lights[k].color.set(lightAnchors[anchor].color);
        lights[k].intensity = 0;
      }
      focus.copy(camera.position).addScaledVector(forward, 6);
      focus.set(Math.round(focus.x), 0, Math.round(focus.z));
      sun.target.position.copy(focus);
      sun.position.set(focus.x - 16, 42, focus.z + 10);
    },
  };
}
