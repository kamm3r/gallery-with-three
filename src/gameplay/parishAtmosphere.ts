import * as THREE from "three";
import { parishTorches } from "./parishDressingPlan.ts";
import { detailFraction, type EffectDetail } from "./graphicsSettings.ts";
import {
  PARISH_FLAME_DOMAIN_HEIGHT,
  parishFlameVertex,
  parishFlameFragment,
} from "./parishFireShader.ts";
import { batchStaticMeshes } from "./batchStaticMeshes.ts";

export type ParishAir = { time: number; motion: number };
export const createParishAir = (): ParishAir => ({ time: 0, motion: 1 });
/** Uses game-frame time, so pause/resume never advances the wind or particles. */
export function stepParishAir(air: ParishAir, delta: number, reduced: boolean) {
  air.time += Math.max(0, Math.min(delta, 0.05));
  air.motion = reduced ? 0 : 1;
}

export function buildParishAtmosphere() {
  const root = new THREE.Group();
  root.name = "parish-fire-and-air";
  const geometries = new Set<THREE.BufferGeometry>(),
    materials = new Set<THREE.Material>();
  const time = { value: 0 },
    motion = { value: 1 };
  const geo = <T extends THREE.BufferGeometry>(g: T) => {
    geometries.add(g);
    return g;
  };
  const mat = (m: THREE.Material) => {
    materials.add(m);
    return m;
  };
  const iron = mat(
    new THREE.MeshStandardMaterial({ color: "#4f453b", roughness: 0.85, metalness: 0.55 }),
  );
  const ash = mat(new THREE.MeshStandardMaterial({ color: "#392f25", roughness: 1 }));
  const coal = mat(
    new THREE.MeshStandardMaterial({
      color: "#934b22",
      emissive: "#e85c0a",
      emissiveIntensity: 0.55,
    }),
  );
  const bowl = geo(new THREE.CylinderGeometry(0.68, 0.45, 0.28, 12, 1, true)),
    rim = geo(new THREE.TorusGeometry(0.68, 0.045, 5, 16)),
    log = geo(new THREE.CylinderGeometry(0.1, 0.14, 1.3, 7)),
    coalGeo = geo(new THREE.SphereGeometry(0.48, 12, 6)),
    coalPiece = geo(new THREE.IcosahedronGeometry(0.11, 0));
  const lights: Array<{ light: THREE.PointLight; base: number; phase: number }> = [];
  const fire = (blue: boolean) =>
    mat(
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        forceSinglePass: true,
        fog: true,
        uniforms: {
          parishTime: time,
          parishMotion: motion,
          cold: { value: blue ? 1 : 0 },
          ...THREE.UniformsLib.fog,
        },
        vertexShader: parishFlameVertex,
        fragmentShader: parishFlameFragment,
      }),
    );
  const flameVolume = geo(new THREE.BoxGeometry(1, 1, 1));
  const dummy = new THREE.Object3D();
  for (const blue of [false, true]) {
    const torches = parishTorches.filter((t) => t.blue === blue);
    const flames = new THREE.InstancedMesh(flameVolume, fire(blue), torches.length);
    flames.name = blue ? "blue-funeral-flames" : "warm-flames";
    let index = 0;
    for (const torch of torches) {
      const [x, y, z] = torch.position,
        s = torch.scale;
      // Emitter and flame dimensions are independent: flames sit low inside the bowl.
      const height = 0.8 * s * PARISH_FLAME_DOMAIN_HEIGHT;
      dummy.position.set(x, y + 0.28 * s + height / 2, z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1.4 * s, height, 1.4 * s);
      dummy.updateMatrix();
      flames.setMatrixAt(index++, dummy.matrix);
    }
    // The volume is fully covered by its geometry; no billboard rotation padding is needed.
    flames.computeBoundingBox();
    flames.boundingSphere = flames.boundingBox!.getBoundingSphere(new THREE.Sphere());
    root.add(flames);
  }
  parishTorches.forEach((torch, i) => {
    const g = new THREE.Group();
    g.position.set(...torch.position);
    g.scale.setScalar(torch.scale);
    g.name = "brazier";
    const body = new THREE.Mesh(bowl, iron);
    body.position.y = 0.25;
    body.castShadow = true;
    g.add(body);
    const ring = new THREE.Mesh(rim, iron);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.4;
    g.add(ring);
    const bed = new THREE.Mesh(coalGeo, ash);
    bed.scale.y = 0.09;
    bed.position.y = 0.27;
    g.add(bed);
    for (let j = 0; j < 9; j++) {
      const ember = new THREE.Mesh(coalPiece, torch.blue ? ash : coal);
      ember.position.set(((j % 3) - 1) * 0.24, 0.29, (Math.floor(j / 3) - 1) * 0.24);
      ember.scale.set(1, 0.7, 1);
      ember.rotation.y = j * 2.4;
      g.add(ember);
    }
    for (let j = 0; j < 4; j++) {
      const wood = new THREE.Mesh(log, ash);
      wood.position.set(Math.sin(j) * 0.16, 0.1, Math.cos(j) * 0.16);
      wood.rotation.set(Math.PI / 2, 0, j * 0.8);
      g.add(wood);
    }
    root.add(g);
    const light = new THREE.PointLight(
      torch.blue ? "#70bdd7" : "#ffab58",
      (torch.blue ? 30 : 45) * torch.scale ** 2,
      torch.blue ? 14 : 12,
    );
    light.position.set(torch.position[0], torch.position[1] + 1.1 * torch.scale, torch.position[2]);
    root.add(light);
    lights.push({ light, base: light.intensity, phase: i * 2.37 });
  });
  const particles = new THREE.Group();
  particles.name = "wind-and-smoke";
  root.add(particles);
  const particle = (smoke: boolean) => {
    const origins: number[] = [],
      seeds: number[] = [],
      sizes: number[] = [],
      heights: number[] = [],
      colors: number[] = [];
    const sources = smoke
      ? [
          ...parishTorches
            .filter((t) => t.smoke)
            .map((t) => ({ p: t.position, height: 5.5, scale: t.scale })),
          { p: [95, 44, 25], height: 15, scale: 2 },
        ]
      : parishTorches
          .filter((t) => !t.blue)
          .map((t) => ({ p: t.position, height: 3, scale: t.scale }));
    const buckets = new Map<string, typeof sources>();
    for (const source of sources) {
      const key = `${Math.floor(source.p[0] / 32)}:${Math.floor(source.p[2] / 32)}`;
      const bucket = buckets.get(key) ?? [];
      bucket.push(source);
      buckets.set(key, bucket);
    }
    const m = mat(
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        vertexColors: true,
        blending: smoke ? THREE.NormalBlending : THREE.AdditiveBlending,
        uniforms: { parishTime: time, smoke: { value: smoke ? 1 : 0 } },
        vertexShader: `uniform float parishTime;uniform float smoke;attribute float seed;attribute float particleSize;attribute float height;varying float vAge;varying vec3 vColor;
    void main(){float age=fract(seed+parishTime*mix(.35,.085,smoke));vAge=age;vColor=color;vec3 p=position;p.y+=age*height;p.x+=age*age*mix(.9,3.0,smoke)+sin(age*9.0+seed*10.0)*.2;p.z+=sin(age*5.0+seed*8.0)*age;
    vec4 mvPosition=modelViewMatrix*vec4(p,1.0);gl_Position=projectionMatrix*mvPosition;gl_PointSize=clamp(particleSize*(smoke>0.5?.6+age:1.0)*600.0/max(1.0,-mvPosition.z),1.0,90.0);}`,
        fragmentShader: `uniform float smoke;varying float vAge;varying vec3 vColor;void main(){float d=length(gl_PointCoord-.5)*2.0;float mask=1.0-smoothstep(.05,1.0,d);float alpha=mask*sin(vAge*3.14159)*mix(.8,.12,smoke);if(alpha<.005)discard;gl_FragColor=vec4(vColor*mix(2.0,1.0,smoke),alpha);
    #include <colorspace_fragment>
    }`,
      }),
    );
    for (const [key, list] of buckets) {
      origins.length = seeds.length = sizes.length = heights.length = colors.length = 0;
      const g = geo(new THREE.BufferGeometry());
      for (const source of list)
        for (let i = 0; i < (smoke ? 14 : 9); i++) {
          origins.push(source.p[0], source.p[1] + 0.8 * source.scale, source.p[2]);
          seeds.push((i * 0.618033 + source.p[0] * 0.017) % 1);
          sizes.push(
            smoke ? (0.45 + ((i * 13) % 7) * 0.1) * source.scale : 0.05 + ((i * 7) % 3) * 0.02,
          );
          heights.push(source.height);
          colors.push(...new THREE.Color(smoke ? "#656257" : "#ffae4e").toArray());
        }
      g.setAttribute("position", new THREE.Float32BufferAttribute(origins, 3));
      g.setAttribute("seed", new THREE.Float32BufferAttribute(seeds, 1));
      g.setAttribute("particleSize", new THREE.Float32BufferAttribute(sizes, 1));
      g.setAttribute("height", new THREE.Float32BufferAttribute(heights, 1));
      g.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
      // Shader motion and the billboard's size must fit inside the culling bounds.
      const bounds = new THREE.Box3();
      const padding = smoke ? 7 : 1;
      for (let i = 0; i < heights.length; i++) {
        bounds.expandByPoint(
          new THREE.Vector3(
            origins[i * 3] - padding,
            origins[i * 3 + 1] - padding,
            origins[i * 3 + 2] - padding - 1,
          ),
        );
        bounds.expandByPoint(
          new THREE.Vector3(
            origins[i * 3] + padding + 3.2,
            origins[i * 3 + 1] + heights[i] + padding,
            origins[i * 3 + 2] + padding + 1,
          ),
        );
      }
      g.boundingBox = bounds;
      g.boundingSphere = bounds.getBoundingSphere(new THREE.Sphere());
      const points = new THREE.Points(g, m);
      points.name = `${smoke ? "foundry-and-refuge-smoke" : "rising-embers"}:${key}`;
      particles.add(points);
    }
  };
  particle(true);
  particle(false);
  const batching = batchStaticMeshes(root);
  const particleMeshes = particles.children as THREE.Points[];
  let particleFraction = 1;
  return {
    root,
    time,
    motion,
    particles,
    lights,
    setDetail(detail: EffectDetail) {
      particleFraction = detailFraction[detail];
      for (const points of particleMeshes)
        points.geometry.setDrawRange(
          0,
          Math.floor(points.geometry.getAttribute("position").count * particleFraction),
        );
    },
    update(air: ParishAir) {
      time.value = air.time;
      motion.value = air.motion;
      particles.visible = air.motion > 0 && particleFraction > 0;
      for (const item of lights)
        item.light.intensity =
          item.base * (1 + (air.motion > 0 ? 0.08 : 0) * Math.sin(air.time * 7 + item.phase));
    },
    dispose() {
      batching.dispose();
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
    },
  };
}
