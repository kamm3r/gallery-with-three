import obstacleDefinitions from "../gameplay/playgroundObstacles.json";
import { SceneDocumentContext, SceneObject, WorldPlaced } from "./SceneObject";
import { structureId } from "../gameplay/sceneOrigins";
import { useEcsRef } from "../hooks/useEcsRef";
import {
  createRef,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  type ReactNode,
  type RefObject,
} from "react";
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
import * as THREE from "three";
import {
  BRIDGE_PITCH,
  PARK_EXTENT,
  parkBridge,
  parkBridgeHinges,
  parkJumpPads,
  parkLabels,
  parkOneWay,
  parkPushables,
  parkSeesaw,
  parkStrips,
  SLOPE_ANGLES,
  SLOPE_LIMIT_DEG,
  SLIDE_LIMIT_DEG,
  parkCrateStep,
  parkOrbit,
  parkBallPit,
  parkCrusher,
  parkDominoes,
  parkFastElevator,
  parkScraper,
  parkSuperPads,
  parkTerrain,
  terrainHeight,
  terrainMask,
  type ParkBoard,
  type ParkJumpPad,
  type ParkStatic,
  type Tuple3,
} from "../gameplay/collisionCourse";
import { newOneWayState, oneWayWarning, stepOneWayBoard } from "../gameplay/oneWayBoard";
import { playerBodyData, playerFeet } from "../gameplay/playerBody";
import { KinematicPlatform } from "./KinematicPlatform";
import { batchStaticMeshes } from "../gameplay/batchStaticMeshes";
import { playgroundMaterial, pyramidVertices, unitGeometry } from "../gameplay/playgroundResources";

/** Material names by role, so the resource list reads as a palette. */
const COLOR_ROLES: Record<string, string> = {
  "#8a8f96": "Obstacle grey",
  "#d63c2f": "Funnel red",
  "#e09543": "Dynamic orange",
  "#e0303e": "One-way red",
  "#d926d9": "Jump pad magenta",
  "#2eff5a": "Walkable green",
  "#ffd23e": "Stall yellow",
  "#ff2e3e": "Too-steep red",
};
const roleName = (color: string, fallback: string) =>
  COLOR_ROLES[color.toLowerCase()] ?? `${fallback} ${color}`;

const dynamicMaterial = () => playgroundMaterial("Dynamic orange", "#e09543", { roughness: 0.75 });

/** Marks meshes that never move, so play mode may merge them into batches. */
const STATIC_MESH = { courseStatic: true };

function batchable(mesh: THREE.Mesh) {
  if (!mesh.userData.courseStatic) return false;
  // A hidden authored node hides its group, not the mesh itself.
  for (let node: THREE.Object3D | null = mesh; node; node = node.parent)
    if (!node.visible) return false;
    else if (node.userData.sceneProperties) {
      const p = node.userData.sceneProperties;
      // Overrides are applied to each source mesh, including async texture loads.
      // Keep those meshes out of immutable batches, and allow authored bodies to move.
      if (
        p.material ||
        p.materialId ||
        p.materialColor ||
        p.roughness !== undefined ||
        p.metalness !== undefined ||
        p.castShadow !== undefined ||
        p.receiveShadow !== undefined ||
        Object.keys(p.components ?? {}).length
      )
        return false;
    }
  return true;
}

type CourseObstacle = ParkStatic & { id: string; zone: string; part?: string; name: string };
const obstacles = obstacleDefinitions as CourseObstacle[];

