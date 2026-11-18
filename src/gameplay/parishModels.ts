import { createHoundSculpt } from "./houndSculpt.ts";
import { createKilnImpact } from "./kilnImpact.ts";
import * as THREE from "three";
import { batchJointMeshes } from "./batchJointMeshes.ts";
import type { EnemyKind } from "./ashenParish.ts";

type V3 = [number, number, number];
type Ring = [number, number, number, number?, number?];
export type ParishRig = {
  root: THREE.Group;
  joints: Record<string, THREE.Group>;
  dispose: () => void;
  impact?: ReturnType<typeof createKilnImpact>;
  skin?: ReturnType<typeof createHoundSculpt>;
};
export const HOUND_HIDE = "/assets/characters/ashen-parish/enemies/ossuary-hound-atlas-v10.png";
export const ENEMY_ATLAS = "/assets/characters/ashen-parish/enemies/sacred-capital-atlas.png";
const tiles = {
  skin: 0,
  hide: 1,
  iron: 2,
  patina: 3,
  linen: 4,
  teal: 5,
  indigo: 6,
  apron: 7,
  clay: 8,
  wood: 9,
  bronze: 10,
  wax: 11,
  stone: 12,
  ochre: 13,
  leather: 14,
  black: 15,
};
type Surface = keyof typeof tiles;
let atlas: THREE.Texture | undefined;
function enemyAtlas() {
  if (!atlas && typeof document !== "undefined") {
    atlas = new THREE.TextureLoader().load(ENEMY_ATLAS);
    atlas.colorSpace = THREE.SRGBColorSpace;
    atlas.magFilter = THREE.NearestFilter;
    atlas.minFilter = THREE.NearestMipmapLinearFilter;
    atlas.anisotropy = 2;
  }
  return atlas;
}

let houndTexture: THREE.Texture | undefined;
function houndHideTexture() {
  if (!houndTexture && typeof document !== "undefined") {
    houndTexture = new THREE.TextureLoader().load(HOUND_HIDE);
    houndTexture.colorSpace = THREE.SRGBColorSpace;
    houndTexture.magFilter = THREE.NearestFilter;
    houndTexture.minFilter = THREE.NearestMipmapNearestFilter;
  }
  return houndTexture;
}

