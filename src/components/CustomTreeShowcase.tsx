import { useEffect, useMemo } from "react";
import { CylinderCollider, RigidBody } from "@react-three/rapier";
import { button, useControls } from "leva";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import * as THREE from "three";
import {
  createTreeBlueprint,
  defaultTreeShape,
  type TreeKind,
  type TreeLobe,
  type TreeSegment,
  type TreeShape,
  type TreeVariant,
} from "../gameplay/proceduralTrees";

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

export function CustomTreeShowcase() {
  const [controls, setControls] = useControls(
    "Procedural trees",
    () => ({
      species: {
        value: "broad",
        options: {
          "Broad canopy": "broad",
          "Spreading canopy": "spreading",
          "Dark evergreen": "evergreen",
          "Young canopy": "young",
        },
        label: "Species",
      },
      seed: { value: 9067, min: 0, max: 99999, step: 1, label: "Seed" },
      spread: { value: 1, min: 0.6, max: 1.5, step: 0.05, label: "Width" },
      height: { value: 1, min: 0.7, max: 1.4, step: 0.05, label: "Height" },
      clusterSize: { value: 1, min: 0.65, max: 1.4, step: 0.05, label: "Lobe size" },
      density: { value: 1, min: 0.6, max: 1.5, step: 0.1, label: "Density" },
    }),
    { order: -100 },
  );
  useControls(
    "Procedural trees",
    {
      "New seed": button(() => setControls({ seed: Math.floor(Math.random() * 100000) })),
      "Reset shape": button(() => setControls(defaultTreeShape)),
    },
    { order: -100 },
    [setControls],
  );
  const liveKind = controls.species as TreeKind;
  const liveSpecimen = specimens.find(({ kind }) => kind === liveKind)!;
  const geometries = useMemo(
    () =>
      Object.fromEntries(
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
      >,
    [],
  );
  const liveGeometries = useMemo(() => {
    const liveShape: TreeShape = {
      spread: controls.spread,
      height: controls.height,
      clusterSize: controls.clusterSize,
      density: controls.density,
    };
    const day = createTreeBlueprint(liveKind, controls.seed, "day", liveShape);
    const halloween = createTreeBlueprint(liveKind, controls.seed, "halloween", liveShape);
    return {
      foliage: makeFoliage(liveKind, day.foliage),
      dayTrunk: makeTrunk(liveKind, day.wood),
      halloweenTrunk: makeTrunk(liveKind, halloween.wood),
    };
  }, [
    liveKind,
    controls.seed,
    controls.spread,
    controls.height,
    controls.clusterSize,
    controls.density,
  ]);
  const foliageMaterials = useMemo(
    () =>
      Object.fromEntries(
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
      ) as Record<`${TreeVariant}-${TreeKind}`, THREE.ShaderMaterial>,
    [],
  );
  const gradient = useMemo(() => {
    const texture = new THREE.DataTexture(
      new Uint8Array([78, 150, 215, 255]),
      4,
      1,
      THREE.RedFormat,
    );
    texture.minFilter = texture.magFilter = THREE.NearestFilter;
    texture.generateMipmaps = false;
    texture.needsUpdate = true;
    return texture;
  }, []);
  const trunkMaterials = useMemo(
    () => ({
      day: new THREE.MeshToonMaterial({ color: "#465347", gradientMap: gradient }),
      halloween: new THREE.MeshToonMaterial({ color: "#332b30", gradientMap: gradient }),
    }),
    [gradient],
  );
  useEffect(
    () => () => {
      Object.values(geometries).forEach(({ foliage, dayTrunk, halloweenTrunk }) => {
        foliage.dispose();
        dayTrunk.dispose();
        halloweenTrunk.dispose();
      });
      Object.values(foliageMaterials).forEach((material) => material.dispose());
      Object.values(trunkMaterials).forEach((material) => material.dispose());
      gradient.dispose();
    },
    [geometries, foliageMaterials, trunkMaterials, gradient],
  );
  useEffect(
    () => () => {
      liveGeometries.foliage.dispose();
      liveGeometries.dayTrunk.dispose();
      liveGeometries.halloweenTrunk.dispose();
    },
    [liveGeometries],
  );

  const liveDisplays = [
    {
      kind: liveKind,
      x: -5,
      z: 40,
      trunkRadius: liveSpecimen.trunkRadius,
      variant: "day" as const,
      lab: true,
      ...liveSpecimen.day,
    },
    {
      kind: liveKind,
      x: -5,
      z: 68,
      trunkRadius: liveSpecimen.trunkRadius,
      variant: "halloween" as const,
      lab: true,
      ...liveSpecimen.halloween,
    },
  ];
  const shown = [...displays.map((display) => ({ ...display, lab: false })), ...liveDisplays];

  return (
    <group name="custom-tree-showcase">
      {shown.map(({ kind, variant, x, z, ground, trunkRadius, lab }) => {
        const treeGeometry = lab ? liveGeometries : geometries[kind];
        return (
          <group key={lab ? `live-${variant}` : `${variant}-${kind}`}>
            <mesh position={[x, 0.025, z]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
              <circleGeometry args={[4.8, 24]} />
              <meshBasicMaterial color={ground} />
            </mesh>
            {lab && (
              <mesh position={[x, 0.03, z]} rotation={[-Math.PI / 2, 0, 0]}>
                <ringGeometry args={[4.78, 4.9, 48]} />
                <meshBasicMaterial color="#e7bd69" />
              </mesh>
            )}
            <RigidBody type="fixed" colliders={false} position={[x, 0, z]}>
              <CylinderCollider args={[2.5, trunkRadius]} position={[0, 2.5, 0]} />
              <group rotation-y={variant === "halloween" ? Math.PI / 7 : 0}>
                <mesh
                  geometry={
                    variant === "halloween" ? treeGeometry.halloweenTrunk : treeGeometry.dayTrunk
                  }
                  material={trunkMaterials[variant]}
                  castShadow
                  dispose={null}
                />
                <mesh
                  name={
                    lab
                      ? `custom-live-${variant}`
                      : variant === "halloween"
                        ? `custom-halloween-${kind}`
                        : `custom-${kind}`
                  }
                  geometry={treeGeometry.foliage}
                  material={foliageMaterials[`${variant}-${kind}`]}
                  scale={variant === "halloween" ? 0.93 : 1}
                  castShadow
                  dispose={null}
                />
              </group>
            </RigidBody>
          </group>
        );
      })}
    </group>
  );
}
