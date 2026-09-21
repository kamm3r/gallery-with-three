import { useFrame } from "@react-three/fiber";
import { useWorld } from "koota/react";
import { PlayerPosition } from "../gameplay/ecs/traits";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { daylightAt } from "../gameplay/daylight";
import { mulberry32 } from "../gameplay/terrain";
import { useGame } from "../gameSettings";
import { useReducedMotion } from "../hooks/useReducedMotion";

class SkySystem {
  readonly noise: THREE.Data3DTexture;
  readonly material: THREE.ShaderMaterial;
  readonly sunDirection = new THREE.Vector3();
  readonly center = new THREE.Vector3();
  readonly fogColor = new THREE.Color();
  readonly dayFog = new THREE.Color("#b7cad5");
  readonly nightFog = new THREE.Color("#111d36");
  readonly sunsetFog = new THREE.Color("#d59472");
  readonly dayFill = new THREE.Color("#d9edff");
  readonly dayGround = new THREE.Color("#797854");
  constructor() {
    const random = mulberry32(8251);
    const data = new Uint8Array(32 ** 3);
    for (let i = 0; i < data.length; i++) data[i] = random() * 255;
    this.noise = new THREE.Data3DTexture(data, 32, 32, 32);
    this.noise.format = THREE.RedFormat;
    this.noise.minFilter = this.noise.magFilter = THREE.LinearFilter;
    this.noise.wrapS = this.noise.wrapT = this.noise.wrapR = THREE.RepeatWrapping;
    this.noise.unpackAlignment = 1;
    this.noise.needsUpdate = true;
    this.material = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        uNoise: { value: this.noise },
        uTime: { value: 0 },
        uDay: { value: 1 },
        uSunset: { value: 0 },
        uSun: { value: this.sunDirection },
        uSteps: { value: 24 },
      },
      vertexShader: `varying vec3 vWorld; void main() {
        vec4 world = modelMatrix * vec4(position, 1.0); vWorld = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }`,
      fragmentShader: `
        uniform sampler3D uNoise;
        uniform float uTime, uDay, uSunset, uSteps;
        uniform vec3 uSun;
        varying vec3 vWorld;
        float field(vec3 p) {
          p.xz += vec2(uTime * 1.1, uTime * 0.3);
          return texture(uNoise, p * 0.002).r * 0.6
            + texture(uNoise, p * 0.0043).r * 0.28
            + texture(uNoise, p * 0.0091).r * 0.12;
        }
        float density(vec3 p) {
          float layer = smoothstep(38.0, 46.0, p.y) * (1.0 - smoothstep(62.0, 78.0, p.y));
          return smoothstep(0.46, 0.7, field(p)) * layer;
        }
        void main() {
          vec3 ray = normalize(vWorld - cameraPosition);
          float horizon = pow(1.0 - max(ray.y, 0.0), 3.0);
          vec3 day = mix(vec3(0.13, 0.36, 0.66), vec3(0.64, 0.75, 0.79), horizon);
          vec3 night = mix(vec3(0.006, 0.012, 0.035), vec3(0.035, 0.055, 0.1), horizon);
          vec3 sky = mix(night, day, uDay);
          sky = mix(sky, vec3(0.8, 0.3, 0.12), uSunset * horizon * 0.6);
          float sun = pow(max(dot(ray, uSun), 0.0), 1200.0);
          float moon = pow(max(dot(ray, -uSun), 0.0), 2200.0);
          sky += vec3(1.0, 0.8, 0.5) * sun * uDay * 3.0;
          sky += vec3(0.6, 0.74, 1.0) * moon * (1.0 - uDay);
          vec2 starCell = floor(ray.xz / max(0.1, ray.y) * 310.0);
          float star = fract(sin(dot(starCell, vec2(12.9898, 78.233))) * 43758.5453);
          sky += vec3(step(0.9991, star) * (1.0-uDay) * smoothstep(0.05,0.3,ray.y) * 0.65);
          if (ray.y > 0.04) {
            float start = max(0.0, (38.0 - cameraPosition.y) / ray.y);
            float stepSize = min(300.0, 40.0 / ray.y) / uSteps;
            float transmission = 1.0;
            vec3 cloud = vec3(0.0);
            for (int i=0; i<32; i++) {
              if (float(i) >= uSteps || transmission < 0.025) break;
              vec3 p = cameraPosition + ray * (start + (float(i)+0.5)*stepSize);
              float d = density(p);
              float alpha = 1.0 - exp(-d * stepSize * 0.17);
              float shade = exp(-density(p + normalize(vec3(uSun.x, abs(uSun.y)+0.2, uSun.z)) * 10.0) * 1.7);
              vec3 lit = mix(vec3(0.055,0.075,0.13), vec3(0.97,0.98,1.0), uDay);
              lit = mix(lit, vec3(1.0,0.57,0.3), uSunset * 0.5);
              cloud += lit * (0.55 + shade * 0.45) * alpha * transmission;
              transmission *= 1.0 - alpha;
            }
            sky = sky * transmission + cloud;
          }
          gl_FragColor = vec4(sky, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `,
    });
  }
  update(
    seconds: number,
    reduced: boolean,
    quality: number,
    light: THREE.DirectionalLight,
    fill: THREE.HemisphereLight,
    sky: THREE.Mesh,
    scene: THREE.Scene,
    camera: THREE.Camera,
    player: { x: number; y: number; z: number; valid: boolean },
  ) {
    const day = daylightAt(seconds);
    this.sunDirection.set(Math.cos(day.angle), Math.sin(day.angle), 0.38).normalize();
    const uniforms = this.material.uniforms;
    uniforms.uTime.value = reduced ? 0 : seconds;
    uniforms.uDay.value = day.daylight;
    uniforms.uSunset.value = day.sunset;
    uniforms.uSteps.value = quality <= 1 ? 12 : quality < 2 ? 24 : 32;
    if (player.valid) this.center.set(player.x, player.y, player.z);
    light.position
      .copy(this.sunDirection)
      .multiplyScalar(day.elevation > 0 ? 65 : -65)
      .add(this.center);
    light.target.position.copy(this.center);
    light.target.updateMatrixWorld();
    light.intensity = day.elevation > 0 ? 0.45 + day.daylight * 2.4 : 0.45;
    light.color.set(day.elevation > 0 ? "#fff0d2" : "#91b6f1");
    fill.intensity = 0.55 + day.daylight * 1.15;
    fill.color.set("#647ea9").lerp(this.dayFill, day.daylight);
    fill.groundColor.set("#29374a").lerp(this.dayGround, day.daylight);
    sky.position.copy(camera.position);
    this.fogColor
      .copy(this.nightFog)
      .lerp(this.dayFog, day.daylight)
      .lerp(this.sunsetFog, day.sunset * 0.45);
    if (scene.fog) scene.fog.color.copy(this.fogColor);
  }
}

