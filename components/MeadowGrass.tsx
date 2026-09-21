import { useFrame } from '@react-three/fiber';
import { useWorld } from 'koota/react';
import { PlayerPosition } from '../gameplay/ecs/traits';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useGame } from '../app/gameSettings';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { GRASS_CHUNK_SIZE } from '../gameplay/grass';

// Original implementation of curved, instanced grass. Technique reference:
// https://github.com/simondevyoutube/Quick_Grass
const declarations = /* glsl */ `
  uniform float uGrassTime;
  uniform float uGrassWind;
  uniform vec3 uGrassPlayer;
  varying float vGrassHeight;
  varying float vGrassShade;
`;
const bend = /* glsl */ `
  vec3 transformed = vec3(position);
  vec3 root = instanceMatrix[3].xyz;
  float tip = position.y * position.y;
  float phase = root.x * 0.24 + root.z * 0.18;
  float gust = sin(phase + uGrassTime * 1.6) * 0.65
    + sin(root.z * 0.63 - uGrassTime * 2.3) * 0.25;
  vec2 wind = vec2(0.8, 0.4) * (0.18 + gust * 0.2) * uGrassWind;
  vec2 away = root.xz - uGrassPlayer.xz;
  float proximity = 1.0 - smoothstep(0.2, 1.35, length(away));
  proximity *= 1.0 - smoothstep(0.5, 2.0, abs(root.y - uGrassPlayer.y));
  vec2 push = away / max(length(away), 0.01) * proximity * 0.7;
  vec3 worldBend = vec3(wind.x + push.x, -proximity * 0.38, wind.y + push.y) * tip;
  // Invert the instance's uniform scale and rotation, keeping the bend in
  // world space and the root fixed to the terrain.
  mat3 basis = mat3(instanceMatrix);
  transformed += transpose(basis) * worldBend / dot(basis[0], basis[0]);
  float distanceToCamera = distance(cameraPosition.xz, root.xz);
  float fade = 1.0 - smoothstep(36.0, 49.0, distanceToCamera);
  float seed = fract(sin(dot(root.xz, vec2(12.9898, 78.233))) * 43758.5453);
  float thin = smoothstep(16.0 + seed * 12.0, 25.0 + seed * 12.0, distanceToCamera);
  float lod = seed < 0.55 ? 1.0 - thin : 1.0;
  transformed *= fade * lod;
  vGrassHeight = position.y;
  vGrassShade = 0.86 + 0.14 * sin(root.x * 0.3 + root.z * 0.2);
`;

function createBlades() {
  const vertices: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i <= 3; i++) {
    const t = i / 3;
    const width = 0.075 * (1 - t);
    // Quadratic curve: increasingly bent toward the tip.
    vertices.push(-width, t, t * t * 0.26, width, t, t * t * 0.26);
    if (i < 3) {
      const a = i * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

class GrassAppearance {
  readonly time = { value: 0 };
  readonly wind = { value: 1 };
  readonly player = { value: new THREE.Vector3(1000, 1000, 1000) };
  readonly material = new THREE.MeshStandardMaterial({
    color: '#789744', roughness: 1, side: THREE.DoubleSide,
  });
  constructor() {
    this.material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, { uGrassTime: this.time, uGrassWind: this.wind, uGrassPlayer: this.player });
      shader.vertexShader = declarations + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', bend);
      shader.vertexShader = shader.vertexShader.replace('#include <beginnormal_vertex>', `
        #include <beginnormal_vertex>
        objectNormal = normalize(mix(objectNormal, vec3(0.0, 1.0, 0.0), 0.55));
      `);
      shader.fragmentShader = 'varying float vGrassHeight; varying float vGrassShade;\n' + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `
        #include <color_fragment>
        diffuseColor.rgb *= mix(vec3(0.38, 0.47, 0.29), vec3(1.12, 1.06, 0.73), vGrassHeight) * vGrassShade;
      `);
    };
    this.material.customProgramCacheKey = () => 'meadow-grass-v1';
  }
  update(time: number, reduced: boolean, player: { x: number; y: number; z: number }) {
    this.time.value = time;
    this.wind.value = reduced ? 0 : 1;
    this.player.value.set(player.x, player.y, player.z);
  }
}

type PatchData = { key: string; x: number; z: number; matrices: Float32Array };

