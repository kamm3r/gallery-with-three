import { useFrame, useThree } from "@react-three/fiber";
import { useImperativeHandle, useMemo, useRef, type Ref } from "react";
import * as THREE from "three";

// Shared effects for the Ash Warden's arena: GPU-drifted embers and ash,
// ground telegraphs for incoming attacks, and pooled impact shockwaves.

export const NOISE_GLSL = /* glsl */ `
  float hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
      mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
      u.y
    );
  }
  float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 5; i++) {
      v += a * noise(p);
      p = p * 2.03 + vec2(17.1, 9.2);
      a *= 0.5;
    }
    return v;
  }
`;

const emberVertex = /* glsl */ `
  attribute vec4 seed;
  uniform float uTime;
  uniform float uHeight;
  uniform float uSpeed;
  uniform float uRadius;
  uniform float uSize;
  uniform float uPixelRatio;
  uniform float uSway;
  varying float vFade;
  varying float vSeed;

  void main() {
    float travel = fract(seed.y + uTime * uSpeed / uHeight);
    vec3 p = vec3(
      seed.x * uRadius + sin(uTime * 0.7 + seed.y * 21.0) * uSway,
      travel * uHeight,
      seed.z * uRadius + cos(uTime * 0.55 + seed.w * 31.0) * uSway
    );
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_PointSize = uSize * seed.w * uPixelRatio * (220.0 / max(-mv.z, 0.1));
    vFade = smoothstep(0.0, 0.12, travel) * (1.0 - smoothstep(0.65, 1.0, travel));
    vSeed = seed.w;
    gl_Position = projectionMatrix * mv;
  }
`;

const emberFragment = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  uniform float uTime;
  varying float vFade;
  varying float vSeed;

  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    if (d > 1.0) discard;
    float core = 1.0 - d;
    float flicker = 0.7 + 0.3 * sin(uTime * 9.0 + vSeed * 40.0);
    gl_FragColor = vec4(uColor * (0.6 + core * 1.6), core * core * vFade * uOpacity * flicker);
  }
`;

interface EmbersProps {
  count: number;
  radius: number;
  height: number;
  /** Units per second; negative drifts downward (falling ash). */
  speed: number;
  size: number;
  color: THREE.ColorRepresentation;
  additive?: boolean;
  sway?: number;
  opacity?: number;
  position?: [number, number, number];
}

export interface EmbersHandle {
  material: THREE.ShaderMaterial;
}

export function Embers({
  count,
  radius,
  height,
  speed,
  size,
  color,
  additive = true,
  sway = 0.4,
  opacity = 1,
  position,
  ref,
}: EmbersProps & { ref?: Ref<EmbersHandle> }) {
  const pixelRatio = useThree((state) => state.gl.getPixelRatio());
  const geometry = useMemo(() => {
    const seeds = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) {
      // Uniform over the disc, so the ring edge isn't sparse.
      const r = Math.sqrt(Math.random()),
        a = Math.random() * Math.PI * 2;
      seeds.set(
        [Math.cos(a) * r, Math.random(), Math.sin(a) * r, 0.4 + Math.random() * 0.8],
        i * 4,
      );
    }
    const result = new THREE.BufferGeometry();
    result.setAttribute("seed", new THREE.BufferAttribute(seeds, 4));
    // Positions are computed in the shader; this only sizes the draw.
    result.setAttribute("position", new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    result.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, height / 2, 0), radius + height);
    return result;
  }, [count, radius, height]);
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: emberVertex,
        fragmentShader: emberFragment,
        transparent: true,
        depthWrite: false,
        blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
        uniforms: {
          uTime: { value: 0 },
          uHeight: { value: height },
          uSpeed: { value: speed },
          uRadius: { value: radius },
          uSize: { value: size },
          uSway: { value: sway },
          uPixelRatio: { value: pixelRatio },
          uColor: { value: new THREE.Color(color) },
          uOpacity: { value: opacity },
        },
      }),
    [additive, color, height, opacity, pixelRatio, radius, size, speed, sway],
  );
  useImperativeHandle(ref, () => ({ material }), [material]);
  useFrame((state) => {
    material.uniforms.uTime.value = state.clock.elapsedTime;
  });
  return (
    <points geometry={geometry} material={material} position={position} frustumCulled={false} />
  );
}

const telegraphVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// Polar sector on the ground. Forward (+Z of the owner) is -Y in plane space
// once the plane is laid flat. A front sweeps outward as the attack nears.
const telegraphFragment = /* glsl */ `
  uniform float uProgress;
  uniform float uHalfArc;
  uniform float uOpacity;
  uniform float uTime;
  uniform vec3 uColor;
  varying vec2 vUv;

  void main() {
    vec2 p = (vUv - 0.5) * 2.0;
    float r = length(p);
    if (r > 1.0) discard;
    float angle = acos(clamp(dot(p / max(r, 1e-4), vec2(0.0, -1.0)), -1.0, 1.0));
    float inside = uHalfArc - angle;
    if (inside < 0.0) discard;
    float rim = smoothstep(0.9, 1.0, r);
    float side = uHalfArc < 3.1 ? smoothstep(0.08, 0.0, inside * max(r, 0.2)) : 0.0;
    float fill = smoothstep(uProgress, uProgress - 0.05, r) * 0.28;
    float front = smoothstep(0.06, 0.0, abs(r - uProgress)) * 0.9;
    float crackle = 0.75 + 0.25 * sin(r * 34.0 - uTime * 7.0 + angle * 5.0);
    float alpha = (max(rim, side) * 0.7 + fill + front) * crackle * uOpacity;
    gl_FragColor = vec4(uColor * (1.0 + front * 2.5), alpha);
  }
