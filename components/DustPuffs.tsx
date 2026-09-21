import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef, type RefObject } from 'react';
import * as THREE from 'three';
import type { EcctrlHandle } from 'ecctrl';
import type { ActionName } from './AnimatedCharacter';
import { useReducedMotion } from '../hooks/useReducedMotion';

const MAX_PARTICLES = 140;
const TAKEOFF_BURST = 10;
const LAND_BURST = 14;

const vertexShader = /* glsl */ `
  attribute float aAlpha;
  attribute float aSize;
  uniform float uViewportHeight;
  varying float vAlpha;
  void main() {
    vAlpha = aAlpha;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * uViewportHeight * projectionMatrix[1][1] / max(0.1, -2.0 * mvPosition.z);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const fragmentShader = /* glsl */ `
  varying float vAlpha;
  void main() {
    vec2 uv = gl_PointCoord - 0.5;
    // Overlapping lobes give each puff a little cloud silhouette.
    float d = min(length(uv * vec2(1.0, 1.2)),
      min(length((uv - vec2(-0.19, -0.04)) * 1.5),
          length((uv - vec2(0.19, 0.03)) * 1.6)));
    float mask = 1.0 - smoothstep(0.30, 0.44, d);
    float alpha = mask * vAlpha;
    if (alpha < 0.01) discard;
    float shade = 0.86 + 0.14 * smoothstep(-0.4, 0.25, uv.y);
    gl_FragColor = vec4(vec3(1.0, 0.96, 0.84) * shade, alpha);
  }