/** One worker job and one GPU upload at a time, with a bounded revisit cache. */
class GrassStream {
  readonly patches = new Map<string, { mesh: THREE.InstancedMesh; count: number }>();
  readonly worker = new Worker(new URL('../gameplay/grass.worker.ts', import.meta.url), { type: 'module' });
  ready?: PatchData;
  busy = false;
  constructor(readonly group: THREE.Group, readonly geometry: THREE.BufferGeometry, readonly material: THREE.Material, readonly density: number) {
    this.worker.onmessage = ({ data }: MessageEvent<PatchData>) => { this.ready = data; };
  }
  update(camera: THREE.Camera) {
    if (this.ready) {
      const { key, x, z, matrices } = this.ready;
      const mesh = new THREE.InstancedMesh(this.geometry, this.material, matrices.length / 16);
      mesh.name = 'meadow-grass-patch';
      mesh.instanceMatrix.array.set(matrices);
      mesh.instanceMatrix.needsUpdate = true;
      mesh.receiveShadow = true;
      // Hub heights are bounded by terrain tests; include blade bending.
      mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3((x + 0.5) * 10, 0, (z + 0.5) * 10), 10);
      this.group.add(mesh);
      this.patches.set(key, { mesh, count: mesh.count });
      this.ready = undefined;
      this.busy = false;
    }
    for (const { mesh, count } of this.patches.values()) {
      const center = mesh.boundingSphere!.center;
      const distance = Math.hypot(camera.position.x - center.x, camera.position.z - center.z);
      mesh.visible = distance < 57;
      // Actually stop submitting distant vertices, not just shrink them in GLSL.
      mesh.count = Math.ceil(count * (1 - THREE.MathUtils.smoothstep(distance, 20, 45) * 0.7));
    }
    if (this.busy) return;
    const cx = Math.floor(camera.position.x / GRASS_CHUNK_SIZE);
    const cz = Math.floor(camera.position.z / GRASS_CHUNK_SIZE);
    let next: { key: string; x: number; z: number } | undefined;
    let nearest = Infinity;
    for (let x = cx - 5; x <= cx + 5; x++) for (let z = cz - 5; z <= cz + 5; z++) {
      const key = `${x}:${z}`;
      if (this.patches.has(key) || Math.hypot((x + 0.5) * 10, (z + 0.5) * 10) > 131) continue;
      const distance = Math.hypot((x + 0.5) * 10 - camera.position.x, (z + 0.5) * 10 - camera.position.z);
      if (distance < nearest) { nearest = distance; next = { key, x, z }; }
    }
    if (!next) return;
    if (this.patches.size >= 160) {
      let farthest = -1;
      let evict = '';
      for (const [key, { mesh }] of this.patches) {
        const distance = mesh.boundingSphere!.center.distanceToSquared(camera.position);
        if (distance > farthest) { farthest = distance; evict = key; }
      }
      const old = this.patches.get(evict)!;
      this.group.remove(old.mesh);
      old.mesh.dispose();
      this.patches.delete(evict);
    }
    this.busy = true;
    this.worker.postMessage({ ...next, density: this.density });
  }
  dispose() {
    this.worker.terminate();
    for (const { mesh } of this.patches.values()) { this.group.remove(mesh); mesh.dispose(); }
    this.patches.clear();
  }
}

export function MeadowGrass() {
  const world = useWorld();
  const { settings } = useGame();
  const reducedMotion = useReducedMotion();
  const geometry = useMemo(() => createBlades(), []);
  const appearance = useMemo(() => new GrassAppearance(), []);
  const group = useRef<THREE.Group>(null);
  const stream = useRef<GrassStream | null>(null);
  const density = settings.resolution <= 1 ? 24 : settings.resolution < 2 ? 60 : 84;
  useEffect(() => {
    const current = new GrassStream(group.current!, geometry, appearance.material, density);
    stream.current = current;
    return () => { current.dispose(); stream.current = null; };
  }, [appearance, geometry, density]);
  useFrame((state) => {
    appearance.update(state.clock.elapsedTime, reducedMotion, world.get(PlayerPosition)!);
    stream.current?.update(state.camera);
  });
  useEffect(() => () => { geometry.dispose(); appearance.material.dispose(); }, [geometry, appearance]);
  return <group ref={group} name='meadow-grass' />;
}
