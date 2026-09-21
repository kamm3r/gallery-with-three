import { useFrame } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { groundHeight, isDryLand, scatter } from "../gameplay/terrain";
import { useReducedMotion } from "../hooks/useReducedMotion";

export function Butterflies() {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const elapsed = useRef(0);
  const reducedMotion = useReducedMotion();
  const points = useMemo(
    () => scatter(40, 5, 65, 945, 0.7, 1.2).filter((p) => isDryLand(p.x, p.z)),
    [],
  );
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const shape = useMemo(() => {
    const wing = new THREE.Shape();
    wing.moveTo(0, 0);
    wing.bezierCurveTo(0.1, 0.42, 0.52, 0.4, 0.38, 0.06);
    wing.bezierCurveTo(0.48, -0.27, 0.15, -0.35, 0, 0);
    return wing;
  }, []);
  useLayoutEffect(() => {
    const batch = mesh.current;
    if (!batch) return;
    const colors = ["#e8b75c", "#b4b7f1", "#f2dfb8", "#e89b73"];
    points.forEach((_, i) => {
      const color = new THREE.Color(colors[i % colors.length]);
      batch.setColorAt(i * 2, color);
      batch.setColorAt(i * 2 + 1, color);
    });
    if (batch.instanceColor) batch.instanceColor.needsUpdate = true;
  }, [points]);
  useFrame((state, delta) => {
    const batch = mesh.current;
    if (!batch) return;
    elapsed.current += Math.min(delta, 0.05) * (reducedMotion ? 0.2 : 1);
    const t = elapsed.current;
    points.forEach((p, i) => {
      const phase = t * 0.55 + i * 2.39;
      const x = p.x + Math.sin(phase) * 1.7;
      const z = p.z + Math.cos(phase * 0.8) * 1.4;
      const y = groundHeight(x, z) + 1.1 + Math.sin(phase * 2) * 0.35;
      const visible =
        state.camera.position.distanceToSquared(dummy.position.set(x, y, z)) < 45 * 45;
      for (let side = 0; side < 2; side++) {
        dummy.position.set(x, y, z);
        dummy.rotation.set(Math.PI / 2, (side ? Math.PI : 0) + Math.sin(t * 24 + i) * 0.8, -phase);
        dummy.scale.setScalar(visible ? p.scale : 0);
        dummy.updateMatrix();
        batch.setMatrixAt(i * 2 + side, dummy.matrix);
      }
    });
    batch.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh
      ref={mesh}
      args={[undefined, undefined, points.length * 2]}
      frustumCulled={false}
    >
      <shapeGeometry args={[shape, 6]} />
      <meshStandardMaterial side={THREE.DoubleSide} roughness={0.85} />
    </instancedMesh>
  );
}