`;

/**
 * Pooled dust particles. All mutation lives in class methods so the
 * component only ever calls methods / reads geometry for JSX, which keeps
 * the hooks-immutability lint happy while the pool stays GC-free per frame.
 */
class DustPool {
  readonly geometry = new THREE.BufferGeometry();
  readonly material = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    uniforms: { uViewportHeight: { value: 800 } },
  });
  private readonly vel = new Float32Array(MAX_PARTICLES * 3);
  private readonly life = new Float32Array(MAX_PARTICLES);
  private readonly maxLife = new Float32Array(MAX_PARTICLES);
  private readonly baseSize = new Float32Array(MAX_PARTICLES);
  private cursor = 0;

  constructor() {
    const positions = new Float32Array(MAX_PARTICLES * 3);
    for (let i = 0; i < MAX_PARTICLES; i++) {
      positions[i * 3 + 1] = -999;
    }
    this.geometry.setAttribute(
      'position',
      new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage)
    );
    this.geometry.setAttribute(
      'aAlpha',
      new THREE.BufferAttribute(new Float32Array(MAX_PARTICLES), 1).setUsage(
        THREE.DynamicDrawUsage
      )
    );
    this.geometry.setAttribute(
      'aSize',
      new THREE.BufferAttribute(new Float32Array(MAX_PARTICLES), 1).setUsage(
        THREE.DynamicDrawUsage
      )
    );
  }

  emit(
    x: number,
    y: number,
    z: number,
    playerVx: number,
    playerVz: number,
    count: number,
    spread: number,
    up: number,
    minSize: number,
    maxSize: number,
    ring = false
  ) {
    const positions = this.geometry.getAttribute(
      'position'
    ) as THREE.BufferAttribute;
    for (let n = 0; n < count; n++) {
      const i = this.cursor;
      this.cursor = (this.cursor + 1) % MAX_PARTICLES;
      const angle = ring ? n / count * Math.PI * 2 : Math.random() * Math.PI * 2;
      const radius = ring ? 0.3 : Math.random() * 0.12;
      positions.setXYZ(
        i,
        x + Math.cos(angle) * radius,
        y + Math.random() * 0.08,
        z + Math.sin(angle) * radius
      );
      this.vel[i * 3] =
        Math.cos(angle) * spread * (0.4 + Math.random() * 0.6) + playerVx * 0.2;
      this.vel[i * 3 + 1] = up * (0.5 + Math.random() * 0.8);
      this.vel[i * 3 + 2] =
        Math.sin(angle) * spread * (0.4 + Math.random() * 0.6) + playerVz * 0.2;
      this.maxLife[i] = 0.28 + Math.random() * 0.22;
      this.life[i] = this.maxLife[i];
      this.baseSize[i] = minSize + Math.random() * (maxSize - minSize);
    }
  }

  update(delta: number) {
    const positions = this.geometry.getAttribute(
      'position'
    ) as THREE.BufferAttribute;
    const alphas = this.geometry.getAttribute(
      'aAlpha'
    ) as THREE.BufferAttribute;
    const sizes = this.geometry.getAttribute('aSize') as THREE.BufferAttribute;
    const drag = Math.max(0, 1 - 2.2 * delta);
    for (let i = 0; i < MAX_PARTICLES; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= delta;
      if (this.life[i] <= 0) {
        alphas.setX(i, 0);
        positions.setY(i, -999);
        continue;
      }
      this.vel[i * 3] *= drag;
      this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * drag + 0.6 * delta;
      this.vel[i * 3 + 2] *= drag;
      positions.setXYZ(
        i,
        positions.getX(i) + this.vel[i * 3] * delta,
        positions.getY(i) + this.vel[i * 3 + 1] * delta,
        positions.getZ(i) + this.vel[i * 3 + 2] * delta
      );
      const t = this.life[i] / this.maxLife[i];
      alphas.setX(i, 0.8 * Math.min(1, t * 3));
      const age = 1 - t;
      sizes.setX(i, this.baseSize[i] * (0.7 + Math.sin(age * Math.PI) * 0.8) * Math.min(1, t * 4));
    }
    positions.needsUpdate = true;
    alphas.needsUpdate = true;
    sizes.needsUpdate = true;
  }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
  }

  setViewport(height: number) {
    this.material.uniforms.uViewportHeight.value = height;
  }
}

interface DustPuffsProps {
  controllerRef: RefObject<EcctrlHandle | null>;
  headingRef: RefObject<THREE.Group | null>;
  action: ActionName;
}

const feetPos = new THREE.Vector3();

/**
 * Mario Odyssey-style dust: run/walk trail at the feet plus takeoff and
 * landing bursts. One pooled THREE.Points draw call, world-space positions,
 * so it mounts as a sibling of the physics body (never inside <Ecctrl>).
 */
export function DustPuffs({
  controllerRef,
  headingRef,
  action,
}: DustPuffsProps) {
  const pointsRef = useRef<THREE.Points>(null);
  const actionRef = useRef<ActionName>(action);
  const wasGrounded = useRef(true);
  const prevVy = useRef(0);
  const runAcc = useRef(0);
  const walkAcc = useRef(0);
  const pool = useMemo(() => new DustPool(), []);
  const reducedMotion = useReducedMotion();
  const footSide = useRef(1);

  useEffect(() => {
    actionRef.current = action;
  }, [action]);

  useEffect(() => {
    return () => {
      pool.dispose();
    };
  }, [pool]);

  useFrame((state, rawDelta) => {
    const player = controllerRef.current;
    const heading = headingRef.current;
    if (!player || !heading || !pointsRef.current) return;

    const delta = Math.min(rawDelta, 0.05);
    pool.setViewport(state.size.height * state.gl.getPixelRatio());
    const velocity = player.body.linvel();
    const grounded = player.isOnGround;
    heading.getWorldPosition(feetPos);
    const fx = feetPos.x;
    const fy = feetPos.y + 0.12;
    const fz = feetPos.z;

    if (grounded !== wasGrounded.current) {
      if (!grounded && velocity.y > 1) {
        pool.emit(fx, fy, fz, 0, 0, reducedMotion ? 3 : TAKEOFF_BURST, 1.9, 0.5, 0.32, 0.5, true);
      }
      if (grounded && prevVy.current < -3) {
        const impact = THREE.MathUtils.clamp(-prevVy.current / 9, 0.5, 1.8);
        pool.emit(fx, fy, fz, 0, 0, reducedMotion ? 4 : Math.round(LAND_BURST * impact), 2.4 * impact, 0.65, 0.34, 0.58 * impact, true);
      }
    }
    wasGrounded.current = grounded;
    prevVy.current = velocity.y;

    const act = actionRef.current;
    const speed = Math.hypot(velocity.x, velocity.z);
    const dx = speed > 0.1 ? velocity.x / speed : 0;
    const dz = speed > 0.1 ? velocity.z / speed : 0;
    if (grounded && speed > 1 && (act === 'Run' || act === 'Roll')) {
      runAcc.current += delta * speed / 1.05;
      while (runAcc.current >= 1) {
        runAcc.current -= 1;
        footSide.current *= -1;
        pool.emit(fx - dx * 0.25 + dz * footSide.current * 0.18, fy, fz - dz * 0.25 - dx * footSide.current * 0.18, -velocity.x, -velocity.z, reducedMotion ? 1 : 3, 0.45, 0.7, 0.3, 0.5);
      }
    } else {
      runAcc.current = 0;
    }
    if (grounded && speed > 0.6 && act === 'Walk') {
      walkAcc.current += delta * speed / 1.3;
      while (walkAcc.current >= 1) {
        walkAcc.current -= 1;
        footSide.current *= -1;
        if (!reducedMotion) pool.emit(fx + dz * footSide.current * 0.2, fy, fz - dx * footSide.current * 0.2, -velocity.x, -velocity.z, 1, 0.2, 0.3, 0.17, 0.26);
      }
    } else {
      walkAcc.current = 0;
    }

    pool.update(delta);
  });

  return (
    <points
      ref={pointsRef}
      args={[pool.geometry, pool.material]}
      frustumCulled={false}
    />
  );
}
