import { buildParishDressing } from "./parishDressing.ts";
import { createParishDoor, createParishPropTexture } from "./parishPropGeometry.ts";
import * as THREE from "three";
import {
  parishBuildings,
  parishTowerPiers,
  parishArchWalls,
  parishBoundaryColumns,
  parishColumnFootprints,
} from "./parishArchitecture.ts";
import { batchStaticMeshes } from "./batchStaticMeshes.ts";
import {
  parishTiles,
  parishWalls,
  parishProps,
  parishFloorHeight,
  parishTileHeight,
  type ParishPoint,
} from "./ashenParish.ts";

/** The complete replacement environment. Static geometry is authored at architectural scale. */
export function buildParishEnvironment(textured = true) {
  const root = new THREE.Group();
  root.name = "parish-concept-environment";
  const geometries = new Set<THREE.BufferGeometry>();
  const textures: THREE.Texture[] = [];
  const colliders: {
    vertices: Float32Array;
    indices: Uint32Array;
    position: ParishPoint;
    yaw: number;
  }[] = [];
  const solids: { position: ParishPoint; size: ParishPoint }[] = [];
  let seed = 7139;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const texture = (floor: boolean) => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 512;
    const c = canvas.getContext("2d")!;
    c.fillStyle = "#514a3d";
    c.fillRect(0, 0, 512, 512);
    const rows = floor ? 6 : 8;
    for (let row = 0; row < rows; row++)
      for (let col = -1; col < 5; col++) {
        const x = col * 128 + (row % 2 ? 64 : 0),
          y = (row * 512) / rows;
        const shade = 162 + random() * 35;
        c.fillStyle = `rgb(${shade + 6},${shade + 3},${shade - 2})`;
        c.fillRect(x + 2, y + 2, 124, 512 / rows - 4);
        c.strokeStyle = "#e5d5af55";
        c.strokeRect(x + 4, y + 4, 120, 512 / rows - 8);
        c.strokeStyle = "#50473244";
        if (random() < 0.45) {
          c.beginPath();
          c.moveTo(x + 7, y + 12);
          c.lineTo(x + 45, y + 30);
          c.lineTo(x + 52, y + 57);
          c.stroke();
        }
      }
    for (let i = 0; i < 45; i++) {
      const x = random() * 512,
        y = random() * 512;
      const stain = c.createRadialGradient(x, y, 1, x, y, 15 + random() * 30);
      stain.addColorStop(0, random() > 0.5 ? "#34443955" : "#50412d55");
      stain.addColorStop(1, "#34443900");
      c.fillStyle = stain;
      c.fillRect(x - 45, y - 45, 90, 90);
    }
    for (let i = 0; i < 22000; i++) {
      c.fillStyle = random() > 0.5 ? "#f3e5c421" : "#423d3033";
      c.fillRect(random() * 512, random() * 512, 1 + random() * 3, 1 + random() * 3);
    }
    const map = new THREE.CanvasTexture(canvas);
    map.colorSpace = THREE.SRGBColorSpace;
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    map.anisotropy = 4;
    textures.push(map);
    return map;
  };
  const stoneMap = textured ? texture(false) : null;
  const floorMap = textured ? texture(true) : null;
  const woodMap = textured ? createParishPropTexture("wood") : null;
  if (woodMap) textures.push(woodMap);
  const material = (color: string, map: THREE.Texture | null = null, extras = {}) =>
    new THREE.MeshStandardMaterial({
      color,
      map,
      bumpMap: map,
      bumpScale: 0.1,
      roughness: 0.93,
      ...extras,
    });
  const decalDepth = {
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  };
  const m = {
    stone: material("#b7b6aa", stoneMap),
    pale: material("#d2c8b3", stoneMap),
    pavingInlay: material("#d2c8b3", stoneMap, { ...decalDepth, depthWrite: false }),
    wornInlay: material("#707c76", stoneMap, { ...decalDepth, depthWrite: false }),
    dark: material("#707c76", stoneMap),
    soil: material("#4f493b"),
    floor: material("#b2b5a7", floorMap),
    crypt: material("#7b929c", stoneMap),
    trim: material("#c0baa6"),
    roof: material("#3b4643"),
    timber: material("#534333", woodMap, { bumpScale: 0.025 }),
    lightTimber: material("#735c43", woodMap, { bumpScale: 0.025 }),
    iron: material("#42403a", null, { metalness: 0.5 }),
    glass: material("#343d3f"),
    amberGlass: material("#876d45", null, {
      ...decalDepth,
      emissive: "#6f4523",
      emissiveIntensity: 0.12,
    }),
    wineGlass: material("#674a49", null, decalDepth),
    green: material("#4d5941"),
    rust: material("#9a683a"),
    cloth: material("#815539", null, { side: THREE.DoubleSide }),
    ember: material("#f3b15b", null, { emissive: "#ed6e22", emissiveIntensity: 3 }),
    mountain: material("#73818a"),
    blue: material("#9acee2", null, { emissive: "#62b5dc", emissiveIntensity: 2.5 }),
  };
  const materials = Object.values(m);
  const mesh = (
    geo: THREE.BufferGeometry,
    mat: THREE.Material,
    at: ParishPoint,
    rotation?: ParishPoint,
  ) => {
    geometries.add(geo);
    const object = new THREE.Mesh(geo, mat);
    object.position.set(...at);
    if (rotation) object.rotation.set(...rotation);
    object.castShadow = object.receiveShadow = true;
    root.add(object);
    return object;
  };
  const box = (
    at: ParishPoint,
    size: ParishPoint,
    mat = m.stone,
    rotation?: ParishPoint,
    shear?: { slope: number; alongX: boolean },
  ) => {
    const geo = new THREE.BoxGeometry(...size);
    const pos = geo.getAttribute("position"),
      normal = geo.getAttribute("normal"),
      uv = geo.getAttribute("uv");
    for (let i = 0; i < pos.count; i++) {
      if (shear)
        pos.setY(i, pos.getY(i) + shear.slope * (shear.alongX ? pos.getX(i) : pos.getZ(i)));
      const nx = Math.abs(normal.getX(i)),
        ny = Math.abs(normal.getY(i));
      uv.setXY(
        i,
        (nx > 0.5 ? pos.getZ(i) + at[2] : pos.getX(i) + at[0]) / 4,
        (ny > 0.5 ? pos.getZ(i) + at[2] : pos.getY(i) + at[1]) / 4,
      );
    }
    if (shear) geo.computeVertexNormals();
    return mesh(geo, mat, at, rotation);
  };
  const cylinder = (
    at: ParishPoint,
    top: number,
    bottom: number,
    height: number,
    mat = m.trim,
    sides = 10,
  ) => mesh(new THREE.CylinderGeometry(top, bottom, height, sides), mat, at);
  const archPath = (path: THREE.Path, width: number, height: number) => {
    const w = width / 2,
      spring = height * 0.64;
    path.moveTo(-w, 0);
    path.lineTo(-w, spring);
    path.quadraticCurveTo(-w, height * 0.88, 0, height);
    path.quadraticCurveTo(w, height * 0.88, w, spring);
    path.lineTo(w, 0);
    path.closePath();
  };
  const extrusion = (
    shape: THREE.Shape,
    depth: number,
    mat: THREE.Material,
    at: ParishPoint,
    yaw: number,
  ) => {
    const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 12 });
    g.translate(0, 0, -depth / 2);
    const uv = g.getAttribute("uv");
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 4, uv.getY(i) / 4);
    return mesh(g, mat, at, [0, yaw, 0]);
  };
  const archWall = (
    at: ParishPoint,
    width: number,
    height: number,
    opening: number,
    rise: number,
    depth = 1.2,
    yaw = 0,
    mat = m.stone,
  ) => {
    const shape = new THREE.Shape();
    // Extend the outer stone ends slightly into adjoining slabs. End faces at
    // exact tile boundaries otherwise overlap the slab/foundation side faces.
    const outerWidth = width + 0.08;
    shape.moveTo(-outerWidth / 2, 0);
    shape.lineTo(outerWidth / 2, 0);
    shape.lineTo(outerWidth / 2, height);
    shape.lineTo(-outerWidth / 2, height);
    shape.closePath();
    const hole = new THREE.Path();
    archPath(hole, opening, rise);
    shape.holes.push(hole);
    const wall = extrusion(shape, depth, mat, at, yaw);
    const positions = wall.geometry.getAttribute("position");
    // Seat the jambs into their footing/floor without closing the arch opening.
    // The footing cap stays below the visible paving rather than sharing its depth.
    for (let i = 0; i < positions.count; i++)
      if (Math.abs(positions.getY(i)) < 0.00001) positions.setY(i, -0.08);
    positions.needsUpdate = true;
    colliders.push({
      vertices: new Float32Array(positions.array),
      indices: wall.geometry.index
        ? new Uint32Array(wall.geometry.index.array)
        : Uint32Array.from({ length: positions.count }, (_, i) => i),
      position: at,
      yaw,
    });
  };
  const arch = (at: ParishPoint, width: number, height: number, yaw = 0, thickness = 0.45) => {
    const shape = new THREE.Shape();
    archPath(shape, width + thickness * 2, height + thickness);
    const hole = new THREE.Path();
    archPath(hole, width, height);
    shape.holes.push(hole);
    const frame = extrusion(shape, 0.65, m.trim, at, yaw);
    const positions = frame.geometry.getAttribute("position");
    for (let i = 0; i < positions.count; i++)
      if (Math.abs(positions.getY(i)) < 0.00001) positions.setY(i, -0.04);
  };
  const pillar = (x: number, y: number, z: number, height: number, radius = 0.48) => {
    box([x, y + 0.21, z], [radius * 2.6, 0.46, radius * 2.6], m.dark);
    cylinder([x, y + height / 2, z], radius * 0.85, radius, height, m.stone);
    cylinder([x, y + height - 0.3, z], radius * 1.3, radius * 0.85, 0.6, m.trim);
    box([x, y + height, z], [radius * 2.8, 0.25, radius * 2.8], m.trim);
  };
  const gable = (at: ParishPoint, w: number, d: number, h: number) => {
    const shape = new THREE.Shape();
    shape.moveTo(-w / 2, 0);
    shape.lineTo(w / 2, 0);
    shape.lineTo(0, h);
    shape.closePath();
    extrusion(shape, d, m.roof, at, 0);
    box([at[0], at[1] + 0.12, at[2]], [w + 0.5, 0.25, d + 0.5], m.dark);
    // Thin slate courses lie on the two sloping planes of the existing roof prism.
    const slope = (2 * h) / w,
      rows = Math.ceil(w / 2 / 1.05),
      columns = Math.ceil(d / 1.6),
      run = w / 2 / rows;
    for (const side of [-1, 1])
      for (let row = 0; row < rows; row++)
        for (let col = 0; col < columns; col++) {
          const x = side * (row + 0.5) * run;
          const slate = box(
            [
              at[0] + x,
              at[1] + h - Math.abs(x) * slope + 0.016,
              at[2] - d / 2 + ((col + 0.5) * d) / columns,
            ],
            [run * Math.hypot(1, slope) - 0.015, 0.05, d / columns - 0.025],
            (row + col) % 5 === 0 ? m.dark : m.roof,
            [0, 0, -side * Math.atan(slope)],
          );
          slate.name = "roof-slate-course";
        }
    box([at[0], at[1] + h, at[2]], [0.22, 0.15, d + 0.08], m.dark).name = "roof-ridge-cap";
  };
  // Entirely new terraced floor plan; foundations only below the lowest floor.
  for (const tile of parishTiles) {
    const slab = box(
      [tile.x, tile.y - 0.3 * Math.hypot(1, tile.slope, tile.slopeZ), tile.z],
      [8 * Math.hypot(1, tile.slope), 0.6, 8 * Math.hypot(1, tile.slopeZ)],
      tile.y < 0 ? m.crypt : m.floor,
      [-Math.atan(tile.slopeZ), 0, Math.atan(tile.slope)],
    );
    if (tile.slope || tile.slopeZ) {
      // Keep the walk surface unchanged and bevel the lower skirt inward.
      // Stacked ramps can share an exposed vertical end plane with a flat tile.
      const positions = slab.geometry.getAttribute("position");
      for (let i = 0; i < positions.count; i++)
        if (positions.getY(i) < 0) {
          if (tile.slope) positions.setZ(i, positions.getZ(i) * 0.995);
          if (tile.slopeZ) positions.setX(i, positions.getX(i) * 0.995);
        }
      slab.geometry.computeVertexNormals();
    }
    const underneath = parishTiles.some((t) => t.x === tile.x && t.z === tile.z && t.y < tile.y);
    if (!underneath && tile.area !== "aqueduct") {
      const top = tile.y - 0.6 * Math.hypot(1, tile.slope, tile.slopeZ);
      const foundation = box([tile.x, (top - 26) / 2, tile.z], [8, top + 26, 8], m.dark);
      const positions = foundation.geometry.getAttribute("position");
      for (let i = 0; i < positions.count; i++)
        if (positions.getY(i) > 0)
          positions.setY(
            i,
            positions.getY(i) + positions.getX(i) * tile.slope + positions.getZ(i) * tile.slopeZ,
          );
      foundation.geometry.computeVertexNormals();
      foundation.geometry.computeBoundingBox();
      foundation.geometry.computeBoundingSphere();
      foundation.name = "stair-and-terrace-foundation";
    }
    if (tile.area === "aqueduct" && (tile.slope || tile.slopeZ))
      for (const side of [-1, 1]) {
        const x = tile.x + (tile.slopeZ ? side * 3.35 : 0),
          z = tile.z + (tile.slope ? side * 3.35 : 0);
        const beam = box(
          [x, parishTileHeight(tile, x, z) - 0.7, z],
          tile.slope ? [8, 0.9, 0.9] : [0.9, 0.9, 8],
          m.stone,
          undefined,
          { alongX: !!tile.slope, slope: tile.slope || tile.slopeZ },
        );
        beam.name = "stair-edge-stringer";
      }
    if (tile.slope || tile.slopeZ)
      for (let i = 0; i < 16; i++) {
        const t = (i - 7.5) * 0.5;
        box(
          [
            tile.x + (tile.slope ? t : 0),
            tile.y + t * (tile.slope || tile.slopeZ) + 0.03,
            tile.z + (tile.slopeZ ? t : 0),
          ],
          tile.slope ? [0.08, 0.06, 7.95] : [7.95, 0.06, 0.08],
          m.trim,
        );
      }
  }
  // The tile at z=16 and vestibule tiles at z=24 already own the approach paving.
  // Fill the rest of the arena without laying a second slab over those surfaces.
  box([0, 11.2, -5.5], [46, 1.6, 35], m.floor);
  for (const side of [-1, 1]) {
    box([side * 13.5, 11.2, 16], [19, 1.6, 8], m.floor);
    box([side * 21.5, 11.2, 21.5], [3, 1.6, 3], m.floor);
  }
  for (const wall of parishWalls) {
    const h = parishBoundaryHeight(wall.area);
    // Where a lower stair and upper terrace share an edge, inset the lower
    // parapet's faces instead of drawing two differently textured skins together.
    const nested = parishWalls.some(
      (other) =>
        other.x === wall.x &&
        other.z === wall.z &&
        other.alongX === wall.alongX &&
        other.y > wall.y + 0.01,
    );
    const length = nested ? 7.96 : 8,
      thickness = nested ? 0.61 : 0.65;
    const body = box(
      [wall.x, wall.y + h / 2, wall.z],
      wall.alongX ? [length, h, thickness] : [thickness, h, length],
      wall.area === "crypt" ? m.crypt : m.stone,
      undefined,
      wall,
    );
    colliders.push({
      vertices: new Float32Array(body.geometry.getAttribute("position").array),
      indices: new Uint32Array(body.geometry.index!.array),
      position: body.position.toArray() as ParishPoint,
      yaw: 0,
    });
    box(
      [wall.x, wall.y + h, wall.z],
      wall.alongX ? [length + 0.04, 0.18, thickness + 0.2] : [thickness + 0.2, 0.18, length + 0.04],
      m.trim,
      undefined,
      wall,
    );
  }
  for (const w of parishArchWalls) {
    // Projecting wall faces must be seated on the cliff, not stop outside the floor slab.
    const corners = [-1, 1].flatMap((across) =>
      [-1, 1].map((depth) => {
        const a = (across * w.width) / 2,
          d = (depth * w.depth) / 2;
        return parishFloorHeight(
          w.position[0] + Math.cos(w.yaw) * a + Math.sin(w.yaw) * d,
          w.position[2] - Math.sin(w.yaw) * a + Math.cos(w.yaw) * d,
          w.position[1],
        );
      }),
    );
    if (corners.some((y) => y === null || Math.abs(y - w.position[1]) > 0.01)) {
      const height = w.position[1] + 26;
      const footing = box(
        [w.position[0], w.position[1] - height / 2 - 0.04, w.position[2]],
        [w.width - 0.04, height, w.depth + 0.2],
        w.crypt ? m.crypt : m.dark,
        [0, w.yaw, 0],
      );
      footing.name = "architecture-cliff-footing";
    }
    archWall(
      w.position,
      w.width,
      w.height,
      w.opening,
      w.rise,
      w.depth,
      w.yaw,
      w.crypt ? m.crypt : m.stone,
    );
    const offset = 0.5 * w.depth + 0.1;
    arch(
      [
        w.position[0] + Math.sin(w.yaw) * offset,
        w.position[1],
        w.position[2] + Math.cos(w.yaw) * offset,
      ],
      w.opening,
      w.rise,
      w.yaw,
      0.3,
    );
    // Articulated piers and capitals stay within each wall's solid side strips.
    const pierWidth = (w.width - w.opening) / 2;
    if (pierWidth > 0.45 && pierWidth < 4)
      for (const side of [-1, 1]) {
        const across = side * (w.opening / 2 + pierWidth / 2),
          front = w.depth / 2 - 0.035;
        const point = (height: number): ParishPoint => [
          w.position[0] + Math.cos(w.yaw) * across + Math.sin(w.yaw) * front,
          w.position[1] + height,
          w.position[2] - Math.sin(w.yaw) * across + Math.cos(w.yaw) * front,
        ];
        const height = Math.min(w.rise * 0.64, w.height);
        const mouldingWidth = Math.min(pierWidth, 1.8);
        box(
          point((height - 0.06) / 2),
          [mouldingWidth * 0.48, height + 0.06, 0.24],
          w.crypt ? m.crypt : m.pale,
          [0, w.yaw, 0],
        ).name = "arcade-attached-pilaster";
        for (const y of [0.18, height - 0.14])
          box(point(y), [mouldingWidth * 0.72, 0.28, 0.32], m.trim, [0, w.yaw, 0]);
      }
  }
  // The central court is open and monumental, with side gardens rather than corridors.
  for (const r of [6, 11, 16, 20])
    for (let sector = 0; sector < 16; sector++) {
      const inlay = mesh(
        new THREE.RingGeometry(
          r - 0.12,
          r + 0.12,
          8,
          1,
          (sector * Math.PI) / 8 + 0.003,
          Math.PI / 8 - 0.006,
        ),
        sector % 5 === 0 ? m.wornInlay : m.pavingInlay,
        [0, 6.008, 80],
        [-Math.PI / 2, 0, 0],
      );
      inlay.name = "court-stone-inlay";
      inlay.renderOrder = 1;
      inlay.castShadow = false;
    }
  for (const {
    position: [x, y, z],
    height,
    radius,
    vase,
  } of parishBoundaryColumns) {
    pillar(x, y, z, height, radius);
    if (vase) cylinder([x, y + height + 0.4, z], 0.65, 0.45, 0.65, m.dark);
  }
  solids.push(
    ...parishColumnFootprints.map((c) => ({
      position: [c.position[0], c.position[1] + c.size[1] / 2, c.position[2]] as ParishPoint,
      size: c.size,
    })),
  );
  // Foreground refuge: inward facing buildings, a tall broken chapel and cloth stalls.
  for (const {
    position: [x, y, z],
    size: [w, h, d],
  } of parishBuildings) {
    box([x, y + h / 2, z], [w, h, d], m.stone);
    solids.push({ position: [x, y + h / 2, z], size: [w, h, d] });
    gable([x, y + h, z], w + 1, d + 1, 3.5);
    // Foot course and corner quoins overlap the facade, never sit in front of it.
    box([x, y + 0.17, z - d / 2], [w + 0.06, 0.38, 0.26], m.dark);
    for (const side of [-1, 1])
      for (let course = 0; course < h / 0.7; course++)
        box(
          [x + side * (w / 2 - 0.22), y + course * 0.7 + 0.3, z - d / 2],
          [course % 2 ? 0.62 : 0.48, 0.56, 0.32],
          m.pale,
        ).name = "facade-quoin";
    box([x, y + h - 0.22, z - d / 2], [w + 0.08, 0.3, 0.3], m.timber);
    arch([x, y, z - d / 2 - 0.27], 2.4, 4, 0, 0.4);
    const door = createParishDoor({
      wood: m.timber,
      lightWood: m.lightTimber,
      iron: m.iron,
      recess: m.roof,
    });
    door.position.set(x, y, z - d / 2 - 0.38);
    door.traverse((o) => {
      if (o instanceof THREE.Mesh) geometries.add(o.geometry);
    });
    root.add(door);
    box([x, y + 0.045, z - d / 2 - 0.45], [2.4, 0.09, 0.65], m.trim);
    for (const wx of [-1, 1]) {
      const windowX = x + wx * w * 0.3,
        windowY = y + h * 0.7,
        front = z - d / 2;
      const panel = box([windowX, windowY, front - 0.04], [1.3, 1.6, 0.12], m.glass);
      panel.name = "house-window-panel";
      for (const side of [-1, 1]) {
        box([windowX + side * 0.7, windowY, front - 0.07], [0.14, 1.86, 0.18], m.trim);
        box([windowX, windowY + side * 0.86, front - 0.07], [1.54, 0.13, 0.18], m.trim);
      }
      box([windowX, windowY - 0.96, front - 0.2], [1.65, 0.13, 0.48], m.trim);
    }
  }
  archWall([10, 14, 142.9], 6, 6, 3, 4.5, 0.8);
  gable([10, 20, 142], 7, 4, 5);
  box([10, 23, 142], [0.2, 5, 0.2], m.trim);
  box([10, 24, 142], [2.5, 0.2, 0.2], m.trim);
  // Cathedral destination above the wide ceremonial stair, twelve metres above refuge.
  arch([0, 12, 27.7], 9, 13, 0, 0.8);
  arch([0, 12, 27.65], 10.9, 14.05, 0, 0.28);
  arch([0, 12, 27.6], 11.65, 14.5, 0, 0.22);
  for (const side of [-1, 1]) {
    for (const offset of [5.05, 5.7]) {
      const shaft = cylinder([side * offset, 16.6, 27.55], 0.17, 0.2, 9.2, m.pale, 10);
      shaft.name = "cathedral-portal-shaft";
      box([side * offset, 12.15, 27.55], [0.55, 0.3, 0.55], m.dark);
      box([side * offset, 21.25, 27.55], [0.55, 0.3, 0.55], m.trim);
    }
    // Blind lancets and sill courses give scale to the solid lower facade.
    for (const x of [12.8, 15.2]) {
      const panel = new THREE.Shape();
      archPath(panel, 1.75, 3.45);
      extrusion(panel, 0.08, m.dark, [side * x, 13.8, 27.39], 0).name = "cathedral-blind-lancet";
      arch([side * x, 13.8, 27.48], 1.65, 3.4, 0, 0.16);
    }
    for (const y of [18, 25.4, 36.7])
      box([side * 14, y, 27.4], [7.4, 0.24, 0.42], m.trim).name = "cathedral-string-course";
  }
  for (const side of [-1, 1]) {
    for (const x of [10, 19]) {
      box([side * x, 23, 28], [2.1, 22, 4.6], m.pale);
      solids.push({ position: [side * x, 23, 28], size: [2.1, 22, 4.6] });
      box([side * x, 34.5, 28], [3, 0.7, 5], m.trim);
      for (const y of [16, 23, 30])
        box([side * x, y, 30.25], [2.15, 0.28, 0.32], m.trim).name = "buttress-weathering-course";
    }
    box([side * 21, 28, 24], [6, 32, 7], m.stone);
    solids.push({ position: [side * 21, 28, 24], size: [6, 32, 7] });
    for (const edge of [-1, 1])
      for (let course = 0; course < 32; course++)
        box(
          [side * 21 + edge * 2.7, 12.42 + course, 27.5],
          [course % 2 ? 0.55 : 0.75, 0.82, 0.28],
          m.pale,
        ).name = "tower-corner-quoin";
    const towerLancet = new THREE.Shape();
    archPath(towerLancet, 2.35, 6.25);
    extrusion(towerLancet, 0.12, m.dark, [side * 21, 29.5, 27.51], 0);
    arch([side * 21, 29.5, 27.63], 2.25, 6.2, 0, 0.2);
    box([side * 21, 31.6, 27.57], [0.13, 4.2, 0.16], m.trim);
    archWall([side * 21, 38, 28], 6, 6, 3.8, 5, 0.9);
    gable([side * 21, 44, 24], 7.5, 8, 8);
    box([side * 21, 48, 24], [0.4, 10, 0.4], m.trim);
    box([side * 21, 50, 24], [3, 0.4, 0.4], m.trim);
    for (const y of [19, 27]) {
      const window = new THREE.Shape();
      // Glazing extends behind the reveal; its side faces must not coincide with it.
      archPath(window, 3.12, 5.86);
      extrusion(window, 0.08, m.glass, [side * 14, y, 27.41], 0);
      arch([side * 14, y, 27.7], 3, 5.8, 0, 0.3);
    }
  }
  gable([0, 37, 24], 31, 6, 10);
  const rose = mesh(new THREE.TorusGeometry(3.2, 0.3, 6, 32), m.trim, [0, 31, 27.7]);
  rose.name = "cathedral-rose-window";
  mesh(new THREE.CircleGeometry(3, 32), m.glass, [0, 31, 27.55]);
  for (let sector = 0; sector < 12; sector++)
    mesh(
      new THREE.RingGeometry(0.48, 2.94, 4, 1, (sector * Math.PI) / 6 + 0.018, Math.PI / 6 - 0.036),
      sector % 3 === 0 ? m.wineGlass : m.amberGlass,
      [0, 31, 27.56],
    ).name = "rose-stained-glass";
  for (let i = 0; i < 12; i++)
    box(
      [Math.sin((i * Math.PI) / 6) * 1.5, 31 + Math.cos((i * Math.PI) / 6) * 1.5, 27.8],
      [0.12, 3, 0.15],
      m.trim,
      [0, 0, (-i * Math.PI) / 6],
    );
  // Petal tracery shares the glazing plane; each loop meets the outer rose rim.
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    mesh(new THREE.TorusGeometry(0.88, 0.075, 4, 20), m.pale, [
      Math.sin(a) * 2.04,
      31 + Math.cos(a) * 2.04,
      27.62,
    ]).name = "rose-petal-tracery";
  }
  mesh(new THREE.TorusGeometry(0.48, 0.12, 5, 24), m.trim, [0, 31, 27.68]);
  for (const side of [-1, 1])
    for (const z of [-16, -8, 0, 8, 16]) {
      archWall([side * 23, 12, z], 8, 16, 3, 9, 1.2, Math.PI / 2, m.dark);
      pillar(side * 22.4, 12, z + 3.8, 18, 0.7);
    }
  box([0, 22, -23], [46, 20, 1.4], m.dark);
  for (const r of [7, 16, 21])
    mesh(new THREE.TorusGeometry(r, 0.08, 3, 96), m.trim, [0, 12.03, 0], [Math.PI / 2, 0, 0]);
  // Bell walk is a straight elevated arcade along the court's full east side.
  for (const {
    position: [x, y, z],
    size,
  } of parishTowerPiers) {
    box([x, y + size[1] / 2, z], size, m.pale);
    solids.push({ position: [x, y + size[1] / 2, z], size });
    box([x, 31, z], [2.5, 0.5, 2.5], m.trim);
  }
  for (const side of [-1, 1]) {
    archWall([48, 24, 48 + side * 5], 11, 7, 8, 5.5, 1, 0);
    archWall([48 + side * 5, 24, 48], 11, 7, 8, 5.5, 1, Math.PI / 2);
  }
  box([48, 31.7, 48], [12, 0.8, 12], m.trim);
  gable([48, 32, 48], 13, 13, 6);
  cylinder([48, 27, 48], 0.9, 1.6, 2.5, m.iron, 14);
  cylinder([48, 25.6, 48], 1.6, 1.8, 0.3, m.iron, 14);
  box([48, 30.8, 48], [9, 0.35, 0.45], m.timber);
  cylinder([48, 29.65, 48], 0.07, 0.07, 2.8, m.iron, 8);
  cylinder([48, 25.3, 48], 0.08, 0.13, 0.8, m.iron, 8);
  // The crypt is a broad chamber directly beneath the west terrace.
  for (const z of [116, 128, 140]) {
    arch([-56, -6, z], 24, 10, 0, 0.6);
    for (const x of [-68, -44]) arch([x, -6, z], 7, 8, Math.PI / 2, 0.4);
  }
  // Keep the crypt ceiling at 5.2m, but bury its top inside the terrace slab.
  // The paving owns the visible 6m surface; a second cap there fights its depth.
  box([-56, 5.5, 116], [39.92, 0.6, 15.92], m.dark).name = "crypt-ceiling";
  solids.push({ position: [-56, 5.5, 116], size: [39.92, 0.6, 15.92] });
  // West cloister and garden have a shared, spacious terrace.
  for (const side of [-1, 1]) box([-64 + side * 17, 15.8, 44], [5, 0.8, 32.16], m.roof);
  for (const x of [-72, -64, -56]) gable([x, 20, 28], 8, 3, 3);
  // The cloister's surviving side roofs show their ribbed construction.
  for (const side of [-1, 1])
    for (const z of [32, 40, 48, 56]) {
      box([-64 + side * 17, 15.28, z], [4.9, 0.26, 0.35], m.pale).name = "cloister-roof-rib";
      box([-64 + side * 17, 15.4, z + 3.8], [4.92, 0.28, 0.5], m.trim);
    }
  // Foundry is a distinct large building beyond the bell landing.
  gable([84, 26, 38], 34, 38, 7);
  box([95, 29, 25], [3, 30, 3], m.dark);
  solids.push({ position: [95, 29, 25], size: [3, 30, 3] });
  box([95, 44, 25], [4, 0.5, 4], m.trim);
  for (const y of [19, 25, 34, 40])
    box([95, y, 25], [3.3, 0.28, 3.3], m.iron).name = "foundry-chimney-band";
  for (const x of [76, 84, 92]) box([x, 19, 21], [3, 4, 0.1], m.ember);
  // Props occupy the new plan's spaces; all footprints are shared with simulation.
  for (const prop of parishProps) {
    const [x, y, z] = prop.position,
      [w, h, d] = prop.size;
    if (prop.kind === "supplies" || prop.kind === "tree" || prop.kind === "brazier") continue;
    if (prop.kind === "statue") {
      box([x, y + 0.5, z], [w, 1, d], m.dark);
      box([x, y + 1.1, z], [w * 1.1, 0.25, d * 1.1], m.trim);
      const robe = new THREE.LatheGeometry(
        [
          new THREE.Vector2(w * 0.26, 0),
          new THREE.Vector2(w * 0.28, h * 0.07),
          new THREE.Vector2(w * 0.21, h * 0.31),
          new THREE.Vector2(w * 0.15, h * 0.47),
          new THREE.Vector2(w * 0.21, h * 0.56),
          new THREE.Vector2(w * 0.12, h * 0.62),
        ],
        24,
      );
      const vertices = robe.getAttribute("position");
      for (let i = 0; i < vertices.count; i++) {
        const a = Math.atan2(vertices.getX(i), vertices.getZ(i)),
          fold = 1 + Math.cos(a * 12) * 0.045;
        vertices.setX(i, vertices.getX(i) * fold);
        vertices.setZ(i, vertices.getZ(i) * fold);
      }
      robe.computeVertexNormals();
      mesh(robe, m.pale, [x, y + 1.24, z]);
      const hood = mesh(new THREE.IcosahedronGeometry(w * 0.17, 2), m.pale, [x, y + h * 0.89, z]);
      hood.scale.set(1, 1.3, 0.9);
      mesh(new THREE.IcosahedronGeometry(w * 0.1, 1), m.dark, [x, y + h * 0.88, z + w * 0.12]);
      for (const side of [-1, 1]) {
        const arm = cylinder(
          [x + side * w * 0.21, y + h * 0.65, z + w * 0.07],
          w * 0.07,
          w * 0.1,
          h * 0.28,
          m.pale,
          10,
        );
        arm.rotation.z = side * 0.55;
        mesh(new THREE.IcosahedronGeometry(w * 0.065, 1), m.trim, [
          x + side * w * 0.27,
          y + h * 0.53,
          z + w * 0.1,
        ]);
      }
      box([x + w * 0.25, y + h * 0.55, z], [0.18, h * 0.7, 0.18], m.trim, [0, 0, 0.12]);
    } else if (prop.kind === "support") {
      const pier = box([x, y + h / 2, z], [w, h, d], m.stone);
      pier.name = "stair-support-pier";
      box([x, y + 0.14, z], [w + 0.06, 0.32, d + 0.06], m.dark);
    } else if (prop.kind === "column") pillar(x, y, z, h, w * 0.5);
    else if (prop.kind === "tomb") {
      box([x, y + h * 0.4, z], [w, h * 0.8, d], m.crypt);
      box([x, y + h * 0.88, z], [w + 0.2, h * 0.2, d + 0.2], m.trim);
      box([x, y + h, z], [w * 0.6, 0.1, 0.15], m.trim);
      box([x, y + h, z], [0.15, 0.1, d * 0.65], m.trim);
    } else if (prop.kind === "furnace") {
      box([x, y + h / 2, z], [w, h, d], m.dark);
      arch([x, y, z + d / 2 + 0.15], w * 0.6, h * 0.7);
      box([x, y + h * 0.35, z + d / 2 + 0.1], [w * 0.5, h * 0.5, 0.1], m.ember);
    } else if (prop.kind === "planter") {
      const curb = 0.35,
        wallHeight = h - 0.08;
      // A soil-filled masonry bed: retaining walls touch both the soil and the pavement.
      box([x, y + h * 0.34, z], [w - curb * 2, h * 0.68, d - curb * 2], m.soil).name =
        "garden-bed-soil";
      for (const side of [-1, 1]) {
        box(
          [x + (side * (w - curb)) / 2, y + wallHeight / 2, z],
          [curb, wallHeight, d],
          m.stone,
        ).name = "garden-bed-curb";
        box(
          [x, y + wallHeight / 2, z + (side * (d - curb)) / 2],
          [w - curb * 2, wallHeight, curb],
          m.stone,
        ).name = "garden-bed-curb";
        box([x + (side * (w - curb)) / 2, y + h - 0.08, z], [curb + 0.08, 0.16, d + 0.08], m.pale);
        box(
          [x, y + h - 0.08, z + (side * (d - curb)) / 2],
          [w - curb * 2 - 0.08, 0.16, curb + 0.08],
          m.pale,
        );
      }
    } else if (prop.kind === "pew") {
      for (const side of [-1, 1]) {
        box([x + side * w * 0.35, y + h * 0.34, z], [0.32, h * 0.68, d * 0.75], m.dark).name =
          "bench-grounded-leg";
        box([x + side * w * 0.35, y + h * 0.74, z + d * 0.35], [0.18, h * 0.52, 0.18], m.timber);
      }
      for (let plank = 0; plank < 3; plank++)
        box([x, y + h * 0.63, z + (plank - 1) * d * 0.23], [w, 0.16, d * 0.21], m.timber).name =
          "bench-seat-plank";
      box([x, y + h * 0.88, z + d * 0.35], [w, h * 0.24, 0.16], m.timber).name = "bench-backrest";
    } else if (prop.kind === "rubble") {
      // Each fallen block is seated individually; a low central heap fills the shared footprint.
      box([x, y + h * 0.18, z], [w * 0.85, h * 0.36, d * 0.85], m.dark);
      box([x, y + h * 0.4, z], [w * 0.55, h * 0.8, d * 0.55], m.stone);
      box([x, y + h * 0.9, z], [w * 0.6, h * 0.2, d * 0.5], m.pale, [0, 0.15, 0]);
      for (let i = 0; i < 9; i++) {
        const bw = w * (0.16 + random() * 0.15),
          bh = h * (0.3 + random() * 0.3),
          bd = d * (0.16 + random() * 0.15);
        const stone = box(
          [x + (random() - 0.5) * (w - bw), y + bh / 2, z + (random() - 0.5) * (d - bd)],
          [bw, bh, bd],
          i % 3 ? m.stone : m.dark,
        );
        stone.name = "fallen-masonry-block";
      }
    }
  }
  for (const wall of parishWalls)
    if (random() < 0.35) {
      const o = mesh(new THREE.DodecahedronGeometry(0.4, 0), m.dark, [
        wall.x,
        wall.y + 0.2,
        wall.z,
      ]);
      o.scale.set(1.5, 0.5, 1);
      o.rotation.y = random() * 6;
    }
  // Break the slab silhouette into weathered rock below the lowest exposed floor.
  for (const wall of parishWalls) {
    const beneath = parishTiles.filter(
      (t) => Math.abs(t.x - wall.x) <= 4.1 && Math.abs(t.z - wall.z) <= 4.1,
    );
    if (beneath.some((t) => t.y < wall.y - 0.1) || random() > 0.55) continue;
    const o = mesh(new THREE.IcosahedronGeometry(1, 0), m.mountain, [wall.x, wall.y - 12, wall.z]);
    o.scale.set(3 + random() * 3, 8 + random() * 3, 3 + random() * 3);
    o.rotation.y = random() * 6;
  }
  // Layered distant ridges replace the repeated cone silhouettes.
  for (let layer = 0; layer < 3; layer++) {
    const vertices: number[] = [];
    let lastHeight = 50;
    for (let i = 0; i < 18; i++) {
      const x = -560 + i * 64,
        z = -160 - layer * 105,
        h = 35 + random() * 90 + layer * 15;
      vertices.push(
        x,
        -100,
        z,
        x,
        lastHeight,
        z,
        x + 64,
        h,
        z,
        x,
        -100,
        z,
        x + 64,
        h,
        z,
        x + 64,
        -100,
        z,
      );
      lastHeight = h;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
    g.setAttribute(
      "uv",
      new THREE.Float32BufferAttribute(new Float32Array((vertices.length / 3) * 2), 2),
    );
    g.computeVertexNormals();
    mesh(g, m.mountain, [0, 0, 0]);
  }
  const dressing = buildParishDressing(textured);
  root.add(dressing.root);
  root.updateMatrixWorld(true);
  const batching = batchStaticMeshes(root);

  return {
    root,
    dressing,
    colliders,
    solids,
    dispose() {
      batching.dispose();
      dressing.dispose();
      geometries.forEach((g) => g.dispose());
      materials.forEach((mat) => mat.dispose());
      textures.forEach((t) => t.dispose());
    },
  };
}

export const parishBoundaryHeight = (_area: string) => 1.05;
