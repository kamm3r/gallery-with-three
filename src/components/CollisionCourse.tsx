import { createRef, useEffect, useLayoutEffect, useMemo, useRef, type RefObject } from "react";
import {
  BallCollider,
  ConeCollider,
  ConvexHullCollider,
  CuboidCollider,
  CylinderCollider,
  RigidBody,
  TrimeshCollider,
  useBeforePhysicsStep,
  useRevoluteJoint,
  type IntersectionEnterPayload,
  type RapierCollider,
  type RapierRigidBody,
} from "@react-three/rapier";
import { useWorld } from "koota/react";
import * as THREE from "three";
import {
  BRIDGE_PITCH,
  PARK_EXTENT,
  parkBridge,
  parkJumpPads,
  parkLabels,
  parkOneWay,
  parkPushables,
  parkSeesaw,
  parkStatics,
  parkStrips,
  parkTerrain,
  terrainHeight,
  terrainMask,
  type ParkBoard,
  type ParkJumpPad,
  type ParkStaticShape,
  type Tuple3,
} from "../gameplay/collisionCourse";
import { PlayerPosition } from "../gameplay/ecs/traits";
import { playerBodyData } from "../gameplay/playerBody";

const pyramidVertices = new Float32Array([
  -0.5, -0.5, -0.5, 0.5, -0.5, -0.5, 0.5, -0.5, 0.5, -0.5, -0.5, 0.5, 0, 0.5, 0,
]);

function makeGeometry(shape: ParkStaticShape) {
  if (shape === "box") return new THREE.BoxGeometry(1, 1, 1);
  // The 16 m dome needs enough segments for the mesh to match its collider.
  if (shape === "sphere") return new THREE.SphereGeometry(0.5, 48, 32);
  if (shape === "cylinder") return new THREE.CylinderGeometry(0.5, 0.5, 1, 20);
  if (shape === "cone") return new THREE.ConeGeometry(0.5, 1, 32);
  const indexed = new THREE.BufferGeometry();
  indexed.setAttribute("position", new THREE.BufferAttribute(pyramidVertices, 3));
  indexed.setIndex([0, 4, 1, 1, 4, 2, 2, 4, 3, 3, 4, 0, 0, 2, 3, 0, 1, 2]);
  const result = indexed.toNonIndexed();
  result.computeVertexNormals();
  indexed.dispose();
  return result;
}

function StaticInstances({ shape }: { shape: ParkStaticShape }) {
  const obstacles = useMemo(() => parkStatics.filter((o) => o.shape === shape), [shape]);
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
  if (obstacles.length === 0) return null;
  return (
    <instancedMesh
      name={`park-${shape}`}
      ref={mesh}
      args={[geometry, undefined, obstacles.length]}
      castShadow
      receiveShadow
    >
      <meshStandardMaterial roughness={0.9} />
    </instancedMesh>
  );
}

function makeGridTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext("2d")!;
  context.fillStyle = "#b7bcc2";
  context.fillRect(0, 0, 256, 256);
  context.strokeStyle = "#9aa0a8";
  context.lineWidth = 2;
  context.strokeRect(1, 1, 254, 254);
  context.strokeStyle = "#a8adb4";
  context.lineWidth = 1;
  context.beginPath();
  context.moveTo(128, 0);
  context.lineTo(128, 256);
  context.moveTo(0, 128);
  context.lineTo(256, 128);
  context.stroke();
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(PARK_EXTENT, PARK_EXTENT);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function Terrain() {
  const { geometry, checker } = useMemo(() => {
    const [w, d] = parkTerrain.size;
    const geometry = new THREE.PlaneGeometry(w, d, parkTerrain.segments, parkTerrain.segments);
    geometry.rotateX(-Math.PI / 2);
    const positions = geometry.attributes.position;
    for (let i = 0; i < positions.count; i++) {
      const lx = positions.getX(i);
      const lz = positions.getZ(i);
      positions.setY(i, terrainHeight(lx, lz) * terrainMask(lx, lz, w / 2, d / 2));
    }
    geometry.computeVertexNormals();
    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 128;
    const context = canvas.getContext("2d")!;
    context.fillStyle = "#c9ccd1";
    context.fillRect(0, 0, 128, 128);
    context.fillStyle = "#7e838b";
    context.fillRect(0, 0, 64, 64);
    context.fillRect(64, 64, 64, 64);
    const checker = new THREE.CanvasTexture(canvas);
    checker.wrapS = checker.wrapT = THREE.RepeatWrapping;
    checker.repeat.set(11, 11);
    checker.magFilter = THREE.NearestFilter;
    checker.colorSpace = THREE.SRGBColorSpace;
    return { geometry, checker };
  }, []);
  const colliderArgs = useMemo(() => {
    const positions = geometry.attributes.position.array as Float32Array;
    // PlaneGeometry emits 16-bit indices; Rapier trimesh requires 32-bit.
    const index = Uint32Array.from(geometry.index!.array);
    return [positions, index] as [Float32Array, Uint32Array];
  }, [geometry]);
  useEffect(
    () => () => {
      geometry.dispose();
      checker.dispose();
    },
    [geometry, checker],
  );
  const [cx, , cz] = parkTerrain.center;
  return (
    <RigidBody type="fixed" colliders={false} position={[cx, 0, cz]} friction={1}>
      <TrimeshCollider args={colliderArgs} />
      <mesh geometry={geometry} receiveShadow>
        <meshStandardMaterial map={checker} roughness={1} />
      </mesh>
    </RigidBody>
  );
}

