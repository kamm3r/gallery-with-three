import { useFrame } from "@react-three/fiber";
import { CylinderCollider, RigidBody, type RapierRigidBody } from "@react-three/rapier";
import { useEffect, useMemo, useRef, type MutableRefObject } from "react";
import * as THREE from "three";
import {
  LEAP_AIRTIME,
  moveSpec,
  ROAR_DURATION,
  stepEncounter,
  type BossMove,
  type Encounter,
} from "../gameplay/bossEncounter";
import { playSound } from "../gameplay/sound";
import {
  createTelegraphMaterial,
  Embers,
  ImpactBursts,
  TELEGRAPH_GEOMETRY,
  type EmbersHandle,
  type ImpactBurstsHandle,
} from "./ashFx";

// The Ash Warden: a procedural knight rig (hips, knees, spine, shoulders,
// elbows, wrists) driven by keyframed poses per move and phase. The pure
// simulation in bossEncounter.ts owns timing and hits; this only reads it.
//
// Joint conventions (radians): limbs hang along -Y. Negative shoulder/elbow
// X swings forward, shoulder Z abducts the right arm outward (inward for the
// left). Spine lean is forward-positive, twist turns the chest to the left.
// Blade pitch in the hand is shoulder X + elbow + wrist: 0 points forward,
// +π/2 straight down, -π/2 straight up.

const POSE_KEYS = [
  "crouch",
  "lean",
  "twist",
  "tilt",
  "head",
  "rShX",
  "rShZ",
  "rElbow",
  "rWrist",
  "lShX",
  "lShZ",
  "lElbow",
  "tuck",
  "core",
] as const;
type PoseKey = (typeof POSE_KEYS)[number];
type Pose = Record<PoseKey, number>;
type Key = [number, Partial<Pose>];
type Track = [number, Pose][];

const IDLE: Pose = {
  crouch: -0.12,
  lean: 0.15,
  twist: 0,
  tilt: 0,
  head: 0.1,
  rShX: -0.35,
  rShZ: 0.3,
  rElbow: -0.55,
  rWrist: 1.25,
  lShX: 0.05,
  lShZ: -0.3,
  lElbow: -0.35,
  tuck: 0,
  core: 1,
};
const OVERHEAD: Partial<Pose> = {
  twist: 0,
  tilt: 0,
  rShX: -2.9,
  rShZ: -0.15,
  rElbow: -0.5,
  rWrist: -0.26,
  lShX: -2.8,
  lShZ: 0.45,
  lElbow: -0.6,
  lean: -0.25,
  crouch: 0.05,
  head: -0.2,
  core: 1.6,
};
const SLAM_DOWN: Partial<Pose> = {
  twist: 0,
  tilt: 0,
  rShX: -1.3,
  rShZ: -0.15,
  rElbow: -0.1,
  rWrist: 2,
  lShX: -1.25,
  lShZ: 0.45,
  lElbow: -0.15,
  lean: 0.6,
  crouch: -0.7,
  head: 0.35,
  core: 2.2,
};
const SWING_READY: Partial<Pose> = {
  twist: 1,
  crouch: -0.3,
  lean: 0.05,
  head: 0,
  rShX: -0.5,
  rShZ: 1.3,
  rElbow: -0.2,
  rWrist: 1.77,
  lShX: -0.9,
  lShZ: -0.4,
};
const SWING_THROUGH: Partial<Pose> = {
  twist: -1.15,
  lean: 0.35,
  tilt: -0.15,
  crouch: -0.45,
  lShX: 0.4,
};
const HEAVY_RECOVERY: Key[] = [
  [0, {}],
  [0.5, { lean: 0.7, crouch: -0.7, head: 0.45 }],
  [0.62, { lean: 0.55, crouch: -0.55 }],
  [0.78, { lean: 0.4, crouch: -0.4, rWrist: 1.6, head: 0.2, core: 1 }],
  [1, { lean: 0.25, crouch: -0.2, rShX: -0.7, rWrist: 1.3, lShX: -0.2, lShZ: -0.2, lElbow: -0.4 }],
];

interface Sequence {
  /** Keys over normalised windup progress 0..1. */
  windup: Key[];
  /** Keys over strike seconds, lined up with the move's hit times. */
  strike: Key[];
  /** Keys over normalised recovery progress 0..1. */
  recovery: Key[];
}