/** Sculpted ring meshes and rigid ornaments share an atlas, batched only within joints. */
export function createParishRig(kind: EnemyKind, batch = true): ParishRig {
  const root = new THREE.Group();
  root.name = `parish-${kind}-model`;
  const joints: Record<string, THREE.Group> = {};
  const surface = new THREE.MeshStandardMaterial({
    name: "painted-ps2-enemy",
    map: enemyAtlas() ?? null,
    color: "#ffffff",
    emissiveMap: enemyAtlas() ?? null,
    emissive: "#b8c7d1",
    emissiveIntensity: 0.18,
    roughness: 0.96,
    metalness: 0.12,
    side: THREE.DoubleSide,
    vertexColors: true,
  });
  const hideSurface =
    kind === "hound"
      ? new THREE.MeshStandardMaterial({
          name: "painted-ps2-enemy",
          map: houndHideTexture() ?? null,
          emissiveMap: houndHideTexture() ?? null,
          emissive: "#b8c7d1",
          emissiveIntensity: 0.18,
          roughness: 1,
          metalness: 0,
          side: THREE.DoubleSide,
          vertexColors: true,
        })
      : undefined;
  if (hideSurface) hideSurface.userData.reviewTexture = `public${HOUND_HIDE}`;
  const ember = new THREE.MeshStandardMaterial({
    name: "enemy-votive",
    color: "#d38b3d",
    emissive: "#ff8c32",
    emissiveIntensity: 1.8,
    roughness: 1,
  });
  let serial = 0;
  function joint(name: string, parent: THREE.Group, at: V3) {
    const group = new THREE.Group();
    group.name = name;
    group.position.set(...at);
    parent.add(group);
    joints[name] = group;
    return group;
  }
  function group(parent: THREE.Group, at: V3 = [0, 0, 0], rotation: V3 = [0, 0, 0]) {
    const g = new THREE.Group();
    g.position.set(...at);
    g.rotation.set(...rotation);
    parent.add(g);
    return g;
  }
  function mesh(
    parent: THREE.Group,
    geometry: THREE.BufferGeometry,
    material: Surface | "ember",
    at: V3 = [0, 0, 0],
  ) {
    const positions = geometry.getAttribute("position");
    const uv = geometry.getAttribute("uv");
    if (material !== "ember") {
      const tile = tiles[material],
        col = tile % 4,
        row = Math.floor(tile / 4);
      if (uv && !(hideSurface && material === "hide"))
        for (let i = 0; i < uv.count; i++) {
          uv.setXY(
            i,
            col / 4 + 0.004 + THREE.MathUtils.clamp(uv.getX(i), 0, 1) * 0.242,
            1 - (row + 1) / 4 + 0.004 + THREE.MathUtils.clamp(uv.getY(i), 0, 1) * 0.242,
          );
        }
      const colors = new Float32Array(positions.count * 3);
      for (let i = 0; i < positions.count; i++) {
        // Broad baked recess shading; no per-frame random material changes.
        const value =
          0.92 + 0.08 * Math.sin(positions.getY(i) * 5 + positions.getX(i) * 3 + serial * 1.9);
        const tint =
          material === "skin"
            ? [0.85, 1, 1.12]
            : material === "hide"
              ? kind === "hound"
                ? [0.6, 0.8, 1]
                : [0.8, 0.94, 0.86]
              : [1, 1, 1];
        colors.set([value * tint[0], value * tint[1], value * tint[2]], i * 3);
      }
      geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    }
    serial++;
    const m = new THREE.Mesh(
      geometry,
      material === "ember" ? ember : material === "hide" && hideSurface ? hideSurface : surface,
    );
    m.position.set(...at);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  }
  function box(parent: THREE.Group, size: V3, at: V3, material: Surface) {
    return mesh(parent, new THREE.BoxGeometry(...size), material, at);
  }
  // Explicit contours control anatomy, folds and asymmetric silhouettes.
  function loft(
    parent: THREE.Group,
    rings: Ring[],
    material: Surface,
    sides = 8,
    at: V3 = [0, 0, 0],
    rag = 0,
  ) {
    const vertices: number[] = [],
      uvs: number[] = [],
      indices: number[] = [];
    for (let r = 0; r < rings.length; r++) {
      const [y, rx, rz, cx = 0, cz = 0] = rings[r];
      for (let i = 0; i <= sides; i++) {
        const a = (i / sides) * Math.PI * 2;
        const fold = rag ? 1 + Math.sin(a * 5 + r * 0.4) * 0.085 : 1;
        vertices.push(
          cx + Math.cos(a) * rx * fold,
          y + (r === 0 ? Math.sin(i * 7.13) * rag : 0),
          cz + Math.sin(a) * rz * fold,
        );
        uvs.push(i / sides, r / (rings.length - 1));
        if (r < rings.length - 1 && i < sides) {
          const n = r * (sides + 1) + i;
          indices.push(n, n + sides + 1, n + 1, n + 1, n + sides + 1, n + sides + 2);
        }
      }
    }
    // Separate cap vertices give planar UVs and a hard lip, never stretched stripes.
    for (const row of [0, rings.length - 1]) {
      const [y, rx, rz, cx = 0, cz = 0] = rings[row];
      const start = vertices.length / 3;
      for (let i = 0; i < sides; i++) {
        const a = (i / sides) * Math.PI * 2;
        vertices.push(cx + Math.cos(a) * rx, y, cz + Math.sin(a) * rz);
        uvs.push(0.5 + Math.cos(a) * 0.48, 0.5 + Math.sin(a) * 0.48);
      }
      for (let i = 1; i < sides - 1; i++)
        indices.push(start, start + (row === 0 ? i + 1 : i), start + (row === 0 ? i : i + 1));
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    return mesh(parent, geo, material, at);
  }
  function oval(parent: THREE.Group, size: V3, at: V3, material: Surface, segments = 8) {
    const geo = new THREE.SphereGeometry(1, segments, 6);
    geo.scale(...size);
    return mesh(parent, geo, material, at);
  }
  function rod(
    parent: THREE.Group,
    from: V3,
    to: V3,
    radius: number,
    material: Surface,
    endRadius = radius,
  ) {
    const a = new THREE.Vector3(...from),
      b = new THREE.Vector3(...to),
      d = b.clone().sub(a);
    const geo = new THREE.CylinderGeometry(endRadius, radius, d.length(), 6, 1);
    geo.applyQuaternion(
      new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()),
    );
    return mesh(parent, geo, material, a.add(b).multiplyScalar(0.5).toArray() as V3);
  }
  function plate(
    parent: THREE.Group,
    points: [number, number][],
    depth: number,
    at: V3,
    material: Surface,
  ) {
    const shape = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
    const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 1 });
    geo.translate(0, 0, -depth / 2);
    // Planar projection avoids the stretched default extrusion UVs.
    geo.computeBoundingBox();
    const bounds = geo.boundingBox!;
    const pos = geo.getAttribute("position"),
      uv = geo.getAttribute("uv"),
      normal = geo.getAttribute("normal");
    for (let i = 0; i < pos.count; i++) {
      const nx = Math.abs(normal.getX(i)),
        ny = Math.abs(normal.getY(i)),
        nz = Math.abs(normal.getZ(i));
      const u = nx > nz && nx > ny ? "z" : "x",
        v = ny > nz && ny >= nx ? "z" : "y";
      const point = new THREE.Vector3().fromBufferAttribute(pos, i);
      uv.setXY(
        i,
        (point[u] - bounds.min[u]) / Math.max(0.01, bounds.max[u] - bounds.min[u]),
        (point[v] - bounds.min[v]) / Math.max(0.01, bounds.max[v] - bounds.min[v]),
      );
    }
    return mesh(parent, geo, material, at);
  }
  function strap(parent: THREE.Group, a: V3, b: V3, width = 0.07, material: Surface = "leather") {
    const vec = new THREE.Vector3(...b).sub(new THREE.Vector3(...a));
    const m = box(
      parent,
      [width, vec.length(), 0.035],
      [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2],
      material,
    );
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), vec.normalize());
    return m;
  }
  function rivets(parent: THREE.Group, points: V3[], material: Surface = "bronze") {
    for (const at of points) oval(parent, [0.022, 0.022, 0.012], at, material, 6);
  }
  function face(parent: THREE.Group, at: V3, material: Surface = "skin", tall = 1) {
    const g = group(parent, at);
    loft(
      g,
      [
        [-0.16, 0.065, 0.07, 0, 0.02],
        [-0.09, 0.1, 0.09, 0, 0.015],
        [0.04, 0.14, 0.11],
        [0.17, 0.12, 0.1],
        [0.22, 0.07, 0.065],
      ],
      material,
      8,
    ).scale.y = tall;
    for (const side of [-1, 1]) {
      oval(g, [0.04, 0.022, 0.016], [side * 0.058, 0.064, 0.103], "black", 6);
      rod(g, [side * 0.015, 0.097, 0.11], [side * 0.106, 0.094, 0.09], 0.023, material, 0.015);
      rod(g, [side * 0.11, 0.012, 0.07], [side * 0.07, -0.06, 0.106], 0.023, material, 0.03);
    }
    loft(
      g,
      [
        [-0.025, 0.025, 0.023, 0, 0.132],
        [0.015, 0.028, 0.048, 0, 0.125],
        [0.09, 0.017, 0.02, 0, 0.1],
      ],
      material,
      5,
    );
    box(g, [0.066, 0.014, 0.017], [0, -0.085, 0.105], "black");
    return g;
  }
  function hand(parent: THREE.Group, at: V3, size = 1, material: Surface = "skin", long = false) {
    const g = group(parent, at);
    g.scale.setScalar(size);
    loft(
      g,
      [
        [-0.18, 0.065, 0.035],
        [-0.12, 0.09, 0.043],
        [0, 0.065, 0.04],
        [0.07, 0.047, 0.035],
      ],
      material,
      6,
    );
    const fingers: { base: THREE.Group; tip: THREE.Group }[] = [];
    for (let i = 0; i < 4; i++) {
      const x = (i - 1.5) * 0.047,
        len = (long ? 0.22 : 0.14) + (i === 1 ? 0.025 : 0);
      const base = group(g, [x, -0.14, 0.008]);
      rod(base, [0, 0, 0], [x * 0.2, -len * 0.55, 0.022], 0.019, material, 0.014);
      const tip = group(base, [x * 0.2, -len * 0.55, 0.022]);
      rod(tip, [0, 0, 0], [x * 0.2, -len * 0.45, 0.03], 0.014, material, 0.009);
      fingers.push({ base, tip });
    }
    g.userData.fingers = fingers;
    rod(g, [-0.07, -0.04, 0], [-0.13, -0.11, 0.05], 0.025, material, 0.015);
    return g;
  }
  function limb(
    name: string,
    parent: THREE.Group,
    at: V3,
    length: number,
    lower: number,
    radius: number,
    material: Surface,
    bendName: string,
  ) {
    const upper = joint(name, parent, at);
    loft(
      upper,
      [
        [-length, 0.6 * radius, 0.65 * radius, 0, 0.025],
        [-length * 0.64, 0.83 * radius, 0.8 * radius, 0, -0.015],
        [-length * 0.3, radius, radius],
        [0, radius * 0.8, radius * 0.85],
      ],
      material,
      8,
    );
    upper.userData.boneLength = length;
    const bend = joint(bendName, upper, [0, -length, 0]);
    bend.userData.boneLength = lower;
    oval(bend, [radius * 0.64, radius * 0.7, radius * 0.72], [0, 0, 0.015], material);
    loft(
      bend,
      [
        [-lower, radius * 0.39, radius * 0.42, 0, 0.025],
        [-lower * 0.65, radius * 0.54, radius * 0.62],
        [-lower * 0.25, radius * 0.78, radius * 0.8],
        [0, radius * 0.6, radius * 0.65],
      ],
      material,
      8,
    );
    return { upper, bend };
  }
  function leg(
    parent: THREE.Group,
    suffix: string,
    at: V3,
    thigh: number,
    shin: number,
    radius: number,
    material: Surface,
    toes = false,
  ) {
    const { upper, bend } = limb(
      `leg${suffix}`,
      parent,
      at,
      thigh,
      shin,
      radius,
      material,
      `knee${suffix}`,
    );
    const foot = joint(`foot${suffix}`, bend, [0, -shin, 0]);
    loft(
      foot,
      [
        [-0.04, radius * 0.7, 0.17, 0, 0.09],
        [0.015, radius * 0.77, 0.18, 0, 0.07],
        [0.09, radius * 0.46, 0.07],
      ],
      material,
      6,
    );
    if (toes)
      for (let i = 0; i < 4; i++)
        oval(foot, [0.024, 0.024, 0.063], [(i - 1.5) * radius * 0.36, -0.015, 0.23], material, 6);
    return { upper, bend, foot };
  }
  function tatters(
    parent: THREE.Group,
    y: number,
    radius: number,
    length: number,
    material: Surface,
    count = 9,
  ) {
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2,
        g = group(parent, [Math.sin(a) * radius, y, Math.cos(a) * radius * 0.65], [0, a, 0]);
      const w = radius * 0.52,
        l = length * (0.72 + 0.28 * Math.sin(i * 4.1) ** 2);
      plate(
        g,
        [
          [-w, 0],
          [w, 0],
          [w * 0.76, -l * 0.65],
          [w * 0.35, -l * 0.82],
          [w * 0.24, -l],
          [-w * 0.7, -l * 0.83],
        ],
        0.012,
        [0, 0, 0],
        material,
      );
    }
  }
  function lantern(parent: THREE.Group, at: V3, scale = 1) {
    const g = group(parent, at);
    g.scale.setScalar(scale);
    mesh(g, new THREE.CylinderGeometry(0.13, 0.15, 0.36, 6), "ember");
    for (const y of [-0.24, 0.24])
      loft(
        g,
        [
          [y - 0.04, 0.22, 0.22],
          [y, 0.25, 0.25],
          [y + 0.05, 0.18, 0.18],
        ],
        "bronze",
        6,
      );
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      rod(
        g,
        [Math.sin(a) * 0.2, -0.22, Math.cos(a) * 0.2],
        [Math.sin(a) * 0.2, 0.22, Math.cos(a) * 0.2],
        0.019,
        "iron",
      );
    }
    loft(
      g,
      [
        [0.27, 0.22, 0.22],
        [0.39, 0.05, 0.05],
      ],
      "bronze",
      6,
    );
    return g;
  }
  function candle(parent: THREE.Group, at: V3, height: number) {
    loft(
      parent,
      [
        [0, 0.041, 0.041],
        [height * 0.8, 0.035, 0.038],
        [height, 0.04, 0.03],
      ],
      "wax",
      6,
      at,
    );
    for (let i = 0; i < 3; i++)
      rod(
        parent,
        [at[0] + 0.025 * Math.sin(i * 2), at[1] + height * 0.8, at[2] + 0.03 * Math.cos(i * 2)],
        [
          at[0] + 0.025 * Math.sin(i * 2),
          at[1] + height * (0.1 + i * 0.19),
          at[2] + 0.036 * Math.cos(i * 2),
        ],
        0.014,
        "wax",
        0.008,
      );
    mesh(parent, new THREE.ConeGeometry(0.017, 0.065, 5), "ember", [
      at[0],
      at[1] + height + 0.025,
      at[2],
    ]);
  }
  function arch(
    parent: THREE.Group,
    at: V3,
    width: number,
    height: number,
    material: Surface,
    thick = 0.055,
  ) {
    const pts: V3[] = [
      [-width / 2, 0, 0],
      [-width / 2, height * 0.7, 0],
      [-width * 0.34, height * 0.9, 0],
      [0, height, 0],
      [width * 0.34, height * 0.9, 0],
      [width / 2, height * 0.7, 0],
      [width / 2, 0, 0],
    ];
    for (let i = 1; i < pts.length; i++)
      rod(
        parent,
        pts[i - 1].map((v, n) => v + at[n]) as V3,
        pts[i].map((v, n) => v + at[n]) as V3,
        thick,
        material,
      );
  }
  function belt(parent: THREE.Group, y: number, width: number, depth: number) {
    loft(
      parent,
      [
        [y - 0.055, width, depth],
        [y + 0.055, width, depth],
      ],
      "leather",
      8,
    );
    box(parent, [0.15, 0.13, 0.035], [0, y, depth + 0.025], "bronze");
    box(parent, [0.09, 0.07, 0.04], [0, y, depth + 0.05], "black");
  }

  if (kind === "hound") {
    // Skin geometry is authored as an editable connected mesh in Blender;
    // only the gameplay articulation is constructed here.
    const body = joint("body", root, [0, 1.2, 0]);
    const head = joint("head", body, [0, 0.1, 0.7]);
    joint("jaw", head, [0, -0.07, 0.11]);
    group(head, [0, -0.054, 0.513]).name = "hound-nose";
    for (const [suffix, side, front] of [
      ["FL", -1, true],
      ["FR", 1, true],
      ["BL", -1, false],
      ["BR", 1, false],
    ] as const) {
      const upper = joint(`leg${suffix}`, body, [
        side * (front ? 0.235 : 0.18),
        front ? 0.035 : -0.04,
        front ? 0.43 : -0.66,
      ]);
      const thigh = front ? 0.39 : 0.48,
        shin = front ? 0.8 : 0.52;
      upper.userData.boneLength = thigh;
      const lower = joint(`knee${suffix}`, upper, [0, -thigh, 0]);
      lower.userData.boneLength = shin;
      const end = front ? lower : joint(`hock${suffix}`, lower, [0, -shin, 0]);
      joint(`foot${suffix}`, end, front ? [0, -shin, 0] : [0, -0.24, 0.14]);
    }
    joint("tail", body, [0, 0.1, -0.83]);
  } else {
    const sentinel = kind === "sentinel",
      acolyte = kind === "acolyte",
      kiln = kind === "kiln",
      clinger = kind === "clinger",
      widow = kind === "widow",
      bearer = kind === "bearer";
    const hipY = kiln ? 1.0 : widow ? 1.13 : bearer ? 1.02 : clinger ? 0.9 : 1.0;
    const body = joint("body", root, [0, hipY, 0]);
    const torsoMaterial: Surface = sentinel ? "teal" : kiln ? "skin" : "skin";
    const width = kiln ? 0.47 : bearer ? 0.43 : clinger ? 0.2 : widow ? 0.23 : 0.27;
    loft(
      body,
      [
        [-0.08, width * 0.72, 0.15],
        [0.14, width * 0.7, 0.15],
        [0.39, width * 0.9, 0.21, 0, acolyte ? -0.11 : 0],
        [0.62, width, 0.22, 0, acolyte ? -0.21 : 0],
        [0.77, width * 0.78, 0.17, 0, acolyte ? -0.24 : 0],
      ],
      torsoMaterial,
      10,
    );
    if (!sentinel && !kiln)
      for (const side of [-1, 1])
        for (let i = 0; i < 4; i++)
          rod(
            body,
            [side * 0.06, 0.53 - i * 0.064, 0.205],
            [side * (width * 0.9), 0.48 - i * 0.07, 0.145],
            0.018,
            "skin",
            0.025,
          );
    if (!sentinel) {
      for (const side of [-1, 1]) {
        rod(body, [side * 0.04, 0.7, 0.2], [side * width * 0.9, 0.64, 0.16], 0.025, "skin", 0.04);
        if (kiln || bearer) {
          oval(body, [width * 0.52, 0.15, 0.12], [side * width * 0.48, 0.51, 0.16], "skin");
          oval(body, [0.17, 0.21, 0.18], [side * (width + 0.04), 0.63, 0.005], "skin");
        }
      }
    }
    const upperLen = clinger ? 0.56 : widow ? 0.68 : acolyte ? 0.52 : kiln ? 0.49 : 0.38;
    const lowerLen = clinger ? 0.64 : widow ? 0.67 : acolyte ? 0.6 : kiln ? 0.5 : 0.39;
    const shoulderY = widow ? 0.67 : bearer ? 0.65 : 0.71;
    for (const side of [-1, 1]) {
      const suffix = side < 0 ? "L" : "R";
      const armUpper = widow && side > 0 ? 0.82 : upperLen;
      const armLower = widow && side > 0 ? 0.82 : lowerLen;
      const arm = limb(
        `arm${suffix}`,
        body,
        [side * (width + 0.06), shoulderY, acolyte ? -0.19 : 0.015],
        armUpper,
        armLower,
        kiln ? 0.18 : bearer ? 0.145 : clinger ? 0.075 : 0.085,
        sentinel ? "teal" : "skin",
        `forearm${suffix}`,
      );
      // Rest orientation is a child frame so gameplay rotation never erases authored shape.
      arm.upper.rotation.z = side * (widow ? 0.13 : clinger ? 0.12 : 0.09);
      const palm = hand(
        arm.bend,
        [0, -armLower, 0],
        clinger ? 1.3 : widow ? 1.2 : kiln ? 1.35 : 1,
        sentinel ? "leather" : "skin",
        acolyte || clinger || widow,
      );
      if (clinger || widow) palm.scale.y *= clinger ? 0.55 : 0.72;
      if (side > 0) palm.scale.x *= -1;
      palm.name = `hand${suffix}`;
      joints[`hand${suffix}`] = palm;
      const hipWidth = kiln ? 0.28 : bearer ? 0.25 : 0.15;
      leg(
        body,
        side < 0 ? "FL" : "FR",
        [side * hipWidth, -0.06, 0],
        hipY * 0.44,
        hipY * 0.43,
        kiln ? 0.18 : bearer ? 0.15 : 0.092,
        sentinel ? "iron" : "skin",
        !sentinel && !kiln,
      );
    }
    const head = joint("head", body, [0, 0.91, acolyte ? -0.27 : 0.02]);
    if (sentinel) {
      const mask = group(head, [0, 0.015, 0], [0.08, 0, 0.38]);
      loft(
        mask,
        [
          [-0.19, 0.075, 0.085],
          [-0.1, 0.14, 0.13],
          [0.19, 0.145, 0.12],
          [0.28, 0.1, 0.1],
        ],
        "iron",
        6,
      );
      for (const x of [-0.055, 0.055]) box(mask, [0.032, 0.15, 0.021], [x, 0.055, 0.123], "black");
      for (const x of [-0.08, 0, 0.08]) box(mask, [0.018, 0.065, 0.02], [x, -0.11, 0.125], "black");
      box(mask, [0.022, 0.39, 0.035], [0, 0.045, 0.146], "bronze");
      loft(
        body,
        [
          [0.15, 0.27, 0.18],
          [0.3, 0.31, 0.21],
          [0.6, 0.35, 0.24],
          [0.75, 0.31, 0.17],
        ],
        "iron",
        8,
      );
      for (const side of [-1, 1]) {
        plate(
          body,
          [
            [0, 0],
            [side * 0.25, 0.12],
            [side * 0.29, 0.53],
            [side * 0.12, 0.63],
          ],
          0.025,
          [0, 0.1, 0.22],
          "teal",
        );
        rivets(body, [
          [side * 0.14, 0.3, 0.25],
          [side * 0.24, 0.56, 0.25],
          [side * 0.13, 0.7, 0.23],
        ]);
      }
      belt(body, 0.12, 0.3, 0.2);
      tatters(body, 0.09, 0.3, 0.6, "teal");
      for (const side of [-1, 1]) {
        const arm = joints[`arm${side < 0 ? "L" : "R"}`];
        loft(
          arm,
          [
            [-0.14, 0.16, 0.16],
            [0.015, 0.22, 0.24],
            [0.16, 0.13, 0.16],
          ],
          "iron",
          6,
          [0, 0, 0],
        );
        box(joints[`knee${side < 0 ? "FL" : "FR"}`], [0.12, 0.25, 0.06], [0, -0.2, 0.065], "iron");
      }
      // Broken civic fan: five broad metal rays instead of a generic helmet plume.
      for (let i = 0; i < 6; i++) {
        const a = 0.1 + i * 0.27,
          g = group(body, [-0.3, 0.77, -0.06], [0, 0, a]);
        plate(
          g,
          [
            [-0.045, 0],
            [0.045, 0],
            [0.072, 0.49 + (i % 2) * 0.07],
            [-0.055, 0.52],
          ],
          0.04,
          [0, 0, 0],
          i % 2 ? "bronze" : "iron",
        );
      }
      const shield = group(joints.forearmL, [-0.09, -0.18, 0.2]);
      shield.name = "gate-shield";
      joints.shield = shield;
      arch(shield, [0, -0.68, 0], 0.55, 1.42, "iron", 0.065);
      for (const y of [-0.66, -0.21, 0.32]) box(shield, [0.57, 0.08, 0.065], [0, y, 0.01], "iron");
      for (const x of [-0.16, 0, 0.16]) box(shield, [0.032, 1.03, 0.04], [x, -0.14, 0.015], "iron");
      face(shield, [0, 0.48, 0.015], "stone", 0.8);
      rivets(
        shield,
        [-0.23, 0, 0.23].flatMap((x) => [-0.64, -0.2, 0.33].map((y) => [x, y, 0.055] as V3)),
      );
      const sword = group(joints.forearmR, [0, -0.46, 0], [0, 0, -0.1]);
      sword.name = "sentinel-sword";
      box(sword, [0.28, 0.045, 0.08], [0, -0.05, 0.03], "bronze");
      plate(
        sword,
        [
          [-0.05, 0],
          [0.055, 0],
          [0.065, -0.69],
          [0.025, -0.8],
          [-0.05, -0.72],
        ],
        0.035,
        [0, -0.08, 0.035],
        "iron",
      );
      strap(body, [-0.28, 0.69, 0.215], [0.23, 0.15, 0.22], 0.065);
    } else if (acolyte) {
      const f = group(head);
      loft(
        f,
        [
          [-0.2, 0.04, 0.055],
          [-0.12, 0.08, 0.075],
          [0.04, 0.12, 0.075],
          [0.19, 0.11, 0.07],
          [0.23, 0.06, 0.04],
        ],
        "wax",
        8,
      );
      for (const side of [-1, 1])
        box(f, [0.045, 0.012, 0.014], [side * 0.052, 0.07, 0.075], "black");
      rod(f, [0, 0.09, 0.085], [0, -0.035, 0.12], 0.02, "wax", 0.025);
      box(f, [0.04, 0.008, 0.012], [0, -0.1, 0.078], "black");
      f.rotation.x = -0.6;
      // Recessed eyes in a wax death mask; no generic hood.
      tatters(body, 0.15, 0.24, 0.48, "linen", 10);
      loft(
        body,
        [
          [0.13, 0.25, 0.175],
          [0.3, 0.24, 0.18],
          [0.53, 0.28, 0.21, 0, -0.13],
          [0.73, 0.23, 0.17, 0, -0.22],
        ],
        "linen",
        8,
      );
      lantern(body, [0, 0.43, 0.24], 1.05);
      for (const side of [-1, 1])
        strap(body, [side * 0.22, 0.72, -0.1], [side * 0.2, 0.15, 0.17], 0.045, "iron");
      arch(body, [0, 0.65, -0.25], 1.05, 0.79, "iron", 0.025);
      for (const [x, y, h] of [
        [-0.52, 1.2, 0.14],
        [-0.35, 1.37, 0.18],
        [0, 1.44, 0.2],
        [0.35, 1.37, 0.12],
        [0.52, 1.2, 0.16],
      ])
        candle(body, [x, y, -0.25], h);
      for (const side of [-1, 1])
        for (let i = 0; i < 3; i++)
          rod(
            joints[`forearm${side < 0 ? "L" : "R"}`],
            [side * 0.04, -lowerLen * 0.65 + i * 0.06, 0.055],
            [side * 0.04, -lowerLen - 0.13 + i * 0.03, 0.07],
            0.018,
            "wax",
            0.01,
          );
    } else if (kiln) {
      head.position.set(0, 0.7, 0.4);
      plate(
        head,
        [
          [-0.13, 0.2],
          [0.13, 0.2],
          [0.15, -0.1],
          [0.075, -0.2],
          [-0.09, -0.18],
        ],
        0.11,
        [0, 0, 0.04],
        "iron",
      );
      for (const x of [-0.075, 0, 0.075])
        box(head, [0.027, 0.15, 0.018], [x, -0.02, 0.105], "black");
      box(head, [0.22, 0.025, 0.018], [0, 0.13, 0.105], "black");
      // Closed pelvis and leather wrap join the torso to the legs from every view.
      loft(
        body,
        [
          [-0.29, 0.31, 0.22],
          [-0.12, 0.43, 0.27],
          [0.15, 0.4, 0.25],
          [0.31, 0.34, 0.22],
        ],
        "skin",
        10,
      );
      const mantle = group(body, [0, 0.78, 0]);
      mantle.name = "ceramic-mantle";
      // Shoulder-sized fired-clay shells leave an actual neck recess, instead of
      // a solid red slab spanning the entire body like a mushroom cap.
      for (const side of [-1, 1]) {
        const contour: [number, number][] = [
          [0.78, -0.04],
          [0.74, 0.18],
          [0.52, 0.36],
          [0.2, 0.42],
          [0.12, 0.25],
          [0.2, -0.08],
          [0.48, -0.12],
        ];
        plate(
          mantle,
          contour.map(([x, y]) => [x * side, y]),
          0.62,
          [0, 0, -0.015],
          "clay",
        );
        strap(mantle, [side * 0.32, 0.06, 0.303], [side * 0.4, 0.26, 0.303], 0.018, "black");
        rivets(
          mantle,
          [
            [side * 0.66, 0.1, 0.31],
            [side * 0.27, 0.04, 0.31],
          ],
          "iron",
        );
      }
      plate(
        mantle,
        [
          [-0.26, -0.1],
          [0.26, -0.1],
          [0.22, 0.2],
          [-0.22, 0.2],
        ],
        0.24,
        [0, 0, -0.22],
        "clay",
      );
      rod(mantle, [-0.55, 0.025, -0.345], [0.55, 0.025, -0.345], 0.035, "iron");
      arch(mantle, [0, 0.04, -0.07], 0.33, 0.23, "iron", 0.035);
      plate(
        body,
        [
          [-0.34, 0.72],
          [0.34, 0.72],
          [0.41, -0.62],
          [0.22, -0.79],
          [-0.37, -0.69],
        ],
        0.022,
        [0, 0, 0.32],
        "apron",
      );
      for (const side of [-1, 1])
        strap(body, [side * 0.33, 0.75, 0.2], [side * 0.24, 0.38, 0.34], 0.1);
      const wrap = loft(
        body,
        [
          [-0.72, 0.48, 0.33],
          [-0.48, 0.49, 0.34],
          [-0.18, 0.46, 0.32],
          [0.2, 0.43, 0.29],
          [0.29, 0.36, 0.25],
        ],
        "apron",
        12,
        [0, 0, 0],
        0.035,
      );
      wrap.name = "kiln-continuous-leather-wrap";
      plate(
        body,
        [
          [-0.28, 0.68],
          [0.28, 0.68],
          [0.32, 0.12],
          [0.24, -0.11],
          [-0.25, -0.11],
        ],
        0.025,
        [0, 0, -0.265],
        "apron",
      );
      for (const side of [-1, 1])
        strap(body, [side * 0.32, 0.72, -0.21], [side * 0.24, 0.11, -0.29], 0.09);
      belt(body, 0.2, 0.47, 0.3);
      box(body, [0.22, 0.68, 0.26], [-0.48, 0.14, -0.02], "leather");
      for (const y of [-0.06, 0.17, 0.39]) box(body, [0.24, 0.21, 0.25], [-0.52, y, 0], "iron");
      for (const side of [-1, 1]) {
        const arm = joints[`forearm${side < 0 ? "L" : "R"}`];
        loft(
          arm,
          [
            [-0.4, 0.16, 0.15],
            [-0.34, 0.19, 0.18],
            [-0.06, 0.18, 0.17],
            [0, 0.13, 0.14],
          ],
          side < 0 ? "clay" : "leather",
          6,
        );
        for (const y of [-0.32, -0.11])
          loft(
            arm,
            [
              [y, 0.19, 0.18],
              [y + 0.045, 0.19, 0.18],
            ],
            "iron",
            6,
          );
      }
      const tongs = joint("tool", root, [0.12, 0.85, 0.45]);
      tongs.rotation.x = -1.3;
      // Extend the working end without scaling the two grip locations apart.
      rod(tongs, [0, 0.12, 0], [0, -1.12, 0.16], 0.065, "iron");
      rod(tongs, [0, 0.09, 0], [0, -0.32, 0.035], 0.076, "leather");
      box(tongs, [0.2, 0.17, 0.16], [0, -0.88, 0.1], "iron");
      for (const side of [-1, 1]) {
        const jaw = joint(`tong${side < 0 ? "L" : "R"}`, tongs, [0, -0.9, 0.1]);
        rod(jaw, [0, 0, 0], [side * 0.46, -0.56, 0.055], 0.09, "iron");
        rod(jaw, [side * 0.46, -0.56, 0.055], [side * 0.32, -0.78, 0.15], 0.09, "iron", 0.055);
      }
    } else if (clinger) {
      head.position.set(0, 0.82, 0.045);
      plate(
        head,
        [
          [-0.12, -0.23],
          [0.12, -0.23],
          [0.15, 0.17],
          [0, 0.38],
          [-0.15, 0.17],
        ],
        0.065,
        [0, 0, 0.08],
        "wood",
      );
      box(head, [0.025, 0.45, 0.02], [0, 0.02, 0.125], "black");
      for (const side of [-1, 1])
        box(head, [0.027, 0.16, 0.02], [side * 0.07, 0.02, 0.126], "black");
      // Narrow pointed burial shell remains a rigid landmark during unfolding.
      const shell = joint("shell", body, [0, 0.17, -0.2]);
      arch(shell, [0, -0.52, 0], 0.72, 1.65, "stone", 0.06);
      plate(
        shell,
        [
          [-0.31, 0.77],
          [0, 1.06],
          [0.31, 0.77],
          [0.3, 0.56],
          [0, 0.78],
          [-0.3, 0.56],
        ],
        0.018,
        [0, 0, -0.025],
        "linen",
      );
      for (const side of [-1, 1]) {
        const g = group(shell, [side * 0.25, 0.9, -0.04], [0, side * 0.15, 0]);
        plate(
          g,
          [
            [-0.12, 0],
            [0.12, 0],
            [0.11, -0.74],
            [0.02, -1.06],
            [-0.06, -0.84],
            [-0.1, -1.25],
          ],
          0.015,
          [0, 0, 0],
          "linen",
        );
      }
      for (const side of [-1, 1]) {
        const a = joints[`arm${side < 0 ? "L" : "R"}`];
        a.position.z = 0.13;
        const palm = group(joints[`forearm${side < 0 ? "L" : "R"}`], [0, -lowerLen, 0]);
        for (let i = 0; i < 3; i++)
          box(palm, [0.02, 0.13, 0.012], [(i - 1) * 0.042, -0.1, 0.045], "teal");
      }
    } else if (widow) {
      head.position.set(-0.15, 0.46, 0.4);
      face(head, [0, 0, 0], "skin", 1.15);
      for (const side of [-1, 1])
        for (let i = 0; i < 3; i++) {
          plate(
            head,
            [
              [-0.015, 0],
              [0.02, 0],
              [0.025, -0.27 - i * 0.035],
              [0, -0.37 - i * 0.025],
              [-0.01, -0.2],
            ],
            0.008,
            [side * (0.11 + i * 0.019), 0.12, 0.055 - i * 0.015],
            "indigo",
          );
        }

      tatters(body, 0.38, 0.3, 1.15, "indigo", 10);
      const bell = joint("bell", body, [-0.22, 0.95, -0.08]);
      const tilt = group(bell, [0, 0, 0], [0.13, 0, -0.4]);
      tilt.name = "bronze-bell-cowl";
      // Open-ended bell with modeled wall thickness and a genuinely hollow mouth.
      loft(
        tilt,
        [
          [-0.25, 0.62, 0.52],
          [-0.18, 0.65, 0.55],
          [-0.08, 0.57, 0.48],
          [0.13, 0.49, 0.42],
          [0.4, 0.36, 0.32],
          [0.48, 0.22, 0.2],
        ],
        "patina",
        12,
      );
      // Hide the loft's bottom cap and replace it with a dark recessed inner bowl.
      const bellMesh = tilt.children[0] as THREE.Mesh;
      const geometry = bellMesh.geometry;
      const index = geometry.getIndex()!;
      geometry.setIndex(Array.from(index.array).slice(0, 5 * 12 * 6));
      loft(
        tilt,
        [
          [0.06, 0.48, 0.41],
          [0.18, 0.42, 0.36],
          [0.4, 0.22, 0.2],
        ],
        "black",
        12,
      );
      for (const y of [-0.2, 0.02, 0.31])
        loft(
          tilt,
          [
            [y - 0.015, y < 0 ? 0.635 : y > 0.2 ? 0.4 : 0.54, y < 0 ? 0.54 : y > 0.2 ? 0.35 : 0.46],
            [y + 0.015, y < 0 ? 0.635 : y > 0.2 ? 0.4 : 0.54, y < 0 ? 0.54 : y > 0.2 ? 0.35 : 0.46],
          ],
          "bronze",
          12,
        );
      arch(tilt, [0, 0.48, 0], 0.38, 0.37, "bronze", 0.035);
      // Three large cracks, readable at gameplay distance.
      for (const x of [-0.25, 0.16])
        strap(tilt, [x, -0.22, 0.5], [x + 0.08, 0.23, 0.36], 0.025, "black");
      joints.armR.position.x = 0.4;
      joints.armR.position.y = 0.56;
      const hammer = joint("hammer", joints.forearmL, [0, -lowerLen, 0]);
      rod(hammer, [0, 0.02, 0], [0, -0.48, 0.02], 0.038, "wood");
      box(hammer, [0.24, 0.18, 0.17], [0, -0.43, 0.025], "wood");
    } else if (bearer) {
      head.position.set(0, 0.55, 0.34);
      face(head, [0, 0, 0], "bronze", 1.05);
      tatters(body, 0.06, 0.34, 0.52, "ochre", 8);
      for (const side of [-1, 1])
        strap(body, [side * 0.29, 0.75, 0.19], [side * 0.23, -0.05, 0.23], 0.12);
      rod(body, [-0.48, 0.59, -0.23], [0.48, 0.59, -0.23], 0.055, "iron");
      for (const side of [-1, 1])
        oval(body, [0.085, 0.085, 0.05], [side * 0.46, 0.59, -0.26], "bronze");
      const shrine = joint("shrine", body, [0, 0.59, -0.22]);
      shrine.name = "empty-procession-shrine";
      box(shrine, [0.91, 1.22, 0.25], [0, 0.65, -0.22], "wood");
      box(shrine, [0.66, 1.06, 0.02], [0, 0.64, -0.071], "black");
      for (const side of [-1, 1])
        box(shrine, [0.11, 1.25, 0.14], [side * 0.43, 0.67, -0.03], "wood");
      for (const y of [0.02, 1.27]) box(shrine, [1.02, 0.13, 0.47], [0, y, -0.1], "wood");
      plate(
        shrine,
        [
          [-0.6, 0],
          [0, 0.2],
          [0.6, 0],
          [0.48, -0.08],
          [-0.48, -0.08],
        ],
        0.48,
        [0, 1.37, -0.12],
        "wood",
      );
      box(shrine, [0.13, 0.15, 0.12], [0, 1.62, -0.13], "bronze");
      for (const side of [-1, 1]) {
        const door = joint(`door${side < 0 ? "L" : "R"}`, shrine, [side * 0.49, 0.64, 0.05]);
        const frame = group(door, [side * 0.25, 0, 0], [0, side * -0.48, side * 0.045]);
        box(frame, [0.49, 1.26, 0.055], [0, 0, 0], "wood");
        for (const x of [-0.19, 0.19]) box(frame, [0.035, 1.14, 0.03], [x, 0, 0.042], "bronze");
        for (const y of [-0.53, 0.53]) box(frame, [0.4, 0.035, 0.03], [0, y, 0.042], "bronze");
        // Square civic seal belongs to this city's heraldry.
        for (const s of [-1, 1]) {
          box(frame, [0.17, 0.025, 0.012], [0, s * 0.075, 0.061], "leather");
          box(frame, [0.025, 0.15, 0.012], [s * 0.075, 0, 0.061], "leather");
        }
        const pole = joint(
          `pole${side < 0 ? "L" : "R"}`,
          joints[`forearm${side < 0 ? "L" : "R"}`],
          [0, -lowerLen + 0.06, 0.13],
        );
        rod(pole, [0, 0.15, 0], [0, -0.63, 0], 0.05, "wood");
        loft(
          pole,
          [
            [-0.74, 0.16, 0.14],
            [-0.65, 0.18, 0.16],
            [-0.48, 0.1, 0.09],
          ],
          "stone",
          4,
        );
      }
      rod(shrine, [-0.3, 1.16, 0.015], [0, 1.05, 0.04], 0.025, "leather");
      rod(shrine, [0, 1.05, 0.04], [0.3, 1.16, 0.015], 0.025, "leather");
      for (let i = 0; i < 3; i++)
        plate(
          shrine,
          [
            [-0.025, 0],
            [0.025, 0],
            [0.035, -0.13],
            [0, -0.19],
            [-0.035, -0.13],
          ],
          0.012,
          [0, 1.02 - i * 0.14, 0.04],
          "linen",
        );
    }
  }
  // Fixed grips are baked into the hand, retaining one submission per rigid hand.
  // Only the Penitent needs independently animated finger joints for its casting gesture.
  if (kind !== "acolyte")
    for (const suffix of ["L", "R"]) {
      const palm = joints[`hand${suffix}`];
      if (!palm) continue;
      const closed =
        kind === "sentinel" ||
        kind === "kiln" ||
        kind === "bearer" ||
        (kind === "widow" && suffix === "L");
      const curl = closed ? 1.25 : kind === "clinger" ? 0.12 : 0;
      for (const finger of (palm.userData.fingers ?? []) as {
        base: THREE.Group;
        tip: THREE.Group;
      }[]) {
        finger.base.rotation.x = -curl;
        finger.tip.rotation.x = -curl * 0.8;
        root.updateMatrixWorld(true);
        const parts: THREE.Mesh[] = [];
        finger.base.traverse((o) => {
          if (o instanceof THREE.Mesh) parts.push(o);
        });
        for (const part of parts) palm.attach(part);
        palm.remove(finger.base);
      }
      palm.userData.fingers = [];
    }
  for (const j of Object.values(joints)) j.userData.bindPosition = j.position.clone();
  const modelScale =
    kind === "widow"
      ? 0.82
      : kind === "bearer"
        ? 0.86
        : kind === "kiln"
          ? 1.12
          : kind === "sentinel"
            ? 1.06
            : 1;
  root.scale.setScalar(modelScale);
  const skin =
    kind === "hound" && hideSurface ? createHoundSculpt(root, joints, hideSurface) : undefined;
  if (batch) batchJointMeshes(root);
  const impact = kind === "kiln" ? createKilnImpact() : undefined;
  if (impact) root.add(impact.root);
  root.userData.enemyKind = kind;
  return {
    root,
    joints,
    impact,
    skin,
    dispose() {
      impact?.root.removeFromParent();
      const geometries = new Set<THREE.BufferGeometry>();
      root.traverse((o) => {
        if (o instanceof THREE.Mesh) geometries.add(o.geometry);
      });
      geometries.forEach((g) => g.dispose());
      skin?.dispose();
      impact?.dispose();
      hideSurface?.dispose();
      surface.dispose();
      ember.dispose();
    },
  };
}
