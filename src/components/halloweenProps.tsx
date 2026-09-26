import { useFrame } from "@react-three/fiber";
import { CuboidCollider, RigidBody } from "@react-three/rapier";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { Point, Rect } from "../gameplay/hollowLane";
import { NOISE_GLSL } from "./ashFx";

// Shared Halloween set dressing: a moonlit storm sky, crawling ground mist,
// bats, sheet ghosts, jack-o'-lantern geometry and an iron-fenced graveyard.

export const MOON = new THREE.Vector3(-0.3, 0.3, -1).normalize();

/**
 * Night-wide effect levels, written once per frame by the world and read by
 * the sky, mist and HUD without re-rendering React.
 */
export const nightFx = {
  /** 0..1 fade to the warm "you made it" look. */
  won: 0,
  /** 0..1 when the moon is hidden. */
  dark: 0,
  /** Lightning brightness. */
  flash: 0,
  /** 0..1, how close the killer is. */
  danger: 0,
};

export function seeded(seed: number) {
  let value = seed >>> 0;
  return () => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return value / 4294967296;
  };
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
  uniform vec3 uMoon;
  uniform float uTime;
  uniform float uWon;
  uniform float uDark;
  uniform float uFlash;
  varying vec3 vDirection;
  ${NOISE_GLSL}

  void main() {
    vec3 dir = normalize(vDirection);
    float height = max(dir.y, 0.0);
    vec3 zenith = vec3(0.008, 0.008, 0.022);
    vec3 horizon = mix(vec3(0.1, 0.085, 0.16), vec3(0.2, 0.08, 0.04), uWon);
    vec3 color = mix(horizon, zenith, pow(height, 0.5));

    vec2 starCell = floor(dir.xz / (dir.y + 0.35) * 90.0);
    float star = step(0.9965, hash(starCell)) * smoothstep(0.08, 0.35, height);
    color += star * (0.45 + 0.35 * sin(uTime * 2.3 + hash(starCell + 3.1) * 40.0));

    float toward = dot(dir, uMoon);
    vec3 moonColor = mix(vec3(0.82, 0.96, 0.78), vec3(1.5, 0.6, 0.2), uWon);
    color += moonColor * pow(max(toward, 0.0), 24.0) * 0.22;
    color += moonColor * pow(max(toward, 0.0), 500.0) * 0.6;
    vec3 u = normalize(cross(uMoon, vec3(0.0, 1.0, 0.0)));
    vec3 v = cross(u, uMoon);
    vec2 surface = vec2(dot(dir, u), dot(dir, v)) * 34.0;
    float craters = fbm(surface * 1.6 + 4.0);
    float disc = smoothstep(0.9962, 0.9967, toward) * (1.0 - uDark);
    color = mix(color, moonColor * (1.2 + craters * 1.4), disc);

    // Ragged clouds scud across, catching a silver rim near the moon.
    vec2 flow = dir.xz / max(dir.y + 0.18, 0.05) * 0.8;
    float cloud = fbm(flow + vec2(uTime * 0.018, uTime * 0.007));
    float cover = smoothstep(0.48, 0.78, cloud) * smoothstep(0.0, 0.22, height);
    vec3 cloudColor = mix(vec3(0.025, 0.022, 0.04), moonColor * 0.4, pow(max(toward, 0.0), 14.0));
    color = mix(color, cloudColor, cover * 0.88);

    color = mix(color, horizon * 0.6, smoothstep(0.0, -0.08, dir.y));
    // The moon hiding takes the whole sky with it; lightning lights the clouds.
    color *= 1.0 - uDark * 0.8;
    color += vec3(0.55, 0.6, 0.9) * uFlash * (0.25 + cover * 1.4) * smoothstep(-0.05, 0.3, dir.y);
    gl_FragColor = vec4(color, 1.0);
  }
