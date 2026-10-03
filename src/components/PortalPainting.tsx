import { useTexture } from "@react-three/drei";
import { useFrame, type ThreeElements } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useReducedMotion } from "../hooks/useReducedMotion";
import { Embers, NOISE_GLSL } from "./ashFx";

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
  uniform float uTime;
  uniform float uAsh;
  uniform float uHollow;
  uniform float uWarp;
  varying vec2 vUv;
  varying float vRipple;
  ${NOISE_GLSL}

  void main() {
    vec2 fromTouch = vUv - vec2(0.5);
    vec2 rippleDirection = normalize(fromTouch + vec2(0.0001));
    vec2 distortedUv = clamp(
      vUv + rippleDirection * vRipple * 0.022,
      vec2(0.002),
      vec2(0.998)
    );
    float warpRadius = length(fromTouch * vec2(1.32, 1.0));
    if (uWarp > 0.5) {
      // A warp vortex: the picture spirals into a glowing eye.
      float twist = smoothstep(0.62, 0.0, warpRadius) * 5.0;
      float angle = atan(fromTouch.y, fromTouch.x + 1e-4) + twist + uTime * 0.7 * smoothstep(0.62, 0.0, warpRadius);
      vec2 swirl = vec2(0.5) + vec2(cos(angle), sin(angle)) * length(fromTouch);
      distortedUv = clamp(mix(distortedUv, swirl, 0.55), vec2(0.002), vec2(0.998));
    }
    vec4 color = texture2D(uTexture, distortedUv);
    if (uWarp > 0.5) {
      float bands = sin(warpRadius * 38.0 - uTime * 4.0) * 0.5 + 0.5;
      color.rgb = mix(color.rgb, vec3(0.25, 0.45, 1.0) * (0.5 + bands * 0.5), smoothstep(0.08, 0.6, warpRadius) * 0.18);
      color.rgb += vec3(1.1, 0.5, 1.5) * smoothstep(0.12, 0.0, warpRadius) * (0.35 + 0.1 * sin(uTime * 3.0));
    }
    color.rgb += abs(vRipple) * 0.09 * uRippleStrength;
    if (uAsh > 0.5) {
      // A painting that is slowly burning: ashen, smoke-veiled, with a
      // smouldering edge eating in from the frame.
      float edge = min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y));
      float burn = edge + (noise(vUv * 16.0 + vec2(0.0, uTime * 0.2)) - 0.5) * 0.06;
      float grey = dot(color.rgb, vec3(0.3, 0.59, 0.11));
      color.rgb = mix(color.rgb, vec3(grey) * vec3(1.05, 0.88, 0.76), 0.6) * 0.85;
      float smoke = fbm(vUv * vec2(3.0, 2.2) + vec2(uTime * 0.03, -uTime * 0.09));
      color.rgb = mix(color.rgb, vec3(0.16, 0.13, 0.12), smoothstep(0.5, 0.85, smoke) * 0.45);
      color.rgb *= mix(0.5, 1.0, smoothstep(0.02, 0.2, burn));
      float ember = smoothstep(0.06, 0.03, burn) * smoothstep(0.0, 0.03, burn);
      float flicker = 0.7 + 0.3 * sin(uTime * 5.0 + vUv.x * 31.0 + vUv.y * 17.0);
      color.rgb = mix(color.rgb, vec3(0.02, 0.015, 0.012), smoothstep(0.03, 0.0, burn));
      color.rgb += vec3(2.4, 0.75, 0.16) * ember * flicker;
    }
    if (uHollow > 0.5) {
      // A haunted painting: moonlit and drained, mist crawling up from the
      // bottom edge, and a pair of eyes that open in the dark now and then.
      float grey = dot(color.rgb, vec3(0.3, 0.59, 0.11));
      color.rgb = mix(color.rgb, vec3(grey) * vec3(0.62, 0.7, 1.0), 0.65) * 0.7;
      float mist = fbm(vUv * vec2(4.0, 2.5) + vec2(uTime * 0.06, -uTime * 0.03));
      color.rgb = mix(color.rgb, vec3(0.42, 0.46, 0.6), smoothstep(0.55, 0.0, vUv.y) * mist * 0.85);
      float edge = min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y));
      color.rgb *= mix(0.25, 1.0, smoothstep(0.0, 0.18, edge));
      float cycle = mod(uTime, 7.0);
      float open = smoothstep(4.6, 4.9, cycle) * (1.0 - smoothstep(6.3, 6.5, cycle));
      open *= step(0.08, abs(cycle - 5.6));
      vec2 eyes = vec2(0.62, 0.42);
      float eye = 0.0;
      for (int i = 0; i < 2; i++) {
        vec2 d = (vUv - eyes - vec2(float(i) * 0.06, 0.0)) * vec2(1.0, 2.2);
        eye += smoothstep(0.018, 0.008, length(d));
      }
      color.rgb += vec3(3.0, 0.35, 0.1) * eye * open;
    }
    gl_FragColor = color;
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

