import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import {
  BallCollider,
  ConvexHullCollider,
  CuboidCollider,
  CylinderCollider,
  RigidBody,
} from "@react-three/rapier";
import * as THREE from "three";
import { ReferenceCourse } from "./ReferenceCourse";
import {
  courseLabels,
  courseObstacles,
  COURSE_EXTENT,
  type CourseShape,
} from "../gameplay/collisionCourse";

const pyramidVertices = new Float32Array([
  -0.5, -0.5, -0.5, 0.5, -0.5, -0.5, 0.5, -0.5, 0.5, -0.5, -0.5, 0.5, 0, 0.5, 0,
]);
function makeGeometry(shape: CourseShape) {
  if (shape === "box") return new THREE.BoxGeometry(1, 1, 1);
  if (shape === "sphere") return new THREE.SphereGeometry(0.5, 16, 12);
  if (shape === "cylinder") return new THREE.CylinderGeometry(0.5, 0.5, 1, 16);
  const indexed = new THREE.BufferGeometry();
  indexed.setAttribute("position", new THREE.BufferAttribute(pyramidVertices, 3));
  indexed.setIndex([0, 4, 1, 1, 4, 2, 2, 4, 3, 3, 4, 0, 0, 2, 3, 0, 1, 2]);
  const result = indexed.toNonIndexed();
  result.computeVertexNormals();
  indexed.dispose();
  return result;
}

function ObstacleInstances({ shape }: { shape: CourseShape }) {
  const obstacles = useMemo(() => courseObstacles.filter((o) => o.shape === shape), [shape]);
  const geometry = useMemo(() => makeGeometry(shape), [shape]);
  const mesh = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const transform = new THREE.Object3D();
    const color = new THREE.Color();
    obstacles.forEach((obstacle, i) => {
      transform.position.fromArray(obstacle.position);
      transform.rotation.set(...(obstacle.rotation ?? [0, 0, 0]));
      transform.scale.fromArray(obstacle.size);
      transform.updateMatrix();
      mesh.current!.setMatrixAt(i, transform.matrix);
      mesh.current!.setColorAt(i, color.set(obstacle.color));
    });
    mesh.current!.instanceMatrix.needsUpdate = true;
    if (mesh.current!.instanceColor) mesh.current!.instanceColor.needsUpdate = true;
    mesh.current!.computeBoundingSphere();
  }, [obstacles]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <instancedMesh
      name={`course-${shape}`}
      ref={mesh}
      args={[geometry, undefined, obstacles.length]}
      castShadow
      receiveShadow
    >
      <meshStandardMaterial roughness={0.85} />
    </instancedMesh>
  );
}

function GroundLabel({ text, position }: (typeof courseLabels)[number]) {
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 1024;
    canvas.height = 128;
    const context = canvas.getContext("2d")!;
    context.fillStyle = "#f2e4c7";
    context.font = "bold 38px monospace";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(text, 512, 64);
    const result = new THREE.CanvasTexture(canvas);
    result.colorSpace = THREE.SRGBColorSpace;
    return result;
  }, [text]);
  useEffect(() => () => texture.dispose(), [texture]);
  return (
    <mesh position={position} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[13, 1.6]} />
      <meshBasicMaterial map={texture} transparent depthWrite={false} />
    </mesh>
  );
}

export function CollisionCourse() {
  const checker = useMemo(() => {
    const texture = new THREE.DataTexture(
      new Uint8Array([48, 54, 60, 255, 69, 77, 83, 255, 69, 77, 83, 255, 48, 54, 60, 255]),
      2,
      2,
    );
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.magFilter = THREE.NearestFilter;
    texture.repeat.set(32, 32);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;
    return texture;
  }, []);
  useEffect(() => () => checker.dispose(), [checker]);
  return (
    <>
      <ReferenceCourse />
      <RigidBody type="fixed" colliders={false} friction={1}>
        <CuboidCollider args={[COURSE_EXTENT, 0.3, COURSE_EXTENT]} position={[0, -0.3, 0]} />
        {courseObstacles.map((o, i) => {
          const [x, y, z] = o.size;
          const props = { position: o.position, rotation: o.rotation };
          if (o.shape === "box")
            return <CuboidCollider key={i} {...props} args={[x / 2, y / 2, z / 2]} />;
          if (o.shape === "sphere") return <BallCollider key={i} {...props} args={[x / 2]} />;
          if (o.shape === "cylinder")
            return <CylinderCollider key={i} {...props} args={[y / 2, x / 2]} />;
          const vertices = pyramidVertices.map((v, index) => v * o.size[index % 3]);
          return <ConvexHullCollider key={i} {...props} args={[vertices]} />;
        })}
      </RigidBody>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[COURSE_EXTENT * 2, COURSE_EXTENT * 2]} />
        <meshStandardMaterial map={checker} roughness={1} />
      </mesh>
      {(["box", "pyramid", "sphere", "cylinder"] as const).map((shape) => (
        <ObstacleInstances key={shape} shape={shape} />
      ))}
      {courseLabels.map((label) => (
        <GroundLabel key={label.text} {...label} />
      ))}
      {Array.from({ length: 8 }, (_, i) => (
        <RigidBody
          key={i}
          colliders="cuboid"
          position={[-19 + (i % 4) * 1.3, 0.6 + Math.floor(i / 4) * 1.2, 22]}
          mass={2}
          friction={0.8}
          restitution={0.05}
        >
          <mesh castShadow receiveShadow>
            <boxGeometry args={[1.15, 1.15, 1.15]} />
            <meshStandardMaterial color="#d5bd50" roughness={0.8} />
          </mesh>
        </RigidBody>
      ))}
    </>
  );
}