`;

export function createSkyMaterial() {
  return new THREE.ShaderMaterial({
    vertexShader: skyVertex,
    fragmentShader: skyFragment,
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      uMoon: { value: MOON },
      uTime: { value: 0 },
      uWon: { value: 0 },
      uDark: { value: 0 },
      uFlash: { value: 0 },
    },
  });
}

const mistVertex = /* glsl */ `
  varying vec3 vWorld;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const mistFragment = /* glsl */ `
  uniform float uTime;
  uniform float uLayer;
  uniform float uOpacity;
  uniform float uWon;
  uniform float uDark;
  uniform float uSize;
  varying vec3 vWorld;
  ${NOISE_GLSL}

  void main() {
    vec2 p = vWorld.xz * 0.055 + uLayer * 7.1;
    float drift = uTime * 0.035;
    float warp = fbm(p + vec2(drift, -drift * 0.6));
    float mist = fbm(p * 1.7 + warp * 2.0 - vec2(drift * 0.8, drift));
    mist = smoothstep(0.3, 0.85, mist);
    float edge = 1.0 - smoothstep(uSize * 0.4, uSize * 0.5, max(abs(vWorld.x), abs(vWorld.z)));
    vec3 color = mix(vec3(0.1, 0.11, 0.17), vec3(0.2, 0.11, 0.07), uWon);
    gl_FragColor = vec4(color * (1.0 - uDark * 0.6), mist * edge * uOpacity);
  }
`;

export function GroundMist({ size, opacity = 1 }: { size: number; opacity?: number }) {
  const layers = useMemo(
    () =>
      [
        [0.22, 0.5],
        [0.95, 0.22],
      ].map(
        ([height, layerOpacity], layer) =>
          [
            height,
            new THREE.ShaderMaterial({
              vertexShader: mistVertex,
              fragmentShader: mistFragment,
              transparent: true,
              depthWrite: false,
              uniforms: {
                uTime: { value: 0 },
                uLayer: { value: layer },
                uOpacity: { value: layerOpacity * opacity },
                uWon: { value: 0 },
                uDark: { value: 0 },
                uSize: { value: size },
              },
            }),
          ] as const,
      ),
    [size, opacity],
  );
  useEffect(() => () => layers.forEach(([, material]) => material.dispose()), [layers]);
  useFrame((state) => {
    for (const [, material] of layers) {
      material.uniforms.uTime.value = state.clock.elapsedTime;
      material.uniforms.uWon.value = nightFx.won;
      material.uniforms.uDark.value = nightFx.dark;
    }
  });
  return (
    <>
      {layers.map(([height, material], i) => (
        <mesh
          key={i}
          position-y={height}
          rotation-x={-Math.PI / 2}
          material={material}
          renderOrder={2}
        >
          <planeGeometry args={[size, size]} />
        </mesh>
      ))}
    </>
  );
}

export function usePumpkinGeometry() {
  const geometry = useMemo(() => {
    const body = (() => {
      const parts: THREE.BufferGeometry[] = [];
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        parts.push(
          new THREE.SphereGeometry(0.3, 10, 8)
            .scale(0.72, 1.25, 0.72)
            .translate(Math.sin(a) * 0.23, 0.4, Math.cos(a) * 0.23),
        );
      }
      const result = mergeGeometries(parts)!;
      parts.forEach((part) => part.dispose());
      return result;
    })();
    const shapes = [
      [
        [-0.27, 0.48],
        [-0.08, 0.48],
        [-0.17, 0.64],
      ],
      [
        [0.08, 0.48],
        [0.27, 0.48],
        [0.17, 0.64],
      ],
      [
        [-0.24, 0.33],
        [-0.13, 0.18],
        [0.13, 0.18],
        [0.24, 0.33],
        [0.08, 0.28],
        [0, 0.33],
        [-0.08, 0.28],
      ],
    ].map((points) => new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y))));
    const face = new THREE.ShapeGeometry(shapes).translate(0, 0, 0.445);
    return { body, face };
  }, []);
  useEffect(
    () => () => {
      geometry.body.dispose();
      geometry.face.dispose();
    },
    [geometry],
  );
  return geometry;
}

