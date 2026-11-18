import RAPIER from "@dimforge/rapier3d-compat";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import * as THREE from "three";
import { parkLabels } from "../../../gameplay/collisionCourse";
import { playgroundBasicMaterial } from "../../../gameplay/playgroundResources";
import {
  createTreeBlueprint,
  type TreeKind,
  type TreeLobe,
  type TreeSegment,
} from "../../../gameplay/proceduralTrees";

type Palette = [string, string, string, string];

const specimens: Array<{
  kind: TreeKind;
  x: number;
  seed: number;
  trunkRadius: number;
  day: { ground: string; palette: Palette };
  halloween: { ground: string; palette: Palette };
}> = [
  {
    kind: "broad",
    x: 12,
    seed: 1248,
    trunkRadius: 0.52,
    day: { ground: "#688574", palette: ["#70a69c", "#4d8882", "#2c6367", "#193f49"] },
    halloween: {
      ground: "#4d3c35",
      palette: ["#c77c39", "#9b4d28", "#632e2a", "#332531"],
    },
  },
  {
    kind: "spreading",
    x: 27,
    seed: 5227,
    trunkRadius: 0.48,
    day: { ground: "#67816f", palette: ["#8cac8a", "#63917d", "#3f6d68", "#234d52"] },
    halloween: {
      ground: "#48353b",
      palette: ["#b96042", "#88383d", "#552b3b", "#292537"],
    },
  },
  {
    kind: "evergreen",
    x: 42,
    seed: 8412,
    trunkRadius: 0.4,
    day: { ground: "#5d776a", palette: ["#619184", "#42746c", "#2b5d5c", "#153b43"] },
    halloween: {
      ground: "#353840",
      palette: ["#737783", "#495764", "#2c3e4b", "#1a2733"],
    },
  },
  {
    kind: "young",
    x: 57,
    seed: 3069,
    trunkRadius: 0.34,
    day: { ground: "#708a74", palette: ["#8cad8c", "#62917d", "#3a6d69", "#234c50"] },
    halloween: {
      ground: "#434038",
      palette: ["#a5a27c", "#77775c", "#4d5452", "#282f3a"],
    },
  },
];

// Every display stands on the same flat disc; only its colour changes.
const groundDisc = new THREE.CircleGeometry(4.8, 24);
groundDisc.name = "Tree display disc";
const labRing = new THREE.RingGeometry(4.78, 4.9, 48);
labRing.name = "Tree lab ring";

const displays = specimens.flatMap(({ kind, x, trunkRadius, day, halloween }) => [
  { kind, x, z: 40, trunkRadius, variant: "day" as const, ...day },
  { kind, x, z: 68, trunkRadius, variant: "halloween" as const, ...halloween },
]);

// A seeded blueprint distributes foliage and supporting limbs around all sides.
function makeFoliage(kind: TreeKind, lobes: TreeLobe[]) {
  const pieces = lobes.map(({ center, radius, seed }) => {
    const geometry = new THREE.SphereGeometry(1, 32, 24);
    const positions = geometry.getAttribute("position") as THREE.BufferAttribute;
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i);
      const y = positions.getY(i);
      const z = positions.getZ(i);
      const large = Math.sin(x * 5.1 + seed) * Math.cos(y * 4.3 - z * 3.7 + seed);
      const small = Math.sin(x * 10.9 - z * 8.3 + seed * 2) * Math.cos(y * 9.4 + seed);
      const swell = 1 + large * 0.115 + small * 0.045;
      positions.setXYZ(i, x * swell, y * swell, z * swell);
    }
    positions.needsUpdate = true;
    geometry.computeVertexNormals();
    geometry.scale(...radius);
    geometry.translate(...center);
    return geometry;
  });
  const merged = mergeGeometries(pieces);
  pieces.forEach((piece) => piece.dispose());
  if (!merged) throw new Error(`Could not build ${kind} foliage`);
  merged.computeBoundingSphere();
  return merged;
}

function makeTrunk(kind: TreeKind, segments: TreeSegment[]) {
  const up = new THREE.Vector3(0, 1, 0);
  const pieces = segments.map(({ from, to, baseRadius, tipRadius }) => {
    const start = new THREE.Vector3(...from);
    const end = new THREE.Vector3(...to);
    const direction = end.clone().sub(start);
    const geometry = new THREE.CylinderGeometry(tipRadius, baseRadius, direction.length(), 10);
    geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up, direction.normalize()));
    geometry.translate(...start.add(end).multiplyScalar(0.5).toArray());
    return geometry;
  });
  const merged = mergeGeometries(pieces);
  pieces.forEach((piece) => piece.dispose());
  if (!merged) throw new Error(`Could not build ${kind} trunk`);
  return merged;
}