export function DayNightSky() {
  const world = useWorld();
  const system = useMemo(() => new SkySystem(), []);
  const sun = useRef<THREE.DirectionalLight>(null);
  const fill = useRef<THREE.HemisphereLight>(null);
  const sky = useRef<THREE.Mesh>(null);
  const { settings } = useGame();
  const reducedMotion = useReducedMotion();
  useFrame((state) => {
    if (sun.current && fill.current && sky.current)
      system.update(
        state.clock.elapsedTime,
        reducedMotion,
        settings.resolution,
        sun.current,
        fill.current,
        sky.current,
        state.scene,
        state.camera,
        world.get(PlayerPosition)!,
      );
  });
  useEffect(
    () => () => {
      system.material.dispose();
      system.noise.dispose();
    },
    [system],
  );
  return (
    <>
      <fog attach="fog" args={["#b7cad5", 65, 215]} />
      <hemisphereLight ref={fill} args={["#d9edff", "#797854", 1.7]} />
      <directionalLight
        ref={sun}
        castShadow
        intensity={2.5}
        position={[25, 45, 15]}
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-left={-42}
        shadow-camera-right={42}
        shadow-camera-top={42}
        shadow-camera-bottom={-42}
        shadow-camera-near={0.5}
        shadow-camera-far={150}
        shadow-normalBias={0.025}
        shadow-bias={-0.00015}
      />
      <mesh
        ref={sky}
        name="day-night-sky"
        renderOrder={1000}
        frustumCulled={false}
        material={system.material}
        dispose={null}
      >
        <sphereGeometry args={[400, 24, 12]} />
      </mesh>
    </>
  );
}