`;

export function createTelegraphMaterial(color: THREE.ColorRepresentation = "#ff7a2e") {
  return new THREE.ShaderMaterial({
    vertexShader: telegraphVertex,
    fragmentShader: telegraphFragment,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: {
      uProgress: { value: 0 },
      uHalfArc: { value: Math.PI },
      uOpacity: { value: 0 },
      uTime: { value: 0 },
      uColor: { value: new THREE.Color(color) },
    },
  });
}

/** Unit-radius ground disc; scale it to the attack range. */
export const TELEGRAPH_GEOMETRY = new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2);

const RING_COUNT = 6;
const DEBRIS_COUNT = 320;
const RING_LIFE = 0.6;

const debrisVertex = /* glsl */ `
  attribute float alpha;
  attribute float size;
  uniform float uPixelRatio;
  varying float vAlpha;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = size * uPixelRatio * (220.0 / max(-mv.z, 0.1));
    vAlpha = alpha;
    gl_Position = projectionMatrix * mv;
  }
`;

const debrisFragment = /* glsl */ `
  uniform vec3 uColor;
  varying float vAlpha;
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    if (d > 1.0 || vAlpha <= 0.0) discard;
    gl_FragColor = vec4(uColor * (0.8 + (1.0 - d) * 2.0), (1.0 - d) * vAlpha);
  }
