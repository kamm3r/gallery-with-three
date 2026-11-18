import RAPIER from "@dimforge/rapier3d-compat";
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { Point, Rect } from "../../../gameplay/hollowLane";
import { NOISE_GLSL } from "../ashFx";

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

type Animate = (time: number, delta: number) => void;

export function createGroundMist(scene: THREE.Object3D, size: number, opacity = 1): Animate {
  const materials = [
    [0.22, 0.5],
    [0.95, 0.22],
  ].map(([height, layerOpacity], layer) => {
    const material = new THREE.ShaderMaterial({
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
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size), material);
    mesh.position.y = height;
    mesh.rotation.x = -Math.PI / 2;
    mesh.renderOrder = 2;
    scene.add(mesh);
    return material;
  });
  return (time) => {
    for (const material of materials) {
      material.uniforms.uTime.value = time;
      material.uniforms.uWon.value = nightFx.won;
      material.uniforms.uDark.value = nightFx.dark;
    }
  };
}

let pumpkin: { body: THREE.BufferGeometry; face: THREE.BufferGeometry } | undefined;
export function pumpkinGeometry() {
  if (pumpkin) return pumpkin;
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
  pumpkin = { body, face };
  return pumpkin;
}

type V3 = [number, number, number];
function part(
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  position: V3 = [0, 0, 0],
  rotation: V3 = [0, 0, 0],
  scale?: V3,
  shadow = false,
) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(...position);
  mesh.rotation.set(...rotation);
  if (scale) mesh.scale.set(...scale);
  mesh.castShadow = shadow;
  return mesh;
}

