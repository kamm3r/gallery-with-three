import { useEffect, useMemo } from "react";
import { RigidBody } from "@react-three/rapier";
import * as THREE from "three";

// Concave structures use triangle colliders, never a hull across their openings.
export function ReferenceCourse() {
  const hill = useMemo(() => {
    const geometry = new THREE.PlaneGeometry(20, 20, 40, 40);
    geometry.rotateX(-Math.PI / 2);
    const positions = geometry.attributes.position;
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i),
        z = positions.getZ(i);
      const radius = Math.min(1, Math.hypot(x, z) / 10);
      positions.setY(i, (4 * (1 + Math.cos(radius * Math.PI))) / 2);
    }
    geometry.computeVertexNormals();
    return geometry;
  }, []);
  const checker = useMemo(() => {
    const texture = new THREE.DataTexture(
      new Uint8Array([54, 115, 46, 255, 99, 158, 71, 255, 99, 158, 71, 255, 54, 115, 46, 255]),
      2,
      2,
    );
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(8, 8);
    texture.magFilter = THREE.NearestFilter;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;
    return texture;
  }, []);
  useEffect(
    () => () => {
      hill.dispose();
      checker.dispose();
    },
    [hill, checker],
  );
  return (
    <>
      <RigidBody type="fixed" colliders="trimesh" position={[-42, 0.015, 46]}>
        <mesh geometry={hill} receiveShadow>
          <meshStandardMaterial map={checker} roughness={1} />
        </mesh>
      </RigidBody>
      <RigidBody type="fixed" colliders="trimesh" position={[-17, 5, 48]}>
        <mesh castShadow receiveShadow>
          <torusGeometry args={[5, 0.65, 12, 64]} />
          <meshStandardMaterial color="#a43c46" roughness={0.8} />
        </mesh>
      </RigidBody>
      <RigidBody type="fixed" colliders="cuboid" position={[17, 0, 46]}>
        <mesh position={[0, 0.65, 0]} receiveShadow>
          <boxGeometry args={[8, 1.3, 16]} />
          <meshStandardMaterial color="#397ba3" />
        </mesh>
        {[-1, 1].map((side) => (
          <group key={side}>
            <mesh
              position={[side * 4, 2.2, 0]}
              rotation={[0, 0, side * -0.28]}
              castShadow
              receiveShadow
            >
              <boxGeometry args={[0.5, 3.2, 16]} />
              <meshStandardMaterial color="#508eb4" />
            </mesh>
            <mesh
              position={[side * 2, 2.2, -9.5]}
              rotation={[0, side * -0.8, 0]}
              castShadow
              receiveShadow
            >
              <boxGeometry args={[0.5, 3.2, 5.5]} />
              <meshStandardMaterial color="#508eb4" />
            </mesh>
          </group>
        ))}
        <mesh position={[0, 2, 8]} castShadow>
          <boxGeometry args={[8, 2, 0.5]} />
          <meshStandardMaterial color="#508eb4" />
        </mesh>
        <mesh position={[0, 5, 0]} castShadow>
          <cylinderGeometry args={[0.18, 0.18, 8, 8]} />
          <meshStandardMaterial color="#304d68" />
        </mesh>
        <mesh position={[0, 0.55, 12]} rotation={[-0.14, 0, 0]} receiveShadow>
          <boxGeometry args={[2, 0.25, 8]} />
          <meshStandardMaterial color="#74a8c3" />
        </mesh>
      </RigidBody>
    </>
  );
}
