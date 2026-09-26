import { useFrame, type ThreeElements } from "@react-three/fiber";
import { CuboidCollider, CylinderCollider, RigidBody } from "@react-three/rapier";
import { useEffect, useMemo, useRef, type MutableRefObject } from "react";
import * as THREE from "three";
import type { Encounter } from "../gameplay/bossEncounter";
import { sunlight } from "../gameplay/sunlight";
import { Embers, NOISE_GLSL, type EmbersHandle } from "./ashFx";
import type { AtmosphereSettings } from "./AtmosphereEffect";

// The Ash Warden's arena: a ring of flagstones split by ember-lit cracks,
// ruined pillars and iron braziers, a low ember sun behind the Warden, and
// silhouetted ruins fading into the ash haze. Phase two sets it alight.

const FLOOR_RADIUS = 23;
export const ASH_SUN = new THREE.Vector3(0.22, 0.2, -1).normalize();
const HORIZON = "#4a2b23";
export const ASH_FOG = "#34221e";

export const ASH_ATMOSPHERE: AtmosphereSettings = {
  density: 0.018,
  falloff: 0.11,
  fogStart: 6,
  skyFog: 0.35,
  scatter: 0.55,
  shafts: 0.9,
  shaftDensity: 0.028,
  shaftDistance: 42,
};

function seeded(seed: number) {
  let value = seed >>> 0;
  return () => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

function floorTextures() {
  const size = 1024;
  const make = () => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = size;
    return [canvas, canvas.getContext("2d")!] as const;
  };
  const [baseCanvas, base] = make();
  const [glowCanvas, glow] = make();
  const random = seeded(7);
  const px = size / (2 * FLOOR_RADIUS);
  const c = size / 2;
  base.fillStyle = "#1c1a19";
  base.fillRect(0, 0, size, size);
  glow.fillStyle = "#000";
  glow.fillRect(0, 0, size, size);

  // Concentric courses of flagstones around a central medallion.
  const rings = [0, 3, 5.3, 7.6, 10, 12.5, 15, 17.6, 20.3, 23];
  for (let r = 1; r < rings.length; r++) {
    const inner = rings[r - 1] * px,
      outer = rings[r] * px;
    const mid = (rings[r - 1] + rings[r]) / 2;
    const count = r === 1 ? 1 : Math.max(8, Math.round((2 * Math.PI * mid) / 2.6));
    const offset = random() * Math.PI * 2;
    for (let k = 0; k < count; k++) {
      const a0 = offset + (k / count) * Math.PI * 2,
        a1 = offset + ((k + 1) / count) * Math.PI * 2;
      const shade = 34 + random() * 26;
      base.fillStyle = `rgb(${shade + 6}, ${shade + 2}, ${shade})`;
      base.beginPath();
      if (count === 1) base.arc(c, c, outer, 0, Math.PI * 2);
      else {
        base.arc(c, c, outer, a0, a1);
        base.arc(c, c, inner, a1, a0, true);
      }
      base.closePath();
      base.fill();
      base.strokeStyle = "#0e0c0b";
      base.lineWidth = 3;
      base.stroke();
    }
  }
  // Grit and soot.
  for (let i = 0; i < 26000; i++) {
    const light = random() > 0.5;
    base.fillStyle = light ? "rgba(120,110,100,0.08)" : "rgba(0,0,0,0.16)";
    const s = 1 + random() * 3;
    base.fillRect(random() * size, random() * size, s, s);
  }
  // Scorch rings where old fights burned.
  for (let i = 0; i < 9; i++) {
    const x = c + (random() - 0.5) * size * 0.7,
      y = c + (random() - 0.5) * size * 0.7;
    const gradient = base.createRadialGradient(x, y, 0, x, y, (1.5 + random() * 3) * px);
    gradient.addColorStop(0, "rgba(0,0,0,0.55)");
    gradient.addColorStop(1, "rgba(0,0,0,0)");
    base.fillStyle = gradient;
    base.fillRect(0, 0, size, size);
  }

  // Ember cracks: random walks outward, charred on the albedo, lit on the glow.
  const crack = (x: number, y: number, angle: number, length: number, width: number) => {
    const points: [number, number][] = [[x, y]];
    for (let step = 0; step < length; step++) {
      angle += (random() - 0.5) * 0.9;
      x += Math.cos(angle) * px * 0.45;
      y += Math.sin(angle) * px * 0.45;
      points.push([x, y]);
      if (random() < 0.07 && width > 1.2)
        crack(x, y, angle + (random() - 0.5) * 2, length * 0.4, width * 0.6);
    }
    for (const [context, color, blur, lineWidth] of [
      [base, "#070505", 0, width + 2],
      [glow, "#ff6a1c", 10, width],
      [glow, "#ffd08a", 0, width * 0.35],
    ] as const) {
      context.strokeStyle = color;
      context.lineWidth = lineWidth;
      context.shadowColor = color;
      context.shadowBlur = blur;
      context.lineCap = "round";
      context.lineJoin = "round";
      context.beginPath();
      points.forEach(([px2, py2], i) => (i ? context.lineTo(px2, py2) : context.moveTo(px2, py2)));
      context.stroke();
      context.shadowBlur = 0;
    }
  };
  for (let i = 0; i < 16; i++) {
    const angle = random() * Math.PI * 2,
      start = (1.5 + random() * 6) * px;
    crack(
      c + Math.cos(angle) * start,
      c + Math.sin(angle) * start,
      angle,
      12 + random() * 20,
      2 + random() * 3,
    );
  }

  // Sealing runes around the medallion.
  glow.strokeStyle = "#ff8a3a";
  glow.shadowColor = "#ff6a1c";
  glow.shadowBlur = 8;
  for (const radius of [2.6, 3.4, 6.9]) {
    glow.lineWidth = radius === 6.9 ? 3 : 2;
    glow.beginPath();
    glow.arc(c, c, radius * px, 0, Math.PI * 2);
    glow.stroke();
  }
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    glow.save();
    glow.translate(c + Math.cos(a) * 3 * px, c + Math.sin(a) * 3 * px);
    glow.rotate(a);
    glow.lineWidth = 2;
    glow.beginPath();
    const shape = i % 4;
    if (shape === 0) {
      glow.moveTo(-6, -6);
      glow.lineTo(6, 0);
      glow.lineTo(-6, 6);
    } else if (shape === 1) {
      glow.moveTo(-6, 0);
      glow.lineTo(6, 0);
      glow.moveTo(0, -6);
      glow.lineTo(0, 6);
    } else if (shape === 2) {
      glow.arc(0, 0, 5, 0, Math.PI * 1.5);
    } else {
      glow.moveTo(-6, 6);
      glow.lineTo(0, -6);
      glow.lineTo(6, 6);
    }
    glow.stroke();
    glow.restore();
  }

  const map = new THREE.CanvasTexture(baseCanvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 8;
  const emissiveMap = new THREE.CanvasTexture(glowCanvas);
  emissiveMap.colorSpace = THREE.SRGBColorSpace;
  return { map, emissiveMap };
}