/** One authored obstacle: its own root, so editing one never moves another. */
function Obstacle({ obstacle }: { obstacle: CourseObstacle }) {
  const document = useContext(SceneDocumentContext);
  const { shape } = obstacle;
  const [x, y, z] = obstacle.size;
  const scale = document.objects[obstacle.id]?.scale ?? [1, 1, 1];
  const nonuniform = scale[0] !== scale[1] || scale[1] !== scale[2];
  const geometry = unitGeometry[shape];
  const vertices = () =>
    Float32Array.from(geometry.getAttribute("position").array, (v, i) => v * obstacle.size[i % 3]);
  const collider =
    nonuniform && shape !== "box" ? (
      <ConvexHullCollider args={[vertices()]} />
    ) : shape === "box" ? (
      <CuboidCollider args={[x / 2, y / 2, z / 2]} />
    ) : shape === "sphere" ? (
      <BallCollider args={[x / 2]} />
    ) : shape === "cylinder" ? (
      <CylinderCollider args={[y / 2, x / 2]} />
    ) : shape === "cone" ? (
      <ConeCollider args={[y / 2, x / 2]} />
    ) : (
      <ConvexHullCollider args={[pyramidVertices.map((v, i) => v * obstacle.size[i % 3])]} />
    );
  return (
    <SceneObject
      id={obstacle.id}
      name={obstacle.name}
      position={obstacle.position}
      rotation={obstacle.rotation}
    >
      <RigidBody type="fixed" colliders={false} friction={1}>
        {collider}
        <mesh
          name={`${shape}-mesh`}
          userData={STATIC_MESH}
          dispose={null}
          geometry={geometry}
          material={playgroundMaterial(roleName(obstacle.color, "Obstacle"), obstacle.color, {
            roughness: 0.9,
          })}
          scale={obstacle.size}
          castShadow
          receiveShadow
        />
      </RigidBody>
    </SceneObject>
  );
}

/** Obstacles in authored order, split into the structures they form. */
function zoneStructures(zone: string) {
  const structures: Array<{ part?: string; pieces: CourseObstacle[] }> = [];
  for (const obstacle of obstacles) {
    if (obstacle.zone !== zone) continue;
    const last = structures[structures.length - 1];
    const existing = obstacle.part
      ? structures.find((structure) => structure.part === obstacle.part)
      : last && !last.part
        ? last
        : undefined;
    if (existing) existing.pieces.push(obstacle);
    else structures.push({ part: obstacle.part, pieces: [obstacle] });
  }
  return structures;
}

/**
 * A course station: its floor label, the structures its obstacles form, and
 * any moving parts. `extras` adds children to a named structure; `children`
 * adds standalone pieces to the zone itself.
 */
function CourseZone({
  id,
  name,
  extras = {},
  children,
}: {
  id: string;
  name: string;
  extras?: Record<string, ReactNode>;
  children?: ReactNode;
}) {
  const labels = parkLabels.filter((label) => label.zone === id);
  return (
    <SceneObject id={`zone-${id}`} name={name}>
      <WorldPlaced>
        {labels.map((label) => (
          <ZoneLabel key={label.text} text={label.text} position={label.position} />
        ))}
      </WorldPlaced>
      {zoneStructures(id).map(({ part, pieces }) => {
        const content = pieces.map((obstacle) => (
          <Obstacle key={obstacle.id} obstacle={obstacle} />
        ));
        if (!part) return content;
        return (
          <SceneObject key={part} id={structureId(id, part)} name={part}>
            {content}
            {extras[part]}
          </SceneObject>
        );
      })}
      {children}
    </SceneObject>
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
    // Shade by height so the relief reads at a glance: valleys darker, crests lighter.
    let low = Infinity;
    let high = -Infinity;
    for (let i = 0; i < positions.count; i++) {
      low = Math.min(low, positions.getY(i));
      high = Math.max(high, positions.getY(i));
    }
    const colors = new Float32Array(positions.count * 3);
    for (let i = 0; i < positions.count; i++) {
      const t = (positions.getY(i) - low) / Math.max(high - low, 1e-6);
      colors.fill(0.72 + t * 0.36, i * 3, i * 3 + 3);
    }
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
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
    checker.name = "Terrain checker";
    return { geometry, checker };
  }, []);
  const material = useMemo(() => {
    const result = new THREE.MeshStandardMaterial({
      map: checker,
      vertexColors: true,
      roughness: 1,
    });
    result.name = "Terrain checker";
    return result;
  }, [checker]);
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
      material.dispose();
    },
    [geometry, checker, material],
  );
  const [cx, , cz] = parkTerrain.center;
  return (
    <SceneObject id="terrain" name="Terrain" position={[cx, 0, cz]}>
      <RigidBody type="fixed" colliders={false} friction={1}>
        <TrimeshCollider args={colliderArgs} />
        <mesh name="terrain-mesh" geometry={geometry} material={material} receiveShadow />
      </RigidBody>
    </SceneObject>
  );
}

