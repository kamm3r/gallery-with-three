import * as THREE from "three";
import { capitalStatueTexture } from "./capitalStatues.ts";
import { capitalCeiling, buildCapitalMountain, buildCapitalPlain } from "./capitalCrag.ts";
import {
  capitalKitGeometry,
  capitalKitLeaves,
  capitalKitPanel,
  capitalKitUv,
} from "./capitalBuildingKit.ts";
import {
  applyCapitalRockRelief,
  capitalSurfaceTextures,
  ps2SurfaceTexture,
  type CapitalSurfaceKind,
} from "./capitalMaterials.ts";
import { batchStaticMeshes } from "./batchStaticMeshes.ts";
import { sealCapitalSeams } from "./capitalSeams.ts";
import type { CapitalMaterial } from "./capitalKitLevel.ts";
import {
  capitalLevel,
  capitalSolids,
  capitalSurfaces,
  capitalLanterns,
  capitalShrines,
} from "./capitalLayout.ts";
import type { ParishPoint } from "./ashenParish.ts";
import { CAPITAL_INTERIORS } from "./capitalDistricts.ts";

/**
 * Renders the authored capital: every kit piece, every visible kit floor panel and the
 * masonry masses, with one merged floor collider. A stepped rock crag fills the
 * mountain beneath the districts without touching any route.
 */