const skyVertex = /* glsl */ `
  varying vec3 vDirection;
  void main() {
    vDirection = normalize(position);
    vec4 clip = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_Position = clip.xyww;
  }
`;

const skyFragment = /* glsl */ `
  uniform vec3 uSun;
  uniform vec3 uHorizon;
  uniform float uTime;
  uniform float uEnrage;
  varying vec3 vDirection;
  ${NOISE_GLSL}

  void main() {
    vec3 dir = normalize(vDirection);
    float height = max(dir.y, 0.0);
    vec3 zenith = mix(vec3(0.018, 0.02, 0.03), vec3(0.05, 0.012, 0.01), uEnrage);
    vec3 horizon = mix(uHorizon, uHorizon * vec3(1.6, 0.8, 0.6), uEnrage);
    vec3 color = mix(horizon, zenith, pow(height, 0.45));
    float toward = max(dot(dir, uSun), 0.0);
    // Ember sun: hard disc, hot corona, and a wide smoulder in the haze.
    color += vec3(1.0, 0.36, 0.12) * pow(toward, 8.0) * 0.55;
    color += vec3(1.4, 0.55, 0.2) * pow(toward, 90.0) * 1.2;
    color += vec3(5.0, 2.4, 1.0) * smoothstep(0.9987, 0.9992, toward);
    // Slow smoke bands dim everything but the sun's core.
    vec2 flow = dir.xz / max(dir.y + 0.25, 0.05) * 0.6;
    float smoke = fbm(flow + vec2(uTime * 0.01, uTime * 0.004));
    color *= mix(1.0, 0.55, smoothstep(0.45, 0.85, smoke) * smoothstep(0.02, 0.25, height));
    // Below the horizon, fade into the ground haze.
    color = mix(color, uHorizon * 0.6, smoothstep(0.0, -0.08, dir.y));
    gl_FragColor = vec4(color, 1.0);
  }
`;

const fireVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fireFragment = /* glsl */ `
  uniform float uTime;
  uniform float uSeed;
  varying vec2 vUv;
  ${NOISE_GLSL}

  void main() {
    vec2 uv = vUv;
    float n = fbm(vec2(uv.x * 3.0 + uSeed, uv.y * 2.2 - uTime * 2.4));
    float width = abs(uv.x - 0.5) * (1.6 + uv.y * 2.4);
    float body = (1.0 - uv.y) * smoothstep(0.5, 0.05, width);
    float flame = smoothstep(0.2, 0.75, body * (0.55 + n * 0.9));
    vec3 color = mix(vec3(1.4, 0.28, 0.04), vec3(2.6, 1.6, 0.7), flame * flame);
    gl_FragColor = vec4(color * flame * 1.6, flame);
  }
`;

/** Billboard-ish flame for a crossed pair of planes; drive `uTime` per frame. */
export function createFireMaterial(seed: number) {
  return new THREE.ShaderMaterial({
    vertexShader: fireVertex,
    fragmentShader: fireFragment,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: { uTime: { value: 0 }, uSeed: { value: seed * 13.7 } },
  });
}

function Brazier({ position, seed }: { position: [number, number, number]; seed: number }) {
  const light = useRef<THREE.PointLight>(null);
  const material = useMemo(() => createFireMaterial(seed), [seed]);
  useEffect(() => () => material.dispose(), [material]);
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    material.uniforms.uTime.value = t;
    if (light.current)
      light.current.intensity =
        22 + Math.sin(t * 11 + seed) * 3 + Math.sin(t * 23.7 + seed * 2) * 2.5;
  });
  return (
    <RigidBody type="fixed" colliders={false} position={position}>
      <CylinderCollider args={[0.9, 0.55]} position={[0, 0.9, 0]} />
      {[0, 1, 2].map((i) => {
        const a = (i / 3) * Math.PI * 2;
        return (
          <mesh
            key={i}
            position={[Math.sin(a) * 0.32, 0.6, Math.cos(a) * 0.32]}
            rotation={[Math.cos(a) * 0.25, 0, -Math.sin(a) * 0.25]}
            castShadow
          >
            <cylinderGeometry args={[0.05, 0.07, 1.25, 6]} />
            <meshStandardMaterial color="#1b1716" metalness={0.7} roughness={0.5} />
          </mesh>
        );
      })}
      <mesh position={[0, 1.3, 0]} castShadow>
        <cylinderGeometry args={[0.68, 0.36, 0.42, 14, 1, true]} />
        <meshStandardMaterial
          color="#231d1a"
          metalness={0.7}
          roughness={0.45}
          side={THREE.DoubleSide}
        />
      </mesh>
      <mesh position={[0, 1.4, 0]}>
        <cylinderGeometry args={[0.6, 0.6, 0.06, 14]} />
        <meshStandardMaterial color="#ff8a3a" emissive="#ff5a1a" emissiveIntensity={4} />
      </mesh>
      {[0, Math.PI / 2].map((yaw) => (
        <mesh key={yaw} position={[0, 2.15, 0]} rotation={[0, yaw, 0]} material={material}>
          <planeGeometry args={[1.25, 1.6]} />
        </mesh>
      ))}
      <Embers
        count={24}
        radius={0.35}
        height={3.2}
        speed={1.6}
        size={0.2}
        color="#ff8030"
        position={[0, 1.6, 0]}
      />
      <pointLight
        ref={light}
        position={[0, 2.3, 0]}
        color="#ff7a32"
        intensity={22}
        distance={13}
        decay={2}
      />
    </RigidBody>
  );
}

