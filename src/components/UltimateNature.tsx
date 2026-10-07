import { useFBX } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { CuboidCollider, CylinderCollider, RigidBody } from "@react-three/rapier";
import {
  FLAT_RADIUS,
  groundHeight,
  isDryLand,
  PLAY_RADIUS,
  scatter,
  type ScatterPoint,
} from "../gameplay/terrain";
import { inPortalGarden, HUB_PORTALS, firstPathDistance } from "../gameplay/hubPortals";
import { nearRuins } from "../gameplay/ruins";
import { useWorld } from "koota/react";
import { InstanceBatch } from "../gameplay/ecs/traits";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { sunlight } from "../gameplay/sunlight";
import { useReducedMotion } from "../hooks/useReducedMotion";
import {
  distanceFadeDiscard,
  distanceFadeFragment,
  distanceFadeUniforms,
  distanceFadeVertex,
} from "./distanceFade";

const PACK =
  "/assets/Ultimate Nature Pack - Jun 2019-20260917T180657Z-1-001/Ultimate Nature Pack - Jun 2019/FBX/";
type Specimen = ScatterPoint;
const palette: Record<string, string> = {
  Green: "#5a853a",
  DarkGreen: "#2f5530",
  Wood: "#5e4b38",
  Rock: "#7b8175",
  White: "#d2d5bb",
  Black: "#48473c",
};
const FOLIAGE = /green|leaves/i;

const foliageWind = { time: { value: 0 }, strength: { value: 1 } };