// Rapier has no native one-way flag, so the solid deck is gated per physics
// step from the player's capsule: open from below, solid from above, and
// open again once you have stood on it past the grace time (oneWayBoard.ts).
// @react-three/rapier drops a RigidBody's `mass` before building its auto
// colliders, so a `mass` prop is silently ignored there. `density` reaches
// the colliders; these turn a target mass into one.
function boxDensity(mass: number, size: Tuple3) {
  return mass / (size[0] * size[1] * size[2]);
}
function ballDensity(mass: number, diameter: number) {
  return mass / ((Math.PI / 6) * diameter ** 3);
}

function OneWayBoard({ board }: { board: ParkBoard }) {
  const solid = useRef<RapierCollider>(null);
  const mesh = useRef<THREE.Mesh>(null);
  const state = useRef(newOneWayState());
  const time = useRef(0);
  useBeforePhysicsStep((world) => {
    const collider = solid.current;
    if (!collider) return;
    const feet = playerFeet();
    collider.setEnabled(
      stepOneWayBoard(
        state.current,
        feet,
        { center: collider.translation(), half: collider.halfExtents()!, reach: feet?.radius ?? 0 },
        world.timestep,
      ),
    );
    // Shake as a warning before the board lets you through.
    time.current += world.timestep;
    const warn = oneWayWarning(state.current) * 0.04;
    mesh.current?.position.set(
      Math.sin(time.current * 71) * warn,
      0,
      Math.cos(time.current * 59) * warn,
    );
  });
  return (
    <RigidBody type="fixed" colliders={false} position={board.position} friction={1}>
      <CuboidCollider
        ref={solid}
        args={[board.size[0] / 2, board.size[1] / 2, board.size[2] / 2]}
      />
      <mesh
        ref={mesh}
        name="one-way-board-mesh"
        geometry={unitGeometry.box}
        material={playgroundMaterial(roleName(board.color, "Board"), board.color, {
          roughness: 0.65,
        })}
        scale={board.size}
        castShadow
        receiveShadow
        dispose={null}
      />
    </RigidBody>
  );
}

function JumpPad({ pad }: { pad: ParkJumpPad }) {
  const lastFire = useEcsRef("lastFire", () => 0);
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
      <mesh
        name="jump-pad-mesh"
        geometry={unitGeometry.box}
        material={playgroundMaterial(roleName(pad.color, "Jump pad"), pad.color, {
          emissive: true,
          emissiveIntensity: 0.55,
          roughness: 0.5,
        })}
        scale={pad.size}
        castShadow
        receiveShadow
        dispose={null}
      />
    </RigidBody>
  );
}

export function ZoneLabel({
  text,
  position,
}: {
  text: string;
  position: [number, number, number];
}) {
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
    result.name = `Label · ${text}`;
    return result;
  }, [text]);
  useEffect(() => () => texture.dispose(), [texture]);
  return (
    <mesh
      userData={{ sceneDecoration: true }}
      name={`label-${text}`}
      position={position}
      rotation={[-Math.PI / 2, 0, 0]}
    >
      <planeGeometry args={[14, 1.75]} />
      {/* Each label bakes its own text, so its material stays unique. */}
      <meshBasicMaterial name={`Label · ${text}`} map={texture} transparent depthWrite={false} />
    </mesh>
  );
}

function BridgeHinge({
  a,
  b,
  anchorA,
  anchorB,
  limited = false,
}: {
  a: RefObject<RapierRigidBody | null>;
  b: RefObject<RapierRigidBody | null>;
  anchorA: Tuple3;
  anchorB: Tuple3;
  /** Plank-to-plank hinges bend a little, never fold into a V under a step. */
  limited?: boolean;
}) {
  useRevoluteJoint(
    a as RefObject<RapierRigidBody>,
    b as RefObject<RapierRigidBody>,
    limited
      ? [anchorA, anchorB, [1, 0, 0], [-BRIDGE_HINGE_LIMIT, BRIDGE_HINGE_LIMIT]]
      : [anchorA, anchorB, [1, 0, 0]],
  );
  return null;
}

/** Radians each hinge may bend; the slack chain hangs within it. */
const BRIDGE_HINGE_LIMIT = 0.3;

