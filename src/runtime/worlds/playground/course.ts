import RAPIER from "@dimforge/rapier3d-compat";
import * as THREE from "three";
import obstacleDefinitions from "../../../gameplay/playgroundObstacles.json";
import {
  BRIDGE_PITCH,
  PARK_EXTENT,
  SLIDE_LIMIT_DEG,
  SLOPE_LIMIT_DEG,
  parkBallPit,
  parkBridge,
  parkBridgeHinges,
  parkCrateStep,
  parkCrusher,
  parkDominoes,
  parkFastElevator,
  parkJumpPads,
  parkLabels,
  parkOneWay,
  parkOrbit,
  parkPushables,
  parkScraper,
  parkSeesaw,
  parkStrips,
  parkSuperPads,
  parkTerrain,
  terrainHeight,
  terrainMask,
  type ParkJumpPad,
  type ParkStatic,
  type Tuple3,
} from "../../../gameplay/collisionCourse";
import { newOneWayState, oneWayWarning, stepOneWayBoard } from "../../../gameplay/oneWayBoard";
import { playerFeet } from "../../../gameplay/playerBody";
import {
  playgroundMaterial,
  pyramidVertices,
  unitGeometry,
} from "../../../gameplay/playgroundResources";
import { batchStaticMeshes } from "../../../gameplay/batchStaticMeshes";

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
type CourseObstacle = ParkStatic & { id: string; zone: string; part?: string; name: string };
const obstacles = obstacleDefinitions as CourseObstacle[];
const BRIDGE_HINGE_LIMIT = 0.3;

/** Authored placement overrides saved by the scene editor (playgroundScene.json). */
const OVERRIDES: Record<string, Tuple3> = {
  "platform-disc": [-7.115330598551967, 0.49533550124875303, -5.928812348260955],
};

type Platform = {
  body: RAPIER.RigidBody;
  mesh: THREE.Object3D;
  origin: THREE.Vector3;
  axis: "x" | "y" | "z";
  distance: number;
  speed: number;
  phase: number;
  spin: number;
  tiltAmp: number;
  tiltSpeed: number;
  orbitRadius: number;
  orbitSpeed: number;
};
type Dynamic = { body: RAPIER.RigidBody; mesh: THREE.Object3D };

export function zoneLabel(text: string, position: [number, number, number]) {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 128;
  const context = canvas.getContext("2d")!;
  context.fillStyle = "#3d434b";
  context.font = "bold 44px monospace";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(text, 512, 64);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(14, 1.75),
    new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false }),
  );
  mesh.position.set(...position);
  mesh.rotation.x = -Math.PI / 2;
  return mesh;
}

function quat(rotation?: Tuple3) {
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(...(rotation ?? [0, 0, 0])));
  return { x: q.x, y: q.y, z: q.z, w: q.w };
}