const SEQUENCES: Record<BossMove, Sequence> = {
  sweep: {
    windup: [
      [0, {}],
      [0.55, SWING_READY],
      [1, { twist: 1.15, crouch: -0.35 }],
    ],
    strike: [
      [0, {}],
      [0.12, SWING_THROUGH],
      [0.35, { twist: -1.25 }],
    ],
    recovery: [
      [0, {}],
      [0.4, { lean: 0.45, head: 0.35, rShX: -0.8, rShZ: 0.5, rWrist: 1.9, core: 0.6 }],
      [1, { twist: -0.3, lean: 0.3 }],
    ],
  },
  slam: {
    windup: [
      [0, {}],
      [0.35, OVERHEAD],
      [0.8, { lean: -0.3 }],
      [1, { lean: -0.36, crouch: 0.1, core: 2.4 }],
    ],
    strike: [
      [0, {}],
      [0.06, SLAM_DOWN],
      [0.4, {}],
    ],
    recovery: HEAVY_RECOVERY,
  },
  combo: {
    windup: [
      [0, {}],
      [0.7, SWING_READY],
      [1, { twist: 1.1 }],
    ],
    strike: [
      [0, {}],
      [0.1, SWING_THROUGH],
      [
        0.4,
        { twist: -1, tilt: 0, rShX: -1.3, rShZ: -0.5, rElbow: -0.3, rWrist: 1.87, crouch: -0.3 },
      ],
      [
        0.65,
        {
          twist: 1.1,
          tilt: 0.15,
          rShX: -0.6,
          rShZ: 1.2,
          rElbow: -0.2,
          rWrist: 1.77,
          crouch: -0.45,
          lShX: -0.6,
        },
      ],
      [1, OVERHEAD],
      [1.22, { lean: -0.34, crouch: 0.12, core: 2.4 }],
      [1.35, SLAM_DOWN],
      [1.7, {}],
    ],
    recovery: HEAVY_RECOVERY,
  },
  leap: {
    windup: [
      [0, {}],
      [
        0.6,
        {
          crouch: -0.85,
          lean: 0.55,
          head: -0.1,
          rShX: 0.9,
          rShZ: 0.3,
          rElbow: -0.3,
          rWrist: 1,
          lShX: 0.9,
          lShZ: -0.3,
          lElbow: -0.3,
        },
      ],
      [1, { crouch: -0.95, core: 2 }],
    ],
    strike: [
      [0, {}],
      [0.15, { ...OVERHEAD, tuck: 1, crouch: 0 }],
      [0.6, { lean: -0.35 }],
      [LEAP_AIRTIME, { ...SLAM_DOWN, tuck: 0, crouch: -0.9 }],
      [1.05, {}],
    ],
    recovery: HEAVY_RECOVERY,
  },
  nova: {
    windup: [
      [0, {}],
      [
        0.3,
        {
          twist: 0,
          rShX: -2.8,
          rShZ: -0.25,
          rElbow: -0.3,
          rWrist: -1.61,
          lShX: -2.75,
          lShZ: 0.4,
          lElbow: -0.35,
          lean: -0.2,
          head: -0.4,
          crouch: 0.1,
          core: 3,
        },
      ],
      [1, { lean: -0.3, head: -0.5, core: 6 }],
    ],
    strike: [
      [0, {}],
      [
        0.05,
        {
          rShX: -0.5,
          rShZ: -0.2,
          rElbow: -0.2,
          rWrist: -4.01,
          lShX: -0.5,
          lShZ: 0.35,
          lElbow: -0.2,
          crouch: -1,
          lean: 0.6,
          head: 0.4,
          core: 8,
        },
      ],
      [0.5, { core: 4 }],
    ],
    recovery: [
      [0, {}],
      [0.6, { core: 1.5 }],
      [
        1,
        {
          crouch: -0.3,
          lean: 0.25,
          head: 0.1,
          rShX: -0.5,
          rElbow: -0.3,
          rWrist: -5.13,
          lShX: 0,
          lShZ: -0.3,
        },
      ],
    ],
  },
};

const ROAR: Key[] = [
  [0, {}],
  [
    0.45,
    {
      lean: -0.45,
      head: -0.6,
      twist: 0,
      crouch: -0.2,
      rShX: -0.3,
      rShZ: 1.1,
      rElbow: -0.6,
      rWrist: 1.2,
      lShX: -0.3,
      lShZ: -1.1,
      lElbow: -0.6,
      core: 7,
    },
  ],
  [1.6, { head: -0.72 }],
  [ROAR_DURATION, { ...IDLE, core: 2.2 }],
];

const DEATH: Key[] = [
  [0, { lean: -0.35, head: -0.5, core: 3, rShX: -0.2 }],
  [0.7, { lean: -0.1 }],
  [
    1.5,
    {
      crouch: -1,
      lean: 0.55,
      head: 0.8,
      twist: 0.1,
      rShX: -0.5,
      rShZ: 0.2,
      rElbow: -0.2,
      rWrist: 2.27,
      lShX: -0.6,
      lShZ: -0.1,
      lElbow: -0.9,
      core: 0.3,
    },
  ],
  [3, { core: 0 }],
];

function resolveTrack(keys: Key[], base: Pose): Track {
  let previous = base;
  return keys.map(([time, partial]) => {
    previous = { ...previous, ...partial };
    return [time, previous];
  });
}

const smooth = (t: number) => t * t * (3 - 2 * t);

function sampleTrack(track: Track, t: number, out: Pose) {
  let i = 0;
  while (i < track.length - 1 && track[i + 1][0] <= t) i++;
  const [t0, a] = track[i];
  const next = track[i + 1];
  if (!next || t <= t0) {
    Object.assign(out, a);
    return;
  }
  const u = smooth(Math.min(1, (t - t0) / (next[0] - t0)));
  for (const key of POSE_KEYS) out[key] = a[key] + (next[1][key] - a[key]) * u;
}