`;

export interface ImpactBurstsHandle {
  /** Shockwave + ember spray on the ground. `force` 0..1 scales everything. */
  spawn: (x: number, z: number, radius: number, force: number) => void;
}

export function ImpactBursts({ ref }: { ref?: Ref<ImpactBurstsHandle> }) {
  const pixelRatio = useThree((state) => state.gl.getPixelRatio());
  const rings = useRef<(THREE.Mesh | null)[]>([]);
  const flash = useRef<THREE.PointLight>(null);
  const state = useMemo(
    () => ({
      ring: Array.from({ length: RING_COUNT }, () => ({ age: RING_LIFE, radius: 1, force: 0 })),
      nextRing: 0,
      velocity: new Float32Array(DEBRIS_COUNT * 3),
      life: new Float32Array(DEBRIS_COUNT),
      maxLife: new Float32Array(DEBRIS_COUNT).fill(1),
      nextDebris: 0,
      flash: 0,
    }),
    [],
  );
  const debris = useMemo(() => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.BufferAttribute(new Float32Array(DEBRIS_COUNT * 3), 3),
    );
    geometry.setAttribute("alpha", new THREE.BufferAttribute(new Float32Array(DEBRIS_COUNT), 1));
    const sizes = new Float32Array(DEBRIS_COUNT);
    for (let i = 0; i < DEBRIS_COUNT; i++) sizes[i] = 0.25 + Math.random() * 0.55;
    geometry.setAttribute("size", new THREE.BufferAttribute(sizes, 1));
    const material = new THREE.ShaderMaterial({
      vertexShader: debrisVertex,
      fragmentShader: debrisFragment,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uColor: { value: new THREE.Color("#ff8a3a") },
        uPixelRatio: { value: pixelRatio },
      },
    });
    return { geometry, material };
  }, [pixelRatio]);
  const ringMaterials = useMemo(
    () =>
      Array.from(
        { length: RING_COUNT },
        () =>
          new THREE.MeshBasicMaterial({
            color: "#ffb36b",
            transparent: true,
            opacity: 0,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
            side: THREE.DoubleSide,
          }),
      ),
    [],
  );
  const ringGeometry = useMemo(() => new THREE.RingGeometry(0.82, 1, 72).rotateX(-Math.PI / 2), []);

  useImperativeHandle(
    ref,
    () => ({
      spawn(x, z, radius, force) {
        const slot = state.nextRing;
        state.nextRing = (slot + 1) % RING_COUNT;
        state.ring[slot] = { age: 0, radius, force };
        rings.current[slot]?.position.set(x, 0.08, z);
        state.flash = Math.max(state.flash, force);
        flash.current?.position.set(x, 1.2, z);
        const position = debris.geometry.getAttribute("position") as THREE.BufferAttribute;
        const count = Math.round(12 + force * 48);
        for (let n = 0; n < count; n++) {
          const i = state.nextDebris;
          state.nextDebris = (i + 1) % DEBRIS_COUNT;
          const a = Math.random() * Math.PI * 2,
            r = Math.random() * radius * 0.6;
          position.setXYZ(i, x + Math.cos(a) * r, 0.1, z + Math.sin(a) * r);
          const out = 2 + Math.random() * 5 * (0.4 + force);
          state.velocity.set(
            [Math.cos(a) * out, 3 + Math.random() * 7 * force, Math.sin(a) * out],
            i * 3,
          );
          state.maxLife[i] = 0.5 + Math.random() * 0.8;
          state.life[i] = state.maxLife[i];
        }
      },
    }),
    [debris, state],
  );

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    state.ring.forEach((ring, i) => {
      ring.age += dt;
      const mesh = rings.current[i];
      if (!mesh) return;
      const t = Math.min(1, ring.age / RING_LIFE);
      mesh.visible = t < 1;
      mesh.scale.setScalar(0.3 + (ring.radius - 0.3) * (1 - Math.pow(1 - t, 3)));
      ringMaterials[i].opacity = Math.pow(1 - t, 1.5) * (0.35 + ring.force * 0.65);
    });
    const position = debris.geometry.getAttribute("position") as THREE.BufferAttribute;
    const alpha = debris.geometry.getAttribute("alpha") as THREE.BufferAttribute;
    for (let i = 0; i < DEBRIS_COUNT; i++) {
      if (state.life[i] <= 0) {
        alpha.setX(i, 0);
        continue;
      }
      state.life[i] -= dt;
      state.velocity[i * 3 + 1] -= 14 * dt;
      const y = Math.max(0.05, position.getY(i) + state.velocity[i * 3 + 1] * dt);
      position.setXYZ(
        i,
        position.getX(i) + state.velocity[i * 3] * dt,
        y,
        position.getZ(i) + state.velocity[i * 3 + 2] * dt,
      );
      alpha.setX(i, Math.max(0, state.life[i] / state.maxLife[i]));
    }
    position.needsUpdate = true;
    alpha.needsUpdate = true;
    state.flash = Math.max(0, state.flash - dt * 4);
    if (flash.current) flash.current.intensity = state.flash * 60;
  });

  return (
    <group>
      {ringMaterials.map((material, i) => (
        <mesh
          key={i}
          ref={(mesh) => {
            rings.current[i] = mesh;
          }}
          geometry={ringGeometry}
          material={material}
          visible={false}
        />
      ))}
      <points geometry={debris.geometry} material={debris.material} frustumCulled={false} />
      <pointLight ref={flash} color="#ff8a3d" intensity={0} distance={14} decay={2} />
    </group>
  );
}