// Light dynamic planks hinged end to end, spawned on their hanging arc. The
// fixed course body sits at the origin, so its deck anchors are plain world points.
function PlankBridge({ ground }: { ground: RefObject<RapierRigidBody | null> }) {
  const planks = useMemo(
    () => Array.from({ length: parkBridge.planks }, () => createRef<RapierRigidBody>()),
    [],
  );
  const x = parkBridge.x;
  const half = BRIDGE_PITCH / 2;
  const first = parkBridgeHinges[0];
  const last = parkBridgeHinges[parkBridge.planks];
  return (
    <>
      {planks.map((plank, i) => {
        const [y0, z0] = parkBridgeHinges[i];
        const [y1, z1] = parkBridgeHinges[i + 1];
        // Local +z points back toward deck A (the hinge at +half).
        const tilt = Math.atan2(-(y0 - y1), z0 - z1);
        return (
          <RigidBody
            key={i}
            name={`bridge-plank-${i + 1}`}
            ref={plank}
            colliders="cuboid"
            // Default density makes a plank ~0.2 kg; against the 10 kg player
            // the joint chain stretches and sinks. Near-equal masses hold.
            density={boxDensity(parkBridge.plankMass, parkBridge.plankSize)}
            additionalSolverIterations={4}
            position={[x, (y0 + y1) / 2, (z0 + z1) / 2]}
            rotation={[tilt, 0, 0]}
            linearDamping={0.4}
            angularDamping={0.8}
            friction={1}
          >
            <mesh
              name="bridge-plank-mesh"
              geometry={unitGeometry.box}
              material={dynamicMaterial()}
              scale={parkBridge.plankSize}
              castShadow
              receiveShadow
              dispose={null}
            />
          </RigidBody>
        );
      })}
      <BridgeHinge a={ground} b={planks[0]} anchorA={[x, ...first]} anchorB={[0, 0, half]} />
      {planks.slice(1).map((plank, i) => (
        <BridgeHinge
          key={i}
          a={planks[i]}
          b={plank}
          anchorA={[0, 0, -half]}
          anchorB={[0, 0, half]}
          limited
        />
      ))}
      <BridgeHinge
        a={planks[planks.length - 1]}
        b={ground}
        anchorA={[0, 0, -half]}
        anchorB={[x, ...last]}
      />
    </>
  );
}

function BridgeAssembly() {
  const anchor = useRef<RapierRigidBody>(null);
  return (
    <>
      <RigidBody ref={anchor} type="fixed" colliders={false} />
      <PlankBridge ground={anchor} />
    </>
  );
}

/**
 * The proving-grounds course. `batchStatic` merges the fixed obstacles into a
 * few draw calls by material and area; the editor leaves it off so every
 * obstacle stays individually selectable.
 */