// Resolve every sequence once: each phase starts where the previous ended.
const TRACKS = Object.fromEntries(
  Object.entries(SEQUENCES).map(([move, seq]) => {
    const windup = resolveTrack(seq.windup, IDLE);
    const strike = resolveTrack(seq.strike, windup[windup.length - 1][1]);
    const recovery = resolveTrack(seq.recovery, strike[strike.length - 1][1]);
    return [move, { windup, strike, recovery }];
  }),
) as Record<BossMove, { windup: Track; strike: Track; recovery: Track }>;
const ROAR_TRACK = resolveTrack(ROAR, IDLE);
const DEATH_TRACK = resolveTrack(DEATH, IDLE);

const wrapPi = (angle: number) => Math.atan2(Math.sin(angle), Math.cos(angle));
const LEG = 0.95;
const HIP_HEIGHT = 1.95;
const TRAIL = 22;

const up = new THREE.Vector3(0, 1, 0);
const rotation = new THREE.Quaternion();
const scratch = new THREE.Vector3();

function jaggedCloak() {
  const geometry = new THREE.CylinderGeometry(0.85, 1.45, 2.5, 18, 6, true, Math.PI * 0.5, Math.PI);
  const position = geometry.getAttribute("position") as THREE.BufferAttribute;
  for (let i = 0; i < position.count; i++) {
    const y = position.getY(i);
    // Tattered hem: ragged bottom rows, slight billow lower down.
    if (y < -0.6) {
      const tear = Math.abs(Math.sin(i * 12.9898) * 43758.5453) % 1;
      position.setY(i, y + tear * 0.55 * ((-0.6 - y) / 0.65));
    }
  }
  geometry.translate(0, -1.25, 0);
  geometry.computeVertexNormals();
  return geometry;
}

function bladeGeometry() {
  const shape = new THREE.Shape();
  shape.moveTo(-0.17, 0);
  shape.lineTo(0.17, 0);
  shape.lineTo(0.14, 2.35);
  shape.lineTo(0, 2.8);
  shape.lineTo(-0.14, 2.35);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: 0.05,
    bevelEnabled: true,
    bevelThickness: 0.02,
    bevelSize: 0.03,
    bevelSegments: 1,
  });
  geometry.translate(0, 0, -0.025);
  // Blade length along +Z of the hand.
  geometry.rotateX(Math.PI / 2);
  geometry.translate(0, 0, 0.3);
  return geometry;
}

const trailVertex = /* glsl */ `
  attribute float fade;
  attribute float edge;
  varying float vFade;
  varying float vEdge;
  void main() {
    vFade = fade;
    vEdge = edge;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const trailFragment = /* glsl */ `
  uniform float uStrength;
  varying float vFade;
  varying float vEdge;
  void main() {
    float a = vFade * vFade * uStrength * (0.25 + 0.75 * vEdge);
    gl_FragColor = vec4(vec3(1.6, 0.75, 0.35) * (0.6 + vEdge), a);
  }
