import { Sparkles } from "@react-three/drei";
import { useEffect, useLayoutEffect, useMemo, useRef, type RefObject } from "react";
import * as THREE from "three";
import { scatter, type ScatterPoint, type TerrainGrid } from "../gameplay/terrain";

function useScatterInstances(
  ref: RefObject<THREE.InstancedMesh | null>,
  points: ScatterPoint[],
  colorFor: (tint: number) => THREE.Color,
  sink = 0,
) {
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const scale = new THREE.Vector3();
    points.forEach((point, index) => {
      position.set(point.x, point.y - sink * point.scale, point.z);
      quaternion.setFromAxisAngle(up, point.rotation);
      scale.setScalar(point.scale);
      matrix.compose(position, quaternion, scale);
      mesh.setMatrixAt(index, matrix);
      mesh.setColorAt(index, colorFor(point.tint));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [ref, points, colorFor, sink]);
}

// Forest-floor brushwork: two octaves of world-space value noise mottle the
// baked terrain colours with moss, damp soil and warm leaf litter, so the
// ground reads as painted texture rather than flat vertex colour.
function createGroundMaterial() {
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 1,
    metalness: 0,
  });
  material.onBeforeCompile = (shader) => {
    shader.vertexShader =
      "varying vec2 vGroundXZ;\n" +
      shader.vertexShader.replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\n vGroundXZ = position.xz;",
      );
    shader.fragmentShader =
      `varying vec2 vGroundXZ;
      float groundHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float groundNoise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(groundHash(i), groundHash(i + vec2(1, 0)), f.x),
          mix(groundHash(i + vec2(0, 1)), groundHash(i + vec2(1, 1)), f.x), f.y);
      }\n` +
      shader.fragmentShader.replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        float broad = groundNoise(vGroundXZ * 0.35);
        float fine = groundNoise(vGroundXZ * 2.3 + 7.0);
        diffuseColor.rgb *= 0.78 + fine * 0.34;
        vec3 litter = diffuseColor.rgb * vec3(1.45, 1.05, 0.62);
        vec3 moss = diffuseColor.rgb * vec3(0.8, 1.12, 0.7);
        diffuseColor.rgb = mix(diffuseColor.rgb, litter, smoothstep(0.55, 0.8, broad) * 0.7);
        diffuseColor.rgb = mix(diffuseColor.rgb, moss, smoothstep(0.45, 0.2, broad) * 0.6);`,
      );
  };
  material.customProgramCacheKey = () => "hub-ground-v1";
  return material;
}

export function HubGround({ grid }: { grid: TerrainGrid }) {
  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setIndex(grid.indices);
    geo.setAttribute("position", new THREE.Float32BufferAttribute(grid.vertices, 3));
    geo.setAttribute("color", new THREE.Float32BufferAttribute(grid.colors, 3));
    geo.computeVertexNormals();
    return geo;
  }, [grid]);
  const material = useMemo(createGroundMaterial, []);
  useEffect(() => () => material.dispose(), [material]);

  return <mesh geometry={geometry} material={material} receiveShadow />;
}

const grassColor = (tint: number) =>
  new THREE.Color().setHSL(0.26 + tint * 0.06, 0.48, 0.22 + tint * 0.12);

export function Grass({ count = 2200 }: { count?: number }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const points = useMemo(
    () =>
      scatter(count, 4, 56, 101).filter((point) => {
        const onGalleryPath = Math.abs(point.x) < 1.3 && point.z > -12 && point.z < 7;
        const onStudyPath = Math.abs(point.z) < 1.3 && point.x > 0 && point.x < 12;
        return !onGalleryPath && !onStudyPath;
      }),
    [count],
  );
  const blades = useMemo(() => {
    const geo = new THREE.ConeGeometry(0.07, 0.55, 4);
    geo.translate(0, 0.24, 0);
    return geo;
  }, []);
  useScatterInstances(ref, points, grassColor);
  return (
    <instancedMesh ref={ref} args={[blades, undefined, points.length]} receiveShadow>
      <meshStandardMaterial roughness={1} />
    </instancedMesh>
  );
}

const FLOWER_HEAD_COLORS = ["#ffffff", "#ffd94d", "#ff9ec6", "#c9b8ff"];
const flowerHeadColor = (tint: number) =>
  new THREE.Color(FLOWER_HEAD_COLORS[Math.floor(tint * FLOWER_HEAD_COLORS.length) % 4]);
const stemColor = () => new THREE.Color("#3f6b34");

export function Flowers({ count = 220 }: { count?: number }) {
  const stems = useRef<THREE.InstancedMesh>(null);
  const heads = useRef<THREE.InstancedMesh>(null);
  const points = useMemo(() => scatter(count, 7, 50, 202, 0.8, 1.2), [count]);
  const stemGeo = useMemo(() => {
    const geo = new THREE.CylinderGeometry(0.02, 0.03, 0.5, 5);
    geo.translate(0, 0.25, 0);
    return geo;
  }, []);
  useScatterInstances(stems, points, stemColor);
  useScatterInstances(heads, points, flowerHeadColor);
  return (
    <group>
      <instancedMesh ref={stems} args={[stemGeo, undefined, points.length]}>
        <meshStandardMaterial color="#3f6b34" roughness={1} />
      </instancedMesh>
      <instancedMesh
        ref={heads}
        args={[undefined, undefined, points.length]}
        position={[0, 0.5, 0]}
      >
        <icosahedronGeometry args={[0.09, 0]} />
        <meshStandardMaterial roughness={0.7} />
      </instancedMesh>
    </group>
  );
}

const rockColor = (tint: number) => new THREE.Color().setHSL(0.25, 0.05, 0.3 + tint * 0.14);

export function Rocks({ count = 46 }: { count?: number }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const points = useMemo(() => scatter(count, 10, 52, 303, 0.5, 1.6), [count]);
  useScatterInstances(ref, points, rockColor, 0.3);
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, points.length]} castShadow receiveShadow>
      <dodecahedronGeometry args={[0.5, 0]} />
      <meshStandardMaterial roughness={0.95} flatShading />
    </instancedMesh>
  );
}

const bushColor = (tint: number) => new THREE.Color().setHSL(0.3, 0.42, 0.18 + tint * 0.08);

export function Bushes({ count = 30 }: { count?: number }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const points = useMemo(() => scatter(count, 9, 48, 404, 0.8, 1.6), [count]);
  // Squash baked into the geometry: scaling the instanced mesh itself would
  // also scale every instance's ground position downward.
  const bushGeo = useMemo(() => {
    const geo = new THREE.IcosahedronGeometry(0.9, 1);
    geo.scale(1, 0.7, 1);
    return geo;
  }, []);
  useScatterInstances(ref, points, bushColor, 0.15);
  return (
    <instancedMesh ref={ref} args={[bushGeo, undefined, points.length]} castShadow receiveShadow>
      <meshStandardMaterial roughness={1} flatShading />
    </instancedMesh>
  );
}

const peaks: Array<{ x: number; z: number; size: number; color: string }> = [
  { x: -70, z: -55, size: 34, color: "#5d705f" },
  { x: 75, z: -40, size: 28, color: "#66765f" },
  { x: 10, z: -95, size: 40, color: "#596b62" },
  { x: -85, z: 35, size: 30, color: "#5d705f" },
  { x: 80, z: 55, size: 26, color: "#66765f" },
];

export function DistantPeaks() {
  return (
    <group>
      {peaks.map(({ x, z, size, color }, index) => (
        <mesh key={index} position={[x * 2.8, size * 0.6, z * 2.8]}>
          <coneGeometry args={[size * 1.8, size * 2, 7]} />
          <meshStandardMaterial color={color} roughness={1} flatShading />
        </mesh>
      ))}
    </group>
  );
}

export function Fireflies() {
  return (
    <group>
      <Sparkles
        count={70}
        scale={[36, 7, 36]}
        position={[0, 3.5, 0]}
        size={4}
        speed={0.35}
        opacity={0.55}
        color="#ffedb0"
      />
      <Sparkles
        count={40}
        scale={[60, 9, 60]}
        position={[0, 5, -10]}
        size={6}
        speed={0.22}
        opacity={0.35}
        color="#fff6d8"
      />
    </group>
  );
}
