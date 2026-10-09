import * as THREE from "three";
import { buildCapitalCrag, capitalCeiling } from "./capitalCrag.ts";
import {
  addCapitalReferenceDetails,
  giantSwordParts,
  isCapitalStair,
} from "./capitalReferenceDetails.ts";
import { batchStaticMeshes } from "./batchStaticMeshes.ts";
import {
  capitalSurfaces,
  capitalBuildings,
  capitalSurfaceHeight,
  capitalRailSurfaces,
  capitalSolids,
  capitalPews,
  capitalRetainingWedges,
  capitalLifts,
  capitalShrines,
  capitalLanterns,
  capitalFoundations,
  capitalStatueSolids,
  type CapitalSurface,
} from "./capitalLayout.ts";
import {
  CAPITAL_GARDEN_Z,
  CAPITAL_GARDEN_X,
  CAPITAL_TOWN_X,
  type CapitalDoor,
} from "./capitalDistricts.ts";
import type { ParishPoint } from "./ashenParish.ts";

/** One authored slab supplies both the visible paving and the physics surface. */
export function capitalSlabGeometry(surface: CapitalSurface, thickness = 1) {
  const top = surface.vertices,
    n = top.length;
  const vertices = [...top, ...top.map(([x, y, z]) => [x, y - thickness, z] as ParishPoint)];
  const indices: number[] = [];
  const normal = new THREE.Vector3().crossVectors(
    new THREE.Vector3().subVectors(new THREE.Vector3(...top[1]), new THREE.Vector3(...top[0])),
    new THREE.Vector3().subVectors(new THREE.Vector3(...top[2]), new THREE.Vector3(...top[0])),
  ).y;
  for (let i = 1; i < n - 1; i++) {
    if (normal > 0) indices.push(0, i, i + 1, n, n + i + 1, n + i);
    else indices.push(0, i + 1, i, n, n + i, n + i + 1);
  }
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    indices.push(i, n + i, n + j, i, n + j, j);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(vertices.flat(), 3));
  g.setAttribute(
    "uv",
    new THREE.Float32BufferAttribute(
      vertices.flatMap((p) => [p[0] / 4, p[2] / 4]),
      2,
    ),
  );
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}
export function buildCapitalEnvironment(gridded = true) {
  const root = new THREE.Group();
  root.name = "minas-tirith-capital";
  const geometries = new Set<THREE.BufferGeometry>();
  const textures: THREE.Texture[] = [];
  const fogReveal = { value: 0 };
  const colliders: Array<{
    vertices: Float32Array;
    indices: Uint32Array;
    position: ParishPoint;
    yaw: number;
  }> = [];
  // Crisp pale-cyan two-metre lines over saturated blue-steel faces match the
  // video blockout; faint half-metre lines give floors the same scale read.
  const gridTexture = () => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 256;
    const ctx = canvas.getContext("2d")!;
    for (let row = 0; row < 2; row++)
      for (let col = 0; col < 2; col++) {
        ctx.fillStyle = (row + col) % 2 ? "#3a4c66" : "#3f526d";
        ctx.fillRect(col * 128, row * 128, 128, 128);
      }
    const line = (offset: number) => {
      ctx.beginPath();
      ctx.moveTo(offset, 0);
      ctx.lineTo(offset, 256);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, offset);
      ctx.lineTo(256, offset);
      ctx.stroke();
    };
    ctx.strokeStyle = "rgba(170, 214, 255, 0.22)";
    ctx.lineWidth = 1;
    for (let offset = 32; offset < 256; offset += 32) if (offset % 128) line(offset);
    ctx.strokeStyle = "#cfe8ff";
    ctx.lineWidth = 2.5;
    for (const offset of [0, 128, 256]) line(offset);
    ctx.font = "11px sans-serif";
    ctx.fillStyle = "#cfe8ff";
    for (let row = 0; row < 2; row++)
      for (let col = 0; col < 2; col++) ctx.fillText("02 m", col * 128 + 10, row * 128 + 21);
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 4;
    textures.push(t);
    return t;
  };
  const map = gridded ? gridTexture() : null;
  const portalMap = gridded
    ? (() => {
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = 128;
        const ctx = canvas.getContext("2d")!;
        for (let y = 0; y < 4; y++)
          for (let x = 0; x < 4; x++) {
            ctx.fillStyle = (x + y) % 2 ? "#c58936" : "#9f6428";
            ctx.fillRect(x * 32, y * 32, 32, 32);
          }
        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
        textures.push(texture);
        return texture;
      })()
    : null;
  const material = (
    color: string,
    grid = false,
    extras: THREE.MeshStandardMaterialParameters = {},
  ) => {
    const mat = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.9,
      map: grid ? map : null,
      ...extras,
    });
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.capitalReveal = fogReveal;
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\nvarying vec3 vCapitalPosition;")
        .replace(
          "#include <project_vertex>",
          "#include <project_vertex>\nvCapitalPosition=(modelMatrix*vec4(transformed,1.)).xyz;",
        );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          "#include <common>",
          "#include <common>\nvarying vec3 vCapitalPosition;uniform float capitalReveal;",
        )
        .replace(
          "#include <fog_fragment>",
          `#include <fog_fragment>
        float dy=(vCapitalPosition.y-cameraPosition.y)*.09;
        float a=exp(clamp((-8.-cameraPosition.y)*.09,-40.,8.));
        float b=exp(clamp((-8.-vCapitalPosition.y)*.09,-40.,8.));
        float average=abs(dy)<.01?a:(a-b)/dy;
        float mist=1.-exp(-length(vCapitalPosition-cameraPosition)*max(average,0.)*mix(.012,.0008,capitalReveal));
        gl_FragColor.rgb=mix(gl_FragColor.rgb,vec3(.15,.25,.45),clamp(mist,0.,.985));`,
        );
    };
    mat.customProgramCacheKey = () => "capital-height-fog-v3";
    return mat;
  };
  const m = {
    stone: material("#d2dcea", true),
    dark: material("#7c8aa0", true),
    paving: material("#b4c2d4", true),
    trim: material("#c3c9d2", true),
    roof: material("#7a8aa2", true, { side: THREE.DoubleSide }),
    // Natural crags carry no blockout grid, which sets them apart from masonry.
    rock: material("#7c7a7a", false, { flatShading: true }),
    cavern: material("#3b4b58", true, { side: THREE.DoubleSide }),
    timber: material("#403b36"),
    iron: material("#333a40", false, { metalness: 0.6 }),
    gold: material("#d7a367", false, { metalness: 0.35 }),
    amber: material("#eeac66", false, { emissive: "#ffad58", emissiveIntensity: 2 }),
    blue: material("#75d8ed", false, { emissive: "#26c6e9", emissiveIntensity: 2.5 }),
    clock: material("#d0b17c", false, { emissive: "#98754c", emissiveIntensity: 0.08 }),
    windowWarm: material("#805f44", false, { emissive: "#e99b52", emissiveIntensity: 0.25 }),
    windowBlue: material("#3e6477", false, { emissive: "#54a5c4", emissiveIntensity: 0.2 }),
    soil: material("#97a2b0", true),
    green: material("#354c48"),
    statue: material("#b7bdc3"),
    backdrop: material("#56688a", false),
    portal: material("#e4ba77", false, { map: portalMap, metalness: 0 }),
  };
  const add = (
    g: THREE.BufferGeometry,
    mat: THREE.Material,
    position: ParishPoint = [0, 0, 0],
    rotation: ParishPoint = [0, 0, 0],
  ) => {
    // Project at a consistent world scale: a cathedral wall and a small pier
    // should use the same 2 m grid cells, rather than stretch a grid per box.
    if (
      mat instanceof THREE.MeshStandardMaterial &&
      (mat.map || !g.getAttribute("uv")) &&
      g.getAttribute("normal")
    ) {
      // Choose one projection for an entire face. Smooth cylinder normals at
      // shared vertices must not choose different axes within the same triangle.
      if (g.index) {
        geometries.add(g);
        g = g.toNonIndexed();
      }
      const pos = g.getAttribute("position");
      const transform = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(...rotation));
      transform.setPosition(...position);
      const rotationMatrix = new THREE.Matrix3().setFromMatrix4(transform);
      const uv: number[] = [];
      const v = new THREE.Vector3(),
        n = new THREE.Vector3();
      const a = new THREE.Vector3(),
        b = new THREE.Vector3(),
        c = new THREE.Vector3();
      for (let i = 0; i < pos.count; i += 3) {
        a.fromBufferAttribute(pos, i);
        b.fromBufferAttribute(pos, i + 1);
        c.fromBufferAttribute(pos, i + 2);
        n.subVectors(b, a).cross(c.sub(a)).applyMatrix3(rotationMatrix);
        const horizontal = Math.abs(n.y) >= Math.max(Math.abs(n.x), Math.abs(n.z));
        const eastWest = Math.abs(n.x) > Math.abs(n.z);
        for (let j = 0; j < 3; j++) {
          v.fromBufferAttribute(pos, i + j).applyMatrix4(transform);
          if (horizontal) uv.push(v.x / 4, v.z / 4);
          else if (eastWest) uv.push(v.z / 4, v.y / 4);
          else uv.push(v.x / 4, v.y / 4);
        }
      }
      g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    }
    geometries.add(g);
    const mesh = new THREE.Mesh(g, mat);
    mesh.position.set(...position);
    mesh.rotation.set(...rotation);
    mesh.castShadow = mesh.receiveShadow = true;
    root.add(mesh);
    return mesh;
  };
  const box = (p: ParishPoint, s: ParishPoint, mat: THREE.Material = m.stone, yaw = 0) =>
    add(new THREE.BoxGeometry(...s), mat, p, [0, yaw, 0]);
  const cylinder = (
    p: ParishPoint,
    r: number,
    h: number,
    mat: THREE.Material = m.trim,
    sides = 12,
    rTop = r,
  ) => add(new THREE.CylinderGeometry(rTop, r, h, sides), mat, p);
  const collision = (g: THREE.BufferGeometry) =>
    colliders.push({
      vertices: new Float32Array(g.getAttribute("position").array),
      indices: g.index
        ? new Uint32Array(g.index.array)
        : Uint32Array.from({ length: g.getAttribute("position").count }, (_, i) => i),
      position: [0, 0, 0],
      yaw: 0,
    });
  const rockFoundation = (
    cx: number,
    cz: number,
    rx: number,
    rz: number,
    top: number,
    bottom: number,
    seed: number,
  ) => {
    const segments = 28,
      levels = 6;
    const points: number[] = [],
      indices: number[] = [];
    for (let level = 0; level < levels; level++) {
      const t = level / (levels - 1);
      for (let i = 0; i < segments; i++) {
        const a = (i / segments) * Math.PI * 2;
        const rough =
          1 + 0.055 * Math.sin(i * 2.4 + seed) + 0.045 * Math.cos(i * 1.7 + level * 2 + seed);
        const taper = 1 - 0.26 * t + 0.06 * Math.sin(t * Math.PI);
        points.push(
          cx + Math.sin(a) * rx * rough * taper,
          top + (bottom - top) * t + (level === 0 ? 0 : Math.sin(i * 4 + seed) * 1.1),
          cz + Math.cos(a) * rz * rough * taper,
        );
      }
    }
    for (let j = 0; j < levels - 1; j++)
      for (let i = 0; i < segments; i++) {
        const a = j * segments + i,
          b = j * segments + ((i + 1) % segments);
        indices.push(a, b + segments, b, a, a + segments, b + segments);
      }
    for (let i = 1; i < segments - 1; i++) indices.push(0, i, i + 1);
    const last = (levels - 1) * segments;
    for (let i = 1; i < segments - 1; i++) indices.push(last, last + i + 1, last + i);
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
    g.setIndex(indices);
    g.computeVertexNormals();
    add(g, m.rock);
    collision(g);
  };
  // Combine immutable floors into one collider to keep physics broad-phase costs bounded.
  const floorVertices: number[] = [],
    floorIndices: number[] = [];
  for (const f of capitalFoundations) {
    const geometry = capitalSlabGeometry(f.surface, f.surface.vertices[0][1] - f.bottom);
    add(geometry, m.dark);
    collision(geometry);
  }
  for (const s of capitalSurfaces) {
    const g = capitalSlabGeometry(s),
      offset = floorVertices.length / 3;
    floorVertices.push(...g.getAttribute("position").array);
    floorIndices.push(...Array.from(g.index!.array, (n) => n + offset));
    if (!isCapitalStair(s)) add(g, s.id.startsWith("garden:") ? m.soil : m.paving);
    else geometries.add(g);
  }
  colliders.push({
    vertices: new Float32Array(floorVertices),
    indices: new Uint32Array(floorIndices),
    position: [0, 0, 0],
    yaw: 0,
  });
  for (const s of capitalSolids) {
    if (capitalStatueSolids.includes(s)) continue;
    box(
      [s.position[0], s.position[1] + s.size[1] / 2, s.position[2]],
      s.size,
      capitalPews.includes(s) ? m.timber : m.stone,
      s.yaw,
    );
    if (capitalPews.includes(s)) continue;
    // Layered masonry courses and footings break up the silhouettes without adding colliders.
    box(
      [s.position[0], s.position[1] + 0.25, s.position[2]],
      [s.size[0] + 0.16, 0.5, s.size[2] + 0.16],
      m.dark,
      s.yaw,
    );
    if (s.size[1] > 8)
      for (const dy of [4, s.size[1] - 0.5])
        box(
          [s.position[0], s.position[1] + dy, s.position[2]],
          [s.size[0] + 0.2, 0.3, s.size[2] + 0.2],
          m.trim,
          s.yaw,
        );
  }
  const rail = (a: ParishPoint, b: ParishPoint, height = 1.15, width = 0.45, collide = true) => {
    const dx = b[0] - a[0],
      dz = b[2] - a[2],
      length = Math.hypot(dx, dz),
      nx = ((-dz / length) * width) / 2,
      nz = ((dx / length) * width) / 2;
    const s: CapitalSurface = {
      id: "rail",
      area: "refuge",
      layer: "upper",
      vertices: [
        [a[0] + nx, a[1] + height, a[2] + nz],
        [b[0] + nx, b[1] + height, b[2] + nz],
        [b[0] - nx, b[1] + height, b[2] - nz],
        [a[0] - nx, a[1] + height, a[2] - nz],
      ],
    };
    const g = capitalSlabGeometry(s, height);
    add(g, m.dark);
    if (collide) collision(g);
    // Continuous coping follows the ramp, rather than a floating horizontal beam.
    add(
      capitalSlabGeometry({ ...s, vertices: s.vertices.map(([x, y, z]) => [x, y + 0.16, z]) }, 0.2),
      m.trim,
    );
  };
  const routeRail = (a: ParishPoint, b: ParishPoint, id: string) => {
    const family = id.split(":")[0],
      steps = Math.ceil(Math.hypot(b[0] - a[0], b[2] - a[2]) / 0.35);
    const point = (t: number) => a.map((v, i) => v + (b[i] - v) * t) as ParishPoint;
    let begin: number | null = null;
    for (let i = 0; i <= steps; i++) {
      const p = point(i / steps);
      const junction = capitalRailSurfaces.some(
        (s) =>
          !s.id.startsWith(family + ":") &&
          s.id !== family &&
          (() => {
            const y = capitalSurfaceHeight(s, p[0], p[2]);
            return y !== null && Math.abs(y - p[1]) < 0.4;
          })(),
      );
      if (!junction && begin === null) begin = i / steps;
      if ((junction || i === steps) && begin !== null) {
        const end = junction ? Math.max(begin, (i - 1) / steps) : 1;
        if (end - begin > 0.001) rail(point(begin), point(end));
        begin = null;
      }
    }
  };
  const laneNames = [
    "top-right-road",
    "eastern-wall-crown",
    "eastern-clock-approach",
    "town-west-walk",
    "town-roof-approach",
    "cathedral-third-ascent",
    "cathedral-nave-stair",
    "chapel-rooftop-return",
    "garden-town-return",
    "town-lift-upper",
    "town-lift-lower",
    "lower-backyard",
    "street-wall-return",
    "first-bridge",
    "second-bridge",
    "town-bridge",
    "town-return",
    "town-stair",
    "mountain-tunnel",
    "west-exterior",
    "east-exterior",
    "garden-bridge",
    "garden-return",
    "beacon-bridge",
    "grand-street",
    "beacon-exit",
  ];
  // Enclose the mountain ascent, with clear portals before both turning landings.
  for (const s of capitalRailSurfaces.filter((s) => s.id === "mountain-tunnel:1:2")) {
    rail(s.vertices[0], s.vertices[1], 3.2, 0.65);
    rail(s.vertices[3], s.vertices[2], 3.2, 0.65);
    const ceiling = capitalSlabGeometry(
      { ...s, vertices: s.vertices.map(([x, y, z]) => [x, y + 3.8, z]) },
      0.8,
    );
    add(ceiling, m.rock);
    collision(ceiling);
  }
  for (const s of capitalRailSurfaces)
    if (laneNames.some((name) => s.id.startsWith(name + ":")) && !s.id.includes("landing")) {
      if (
        (s.id.startsWith("mountain-tunnel") || s.id.startsWith("west-exterior")) &&
        s.vertices[0][1] === s.vertices[1][1]
      )
        continue;
      const inset = (a: ParishPoint, b: ParishPoint) => {
        const t = Math.min(0.22, 3.5 / Math.hypot(b[0] - a[0], b[2] - a[2]));
        return [
          a.map((v, i) => v + (b[i] - v) * t) as ParishPoint,
          b.map((v, i) => v + (a[i] - v) * t) as ParishPoint,
        ] as const;
      };
      routeRail(...inset(s.vertices[0], s.vertices[1]), s.id);
      routeRail(...inset(s.vertices[2], s.vertices[3]), s.id);
      if (
        s.id.startsWith("first-bridge") ||
        s.id.startsWith("second-bridge") ||
        s.id.startsWith("town-bridge")
      )
        for (const p of [s.vertices[0], s.vertices[1]])
          cylinder([p[0], p[1] / 2 - 15, p[2]], 0.65, p[1] + 30, m.dark, 8);
    }
  // Two exposed curtain arcs surround the first bridge, with missing stretches
  // and narrow surviving masonry in place of a regular circular basket.
  for (const s of capitalRailSurfaces.filter((s) => s.id.startsWith("outer-wall-"))) {
    for (const [a, b, outer] of [
      [s.vertices[0], s.vertices[3], false],
      [s.vertices[1], s.vertices[2], true],
    ] as const) {
      const angle = (Math.atan2(a[0], a[2]) + Math.atan2(b[0], b[2])) / 2;
      if (
        Math.abs(angle) < 0.09 ||
        (!outer &&
          (Math.abs(angle + 0.92) < 0.09 ||
            Math.abs(angle - 0.92) < 0.09 ||
            Math.abs(angle - 0.48) < 0.09))
      )
        continue;
      routeRail(a, b, s.id);
      if (!outer && s.id.startsWith("outer-wall-right") && angle > 0.35) {
        rail(a, b, 6, 1.1);
        if (Math.floor(angle * 100) % 3 === 0) {
          const p: ParishPoint = [(a[0] + b[0]) / 2, 2.8, (a[2] + b[2]) / 2];
          cylinder(p, 0.65, 5.6, m.dark, 10, 0.5);
          cylinder([p[0], 5.75, p[2]], 0.8, 0.3, m.trim, 10);
        }
      }
      if (outer && (angle < -0.84 || (angle < -0.25 && angle > -0.65) || angle > 0.35)) {
        rail([a[0], -13, a[2]], [b[0], -13, b[2]], 13, 1.3, false);
        if (Math.floor(Math.abs(angle) * 100) % 3 === 0)
          box([(a[0] + b[0]) / 2, 1.65, (a[2] + b[2]) / 2], [1.3, 0.9, 0.75], m.stone, -angle);
      }
    }
  }
  // Broken merlons and battered exterior ribs make the surviving curtain
  // fragments read as ruined fortifications at both overview and walking scale.
  for (const [i, s] of capitalRailSurfaces
    .filter((s) => s.id.startsWith("outer-wall-"))
    .entries()) {
    const a = s.vertices[1],
      b = s.vertices[2];
    const theta = (Math.atan2(a[0], a[2]) + Math.atan2(b[0], b[2])) / 2;
    const radius = Math.hypot(a[0], a[2]);
    for (let tooth = 0; tooth < 3; tooth++) {
      if ((i + tooth) % 5 === 0) continue;
      const t = (tooth + 0.5) / 3;
      const x = a[0] + (b[0] - a[0]) * t,
        z = a[2] + (b[2] - a[2]) * t;
      box([x, 1.5 + (i % 3) * 0.1, z], [1.05, 0.9 + (i % 3) * 0.2, 1.2], m.stone, theta);
      box([x, 2.03 + (i % 3) * 0.2, z], [1.2, 0.16, 1.3], m.trim, theta);
    }
    if (i % 3 === 0) {
      for (let tier = 0; tier < 3; tier++) {
        const r = radius + 1.2 - tier * 0.25;
        box(
          [Math.sin(theta) * r, -10.75 + tier * 4, Math.cos(theta) * r],
          [2.3 - tier * 0.3, 4.2, 2.7 - tier * 0.35],
          m.dark,
          theta,
        );
      }
    }
  }
  // The eastern curtain rests on a broad stepped plinth, as in the completed
  // structural reference. These courses are beneath the walk, not extra floating decks.
  for (let step = 0; step < 12; step++)
    for (let i = 0; i < 10; i++) {
      const a = 0.35 + i * 0.075,
        b = a + 0.075,
        r = 66 + step;
      rail(
        [Math.sin(a) * r, -13 + step, Math.cos(a) * r],
        [Math.sin(b) * r, -13 + step, Math.cos(b) * r],
        1.1,
        1.15,
        false,
      );
    }
  // The town terrace is an asymmetric quarter arc. The chapel terraces are faceted,
  // and their retaining walls follow those same authored edges rather than a second circular shell.
  for (const s of capitalRailSurfaces.filter(
    (s) => s.id.startsWith("lower-terrace:") || s.id.startsWith("upper-terrace:"),
  )) {
    const [, p, q] = s.vertices,
      y = p[1];
    const a = Math.atan2(p[0], p[2] - 12),
      b = Math.atan2(q[0], q[2] - 12),
      angle = (a + b) / 2;
    if (Math.abs(angle) > 0.17 && Math.abs(angle + 1.6) > 0.2) routeRail(p, q, s.id);
    const base = y === 24 ? 0 : -8;
    rail([p[0], base, p[2]], [q[0], base, q[2]], y - base - 0.3, 1.8, false);
    for (const course of [base + 1, base + 6, y - 1])
      rail([p[0], course, p[2]], [q[0], course, q[2]], 0.5, 2.15, false);
    cylinder([p[0], y - 4.5, p[2]], 0.9, 9, m.dark, 8);
  }
  // The video entry walk hugs a tall inner curtain, with rounded buttresses
  // opposite a crenellated parapet. Keep the passage between these volumes clear.
  for (const [i, s] of capitalRailSurfaces
    .filter((s) => s.id.startsWith("lower-terrace:"))
    .entries()) {
    const a = s.vertices[0],
      b = s.vertices[3];
    rail(a, b, 16, 1.4);
    if (i % 2 === 0) {
      const theta = Math.atan2((a[0] + b[0]) / 2, (a[2] + b[2]) / 2 - 12);
      const x = Math.sin(theta) * 26.1,
        z = 12 + Math.cos(theta) * 26.1;
      const support = new THREE.CylinderGeometry(1.1, 1.7, 15.5, 12);
      support.translate(x, 15.75, z);
      add(support, m.dark);
      collision(support);
      for (const y of [9, 15, 22.5]) cylinder([x, y, z], 1.75, 0.35, m.trim, 12);
    }
    const outerA = s.vertices[1],
      outerB = s.vertices[2];
    const count = Math.ceil(Math.hypot(outerB[0] - outerA[0], outerB[2] - outerA[2]) / 2.7);
    for (let tooth = 0; tooth < count; tooth++) {
      const t = (tooth + 0.5) / count;
      const x = outerA[0] + (outerB[0] - outerA[0]) * t,
        z = outerA[2] + (outerB[2] - outerA[2]) * t;
      box([x, 9.65, z], [1.3, 1.15, 1.3], m.stone);
      box([x, 10.3, z], [1.5, 0.18, 1.5], m.trim);
    }
  }
  const pointedArch = (
    p: ParishPoint,
    w: number,
    h: number,
    yaw = 0,
    mat: THREE.Material = m.trim,
    thickness = 0.18,
  ) => {
    const curve = new THREE.CurvePath<THREE.Vector3>();
    const left = new THREE.Vector3(-w / 2, h * 0.65, 0);
    const apex = new THREE.Vector3(0, h, 0);
    const right = new THREE.Vector3(w / 2, h * 0.65, 0);
    curve.add(new THREE.LineCurve3(new THREE.Vector3(-w / 2, 0, 0), left));
    curve.add(
      new THREE.QuadraticBezierCurve3(left, new THREE.Vector3(-w * 0.4, h * 0.88, 0), apex),
    );
    curve.add(
      new THREE.QuadraticBezierCurve3(apex, new THREE.Vector3(w * 0.4, h * 0.88, 0), right),
    );
    curve.add(new THREE.LineCurve3(right, new THREE.Vector3(w / 2, 0, 0)));
    return add(new THREE.TubeGeometry(curve, 28, thickness, 6, false), mat, p, [0, yaw, 0]);
  };
  const window = (p: ParishPoint, w: number, h: number, yaw = 0, blue = false) => {
    const shape = new THREE.Shape();
    shape.moveTo(-w / 2, 0);
    shape.lineTo(w / 2, 0);
    shape.lineTo(w / 2, h * 0.65);
    shape.quadraticCurveTo(w / 2, h * 0.88, 0, h);
    shape.quadraticCurveTo(-w / 2, h * 0.88, -w / 2, h * 0.65);
    shape.closePath();
    add(new THREE.ShapeGeometry(shape), blue ? m.windowBlue : m.windowWarm, p, [0, yaw, 0]);
    pointedArch([p[0], p[1] + h * 0.62, p[2] + 0.025], w, h * 0.4, yaw);
    for (const side of [-1, 1]) {
      const px = p[0] + (Math.cos(yaw) * side * w) / 2,
        pz = p[2] - (Math.sin(yaw) * side * w) / 2;
      box([px, p[1] + h * 0.32, pz], [0.22, h * 0.64, 0.25], m.trim, yaw);
    }
    box([p[0], p[1] + h * 0.4, p[2] + 0.04], [0.12, h * 0.8, 0.15], m.iron, yaw);
  };
  const roof = (x: number, y: number, z: number, w: number, d: number, rise: number) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(
        [
          -w / 2,
          0,
          -d / 2,
          -w / 2,
          0,
          d / 2,
          0,
          rise,
          d / 2,
          0,
          rise,
          -d / 2,
          w / 2,
          0,
          -d / 2,
          0,
          rise,
          -d / 2,
          0,
          rise,
          d / 2,
          w / 2,
          0,
          d / 2,
        ],
        3,
      ),
    );
    g.setAttribute(
      "uv",
      new THREE.Float32BufferAttribute(
        [0, 0, 0, d / 4, w / 4, d / 4, w / 4, 0, 0, 0, w / 4, 0, w / 4, d / 4, 0, d / 4],
        2,
      ),
    );
    g.setIndex([0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7]);
    g.computeVertexNormals();
    add(g, m.roof, [x, y, z]);
    const shape = new THREE.Shape();
    shape.moveTo(-w / 2, 0);
    shape.lineTo(w / 2, 0);
    shape.lineTo(0, rise);
    shape.closePath();
    for (const side of [-1, 1])
      add(
        new THREE.ShapeGeometry(shape),
        m.stone,
        [x, y, z + (side * d) / 2],
        [0, side < 0 ? Math.PI : 0, 0],
      );
    box([x, y + rise, z], [0.4, 0.35, d + 0.6], m.trim);
    for (let i = 0; i < 9; i++) {
      const yy = y + (rise * i) / 9,
        xx = (w / 2) * (1 - i / 9);
      for (const side of [-1, 1]) box([x + side * xx, yy + 0.1, z], [0.2, 0.18, d], m.dark);
    }
  };
  const rose = (p: ParishPoint, r: number) => {
    add(new THREE.CircleGeometry(r, 32), m.amber, p);
    add(new THREE.TorusGeometry(r, 0.25, 6, 40), m.trim, [p[0], p[1], p[2] + 0.08]);
    add(new THREE.TorusGeometry(r * 0.65, 0.075, 5, 32), m.gold, [p[0], p[1], p[2] + 0.1]);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      box(
        [p[0] + Math.sin(a) * r * 0.5, p[1] + Math.cos(a) * r * 0.5, p[2] + 0.12],
        [0.1, r, 0.12],
        m.iron,
      );
      root.children[root.children.length - 1].rotation.z = -a;
    }
    add(new THREE.CircleGeometry(r * 0.19, 12), m.blue, [p[0], p[1], p[2] + 0.13]);
  };
  const clockFace = (p: ParishPoint, r: number, yaw = 0) => {
    add(new THREE.CircleGeometry(r, 32), m.clock, p, [0, yaw, 0]);
    const rim = add(new THREE.TorusGeometry(r, 0.12, 6, 32), m.dark, p, [0, yaw, 0]);
    void rim;
    for (let i = 0; i < 12; i++) {
      const a = (i * Math.PI) / 6;
      const mark = box(
        [
          p[0] + Math.cos(yaw) * Math.sin(a) * r * 0.8,
          p[1] + Math.cos(a) * r * 0.8,
          p[2] - Math.sin(yaw) * Math.sin(a) * r * 0.8 + 0.03,
        ],
        [0.08, r * 0.16, 0.08],
        m.dark,
        yaw,
      );
      mark.rotateZ(-a);
    }
    const hand = box([p[0], p[1] + r * 0.26, p[2] + 0.08], [0.1, r * 0.6, 0.08], m.dark, yaw);
    hand.rotation.z = -0.45;
    box([p[0] + r * 0.18, p[1], p[2] + 0.1], [r * 0.55, 0.12, 0.08], m.dark, yaw);
  };
  // Cathedral: a layered, tall gabled landmark, not a low rectangular arena shell.
  roof(0, 51, -65, 36, 49, 16);
  box([0, 71.5, -74], [17, 17, 20], m.stone);
  roof(0, 80, -74, 19, 23, 9);
  box([0, 87, -78], [10, 14, 12], m.dark);
  roof(0, 94, -78, 12, 14, 8);
  clockFace([0, 76, -63.9], 2.8);
  clockFace([0, 89, -71.9], 1.8);
  for (const x of [-5, 5]) window([x, 66, -63.9], 1.8, 6);
  rose([0, 44, -41.22], 3.8);
  rose([0, 60, -63.9], 2.5);
  pointedArch([0, 24, -41.1], 10, 13);
  pointedArch([0, 24.1, -40.8], 11.8, 15);
  for (const side of [-1, 1]) {
    for (const z of [-47, -58, -70, -82]) {
      const x = side * 19;
      // The west doorways and the exterior stair along that wall keep their
      // openings clear; only the northern bay carries a buttress there.
      if (side === 1 || z === -47) {
        box([x, 34, z], [2.4, 20, 3.4], m.dark);
        box([x, 43, z], [3.2, 1, 4.2], m.trim);
        cylinder([x, 48, z], 0.65, 5, m.trim, 6, 0.15);
      }
      pointedArch([side * 16.4, 36, z], 7, 5, Math.PI / 2);
      window([side * 17.76, 39, z], 2.2, 8, (side * Math.PI) / 2, true);
    }
    for (const x of [6, 12]) window([side * x, 37, -41.2], 2, 8);
  }
  for (const z of [-52, -65, -78]) {
    // The rear bay carries both crossings at -77: its gallery arch would cut
    // through the y 44 bridge.
    if (z !== -78) pointedArch([0, 36, z], 20, 11);
    // Tie beams keep 3.5 m over the rafter walks and end within the roof.
    box([0, 54.2, z], [28, 0.65, 0.65], m.dark);
  }
  for (const side of [-1, 1])
    for (const z of [-48, -61, -75, -84]) {
      for (const y of [27, 38, 46]) window([side * 16.6, y, z], 1.7, 4.5, (-side * Math.PI) / 2);
    }
  for (const x of [-42, -36, -30]) window([x, 47, -78.6], 2.4, 7);
  for (const z of [-72, -60]) window([-48.6, 47, z], 2.4, 7, Math.PI / 2);
  // The rear sanctuary anchors the otherwise open nave; the central aisle
  // stays clear between the two pew banks and the upper crossings remain above it.
  rose([0, 38, -87.55], 3.6);
  for (const x of [-7, 7]) {
    window([x, 28, -87.55], 2.8, 9);
    pointedArch([x, 27.8, -87.3], 4, 11, 0, m.trim, 0.3);
  }
  // The rear transverse arch rises to the underside of the y 44 crossing it carries.
  for (const z of [-52, -65, -78]) pointedArch([0, 24, z], 21, z === -78 ? 19 : 23, 0, m.trim, 0.4);
  box([0, 25.35, -85], [8.5, 0.25, 2.5], m.trim);
  for (const x of [-3, 3]) {
    cylinder([x, 26, -85], 0.16, 1.1, m.gold, 8);
    cylinder([x, 26.7, -85], 0.1, 0.3, m.amber, 6, 0.02);
  }
  // Upper-gallery railings preserve the open nave below.
  for (const y of [36, 44])
    for (const x of [-8, 8]) {
      // Gaps line up with the third-floor cross galleries.
      const spans =
        y === 36
          ? [[-78, -43]]
          : [
              [-87, -79],
              [-75, -57],
              [-53, -43],
            ];
      for (const [a, b] of spans) rail([x, y, a], [x, y, b], 1.1, 0.3);
    }
  for (const z of [-58, -77])
    for (const side of [-1, 1]) rail([-7, 50, z + side * 1.4], [7, 50, z + side * 1.4], 0.8, 0.15);
  // Full masonry podium and layered gothic façade. Recesses and buttresses
  // make the occupied building read as a continuous cathedral, rather than a
  // collection of slabs and window decals on a bare box.
  for (const y of [-10, -2, 6, 14, 23.2]) {
    for (const side of [-1, 1]) {
      box([side * 16.4, y, -65], [1.1, 0.65, 44.8], m.trim);
      box([0, y, -65 + side * 22.3], [33.7, 0.65, 1.1], m.trim);
    }
  }
  for (const side of [-1, 1]) {
    for (const z of [-47, -61, -78]) {
      for (let tier = 0; tier < 4; tier++) {
        box([side * 17.8, 27.5 + tier * 7, z], [2.5 - tier * 0.35, 7, 3 - tier * 0.35], m.dark);
        box([side * 17.8, 31 + tier * 7, z], [3 - tier * 0.35, 0.55, 3.5 - tier * 0.35], m.trim);
      }
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(side * 27, 40, z),
        new THREE.Vector3(side * 25, 47, z),
        new THREE.Vector3(side * 21, 50, z),
        new THREE.Vector3(side * 17.8, 53, z),
      ]);
      add(new THREE.TubeGeometry(curve, 16, 0.7, 6, false), m.trim);
      cylinder([side * 27, 46, z], 1.2, 1.5, m.trim, 8);
      cylinder([side * 27, 49.5, z], 1.3, 5.5, m.roof, 8, 0.1);
      window([side * 16.9, 8, z], 3.3, 9, (side * Math.PI) / 2);
      pointedArch([side * 17.1, -7, z], 5, 27, (side * Math.PI) / 2, m.dark, 0.45);
    }
    for (const x of [6.6, 13.5]) {
      box([side * x, 38, -40.65], [1.3, 28, 1.6], m.dark);
      box([side * x, 51.8, -40.65], [2, 0.6, 2.2], m.trim);
      cylinder([side * x, 54, -40.65], 0.7, 4, m.roof, 6, 0.08);
    }
    window([side * 10, 28, -40.5], 4.1, 10);
    pointedArch([side * 10, 27.5, -40.3], 5, 11, 0, m.trim, 0.3);
    window([side * 10, 43, -40.5], 3, 6);
    roof(side * 10, 57.8, -45.5, 4, 5, 3.4);
    window([side * 10, 58.5, -42.9], 1.4, 2.4);
  }
  rose([0, 58.6, -40.25], 2.7);
  for (let i = 0; i < 12; i++) {
    const x = -18 + i * 3.3;
    const y = 51 + 16 * (1 - Math.abs(x) / 18);
    cylinder([x, y + 0.45, -40.15], 0.35, 0.9, m.trim, 6, 0.2);
  }
  pointedArch([0, 23.8, -40.2], 12, 14, 0, m.dark, 0.5);
  pointedArch([0, 23.8, -39.8], 13.5, 15.2, 0, m.trim, 0.3);
  // Heavy open arches carry the western oratory while leaving the diagonal
  // garden climb and the outside ascent beneath it unobstructed.
  pointedArch([-49, 12, -65], 27, 31, Math.PI / 2, m.dark, 1.1);
  pointedArch([-49.6, 12, -65], 25, 30, Math.PI / 2, m.trim, 0.45);
  pointedArch([-39.5, 12, -50.7], 19, 31, 0, m.dark, 1.1);
  pointedArch([-39.5, 12, -50.1], 17, 30, 0, m.trim, 0.45);
  for (const z of [-51, -79]) {
    box([-39.5, 42.8, z], [22, 2.4, 3.2], m.stone);
    box([-39.5, 44, z], [23, 0.5, 3.6], m.trim);
  }
  for (const y of [49, 56.5]) {
    box([-49.5, y, -65], [1.1, 0.5, 29], m.trim);
    box([-36, y, -50.5], [28, 0.5, 1.1], m.trim);
  }
  for (const z of [-75, -65, -55]) {
    box([-49.7, 50, z], [1.1, 13, 1], m.dark);
    window([-49.7, 47, z + 2.2], 2.5, 8, -Math.PI / 2);
    window([-49.7, 47, z - 2.2], 2.5, 8, -Math.PI / 2);
  }
  // Lit chapel at the central stepped tower.
  // A stepped polygonal sanctuary echoes the circular precinct in the reference.
  cylinder([0, 35.5, -5], 14, 1, m.trim, 8);
  cylinder([0, 37.5, -5], 13.5, 3, m.roof, 8, 10);
  cylinder([0, 40, -5], 10, 2, m.dark, 8);
  cylinder([0, 41.5, -5], 10.5, 1, m.trim, 8);
  cylinder([0, 43.5, -5], 10, 3, m.roof, 8, 7);
  cylinder([0, 45.2, -5], 7.5, 0.5, m.trim, 8);
  rose([0, 33, 10.62], 2);
  pointedArch([0, 24, 10.6], 9, 7);
  pointedArch([0, 24, -19.4], 9, 7);
  for (const side of [-1, 1])
    for (const z of [-12, 2]) window([side * 11.6, 27, z], 2.2, 5, (side * Math.PI) / 2, true);
  for (const s of capitalRailSurfaces.filter((s) => s.id.startsWith("upper-terrace:"))) {
    const p = s.vertices[1],
      q = s.vertices[2];
    const x = (p[0] + q[0]) / 2,
      z = (p[2] + q[2]) / 2;
    const a = Math.atan2(x, z - 12);
    for (const y of [5, 15]) {
      window([x + Math.sin(a), y, z + Math.cos(a)], 2.1, 5.5, a);
      pointedArch(
        [x + Math.sin(a) * 1.15, y - 0.4, z + Math.cos(a) * 1.15],
        3.2,
        6.5,
        a,
        m.trim,
        0.24,
      );
    }
    box([p[0], 11.5, p[2]], [1.6, 23, 1.6], m.dark, a);
    box([p[0], 23, p[2]], [2.1, 0.7, 2.1], m.trim, a);
  }
  // Every district building is enterable. Its windows, thresholds and roof match
  // the volume and door records used by collision, including the upper town floors.
  for (const b of capitalBuildings) {
    const [x, z] = b.center,
      [w, d] = b.size;
    if (b.flat) {
      box([x, b.roof - 0.12, z], [w + 0.5, 0.24, d + 0.5], m.trim);
      // Low coping leaves the roof connections open along their side entrances.
      for (const side of [-1, 1])
        for (const end of [-1, 1])
          box(
            [x + end * (w / 2 - 0.4), b.roof + 0.45, z + side * (d / 2 - 0.4)],
            [0.6, 0.9, 0.6],
            m.dark,
          );
    } else roof(x, b.roof, z, w + 1, d + 1, b.id.includes("cathedral") ? 7 : 4);
    for (const side of [-1, 1]) {
      const yaw = side === 1 ? 0 : Math.PI;
      for (let xx = -w / 2 + 2; xx < w / 2 - 1; xx += 4) {
        for (let y = b.base + 3; y < b.roof - 2; y += 6) {
          const doors = b.doors.filter((v) => v.side === (side === 1 ? "south" : "north"));
          if (doors.some((v) => Math.abs(xx - v.offset) < v.width / 2 + 1 && y < v.y + v.height))
            continue;
          window([x + xx, y, z + side * (d / 2 + 0.36)], 1.4, 2.8, yaw);
          window([x + xx, y, z + side * (d / 2 - 0.36)], 1.4, 2.8, yaw + Math.PI);
        }
      }
    }
    if (b.id.startsWith("town-") || b.id.startsWith("mid-town:")) {
      // Horizontal timbers stop at door jambs instead of crossing an opening
      // at head or ankle height.
      const bandSpans = (face: CapitalDoor["side"], length: number, y: number) => {
        let spans = [[-length / 2, length / 2]];
        for (const v of b.doors) {
          if (v.side !== face || y < v.y - 0.3 || y > v.y + v.height + 0.3) continue;
          const [l, r] = [v.offset - v.width / 2 - 0.6, v.offset + v.width / 2 + 0.6];
          spans = spans.flatMap(([a, c]) =>
            [
              [a, Math.min(c, l)],
              [Math.max(a, r), c],
            ].filter(([p, q]) => q - p > 0.05),
          );
        }
        return spans;
      };
      for (const side of [-1, 1]) {
        const zFace = z + side * (d / 2 + 0.42);
        for (const xx of [-w / 2, w / 2])
          box([x + xx, (b.base + b.roof) / 2, zFace], [0.26, b.roof - b.base, 0.22], m.timber);
        for (let y = b.base + 0.25; y <= b.roof; y += 6)
          for (const [a, c] of bandSpans(side === 1 ? "south" : "north", w, y))
            box([x + (a + c) / 2, y, zFace], [c - a, 0.26, 0.24], m.timber);
        const xFace = x + side * (w / 2 + 0.42);
        for (const zz of [-d / 2, d / 2])
          box([xFace, (b.base + b.roof) / 2, z + zz], [0.22, b.roof - b.base, 0.26], m.timber);
        for (let y = b.base + 0.25; y <= b.roof; y += 6)
          for (const [a, c] of bandSpans(side === 1 ? "east" : "west", d, y))
            box([xFace, y, z + (a + c) / 2], [0.24, 0.26, c - a], m.timber);
        for (let zz = -d / 2 + 2; zz < d / 2 - 1; zz += 4)
          for (let y = b.base + 2.8; y < b.roof - 2; y += 6) {
            const doors = b.doors.filter((v) => v.side === (side === 1 ? "east" : "west"));
            if (doors.some((v) => Math.abs(zz - v.offset) < v.width / 2 + 1 && y < v.y + v.height))
              continue;
            window([xFace, y, z + zz], 1.25, 2.7, (side * Math.PI) / 2);
          }
      }
      if (!b.flat) {
        for (const side of [-1, 1]) {
          const zz = z + side * (d / 2 + 0.55);
          for (const xSide of [-1, 1]) {
            const beam = box(
              [x + (xSide * w) / 4, b.roof + 2, zz],
              [Math.hypot(w / 2, 4), 0.23, 0.25],
              m.timber,
            );
            beam.rotation.z = -xSide * Math.atan2(4, w / 2);
          }
          box([x, b.roof + 1.8, zz], [0.24, 3.6, 0.25], m.timber);
        }
      }
    }
    for (const v of b.doors) {
      const across = v.side === "north" || v.side === "south";
      const px = x + (across ? v.offset : v.side === "east" ? w / 2 : -w / 2);
      const pz = z + (across ? (v.side === "south" ? d / 2 : -d / 2) : v.offset);
      const yaw = across ? 0 : Math.PI / 2;
      // The reference door metric describes a clear rectangle. Keep the amber
      // surround outside it; an arch at this height pinched the upper corners.
      box([px, v.y + v.height + 0.3, pz], [v.width + 1.2, 0.6, 0.7], m.portal, yaw);
      for (const side of [-1, 1]) {
        const jambX = px + Math.cos(yaw) * side * (v.width / 2 + 0.3);
        const jambZ = pz - Math.sin(yaw) * side * (v.width / 2 + 0.3);
        box([jambX, v.y + v.height / 2, jambZ], [0.6, v.height, 0.7], m.portal, yaw);
        box([jambX, v.y + 0.25, jambZ], [0.9, 0.5, 0.9], m.trim, yaw);
      }
    }
    if (b.id.startsWith("town")) {
      for (const side of [-1, 1])
        box([x + side * (w / 2 + 0.15), b.base + 2, z + d / 2 + 0.1], [0.4, 4, 0.4], m.timber);
      box([x + w / 2 - 1.2, b.base + 0.4, z + d / 2 - 1.2], [1.6, 0.8, 1.5], m.timber);
    }
  }
  // Floor courses make the cathedral's height readable from every approach.
  for (const y of [36, 44, 50])
    for (const side of [-1, 1]) {
      box([side * 17.4, y, -65], [0.45, 0.45, 46], m.trim);
      for (const z of [-48, -61, -75, -84])
        window([side * 17.4, y + 1, -65 + (z + 65)], 1.8, 4, (side * Math.PI) / 2);
    }
  // Corner buttresses stop at the edge of the exterior stair beside the wall.
  for (const side of [-1, 1])
    for (const z of [-46, -83]) {
      box([side * 18.05, 40, z], [0.9, 32, 2.7], m.dark);
      cylinder([side * 18.05, 56.7, z], 0.9, 2, m.trim, 8);
      cylinder([side * 18.05, 60, z], 1, 5, m.roof, 8, 0.1);
    }
  for (const side of [-1, 1])
    for (const z of [-49, -60, -73, -84]) {
      box([side * 15.8, 48, z], [0.4, 6, 0.6], m.trim);
      cylinder([side * 15.8, 51.7, z], 0.42, 1.5, m.gold, 6, 0.08);
    }
  cylinder([0, 12, -5], 10.5, 24, m.dark, 8);
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    box([Math.sin(a) * 10.7, 11, -5 + Math.cos(a) * 10.7], [1.7, 22, 1.7], m.stone);
  }
  // Small sanctuary atop the hub: open sides and a pitched polygonal cap.
  for (const x of [-3.5, 3.5])
    for (const z of [-8.5, -1.5]) {
      cylinder([x, 48.1, z], 0.3, 5.3, m.trim, 8);
      cylinder([x, 50.8, z], 0.6, 0.4, m.gold, 8);
    }
  cylinder([0, 51, -5], 5.7, 0.45, m.trim, 8);
  cylinder([0, 52.7, -5], 5.9, 3, m.roof, 8, 0.3);
  cylinder([0, 54.8, -5], 0.25, 1.3, m.gold, 8, 0.08);
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    pointedArch([Math.sin(a) * 12.5, 24, -5 + Math.cos(a) * 12.5], 8.8, 10, a, m.trim, 0.35);
    box([Math.sin(a) * 12.5, 34.5, -5 + Math.cos(a) * 12.5], [9.8, 0.6, 1], m.trim, a);
  }
  // Grand square paving and courtyard furnishings orient the chapel's four exits.
  for (const x of [-12, 12])
    for (const z of [-35, -27]) {
      cylinder([x, 24.25, z], 0.85, 0.5, m.dark, 8);
      cylinder([x, 27, z], 0.2, 5, m.trim, 8);
      cylinder([x, 29.8, z], 0.6, 0.7, m.amber, 8, 0.3);
    }
  for (const side of [-1, 1]) {
    for (const z of [-18, -5, 8]) {
      box([side * 12.1, 30, z], [1.8, 12, 2.1], m.dark);
      cylinder([side * 12.1, 36.8, z], 0.6, 2, m.trim, 6, 0.12);
    }
    for (const z of [-18, -5, 8]) pointedArch([side * 11.65, 25, z], 5.5, 9, Math.PI / 2);
  }
  // Joined cliff shelves support the western roads instead of leaving every
  // district suspended on isolated poles.
  rockFoundation(44 - CAPITAL_TOWN_X, 18, 22, 22, 3.3, -20, 19);
  const gardenStart = root.children.length;
  const gardenColliderStart = colliders.length;
  // The whole precinct rests on one irregular rock island. The return route
  // passes outside its west face rather than through a decorative solid.
  rockFoundation(-52, -58, 18, 19, 23.6, -11, 7);
  for (let i = 0; i < 22; i++) {
    const a = i * 2.399;
    const rock = add(new THREE.IcosahedronGeometry(2.8 + (i % 3) * 0.6, 1), m.rock, [
      -52 + Math.cos(a) * 16,
      19 - (i % 4) * 2.5,
      -58 + Math.sin(a) * 17,
    ]);
    rock.scale.set(1, 1.2, 0.8);
    rock.rotation.set(i * 0.2, i * 0.7, 0);
  }
  // Stone paths run through soil and grass, instead of paving the entire island.
  for (const [a, b] of [
    [
      [-50, 24.04, -65],
      [-58, 24.04, -58],
    ],
    [
      [-58, 24.04, -58],
      [-58, 24.04, -70],
    ],
    [
      [-58, 24.04, -58],
      [-58, 24.04, -48],
    ],
  ] as [ParishPoint, ParishPoint][]) {
    const dx = b[0] - a[0],
      dz = b[2] - a[2];
    box(
      [(a[0] + b[0]) / 2, 24.035, (a[2] + b[2]) / 2],
      [3.2, 0.03, Math.hypot(dx, dz)],
      m.paving,
      Math.atan2(dx, dz),
    );
  }
  for (let i = 0; i < 70; i++) {
    const x = -63 + (i % 10) * 2.1,
      z = -68 + Math.floor(i / 10) * 3.1;
    if (Math.abs(x + 58) < 3 || Math.hypot(x + 58, z + 58) < 6) continue;
    const grass = add(new THREE.ConeGeometry(0.3, 0.7 + (i % 4) * 0.1, 4), m.green, [x, 24.4, z]);
    grass.rotation.y = i * 1.7;
  }
  for (const x of [-62, -42])
    for (const z of [-66, -50]) cylinder([x, 27, z], 0.55, 6, m.trim, 8, 0.35);
  pointedArch([-52, 27, -66], 20, 5);
  pointedArch([-52, 27, -50], 20, 5);
  cylinder([-58, 25, -58], 1.8, 2, m.dark);
  cylinder([-58, 27.5, -58], 0.55, 3, m.blue, 8, 0.2);
  for (let i = 0; i < 9; i++)
    box([-63 + (i % 3) * 5, 24.5, -70 + Math.floor(i / 3) * 4], [1.2, 1, 2], m.trim);
  // The cyan memorial is an open garden sanctuary, not a lone glow marker.
  cylinder([-58, 32.9, -58], 5.1, 0.5, m.trim, 12);
  cylinder([-58, 34, -58], 5.5, 1.7, m.roof, 12, 2.7);
  cylinder([-58, 35, -58], 2.9, 0.4, m.gold, 12);
  cylinder([-58, 36, -58], 1.2, 1.6, m.blue, 8, 0.12);
  for (let i = 0; i < 6; i++) {
    const a = (i * Math.PI) / 3;
    cylinder([-58 + Math.cos(a) * 3.7, 32.5, -58 + Math.sin(a) * 3.7], 0.55, 0.4, m.gold, 8);
  }
  for (const z of [-54.3, -61.7]) pointedArch([-58, 27.5, z], 7.4, 5.5);
  for (const mesh of root.children.slice(gardenStart)) {
    mesh.position.x += CAPITAL_GARDEN_X;
    mesh.position.z += CAPITAL_GARDEN_Z;
  }
  for (const collider of colliders.slice(gardenColliderStart))
    for (let i = 0; i < collider.vertices.length; i += 3) {
      collider.vertices[i] += CAPITAL_GARDEN_X;
      collider.vertices[i + 2] += CAPITAL_GARDEN_Z;
    }
  // The right-hand retaining wedge and beacon tower dominate the side silhouette.
  for (const wedgeSpec of capitalRetainingWedges) {
    const extrudeWedge = (
      bottom: number,
      minZ: number,
      maxZ: number,
      high: number,
      low: number,
    ) => {
      const shape = new THREE.Shape();
      shape.moveTo(-minZ, bottom);
      shape.lineTo(-maxZ, bottom);
      shape.lineTo(-maxZ, low);
      shape.lineTo(-minZ, high);
      shape.closePath();
      const wedge = new THREE.ExtrudeGeometry(shape, {
        depth: wedgeSpec.maxX - wedgeSpec.minX,
        bevelEnabled: false,
      });
      wedge.rotateY(Math.PI / 2);
      wedge.translate(wedgeSpec.minX, 0, 0);
      add(wedge, m.dark);
      collision(wedge);
    };
    if ("arcade" in wedgeSpec && wedgeSpec.arcade) {
      const [floor, ceiling] = wedgeSpec.arcade;
      extrudeWedge(wedgeSpec.bottom, wedgeSpec.minZ, wedgeSpec.maxZ, floor, floor);
      const roofEnd =
        wedgeSpec.minZ +
        ((wedgeSpec.maxZ - wedgeSpec.minZ) * (wedgeSpec.high - ceiling)) /
          (wedgeSpec.high - wedgeSpec.low);
      if (wedgeSpec.high > ceiling)
        extrudeWedge(ceiling, wedgeSpec.minZ, roofEnd, wedgeSpec.high, ceiling);
    } else
      extrudeWedge(wedgeSpec.bottom, wedgeSpec.minZ, wedgeSpec.maxZ, wedgeSpec.high, wedgeSpec.low);
    for (const x of [wedgeSpec.minX, wedgeSpec.maxX]) {
      for (let i = 0; i < 6; i++) {
        const z = wedgeSpec.minZ + 1 + (i * (wedgeSpec.maxZ - wedgeSpec.minZ - 2)) / 5,
          height =
            wedgeSpec.high +
            ((wedgeSpec.low - wedgeSpec.high) * (z - wedgeSpec.minZ)) /
              (wedgeSpec.maxZ - wedgeSpec.minZ);
        box(
          [x, (wedgeSpec.arcade![0] + wedgeSpec.bottom) / 2, z],
          [1.8, wedgeSpec.arcade![0] - wedgeSpec.bottom, 2],
          m.stone,
        );
        if (height > wedgeSpec.arcade![1])
          box(
            [x, (height + wedgeSpec.arcade![1]) / 2, z],
            [1.8, height - wedgeSpec.arcade![1], 2],
            m.stone,
          );

        box([x, height + 0.25, z], [2.2, 0.5, 2.4], m.trim);
      }
    }
    for (
      let y = wedgeSpec.bottom + 1;
      y < Math.min(wedgeSpec.low, wedgeSpec.arcade?.[0] ?? 15);
      y += 8
    )
      box(
        [(wedgeSpec.minX + wedgeSpec.maxX) / 2, y, wedgeSpec.maxZ + 0.2],
        [8.2, 0.7, 1.5],
        m.trim,
      );
  }
  roof(43, 67, -28, 7, 7, 5);
  window([43, 28, -24.95], 1.7, 11);
  window([43, 51, -24.95], 1.7, 9);
  clockFace([43, 64, -24.95], 1.65);
  clockFace([46.05, 64, -28], 1.65, Math.PI / 2);
  pointedArch([43, 44, -24.9], 5, 9, 0, m.trim, 0.25);
  for (const i of [0, 5, 6]) {
    const a = (i * Math.PI) / 4,
      r = 4.3 * Math.cos(Math.PI / 8);
    pointedArch([-42 - Math.sin(a) * r, 24, -24 + Math.cos(a) * r], 3.3, 9, -a, m.trim, 0.23);
  }
  cylinder([-42, 52.5, -24], 5, 1, m.trim, 8);
  cylinder([-42, 58, -24], 5, 10, m.roof, 8, 0.1);
  window([-42, 43, -19.65], 1.8, 5);
  rose([-42, 51, -19.3], 1.2);
  for (const lift of capitalLifts)
    for (const side of [-1, 1]) {
      box(
        [lift.center[0] + side * 3.4, (lift.high + lift.low) / 2, lift.center[2]],
        [0.45, lift.high - lift.low + 8, 0.45],
        m.iron,
      );
      box([lift.center[0], lift.high + 5, lift.center[2]], [7, 0.6, 0.6], m.dark);
      cylinder(
        [lift.center[0] + side * 3.4, lift.high + 6, lift.center[2]],
        0.4,
        3,
        m.trim,
        8,
        0.1,
      );
    }
  // Handrails follow every turn of the beacon's descending walkway.
  const spiral = capitalRailSurfaces.filter((s) => s.id.startsWith("beacon-spiral:"));
  for (const [i, s] of spiral.entries()) {
    rail(s.vertices[0], s.vertices[3], 1.1, 0.3);
    if (i < spiral.length - 5) rail(s.vertices[1], s.vertices[2], 1.1, 0.3);
  }
  // Barrel vault and clustered piers match the enclosed final chamber.
  // The front lift bay is cut out of the roof for the moving platform.
  for (let i = 0; i < 32; i++) {
    const a = (i * Math.PI) / 32,
      b = ((i + 1) * Math.PI) / 32;
    for (let z = -32; z < 26; z += 2) {
      const end = Math.min(z + 2, 26);
      const x = (Math.cos(a) + Math.cos(b)) * 12;
      if (x > 10 && x < 18 && z >= 15 && z < 23) continue;
      const roofSurface: CapitalSurface = {
        id: `arena-vault:${i}:${z}`,
        area: "arena",
        layer: "lower",
        vertices: [
          [Math.cos(a) * 24, -12 + Math.sin(a) * 18, z],
          [Math.cos(a) * 24, -12 + Math.sin(a) * 18, end],
          [Math.cos(b) * 24, -12 + Math.sin(b) * 18, end],
          [Math.cos(b) * 24, -12 + Math.sin(b) * 18, z],
        ],
      };
      add(capitalSlabGeometry(roofSurface, 0.7), m.cavern);
    }
  }
  for (const z of [-25, -13, -1, 11, 23]) {
    const rib = new THREE.CurvePath<THREE.Vector3>();
    for (let i = 0; i < 24; i++) {
      const a = (i * Math.PI) / 24,
        b = ((i + 1) * Math.PI) / 24;
      rib.add(
        new THREE.LineCurve3(
          new THREE.Vector3(Math.cos(a) * 23.5, -12 + Math.sin(a) * 17.5, z),
          new THREE.Vector3(Math.cos(b) * 23.5, -12 + Math.sin(b) * 17.5, z),
        ),
      );
    }
    // The two forward ribs also stop around the open lift well.
    if (z < 15) add(new THREE.TubeGeometry(rib, 48, 0.35, 6, false), m.trim);
    for (const x of [-21, 21]) {
      cylinder([x, -3, z], 1.2, 18, m.dark, 12, 0.9);
      cylinder([x, -11.7, z], 1.6, 0.6, m.trim, 12);
      cylinder([x, 6, z], 1.6, 0.7, m.trim, 12);
      window([x > 0 ? 23.95 : -23.95, -7, z], 2.4, 8, ((x > 0 ? -1 : 1) * Math.PI) / 2, true);
    }
  }
  for (const x of [-10, 10]) window([x, -8, -31.9], 3.4, 14, 0, true);
  pointedArch([0, -12, 26], 10, 15, 0, m.trim, 0.45);
  // Embers and small lanterns are emissive geometry; the view assigns a bounded nearby light set.
  for (const s of capitalShrines) {
    cylinder([s.position[0], s.position[1] + 0.2, s.position[2]], 1, 0.4, m.dark, 12);
    cylinder([s.position[0], s.position[1] + 0.7, s.position[2]], 0.5, 0.8, m.blue, 8, 0.1);
  }
  for (const p of capitalLanterns) {
    cylinder([p[0], p[1] + 1, p[2]], 0.14, 2, m.iron, 6);
    cylinder([p[0], p[1] + 1.9, p[2]], 0.4, 0.2, m.gold, 8, 0.32);
    cylinder([p[0], p[1] + 2.3, p[2]], 0.23, 0.75, m.amber, 8, 0.06);
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI) / 3;
      const bar = box(
        [p[0] + Math.cos(a) * 0.35, p[1] + 2.35, p[2] + Math.sin(a) * 0.35],
        [0.07, 1, 0.07],
        m.gold,
      );
      bar.rotation.z = Math.cos(a) * -0.16;
      bar.rotation.x = Math.sin(a) * 0.16;
    }
    add(
      new THREE.TorusGeometry(0.4, 0.05, 5, 12),
      m.gold,
      [p[0], p[1] + 2.8, p[2]],
      [Math.PI / 2, 0, 0],
    );
  }
  // One craggy mountain carries the whole capital, as in the reference
  // overview. It is decorative, so it stays beneath every reachable surface.
  const ceiling = capitalCeiling(
    root.children.filter((o) => !(o instanceof THREE.Mesh && o.material === m.rock)),
    capitalRailSurfaces,
  );
  add(buildCapitalCrag(ceiling), m.rock).castShadow = false;
  // Giant swords stand point-down in the fog around the city, as in the
  // reference. They have no colliders, so each one needs open air from its
  // buried point to its leaning pommel: nothing reachable can pass through it.
  const sword = (x: number, y: number, z: number, yaw: number, lean: number, scale: number) => {
    const rotation: ParishPoint = [lean * 0.4, yaw, lean];
    const pommel = new THREE.Vector3(0, 27 * scale, 0)
      .applyEuler(new THREE.Euler(...rotation))
      .add(new THREE.Vector3(x, y, z));
    const reach = 4 * scale;
    if (ceiling(x, z, reach) !== Infinity || ceiling(pommel.x, pommel.z, reach) !== Infinity)
      return;
    const { blade, hilt } = giantSwordParts();
    for (const g of [blade, hilt]) g.scale(scale, scale, scale);
    add(blade, m.trim, [x, y, z], rotation);
    add(hilt, m.gold, [x, y, z], rotation);
  };
  for (let i = 0; i < 28; i++) {
    const a = i * 2.399963 + 0.4;
    // An inner ring frames the routes; the outer ring rises from deep fog.
    const inner = i < 12;
    const radius = inner ? 64 + (i % 3) * 7 : 92 + (i % 4) * 14;
    sword(
      Math.cos(a) * radius,
      inner ? -14 + (i % 3) * 5 : -30 + (i % 3) * 4,
      10 + Math.sin(a) * radius * 0.9,
      a * 1.7,
      ((i % 5) - 2) * 0.11,
      inner ? 1.1 + (i % 2) * 0.2 : 1.5 + (i % 3) * 0.25,
    );
  }
  addCapitalReferenceDetails(add, m, capitalRailSurfaces);
  const batching = batchStaticMeshes(root, 40);
  let disposed = false;
  return {
    root,
    colliders,
    solids: capitalSolids,
    fogReveal,
    // Lift decks share the amber checker of the door surrounds, as in the video.
    liftMaterial: m.portal,
    dispose() {
      if (disposed) return;
      disposed = true;
      batching.dispose();
      geometries.forEach((g) => g.dispose());
      Object.values(m).forEach((mat) => mat.dispose());
      textures.forEach((t) => t.dispose());
      root.clear();
    },
  };
}
