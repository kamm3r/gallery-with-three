import * as THREE from "three";
import { kilnSlamElapsed, kilnSlamImpact, kilnSlamRadius, type KilnAttack } from "./kilnAttacks.ts";
import type { EnemyKind } from "./ashenParish.ts";

/** Low-poly dust, cinders and a ground-hugging pressure ring; no lights or per-frame allocations. */
export function createKilnImpact() {
  const root = new THREE.Group();
  root.name = "kiln-ground-impact";
  root.userData.enemyEffect = true;
  root.visible = false;
  root.position.set(0, 0.035 / 1.12, kilnSlamImpact.forward / 1.12);
  root.scale.setScalar(1 / 1.12);
  const dust = new THREE.MeshBasicMaterial({
    color: "#aa8056",
    transparent: true,
    opacity: 0,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const ash = new THREE.MeshBasicMaterial({
    color: "#544337",
    transparent: true,
    opacity: 0,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.88, 1, 32), dust);
  ring.rotation.x = -Math.PI / 2;
  const scar = new THREE.Mesh(new THREE.CircleGeometry(0.48, 12), ash);
  scar.rotation.x = -Math.PI / 2;
  scar.position.y = -0.015;
  const fragments = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.09, 0), dust, 12);
  fragments.frustumCulled = false;
  root.add(ring, scar, fragments);
  const transform = new THREE.Object3D();
  return {
    root,
    update(
      e: { kind: EnemyKind; kilnAttack?: KilnAttack; phase: string; timer: number },
      gentle: boolean,
    ) {
      const elapsed = kilnSlamElapsed(e);
      root.visible = elapsed >= 0 && elapsed <= kilnSlamImpact.duration;
      if (!root.visible) return;
      const t = elapsed / kilnSlamImpact.duration;
      const radius = kilnSlamRadius(elapsed);
      ring.scale.setScalar(Math.max(0.01, radius));
      dust.opacity = (1 - t) * 0.7;
      ash.opacity = (1 - t) * 0.55;
      for (let i = 0; i < 12; i++) {
        const angle = (i * Math.PI) / 6 + 0.13;
        const spread = 0.2 + radius * (0.48 + (i % 3) * 0.13);
        transform.position.set(
          Math.sin(angle) * spread,
          gentle ? 0.025 : Math.sin(t * Math.PI) * (0.18 + (i % 4) * 0.065),
          Math.cos(angle) * spread,
        );
        transform.rotation.set(t * 4 + i, angle, t * 3);
        transform.scale.setScalar((1 - t) * (0.6 + (i % 3) * 0.25));
        transform.updateMatrix();
        fragments.setMatrixAt(i, transform.matrix);
      }
      fragments.instanceMatrix.needsUpdate = true;
    },
    dispose() {
      ring.geometry.dispose();
      scar.geometry.dispose();
      fragments.geometry.dispose();
      dust.dispose();
      ash.dispose();
    },
  };
}