function RuinedPillar({
  angle,
  height,
  broken,
}: {
  angle: number;
  height: number;
  broken: boolean;
}) {
  const x = Math.sin(angle) * 19,
    z = Math.cos(angle) * 19;
  return (
    <RigidBody type="fixed" colliders={false} position={[x, 0, z]} rotation={[0, angle, 0]}>
      <CuboidCollider args={[0.9, height / 2, 0.9]} position={[0, height / 2, 0]} />
      <mesh position={[0, 0.3, 0]} castShadow receiveShadow>
        <boxGeometry args={[2, 0.6, 2]} />
        <meshStandardMaterial color="#35302d" roughness={0.95} />
      </mesh>
      <mesh position={[0, 0.3 + (height - 0.6) / 2, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.66, 0.74, height - 0.6, 10]} />
        <meshStandardMaterial color="#3d3834" roughness={0.9} flatShading />
      </mesh>
      {broken ? (
        <mesh position={[0.1, height + 0.15, 0]} rotation={[0.3, 0.4, 0.5]} castShadow>
          <coneGeometry args={[0.68, 0.9, 6]} />
          <meshStandardMaterial color="#3d3834" roughness={0.9} flatShading />
        </mesh>
      ) : (
        <>
          <mesh position={[0, height + 0.15, 0]} castShadow>
            <boxGeometry args={[1.8, 0.4, 1.8]} />
            <meshStandardMaterial color="#35302d" roughness={0.95} />
          </mesh>
          {/* Iron chains that once held the Warden. */}
          <mesh position={[0, height - 0.9, 0.78]} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.72, 0.06, 6, 16]} />
            <meshStandardMaterial color="#1e1a18" metalness={0.8} roughness={0.5} />
          </mesh>
        </>
      )}
      {/* Ivy of ash: soot streaking down the shaft. */}
      <mesh position={[0, height * 0.35, 0.75]}>
        <planeGeometry args={[0.8, height * 0.7]} />
        <meshStandardMaterial color="#0d0b0a" transparent opacity={0.35} depthWrite={false} />
      </mesh>
    </RigidBody>
  );
}

function DistantRuins() {
  const pieces = useMemo(() => {
    const random = seeded(31);
    return Array.from({ length: 26 }, (_, i) => {
      const angle = (i / 26) * Math.PI * 2 + random() * 0.15;
      const radius = 40 + random() * 34;
      return {
        x: Math.sin(angle) * radius,
        z: Math.cos(angle) * radius,
        yaw: angle + Math.PI / 2,
        kind: i % 3,
        height: 10 + random() * 26,
        lean: (random() - 0.5) * 0.25,
      };
    });
  }, []);
  return (
    <group>
      {pieces.map((piece, i) => (
        <group key={i} position={[piece.x, 0, piece.z]} rotation={[0, piece.yaw, piece.lean]}>
          {piece.kind === 0 ? (
            // Broken arch.
            <>
              {[-3.2, 3.2].map((x) => (
                <mesh key={x} position={[x, piece.height / 2, 0]}>
                  <boxGeometry args={[1.8, piece.height, 2.2]} />
                  <meshStandardMaterial color="#1c1a1b" roughness={1} />
                </mesh>
              ))}
              <mesh position={[-0.6, piece.height + 0.7, 0]} rotation={[0, 0, 0.12]}>
                <boxGeometry args={[6.4, 1.6, 2.2]} />
                <meshStandardMaterial color="#1c1a1b" roughness={1} />
              </mesh>
            </>
          ) : piece.kind === 1 ? (
            // Ruined tower.
            <>
              <mesh position={[0, piece.height / 2, 0]}>
                <cylinderGeometry args={[2.4, 3.2, piece.height, 8]} />
                <meshStandardMaterial color="#1a1819" roughness={1} flatShading />
              </mesh>
              <mesh position={[0.6, piece.height + 1.2, 0]} rotation={[0.2, 0, 0.35]}>
                <coneGeometry args={[2.3, 3.2, 6]} />
                <meshStandardMaterial color="#1a1819" roughness={1} flatShading />
              </mesh>
            </>
          ) : (
            // Toppled slab.
            <mesh position={[0, piece.height * 0.3, 0]} rotation={[0, 0, 0.5]}>
              <boxGeometry args={[3, piece.height * 0.7, 1.6]} />
              <meshStandardMaterial color="#1e1b1b" roughness={1} />
            </mesh>
          )}
        </group>
      ))}
    </group>
  );
}