// Rapier 0.20 has no native one-way flag, so the solid deck is gated per
// physics step: pass through from below, land from above.
function OneWayBoard({ board }: { board: ParkBoard }) {
  const world = useWorld();
  const solid = useRef<RapierCollider>(null);
  const previousFeet = useRef<number | null>(null);
  const topY = board.position[1] + board.size[1] / 2;
  useBeforePhysicsStep((physics) => {
    const collider = solid.current;
    if (!collider) return;
    const player = world.get(PlayerPosition);
    if (!player?.valid) {
      collider.setEnabled(false);
      previousFeet.current = null;
      return;
    }
    const dt = Math.max(physics.timestep, 1e-4);
    const feet = player.y;
    const verticalSpeed = previousFeet.current === null ? 0 : (feet - previousFeet.current) / dt;
    previousFeet.current = feet;
    collider.setEnabled(feet > topY + 0.02 && verticalSpeed < 1.0);
  });
  return (
    <RigidBody type="fixed" colliders={false} position={board.position} friction={1}>
      <CuboidCollider
        ref={solid}
        args={[board.size[0] / 2, board.size[1] / 2, board.size[2] / 2]}
      />
      <mesh castShadow receiveShadow>
        <boxGeometry args={board.size} />
        <meshStandardMaterial color={board.color} roughness={0.65} />
      </mesh>
    </RigidBody>
  );
}

function JumpPad({ pad }: { pad: ParkJumpPad }) {
  const lastFire = useRef(0);
  const boost = (payload: IntersectionEnterPayload) => {
    const now = performance.now();
    if (now - lastFire.current < 250) return;
    const body = payload.other.rigidBody;
    if (!body) return;
    const player = playerBodyData(body);
    if (player) {
      lastFire.current = now;
      player.launch(pad.strength, 0.4);
      return;
    }
    if (!body.isDynamic()) return;
    const velocity = body.linvel();
    if (velocity.y >= pad.strength - 0.5) return;
    lastFire.current = now;
    body.wakeUp?.();
    body.setLinvel({ x: velocity.x * 0.4, y: pad.strength, z: velocity.z * 0.4 }, true);
    body.setAngvel({ x: 0, y: 0, z: 0 }, true);
  };
  return (
    <RigidBody type="fixed" colliders={false} position={pad.position}>
      <CuboidCollider
        sensor
        position={[0, 0.8, 0]}
        args={[pad.size[0] / 2, 0.8, pad.size[2] / 2]}
        onIntersectionEnter={boost}
      />
      <mesh castShadow receiveShadow>
        <boxGeometry args={pad.size} />
        <meshStandardMaterial
          color={pad.color}
          emissive={pad.color}
          emissiveIntensity={0.55}
          roughness={0.5}
        />
      </mesh>
    </RigidBody>
  );
}

function ZoneLabel({ text, position }: { text: string; position: [number, number, number] }) {
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 1024;
    canvas.height = 128;
    const context = canvas.getContext("2d")!;
    context.fillStyle = "#3d434b";
    context.font = "bold 44px monospace";
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
      <planeGeometry args={[14, 1.75]} />
      <meshBasicMaterial map={texture} transparent depthWrite={false} />
    </mesh>
  );
}

function BridgeHinge({
  a,
  b,
  anchorA,
  anchorB,
}: {
  a: RefObject<RapierRigidBody | null>;
  b: RefObject<RapierRigidBody | null>;
  anchorA: Tuple3;
  anchorB: Tuple3;
}) {
  useRevoluteJoint(a as RefObject<RapierRigidBody>, b as RefObject<RapierRigidBody>, [
    anchorA,
    anchorB,
    [1, 0, 0],
  ]);
  return null;
}