export function CollisionCourse({ batchStatic = false }: { batchStatic?: boolean }) {
  const root = useRef<THREE.Group>(null);
  const sceneDocument = useContext(SceneDocumentContext);
  // Re-batch whenever the scene document changes: edited obstacles remount.
  useLayoutEffect(() => {
    if (!batchStatic || !root.current) return;
    const merged = batchStaticMeshes(root.current, 32, true, batchable);
    merged.batch.name = "course-static-batches";
    return () => merged.dispose();
  }, [batchStatic, sceneDocument]);
  const ground = useMemo(() => makeGridTexture(), []);
  const groundMaterial = useMemo(() => {
    const result = new THREE.MeshStandardMaterial({ map: ground, roughness: 1 });
    result.name = "Ground grid";
    return result;
  }, [ground]);
  const groundBody = useRef<RapierRigidBody>(null);
  useEffect(
    () => () => {
      ground.dispose();
      groundMaterial.dispose();
    },
    [ground, groundMaterial],
  );
  return (
    <group ref={root} name="collision-course">
      <group name="ground">
        <RigidBody name="ground-body" ref={groundBody} type="fixed" colliders={false} friction={1}>
          <CuboidCollider args={[PARK_EXTENT, 0.3, PARK_EXTENT]} position={[0, -0.3, 0]} />
        </RigidBody>
        <mesh
          name="ground-mesh"
          rotation={[-Math.PI / 2, 0, 0]}
          material={groundMaterial}
          receiveShadow
        >
          <planeGeometry args={[PARK_EXTENT * 2, PARK_EXTENT * 2]} />
        </mesh>
      </group>

      {/* North field */}
      <CourseZone
        id="slopes"
        name="Slopes"
        extras={Object.fromEntries(
          SLOPE_ANGLES.map((degrees, i) => [`Lane ${degrees}°`, <ZoneStrip key={i} index={i} />]),
        )}
      />
      <CourseZone id="steps" name="Stairs" />
      <CourseZone id="funnel" name="Funnel squeeze" />
      <CourseZone id="rough-ground" name="Rough ground" />
      <CourseZone id="terrain" name="Terrain">
        <Terrain />
      </CourseZone>
      <CourseZone id="corners" name="Walls + corners" />

      {/* Middle field */}
      <CourseZone id="kinematic" name="Moving platforms">
        <SceneObject id="platform-disc" name="Rotating disc" position={[-24, 0.7, -12]}>
          <KinematicPlatform
            name="platform-disc"
            position={[0, 0, 0]}
            shape="cylinder"
            radius={4}
            size={[8, 0.4, 8]}
            spin={0.5}
          />
        </SceneObject>
        <SceneObject id="platform-elevator-low" name="Elevator" position={[-15, 1.1, -12]}>
          <KinematicPlatform
            position={[0, 0, 0]}
            axis="y"
            distance={1.1}
            speed={0.8}
            size={[3, 0.4, 3]}
          />
        </SceneObject>
        <SceneObject id="platform-shuttle-x" name="Shuttle X" position={[-24, 1.0, -19]}>
          <KinematicPlatform
            position={[0, 0, 0]}
            axis="x"
            distance={4}
            speed={0.6}
            phase={Math.PI / 2}
            size={[3, 0.4, 3]}
          />
        </SceneObject>
        <SceneObject id="platform-shuttle-z" name="Shuttle Z" position={[-15, 1.0, -19]}>
          <KinematicPlatform
            position={[0, 0, 0]}
            axis="z"
            distance={3}
            speed={0.7}
            size={[2.6, 0.4, 2.6]}
          />
        </SceneObject>
        {/* Orange animated deck: kinematic pitch oscillation. */}
        <SceneObject id="platform-tilt" name="Tilting deck" position={[2, 1.3, -19]}>
          <KinematicPlatform
            name="platform-tilt"
            position={[0, 0, 0]}
            tiltAmp={0.32}
            tiltSpeed={0.9}
            size={[4.2, 0.3, 2.2]}
            color="#e09543"
          />
        </SceneObject>
        {/* Rotate and orbit: carried along a circle while turning with the deck. */}
        <SceneObject id="platform-orbit" name="Orbiting deck" position={parkOrbit.center}>
          <KinematicPlatform
            name="platform-orbit"
            position={[0, 0, 0]}
            orbitRadius={parkOrbit.radius}
            orbitSpeed={parkOrbit.speed}
            spin={parkOrbit.speed}
            size={parkOrbit.size}
          />
        </SceneObject>
      </CourseZone>
      <CourseZone
        id="pushables"
        name="Pushables + seesaw"
        extras={{
          "Crate on a step": (
            <SceneObject id="crate-on-step" name="Crate" position={parkCrateStep.crate.position}>
              <RigidBody
                colliders="cuboid"
                density={boxDensity(parkCrateStep.crate.mass, parkCrateStep.crate.size)}
                restitution={0.05}
                friction={0.8}
                canSleep
              >
                <mesh
                  name="crate-mesh"
                  geometry={unitGeometry.box}
                  material={dynamicMaterial()}
                  scale={parkCrateStep.crate.size}
                  castShadow
                  receiveShadow
                  dispose={null}
                />
              </RigidBody>
            </SceneObject>
          ),
          Seesaw: (
            <SceneObject id="seesaw" name="Plank" position={parkSeesaw.plank.position}>
              <RigidBody
                colliders="cuboid"
                density={boxDensity(parkSeesaw.plank.mass, parkSeesaw.plank.size)}
                angularDamping={0.5}
                linearDamping={0.1}
                friction={1}
                canSleep
              >
                <mesh
                  name="seesaw-plank-mesh"
                  geometry={unitGeometry.box}
                  material={dynamicMaterial()}
                  scale={parkSeesaw.plank.size}
                  castShadow
                  receiveShadow
                  dispose={null}
                />
              </RigidBody>
            </SceneObject>
          ),
        }}
      >
        <SceneObject id="pushables" name="Crates">
          {parkPushables.map((box, i) => (
            <SceneObject
              key={i}
              id={`pushable-${i}`}
              name={box.mass > 10 ? "Heavy crate" : `Light crate ${i + 1}`}
              position={box.position}
            >
              <RigidBody
                colliders="cuboid"
                density={boxDensity(box.mass, box.size)}
                restitution={0.05}
                friction={0.8}
                canSleep
              >
                <mesh
                  name="crate-mesh"
                  geometry={unitGeometry.box}
                  material={playgroundMaterial(roleName(box.color, "Crate"), box.color, {
                    roughness: 0.75,
                  })}
                  scale={box.size}
                  castShadow
                  receiveShadow
                  dispose={null}
                />
              </RigidBody>
            </SceneObject>
          ))}
        </SceneObject>
      </CourseZone>
      <CourseZone id="one-way" name="One-way platforms">
        {parkOneWay.map((board, i) => (
          <SceneObject
            key={i}
            id={`one-way-${i}`}
            name={`Board ${board.position[1]} m`}
            position={board.position}
          >
            <OneWayBoard board={{ ...board, position: [0, 0, 0] }} />
          </SceneObject>
        ))}
      </CourseZone>
      <CourseZone id="jump-pads" name="Jump pads">
        {parkJumpPads.map((pad, i) => (
          <SceneObject
            key={i}
            id={`jump-pad-${i}`}
            name={`Pad · strength ${pad.strength}`}
            position={pad.position}
          >
            <JumpPad pad={{ ...pad, position: [0, 0, 0] }} />
          </SceneObject>
        ))}
      </CourseZone>
      <CourseZone id="intersecting" name="Spawn inside geometry" />

      {/* South field */}
      <CourseZone id="ceilings" name="Ceilings" />
      <CourseZone id="ledges" name="Ledges" />
      <CourseZone id="drop-offs" name="Drop-offs" />
      <CourseZone id="gaps" name="Gaps + climbing" />
      <CourseZone id="beams" name="Balance beams" />
      <CourseZone id="ridges" name="Ridges + valleys" />
      <CourseZone id="spikes-logs" name="Spikes + logs" />
      <CourseZone id="curbs" name="Curbs" />

      {/* Back field */}
      <CourseZone id="stairs" name="Stair variants" />
      <CourseZone id="grates" name="Grates" />
      <CourseZone id="hills" name="Hills" />
      <CourseZone id="sweeper" name="Sweeper">
        <SceneObject id="platform-sweeper" name="Sweeper bar" position={[27, 0.45, -64]}>
          <KinematicPlatform
            name="platform-sweeper"
            position={[0, 0, 0]}
            spin={0.9}
            size={[9, 0.5, 0.5]}
            color="#d63c2f"
          />
        </SceneObject>
      </CourseZone>
      <CourseZone id="bridge" name="Plank bridge">
        <SceneObject id="bridge" name="Planks">
          <WorldPlaced>
            <BridgeAssembly />
          </WorldPlaced>
        </SceneObject>
      </CourseZone>

      {/* West field */}
      <CourseZone id="doorways" name="Doorways" />
      <CourseZone id="bumps" name="Bumps" />
      <CourseZone id="corridors" name="Zig-zag corridor" />

      {/* East field */}
      <CourseZone
        id="platform-edges"
        name="Platform edge cases"
        extras={{
          Crusher: (
            <SceneObject
              id="platform-crusher"
              name="Crusher lift"
              position={parkCrusher.platform.position}
            >
              <KinematicPlatform
                name="platform-crusher"
                position={[0, 0, 0]}
                axis="y"
                distance={parkCrusher.platform.distance}
                speed={0.7}
                size={parkCrusher.platform.size}
              />
            </SceneObject>
          ),
          "Wall scraper": (
            <SceneObject
              id="platform-scraper"
              name="Scraper shuttle"
              position={parkScraper.platform.position}
            >
              <KinematicPlatform
                name="platform-scraper"
                position={[0, 0, 0]}
                axis="x"
                distance={parkScraper.platform.distance}
                speed={0.6}
                size={parkScraper.platform.size}
              />
            </SceneObject>
          ),
        }}
      >
        <SceneObject
          id="platform-fast-elevator"
          name="Fast lift"
          position={parkFastElevator.position}
        >
          <KinematicPlatform
            name="platform-fast-elevator"
            position={[0, 0, 0]}
            axis="y"
            distance={parkFastElevator.distance}
            speed={parkFastElevator.speed}
            size={parkFastElevator.size}
          />
        </SceneObject>
      </CourseZone>
      <CourseZone id="physics-props" name="Physics props" extras={{ "Ball pit": <BallPitBalls /> }}>
        <SceneObject id="dominoes" name="Domino run">
          <WorldPlaced>
            {parkDominoes.map((domino, i) => (
              <DynamicBox key={i} name={`Domino ${i + 1}`} {...domino} />
            ))}
          </WorldPlaced>
        </SceneObject>
      </CourseZone>
      <CourseZone id="tunnelling" name="Thin geometry">
        {parkSuperPads.map((pad, i) => (
          <SceneObject
            key={i}
            id={`super-pad-${i}`}
            name={`Pad · strength ${pad.strength}`}
            position={pad.position}
          >
            <JumpPad pad={{ ...pad, position: [0, 0, 0] }} />
          </SceneObject>
        ))}
      </CourseZone>
      <CourseZone id="combat" name="Combat arena" />
    </group>
  );
}

