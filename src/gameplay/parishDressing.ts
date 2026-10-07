import * as THREE from "three";
import { parishSupplies, parishTreePlantings, type DressingPoint } from "./parishDressingPlan.ts";
import {
  parishWalls,
  parishTiles,
  parishProps,
  parishFloorHeight,
  parishBlocked,
} from "./ashenParish.ts";
import { parishArchWalls, parishBuildings } from "./parishArchitecture.ts";
import { detailFraction, type Detail } from "./graphicsSettings.ts";
import { createParishCanopy, createParishPropTexture } from "./parishPropGeometry.ts";

/** Dense edge dressing with shared geometry, spatially culled foliage and GPU wind. */
export function buildParishDressing(textured = true) {
  const root = new THREE.Group();
  root.name = "parish-lived-in-details";
  const geometries = new Set<THREE.BufferGeometry>(),
    materials = new Set<THREE.Material>(),
    textures: THREE.Texture[] = [];
  const time = { value: 0 },
    motion = { value: 1 };
  let seed = 92381;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const mat = (color: string, options: THREE.MeshStandardMaterialParameters = {}) => {
    const m = new THREE.MeshStandardMaterial({ color, roughness: 0.95, ...options });
    materials.add(m);
    return m;
  };
  const stone = mat("#8f9389"),
    pale = mat("#c4bda9"),
    wood = mat("#685443"),
    bark = mat("#51483c"),
    iron = mat("#3c4040", { metalness: 0.6 }),
    cloth = mat("#824f3e", { side: THREE.DoubleSide }),
    canopyCloth = mat("#965a40", { side: THREE.DoubleSide, roughness: 0.9 }),
    blueCloth = mat("#4a5c64", { side: THREE.DoubleSide }),
    candle = mat("#d4c6a0"),
    glow = mat("#ffc275", { emissive: "#ed831f", emissiveIntensity: 3 }),
    pot = mat("#806d55"),
    glass = mat("#d39b51", { emissive: "#cb772a", emissiveIntensity: 0.4 });
  const geo = <T extends THREE.BufferGeometry>(g: T) => {
    geometries.add(g);
    return g;
  };
  const cube = geo(new THREE.BoxGeometry(1, 1, 1)),
    cyl = geo(new THREE.CylinderGeometry(1, 1, 1, 8)),
    sphere = geo(new THREE.IcosahedronGeometry(1, 1));
  const mesh = (
    g: THREE.BufferGeometry,
    m: THREE.Material,
    p: DressingPoint,
    scale: DressingPoint = [1, 1, 1],
    rotation: DressingPoint = [0, 0, 0],
  ) => {
    const o = new THREE.Mesh(g, m);
    o.position.set(...p);
    o.scale.set(...scale);
    o.rotation.set(...rotation);
    o.castShadow = o.receiveShadow = true;
    root.add(o);
    return o;
  };
  const box = (p: DressingPoint, s: DressingPoint, m = stone, r: DressingPoint = [0, 0, 0]) =>
    mesh(cube, m, p, s, r);
  const segment = (a: DressingPoint, b: DressingPoint, r1: number, r2: number, m = bark) => {
    const start = new THREE.Vector3(...a),
      end = new THREE.Vector3(...b),
      delta = end.clone().sub(start);
    const g = geo(new THREE.CylinderGeometry(r2, r1, delta.length(), 7));
    const o = mesh(g, m, start.add(end).multiplyScalar(0.5).toArray() as DressingPoint);
    o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize());
    return o;
  };
  const wind = (m: THREE.MeshStandardMaterial, mode: "foliage" | "grass" | "cloth" | "canopy") => {
    m.onBeforeCompile = (shader) => {
      shader.uniforms.parishTime = time;
      shader.uniforms.parishMotion = motion;
      shader.vertexShader = `uniform float parishTime;uniform float parishMotion;\n${mode === "canopy" ? "attribute float parishClothWeight;\n" : ""}${shader.vertexShader}`;
      shader.vertexShader = shader.vertexShader.replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
     vec3 windAnchor=vec3(modelMatrix*vec4(position,1.0));
     ${mode === "foliage" || mode === "grass" ? "#ifdef USE_INSTANCING\nwindAnchor=vec3(modelMatrix*instanceMatrix*vec4(position,1.0));\n#endif" : ""}
     float gust=sin(parishTime*1.1+windAnchor.x*.22+windAnchor.z*.15);
     ${mode === "foliage" ? "transformed.x+=gust*.10*parishMotion;transformed.z+=sin(parishTime*.8+windAnchor.z*.4)*.06*parishMotion;" : mode === "grass" ? "float tip=clamp(position.y/.55,0.0,1.0);transformed.x+=gust*.10*tip*parishMotion;transformed.z+=sin(parishTime*.8+windAnchor.z*.4)*.06*tip*parishMotion;" : mode === "canopy" ? "transformed.y+=(gust*.07+sin(parishTime*2.0+position.x*3.0)*.025)*parishClothWeight*parishMotion;" : "float freeEdge=1.0-uv.y;transformed.z+=(gust*.15+sin(parishTime*2.0+position.x*3.0)*.045)*freeEdge*parishMotion;"}`,
      );
    };
    m.customProgramCacheKey = () => `parish-${mode}-wind-v1`;
  };
  wind(cloth, "cloth");
  wind(blueCloth, "cloth");
  wind(canopyCloth, "canopy");
  if (textured) {
    const map = createParishPropTexture("cloth");
    textures.push(map);
    cloth.map = blueCloth.map = canopyCloth.map = map;
    cloth.bumpMap = blueCloth.bumpMap = canopyCloth.bumpMap = map;
    cloth.bumpScale = blueCloth.bumpScale = canopyCloth.bumpScale = 0.008;
  }
  const leafTexture = () => {
    if (!textured) return null;
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const ctx = c.getContext("2d")!;
    for (let i = 0; i < 12; i++) {
      const x = 12 + random() * 104,
        y = 12 + random() * 104;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(random() * 6);
      ctx.fillStyle = "#e5e2cc";
      ctx.beginPath();
      ctx.ellipse(0, 0, 14 + random() * 10, 7 + random() * 5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    textures.push(t);
    return t;
  };
  const leaf = mat("#ffffff", {
    map: leafTexture(),
    alphaTest: 0.38,
    side: THREE.DoubleSide,
    vertexColors: false,
  });
  wind(leaf, "foliage");
  // Leaves growing on stone must not translate away from their attachment plane in wind.
  const ivy = mat("#ffffff", { map: leaf.map, alphaTest: 0.38, side: THREE.DoubleSide });
  const leafGeometry = geo(new THREE.PlaneGeometry(1, 1));
  const leaves = new Map<
    string,
    Array<{ p: DressingPoint; s: DressingPoint; yaw: number; roll: number; color: THREE.Color }>
  >();
  const addLeaf = (
    p: DressingPoint,
    s: DressingPoint,
    color: string,
    yaw = random() * Math.PI * 2,
    roll = (random() - 0.5) * 1.4,
    attached = false,
  ) => {
    const key = `${attached ? "wall" : "tree"}:${Math.floor(p[0] / 32)}:${Math.floor(p[2] / 32)}`;
    const bucket = leaves.get(key) ?? [];
    bucket.push({
      p,
      s,
      yaw,
      roll,
      color: new THREE.Color(color).multiplyScalar(0.8 + random() * 0.4),
    });
    leaves.set(key, bucket);
  };
  const crowns: Array<{ p: DressingPoint; s: DressingPoint; color: THREE.Color }> = [];
  const autumn = ["#a54b24", "#c47f31", "#d7a24a", "#87502b", "#617045"];
  // Low shrubs grow from the actual soil surface inside the authored masonry beds.
  for (const bed of parishProps.filter((p) => p.kind === "planter")) {
    const [x, y, z] = bed.position,
      [w, h, d] = bed.size;
    for (let i = 0; i < 12; i++) {
      const sx = x + (random() - 0.5) * (w - 1.3),
        sz = z + (random() - 0.5) * (d - 1.3),
        base = y + h * 0.68,
        height = 0.4 + random() * 0.55;
      segment([sx, base, sz], [sx, base + height, sz], 0.035, 0.01).name = "garden-shrub-stem";
      for (let j = 0; j < 12; j++) {
        const angle = j * 2.399,
          reach = 0.1 + random() * 0.24;
        addLeaf(
          [
            sx + Math.sin(angle) * reach,
            base + height * (0.35 + j / 18),
            sz + Math.cos(angle) * reach,
          ],
          [0.45, 0.32, 1],
          j % 4 === 0 ? "#a88946" : "#66764a",
          angle,
        );
      }
    }
  }
  for (const planting of parishTreePlantings) {
    const [x, y, z] = planting.position,
      h = planting.height,
      lean = (random() - 0.5) * 0.8;
    const trunk = segment([x, y, z], [x + lean, y + h * 0.68, z + 0.3], 0.34, 0.09);
    trunk.name = "tree-trunk";
    const branches = planting.autumn ? 11 : 8;
    for (let i = 0; i < branches; i++) {
      const a = i * 2.399,
        reach = planting.autumn ? 2.3 + random() * 2 : 1.3 * (1 - i / branches) + 0.4;
      const attachment = (0.4 + (i / branches) * 0.25) / 0.68;
      const start: DressingPoint = [
        x + lean * attachment,
        y + h * 0.68 * attachment,
        z + 0.3 * attachment,
      ];
      const end: DressingPoint = [
        x + Math.sin(a) * reach,
        y + h * (0.63 + (i / branches) * 0.26),
        z + Math.cos(a) * reach,
      ];
      segment(start, end, 0.1, 0.025).name = "tree-branch";
      crowns.push({
        p: end,
        s: planting.autumn ? [1.55, 0.85, 1.6] : [0.65, 0.9, 0.65],
        color: new THREE.Color(planting.autumn ? autumn[i % autumn.length] : "#526445"),
      });
      for (let j = 0; j < (planting.autumn ? 38 : 30); j++) {
        const angle = random() * Math.PI * 2,
          r = Math.sqrt(random()) * (planting.autumn ? 2 : 1.1),
          w = 0.7 + random() * 0.8;
        addLeaf(
          [
            end[0] + Math.sin(angle) * r,
            end[1] + (random() - 0.4) * 1.8,
            end[2] + Math.cos(angle) * r,
          ],
          [w, w * 0.8, 1],
          planting.autumn ? autumn[(i + j) % autumn.length] : j % 3 ? "#455a39" : "#6c7949",
        );
      }
    }
  }
  // Ivy stays on masonry piers and wall edges, away from doorway openings.
  for (const w of parishArchWalls) {
    if (w.position[1] < 0 || random() > 0.7) continue;
    for (const side of [-1, 1]) {
      const height = Math.min(w.height, 8 + random() * 5);
      for (let i = 0; i < height * 10; i++) {
        const size = 0.35 + random() * 0.65;
        // Spread along the wall, never along its normal; stay within the narrow solid pier.
        const solidPier = (w.width - w.opening) / 2;
        const a = side * (w.width / 2 - solidPier * (0.2 + random() * 0.6));
        const normal = w.depth / 2 + 0.008;
        addLeaf(
          [
            w.position[0] + Math.cos(w.yaw) * a + Math.sin(w.yaw) * normal,
            w.position[1] + random() * height,
            w.position[2] - Math.sin(w.yaw) * a + Math.cos(w.yaw) * normal,
          ],
          [Math.min(size, solidPier * 0.55), size, 1],
          random() > 0.5 ? "#52633d" : "#6e7545",
          w.yaw,
          0,
          true,
        );
      }
    }
  }
  for (const wall of parishWalls) {
    if (wall.y < 0 || random() > 0.28) continue;
    for (let i = 0; i < 20; i++) {
      const p: DressingPoint = [
        wall.x + (wall.alongX ? (random() - 0.5) * 7 : 0.333),
        wall.y + 0.15 + random() * 0.8,
        wall.z + (wall.alongX ? 0.333 : (random() - 0.5) * 7),
      ];
      p[1] += wall.slope * (wall.alongX ? p[0] - wall.x : p[2] - wall.z);
      addLeaf(p, [0.5, 0.5, 1], "#6c7746", wall.alongX ? 0 : Math.PI / 2, 0, true);
    }
  }
  const dummy = new THREE.Object3D();
  const crownMaterial = mat("#ffffff");
  wind(crownMaterial, "foliage");
  const crownGeometry = geo(new THREE.SphereGeometry(1, 7, 5));
  const crownBuckets = new Map<string, typeof crowns>();
  for (const crown of crowns) {
    const key = `${Math.floor(crown.p[0] / 32)}:${Math.floor(crown.p[2] / 32)}`;
    const b = crownBuckets.get(key) ?? [];
    b.push(crown);
    crownBuckets.set(key, b);
  }
  for (const [key, list] of crownBuckets) {
    const o = new THREE.InstancedMesh(crownGeometry, crownMaterial, list.length);
    o.name = `tree-crowns:${key}`;
    list.forEach((v, i) => {
      dummy.position.set(...v.p);
      dummy.rotation.set(0, i * 2.399, 0);
      dummy.scale.set(...v.s);
      dummy.updateMatrix();
      o.setMatrixAt(i, dummy.matrix);
      o.setColorAt(i, v.color);
    });
    o.castShadow = o.receiveShadow = true;
    o.computeBoundingSphere();
    root.add(o);
  }
  for (const [key, plants] of leaves) {
    const instances = new THREE.InstancedMesh(
      leafGeometry,
      key.startsWith("wall:") ? ivy : leaf,
      plants.length,
    );
    instances.name = `foliage:${key}`;
    plants.forEach((v, i) => {
      dummy.position.set(...v.p);
      dummy.rotation.set(0, v.yaw, v.roll);
      dummy.scale.set(...v.s);
      dummy.updateMatrix();
      instances.setMatrixAt(i, dummy.matrix);
      instances.setColorAt(i, v.color);
    });
    instances.instanceMatrix.needsUpdate = true;
    instances.castShadow = false;
    instances.receiveShadow = true;
    instances.computeBoundingBox();
    instances.computeBoundingSphere();
    root.add(instances);
  }
  // Moss, weeds and fallen leaves gather around cover and the perimeter.
  const blade = geo(new THREE.BufferGeometry());
  blade.setAttribute(
    "position",
    new THREE.Float32BufferAttribute([-0.06, 0, 0, 0.06, 0, 0, 0.1, 0.55, 0], 3),
  );
  blade.computeVertexNormals();
  const grass = mat("#7b8253", { side: THREE.DoubleSide });
  wind(grass, "grass");
  const tufts: Array<{ p: DressingPoint; s: DressingPoint; angle: number }> = [];
  for (const tile of parishTiles) {
    if (
      tile.slope ||
      tile.slopeZ ||
      tile.y < 0 ||
      tile.area === "aqueduct" ||
      tile.area === "belfry"
    )
      continue;
    const edge = parishWalls.some((w) => Math.abs(w.x - tile.x) < 5 && Math.abs(w.z - tile.z) < 5);
    if (!edge && random() > 0.13) continue;
    for (let i = 0; i < (edge ? 12 : 3); i++) {
      const x = tile.x + (random() - 0.5) * 7.5,
        z = tile.z + (random() - 0.5) * 7.5;
      if (parishBlocked(x, tile.y, z, 0.2)) continue;
      for (let j = 0; j < 4; j++)
        tufts.push({
          p: [x + random() * 0.25, tile.y + 0.02, z + random() * 0.25],
          s: [0.6 + random(), 0.4 + random() * 0.6, 1],
          angle: random() * 6,
        });
    }
  }
  // Understory forms patches under trees rather than isolated blades across the plaza.
  for (const tree of parishTreePlantings)
    for (let i = 0; i < 36; i++) {
      const a = random() * Math.PI * 2,
        r = 0.7 + Math.sqrt(random()) * 3.2,
        x = tree.position[0] + Math.sin(a) * r,
        z = tree.position[2] + Math.cos(a) * r,
        y = parishFloorHeight(x, z, tree.position[1]);
      if (y === null || Math.abs(y - tree.position[1]) > 0.1 || parishBlocked(x, y, z, 0.15))
        continue;
      for (let j = 0; j < 5; j++)
        tufts.push({
          p: [x + random() * 0.3, y + 0.02, z + random() * 0.3],
          s: [0.7 + random(), 0.55 + random() * 0.7, 1],
          angle: random() * Math.PI * 2,
        });
    }
  const grassBuckets = new Map<string, typeof tufts>();
  for (const t of tufts) {
    const floor = parishFloorHeight(t.p[0], t.p[2], t.p[1]);
    if (floor === null || Math.abs(t.p[1] - floor) > 0.05) continue;
    const key = `${Math.floor(t.p[0] / 32)}:${Math.floor(t.p[2] / 32)}`;
    const b = grassBuckets.get(key) ?? [];
    b.push(t);
    grassBuckets.set(key, b);
  }
  for (const [key, list] of grassBuckets) {
    const o = new THREE.InstancedMesh(blade, grass, list.length);
    o.name = `weeds:${key}`;
    list.forEach((t, i) => {
      dummy.position.set(...t.p);
      dummy.rotation.set(0, t.angle, 0);
      dummy.scale.set(...t.s);
      dummy.updateMatrix();
      o.setMatrixAt(i, dummy.matrix);
    });
    o.computeBoundingBox();
    o.computeBoundingSphere();
    o.receiveShadow = true;
    root.add(o);
  }
  const fallenGeometry = geo(new THREE.PlaneGeometry(0.13, 0.21));
  const fallen = mat("#af7439", { side: THREE.DoubleSide });
  for (const tree of parishTreePlantings.filter((t) => t.autumn)) {
    const o = new THREE.InstancedMesh(fallenGeometry, fallen, 150);
    o.name = "fallen-leaves";
    let count = 0;
    for (let i = 0; i < 150; i++) {
      const a = random() * 6.28,
        r = 1 + Math.sqrt(random()) * 4.2,
        x = tree.position[0] + Math.sin(a) * r,
        z = tree.position[2] + Math.cos(a) * r,
        y = parishFloorHeight(x, z, tree.position[1]);
      if (y === null || Math.abs(y - tree.position[1]) > 0.1) continue;
      dummy.position.set(x, y + 0.035, z);
      dummy.rotation.set(-Math.PI / 2, 0, a);
      dummy.scale.setScalar(0.7 + random());
      dummy.updateMatrix();
      o.setMatrixAt(count++, dummy.matrix);
    }
    o.count = count;
    o.computeBoundingSphere();
    o.receiveShadow = true;
    root.add(o);
  }
  let mossMap: THREE.Texture | null = null;
  if (textured) {
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const ctx = c.getContext("2d")!;
    const fill = ctx.createRadialGradient(64, 64, 10, 64, 64, 64);
    fill.addColorStop(0, "#778447bf");
    fill.addColorStop(0.7, "#6c774955");
    fill.addColorStop(1, "#6c774900");
    ctx.fillStyle = fill;
    ctx.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 180; i++) {
      ctx.fillStyle = "#46533d33";
      ctx.fillRect(random() * 128, random() * 128, 2, 2);
    }
    mossMap = new THREE.CanvasTexture(c);
    mossMap.colorSpace = THREE.SRGBColorSpace;
    textures.push(mossMap);
  }
  const moss = mat("#8b9469", {
    map: mossMap,
    transparent: true,
    opacity: 0.6,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
    forceSinglePass: true,
    side: THREE.DoubleSide,
  });
  const mossPatch = (x: number, y: number, z: number, width: number, depth: number) => {
    // Clip triangles to the supporting floor instead of projecting a rectangle over the void.
    const geometry = geo(new THREE.PlaneGeometry(width, depth, 12, 12));
    geometry.rotateX(-Math.PI / 2);
    const positions = geometry.getAttribute("position"),
      valid: boolean[] = [];
    for (let i = 0; i < positions.count; i++) {
      const floor = parishFloorHeight(x + positions.getX(i), z + positions.getZ(i), y);
      valid.push(floor !== null && Math.abs(floor - y) < 0.1);
      positions.setY(i, floor === null ? 0 : floor - y + 0.015);
    }
    const indices = geometry.index!.array,
      clipped: number[] = [];
    for (let i = 0; i < indices.length; i += 3)
      if (valid[indices[i]] && valid[indices[i + 1]] && valid[indices[i + 2]])
        clipped.push(indices[i], indices[i + 1], indices[i + 2]);
    geometry.setIndex(clipped);
    geometry.computeVertexNormals();
    const patch = mesh(geometry, moss, [x, y, z]);
    patch.name = "ground-moss";
    patch.castShadow = false;
  };
  for (const prop of parishProps.filter(
    (p) => p.kind === "tomb" || p.kind === "planter" || p.kind === "rubble",
  )) {
    const [x, y, z] = prop.position;
    mossPatch(x, y, z, prop.size[0] + 1.5, prop.size[2] + 1.5);
  }
  for (const tree of parishTreePlantings) {
    const [x, y, z] = tree.position;
    mossPatch(x, y, z, 7, 7);
  }
  // Refuge and foundry supplies use the same solid footprints as navigation.
  const crate = (x: number, y: number, z: number, w: number, h: number, d: number) => {
    box([x, y + h / 2, z], [w, h, d], wood);
    for (const side of [-1, 1]) {
      box([x + side * w * 0.4, y + h / 2, z + d / 2 + 0.015], [0.07, h, 0.04], iron);
      box([x, y + h * 0.2, z + (side * d) / 2], [w, 0.08, 0.06], iron);
    }
    box([x, y + h / 2, z + d / 2 + 0.04], [0.08, Math.hypot(w, h) * 0.85, 0.05], bark, [
      0,
      0,
      -Math.atan(w / h),
    ]);
  };
  const barrel = (x: number, y: number, z: number, h = 1.3) => {
    const g = geo(new THREE.CylinderGeometry(0.4, 0.38, h, 12));
    mesh(g, wood, [x, y + h / 2, z]);
    for (const t of [0.15, 0.5, 0.86])
      mesh(
        geo(new THREE.TorusGeometry(0.41, 0.035, 4, 12)),
        iron,
        [x, y + h * t, z],
        [1, 1, 1],
        [Math.PI / 2, 0, 0],
      );
  };
  for (const {
    kind,
    position: [x, y, z],
    size: [w, h, d],
  } of parishSupplies) {
    if (kind === "crates") {
      crate(x - w * 0.2, y, z, w * 0.55, h * 0.65, d * 0.8);
      crate(x + w * 0.24, y, z + 0.15, w * 0.4, h * 0.5, d * 0.7);
      crate(x - w * 0.18, y + h * 0.65, z, w * 0.42, h * 0.35, d * 0.6);
    } else if (kind === "barrels") {
      barrel(x - 0.6, y, z, h);
      barrel(x + 0.6, y, z + 0.1, h * 0.85);
    } else if (kind === "urns") {
      for (const s of [-1, 1]) {
        mesh(
          geo(new THREE.SphereGeometry(0.4, 10, 6)),
          pot,
          [x + s * 0.5, y + 0.65, z],
          [1, 1.5, 1],
        );
        mesh(geo(new THREE.CylinderGeometry(0.2, 0.29, 0.25, 10)), pot, [x + s * 0.5, y + 1.28, z]);
      }
    } else {
      box([x, y + 0.75, z], [w, 0.15, d * 0.8], wood);
      for (const side of [-1, 1])
        box([x + side * w * 0.4, y + 0.35, z], [0.14, 0.7, d * 0.7], bark);
      if (kind === "bench") box([x, y + 1, z + 0.4], [w, 0.4, 0.1], wood);
      if (kind === "cart")
        for (const side of [-1, 1])
          mesh(
            geo(new THREE.TorusGeometry(0.45, 0.08, 6, 12)),
            wood,
            [x + side * w * 0.5, y + 0.45, z],
            [1, 1, 1],
            [0, Math.PI / 2, 0],
          );
      if (kind === "workbench") {
        box([x - 0.6, y + 1.1, z], [0.6, 0.55, 0.4], iron);
        box([x + 0.5, y + 0.86, z], [0.8, 0.09, 0.5], pale);
      }
    }
  }
  // Cloth stalls and heraldic banners make the refuge and high walk identifiable.
  const canopy = createParishCanopy({ wood, iron, cloth: canopyCloth });
  canopy.traverse((o) => {
    if (o instanceof THREE.Mesh) geometries.add(o.geometry);
  });
  root.add(canopy);
  for (const [x, y, z, w, h, blue] of [
    [18, 8.4, 138.5, 3, 4, 0],
    [43.6, 24, 68, 2.2, 5, 1],
    [52.4, 24, 84, 2.2, 5, 0],
    [-14, 31, 28, 2.3, 5, 1],
    [14, 31, 28, 2.3, 5, 0],
  ]) {
    const g = geo(new THREE.PlaneGeometry(w, h, 8, 10));
    const p = g.getAttribute("position");
    const uv = g.getAttribute("uv");
    for (let i = 0; i < p.count; i++)
      p.setZ(i, Math.sin(p.getX(i) * 2.4) * 0.12 * (1 - uv.getY(i)));
    const o = mesh(g, blue ? blueCloth : cloth, [x, y + 0.1 - h / 2, z]);
    o.name = "hanging-banner";
    o.castShadow = false;
    box([x, y + 0.1, z], [w + 0.4, 0.08, 0.12], iron);
    if (x > 40 && x < 55) {
      const base = 15.1;
      mesh(cyl, iron, [x, (base + y + 0.3) / 2, z], [0.075, y + 0.3 - base, 0.075]);
      box([x, base, z], [0.3, 0.25, 0.3], iron);
    } else {
      const face =
        x === 18 ? parishBuildings[1].position[2] - parishBuildings[1].size[2] / 2 : 27.4;
      const bracket = box(
        [x, y + 0.1, (z + face) / 2],
        [0.15, 0.15, Math.abs(z - face) + 0.12],
        iron,
      );
      bracket.name = "wall-banner-bracket";
      box([x, y + 0.1, face], [0.26, 0.3, 0.12], iron);
    }
  }
  // Niches, carved courses, finials and broken masonry break the clean block silhouettes.
  for (const side of [-1, 1]) {
    for (const level of [18, 26, 36]) box([side * 21, level, 28], [6.7, 0.22, 1], pale);
    for (const x of [10, 19])
      for (const level of [20, 28, 34.65]) box([side * x, level, 30.4], [2.4, 0.16, 0.7], pale);
    for (const x of [10, 19]) {
      // Buttress cap top is 34.5 + 0.7/2; both pieces share that support height.
      const base = 34.85;
      const pedestal = box([side * x, base + 0.3, 28], [1.1, 0.6, 1.1], stone);
      pedestal.name = "buttress-finial-pedestal";
      const finial = mesh(geo(new THREE.ConeGeometry(0.55, 3, 6)), pale, [
        side * x,
        base + 2.1,
        28,
      ]);
      finial.name = "buttress-finial";
    }
  }
  for (const w of parishArchWalls.filter((w) => w.height > 9 && w.position[1] >= 0)) {
    const across = w.width / 2 - 0.6;
    for (const side of [-1, 1])
      for (let i = 0; i < 3; i++) {
        const a = side * across,
          x = w.position[0] + Math.cos(w.yaw) * a,
          z = w.position[2] - Math.sin(w.yaw) * a;
        box(
          [x, w.position[1] + w.height + 0.15 + i * 0.34, z],
          [0.9 - i * 0.17, 0.35, 0.9 - i * 0.17],
          pale,
        );
      }
  }
  // Grave markers and candle clusters remain inside existing cover footprints.
  for (const prop of parishProps) {
    const [x, y, z] = prop.position,
      [w, h, d] = prop.size;
    if (prop.kind === "tomb") {
      box([x, y + h * 0.98 + 0.4, z - d * 0.3], [0.16, 0.8, 0.18], pale);
      box([x, y + h * 0.98 + 0.55, z - d * 0.3], [0.65, 0.13, 0.18], pale);
    }
    if (prop.kind === "statue" || prop.kind === "tomb")
      for (let i = 0; i < 3; i++) {
        const supportY = y + (prop.kind === "statue" ? 1.225 : h * 0.98);
        const cx = x - w * 0.35 + i * 0.24,
          cz = z + d * 0.35,
          ch = 0.18 + random() * 0.25;
        mesh(cyl, candle, [cx, supportY + ch / 2, cz], [0.055, ch, 0.055]);
        mesh(sphere, glow, [cx, supportY + ch + 0.045, cz], [0.03, 0.065, 0.03]);
      }
  }
  // Pots and lanterns stay against the houses, within their existing solid bounds.
  for (const {
    position: [houseX, base, houseZ],
    size: [width, , depth],
  } of parishBuildings) {
    const x = houseX + width * 0.33,
      face = houseZ - depth / 2,
      z = face - 0.5;
    const plate = box([x, base + 2.85, face - 0.025], [0.2, 0.32, 0.08], iron);
    plate.name = "lantern-wall-plate";
    box([x, base + 2.99, face - 0.25], [0.08, 0.08, 0.6], iron);
    segment([x, base + 2.82, face - 0.035], [x, base + 2.97, z], 0.025, 0.025, iron);
    mesh(geo(new THREE.TorusGeometry(0.08, 0.015, 4, 8)), iron, [x, base + 2.86, z]);
    box([x, base + 2.74, z], [0.45, 0.08, 0.32], iron);
    box([x, base + 2.46, z], [0.35, 0.5, 0.25], glass);
    box([x, base + 2.195, z], [0.43, 0.045, 0.3], iron);
    for (const side of [-1, 1]) box([x + side * 0.175, base + 2.46, z], [0.035, 0.53, 0.29], iron);
  }
  // Edge rubble is clustered beside the walls, not distributed over combat lanes.
  for (const w of parishWalls) {
    if (random() > 0.32) continue;
    for (let i = 0; i < 4; i++) {
      const s = 0.14 + random() * 0.28;
      const o = mesh(
        sphere,
        stone,
        [
          w.x + (w.alongX ? (random() - 0.5) * 7 : 0),
          w.y + s * 0.4,
          w.z + (w.alongX ? 0 : (random() - 0.5) * 7),
        ],
        [s * 1.5, s * 0.7, s],
      );
      o.name = "edge-rubble";
      o.userData.boundary = w;
      o.position.y += w.slope * (w.alongX ? o.position.x - w.x : o.position.z - w.z);
      o.rotation.set(random(), random() * 6, random());
      o.castShadow = false;
    }
  }
  const detailMeshes: Array<{ mesh: THREE.InstancedMesh; count: number }> = [];
  root.traverse((o) => {
    if (o instanceof THREE.InstancedMesh && /^(foliage:|weeds:|fallen-leaves)/.test(o.name))
      detailMeshes.push({ mesh: o, count: o.count });
  });
  return {
    root,
    time,
    motion,
    setDetail(detail: Detail) {
      for (const item of detailMeshes)
        item.mesh.count = Math.floor(item.count * detailFraction[detail]);
    },
    dispose() {
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
      textures.forEach((t) => t.dispose());
    },
  };
}