// Light dynamic planks hinged end to end. The fixed course body sits at the
// origin, so its deck anchors are plain world points.
function PlankBridge({ ground }: { ground: RefObject<RapierRigidBody | null> }) {
  const planks = useMemo(
    () => Array.from({ length: parkBridge.planks }, () => createRef<RapierRigidBody>()),
    [],
  );
  const [x] = parkBridge.deckA;
  const y = parkBridge.height - parkBridge.plankSize[1] / 2;
  const startZ = parkBridge.deckA[2] - parkBridge.deckSize[2] / 2;
  const half = BRIDGE_PITCH / 2;
  return (
    <>
      {planks.map((plank, i) => (
        <RigidBody
          key={i}
          ref={plank}
          colliders="cuboid"
          position={[x, y, startZ - BRIDGE_PITCH * (i + 0.5)]}
          linearDamping={0.4}
          angularDamping={0.8}
          friction={1}
        >
          <mesh castShadow receiveShadow>
            <boxGeometry args={parkBridge.plankSize} />
            <meshStandardMaterial color="#e09543" roughness={0.75} />
          </mesh>
        </RigidBody>
      ))}
      <BridgeHinge a={ground} b={planks[0]} anchorA={[x, y, startZ]} anchorB={[0, 0, half]} />
      {planks.slice(1).map((plank, i) => (
        <BridgeHinge
          key={i}
          a={planks[i]}
          b={plank}
          anchorA={[0, 0, -half]}
          anchorB={[0, 0, half]}
        />
      ))}
      <BridgeHinge
        a={planks[planks.length - 1]}
        b={ground}
        anchorA={[0, 0, -half]}
        anchorB={[x, y, startZ - BRIDGE_PITCH * parkBridge.planks]}
      />
    </>
  );
}

export function CollisionCourse() {
  const ground = useMemo(() => makeGridTexture(), []);
  const groundBody = useRef<RapierRigidBody>(null);
  useEffect(() => () => ground.dispose(), [ground]);
  return (
    <>
      <RigidBody ref={groundBody} type="fixed" colliders={false} friction={1}>
        <CuboidCollider args={[PARK_EXTENT, 0.3, PARK_EXTENT]} position={[0, -0.3, 0]} />
        {parkStatics.map((o, i) => {
          const [x, y, z] = o.size;
          const props = { position: o.position, rotation: o.rotation };
          if (o.shape === "box")
            return <CuboidCollider key={i} {...props} args={[x / 2, y / 2, z / 2]} />;
          if (o.shape === "sphere") return <BallCollider key={i} {...props} args={[x / 2]} />;
          if (o.shape === "cylinder")
            return <CylinderCollider key={i} {...props} args={[y / 2, x / 2]} />;
          if (o.shape === "cone") return <ConeCollider key={i} {...props} args={[y / 2, x / 2]} />;
          const vertices = pyramidVertices.map((v, index) => v * o.size[index % 3]);
          return <ConvexHullCollider key={i} {...props} args={[vertices]} />;
        })}
      </RigidBody>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[PARK_EXTENT * 2, PARK_EXTENT * 2]} />
        <meshStandardMaterial map={ground} roughness={1} />
      </mesh>
      {(["box", "pyramid", "sphere", "cylinder", "cone"] as const).map((shape) => (
        <StaticInstances key={shape} shape={shape} />
      ))}
      {parkStrips.map((strip, i) => (
        <mesh key={i} position={strip.position}>
          <boxGeometry args={strip.size} />
          <meshStandardMaterial
            color={strip.color}
            emissive={strip.color}
            emissiveIntensity={0.35}
          />
        </mesh>
      ))}
      <Terrain />
      {parkOneWay.map((board, i) => (
        <OneWayBoard key={i} board={board} />
      ))}
      {parkJumpPads.map((pad, i) => (
        <JumpPad key={i} pad={pad} />
      ))}
      {parkPushables.map((box, i) => (
        <RigidBody
          key={i}
          colliders="cuboid"
          position={box.position}
          mass={box.mass}
          restitution={0.05}
          friction={0.8}
          canSleep
        >
          <mesh castShadow receiveShadow>
            <boxGeometry args={box.size} />
            <meshStandardMaterial color={box.color} roughness={0.75} />
          </mesh>
        </RigidBody>
      ))}
      <RigidBody
        colliders="cuboid"
        position={parkSeesaw.plank.position}
        mass={parkSeesaw.plank.mass}
        angularDamping={0.5}
        linearDamping={0.1}
        friction={1}
        canSleep
      >
        <mesh castShadow receiveShadow>
          <boxGeometry args={parkSeesaw.plank.size} />
          <meshStandardMaterial color="#e09543" roughness={0.75} />
        </mesh>
      </RigidBody>
      <PlankBridge ground={groundBody} />
      {parkLabels.map((label) => (
        <ZoneLabel key={label.text} text={label.text} position={label.position} />
      ))}
    </>
  );
}