/** Iron-fenced graveyard filling `area`, with a gate gap on its east side. */
export function createGraveyard(scene: THREE.Object3D, world: RAPIER.World, area: Rect, gate = 2) {
  const random = seeded(19);
  const columns = Math.floor((area.hx * 2 - 3) / 2.4),
    rows = Math.floor((area.hz * 2 - 3) / 2.8);
  const stones = Array.from({ length: columns * rows }, (_, i) => ({
    x: area.x - area.hx + 2 + (i % columns) * 2.4 + (random() - 0.5) * 0.6,
    z: area.z - area.hz + 2 + Math.floor(i / columns) * 2.8 + (random() - 0.5) * 0.6,
    kind: Math.floor(random() * 4),
    tilt: (random() - 0.5) * 0.3,
    yaw: (random() - 0.5) * 0.4,
    scale: 0.85 + random() * 0.4,
  }));
  const stone = new THREE.MeshStandardMaterial({
    color: "#5d5b66",
    roughness: 1,
    flatShading: true,
  });
  const iron = new THREE.MeshStandardMaterial({ color: "#141217", metalness: 0.8, roughness: 0.5 });
  const { x, z, hx: halfX, hz: halfZ } = area;
  const posts: [number, number][] = [];
  const step = 0.32;
  for (let px = -halfX; px <= halfX; px += step)
    posts.push([x + px, z - halfZ], [x + px, z + halfZ]);
  for (let pz = -halfZ + step; pz < halfZ; pz += step) {
    posts.push([x - halfX, z + pz]);
    if (Math.abs(pz) > gate) posts.push([x + halfX, z + pz]);
  }
  const bars = new THREE.InstancedMesh(new THREE.BoxGeometry(0.05, 1.4, 0.05), iron, posts.length);
  const tips = new THREE.InstancedMesh(new THREE.ConeGeometry(0.06, 0.16, 4), iron, posts.length);
  bars.castShadow = true;
  const transform = new THREE.Object3D();
  posts.forEach(([px, pz], i) => {
    transform.position.set(px, 0.7, pz);
    transform.rotation.set(0, 0, Math.sin(i * 1.7) * 0.04);
    transform.updateMatrix();
    bars.setMatrixAt(i, transform.matrix);
    transform.position.y = 1.45;
    transform.updateMatrix();
    tips.setMatrixAt(i, transform.matrix);
  });
  for (const mesh of [bars, tips]) {
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }
  scene.add(bars, tips);
  for (const y of [0.35, 1.15])
    for (const [cx, cz, w, d] of [
      [x, z - halfZ, halfX * 2, 0.05],
      [x, z + halfZ, halfX * 2, 0.05],
      [x - halfX, z, 0.05, halfZ * 2],
      [x + halfX, z - (halfZ + gate) / 2, 0.05, halfZ - gate],
      [x + halfX, z + (halfZ + gate) / 2, 0.05, halfZ - gate],
    ])
      scene.add(part(new THREE.BoxGeometry(w, 0.05, d), iron, [cx, y, cz]));
  const wall = (hx: number, hz: number, cx: number, cz: number) =>
    world.createCollider(RAPIER.ColliderDesc.cuboid(hx, 0.8, hz).setTranslation(cx, 0.8, cz));
  wall(halfX, 0.08, x, z - halfZ);
  wall(halfX, 0.08, x, z + halfZ);
  wall(0.08, halfZ, x - halfX, z);
  wall(0.08, (halfZ - gate) / 2, x + halfX, z - (halfZ + gate) / 2);
  wall(0.08, (halfZ - gate) / 2, x + halfX, z + (halfZ + gate) / 2);
  for (const s of stones) {
    const g = new THREE.Group();
    g.position.set(s.x, 0, s.z);
    g.rotation.set(s.tilt * 0.4, Math.PI / 2 + s.yaw, s.tilt);
    g.scale.setScalar(s.scale);
    if (s.kind === 0)
      g.add(
        part(new THREE.BoxGeometry(0.7, 1, 0.2), stone, [0, 0.5, 0], undefined, undefined, true),
        part(
          new THREE.CylinderGeometry(0.35, 0.35, 0.2, 12, 1, false, -Math.PI / 2, Math.PI),
          stone,
          [0, 1, 0],
          [Math.PI / 2, 0, 0],
          undefined,
          true,
        ),
      );
    else if (s.kind === 1)
      g.add(
        part(
          new THREE.BoxGeometry(0.16, 1.4, 0.16),
          stone,
          [0, 0.7, 0],
          undefined,
          undefined,
          true,
        ),
        part(
          new THREE.BoxGeometry(0.7, 0.16, 0.16),
          stone,
          [0, 1.05, 0],
          undefined,
          undefined,
          true,
        ),
      );
    else if (s.kind === 2)
      g.add(
        part(new THREE.BoxGeometry(0.4, 1.6, 0.4), stone, [0, 0.8, 0], undefined, undefined, true),
        part(
          new THREE.ConeGeometry(0.3, 0.4, 4),
          stone,
          [0, 1.8, 0],
          [0, Math.PI / 4, 0],
          undefined,
          true,
        ),
      );
    else
      g.add(
        part(
          new THREE.BoxGeometry(0.85, 0.8, 0.25),
          stone,
          [0, 0.4, 0],
          undefined,
          undefined,
          true,
        ),
      );
    scene.add(g);
    // Collider from the stone's bounds, like the auto cuboid collider.
    g.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(g);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(size.x / 2, size.y / 2, size.z / 2).setTranslation(
        center.x,
        center.y,
        center.z,
      ),
    );
  }
  const grave = new THREE.Group();
  grave.position.set(x + 3.2, 0, z + 2.8);
  grave.rotation.y = 0.3;
  const shovel = new THREE.Group();
  shovel.position.set(1, 0.5, 0.4);
  shovel.rotation.set(0.2, 0, -0.35);
  shovel.add(
    part(
      new THREE.CylinderGeometry(0.03, 0.03, 1.2, 5),
      new THREE.MeshStandardMaterial({ color: "#4a3526" }),
      [0, 0.4, 0],
      undefined,
      undefined,
      true,
    ),
    part(new THREE.BoxGeometry(0.3, 0.35, 0.03), iron, [0, -0.3, 0]),
  );
  grave.add(
    part(
      new THREE.PlaneGeometry(1, 2),
      new THREE.MeshBasicMaterial({ color: "#050404" }),
      [0, 0.05, 0],
      [-Math.PI / 2, 0, 0],
    ),
    part(
      new THREE.SphereGeometry(1, 10, 8),
      new THREE.MeshStandardMaterial({ color: "#2b2019", roughness: 1 }),
      [0.9, 0.15, 0],
      undefined,
      [0.5, 0.3, 1.1],
      true,
    ),
    shovel,
  );
  scene.add(grave);
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
export function createGhosts(
  scene: THREE.Object3D,
  center: Point,
  reduced: () => boolean,
): Animate {
  const geometry = makeGhostGeometry();
  const sheet = new THREE.MeshStandardMaterial({
    color: "#dfe6f5",
    emissive: "#8397cf",
    emissiveIntensity: 0.7,
    transparent: true,
    opacity: 0.72,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const black = new THREE.MeshBasicMaterial({ color: "#050507" });
  const orbits = [
    { radius: 5.5, height: 3.4, speed: 0.35, phase: 0 },
    { radius: 7, height: 4.6, speed: -0.25, phase: 2.1 },
    { radius: 4.2, height: 5.6, speed: 0.45, phase: 4.2 },
  ];
  const ghosts = orbits.map(() => {
    const g = new THREE.Group();
    g.add(
      new THREE.Mesh(geometry, sheet),
      part(
        new THREE.SphereGeometry(0.06, 8, 6),
        black,
        [-0.13, 0.72, 0.36],
        undefined,
        [1, 1.5, 0.4],
      ),
      part(
        new THREE.SphereGeometry(0.06, 8, 6),
        black,
        [0.13, 0.72, 0.36],
        undefined,
        [1, 1.5, 0.4],
      ),
      part(new THREE.SphereGeometry(0.07, 8, 6), black, [0, 0.5, 0.4], undefined, [1, 1.4, 0.4]),
    );
    scene.add(g);
    return g;
  });
  return (time) => {
    const t = time * (reduced() ? 0.3 : 1);
    orbits.forEach((orbit, i) => {
      const a = orbit.phase + t * orbit.speed;
      const ghost = ghosts[i];
      ghost.position.set(
        center.x + Math.cos(a) * orbit.radius,
        orbit.height + Math.sin(t * 1.3 + i) * 0.4,
        center.z + Math.sin(a) * orbit.radius,
      );
      ghost.rotation.set(0, -a + (orbit.speed > 0 ? 0 : Math.PI), Math.sign(orbit.speed) * 0.2);
      ghost.scale.set(1 + Math.sin(t * 3 + i) * 0.04, 1 - Math.sin(t * 3 + i) * 0.04, 1);
    });
  };
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

export function createBats(scene: THREE.Object3D, reduced: () => boolean): Animate {
  const mesh = new THREE.InstancedMesh(
    makeWingGeometry(),
    new THREE.MeshBasicMaterial({ color: "#050407", side: THREE.DoubleSide, fog: false }),
    BAT_COUNT * 2,
  );
  mesh.frustumCulled = false;
  scene.add(mesh);
  const random = seeded(77);
  const moonCenter = MOON.clone().multiplyScalar(95);
  const flock = Array.from({ length: BAT_COUNT }, (_, i) => {
    const nearMoon = i < 14;
    return {
      center: nearMoon
        ? moonCenter.clone().add(new THREE.Vector3((random() - 0.5) * 16, (random() - 0.5) * 10, 0))
        : new THREE.Vector3((random() - 0.5) * 50, 9 + random() * 10, (random() - 0.5) * 50),
      radius: nearMoon ? 3 + random() * 9 : 5 + random() * 14,
      speed: (0.4 + random() * 0.5) * (random() < 0.5 ? -1 : 1),
      phase: random() * Math.PI * 2,
      flap: 12 + random() * 8,
      scale: nearMoon ? 1.5 : 0.55 + random() * 0.3,
    };
  });
  const base = new THREE.Matrix4(),
    matrix = new THREE.Matrix4(),
    mirror = new THREE.Matrix4().makeScale(-1, 1, 1),
    position = new THREE.Vector3(),
    quaternion = new THREE.Quaternion(),
    euler = new THREE.Euler(),
    scale = new THREE.Vector3();
  return (t) => {
    flock.forEach((bat, i) => {
      const a = bat.phase + t * bat.speed;
      position.set(
        bat.center.x + Math.cos(a) * bat.radius,
        bat.center.y + Math.sin(t * 1.7 + bat.phase) * 1.2,
        bat.center.z + Math.sin(a) * bat.radius,
      );
      const yaw = Math.atan2(-Math.sin(a) * bat.speed, Math.cos(a) * bat.speed);
      euler.set(0, yaw, -Math.sign(bat.speed) * 0.35);
      quaternion.setFromEuler(euler);
      base.compose(position, quaternion, scale.setScalar(bat.scale));
      const flap = reduced() ? 0.2 : Math.sin(t * bat.flap + bat.phase) * 0.75;
      matrix.makeRotationZ(flap);
      mesh.setMatrixAt(i * 2, matrix.premultiply(base));
      matrix.makeRotationZ(flap).premultiply(mirror).premultiply(base);
      mesh.setMatrixAt(i * 2 + 1, matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  };
}