/** Iron-fenced graveyard filling `area`, with a gate gap on its east side. */
export function Graveyard({ area, gate = 2 }: { area: Rect; gate?: number }) {
  const stones = useMemo(() => {
    const random = seeded(19);
    const columns = Math.floor((area.hx * 2 - 3) / 2.4),
      rows = Math.floor((area.hz * 2 - 3) / 2.8);
    return Array.from({ length: columns * rows }, (_, i) => ({
      x: area.x - area.hx + 2 + (i % columns) * 2.4 + (random() - 0.5) * 0.6,
      z: area.z - area.hz + 2 + Math.floor(i / columns) * 2.8 + (random() - 0.5) * 0.6,
      kind: Math.floor(random() * 4),
      tilt: (random() - 0.5) * 0.3,
      yaw: (random() - 0.5) * 0.4,
      scale: 0.85 + random() * 0.4,
    }));
  }, []);
  const stone = <meshStandardMaterial color="#5d5b66" roughness={1} flatShading />;
  const fence = useMemo(() => {
    const posts: [number, number][] = [];
    const { x, z, hx: halfX, hz: halfZ } = area;
    const step = 0.32;
    for (let px = -halfX; px <= halfX; px += step) {
      posts.push([x + px, z - halfZ], [x + px, z + halfZ]);
    }
    for (let pz = -halfZ + step; pz < halfZ; pz += step) {
      posts.push([x - halfX, z + pz]);
      // Gate gap on the east side, facing the path in.
      if (Math.abs(pz) > gate) posts.push([x + halfX, z + pz]);
    }
    return posts;
  }, []);
  const bars = useRef<THREE.InstancedMesh>(null);
  const tips = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const transform = new THREE.Object3D();
    fence.forEach(([x, z], i) => {
      transform.position.set(x, 0.7, z);
      transform.rotation.set(0, 0, Math.sin(i * 1.7) * 0.04);
      transform.updateMatrix();
      bars.current!.setMatrixAt(i, transform.matrix);
      transform.position.y = 1.45;
      transform.updateMatrix();
      tips.current!.setMatrixAt(i, transform.matrix);
    });
    for (const mesh of [bars.current!, tips.current!]) {
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
    }
  }, [fence]);
  const { x, z, hx: halfX, hz: halfZ } = area;
  const iron = <meshStandardMaterial color="#141217" metalness={0.8} roughness={0.5} />;
  return (
    <>
      <instancedMesh ref={bars} args={[undefined, undefined, fence.length]} castShadow>
        <boxGeometry args={[0.05, 1.4, 0.05]} />
        {iron}
      </instancedMesh>
      <instancedMesh ref={tips} args={[undefined, undefined, fence.length]}>
        <coneGeometry args={[0.06, 0.16, 4]} />
        {iron}
      </instancedMesh>
      {[0.35, 1.15].map((y) => (
        <group key={y}>
          {[
            [x, z - halfZ, halfX * 2, 0.05],
            [x, z + halfZ, halfX * 2, 0.05],
            [x - halfX, z, 0.05, halfZ * 2],
            [x + halfX, z - (halfZ + gate) / 2, 0.05, halfZ - gate],
            [x + halfX, z + (halfZ + gate) / 2, 0.05, halfZ - gate],
          ].map(([cx, cz, w, d], i) => (
            <mesh key={i} position={[cx, y, cz]}>
              <boxGeometry args={[w, 0.05, d]} />
              {iron}
            </mesh>
          ))}
        </group>
      ))}
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider args={[halfX, 0.8, 0.08]} position={[x, 0.8, z - halfZ]} />
        <CuboidCollider args={[halfX, 0.8, 0.08]} position={[x, 0.8, z + halfZ]} />
        <CuboidCollider args={[0.08, 0.8, halfZ]} position={[x - halfX, 0.8, z]} />
        <CuboidCollider
          args={[0.08, 0.8, (halfZ - gate) / 2]}
          position={[x + halfX, 0.8, z - (halfZ + gate) / 2]}
        />
        <CuboidCollider
          args={[0.08, 0.8, (halfZ - gate) / 2]}
          position={[x + halfX, 0.8, z + (halfZ + gate) / 2]}
        />
      </RigidBody>
      {stones.map((s, i) => (
        <RigidBody
          key={i}
          type="fixed"
          colliders="cuboid"
          position={[s.x, 0, s.z]}
          rotation={[s.tilt * 0.4, Math.PI / 2 + s.yaw, s.tilt]}
          scale={s.scale}
        >
          {s.kind === 0 ? (
            <>
              <mesh position-y={0.5} castShadow receiveShadow>
                <boxGeometry args={[0.7, 1, 0.2]} />
                {stone}
              </mesh>
              <mesh position-y={1} rotation-x={Math.PI / 2} castShadow>
                <cylinderGeometry args={[0.35, 0.35, 0.2, 12, 1, false, -Math.PI / 2, Math.PI]} />
                {stone}
              </mesh>
            </>
          ) : s.kind === 1 ? (
            <>
              <mesh position-y={0.7} castShadow>
                <boxGeometry args={[0.16, 1.4, 0.16]} />
                {stone}
              </mesh>
              <mesh position-y={1.05} castShadow>
                <boxGeometry args={[0.7, 0.16, 0.16]} />
                {stone}
              </mesh>
            </>
          ) : s.kind === 2 ? (
            <>
              <mesh position-y={0.8} castShadow>
                <boxGeometry args={[0.4, 1.6, 0.4]} />
                {stone}
              </mesh>
              <mesh position-y={1.8} rotation-y={Math.PI / 4} castShadow>
                <coneGeometry args={[0.3, 0.4, 4]} />
                {stone}
              </mesh>
            </>
          ) : (
            <mesh position-y={0.4} castShadow receiveShadow>
              <boxGeometry args={[0.85, 0.8, 0.25]} />
              {stone}
            </mesh>
          )}
        </RigidBody>
      ))}
      {/* A freshly dug grave with the shovel still in it. */}
      <group position={[x + 3.2, 0, z + 2.8]} rotation-y={0.3}>
        <mesh position-y={0.05} rotation-x={-Math.PI / 2}>
          <planeGeometry args={[1, 2]} />
          <meshBasicMaterial color="#050404" />
        </mesh>
        <mesh position={[0.9, 0.15, 0]} scale={[0.5, 0.3, 1.1]} castShadow>
          <sphereGeometry args={[1, 10, 8]} />
          <meshStandardMaterial color="#2b2019" roughness={1} />
        </mesh>
        <group position={[1, 0.5, 0.4]} rotation={[0.2, 0, -0.35]}>
          <mesh position-y={0.4} castShadow>
            <cylinderGeometry args={[0.03, 0.03, 1.2, 5]} />
            <meshStandardMaterial color="#4a3526" />
          </mesh>
          <mesh position-y={-0.3}>
            <boxGeometry args={[0.3, 0.35, 0.03]} />
            {iron}
          </mesh>
        </group>
      </group>
    </>
  );
}