`;

export function AshWarden({
  combat,
  report,
}: {
  combat: MutableRefObject<Encounter>;
  report: (state: Encounter) => void;
}) {
  const body = useRef<RapierRigidBody>(null);
  const root = useRef<THREE.Group>(null);
  const joints = useRef<Record<string, THREE.Object3D | null>>({});
  const bind = (name: string) => (object: THREE.Object3D | null) => {
    joints.current[name] = object;
  };
  const coreLight = useRef<THREE.PointLight>(null);
  const telegraph = useRef<THREE.Mesh>(null);
  const leapMarker = useRef<THREE.Mesh>(null);
  const bursts = useRef<ImpactBurstsHandle>(null);
  const aura = useRef<EmbersHandle>(null);
  const trailMesh = useRef<THREE.Mesh>(null);

  const materials = useMemo(
    () => ({
      armor: new THREE.MeshStandardMaterial({
        color: "#3b3532",
        metalness: 0.55,
        roughness: 0.48,
        emissive: new THREE.Color("#ffcfa8"),
        emissiveIntensity: 0,
      }),
      dark: new THREE.MeshStandardMaterial({
        color: "#1d1918",
        roughness: 0.92,
        emissive: new THREE.Color("#ffcfa8"),
        emissiveIntensity: 0,
      }),
      cloak: new THREE.MeshStandardMaterial({
        color: "#1a1412",
        roughness: 1,
        side: THREE.DoubleSide,
      }),
      ember: new THREE.MeshStandardMaterial({
        color: "#ffb070",
        emissive: new THREE.Color("#ff5a1f"),
        emissiveIntensity: 3,
      }),
      eyes: new THREE.MeshStandardMaterial({
        color: "#ffba63",
        emissive: new THREE.Color("#ff7430"),
        emissiveIntensity: 5,
      }),
      steel: new THREE.MeshStandardMaterial({ color: "#5d5652", metalness: 0.85, roughness: 0.32 }),
      molten: new THREE.MeshStandardMaterial({
        color: "#ff9a4a",
        emissive: new THREE.Color("#ff5a1a"),
        emissiveIntensity: 1.5,
      }),
    }),
    [],
  );
  const telegraphMaterial = useMemo(() => createTelegraphMaterial(), []);
  const leapMaterial = useMemo(() => createTelegraphMaterial("#ff4d1f"), []);
  const cloakGeometry = useMemo(jaggedCloak, []);
  const blade = useMemo(bladeGeometry, []);
  const trail = useMemo(() => {
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(TRAIL * 2 * 3);
    const fade = new Float32Array(TRAIL * 2);
    // Edge 0 at the hilt end, 1 at the tip: the tip burns brightest.
    const edge = new Float32Array(TRAIL * 2);
    for (let i = 0; i < TRAIL; i++) {
      fade.set([1 - i / TRAIL, 1 - i / TRAIL], i * 2);
      edge.set([0, 1], i * 2);
    }
    const index: number[] = [];
    for (let i = 0; i < TRAIL - 1; i++) {
      const a = i * 2;
      index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    geometry.setIndex(index);
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("fade", new THREE.BufferAttribute(fade, 1));
    geometry.setAttribute("edge", new THREE.BufferAttribute(edge, 1));
    const material = new THREE.ShaderMaterial({
      vertexShader: trailVertex,
      fragmentShader: trailFragment,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      uniforms: { uStrength: { value: 0 } },
    });
    return { geometry, material, positions };
  }, []);
  useEffect(
    () => () => {
      Object.values(materials).forEach((material) => material.dispose());
      telegraphMaterial.dispose();
      leapMaterial.dispose();
      cloakGeometry.dispose();
      blade.dispose();
      trail.geometry.dispose();
      trail.material.dispose();
    },
    [materials, telegraphMaterial, leapMaterial, cloakGeometry, blade, trail],
  );

  const runtime = useRef({
    pose: { ...IDLE } as Pose,
    target: { ...IDLE } as Pose,
    walkPhase: 0,
    stride: 0,
    lastX: 0,
    lastZ: -7,
    flinch: 0,
    lastBossHit: 0,
    lastPlayerHit: 0,
    lastImpact: 0,
    lastPhase: "approach" as Encounter["phase"],
    lastHitIndex: 0,
    defeatTime: 0,
    reportTimer: 0,
    cloakSwing: 0,
    trailStrength: 0,
    trailPrimed: false,
    telegraph: 0,
  });

  useFrame((state, delta) => {
    const s = combat.current;
    const r = runtime.current;
    const dt = Math.min(delta, 0.05);
    stepEncounter(s, delta);
    const time = state.clock.elapsedTime;
    const spec = moveSpec(s.move);

    // --- Cues: sound and VFX on simulation events ---
    if (s.phase !== r.lastPhase) {
      if (s.phase === "windup") {
        playSound("bossWindup", { intensity: s.move === "slam" || s.move === "nova" ? 1 : 0.6 });
      }
      if (s.phase === "roar") playSound("roar");
      if (s.phase === "defeated") playSound("bossDeath");
      r.lastPhase = s.phase;
    }
    if (
      s.phase === "strike" &&
      s.move === "combo" &&
      s.hitIndex !== r.lastHitIndex &&
      s.hitIndex < spec.hits.length
    ) {
      playSound("bossSwing", { intensity: 0.7 });
    }
    r.lastHitIndex = s.hitIndex;
    if (s.impactId !== r.lastImpact) {
      r.lastImpact = s.impactId;
      playSound("bossSwing", { intensity: s.impactForce });
      if (s.impactForce >= 0.5) {
        playSound("bossImpact", { intensity: s.impactForce });
        bursts.current?.spawn(s.impactX, s.impactZ, s.impactRange, s.impactForce);
      }
    }
    if (s.bossHitId !== r.lastBossHit) {
      r.lastBossHit = s.bossHitId;
      r.flinch = 1;
      playSound("bossHit");
    }
    if (s.playerHitId !== r.lastPlayerHit) {
      r.lastPlayerHit = s.playerHitId;
      playSound("hurt");
    }

    // --- Body transform ---
    if (s.phase === "defeated") r.defeatTime += dt;
    const sink = r.defeatTime > 3.2 ? Math.min(5, (r.defeatTime - 3.2) * 0.9) : 0;
    body.current?.setNextKinematicTranslation({ x: s.bossX, y: s.bossY - sink, z: s.bossZ });
    body.current?.setNextKinematicRotation(rotation.setFromAxisAngle(up, s.bossYaw));

    // --- Locomotion ---
    const moved = Math.hypot(s.bossX - r.lastX, s.bossZ - r.lastZ);
    r.lastX = s.bossX;
    r.lastZ = s.bossZ;
    const speed = s.phase === "approach" ? moved / Math.max(dt, 1e-3) : 0;
    r.stride = THREE.MathUtils.damp(r.stride, Math.min(1, speed / 2.3), 6, dt);
    r.walkPhase += speed * dt * 2.3;

    // --- Target pose ---
    const tracks = TRACKS[s.move];
    const target = r.target;
    if (s.phase === "windup") {
      sampleTrack(tracks.windup, s.timer / (s.enraged ? spec.windupEnraged : spec.windup), target);
    } else if (s.phase === "strike") {
      sampleTrack(tracks.strike, s.timer, target);
    } else if (s.phase === "recovery") {
      sampleTrack(
        tracks.recovery,
        s.timer / (s.enraged ? spec.recoveryEnraged : spec.recovery),
        target,
      );
    } else if (s.phase === "roar") {
      sampleTrack(ROAR_TRACK, s.timer, target);
    } else if (s.phase === "defeated") {
      sampleTrack(DEATH_TRACK, r.defeatTime, target);
    } else {
      Object.assign(target, IDLE);
      if (s.enraged) {
        target.lean += 0.12;
        target.crouch -= 0.12;
        target.rShZ += 0.15;
      }
    }
    if (s.enraged && s.phase !== "defeated") target.core += 1.2;
    // Heavy holds tremble with strain; everything breathes.
    const strain = s.phase === "windup" && (s.move === "slam" || s.move === "nova") ? 1 : 0;
    target.lean += Math.sin(time * 1.7) * 0.025 + Math.sin(time * 43) * 0.012 * strain;
    target.rShX += Math.sin(time * 37) * 0.02 * strain;
    target.head += Math.sin(time * 1.7 + 0.6) * 0.03;
    r.flinch = Math.max(0, r.flinch - dt * 5);
    target.lean -= r.flinch * 0.22;
    target.head -= r.flinch * 0.3;
    target.twist += r.flinch * 0.12 * Math.sin(s.bossHitId * 2.1);

    const pose = r.pose;
    const snap =
      s.phase === "strike" ? 32 : s.phase === "defeated" ? 5 : s.phase === "windup" ? 11 : 8;
    for (const key of POSE_KEYS) {
      // Wrist is an angle that may wind past a full turn inside a sequence;
      // between sequences, always take the short way round.
      if (key === "rWrist") pose[key] = target[key] + wrapPi(pose[key] - target[key]);
      pose[key] = THREE.MathUtils.damp(pose[key], target[key], snap, dt);
    }

    // --- Apply to the rig ---
    const j = joints.current;
    const stride = r.stride;
    const swing = Math.sin(r.walkPhase);
    const bob = Math.abs(Math.cos(r.walkPhase)) * 0.09 * stride;
    const crouch = pose.crouch - bob;
    const bend = Math.acos(
      THREE.MathUtils.clamp((2 * LEG + Math.min(0, crouch)) / (2 * LEG), 0, 1),
    );
    j.pelvis?.position.set(0, HIP_HEIGHT + crouch, 0);
    j.pelvis?.rotation.set(0, swing * 0.08 * stride, 0);
    for (const [side, sign] of [
      ["L", 1],
      ["R", -1],
    ] as const) {
      const legSwing = swing * sign * 0.5 * stride;
      const lift =
        Math.max(0, Math.sin(r.walkPhase + (sign > 0 ? 0 : Math.PI) + Math.PI / 2)) * 0.8 * stride;
      const hip = THREE.MathUtils.lerp(-bend + legSwing, -1.15, pose.tuck);
      const knee = THREE.MathUtils.lerp(2 * bend + lift, 1.8, pose.tuck);
      j[`hip${side}`]?.rotation.set(hip, 0, sign * 0.06);
      j[`knee${side}`]?.rotation.set(knee, 0, 0);
      j[`ankle${side}`]?.rotation.set(-(hip + knee) * (1 - pose.tuck * 0.5), 0, 0);
    }
    j.spine?.rotation.set(pose.lean, pose.twist - swing * 0.1 * stride, pose.tilt);
    j.head?.rotation.set(pose.head, -pose.twist * 0.35, 0);
    j.rShoulder?.rotation.set(pose.rShX + swing * 0.2 * stride, 0, pose.rShZ);
    j.rElbow?.rotation.set(pose.rElbow, 0, 0);
    j.rHand?.rotation.set(pose.rWrist, 0, 0);
    j.lShoulder?.rotation.set(pose.lShX - swing * 0.35 * stride, 0, pose.lShZ);
    j.lElbow?.rotation.set(pose.lElbow, 0, 0);
    // Cloak lags the body and flares with movement and big motions.
    r.cloakSwing = THREE.MathUtils.damp(
      r.cloakSwing,
      -pose.lean * 0.7 - stride * 0.25 - pose.tuck * 0.6,
      4,
      dt,
    );
    j.cloak?.rotation.set(r.cloakSwing + Math.sin(time * 1.3) * 0.04, 0, 0);

    // --- Materials: hit flash, ember core, blade heat ---
    const flash = s.bossFlash * 0.9;
    materials.armor.emissiveIntensity = flash;
    materials.dark.emissiveIntensity = flash * 0.6;
    const pulse = 0.85 + Math.sin(time * 3.1) * 0.15;
    materials.ember.emissiveIntensity = 1.5 + pose.core * 1.6 * pulse;
    materials.eyes.emissiveIntensity =
      s.phase === "defeated" ? 5 * Math.max(0, 1 - r.defeatTime / 2.5) : 4 + pose.core;
    const windupProgress =
      s.phase === "windup"
        ? Math.min(1, s.timer / (s.enraged ? spec.windupEnraged : spec.windup))
        : 0;
    materials.molten.emissiveIntensity =
      (s.enraged ? 2.5 : 1) + windupProgress * 5 + (s.phase === "strike" ? 4 : 0);
    if (coreLight.current) coreLight.current.intensity = 4 + pose.core * 5 * pulse;
    if (aura.current) {
      aura.current.material.uniforms.uOpacity.value = THREE.MathUtils.damp(
        aura.current.material.uniforms.uOpacity.value,
        s.phase === "defeated" ? (r.defeatTime > 2 ? 1 : 0.3) : s.enraged ? 1 : 0.25,
        2,
        dt,
      );
    }

    // --- Telegraphs ---
    let range = 0,
      arc = -1,
      progress = 0;
    if (s.phase === "windup" && s.move !== "leap") {
      const hit = spec.hits[0];
      range = hit.range;
      arc = hit.arc;
      progress = windupProgress;
    } else if (
      s.phase === "strike" &&
      s.move === "combo" &&
      s.hitIndex > 0 &&
      s.hitIndex < spec.hits.length
    ) {
      const hit = spec.hits[s.hitIndex];
      range = hit.range;
      arc = hit.arc;
      progress = THREE.MathUtils.clamp(1 - (hit.at - s.timer) / 0.4, 0, 1);
    } else if (s.phase === "roar" && s.timer < 0.6) {
      range = 4.8;
      progress = s.timer / 0.6;
    }
    r.telegraph = THREE.MathUtils.damp(r.telegraph, range > 0 ? 1 : 0, range > 0 ? 12 : 6, dt);
    if (telegraph.current) {
      if (range > 0) {
        telegraph.current.scale.setScalar(range);
        telegraphMaterial.uniforms.uHalfArc.value = arc <= -1 ? Math.PI : Math.acos(arc);
        telegraphMaterial.uniforms.uProgress.value = progress;
      }
      telegraph.current.visible = r.telegraph > 0.01;
      telegraphMaterial.uniforms.uOpacity.value = r.telegraph * 0.55;
      telegraphMaterial.uniforms.uTime.value = time;
    }
    const airborne = s.phase === "strike" && s.move === "leap" && s.timer < LEAP_AIRTIME;
    if (leapMarker.current) {
      leapMarker.current.visible = airborne;
      leapMarker.current.position.set(s.leapToX, 0.06, s.leapToZ);
      leapMarker.current.scale.setScalar(spec.hits[0].range);
      leapMaterial.uniforms.uProgress.value = s.timer / LEAP_AIRTIME;
      leapMaterial.uniforms.uOpacity.value = 0.7;
      leapMaterial.uniforms.uTime.value = time;
    }

    // --- Sword trail, sampled in the body's local frame ---
    const tip = j.bladeTip,
      base = j.bladeBase,
      owner = root.current;
    if (tip && base && owner) {
      owner.updateMatrixWorld(true);
      const swinging = s.phase === "strike" || (s.phase === "roar" && s.timer < 0.8);
      r.trailStrength = THREE.MathUtils.damp(
        r.trailStrength,
        swinging ? 1 : 0,
        swinging ? 20 : 5,
        dt,
      );
      const p = trail.positions;
      if (!r.trailPrimed || r.trailStrength < 0.01) {
        // Collapse onto the blade so a new swing never streaks from stale points.
        base.getWorldPosition(scratch);
        owner.worldToLocal(scratch);
        for (let i = 0; i < TRAIL; i++) p.set([scratch.x, scratch.y, scratch.z], i * 6);
        tip.getWorldPosition(scratch);
        owner.worldToLocal(scratch);
        for (let i = 0; i < TRAIL; i++) p.set([scratch.x, scratch.y, scratch.z], i * 6 + 3);
        r.trailPrimed = true;
      }
      p.copyWithin(6, 0, (TRAIL - 1) * 6);
      base.getWorldPosition(scratch);
      owner.worldToLocal(scratch);
      p.set([scratch.x, scratch.y, scratch.z], 0);
      tip.getWorldPosition(scratch);
      owner.worldToLocal(scratch);
      p.set([scratch.x, scratch.y, scratch.z], 3);
      trail.geometry.getAttribute("position").needsUpdate = true;
      trail.geometry.computeBoundingSphere();
      trail.material.uniforms.uStrength.value = r.trailStrength * 0.8;
      if (trailMesh.current) trailMesh.current.visible = r.trailStrength > 0.01;
    }

    r.reportTimer += dt;
    if (r.reportTimer > 0.1) {
      r.reportTimer = 0;
      report({ ...s });
    }
  });

  const { armor, dark, cloak, ember, eyes, steel, molten } = materials;
  const leg = (side: "L" | "R", x: number) => (
    <group ref={bind(`hip${side}`)} position={[x, -0.05, 0]}>
      <mesh position={[0, -LEG / 2, 0]} material={dark} castShadow>
        <cylinderGeometry args={[0.27, 0.22, LEG, 10]} />
      </mesh>
      <mesh position={[0, -0.35, 0.12]} material={armor} castShadow>
        <boxGeometry args={[0.46, 0.6, 0.2]} />
      </mesh>
      <group ref={bind(`knee${side}`)} position={[0, -LEG, 0]}>
        <mesh material={armor} castShadow>
          <sphereGeometry args={[0.24, 10, 8]} />
        </mesh>
        <mesh position={[0, -LEG / 2, 0]} material={armor} castShadow>
          <cylinderGeometry args={[0.24, 0.19, LEG, 10]} />
        </mesh>
        <group ref={bind(`ankle${side}`)} position={[0, -LEG, 0]}>
          <mesh position={[0, -0.02, 0.14]} material={armor} castShadow>
            <boxGeometry args={[0.4, 0.2, 0.72]} />
          </mesh>
        </group>
      </group>
    </group>
  );
  const pauldron = (x: number) => (
    <group position={[x, 1.32, 0]}>
      <mesh scale={[1.25, 0.8, 1.1]} material={armor} castShadow>
        <sphereGeometry args={[0.52, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.6]} />
      </mesh>
      {[-0.25, 0.05, 0.35].map((z, i) => (
        <mesh
          key={z}
          position={[Math.sign(x) * (0.2 + i * 0.05), 0.35 - i * 0.04, z]}
          rotation={[z * 0.6, 0, -Math.sign(x) * 0.5]}
          material={dark}
          castShadow
        >
          <coneGeometry args={[0.08, 0.5 - i * 0.08, 6]} />
        </mesh>
      ))}
    </group>
  );

  return (
    <>
      <RigidBody ref={body} type="kinematicPosition" colliders={false} position={[0, 0, -7]}>
        <CylinderCollider args={[1.8, 1.05]} position={[0, 1.8, 0]} />
        <group ref={root}>
          <group ref={bind("pelvis")} position={[0, HIP_HEIGHT, 0]}>
            {leg("L", -0.42)}
            {leg("R", 0.42)}
            <mesh position={[0, -0.15, 0]} material={armor} castShadow>
              <cylinderGeometry args={[0.72, 0.95, 0.75, 12, 1, true]} />
            </mesh>
            <mesh position={[0, -0.35, 0.72]} rotation={[0.15, 0, 0]} material={cloak} castShadow>
              <planeGeometry args={[0.7, 1.3]} />
            </mesh>
            <group ref={bind("spine")} position={[0, 0.12, 0]} rotation-order="YXZ">
              <mesh position={[0, 0.25, 0]} material={dark} castShadow>
                <cylinderGeometry args={[0.72, 0.58, 0.6, 12]} />
              </mesh>
              <mesh position={[0, 0.85, 0]} scale={[1.05, 0.95, 0.72]} material={armor} castShadow>
                <sphereGeometry args={[0.85, 14, 10]} />
              </mesh>
              {/* Ember heart burning through a split breastplate. */}
              <mesh position={[0, 0.88, 0.5]} material={ember}>
                <icosahedronGeometry args={[0.24, 1]} />
              </mesh>
              {[-0.9, -0.3, 0.35, 0.95].map((a) => (
                <mesh
                  key={a}
                  position={[
                    Math.sin(a) * 0.42,
                    0.88 + Math.cos(a) * 0.3,
                    0.52 - Math.abs(a) * 0.1,
                  ]}
                  rotation={[0, 0, -a]}
                  material={ember}
                >
                  <boxGeometry args={[0.035, 0.42, 0.04]} />
                </mesh>
              ))}
              <pointLight
                ref={coreLight}
                position={[0, 0.9, 1]}
                color="#ff6a2a"
                intensity={6}
                distance={9}
                decay={2}
              />
              {pauldron(-0.98)}
              {pauldron(0.98)}
              <group ref={bind("cloak")} position={[0, 1.35, -0.25]}>
                <mesh geometry={cloakGeometry} material={cloak} castShadow />
              </group>
              <group ref={bind("head")} position={[0, 1.55, 0.08]}>
                <mesh position={[0, 0.05, 0]} material={dark}>
                  <cylinderGeometry args={[0.2, 0.26, 0.3, 8]} />
                </mesh>
                <mesh position={[0, 0.42, 0]} material={armor} castShadow>
                  <cylinderGeometry args={[0.36, 0.4, 0.62, 10]} />
                </mesh>
                <mesh position={[0, 0.72, 0]} material={armor} castShadow>
                  <sphereGeometry args={[0.36, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2]} />
                </mesh>
                <mesh position={[0, 0.36, 0.33]} material={dark}>
                  <boxGeometry args={[0.5, 0.12, 0.1]} />
                </mesh>
                {[-0.13, 0.13].map((x) => (
                  <mesh key={x} position={[x, 0.37, 0.39]} material={eyes}>
                    <boxGeometry args={[0.15, 0.05, 0.04]} />
                  </mesh>
                ))}
                {/* Crown of blackened horns. */}
                {[-1, 1].map((side) => (
                  <group
                    key={side}
                    position={[side * 0.34, 0.6, -0.02]}
                    rotation={[-0.35, 0, side * -0.9]}
                  >
                    <mesh position={[0, 0.3, 0]} material={dark} castShadow>
                      <coneGeometry args={[0.1, 0.65, 7]} />
                    </mesh>
                    <mesh
                      position={[side * -0.1, 0.72, -0.08]}
                      rotation={[-0.4, 0, side * 0.9]}
                      material={dark}
                    >
                      <coneGeometry args={[0.06, 0.4, 6]} />
                    </mesh>
                  </group>
                ))}
                {[-0.2, 0, 0.2].map((x) => (
                  <mesh key={x} position={[x, 0.98 - Math.abs(x) * 0.5, -0.05]} material={dark}>
                    <coneGeometry args={[0.05, 0.28, 5]} />
                  </mesh>
                ))}
              </group>
              {/* Sword arm. */}
              <group ref={bind("rShoulder")} position={[1.05, 1.22, 0]}>
                <mesh position={[0, -0.45, 0]} material={dark} castShadow>
                  <cylinderGeometry args={[0.23, 0.2, 0.9, 10]} />
                </mesh>
                <group ref={bind("rElbow")} position={[0, -0.9, 0]}>
                  <mesh material={armor}>
                    <sphereGeometry args={[0.21, 8, 6]} />
                  </mesh>
                  <mesh position={[0, -0.42, 0]} material={armor} castShadow>
                    <cylinderGeometry args={[0.2, 0.25, 0.85, 10]} />
                  </mesh>
                  <group ref={bind("rHand")} position={[0, -0.85, 0]}>
                    <mesh material={armor} castShadow>
                      <boxGeometry args={[0.3, 0.3, 0.3]} />
                    </mesh>
                    <mesh rotation={[Math.PI / 2, 0, 0]} material={dark}>
                      <cylinderGeometry args={[0.05, 0.05, 0.6, 6]} />
                    </mesh>
                    <mesh position={[0, 0, -0.32]} material={steel}>
                      <icosahedronGeometry args={[0.09, 0]} />
                    </mesh>
                    <mesh position={[0, 0, 0.26]} material={steel} castShadow>
                      <boxGeometry args={[0.95, 0.12, 0.12]} />
                    </mesh>
                    <mesh geometry={blade} material={steel} castShadow />
                    {/* Molten fuller that heats with every windup. */}
                    <mesh position={[0, 0, 1.45]} material={molten}>
                      <boxGeometry args={[0.07, 0.1, 2.1]} />
                    </mesh>
                    <object3D ref={bind("bladeBase")} position={[0, 0, 0.5]} />
                    <object3D ref={bind("bladeTip")} position={[0, 0, 3.05]} />
                  </group>
                </group>
              </group>
              {/* Off hand. */}
              <group ref={bind("lShoulder")} position={[-1.05, 1.22, 0]}>
                <mesh position={[0, -0.45, 0]} material={dark} castShadow>
                  <cylinderGeometry args={[0.23, 0.2, 0.9, 10]} />
                </mesh>
                <group ref={bind("lElbow")} position={[0, -0.9, 0]}>
                  <mesh material={armor}>
                    <sphereGeometry args={[0.21, 8, 6]} />
                  </mesh>
                  <mesh position={[0, -0.42, 0]} material={armor} castShadow>
                    <cylinderGeometry args={[0.2, 0.25, 0.85, 10]} />
                  </mesh>
                  <mesh position={[0, -0.92, 0]} material={armor} castShadow>
                    <boxGeometry args={[0.3, 0.32, 0.3]} />
                  </mesh>
                </group>
              </group>
            </group>
          </group>
          <Embers
            ref={aura}
            count={90}
            radius={1.3}
            height={4.6}
            speed={1.4}
            size={0.28}
            color="#ff7a30"
            opacity={0.25}
          />
          <mesh
            ref={telegraph}
            geometry={TELEGRAPH_GEOMETRY}
            material={telegraphMaterial}
            position={[0, 0.05, 0]}
            visible={false}
          />
          <mesh
            ref={trailMesh}
            geometry={trail.geometry}
            material={trail.material}
            frustumCulled={false}
            visible={false}
          />
        </group>
      </RigidBody>
      <mesh
        ref={leapMarker}
        geometry={TELEGRAPH_GEOMETRY}
        material={leapMaterial}
        visible={false}
      />
      <ImpactBursts ref={bursts} />
    </>
  );
}