export function buildCapitalEnvironment(textured = true) {
  const root = new THREE.Group();
  root.name = "fading-sacred-capital";
  const geometries = new Set<THREE.BufferGeometry>();
  const textures: THREE.Texture[] = [];
  const fogReveal = { value: 0 };
  const colliders: Array<{
    vertices: Float32Array;
    indices: Uint32Array;
    position: ParishPoint;
    yaw: number;
  }> = [];
  // Finished surfaces: limestone ashlar, plaster, flagstones, dressed sandstone, slate,
  // timber, iron and rock. Headless builds skip the canvas textures.
  const surfaces = new Map<CapitalSurfaceKind, ReturnType<typeof capitalSurfaceTextures>>();
  const surface = (kind: CapitalSurfaceKind, bump?: number) => {
    if (!textured) return {};
    let t = surfaces.get(kind);
    if (!t) {
      t = capitalSurfaceTextures(kind, bump);
      surfaces.set(kind, t);
      textures.push(t.map, t.normalMap);
    }
    return { map: t.map, normalMap: t.normalMap, normalScale: new THREE.Vector2(0.9, 0.9) };
  };
  // Interior volumes stay dark and cool, as the reference's whitebox interiors, while
  // glowing braziers and lamps keep their light.
  const interiorBoxes = CAPITAL_INTERIORS.map(
    ({ center, yaw }) => new THREE.Vector4(center[0], center[1], center[2], yaw),
  );
  const interiorHalves = CAPITAL_INTERIORS.map(({ half }) => new THREE.Vector3(...half));
  const interiorUniforms = {
    capitalBoxA: { value: interiorBoxes },
    capitalBoxH: { value: interiorHalves },
    capitalInteriorTint: { value: new THREE.Color(0.32, 0.46, 0.72) },
  };
  const boxCount = Math.max(1, interiorBoxes.length);
  if (!interiorBoxes.length) {
    interiorBoxes.push(new THREE.Vector4(0, -1e4, 0, 0));
    interiorHalves.push(new THREE.Vector3(0, 0, 0));
  }
  const material = (
    color: string,
    extras: THREE.MeshStandardMaterialParameters = {},
    interiorAmount = 1,
  ) => {
    const mat = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.9,
      vertexColors: true,
      ...extras,
    });
    // Height fog hides the ground city until the beacon switch is thrown.
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.capitalReveal = fogReveal;
      Object.assign(shader.uniforms, interiorUniforms);
      shader.uniforms.capitalInteriorAmount = { value: interiorAmount };
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\nvarying vec3 vCapitalPosition;")
        .replace(
          "#include <project_vertex>",
          "#include <project_vertex>\nvCapitalPosition=(modelMatrix*vec4(transformed,1.)).xyz;",
        );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          "#include <common>",
          `#include <common>\nvarying vec3 vCapitalPosition;uniform float capitalReveal;
          #define CAPITAL_BOXES ${boxCount}
          uniform vec4 capitalBoxA[CAPITAL_BOXES];uniform vec3 capitalBoxH[CAPITAL_BOXES];
          uniform vec3 capitalInteriorTint;uniform float capitalInteriorAmount;`,
        )
        .replace(
          "#include <fog_fragment>",
          `#include <fog_fragment>
        float inside=0.;
        for(int i=0;i<CAPITAL_BOXES;i++){
          vec4 a=capitalBoxA[i];vec3 d=vCapitalPosition-a.xyz;float c=cos(a.w),s=sin(a.w);
          vec3 q=abs(vec3(d.x*c-d.z*s,d.y,d.x*s+d.z*c))-capitalBoxH[i];
          // Reaches the inner faces of the walls, floor and ceiling, never their outer faces.
          inside=max(inside,1.-smoothstep(.2,.45,max(q.x,max(q.y,q.z))));
        }
        // Interiors: the light's warmth drained to a cool, dim blue, as in the reference.
        // Capped, so sunlight that reaches in without shadows cannot wash an interior out.
        float shade=min(dot(gl_FragColor.rgb,vec3(.3,.55,.15)),.42);
        gl_FragColor.rgb=mix(gl_FragColor.rgb,shade*capitalInteriorTint,inside*capitalInteriorAmount);
        // A cloud deck below the sky city: dense under y = 1, thinning within metres above.
        float dy=(vCapitalPosition.y-cameraPosition.y)*.35;
        float a=exp(clamp((1.-cameraPosition.y)*.35,-40.,8.));
        float b=exp(clamp((1.-vCapitalPosition.y)*.35,-40.,8.));
        float average=abs(dy)<.01?a:(a-b)/dy;
        float mist=1.-exp(-length(vCapitalPosition-cameraPosition)*max(average,0.)*mix(.06,0.,capitalReveal));
        gl_FragColor.rgb=mix(gl_FragColor.rgb,vec3(.9,.72,.62),clamp(mist,0.,.985)*(1.-inside));`,
        );
    };
    mat.customProgramCacheKey = () => "capital-height-fog-v12";
    return mat;
  };
  const statueTexture = textured ? capitalStatueTexture() : null;
  const m: Record<CapitalMaterial, THREE.MeshStandardMaterial> = {
    wall: material("#ffffff", surface("ashlar")),
    floor: material("#ffffff", surface("flagstone")),
    piece: material("#ffffff", surface("dressed")),
    trim: material("#ffffff", surface("smooth")),
    timber: material("#ffffff", surface("timber", 4)),
    iron: material("#ffffff", { ...surface("iron"), metalness: 0.6, roughness: 0.55 }),
    rock: material("#e8dccb", { ...surface("rock", 4), roughness: 1 }),
    glow: material("#eeac66", { emissive: "#ffad58", emissiveIntensity: 2 }, 0),
    marker: material("#75d8ed", { emissive: "#26c6e9", emissiveIntensity: 2.5 }, 0),
    house: material("#ffffff", surface("plaster", 1.5)),
    roof: material("#dedbd5", { ...surface("slate", 1.8), roughness: 0.9 }),
    shadow: material("#151a22", { roughness: 0.6 }),
    recess: material("#aaa49a", { ...surface("ashlar"), roughness: 0.95 }),
    cloth: material("#7d2a26", { roughness: 0.95 }),
    hedge: material("#ffffff", { ...surface("grass", 0.5), roughness: 1 }),
    water: material("#2f4c5c", { roughness: 0.08, metalness: 0.3 }),
    bark: material("#aaa99f", { roughness: 1 }),
    gold: material(
      "#ffffff",
      {
        ...(statueTexture
          ? {
              map: statueTexture,
            }
          : {}),
        metalness: 0.08,
        roughness: 0.88,
      },
      0,
    ),
  };
  if (m.gold.map) textures.push(m.gold.map);
  applyCapitalRockRelief(m.rock);
  const add = (
    g: THREE.BufferGeometry,
    mat: THREE.MeshStandardMaterial,
    position: ParishPoint = [0, 0, 0],
    yaw = 0,
  ) => {
    // Project the checker at one world scale, so a cathedral wall and a small pier
    // share the same metre cells. Every mesh gets the same attributes, so batches merge.
    if (g.getAttribute("normal")) {
      if (g.index) geometries.add(g);
      const transform = new THREE.Matrix4().makeRotationY(yaw).setPosition(...position);
      if (g.userData.authoredUv) {
        const source = g;
        g = source.index ? source.toNonIndexed() : source;
        g.userData = { ...source.userData };
      } else g = capitalKitUv(g, transform);
    }
    if (!g.hasAttribute("color"))
      g.setAttribute(
        "color",
        new THREE.BufferAttribute(
          new Float32Array(g.getAttribute("position").count * 3).fill(1),
          3,
        ),
      );
    geometries.add(g);
    const mesh = new THREE.Mesh(g, mat);
    mesh.name = `kit:${g.userData.capitalKit ?? "panel"}`;
    mesh.userData.capitalKit = g.userData.capitalKit ?? "panel";
    mesh.position.set(...position);
    mesh.rotation.y = yaw;
    mesh.castShadow = mesh.receiveShadow = true;
    root.add(mesh);
    return mesh;
  };

  const buried = new Set<THREE.Object3D>();
  // The ground city beneath the fog: batched on its own, so it can rise into place.
  const groundMeshes = new Set<THREE.Object3D>();
  for (const p of capitalLevel.pieces) {
    const mesh = add(
      capitalKitGeometry(p.model, p.size, p.thickness),
      m[p.material],
      p.position,
      p.yaw,
    );
    if (p.buried) buried.add(mesh);
    if (p.ground) groundMeshes.add(mesh);
    if (p.leaves)
      for (const leaf of capitalKitLeaves(p.model, p.size, p.thickness)) {
        const leafMesh = add(leaf.geometry.translate(...leaf.hinge), m.iron, p.position, p.yaw);
        if (p.ground) groundMeshes.add(leafMesh);
      }
  }
  const floorVertices: number[] = [],
    floorIndices: number[] = [],
    masonry = new Set<THREE.Object3D>();
  for (const s of capitalLevel.slabs) {
    const g = capitalKitPanel(s.vertices, s.thickness);
    if (s.collide) {
      const offset = floorVertices.length / 3;
      floorVertices.push(...g.getAttribute("position").array);
      floorIndices.push(...Array.from(g.index!.array, (n) => n + offset));
    }
    if (s.render) {
      const mesh = add(g, m[s.material]);
      if (s.mass) masonry.add(mesh);
      if (s.buried) buried.add(mesh);
      if (s.ground) groundMeshes.add(mesh);
    } else geometries.add(g);
  }
  colliders.push({
    vertices: new Float32Array(floorVertices),
    indices: new Uint32Array(floorIndices),
    position: [0, 0, 0],
    yaw: 0,
  });
  for (const [x, y, z] of capitalLanterns) {
    const post = add(capitalKitGeometry("cage-brazier", [0.8, 2.6, 0.8]), m.iron, [x, y, z]);
    const glow = add(capitalKitGeometry("flame", [0.45, 0.65, 0.45]), m.glow, [x, y + 2.04, z]);
    if (y < 0) groundMeshes.add(post).add(glow);
  }
  for (const shrine of capitalShrines) {
    const [x, y, z] = shrine.position;
    add(capitalKitGeometry("crate", [2, 0.4, 2]), m.piece, [x, y, z]);
    add(capitalKitGeometry("post", [0.9, 0.9, 0.9]), m.marker, [x, y + 0.4, z]);
  }

  const seams = sealCapitalSeams(
    root.children.filter((o): o is THREE.Mesh => o instanceof THREE.Mesh),
  );
  seams.geometries.forEach((g) => geometries.add(g));
  root.userData.trimmedCoplanarTriangles = seams.trimmedTriangles;

  // The mountain rises behind and beside the tiers as one sculpted rock mass. It may meet
  // masonry, but stays two metres beneath, and four beside, every walk and kit piece.
  const ceiling = capitalCeiling(
    root.children.filter((o) => !masonry.has(o) && !buried.has(o)),
    capitalSurfaces.filter((s) => !s.buried),
    4,
    // The buried arena, lift shafts and piers on bedrock only hold rock off themselves.
    -1,
    capitalSurfaces.filter((s) => s.buried),
  );
  const mountain = material("#f2ece4", { ...surface("rock", 4), roughness: 1, vertexColors: true });
  applyCapitalRockRelief(mountain);
  add(buildCapitalMountain(ceiling), mountain);
  // The ground plain the city stands on, revealed when the fog lifts.
  const plain = material("#ffffff", { ...surface("earth"), roughness: 1, vertexColors: true });
  groundMeshes.add(add(buildCapitalPlain(ceiling), plain));
  const ground = new THREE.Group();
  ground.name = "ground-city";
  for (const mesh of groundMeshes) {
    root.remove(mesh);
    ground.add(mesh);
  }
  const batching = batchStaticMeshes(root, 96);
  const groundBatching = batchStaticMeshes(ground, 96);
  root.add(ground);
  for (const mesh of [...batching.batch.children, ...groundBatching.batch.children])
    mesh.userData.capitalKit = "batch";
  let disposed = false;
  // PS2 style swaps every finished surface for its low-resolution, shading-baked,
  // dithered version and drops the normal maps; switching back restores the originals.
  const ps2Textures = new Map<THREE.Texture, THREE.Texture>();
  const originals = new Map<
    THREE.MeshStandardMaterial,
    [THREE.Texture | null, THREE.Texture | null]
  >();
  const allMaterials = [...Object.values(m), plain, mountain];
  let ps2 = false;
  function setPs2(enabled: boolean) {
    if (enabled === ps2 || !textured) return;
    ps2 = enabled;
    for (const mat of allMaterials) {
      if (!originals.has(mat)) originals.set(mat, [mat.map, mat.normalMap]);
      const [map, normalMap] = originals.get(mat)!;
      if (!map || !normalMap) continue;
      if (enabled) {
        let low = ps2Textures.get(map);
        if (!low) {
          low = ps2SurfaceTexture({ map, normalMap });
          low.repeat.copy(map.repeat);
          ps2Textures.set(map, low);
        }
        mat.map = low;
        mat.normalMap = null;
      } else {
        mat.map = map;
        mat.normalMap = normalMap;
      }
      mat.needsUpdate = true;
    }
  }
  return {
    root,
    /**
     * The ground city: its colliders are always in place, but it is drawn far below
     * until the switch, then rises to meet the sky city (offset with `position.y`).
     */
    ground,
    colliders,
    solids: capitalSolids,
    fogReveal,
    kitMaterials: { wall: m.wall, floor: m.piece, iron: m.iron, marker: m.marker, glow: m.glow },
    setPs2,
    dispose() {
      if (disposed) return;
      disposed = true;
      setPs2(false);
      ps2Textures.forEach((t) => t.dispose());
      batching.dispose();
      groundBatching.dispose();
      geometries.forEach((g) => g.dispose());
      [...Object.values(m), plain, mountain].forEach((mat) => mat.dispose());
      textures.forEach((t) => t.dispose());
      root.clear();
    },
  };
}