function makeGhostGeometry() {
  const profile = [
    [0, 1.1],
    [0.22, 1.06],
    [0.36, 0.88],
    [0.42, 0.55],
    [0.46, 0.1],
    [0.56, -0.4],
    [0.62, -0.75],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const geometry = new THREE.LatheGeometry(profile, 24);
  const position = geometry.getAttribute("position");
  for (let i = 0; i < position.count; i++) {
    const y = position.getY(i);
    if (y > -0.35) continue;
    const angle = Math.atan2(position.getZ(i), position.getX(i));
    position.setY(i, y + Math.sin(angle * 7) * 0.12);
  }
  geometry.computeVertexNormals();
  return geometry;
}

/** Sheet ghosts circling `center`. */
export function Ghosts({ center, reducedMotion }: { center: Point; reducedMotion: boolean }) {
  const geometry = useMemo(makeGhostGeometry, []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  const ghosts = useRef<(THREE.Group | null)[]>([]);
  const orbits = [
    { radius: 5.5, height: 3.4, speed: 0.35, phase: 0 },
    { radius: 7, height: 4.6, speed: -0.25, phase: 2.1 },
    { radius: 4.2, height: 5.6, speed: 0.45, phase: 4.2 },
  ];
  useFrame((state) => {
    const t = state.clock.elapsedTime * (reducedMotion ? 0.3 : 1);
    orbits.forEach((orbit, i) => {
      const ghost = ghosts.current[i];
      if (!ghost) return;
      const a = orbit.phase + t * orbit.speed;
      ghost.position.set(
        center.x + Math.cos(a) * orbit.radius,
        orbit.height + Math.sin(t * 1.3 + i) * 0.4,
        center.z + Math.sin(a) * orbit.radius,
      );
      // Face along the orbit and lean into the turn.
      ghost.rotation.set(0, -a + (orbit.speed > 0 ? 0 : Math.PI), Math.sign(orbit.speed) * 0.2);
      ghost.scale.set(1 + Math.sin(t * 3 + i) * 0.04, 1 - Math.sin(t * 3 + i) * 0.04, 1);
    });
  });
  return (
    <>
      {orbits.map((_, i) => (
        <group
          key={i}
          ref={(group) => {
            ghosts.current[i] = group;
          }}
        >
          <mesh geometry={geometry}>
            <meshStandardMaterial
              color="#dfe6f5"
              emissive="#8397cf"
              emissiveIntensity={0.7}
              transparent
              opacity={0.72}
              depthWrite={false}
              side={THREE.DoubleSide}
            />
          </mesh>
          {[-1, 1].map((side) => (
            <mesh key={side} position={[side * 0.13, 0.72, 0.36]} scale={[1, 1.5, 0.4]}>
              <sphereGeometry args={[0.06, 8, 6]} />
              <meshBasicMaterial color="#050507" />
            </mesh>
          ))}
          <mesh position={[0, 0.5, 0.4]} scale={[1, 1.4, 0.4]}>
            <sphereGeometry args={[0.07, 8, 6]} />
            <meshBasicMaterial color="#050507" />
          </mesh>
        </group>
      ))}
    </>
  );
}

const BAT_COUNT = 34;

function makeWingGeometry() {
  const shape = new THREE.Shape(
    [
      [0, 0.1],
      [0.35, 0.16],
      [0.75, 0.12],
      [0.95, -0.02],
      [0.7, -0.06],
      [0.55, -0.16],
      [0.35, -0.08],
      [0.18, -0.18],
      [0, -0.1],
    ].map(([x, y]) => new THREE.Vector2(x, y)),
  );
  return new THREE.ShapeGeometry(shape).rotateX(Math.PI / 2);
}

export function Bats({ reducedMotion }: { reducedMotion: boolean }) {
  const wing = useMemo(makeWingGeometry, []);
  useEffect(() => () => wing.dispose(), [wing]);
  const wings = useRef<THREE.InstancedMesh>(null);
  const flock = useMemo(() => {
    const random = seeded(77);
    const moonCenter = MOON.clone().multiplyScalar(95);
    return Array.from({ length: BAT_COUNT }, (_, i) => {
      const nearMoon = i < 14;
      return {
        center: nearMoon
          ? moonCenter
              .clone()
              .add(new THREE.Vector3((random() - 0.5) * 16, (random() - 0.5) * 10, 0))
          : new THREE.Vector3((random() - 0.5) * 50, 9 + random() * 10, (random() - 0.5) * 50),
        radius: nearMoon ? 3 + random() * 9 : 5 + random() * 14,
        speed: (0.4 + random() * 0.5) * (random() < 0.5 ? -1 : 1),
        phase: random() * Math.PI * 2,
        flap: 12 + random() * 8,
        scale: nearMoon ? 1.5 : 0.55 + random() * 0.3,
      };
    });
  }, []);
  const scratch = useMemo(
    () => ({
      base: new THREE.Matrix4(),
      wing: new THREE.Matrix4(),
      mirror: new THREE.Matrix4().makeScale(-1, 1, 1),
      position: new THREE.Vector3(),
      quaternion: new THREE.Quaternion(),
      euler: new THREE.Euler(),
      scale: new THREE.Vector3(),
    }),
    [],
  );
  useFrame((state) => {
    const mesh = wings.current;
    if (!mesh) return;
    const t = state.clock.elapsedTime;
    const { base, wing: matrix, mirror, position, quaternion, euler, scale } = scratch;
    flock.forEach((bat, i) => {
      const a = bat.phase + t * bat.speed;
      position.set(
        bat.center.x + Math.cos(a) * bat.radius,
        bat.center.y + Math.sin(t * 1.7 + bat.phase) * 1.2,
        bat.center.z + Math.sin(a) * bat.radius,
      );
      // Heading follows the orbit tangent; bank into the turn.
      const yaw = Math.atan2(-Math.sin(a) * bat.speed, Math.cos(a) * bat.speed);
      euler.set(0, yaw, -Math.sign(bat.speed) * 0.35);
      quaternion.setFromEuler(euler);
      base.compose(position, quaternion, scale.setScalar(bat.scale));
      const flap = reducedMotion ? 0.2 : Math.sin(t * bat.flap + bat.phase) * 0.75;
      matrix.makeRotationZ(flap);
      mesh.setMatrixAt(i * 2, matrix.premultiply(base));
      matrix.makeRotationZ(flap).premultiply(mirror).premultiply(base);
      mesh.setMatrixAt(i * 2 + 1, matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh ref={wings} args={[wing, undefined, BAT_COUNT * 2]} frustumCulled={false}>
      <meshBasicMaterial color="#050407" side={THREE.DoubleSide} fog={false} />
    </instancedMesh>
  );
}