/** A loose domino. Orange marks dynamic boxes. */
function DynamicBox({
  name,
  position,
  size,
  mass,
}: {
  name: string;
  position: Tuple3;
  size: Tuple3;
  mass: number;
}) {
  return (
    <RigidBody
      name={name}
      colliders="cuboid"
      position={position}
      density={boxDensity(mass, size)}
      friction={0.7}
      canSleep
    >
      <mesh
        name="dynamic-box-mesh"
        geometry={unitGeometry.box}
        material={dynamicMaterial()}
        scale={size}
        castShadow
        receiveShadow
        dispose={null}
      />
    </RigidBody>
  );
}

/** Light balls dropped into the pit in loose layers. */
function BallPitBalls() {
  const balls = useMemo(() => {
    const [cx, , cz] = parkBallPit.center;
    const d = parkBallPit.ballDiameter;
    const perRow = Math.floor((parkBallPit.size - 0.6) / (d + 0.05));
    return Array.from({ length: parkBallPit.balls }, (_, i) => {
      const layer = Math.floor(i / (perRow * perRow));
      const inLayer = i % (perRow * perRow);
      const offset = ((perRow - 1) * (d + 0.05)) / 2;
      return [
        cx - offset + (inLayer % perRow) * (d + 0.05) + (layer % 2) * 0.1,
        d / 2 + 0.05 + layer * (d + 0.05),
        cz - offset + Math.floor(inLayer / perRow) * (d + 0.05),
      ] as Tuple3;
    });
  }, []);
  return (
    <SceneObject id="ball-pit-balls" name="Balls">
      <WorldPlaced>
        {balls.map((position, i) => (
          <RigidBody
            key={i}
            name={`ball-${i + 1}`}
            colliders="ball"
            position={position}
            density={ballDensity(0.3, parkBallPit.ballDiameter)}
            restitution={0.3}
            linearDamping={0.3}
            angularDamping={0.4}
            canSleep
          >
            <mesh
              name="ball-mesh"
              geometry={unitGeometry.ball}
              material={playgroundMaterial("Ball teal", "#3aa6a0", { roughness: 0.5 })}
              scale={parkBallPit.ballDiameter}
              castShadow
              receiveShadow
              dispose={null}
            />
          </RigidBody>
        ))}
      </WorldPlaced>
    </SceneObject>
  );
}

/** The walkable / too-steep marker at the foot of a slope lane. */
function ZoneStrip({ index }: { index: number }) {
  const strip = parkStrips[index];
  return (
    <SceneObject
      id={`zone-strip-${index}`}
      name={
        strip.degrees <= SLOPE_LIMIT_DEG
          ? "Walkable marker"
          : strip.degrees <= SLIDE_LIMIT_DEG
            ? "Stall marker"
            : "Slide marker"
      }
      position={strip.position}
    >
      <mesh
        name="zone-strip-mesh"
        userData={STATIC_MESH}
        geometry={unitGeometry.box}
        material={playgroundMaterial(roleName(strip.color, "Strip"), strip.color, {
          emissive: true,
          emissiveIntensity: 0.35,
        })}
        scale={strip.size}
        dispose={null}
      />
    </SceneObject>
  );
}