export function AshArena({ combat }: { combat: MutableRefObject<Encounter> }) {
  const textures = useMemo(floorTextures, []);
  useEffect(
    () => () => {
      textures.map.dispose();
      textures.emissiveMap.dispose();
    },
    [textures],
  );
  const floor = useRef<THREE.MeshStandardMaterial>(null);
  const embers = useRef<EmbersHandle>(null);
  const skyMaterial = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: skyVertex,
        fragmentShader: skyFragment,
        side: THREE.BackSide,
        depthWrite: false,
        uniforms: {
          uSun: { value: ASH_SUN },
          uHorizon: { value: new THREE.Color(HORIZON) },
          uTime: { value: 0 },
          uEnrage: { value: 0 },
        },
      }),
    [],
  );
  useEffect(() => () => skyMaterial.dispose(), [skyMaterial]);
  const fx = useRef({ enrage: 0, pulse: 0, lastImpact: 0 });

  // The post haze reads its tint from the shared sun state; claim it here.
  useEffect(() => {
    const previous = sunlight.fogColor.value.clone();
    sunlight.fogColor.value.set(ASH_FOG);
    return () => {
      sunlight.fogColor.value.copy(previous);
    };
  }, []);

  const pillars = useMemo(
    () =>
      Array.from({ length: 14 }, (_, i) => {
        const height = 4 + Math.abs(Math.sin(i * 2.7)) * 5;
        return { angle: ((i + 1) / 16) * Math.PI * 2, height, broken: height < 6.2 };
      }),
    [],
  );

  useFrame((state, delta) => {
    const s = combat.current;
    const f = fx.current;
    const dt = Math.min(delta, 0.05);
    f.enrage = THREE.MathUtils.damp(f.enrage, s.enraged && s.phase !== "defeated" ? 1 : 0, 1.2, dt);
    if (s.impactId !== f.lastImpact) {
      f.lastImpact = s.impactId;
      f.pulse = Math.max(f.pulse, s.impactForce);
    }
    f.pulse = Math.max(0, f.pulse - dt * 1.8);
    const t = state.clock.elapsedTime;
    if (floor.current)
      floor.current.emissiveIntensity =
        0.2 + f.enrage * 1.4 + f.pulse * 2.5 + Math.sin(t * 1.4) * 0.08;
    skyMaterial.uniforms.uTime.value = t;
    skyMaterial.uniforms.uEnrage.value = f.enrage;
    if (embers.current) embers.current.material.uniforms.uOpacity.value = 0.45 + f.enrage * 0.9;
  });

  return (
    <>
      <fog attach="fog" args={[ASH_FOG, 24, 95]} />
      <hemisphereLight args={["#6f7892", "#2a1b16", 0.75]} />
      <directionalLight
        position={ASH_SUN.clone().multiplyScalar(40).toArray()}
        intensity={2.4}
        color="#ff9f68"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-26}
        shadow-camera-right={26}
        shadow-camera-top={26}
        shadow-camera-bottom={-26}
        shadow-camera-far={90}
        shadow-bias={-0.0004}
      />
      {/* Cool rim from the gate side so the Warden's front never goes black. */}
      <directionalLight position={[-6, 9, 22]} intensity={0.55} color="#8193c4" />
      <mesh material={skyMaterial} frustumCulled={false} renderOrder={-1}>
        <sphereGeometry args={[300, 32, 16]} />
      </mesh>

      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider args={[40, 0.5, 40]} position={[0, -0.5, 0]} />
      </RigidBody>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[FLOOR_RADIUS, 96]} />
        <meshStandardMaterial
          ref={floor}
          map={textures.map}
          emissiveMap={textures.emissiveMap}
          emissive="#ff5a1f"
          emissiveIntensity={0.2}
          roughness={0.9}
        />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]} receiveShadow>
        <ringGeometry args={[FLOOR_RADIUS - 0.2, 260, 64]} />
        <meshStandardMaterial color="#1a1614" roughness={1} />
      </mesh>
      {/* Raised curb framing the arena floor. */}
      <mesh position={[0, 0.12, 0]} receiveShadow castShadow>
        <torusGeometry args={[FLOOR_RADIUS, 0.3, 6, 96]} />
        <meshStandardMaterial color="#2b2725" roughness={0.95} />
      </mesh>

      {pillars.map((pillar, i) => (
        <RuinedPillar key={i} {...pillar} />
      ))}
      {[
        [11.7, 11.7],
        [-11.7, 11.7],
        [11.7, -11.7],
        [-11.7, -11.7],
      ].map(([x, z], i) => (
        <Brazier key={i} position={[x, 0, z]} seed={i} />
      ))}
      <DistantRuins />

      <Embers
        count={900}
        radius={32}
        height={18}
        speed={-0.7}
        size={0.12}
        color="#8f877f"
        additive={false}
        sway={1.2}
        opacity={0.7}
      />
      <Embers
        ref={embers}
        count={260}
        radius={22}
        height={11}
        speed={1.1}
        size={0.2}
        color="#ff7a2a"
        opacity={0.45}
      />
    </>
  );
}

const fogVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fogFragment = /* glsl */ `
  uniform float uTime;
  uniform float uActive;
  uniform float uLayer;
  varying vec2 vUv;
  ${NOISE_GLSL}

  void main() {
    vec2 p = vUv * vec2(2.4, 2.0) + uLayer * 3.7;
    float drift = uTime * (0.12 + uActive * 0.1);
    float warp = fbm(p + vec2(drift, -drift * 0.4));
    float mist = fbm(p * 1.7 + warp * 1.8 - vec2(drift * 0.6, drift));
    mist = smoothstep(0.25, 0.9, mist);
    float edge = smoothstep(0.0, 0.14, vUv.x) * smoothstep(1.0, 0.86, vUv.x)
      * smoothstep(0.0, 0.08, vUv.y) * smoothstep(1.0, 0.9, vUv.y);
    vec3 color = mix(vec3(0.45, 0.43, 0.4), vec3(1.25, 1.12, 0.88), mist) * (1.0 + uActive * 0.5);
    gl_FragColor = vec4(color, (0.5 + mist * 0.45) * edge * (0.75 + uLayer * 0.25));
  }
`;

/**
 * Soulslike fog wall in a ruined stone gate. Visual only: pair it with a
 * PortalFrameCollider at the same transform. Local frame matches PortalPainting.
 */
export function FogGate({
  active = false,
  ...props
}: { active?: boolean } & ThreeElements["group"]) {
  const light = useRef<THREE.PointLight>(null);
  const layers = useMemo(
    () =>
      [0, 1].map(
        (layer) =>
          new THREE.ShaderMaterial({
            vertexShader: fogVertex,
            fragmentShader: fogFragment,
            transparent: true,
            depthWrite: false,
            side: THREE.DoubleSide,
            uniforms: { uTime: { value: 0 }, uActive: { value: 0 }, uLayer: { value: layer } },
          }),
      ),
    [],
  );
  useEffect(() => () => layers.forEach((material) => material.dispose()), [layers]);
  useFrame((state, delta) => {
    for (const material of layers) {
      material.uniforms.uTime.value = state.clock.elapsedTime;
      material.uniforms.uActive.value = THREE.MathUtils.damp(
        material.uniforms.uActive.value,
        active ? 1 : 0,
        5,
        delta,
      );
    }
    if (light.current) light.current.intensity = 8 + layers[0].uniforms.uActive.value * 10;
  });
  const stone = <meshStandardMaterial color="#3a3531" roughness={0.92} flatShading />;
  return (
    <group {...props}>
      {[-1, 1].map((side) => (
        <group key={side} position={[side * 2.95, 0, 0]}>
          <mesh position={[0, 0.1, 0]} castShadow receiveShadow>
            <boxGeometry args={[0.7, 4.6, 0.9]} />
            {stone}
          </mesh>
          <mesh position={[0, -1.95, 0]} castShadow>
            <boxGeometry args={[1, 0.5, 1.2]} />
            {stone}
          </mesh>
          <mesh position={[side * 0.05, 1.9, 0.5]}>
            <boxGeometry args={[0.2, 0.2, 0.1]} />
            <meshStandardMaterial color="#ffb070" emissive="#ff6a2a" emissiveIntensity={3} />
          </mesh>
        </group>
      ))}
      <mesh position={[0, 2.5, 0]} castShadow>
        <boxGeometry args={[7, 0.6, 1.05]} />
        {stone}
      </mesh>
      <mesh position={[0, 3.05, 0]} rotation={[0, 0, Math.PI / 4]} castShadow>
        <boxGeometry args={[0.7, 0.7, 1.1]} />
        {stone}
      </mesh>
      <mesh position={[0, -2.02, 0]} receiveShadow>
        <boxGeometry args={[5.9, 0.3, 1.1]} />
        {stone}
      </mesh>
      {layers.map((material, i) => (
        <mesh key={i} position={[0, 0.05, (i - 0.5) * 0.18]} material={material}>
          <planeGeometry args={[5.2, 4.1]} />
        </mesh>
      ))}
      <group position={[0, -2, 0]} scale={[1, 1, 0.25]}>
        <Embers
          count={50}
          radius={2.4}
          height={1.6}
          speed={0.25}
          size={1.4}
          color="#3a3834"
          sway={0.6}
        />
      </group>
      <pointLight
        ref={light}
        position={[0, 0, 1.6]}
        color="#f3e2bf"
        intensity={8}
        distance={9}
        decay={2}
      />
    </group>
  );
}
