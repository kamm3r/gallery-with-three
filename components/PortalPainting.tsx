import { useTexture } from '@react-three/drei';
import { useFrame, type ThreeElements } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useReducedMotion } from '../hooks/useReducedMotion';

const vertexShader = /* glsl */ `
  uniform float uTime;
  uniform float uActive;
  uniform float uRippleAge;
  uniform float uRippleStrength;
  varying vec2 vUv;
  varying float vRipple;

  void main() {
    vUv = uv;
    float distanceFromTouch = distance(uv, vec2(0.5));
    float rippleRadius = uRippleAge * 0.75;
    float ringDistance = distanceFromTouch - rippleRadius;
    float ring = sin(ringDistance * 58.0) * exp(-abs(ringDistance) * 15.0);
    float idleWave = sin(uv.y * 18.0 + uTime * 1.5)
      * sin(uv.x * 13.0 - uTime * 0.8)
      * uActive;

    vRipple = ring * uRippleStrength;
    vec3 displaced = position;
    displaced.z += vRipple * 0.18 + idleWave * 0.012;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(displaced, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  uniform sampler2D uTexture;
  uniform float uRippleStrength;
  varying vec2 vUv;
  varying float vRipple;

  void main() {
    vec2 fromTouch = vUv - vec2(0.5);
    vec2 rippleDirection = normalize(fromTouch + vec2(0.0001));
    vec2 distortedUv = clamp(
      vUv + rippleDirection * vRipple * 0.022,
      vec2(0.002),
      vec2(0.998)
    );
    vec4 color = texture2D(uTexture, distortedUv);
    color.rgb += abs(vRipple) * 0.09 * uRippleStrength;
    gl_FragColor = color;
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

type PortalPaintingProps = ThreeElements['group'] & {
  image: string;
  active?: boolean;
  impact?: boolean;
};

export function PortalPainting({
  image,
  active = false,
  impact = false,
  ...props
}: PortalPaintingProps) {
  const texture = useTexture(image);
  const material = useRef<THREE.ShaderMaterial>(null);
  const rippleStartedAt = useRef<number | null>(null);
  const previousImpact = useRef(false);
  const reducedMotion = useReducedMotion();
  const uniforms = useMemo(
    () => ({
      uTexture: { value: texture },
      uTime: { value: 0 },
      uActive: { value: 0 },
      uRippleAge: { value: 0 },
      uRippleStrength: { value: 0 },
    }),
    [texture]
  );
  useFrame((state, delta) => {
    const shader = material.current;
    if (!shader) return;

    const elapsed = state.clock.elapsedTime;
    if (impact && !previousImpact.current) rippleStartedAt.current = elapsed;
    previousImpact.current = impact;

    shader.uniforms.uTime.value = elapsed;
    shader.uniforms.uActive.value = THREE.MathUtils.damp(
      shader.uniforms.uActive.value,
      active && !reducedMotion ? 1 : 0,
      6,
      delta
    );

    const rippleAge = rippleStartedAt.current === null
      ? 2
      : elapsed - rippleStartedAt.current;
    shader.uniforms.uRippleAge.value = rippleAge;
    shader.uniforms.uRippleStrength.value =
      reducedMotion || rippleAge > 1.05
        ? 0
        : Math.pow(1 - rippleAge / 1.05, 1.4);
  });

  return (
    <group {...props}>
      <mesh position={[0, 0, -0.18]} castShadow>
        <boxGeometry args={[4.15, 3.25, 0.34]} />
        <meshStandardMaterial color='#51381f' roughness={0.72} />
      </mesh>
      <mesh position={[0, 0, 0.02]} castShadow>
        <planeGeometry args={[3.56, 2.66, 64, 48]} />
        <shaderMaterial
          ref={material}
          uniforms={uniforms}
          vertexShader={vertexShader}
          fragmentShader={fragmentShader}
          toneMapped={false}
        />
      </mesh>
      <mesh position={[0, 1.56, 0.12]} castShadow>
        <boxGeometry args={[4.55, 0.28, 0.26]} />
        <meshStandardMaterial color='#b78945' metalness={0.62} roughness={0.3} />
      </mesh>
      <mesh position={[0, -1.56, 0.12]} castShadow>
        <boxGeometry args={[4.55, 0.28, 0.26]} />
        <meshStandardMaterial color='#b78945' metalness={0.62} roughness={0.3} />
      </mesh>
      <mesh position={[-2.14, 0, 0.12]} castShadow>
        <boxGeometry args={[0.28, 3.4, 0.26]} />
        <meshStandardMaterial color='#b78945' metalness={0.62} roughness={0.3} />
      </mesh>
      <mesh position={[2.14, 0, 0.12]} castShadow>
        <boxGeometry args={[0.28, 3.4, 0.26]} />
        <meshStandardMaterial color='#b78945' metalness={0.62} roughness={0.3} />
      </mesh>
      <pointLight
        color='#e6bb71'
        intensity={active ? 24 : 9}
        distance={7}
        position={[0, 0.25, 2]}
      />
    </group>
  );
}
