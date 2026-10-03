import { CuboidCollider, CylinderCollider, RigidBody } from "@react-three/rapier";
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { groundHeight, mulberry32 } from "../gameplay/terrain";
import {
  archSupports,
  FALLEN_DRUMS,
  RUIN_ARCHES,
  RUIN_COLUMNS,
  type RuinArch,
  type RuinColumn,
} from "../gameplay/ruins";

const SINK = 0.4;
const VOUSSOIRS = 9;

// Weathered stone with moss creeping over every upward face and pooling
// toward the base, broken up by blotchy lichen so no two blocks match.
function createStone(color: string, mossy: number) {
  const material = new THREE.MeshStandardMaterial({ color, roughness: 0.92, flatShading: true });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uMossy = { value: mossy };
    shader.vertexShader =
      "varying vec3 vRuinWorld; varying vec3 vRuinNormal; varying float vRuinLocalY;\n" +
      shader.vertexShader.replace(
        "#include <project_vertex>",
        `#include <project_vertex>
        vRuinWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vRuinNormal = normalize(mat3(modelMatrix) * objectNormal);
        vRuinLocalY = position.y;`,
      );
    shader.fragmentShader =
      "uniform float uMossy; varying vec3 vRuinWorld; varying vec3 vRuinNormal; varying float vRuinLocalY;\n" +
      shader.fragmentShader.replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        vec3 w = vRuinWorld;
        float streak = sin(w.x * 1.7 + sin(w.z * 1.3) * 1.5) * sin(w.z * 1.9 + w.y * 0.9) * 0.5 + 0.5;
        float blotch = fract(sin(dot(floor(w * 2.6), vec3(12.9898, 78.233, 37.719))) * 43758.5453);
        diffuseColor.rgb *= 0.82 + blotch * 0.3;
        float moss = vRuinNormal.y * 0.55 + streak * 0.45 + (1.0 - smoothstep(0.0, 1.4, vRuinLocalY)) * 0.3;
        moss = smoothstep(0.62, 0.9, moss + (uMossy - 0.5) * 0.5);
        vec3 mossColor = mix(vec3(0.07, 0.13, 0.03), vec3(0.2, 0.28, 0.06), blotch);
        diffuseColor.rgb = mix(diffuseColor.rgb, mossColor, moss);`,
      );
  };
  material.customProgramCacheKey = () => "ruin-stone-v1";
  return material;
}

function useRuinMaterials() {
  const materials = useMemo(
    () => ({
      stone: createStone("#9a968a", 0.55),
      paving: createStone("#7e7b70", 0.75),
      ivy: new THREE.MeshStandardMaterial({ color: "#35521f", roughness: 1, flatShading: true }),
    }),
    [],
  );
  useEffect(
    () => () => Object.values(materials).forEach((material) => material.dispose()),
    [materials],
  );
  return materials;
}

type Materials = ReturnType<typeof useRuinMaterials>;

function MossClumps({
  top,
  spread,
  seed,
  ivy,
}: {
  top: number;
  spread: number;
  seed: number;
  ivy: THREE.Material;
}) {
  const clumps = useMemo(() => {
    const random = mulberry32(seed);
    return Array.from({ length: 3 }, () => ({
      x: (random() - 0.5) * spread,
      z: (random() - 0.5) * spread,
      size: 0.18 + random() * 0.2,
    }));
  }, [seed, spread]);
  return (
    <>
      {clumps.map((clump, i) => (
        <mesh
          key={i}
          position={[clump.x, top + clump.size * 0.25, clump.z]}
          scale={[clump.size * 1.6, clump.size * 0.7, clump.size * 1.4]}
          material={ivy}
          castShadow
        >
          <icosahedronGeometry args={[1, 0]} />
        </mesh>
      ))}
    </>
  );
}

function Column({
  column,
  arcadeTop,
  materials,
  seed,
}: {
  column: RuinColumn;
  arcadeTop: number;
  materials: Materials;
  seed: number;
}) {
  const bottom = groundHeight(column.x, column.z) - SINK;
  const top = column.arcade ? arcadeTop : bottom + SINK + column.height;
  const height = top - bottom;
  const whole = column.height >= 3;
  return (
    <RigidBody type="fixed" colliders={false} position={[column.x, bottom, column.z]}>
      <CylinderCollider args={[height / 2, column.radius + 0.1]} position={[0, height / 2, 0]} />
      <mesh position={[0, 0.3, 0]} material={materials.stone} castShadow receiveShadow>
        <boxGeometry args={[column.radius * 2.7, 0.6, column.radius * 2.7]} />
      </mesh>
      <mesh
        position={[0, height / 2, 0]}
        rotation={[whole ? 0 : 0.04, seed, whole ? 0 : -0.05]}
        material={materials.stone}
        castShadow
        receiveShadow
      >
        <cylinderGeometry args={[column.radius * 0.92, column.radius, height, 10]} />
      </mesh>
      {whole && (
        <mesh position={[0, height - 0.2, 0]} material={materials.stone} castShadow receiveShadow>
          <boxGeometry args={[column.radius * 2.6, 0.4, column.radius * 2.6]} />
        </mesh>
      )}
      <MossClumps top={height} spread={column.radius * 1.6} seed={seed * 97} ivy={materials.ivy} />
    </RigidBody>
  );
}

function Arch({
  arch,
  base,
  pillars,
  materials,
  seed,
}: {
  arch: RuinArch;
  base: number;
  pillars: boolean;
  materials: Materials;
  seed: number;
}) {
  const blocks = useMemo(() => {
    const radius = arch.halfSpan;
    const length = ((Math.PI * radius) / VOUSSOIRS) * 0.97;
    // Blocks run from local +X over the crown to -X; a broken arch loses
    // its +X end, where the arcade's snapped column no longer holds it.
    return Array.from({ length: VOUSSOIRS }, (_, i) => {
      const angle = (Math.PI * (i + 0.5)) / VOUSSOIRS;
      const keystone = i === Math.floor(VOUSSOIRS / 2);
      return {
        position: [Math.cos(angle) * radius, arch.spring + Math.sin(angle) * radius, 0] as const,
        rotation: angle + Math.PI / 2,
        size: [length, keystone ? 1.05 : 0.8, keystone ? 1.05 : 0.9] as const,
      };
    }).slice(arch.missing);
  }, [arch]);
  const vines = useMemo(() => {
    const random = mulberry32(seed);
    return Array.from({ length: pillars ? 9 : 4 }, () => {
      const angle = 0.35 + random() * (Math.PI - 0.7);
      const length = 0.7 + random() * (pillars ? 2.4 : 1.4);
      const r = arch.halfSpan - 0.35;
      return {
        x: Math.cos(angle) * r,
        y: arch.spring + Math.sin(angle) * r - length / 2,
        z: (random() - 0.5) * 0.7,
        length,
      };
    });
  }, [arch, pillars, seed]);
  const supports = archSupports(arch);
  return (
    <group position={[arch.x, base, arch.z]} rotation={[0, arch.yaw, 0]}>
      {blocks.map((block, i) => (
        <mesh
          key={i}
          position={block.position}
          rotation={[0, 0, block.rotation]}
          material={materials.stone}
          castShadow
          receiveShadow
        >
          <boxGeometry args={block.size} />
        </mesh>
      ))}
      {vines.map((vine, i) => (
        <mesh key={i} position={[vine.x, vine.y, vine.z]} material={materials.ivy} castShadow>
          <cylinderGeometry args={[0.05, 0.02, vine.length, 4]} />
        </mesh>
      ))}
      {pillars &&
        supports.map(([x, z], i) => {
          const bottom = groundHeight(x, z) - SINK - base;
          const height = arch.spring - bottom;
          const side = i === 0 ? -arch.halfSpan : arch.halfSpan;
          return (
            <group key={i} position={[side, bottom, 0]}>
              <mesh
                position={[0, height / 2, 0]}
                material={materials.stone}
                castShadow
                receiveShadow
              >
                <boxGeometry args={[1, height, 1.05]} />
              </mesh>
              <mesh position={[0, 0.35, 0]} material={materials.stone} castShadow receiveShadow>
                <boxGeometry args={[1.4, 0.7, 1.4]} />
              </mesh>
              <mesh
                position={[0, height - 0.2, 0]}
                material={materials.stone}
                castShadow
                receiveShadow
              >
                <boxGeometry args={[1.3, 0.4, 1.3]} />
              </mesh>
            </group>
          );
        })}
      <MossClumps
        top={arch.spring + arch.halfSpan + 0.4}
        spread={1.4}
        seed={seed + 5}
        ivy={materials.ivy}
      />
    </group>
  );
}

function GatePillarColliders({ arch, base }: { arch: RuinArch; base: number }) {
  return (
    <RigidBody
      type="fixed"
      colliders={false}
      position={[arch.x, base, arch.z]}
      rotation={[0, arch.yaw, 0]}
    >
      {[-arch.halfSpan, arch.halfSpan].map((side) => (
        <CuboidCollider
          key={side}
          args={[0.7, arch.spring / 2 + 0.5, 0.7]}
          position={[side, arch.spring / 2, 0]}
        />
      ))}
    </RigidBody>
  );
}

function Paving({ material }: { material: THREE.Material }) {
  const slabs = useMemo(() => {
    const random = mulberry32(4411);
    const path: Array<[number, number]> = [
      [-12, -1],
      [-24, -6],
    ];
    return Array.from({ length: 22 }, () => {
      const t = random();
      const x = path[0][0] + (path[1][0] - path[0][0]) * t + (random() - 0.5) * 2.2;
      const z = path[0][1] + (path[1][1] - path[0][1]) * t + (random() - 0.5) * 2.2;
      return {
        x,
        y: groundHeight(x, z) - 0.03,
        z,
        yaw: random() * Math.PI,
        width: 0.6 + random() * 0.6,
        depth: 0.5 + random() * 0.5,
      };
    });
  }, []);
  return (
    <>
      {slabs.map((slab, i) => (
        <mesh
          key={i}
          position={[slab.x, slab.y, slab.z]}
          rotation={[0, slab.yaw, 0]}
          material={material}
          receiveShadow
        >
          <boxGeometry args={[slab.width, 0.12, slab.depth]} />
        </mesh>
      ))}
    </>
  );
}

export function ForestRuins() {
  const materials = useRuinMaterials();
  const arcadeColumns = RUIN_COLUMNS.filter((column) => column.arcade);
  const arcadeBase =
    arcadeColumns.reduce((sum, column) => sum + groundHeight(column.x, column.z), 0) /
    arcadeColumns.length;
  const [gate, ...arcade] = RUIN_ARCHES;
  const gateBase = Math.max(...archSupports(gate).map(([x, z]) => groundHeight(x, z)));
  return (
    <group name="forest-ruins">
      <Arch arch={gate} base={gateBase} pillars materials={materials} seed={11} />
      <GatePillarColliders arch={gate} base={gateBase} />
      {arcade.map((arch, i) => (
        <Arch
          key={i}
          arch={arch}
          base={arcadeBase}
          pillars={false}
          materials={materials}
          seed={21 + i}
        />
      ))}
      {RUIN_COLUMNS.map((column, i) => (
        <Column
          key={i}
          column={column}
          arcadeTop={arcadeBase + 4}
          materials={materials}
          seed={i + 1}
        />
      ))}
      {FALLEN_DRUMS.map((drum, i) => (
        <RigidBody
          key={i}
          type="fixed"
          colliders={false}
          position={[drum.x, groundHeight(drum.x, drum.z) + drum.radius * 0.7, drum.z]}
          rotation={[0, drum.yaw, Math.PI / 2]}
        >
          <CylinderCollider args={[drum.length / 2, drum.radius]} />
          <mesh material={materials.stone} castShadow receiveShadow>
            <cylinderGeometry args={[drum.radius, drum.radius * 1.04, drum.length, 10]} />
          </mesh>
        </RigidBody>
      ))}
      <Paving material={materials.paving} />
    </group>
  );
}