type PortalPaintingProps = ThreeElements["group"] & {
  image: string;
  active?: boolean;
  impact?: boolean;
  beacon?: boolean;
  /** "ash": charred iron frame and a smouldering canvas (the Warden's gate).
   * "hollow": gnarled black frame, a haunted canvas and wisps (Halloween Hollow).
   * "warp": chrome frame with glowing studs and a swirling vortex (Warp Room). */
  variant?: "gilded" | "ash" | "hollow" | "warp";
};

export function PortalPainting({
  image,
  active = false,
  impact = false,
  beacon = true,
  variant = "gilded",
  ...props
}: PortalPaintingProps) {
  const ash = variant === "ash";
  const hollow = variant === "hollow";
  const warp = variant === "warp";
  const ashLight = useRef<THREE.PointLight>(null);
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
      uAsh: { value: ash ? 1 : 0 },
      uHollow: { value: hollow ? 1 : 0 },
      uWarp: { value: warp ? 1 : 0 },
    }),
    [texture, ash, hollow, warp],
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
      delta,
    );

    const rippleAge = rippleStartedAt.current === null ? 2 : elapsed - rippleStartedAt.current;
    shader.uniforms.uRippleAge.value = rippleAge;
    shader.uniforms.uRippleStrength.value =
      reducedMotion || rippleAge > 1.05 ? 0 : Math.pow(1 - rippleAge / 1.05, 1.4);
    if (ashLight.current)
      ashLight.current.intensity =
        (active ? 22 : 12) + Math.sin(elapsed * 9) * 2 + Math.sin(elapsed * 21.3) * 1.5;
  });

  const frameColor = ash ? "#2a2522" : hollow ? "#1c1622" : warp ? "#5a6a9a" : "#b78945";
  const frameMetal = ash ? 0.7 : hollow ? 0.2 : warp ? 0.85 : 0.62;
  const frameRough = ash ? 0.5 : hollow ? 0.85 : warp ? 0.25 : 0.3;

  return (
    <group {...props}>
      <mesh position={[0, 0, -0.18]} castShadow>
        <boxGeometry args={[5.25, 4.15, 0.34]} />
        <meshStandardMaterial
          color={ash ? "#1b1614" : hollow ? "#120e16" : "#51381f"}
          roughness={0.72}
        />
      </mesh>
      <mesh position={[0, 0, 0.02]} castShadow>
        <planeGeometry args={[4.62, 3.5, 72, 56]} />
        <shaderMaterial
          ref={material}
          uniforms={uniforms}
          vertexShader={vertexShader}
          fragmentShader={fragmentShader}
          toneMapped={false}
        />
      </mesh>
      <mesh position={[0, 2.02, 0.12]} castShadow>
        <boxGeometry args={[5.75, 0.3, 0.26]} />
        <meshStandardMaterial color={frameColor} metalness={frameMetal} roughness={frameRough} />
      </mesh>
      <mesh position={[0, -2.02, 0.12]} castShadow>
        <boxGeometry args={[5.75, 0.3, 0.26]} />
        <meshStandardMaterial color={frameColor} metalness={frameMetal} roughness={frameRough} />
      </mesh>
      <mesh position={[-2.72, 0, 0.12]} castShadow>
        <boxGeometry args={[0.3, 4.34, 0.26]} />
        <meshStandardMaterial color={frameColor} metalness={frameMetal} roughness={frameRough} />
      </mesh>
      <mesh position={[2.72, 0, 0.12]} castShadow>
        <boxGeometry args={[0.3, 4.34, 0.26]} />
        <meshStandardMaterial color={frameColor} metalness={frameMetal} roughness={frameRough} />
      </mesh>
      {ash && (
        <>
          {/* Ember seams in the charred frame. */}
          {[
            [0, 1.86, 5.2, 0.04],
            [0, -1.86, 5.2, 0.04],
            [-2.56, 0, 0.04, 3.7],
            [2.56, 0, 0.04, 3.7],
          ].map(([x, y, w, h]) => (
            <mesh key={`${x}-${y}`} position={[x, y, 0.26]}>
              <boxGeometry args={[w, h, 0.02]} />
              <meshStandardMaterial color="#ffa05a" emissive="#ff5a1a" emissiveIntensity={3} />
            </mesh>
          ))}
          {[-1, 1].map((side) => (
            <mesh
              key={side}
              position={[side * 2.72, 2.32, 0.12]}
              rotation={[0, 0, side * -0.25]}
              castShadow
            >
              <coneGeometry args={[0.13, 0.7, 6]} />
              <meshStandardMaterial
                color={frameColor}
                metalness={frameMetal}
                roughness={frameRough}
              />
            </mesh>
          ))}
          <group position={[0, -2.1, 0.45]} scale={[1, 1, 0.3]}>
            <Embers count={40} radius={2.3} height={4.4} speed={0.9} size={0.22} color="#ff7a30" />
          </group>
          <pointLight
            ref={ashLight}
            color="#ff6a2a"
            intensity={12}
            distance={9}
            decay={2}
            position={[0, 0, 1.6]}
          />
        </>
      )}
      {hollow && (
        <>
          {/* Thorny twigs curling off the corners, a pumpkin on each foot. */}
          {[-1, 1].map((side) => (
            <group key={side}>
              <mesh position={[side * 2.95, 2.3, 0.12]} rotation={[0, 0, side * -0.6]} castShadow>
                <coneGeometry args={[0.09, 0.9, 5]} />
                <meshStandardMaterial color={frameColor} roughness={frameRough} />
              </mesh>
              <mesh position={[side * 3.15, 1.6, 0.12]} rotation={[0, 0, side * -1.2]} castShadow>
                <coneGeometry args={[0.07, 0.6, 5]} />
                <meshStandardMaterial color={frameColor} roughness={frameRough} />
              </mesh>
              <mesh position={[side * 2.72, -2.2, 0.45]} scale={[1, 0.8, 1]} castShadow>
                <sphereGeometry args={[0.32, 10, 8]} />
                <meshStandardMaterial color="#c65b1e" roughness={0.9} />
              </mesh>
              {[-1, 1].map((eye) => (
                <mesh key={eye} position={[side * 2.72 + eye * 0.1, -2.15, 0.78]}>
                  <circleGeometry args={[0.06, 3]} />
                  <meshBasicMaterial color={[2.4, 1.3, 0.3]} toneMapped={false} />
                </mesh>
              ))}
            </group>
          ))}
          <group position={[0, -2.1, 0.5]} scale={[1, 1, 0.3]}>
            <Embers
              count={36}
              radius={2.4}
              height={4.2}
              speed={0.4}
              size={0.26}
              color="#7dffc8"
              sway={0.8}
            />
          </group>
          <pointLight
            color="#8f7dff"
            intensity={active ? 20 : 9}
            distance={8}
            decay={2}
            position={[0, 0.2, 1.8]}
          />
        </>
      )}
      {warp && (
        <>
          {/* Glowing studs on the corners and mid-rails. */}
          {[
            [-2.72, 2.02],
            [2.72, 2.02],
            [-2.72, -2.02],
            [2.72, -2.02],
            [0, 2.02],
            [0, -2.02],
          ].map(([x, y]) => (
            <mesh key={`${x}-${y}`} position={[x, y, 0.3]}>
              <sphereGeometry args={[0.2, 14, 10]} />
              <meshStandardMaterial
                color="#9ad8ff"
                emissive="#4fb6ff"
                emissiveIntensity={active ? 3 : 1.6}
              />
            </mesh>
          ))}
          <pointLight
            color="#8a6bff"
            intensity={active ? 22 : 10}
            distance={8}
            decay={2}
            position={[0, 0.2, 1.8]}
          />
        </>
      )}
      {beacon && !ash && !hollow && !warp && (
        <pointLight
          color="#e6bb71"
          intensity={active ? 24 : 9}
          distance={7}
          position={[0, 0.25, 2]}
        />
      )}
    </group>
  );
}