/** The proving-grounds course: obstacles, terrain, moving and physical parts. */
export function createCourse(scene: THREE.Scene, world: RAPIER.World) {
  const course = new THREE.Group();
  course.name = "collision-course";
  scene.add(course);
  const statics = new THREE.Group();
  course.add(statics);

  // Ground grid.
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#b7bcc2";
  ctx.fillRect(0, 0, 256, 256);
  ctx.strokeStyle = "#9aa0a8";
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, 254, 254);
  ctx.strokeStyle = "#a8adb4";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(128, 0);
  ctx.lineTo(128, 256);
  ctx.moveTo(0, 128);
  ctx.lineTo(256, 128);
  ctx.stroke();
  const grid = new THREE.CanvasTexture(canvas);
  grid.wrapS = grid.wrapT = THREE.RepeatWrapping;
  grid.repeat.set(PARK_EXTENT, PARK_EXTENT);
  grid.colorSpace = THREE.SRGBColorSpace;
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(PARK_EXTENT * 2, PARK_EXTENT * 2),
    new THREE.MeshStandardMaterial({ map: grid, roughness: 1 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  course.add(ground);
  const groundBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(PARK_EXTENT, 0.3, PARK_EXTENT)
      .setTranslation(0, -0.3, 0)
      .setFriction(1),
    groundBody,
  );

  // Static obstacles.
  for (const obstacle of obstacles) {
    const { shape, size, position, rotation } = obstacle;
    const geometry = unitGeometry[shape];
    const mesh = new THREE.Mesh(
      geometry,
      playgroundMaterial(roleName(obstacle.color, "Obstacle"), obstacle.color, { roughness: 0.9 }),
    );
    mesh.position.set(...position);
    mesh.rotation.set(...(rotation ?? [0, 0, 0]));
    mesh.scale.set(...size);
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.userData.courseStatic = true;
    statics.add(mesh);
    const [x, y, z] = size;
    const desc =
      shape === "box"
        ? RAPIER.ColliderDesc.cuboid(x / 2, y / 2, z / 2)
        : shape === "sphere"
          ? RAPIER.ColliderDesc.ball(x / 2)
          : shape === "cylinder"
            ? RAPIER.ColliderDesc.cylinder(y / 2, x / 2)
            : shape === "cone"
              ? RAPIER.ColliderDesc.cone(y / 2, x / 2)
              : RAPIER.ColliderDesc.convexHull(
                  new Float32Array(pyramidVertices.map((v, i) => v * size[i % 3])),
                );
    if (desc)
      world.createCollider(
        desc
          .setTranslation(...position)
          .setRotation(quat(rotation))
          .setFriction(1),
      );
  }
  for (const strip of parkStrips) {
    const mesh = new THREE.Mesh(
      unitGeometry.box,
      playgroundMaterial(roleName(strip.color, "Strip"), strip.color, {
        emissive: true,
        emissiveIntensity: 0.35,
      }),
    );
    mesh.position.set(...strip.position);
    mesh.scale.set(...strip.size);
    mesh.userData.courseStatic = true;
    mesh.name =
      strip.degrees <= SLOPE_LIMIT_DEG
        ? "Walkable marker"
        : strip.degrees <= SLIDE_LIMIT_DEG
          ? "Stall marker"
          : "Slide marker";
    statics.add(mesh);
  }
  const merged = batchStaticMeshes(statics, 32, true, (mesh) =>
    Boolean(mesh.userData.courseStatic),
  );
  for (const label of parkLabels) course.add(zoneLabel(label.text, label.position));

  // Terrain.
  {
    const [w, d] = parkTerrain.size;
    const geometry = new THREE.PlaneGeometry(w, d, parkTerrain.segments, parkTerrain.segments);
    geometry.rotateX(-Math.PI / 2);
    const positions = geometry.attributes.position;
    let low = Infinity;
    let high = -Infinity;
    for (let i = 0; i < positions.count; i++) {
      const y =
        terrainHeight(positions.getX(i), positions.getZ(i)) *
        terrainMask(positions.getX(i), positions.getZ(i), w / 2, d / 2);
      positions.setY(i, y);
      low = Math.min(low, y);
      high = Math.max(high, y);
    }
    geometry.computeVertexNormals();
    const colors = new Float32Array(positions.count * 3);
    for (let i = 0; i < positions.count; i++)
      colors.fill(
        0.72 + ((positions.getY(i) - low) / Math.max(high - low, 1e-6)) * 0.36,
        i * 3,
        i * 3 + 3,
      );
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const g = c.getContext("2d")!;
    g.fillStyle = "#c9ccd1";
    g.fillRect(0, 0, 128, 128);
    g.fillStyle = "#7e838b";
    g.fillRect(0, 0, 64, 64);
    g.fillRect(64, 64, 64, 64);
    const checker = new THREE.CanvasTexture(c);
    checker.wrapS = checker.wrapT = THREE.RepeatWrapping;
    checker.repeat.set(11, 11);
    checker.magFilter = THREE.NearestFilter;
    checker.colorSpace = THREE.SRGBColorSpace;
    const terrain = new THREE.Mesh(
      geometry,
      new THREE.MeshStandardMaterial({ map: checker, vertexColors: true, roughness: 1 }),
    );
    const [cx, , cz] = parkTerrain.center;
    terrain.position.set(cx, 0, cz);
    terrain.receiveShadow = true;
    course.add(terrain);
    world.createCollider(
      RAPIER.ColliderDesc.trimesh(
        positions.array as Float32Array,
        Uint32Array.from(geometry.index!.array),
      )
        .setTranslation(cx, 0, cz)
        .setFriction(1),
    );
  }

  // Kinematic platforms.
  const platforms: Platform[] = [];
  const platform = (
    id: string,
    at: Tuple3,
    {
      axis = "x",
      distance = 0,
      speed = 1,
      phase = 0,
      spin = 0,
      tiltAmp = 0,
      tiltSpeed = 1,
      orbitRadius = 0,
      orbitSpeed = 0,
      shape = "box",
      radius = 4,
      size = [3.2, 0.35, 2.6],
      color = "#3b6fe0",
    }: Partial<Omit<Platform, "body" | "mesh" | "origin">> & {
      shape?: "box" | "cylinder";
      radius?: number;
      size?: Tuple3;
      color?: string;
    },
  ) => {
    const position = OVERRIDES[id] ?? at;
    const body = world.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(...position),
    );
    world.createCollider(
      (shape === "cylinder"
        ? RAPIER.ColliderDesc.cylinder(size[1] / 2, radius)
        : RAPIER.ColliderDesc.cuboid(size[0] / 2, size[1] / 2, size[2] / 2)
      ).setFriction(1),
      body,
    );
    const mesh = new THREE.Mesh(
      shape === "cylinder" ? unitGeometry.disc : unitGeometry.box,
      playgroundMaterial(
        color === "#3b6fe0" ? "Kinematic blue" : roleName(color, "Platform"),
        color,
        { roughness: 0.6 },
      ),
    );
    mesh.scale.set(
      ...(shape === "cylinder" ? ([radius * 2, size[1], radius * 2] as Tuple3) : size),
    );
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.position.set(...position);
    course.add(mesh);
    platforms.push({
      body,
      mesh,
      origin: new THREE.Vector3(...position),
      axis,
      distance,
      speed,
      phase,
      spin,
      tiltAmp,
      tiltSpeed,
      orbitRadius,
      orbitSpeed,
    });
  };
  platform("platform-disc", [-24, 0.7, -12], {
    shape: "cylinder",
    radius: 4,
    size: [8, 0.4, 8],
    spin: 0.5,
  });
  platform("platform-elevator-low", [-15, 1.1, -12], {
    axis: "y",
    distance: 1.1,
    speed: 0.8,
    size: [3, 0.4, 3],
  });
  platform("platform-shuttle-x", [-24, 1.0, -19], {
    axis: "x",
    distance: 4,
    speed: 0.6,
    phase: Math.PI / 2,
    size: [3, 0.4, 3],
  });
  platform("platform-shuttle-z", [-15, 1.0, -19], {
    axis: "z",
    distance: 3,
    speed: 0.7,
    size: [2.6, 0.4, 2.6],
  });
  platform("platform-tilt", [2, 1.3, -19], {
    tiltAmp: 0.32,
    tiltSpeed: 0.9,
    size: [4.2, 0.3, 2.2],
    color: "#e09543",
  });
  platform("platform-orbit", parkOrbit.center, {
    orbitRadius: parkOrbit.radius,
    orbitSpeed: parkOrbit.speed,
    spin: parkOrbit.speed,
    size: parkOrbit.size,
  });
  platform("platform-sweeper", [27, 0.45, -64], {
    spin: 0.9,
    size: [9, 0.5, 0.5],
    color: "#d63c2f",
  });
  platform("platform-crusher", parkCrusher.platform.position, {
    axis: "y",
    distance: parkCrusher.platform.distance,
    speed: 0.7,
    size: parkCrusher.platform.size,
  });
  platform("platform-scraper", parkScraper.platform.position, {
    axis: "x",
    distance: parkScraper.platform.distance,
    speed: 0.6,
    size: parkScraper.platform.size,
  });
  platform("platform-fast-elevator", parkFastElevator.position, {
    axis: "y",
    distance: parkFastElevator.distance,
    speed: parkFastElevator.speed,
    size: parkFastElevator.size,
  });

  // Dynamic props.
  const dynamics: Dynamic[] = [];
  const dynamicBox = (
    position: Tuple3,
    size: Tuple3,
    mass: number,
    material: THREE.Material,
    extra: (d: RAPIER.ColliderDesc) => RAPIER.ColliderDesc = (d) => d,
    damping: [number, number] = [0, 0],
    rotation?: Tuple3,
  ) => {
    const body = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(...position)
        .setRotation(quat(rotation))
        .setLinearDamping(damping[0])
        .setAngularDamping(damping[1])
        .setCanSleep(true),
    );
    world.createCollider(
      extra(
        RAPIER.ColliderDesc.cuboid(size[0] / 2, size[1] / 2, size[2] / 2).setDensity(
          mass / (size[0] * size[1] * size[2]),
        ),
      ),
      body,
    );
    const mesh = new THREE.Mesh(unitGeometry.box, material);
    mesh.scale.set(...size);
    mesh.castShadow = mesh.receiveShadow = true;
    course.add(mesh);
    dynamics.push({ body, mesh });
    return body;
  };
  dynamicBox(
    parkCrateStep.crate.position,
    parkCrateStep.crate.size,
    parkCrateStep.crate.mass,
    dynamicMaterial(),
    (d) => d.setRestitution(0.05).setFriction(0.8),
  );
  dynamicBox(
    parkSeesaw.plank.position,
    parkSeesaw.plank.size,
    parkSeesaw.plank.mass,
    dynamicMaterial(),
    (d) => d.setFriction(1),
    [0.1, 0.5],
  );
  for (const box of parkPushables)
    dynamicBox(
      box.position,
      box.size,
      box.mass,
      playgroundMaterial(roleName(box.color, "Crate"), box.color, { roughness: 0.75 }),
      (d) => d.setRestitution(0.05).setFriction(0.8),
    );
  for (const domino of parkDominoes)
    dynamicBox(domino.position, domino.size, domino.mass, dynamicMaterial(), (d) =>
      d.setFriction(0.7),
    );
  {
    const [cx, , cz] = parkBallPit.center;
    const d = parkBallPit.ballDiameter;
    const perRow = Math.floor((parkBallPit.size - 0.6) / (d + 0.05));
    const ballMaterial = playgroundMaterial("Ball teal", "#3aa6a0", { roughness: 0.5 });
    for (let i = 0; i < parkBallPit.balls; i++) {
      const layer = Math.floor(i / (perRow * perRow));
      const inLayer = i % (perRow * perRow);
      const offset = ((perRow - 1) * (d + 0.05)) / 2;
      const body = world.createRigidBody(
        RAPIER.RigidBodyDesc.dynamic()
          .setTranslation(
            cx - offset + (inLayer % perRow) * (d + 0.05) + (layer % 2) * 0.1,
            d / 2 + 0.05 + layer * (d + 0.05),
            cz - offset + Math.floor(inLayer / perRow) * (d + 0.05),
          )
          .setLinearDamping(0.3)
          .setAngularDamping(0.4)
          .setCanSleep(true),
      );
      world.createCollider(
        RAPIER.ColliderDesc.ball(d / 2)
          .setDensity(0.3 / ((Math.PI / 6) * d ** 3))
          .setRestitution(0.3),
        body,
      );
      const mesh = new THREE.Mesh(unitGeometry.ball, ballMaterial);
      mesh.scale.setScalar(d);
      mesh.castShadow = mesh.receiveShadow = true;
      course.add(mesh);
      dynamics.push({ body, mesh });
    }
  }

  // Plank bridge: dynamic planks hinged end to end on their hanging arc.
  {
    const x = parkBridge.x;
    const half = BRIDGE_PITCH / 2;
    const planks = Array.from({ length: parkBridge.planks }, (_, i) => {
      const [y0, z0] = parkBridgeHinges[i];
      const [y1, z1] = parkBridgeHinges[i + 1];
      const tilt = Math.atan2(-(y0 - y1), z0 - z1);
      const size = parkBridge.plankSize;
      const body = world.createRigidBody(
        RAPIER.RigidBodyDesc.dynamic()
          .setTranslation(x, (y0 + y1) / 2, (z0 + z1) / 2)
          .setRotation(quat([tilt, 0, 0]))
          .setLinearDamping(0.4)
          .setAngularDamping(0.8)
          .setAdditionalSolverIterations(4),
      );
      world.createCollider(
        RAPIER.ColliderDesc.cuboid(size[0] / 2, size[1] / 2, size[2] / 2)
          .setDensity(parkBridge.plankMass / (size[0] * size[1] * size[2]))
          .setFriction(1),
        body,
      );
      const mesh = new THREE.Mesh(unitGeometry.box, dynamicMaterial());
      mesh.scale.set(...size);
      mesh.castShadow = mesh.receiveShadow = true;
      course.add(mesh);
      dynamics.push({ body, mesh });
      return body;
    });
    const axis = { x: 1, y: 0, z: 0 };
    const hinge = (
      a: RAPIER.RigidBody,
      b: RAPIER.RigidBody,
      anchorA: Tuple3,
      anchorB: Tuple3,
      limited: boolean,
    ) => {
      const params = RAPIER.JointData.revolute(
        { x: anchorA[0], y: anchorA[1], z: anchorA[2] },
        { x: anchorB[0], y: anchorB[1], z: anchorB[2] },
        axis,
      );
      if (limited) {
        params.limitsEnabled = true;
        params.limits = [-BRIDGE_HINGE_LIMIT, BRIDGE_HINGE_LIMIT];
      }
      world.createImpulseJoint(params, a, b, true);
    };
    const anchor = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    const first = parkBridgeHinges[0];
    const last = parkBridgeHinges[parkBridge.planks];
    hinge(anchor, planks[0], [x, ...first], [0, 0, half], false);
    for (let i = 1; i < planks.length; i++)
      hinge(planks[i - 1], planks[i], [0, 0, -half], [0, 0, half], true);
    hinge(planks[planks.length - 1], anchor, [0, 0, -half], [x, ...last], false);
  }

  // One-way boards.
  const boards = parkOneWay.map((board) => {
    const collider = world.createCollider(
      RAPIER.ColliderDesc.cuboid(board.size[0] / 2, board.size[1] / 2, board.size[2] / 2)
        .setTranslation(...board.position)
        .setFriction(1),
    );
    const holder = new THREE.Group();
    holder.position.set(...board.position);
    const mesh = new THREE.Mesh(
      unitGeometry.box,
      playgroundMaterial(roleName(board.color, "Board"), board.color, { roughness: 0.65 }),
    );
    mesh.scale.set(...board.size);
    mesh.castShadow = mesh.receiveShadow = true;
    holder.add(mesh);
    course.add(holder);
    return { collider, mesh, state: newOneWayState() };
  });

  // Jump pads.
  const pads = [...parkJumpPads, ...parkSuperPads].map((pad: ParkJumpPad) => {
    const mesh = new THREE.Mesh(
      unitGeometry.box,
      playgroundMaterial(roleName(pad.color, "Jump pad"), pad.color, {
        emissive: true,
        emissiveIntensity: 0.55,
        roughness: 0.5,
      }),
    );
    mesh.position.set(...pad.position);
    mesh.scale.set(...pad.size);
    mesh.castShadow = mesh.receiveShadow = true;
    course.add(mesh);
    const sensor = world.createCollider(
      RAPIER.ColliderDesc.cuboid(pad.size[0] / 2, 0.8, pad.size[2] / 2)
        .setTranslation(pad.position[0], pad.position[1] + 0.8, pad.position[2])
        .setSensor(true),
    );
    return { pad, sensor, lastFire: 0, inside: false };
  });

  let elapsed = 0;
  let boardTime = 0;
  const position = { x: 0, y: 0, z: 0 };
  const rotation = { x: 0, y: 0, z: 0, w: 1 };
  return {
    /** Moves platforms and gates one-way boards; call before each physics step. */
    beforeStep(step: number) {
      elapsed += step;
      for (const m of platforms) {
        const offset = Math.sin(elapsed * m.speed + m.phase) * m.distance;
        const angle = elapsed * m.orbitSpeed + m.phase;
        position.x = m.origin.x + (m.axis === "x" ? offset : 0) + Math.cos(angle) * m.orbitRadius;
        position.y = m.origin.y + (m.axis === "y" ? offset : 0);
        position.z = m.origin.z + (m.axis === "z" ? offset : 0) + Math.sin(angle) * m.orbitRadius;
        m.body.setNextKinematicTranslation(position);
        if (m.spin || m.tiltAmp) {
          const halfSpin = (elapsed * m.spin) / 2;
          const halfPitch = (Math.sin(elapsed * m.tiltSpeed) * m.tiltAmp) / 2;
          const sy = Math.sin(halfSpin),
            cy = Math.cos(halfSpin),
            px = Math.sin(halfPitch),
            cx = Math.cos(halfPitch);
          rotation.x = cy * px;
          rotation.y = sy * cx;
          rotation.z = -sy * px;
          rotation.w = cy * cx;
          m.body.setNextKinematicRotation(rotation);
        }
      }
      const feet = playerFeet();
      boardTime += step;
      for (const b of boards) {
        const half = b.collider.halfExtents()!;
        b.collider.setEnabled(
          stepOneWayBoard(
            b.state,
            feet,
            { center: b.collider.translation(), half, reach: feet?.radius ?? 0 },
            step,
          ),
        );
        const warn = oneWayWarning(b.state) * 0.04;
        b.mesh.position.set(Math.sin(boardTime * 71) * warn, 0, Math.cos(boardTime * 59) * warn);
      }
    },
    /** Syncs meshes; fires jump pads for the player (`launch`) and loose bodies. */
    update(feet: THREE.Vector3, launch: (speed: number, planar: number) => void) {
      for (const m of platforms) {
        m.mesh.position.copy(m.body.translation());
        m.mesh.quaternion.copy(m.body.rotation());
      }
      for (const d of dynamics) {
        d.mesh.position.copy(d.body.translation());
        d.mesh.quaternion.copy(d.body.rotation());
      }
      const now = performance.now();
      for (const p of pads) {
        const { pad } = p;
        const inside =
          Math.abs(feet.x - pad.position[0]) < pad.size[0] / 2 + 0.3 &&
          Math.abs(feet.z - pad.position[2]) < pad.size[2] / 2 + 0.3 &&
          feet.y - pad.position[1] < 1.6 &&
          feet.y - pad.position[1] > -0.2;
        if (inside && !p.inside && now - p.lastFire > 250) {
          p.lastFire = now;
          launch(pad.strength, 0.4);
        }
        p.inside = inside;
        world.intersectionPairsWith(p.sensor, (other) => {
          const body = other.parent();
          if (!body?.isDynamic()) return;
          const v = body.linvel();
          if (v.y >= pad.strength - 0.5) return;
          body.wakeUp();
          body.setLinvel({ x: v.x * 0.4, y: pad.strength, z: v.z * 0.4 }, true);
          body.setAngvel({ x: 0, y: 0, z: 0 }, true);
        });
      }
    },
    dispose() {
      merged.dispose();
    },
  };
}
