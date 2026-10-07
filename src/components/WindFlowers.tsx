import { useFrame } from "@react-three/fiber";
import { useWorld } from "koota/react";
import { InstanceBatch, PlayerPosition } from "../gameplay/ecs/traits";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { scatter, valueNoise } from "../gameplay/terrain";
import { allowsGrass } from "../gameplay/grass";
import { useReducedMotion } from "../hooks/useReducedMotion";
import {
  distanceFadeDiscard,
  distanceFadeFragment,
  distanceFadeUniforms,
  distanceFadeVertex,
} from "./distanceFade";

const FLOWER_FAR = 60;

function paint(geometry: THREE.BufferGeometry, color: string) {
  const rgb = new THREE.Color(color);
  const colors = new Float32Array(geometry.getAttribute("position").count * 3);
  for (let i = 0; i < colors.length; i += 3) rgb.toArray(colors, i);
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return geometry;
}

class FlowerField {
  readonly geometry: THREE.BufferGeometry;
  readonly time = { value: 0 };
  readonly wind = { value: 1 };
  readonly player = { value: new THREE.Vector3(1000, 1000, 1000) };
  readonly material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 });
  constructor(color: string) {
    const stem = paint(
      new THREE.CylinderGeometry(0.016, 0.024, 0.7, 5).translate(0, 0.35, 0),
      "#537137",
    );
    const parts: THREE.BufferGeometry[] = [stem];
    for (let i = 0; i < 5; i++) {
      const angle = (i / 5) * Math.PI * 2;
      parts.push(
        paint(
          new THREE.SphereGeometry(0.09, 6, 4)
            .scale(1, 0.4, 0.65)
            .rotateY(-angle)
            .translate(Math.cos(angle) * 0.09, 0.72, Math.sin(angle) * 0.09),
          color,
        ),
      );
    }
    parts.push(paint(new THREE.SphereGeometry(0.045, 6, 4).translate(0, 0.75, 0), "#eac553"));
    this.geometry = mergeGeometries(parts);
    parts.forEach((part) => part.dispose());
    this.material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, distanceFadeUniforms(FLOWER_FAR), {
        uFlowerTime: this.time,
        uFlowerWind: this.wind,
        uFlowerPlayer: this.player,
      });
      shader.vertexShader =
        distanceFadeVertex +
        "uniform float uFlowerTime, uFlowerWind; uniform vec3 uFlowerPlayer;\n" +
        shader.vertexShader;
      shader.fragmentShader = (distanceFadeFragment + shader.fragmentShader).replace(
        "void main() {",
        `void main() {\n${distanceFadeDiscard}`,
      );
      shader.vertexShader = shader.vertexShader.replace(
        "#include <begin_vertex>",
        `
        #include <begin_vertex>
        vec3 root = instanceMatrix[3].xyz;
        vDistanceFade = distanceFade(root);
        float height = clamp(position.y / 0.8, 0.0, 1.0);
        float gust = sin(root.x*0.24+root.z*0.18+uFlowerTime*1.6)*0.65 + sin(root.z*0.63-uFlowerTime*2.3)*0.25;
        vec2 away = root.xz-uFlowerPlayer.xz;
        float push = (1.0-smoothstep(0.2,1.35,length(away))) * (1.0-smoothstep(0.5,2.0,abs(root.y-uFlowerPlayer.y)));
        vec2 offset = vec2(0.8,0.4)*(0.18+gust*0.2)*uFlowerWind + away/max(length(away),0.01)*push*0.55;
        mat3 basis = mat3(instanceMatrix);
        transformed += transpose(basis)*vec3(offset.x,-push*0.2,offset.y)*height*height/dot(basis[0],basis[0]);
      `,
      );
    };
    this.material.customProgramCacheKey = () => "wind-flowers-v2";
  }
  update(time: number, reduced: boolean, player: { x: number; y: number; z: number }) {
    this.time.value = time;
    this.wind.value = reduced ? 0 : 1;
    this.player.value.set(player.x, player.y, player.z);
  }
}

function FlowerPatch({ color, seed }: { color: string; seed: number }) {
  const world = useWorld();
  const field = useMemo(() => new FlowerField(color), [color]);
  const points = useMemo(
    () =>
      // Wildflowers gather in drifts (meadow reference), not an even sprinkle.
      scatter(1700, 3, 112, seed, 0.75, 1.5).filter(
        (point) =>
          allowsGrass(point.x, point.z) &&
          valueNoise(point.x * 0.07 + seed, point.z * 0.07 - seed) > 0.52,
      ),
    [seed],
  );
  const ref = useRef<THREE.InstancedMesh>(null);
  const reduced = useReducedMotion();
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const transform = new THREE.Object3D();
    const matrices = new Float32Array(points.length * 16);
    points.forEach((p, i) => {
      transform.position.set(p.x, p.y, p.z);
      transform.rotation.y = p.rotation;
      transform.scale.setScalar(p.scale);
      transform.updateMatrix();
      mesh.setMatrixAt(i, transform.matrix);
      transform.matrix.toArray(matrices, i * 16);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    if (mesh.boundingSphere) mesh.boundingSphere.radius += 1;
    const entity = world.spawn(
      InstanceBatch({
        points,
        matrices,
        levels: new Uint8Array(points.length),
        detail: [mesh],
        proxy: [],
        radius: 1.2,
        centerY: 0.5,
        near: FLOWER_FAR,
        far: FLOWER_FAR,
        shadows: false,
      }),
    );
    return () => entity.destroy();
  }, [points, world]);
  useFrame((state) => field.update(state.clock.elapsedTime, reduced, world.get(PlayerPosition)!));
  useEffect(
    () => () => {
      field.geometry.dispose();
      field.material.dispose();
    },
    [field],
  );
  return (
    <instancedMesh
      name="wind-flowers"
      ref={ref}
      args={[field.geometry, field.material, points.length]}
      receiveShadow
      dispose={null}
    />
  );
}

export function WindFlowers() {
  return (
    <>
      {["#f4eedc", "#e3a3c6", "#a78bd6", "#f1d167", "#e2764f"].map((color, i) => (
        <FlowerPatch key={color} color={color} seed={710 + i} />
      ))}
    </>
  );
}
