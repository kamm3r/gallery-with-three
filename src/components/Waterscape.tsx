import { useFrame } from "@react-three/fiber";
import { useWorld } from "koota/react";
import { PlayerPosition } from "../gameplay/ecs/traits";
import { CuboidCollider, RigidBody } from "@react-three/rapier";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { groundHeight, riverX, WATER_LEVEL, waterDistance } from "../gameplay/terrain";
import { useReducedMotion } from "../hooks/useReducedMotion";
import { RiverSurface } from "../runtime/riverSurface";

class WaterContact {
  readonly position = new THREE.Vector3();
  readonly previous = new THREE.Vector3();
  readonly transform = new THREE.Object3D();
  readonly drops = Array.from({ length: 48 }, () => ({
    position: new THREE.Vector3(),
    velocity: new THREE.Vector3(),
    life: 0,
  }));
  initialized = false;
  wet = false;
  travelled = 0;
  cursor = 0;
  update(
    player: { x: number; y: number; z: number; valid: boolean },
    delta: number,
    water: RiverSurface,
    mesh: THREE.InstancedMesh,
    reduced: boolean,
  ) {
    if (!player.valid) return;
    this.position.set(player.x, player.y, player.z);
    if (!this.initialized) {
      this.previous.copy(this.position);
      this.initialized = true;
    }
    const p = this.position;
    const wet =
      groundHeight(p.x, p.z) < WATER_LEVEL - 0.08 &&
      waterDistance(p.x, p.z) < 4 &&
      p.y < WATER_LEVEL + 0.12 &&
      p.y > WATER_LEVEL - 2.5;
    const distance = Math.hypot(p.x - this.previous.x, p.z - this.previous.z);
    this.travelled += wet ? distance : -this.travelled;
    if (wet && (!this.wet || this.travelled > 0.85) && distance < 5) {
      const fallSpeed = Math.max(0, (this.previous.y - p.y) / Math.max(delta, 0.001));
      const strength = !this.wet ? Math.min(1.8, 0.7 + fallSpeed * 0.12) : 0.55;
      water.emit(p.x, p.z, reduced ? 0.2 : strength);
      this.travelled = 0;
      if (!reduced)
        for (let i = 0; i < 12; i++) {
          const drop = this.drops[this.cursor++ % this.drops.length];
          const angle = (i / 12) * Math.PI * 2;
          drop.position.set(p.x, WATER_LEVEL + 0.08, p.z);
          drop.velocity.set(
            Math.cos(angle) * strength,
            1.7 + strength * (i % 3) * 0.45,
            Math.sin(angle) * strength,
          );
          drop.life = 0.6;
        }
    }
    this.wet = wet;
    this.previous.copy(p);
    this.drops.forEach((drop, i) => {
      drop.life = reduced ? 0 : Math.max(0, drop.life - delta);
      if (drop.life > 0) {
        drop.velocity.y -= delta * 9;
        drop.position.addScaledVector(drop.velocity, delta);
        if (drop.position.y < WATER_LEVEL) drop.life = 0;
      }
      this.transform.position.copy(drop.position);
      this.transform.scale.setScalar(drop.life > 0 ? 0.035 + drop.life * 0.035 : 0);
      this.transform.updateMatrix();
      mesh.setMatrixAt(i, this.transform.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  }
}

const BRIDGE_Z = 10;
const BRIDGE_X = riverX(BRIDGE_Z);
function bridgeY(t: number) {
  const left = groundHeight(BRIDGE_X - 11, BRIDGE_Z) + 0.14;
  const right = groundHeight(BRIDGE_X + 11, BRIDGE_Z) + 0.14;
  return left * (1 - t) + right * t + Math.sin(t * Math.PI) * 1.15;
}

function WoodlandBridge() {
  return (
    <group name="river-bridge">
      {Array.from({ length: 32 }, (_, i) => {
        const t0 = i / 32,
          t1 = (i + 1) / 32;
        const x = BRIDGE_X - 11 + (t0 + t1) * 11;
        const y = (bridgeY(t0) + bridgeY(t1)) / 2;
        const angle = Math.atan2(bridgeY(t1) - bridgeY(t0), 22 / 32);
        return (
          <RigidBody
            key={i}
            type="fixed"
            colliders={false}
            position={[x, y, BRIDGE_Z]}
            rotation={[0, 0, angle]}
          >
            <CuboidCollider args={[0.35, 0.12, 2.15]} />
            <mesh castShadow receiveShadow>
              <boxGeometry args={[0.68, 0.24, 4.3]} />
              <meshStandardMaterial color={i % 3 ? "#94784d" : "#806642"} roughness={0.9} />
            </mesh>
            {[-2.1, 2.1].map((z) => (
              <group key={z}>
                <CuboidCollider args={[0.36, 0.07, 0.07]} position={[0, 1.1, z]} />
                <mesh position={[0, 1.1, z]} castShadow receiveShadow>
                  <boxGeometry args={[0.72, 0.14, 0.14]} />
                  <meshStandardMaterial color="#655035" roughness={1} />
                </mesh>
                {i % 4 === 0 && (
                  <mesh position={[0, 0.55, z]} castShadow receiveShadow>
                    <boxGeometry args={[0.17, 1.25, 0.17]} />
                    <meshStandardMaterial color="#655035" roughness={1} />
                  </mesh>
                )}
              </group>
            ))}
          </RigidBody>
        );
      })}
    </group>
  );
}

export function Waterscape() {
  const world = useWorld();
  const water = useMemo(() => new RiverSurface(), []);
  const contact = useMemo(() => new WaterContact(), []);
  const droplets = useRef<THREE.InstancedMesh>(null);
  const reduced = useReducedMotion();
  useFrame((state, delta) => {
    water.update(state.clock.elapsedTime, reduced);
    if (droplets.current)
      contact.update(world.get(PlayerPosition)!, delta, water, droplets.current, reduced);
  });
  useEffect(
    () => () => {
      water.geometry.dispose();
      water.material.dispose();
    },
    [water],
  );
  return (
    <>
      <mesh
        name="river-and-lakes"
        geometry={water.geometry}
        material={water.material}
        receiveShadow
        dispose={null}
      />
      <instancedMesh
        name="water-splashes"
        ref={droplets}
        args={[undefined, undefined, 48]}
        frustumCulled={false}
      >
        <sphereGeometry args={[1, 5, 3]} />
        <meshStandardMaterial color="#c0e4e9" roughness={0.25} />
      </instancedMesh>
      <WoodlandBridge />
      {Array.from({ length: 15 }, (_, i) => {
        const x = 13 + i * 1.15,
          z = 10;
        return (
          <mesh
            key={i}
            position={[x, groundHeight(x, z) + 0.03, z]}
            rotation={[-Math.PI / 2, 0, i]}
            receiveShadow
          >
            <circleGeometry args={[0.64, 7]} />
            <meshStandardMaterial color="#a0a089" roughness={1} />
          </mesh>
        );
      })}
    </>
  );
}
