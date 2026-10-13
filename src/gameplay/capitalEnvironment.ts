import * as THREE from "three";
import { capitalCeiling, buildCapitalMountain, buildCapitalPlain } from "./capitalCrag.ts";
import {
  capitalKitGeometry,
  capitalKitLeaves,
  capitalKitPanel,
  capitalKitUv,
} from "./capitalBuildingKit.ts";
import { capitalSurfaceTextures, type CapitalSurfaceKind } from "./capitalMaterials.ts";
import { batchStaticMeshes } from "./batchStaticMeshes.ts";
import { sealCapitalSeams } from "./capitalSeams.ts";
import type { CapitalMaterial } from "./capitalKitLevel.ts";
import { BEACON_COURT, CAPITAL_APRON } from "./capitalDistricts.ts";
import {
  capitalLevel,
  capitalSolids,
  capitalSurfaces,
  capitalLanterns,
  capitalShrines,
} from "./capitalLayout.ts";
import type { ParishPoint } from "./ashenParish.ts";

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
  const material = (color: string, extras: THREE.MeshStandardMaterialParameters = {}) => {
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.9, ...extras });
    // Height fog hides the ground city until the beacon switch is thrown.
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
        gl_FragColor.rgb=mix(gl_FragColor.rgb,vec3(.6,.65,.71),clamp(mist,0.,.985));`,
        );
    };
    mat.customProgramCacheKey = () => "capital-height-fog-v6";
    return mat;
  };
  const m: Record<CapitalMaterial, THREE.MeshStandardMaterial> = {
    wall: material("#ffffff", surface("ashlar")),
    floor: material("#ffffff", surface("flagstone")),
    piece: material("#ffffff", surface("dressed")),
    trim: material("#ffffff", surface("smooth")),
    timber: material("#ffffff", surface("timber", 4)),
    iron: material("#ffffff", { ...surface("iron"), metalness: 0.6, roughness: 0.55 }),
    rock: material("#e8dccb", { ...surface("rock", 4), roughness: 1 }),
    glow: material("#eeac66", { emissive: "#ffad58", emissiveIntensity: 2 }),
    marker: material("#75d8ed", { emissive: "#26c6e9", emissiveIntensity: 2.5 }),
    house: material("#ffffff", surface("plaster", 1.5)),
    // Pale stone roofs, as in the reference's white city, not dark slate.
    roof: material("#e9e6df", { ...surface("smooth"), roughness: 0.85 }),
    shadow: material("#151a22", { roughness: 0.6 }),
    cloth: material("#7d2a26", { roughness: 0.95 }),
    hedge: material("#8fae6a", { ...surface("earth"), roughness: 1 }),
    water: material("#2f4c5c", { roughness: 0.08, metalness: 0.3 }),
  };
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
      g = capitalKitUv(g, transform);
    }
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

  for (const p of capitalLevel.pieces) {
    add(capitalKitGeometry(p.model, p.size, p.thickness), m[p.material], p.position, p.yaw);
    if (p.leaves)
      for (const leaf of capitalKitLeaves(p.model, p.size, p.thickness))
        add(leaf.geometry.translate(...leaf.hinge), m.iron, p.position, p.yaw);
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
    } else geometries.add(g);
  }
  colliders.push({
    vertices: new Float32Array(floorVertices),
    indices: new Uint32Array(floorIndices),
    position: [0, 0, 0],
    yaw: 0,
  });
  for (const [x, y, z] of capitalLanterns) {
    add(capitalKitGeometry("post", [0.45, 1.9, 0.45]), m.trim, [x, y, z]);
    add(capitalKitGeometry("block", [0.6, 0.6, 0.6]), m.glow, [x, y + 2.2, z]);
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
    root.children.filter((o) => !masonry.has(o)),
    capitalSurfaces,
    4,
    // The buried arena, lift shafts and piers on bedrock only hold rock off themselves.
    -1,
  );
  const mountain = material("#f2ece4", { ...surface("rock", 4), roughness: 1, vertexColors: true });
  add(buildCapitalMountain(ceiling), mountain);
  // The plain lies flat to the walls; only the beacon's foot is sunk into it, where the
  // spiral and lift reach the road beneath, and before the gate it meets the apron's walk.
  const plain = material("#ffffff", { ...surface("earth"), roughness: 1, vertexColors: true });
  const { x0, x1, z0, z1 } = BEACON_COURT;
  add(
    buildCapitalPlain(
      ceiling,
      (x, z) => x > x0 && x < x1 && z > z0 && z < z1,
      // The apron is walked on the plain itself.
      (x, z) => {
        const r = Math.hypot(x, z),
          a = (Math.atan2(x, -z) + 2 * Math.PI) % (2 * Math.PI);
        return (
          r > CAPITAL_APRON.r0 - 2 &&
          r < CAPITAL_APRON.r1 + 4 &&
          a > CAPITAL_APRON.aE - 0.04 &&
          a < CAPITAL_APRON.aW + 0.04
        );
      },
    ),
    plain,
  );
  const batching = batchStaticMeshes(root, 96);
  for (const mesh of batching.batch.children) mesh.userData.capitalKit = "batch";
  let disposed = false;
  return {
    root,
    colliders,
    solids: capitalSolids,
    fogReveal,
    kitMaterials: { wall: m.wall, floor: m.piece, iron: m.iron, marker: m.marker, glow: m.glow },
    dispose() {
      if (disposed) return;
      disposed = true;
      batching.dispose();
      geometries.forEach((g) => g.dispose());
      [...Object.values(m), plain, mountain].forEach((mat) => mat.dispose());
      textures.forEach((t) => t.dispose());
      root.clear();
    },
  };
}
