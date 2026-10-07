import { memo, useEffect, useMemo, useRef, type MutableRefObject } from "react";
import { useFrame } from "@react-three/fiber";
import { CuboidCollider, TrimeshCollider, RigidBody } from "@react-three/rapier";
import * as THREE from "three";
import { buildParishEnvironment } from "../gameplay/parishEnvironment";
import {
  parishTiles,
  PARISH_ARENA_Y,
  parishProps,
  parishShortcuts,
  parishCaches,
  type ParishProgress,
} from "../gameplay/ashenParish";
import type { ParishEncounter } from "../gameplay/parishEncounter";
import { StaticScenery } from "./StaticScenery";
import {
  buildParishAtmosphere,
  createParishAir,
  stepParishAir,
  type ParishAir,
} from "../gameplay/parishAtmosphere";
import { useEcsRef } from "../hooks/useEcsRef";
import { useReducedMotion } from "../hooks/useReducedMotion";
import { sunlight } from "../gameplay/sunlight";
import { useGame } from "../gameSettings";

function ParishLight({
  state,
  air,
}: {
  state: MutableRefObject<ParishEncounter>;
  air: MutableRefObject<ParishAir>;
}) {
  const sun = useRef<THREE.DirectionalLight>(null);
  const sky = useRef<THREE.ShaderMaterial>(null);

  useFrame(({ scene }, delta) => {
    if (sky.current) {
      sky.current.uniforms.time.value = air.current.time;
      sky.current.uniforms.motion.value = air.current.motion;
    }
    const c = state.current.combat;
    const fighting = c.bossActive && c.bossHealth > 0;
    sunlight.fogColor.value.set(fighting ? "#8e999f" : "#adb9ba");
    sunlight.direction.value.set(-0.7, 0.65, -0.4).normalize();
    sunlight.color.value.set("#ffe3b2");
    if (scene.fog instanceof THREE.Fog) {
      scene.fog.color.copy(sunlight.fogColor.value);
      scene.fog.near = THREE.MathUtils.damp(
        scene.fog.near,
        fighting ? 45 : 95,
        3,
        Math.min(delta, 0.05),
      );
      scene.fog.far = THREE.MathUtils.damp(
        scene.fog.far,
        fighting ? 220 : 380,
        3,
        Math.min(delta, 0.05),
      );
    }
    if (sun.current) {
      const x = Math.round(c.playerX),
        z = Math.round(c.playerZ);
      sun.current.position.set(x - 30, c.playerY + 45, z - 25);
      sun.current.target.position.set(x, c.playerY, z);
      sun.current.target.updateMatrixWorld();
    }
  });
  return (
    <>
      <color attach="background" args={["#ad9880"]} />
      <mesh renderOrder={-1} frustumCulled={false}>
        <sphereGeometry args={[450, 32, 16]} />
        <shaderMaterial
          ref={sky}
          side={THREE.BackSide}
          depthWrite={false}
          uniforms={{
            time: { value: 0 },
            motion: { value: 1 },
            horizon: { value: new THREE.Color("#d8b994") },
            zenith: { value: new THREE.Color("#6e8398") },
          }}
          vertexShader={`varying vec3 vDirection; void main(){vDirection=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`}
          fragmentShader={`uniform vec3 horizon;uniform vec3 zenith;uniform float time;uniform float motion;varying vec3 vDirection;
          float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
          float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
          void main(){vec3 d=normalize(vDirection);float t=smoothstep(0.0,0.8,d.y);
          vec2 p=d.xz/(max(d.y,.08)+.2)*2.5+time*motion*.002;
          float n=noise(p)*.57+noise(p*2.1)*.28+noise(p*4.3)*.15;
          float cloud=smoothstep(.43,.72,n)*smoothstep(-.05,.16,d.y);
          vec3 base=mix(horizon,zenith,t);vec3 shade=mix(vec3(.49,.52,.56),vec3(.93,.82,.66),n);
          gl_FragColor=vec4(mix(base,shade,cloud*.63),1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`}
        />
      </mesh>
      <fog attach="fog" args={["#adb9ba", 95, 380]} />
      <hemisphereLight args={["#b9d0df", "#3e4540", 1.05]} />
      <directionalLight
        ref={sun}
        position={[-30, 45, 70]}
        color="#ffe3b2"
        intensity={2.8}
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-35}
        shadow-camera-right={35}
        shadow-camera-top={35}
        shadow-camera-bottom={-35}
        shadow-camera-near={1}
        shadow-camera-far={110}
        shadow-bias={-0.0004}
      />
    </>
  );
}
function FogVeil({ position }: { position: [number, number, number] }) {
  return (
    <mesh position={position}>
      <planeGeometry args={[7.6, 5]} />
      <meshBasicMaterial
        color="#e4dfcc"
        transparent
        opacity={0.48}
        side={THREE.DoubleSide}
        depthWrite={false}
      />
    </mesh>
  );
}
export const AshenParish = memo(
  function AshenParish({
    progress,
    state,
    bossFelled,
  }: {
    progress: ParishProgress;
    state: MutableRefObject<ParishEncounter>;
    bossFelled: boolean;
    revision: string;
  }) {
    const environment = useMemo(() => buildParishEnvironment(), []);
    const atmosphere = useMemo(() => buildParishAtmosphere(), []);
    const air = useEcsRef("parish-air", createParishAir);
    const reduced = useReducedMotion();
    const { settings } = useGame();
    useEffect(() => {
      environment.dressing.setDetail(settings.environmentDetail);
      atmosphere.setDetail(settings.particleDetail);
    }, [environment, atmosphere, settings.environmentDetail, settings.particleDetail]);
    useFrame((_, delta) => {
      stepParishAir(air.current, delta, reduced);
      environment.dressing.time.value = air.current.time;
      environment.dressing.motion.value = air.current.motion;
      atmosphere.update(air.current);
    });
    const pendingDisposal = useRef<{
      environment: typeof environment;
      timer: ReturnType<typeof setTimeout>;
    } | null>(null);
    useEffect(() => {
      // StrictMode replays effects on the same scene; only dispose a real unmount.
      if (pendingDisposal.current?.environment === environment)
        clearTimeout(pendingDisposal.current.timer);
      return () => {
        pendingDisposal.current = {
          environment,
          timer: setTimeout(() => {
            environment.dispose();
            atmosphere.dispose();
          }, 0),
        };
      };
    }, [environment, atmosphere]);
    return (
      <group name="ashen-parish">
        <ParishLight state={state} air={air} />
        <primitive object={environment.root} dispose={null} />
        <primitive object={atmosphere.root} dispose={null} />
        <RigidBody type="fixed" colliders={false}>
          {environment.colliders.map((wall, i) => (
            <TrimeshCollider
              key={`architecture:${i}`}
              args={[wall.vertices, wall.indices]}
              position={wall.position}
              rotation={[0, wall.yaw, 0]}
            />
          ))}
          {environment.solids.map((solid, i) => (
            <CuboidCollider
              key={`building:${i}`}
              args={[solid.size[0] / 2, solid.size[1] / 2, solid.size[2] / 2]}
              position={solid.position}
            />
          ))}
          {parishTiles.map((tile) => (
            <CuboidCollider
              key={`${tile.x}:${tile.y}:${tile.z}`}
              args={[4 * Math.hypot(1, tile.slope), 0.3, 4 * Math.hypot(1, tile.slopeZ)]}
              position={[tile.x, tile.y - 0.3 * Math.hypot(1, tile.slope, tile.slopeZ), tile.z]}
              rotation={[-Math.atan(tile.slopeZ), 0, Math.atan(tile.slope)]}
            />
          ))}
          <CuboidCollider args={[23, 0.8, 23]} position={[0, PARISH_ARENA_Y - 0.8, 0]} />
          {parishProps.map((prop, i) => (
            <CuboidCollider
              key={`prop:${i}`}
              args={[prop.size[0] / 2, prop.size[1] / 2, prop.size[2] / 2]}
              position={[prop.position[0], prop.position[1] + prop.size[1] / 2, prop.position[2]]}
            />
          ))}
          {[-1, 1].map((side) => (
            <CuboidCollider
              key={`arena:${side}`}
              args={[0.6, 8, 23]}
              position={[side * 23, PARISH_ARENA_Y + 8, 0]}
            />
          ))}
          <CuboidCollider args={[23, 10, 0.6]} position={[0, PARISH_ARENA_Y + 10, -23]} />
          {!bossFelled && (
            <CuboidCollider args={[4, 4, 0.3]} position={[0, PARISH_ARENA_Y + 4, 24]} />
          )}
        </RigidBody>
        {parishShortcuts.map((gate) => (
          <group key={gate.id} position={gate.position} rotation={[0, Math.PI / 2, 0]}>
            <RigidBody type="fixed" colliders={false}>
              {!progress[gate.id] && <CuboidCollider args={[4, 3, 0.25]} position={[0, 3, 0]} />}
            </RigidBody>
            {!progress[gate.id] && (
              <StaticScenery>
                {Array.from({ length: 13 }, (_, i) => (
                  <mesh key={i} position={[-3.6 + i * 0.6, 2.8, 0]}>
                    <boxGeometry args={[0.08, 5.6, 0.13]} />
                    <meshStandardMaterial color="#514c42" metalness={0.7} />
                  </mesh>
                ))}
              </StaticScenery>
            )}
          </group>
        ))}
        {!bossFelled && <FogVeil position={[0, PARISH_ARENA_Y + 2.5, 24]} />}
        {parishCaches
          .filter((cache) => !progress.caches.includes(cache.id))
          .map((cache) => (
            <group key={cache.id} position={cache.position}>
              <mesh position={[0, 0.35, 0]}>
                <cylinderGeometry args={[0.4, 0.55, 0.7, 8]} />
                <meshStandardMaterial color="#84755b" />
              </mesh>
              <mesh position={[0, 0.9, 0]}>
                <icosahedronGeometry args={[0.17, 1]} />
                <meshStandardMaterial color="#f1d08f" emissive="#e0a34c" emissiveIntensity={2} />
              </mesh>
            </group>
          ))}
      </group>
    );
  },
  (previous, next) => previous.state === next.state && previous.revision === next.revision,
);