// Adapted from craftzdog/ghibli-style-shader (MIT): four colors chosen by
// surface normal and light direction. The small brightness perturbation breaks
// up the bands like the painted foliage in the supplied reference.
const foliageVertexShader = /* glsl */ `
  varying vec3 vWorldNormal;
  varying vec3 vWorldPosition;
  void main() {
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPosition.xyz;
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

const foliageFragmentShader = /* glsl */ `
  uniform vec3 colorMap[4];
  uniform vec3 lightPosition;
  uniform float fillStrength;
  varying vec3 vWorldNormal;
  varying vec3 vWorldPosition;
  void main() {
    vec3 normal = normalize(vWorldNormal);
    if (!gl_FrontFacing) normal = -normal;
    vec3 lightVector = normalize(lightPosition - vWorldPosition);
    float grain = sin(vWorldPosition.x * 9.7 + vWorldPosition.z * 3.1)
      * sin(vWorldPosition.y * 11.3 - vWorldPosition.z * 7.9) * 0.035;
    float direct = max(dot(normal, lightVector), 0.0);
    float reflected = max(dot(normal, normalize(vec3(-0.35, 0.65, 0.7))), 0.0);
    float brightness = 0.3 + direct * 0.58 + reflected * fillStrength
      + normal.y * 0.26 + grain;
    vec3 color = brightness > 0.75 ? colorMap[0]
      : brightness > 0.42 ? colorMap[1]
      : brightness > 0.14 ? colorMap[2] : colorMap[3];
    gl_FragColor = vec4(color, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

/** Procedural tree displays (day and halloween), plus the lab pair at the default shape. */
export function createTreeShowcase(
  scene: THREE.Scene,
  world: RAPIER.World,
  label: (text: string, position: [number, number, number]) => THREE.Object3D,
) {
  const geometries = Object.fromEntries(
    specimens.map(({ kind, seed }) => {
      const day = createTreeBlueprint(kind, seed);
      const halloween = createTreeBlueprint(kind, seed, "halloween");
      return [
        kind,
        {
          foliage: makeFoliage(kind, day.foliage),
          dayTrunk: makeTrunk(kind, day.wood),
          halloweenTrunk: makeTrunk(kind, halloween.wood),
        },
      ];
    }),
  ) as Record<
    TreeKind,
    {
      foliage: THREE.BufferGeometry;
      dayTrunk: THREE.BufferGeometry;
      halloweenTrunk: THREE.BufferGeometry;
    }
  >;
  const foliageMaterials = Object.fromEntries(
    displays.map(({ kind, variant, palette }) => [
      `${variant}-${kind}`,
      new THREE.ShaderMaterial({
        vertexShader: foliageVertexShader,
        fragmentShader: foliageFragmentShader,
        uniforms: {
          colorMap: { value: palette.map((color) => new THREE.Color(color)) },
          lightPosition: {
            value:
              variant === "halloween"
                ? new THREE.Vector3(-40, 44, 25)
                : new THREE.Vector3(22, 38, 12),
          },
          fillStrength: {
            value: variant === "halloween" ? 0.18 : kind === "evergreen" ? 0.23 : 0.1,
          },
        },
        side: THREE.DoubleSide,
      }),
    ]),
  ) as Record<string, THREE.ShaderMaterial>;
  const gradient = new THREE.DataTexture(
    new Uint8Array([78, 150, 215, 255]),
    4,
    1,
    THREE.RedFormat,
  );
  gradient.minFilter = gradient.magFilter = THREE.NearestFilter;
  gradient.generateMipmaps = false;
  gradient.needsUpdate = true;
  const trunkMaterials = {
    day: new THREE.MeshToonMaterial({ color: "#465347", gradientMap: gradient }),
    halloween: new THREE.MeshToonMaterial({ color: "#332b30", gradientMap: gradient }),
  };
  const live = specimens[0];
  const shown = [
    ...displays.map((display) => ({ ...display, lab: false })),
    {
      kind: live.kind,
      x: -5,
      z: 40,
      trunkRadius: live.trunkRadius,
      variant: "day" as const,
      lab: true,
      ...live.day,
    },
    {
      kind: live.kind,
      x: -5,
      z: 68,
      trunkRadius: live.trunkRadius,
      variant: "halloween" as const,
      lab: true,
      ...live.halloween,
    },
  ];
  const hull = (radius: number) =>
    new Float32Array(
      Array.from({ length: 40 }, (_, i) => {
        const angle = ((i % 20) / 20) * Math.PI * 2;
        return [Math.cos(angle) * radius, i < 20 ? 0 : 5, Math.sin(angle) * radius];
      }).flat(),
    );
  for (const { kind, variant, x, z, ground, trunkRadius, lab } of shown) {
    const root = new THREE.Group();
    root.position.set(x, 0, z);
    for (const l of parkLabels.filter(({ position: [lx, , lz] }) => lx === x && lz === z + 8))
      root.add(label(l.text, [0, l.position[1], 8]));
    const disc = new THREE.Mesh(groundDisc, playgroundBasicMaterial("Tree display ground", ground));
    disc.position.y = 0.025;
    disc.rotation.x = -Math.PI / 2;
    disc.receiveShadow = true;
    root.add(disc);
    if (lab) {
      const ring = new THREE.Mesh(labRing, playgroundBasicMaterial("Tree lab ring", "#e7bd69"));
      ring.position.y = 0.03;
      ring.rotation.x = -Math.PI / 2;
      root.add(ring);
    }
    const g = geometries[kind];
    const yaw = variant === "halloween" ? Math.PI / 7 : 0;
    const trunk = new THREE.Mesh(
      variant === "halloween" ? g.halloweenTrunk : g.dayTrunk,
      trunkMaterials[variant],
    );
    trunk.rotation.y = yaw;
    trunk.castShadow = true;
    const foliage = new THREE.Mesh(g.foliage, foliageMaterials[`${variant}-${kind}`]);
    foliage.rotation.y = yaw;
    foliage.scale.setScalar(variant === "halloween" ? 0.93 : 1);
    foliage.castShadow = true;
    root.add(trunk, foliage);
    scene.add(root);
    const shape = RAPIER.ColliderDesc.convexHull(hull(trunkRadius));
    if (shape) world.createCollider(shape.setTranslation(x, 0, z));
  }
}