// Painterly foliage: per-tree hue drift (warm and cool greens side by side),
// a crown-to-base darkening that reads as canopy occlusion, a gentle wind
// sway that grows toward the leaf tips, and a sun-backlit glow on the crowns.
// Near the cull distance each instance dissolves instead of popping.
function applyFoliageShading(material: THREE.MeshStandardMaterial, far: number) {
  const fade = distanceFadeUniforms(far);
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, fade, {
      uFoliageTime: foliageWind.time,
      uFoliageWind: foliageWind.strength,
      uSunDirection: sunlight.direction,
      uSunColor: sunlight.color,
    });
    shader.vertexShader =
      distanceFadeVertex +
      `attribute float foliage;
      uniform float uFoliageTime, uFoliageWind;
      varying float vFoliage, vFoliageHeight, vFoliageSeed;
      varying vec3 vFoliageWorld;\n` +
      shader.vertexShader;
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        #ifdef USE_INSTANCING
        vec3 foliageRoot = instanceMatrix[3].xyz;
        #else
        vec3 foliageRoot = vec3(0.0);
        #endif
        float foliageSeed = fract(sin(dot(foliageRoot.xz, vec2(12.9898, 78.233))) * 43758.5453);
        float foliageSway = foliage * position.y * position.y * uFoliageWind;
        float foliagePhase = uFoliageTime * 1.3 + foliageSeed * 6.2831;
        transformed.x += (sin(foliagePhase + position.y * 2.5) * 0.012
          + sin(uFoliageTime * 3.1 + position.x * 9.0 + position.z * 7.0) * 0.004) * foliageSway;
        transformed.z += cos(foliagePhase * 0.8 + position.y * 2.0) * 0.01 * foliageSway;
        vFoliage = foliage;
        vFoliageHeight = position.y;
        vFoliageSeed = foliageSeed;
        vDistanceFade = distanceFade((modelMatrix * vec4(foliageRoot, 1.0)).xyz);`,
      )
      .replace(
        "#include <project_vertex>",
        `#include <project_vertex>
        #ifdef USE_INSTANCING
        vFoliageWorld = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
        #else
        vFoliageWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
        #endif`,
      );
    shader.fragmentShader =
      distanceFadeFragment +
      `uniform vec3 uSunDirection, uSunColor;
      varying float vFoliage, vFoliageHeight, vFoliageSeed;
      varying vec3 vFoliageWorld;\n` +
      shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader
      .replace("void main() {", `void main() {\n${distanceFadeDiscard}`)
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        vec3 foliageHue = mix(vec3(0.74, 0.92, 0.86), vec3(1.16, 1.06, 0.62), vFoliageSeed);
        diffuseColor.rgb *= mix(vec3(1.0), foliageHue, vFoliage * 0.55);
        diffuseColor.rgb *= mix(0.58, 1.08, smoothstep(0.05, 0.95, vFoliageHeight));`,
      )
      .replace(
        "#include <lights_fragment_end>",
        `#include <lights_fragment_end>
        float foliageBacklit = pow(max(dot(normalize(vFoliageWorld - cameraPosition), uSunDirection), 0.0), 4.0);
        reflectedLight.indirectDiffuse += diffuseColor.rgb * uSunColor * foliageBacklit * vFoliage
          * 0.2 * smoothstep(0.35, 1.0, vFoliageHeight);`,
      );
  };
  material.customProgramCacheKey = () => "nature-foliage-v2";
}

// Bake the FBX's centimetres, transforms, and ground pivot into shared
// geometry once. Every specimen then shares its geometry and materials.
export function NatureBatch({
  model,
  points,
  tree = false,
  leafColor,
}: {
  model: string;
  points: Specimen[];
  tree?: boolean;
  leafColor?: string;
}) {
  const world = useWorld();
  const group = useRef<THREE.Group>(null);
  const reducedMotion = useReducedMotion();
  const source = useFBX(`${PACK}${model}.fbx`);
  // Full-detail models are light (about 3k triangles per tree at most), so
  // every instance draws its real mesh; only frustum and distance cull.
  const far = tree ? 165 : model.startsWith("Plant") ? 75 : 100;
  useFrame((state) => {
    foliageWind.time.value = state.clock.elapsedTime;
    foliageWind.strength.value = reducedMotion ? 0 : 1;
  });
  const parts = useMemo(() => {
    source.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(source);
    const size = bounds.getSize(new THREE.Vector3());
    const center = bounds.getCenter(new THREE.Vector3());
    const factor = 1 / (tree ? size.y : Math.max(size.x, size.y, size.z));
    const normalize = new THREE.Matrix4()
      .makeScale(factor, factor, factor)
      .multiply(new THREE.Matrix4().makeTranslation(-center.x, -bounds.min.y, -center.z));
    const geometries: THREE.BufferGeometry[] = [];
    source.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      const materials = (
        Array.isArray(object.material) ? object.material : [object.material]
      ) as THREE.MeshPhongMaterial[];
      const geometry = object.geometry.index
        ? object.geometry.toNonIndexed()
        : object.geometry.clone();
      geometry.applyMatrix4(new THREE.Matrix4().multiplyMatrices(normalize, object.matrixWorld));
      const colors = new Float32Array(geometry.getAttribute("position").count * 3);
      const foliage = new Float32Array(colors.length / 3);
      const groups = geometry.groups.length
        ? geometry.groups
        : [{ start: 0, count: colors.length / 3, materialIndex: 0 }];
      for (const group of groups) {
        const material = materials[group.materialIndex ?? 0];
        const color = new THREE.Color(palette[material.name] ?? material.color ?? "#ffffff");
        if (leafColor && /green/i.test(material.name)) color.set(leafColor);
        const leaf = FOLIAGE.test(material.name) ? 1 : 0;
        for (let i = group.start; i < group.start + group.count; i++) {
          color.toArray(colors, i * 3);
          foliage[i] = leaf;
        }
      }
      for (const attribute of Object.keys(geometry.attributes))
        if (attribute !== "position" && attribute !== "normal") geometry.deleteAttribute(attribute);
      geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
      geometry.setAttribute("foliage", new THREE.BufferAttribute(foliage, 1));
      geometry.clearGroups();
      geometries.push(geometry);
    });
    const geometry = mergeGeometries(geometries)!;
    for (const part of geometries) part.dispose();
    const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 });
    applyFoliageShading(material, far);
    return [{ geometry, material }];
  }, [source, tree, leafColor, far]);
  useLayoutEffect(() => {
    const meshes = group.current!.children as THREE.InstancedMesh[];
    const matrices = new Float32Array(points.length * 16);
    const transform = new THREE.Object3D();
    points.forEach((point, i) => {
      transform.position.set(point.x, point.y, point.z);
      transform.rotation.set(0, point.rotation, 0);
      transform.scale.setScalar(point.scale);
      transform.updateMatrix();
      transform.matrix.toArray(matrices, i * 16);
    });
    const bounds = new THREE.Box3();
    for (const part of parts) {
      part.geometry.computeBoundingBox();
      bounds.union(part.geometry.boundingBox!);
    }
    const sphere = bounds.getBoundingSphere(new THREE.Sphere());
    const entity = world.spawn(
      InstanceBatch({
        points,
        matrices,
        levels: new Uint8Array(points.length),
        detail: meshes,
        proxy: [],
        radius: sphere.radius,
        centerY: sphere.center.y,
        near: far,
        far,
        shadows: true,
      }),
    );
    return () => entity.destroy();
  }, [world, points, parts, far]);
  useEffect(
    () => () => {
      for (const part of parts) {
        part.geometry.dispose();
        for (const material of Array.isArray(part.material) ? part.material : [part.material])
          material.dispose();
      }
    },
    [parts],
  );
  return (
    <group ref={group}>
      {parts.map((part, index) => (
        <instancedMesh
          key={index}
          name="nature-detail"
          args={[part.geometry, part.material, points.length]}
          count={0}
          frustumCulled={false}
          castShadow
          receiveShadow
          dispose={null}
        />
      ))}
    </group>
  );
}

function specimen(x: number, z: number, scale: number, rotation = 0): Specimen {
  return { x, y: groundHeight(x, z) - 0.03, z, scale, rotation, tint: 0.5 };
}

// Tall, close-set trunks wall the clearing in: a cathedral forest whose
// canopy gaps let the sun through as shafts, thinning out toward the lakes.
const treeGroups = [
  {
    model: "CommonTree_1",
    points: [
      specimen(-9, -8, 10.5),
      specimen(8, -14, 12, 1),
      specimen(-12, 8, 11, 2),
      ...scatter(32, 19, 55, 601, 10, 15),
    ],
  },
  {
    model: "BirchTree_1",
    points: [
      specimen(-6, -14, 11),
      specimen(14, 5, 11.5, 1),
      specimen(9, 13, 10),
      ...scatter(34, 16, 50, 602, 9.5, 13.5),
    ],
  },
  { model: "PineTree_1", points: scatter(46, 26, 64, 603, 13, 20) },
  { model: "Willow_1", points: [specimen(-12, -1, 11, 1.1), specimen(-20, 14, 12)] },
];
const plantGroups = [
  { model: "Bush_1", points: scatter(72, 12, 60, 604, 1.2, 2.4) },
  { model: "Plant_1", points: scatter(230, 11, 62, 605, 0.6, 1.3) },
  { model: "Plant_2", points: scatter(170, 12, 58, 606, 0.5, 1.0) },
  {
    model: "WoodLog_Moss",
    points: [
      specimen(-8, 3, 3.8, 0.4),
      specimen(8, 8, 3.3, -0.8),
      specimen(-15, -9, 4, 1),
      ...scatter(12, 20, 70, 607, 3, 4.6),
    ],
  },
];

treeGroups[0].points.push(...scatter(80, 55, 128, 621, 11, 17));
treeGroups[1].points.push(...scatter(60, 52, 124, 622, 10, 14));
treeGroups[2].points.push(...scatter(110, 62, 138, 623, 14, 22));
treeGroups[3].points.push(specimen(66, 46, 8));
// Broken groves hide the optional paintings, with gaps wide enough to enter.
for (const portal of HUB_PORTALS.slice(1)) {
  for (const [i, angle] of [-2.5, -1.45, -0.45, 0.65, 1.7].entries()) {
    const bearing = portal.yaw + angle;
    const x = portal.x + Math.sin(bearing) * 8;
    const z = portal.z + Math.cos(bearing) * 8;
    treeGroups[i % 2].points.push(specimen(x, z, 8 + (i % 3), bearing));
    plantGroups[0].points.push(
      specimen(
        x * 0.02 + portal.x * 0.98 + Math.sin(bearing) * 6,
        z * 0.02 + portal.z * 0.98 + Math.cos(bearing) * 6,
        1.7,
        bearing,
      ),
    );
  }
}
for (const group of [...treeGroups, ...plantGroups]) {
  group.points = group.points.filter(
    (point) =>
      isDryLand(point.x, point.z) &&
      !inPortalGarden(point.x, point.z) &&
      !nearRuins(point.x, point.z) &&
      firstPathDistance(point.x, point.z) > 2.5,
  );
  useFBX.preload(`${PACK}${group.model}.fbx`);
}

function LogSeats() {
  return (
    <>
      {plantGroups
        .find((group) => group.model === "WoodLog_Moss")!
        // Only the clearing logs are seats; forest logs lie on slopes.
        .points.filter((point) => Math.hypot(point.x, point.z) < FLAT_RADIUS)
        .map((point, i) => {
          const yaw = point.rotation + Math.PI / 2;
          // SitDown is a ground sit (kneeling, lower legs folded under the
          // thighs), not a chair sit: putting its origin on top of the log
          // folds the shins/feet into the log body. Sit on the ground with
          // the back against the log instead. Thighs span -0.05..0.55 ahead
          // of the origin and the butt reaches 0.07 behind it, so clear the
          // log's across-width half extent (collider: 0.14 * scale) plus the
          // butt overhang.
          const forward = point.scale * 0.14 + 0.12;
          const x = point.x + Math.sin(yaw) * forward;
          const z = point.z + Math.cos(yaw) * forward;
          return (
            <group
              key={i}
              name={`log-seat-${i}`}
              position={[x, groundHeight(x, z), z]}
              rotation={[0, yaw, 0]}
            />
          );
        })}
    </>
  );
}

export function UltimateNature() {
  return (
    <>
      <LogSeats />
      {treeGroups.map(({ model, points }) => (
        <group key={model}>
          <NatureBatch model={model} points={points} tree />
          {points
            .filter((point) => Math.hypot(point.x, point.z) < PLAY_RADIUS + 1)
            .map((point, i) => (
              <RigidBody
                key={i}
                type="fixed"
                colliders={false}
                position={[point.x, point.y, point.z]}
              >
                <CylinderCollider
                  args={[point.scale * 0.24, point.scale * 0.055]}
                  position={[0, point.scale * 0.24, 0]}
                />
              </RigidBody>
            ))}
        </group>
      ))}
      {plantGroups.map(({ model, points }) => (
        <group key={model}>
          <NatureBatch model={model} points={points} />
          {(model.startsWith("Rock") || model.startsWith("Wood")) &&
            points.map((point, i) => (
              <RigidBody
                key={i}
                type="fixed"
                colliders={false}
                position={[point.x, point.y, point.z]}
                rotation={[0, point.rotation, 0]}
              >
                {model.startsWith("Wood") ? (
                  <CuboidCollider
                    args={[point.scale * 0.14, point.scale * 0.1, point.scale * 0.45]}
                    position={[0, point.scale * 0.12, 0]}
                  />
                ) : (
                  <CylinderCollider
                    args={[point.scale * 0.4, point.scale * 0.22]}
                    position={[0, point.scale * 0.4, 0]}
                  />
                )}
              </RigidBody>
            ))}
        </group>
      ))}
    </>
  );
}
