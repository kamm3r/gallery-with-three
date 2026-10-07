import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useReducedMotion } from "../hooks/useReducedMotion";
import { HEIGHTMAP_WORLD, sharedHeightTexture } from "../gameplay/heightmap";
import {
  BUGS_MAX_DIST,
  BUGS_SPAWN_RANGE,
  createBugsGeometry,
  createBugsMaterial,
  createMothTexture,
  type QuickBugsUniforms,
} from "../gameplay/quickBugsShaders";

// Quick_Grass BUGS port (MIT, simondevyoutube/Quick_Grass): meadow moths
// that fly entirely in the vertex shader — loop flight, wing fold, terrain
// following, and over-water sinking all come from the per-bug offset hash.
// The CPU only advances time and assigns pooled moth cells around the
// camera; per-frame matrix updates are gone.
const CELL_RANGE = 3;
const POOL_CAP = 64;

class BugsPool {
  readonly meshes: THREE.Mesh[] = [];
  private readonly frustum = new THREE.Frustum();
  private readonly projScreen = new THREE.Matrix4();
  private readonly cellBox = new THREE.Box3();
  private readonly cellCenter = new THREE.Vector3();
  private readonly cellHalf = new THREE.Vector3(BUGS_SPAWN_RANGE / 2, 500, BUGS_SPAWN_RANGE / 2);

  constructor(
    readonly group: THREE.Group,
    readonly geometry: THREE.InstancedBufferGeometry,
    readonly material: THREE.MeshPhongMaterial,
  ) {}

  private createMesh() {
    if (this.meshes.length >= POOL_CAP) return null;
    const mesh = new THREE.Mesh(this.geometry, this.material);
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    mesh.visible = false;
    mesh.frustumCulled = false;
    this.meshes.push(mesh);
    this.group.add(mesh);
    return mesh;
  }

  update(camera: THREE.Camera) {
    this.frustum.setFromProjectionMatrix(
      this.projScreen.copy(camera.projectionMatrix).multiply(camera.matrixWorldInverse),
    );
    for (const child of this.group.children) child.visible = false;

    const baseX = Math.floor(camera.position.x / BUGS_SPAWN_RANGE) * BUGS_SPAWN_RANGE;
    const baseZ = Math.floor(camera.position.z / BUGS_SPAWN_RANGE) * BUGS_SPAWN_RANGE;
    const available = [...this.meshes];

    for (let x = -CELL_RANGE; x <= CELL_RANGE; x++) {
      for (let z = -CELL_RANGE; z <= CELL_RANGE; z++) {
        this.cellCenter.set(baseX + x * BUGS_SPAWN_RANGE, 0, baseZ + z * BUGS_SPAWN_RANGE);
        this.cellBox.setFromCenterAndSize(this.cellCenter, this.cellHalf);
        if (this.cellBox.distanceToPoint(camera.position) > BUGS_MAX_DIST) continue;
        if (!this.frustum.intersectsBox(this.cellBox)) continue;

        const mesh = available.length > 0 ? available.pop()! : this.createMesh();
        if (!mesh) continue;
        mesh.position.copy(this.cellCenter);
        mesh.position.y = 0;
        mesh.visible = true;
      }
    }
  }
}

export function Butterflies() {
  const group = useRef<THREE.Group>(null);
  const pool = useRef<BugsPool | null>(null);
  const elapsed = useRef(0);
  const reducedMotion = useReducedMotion();

  const heightmap = useMemo(() => sharedHeightTexture(), []);
  const moth = useMemo(() => createMothTexture(), []);
  const geometry = useMemo(() => createBugsGeometry(1), []);
  const set = useMemo(
    () => createBugsMaterial(moth, heightmap, HEIGHTMAP_WORLD),
    [moth, heightmap],
  );
  const uniforms: QuickBugsUniforms = set.uniforms;

  useEffect(() => {
    const current = new BugsPool(group.current!, geometry, set.material);
    pool.current = current;
    return () => {
      pool.current = null;
    };
  }, [geometry, set]);

  useEffect(
    () => () => {
      geometry.dispose();
      set.material.dispose();
      moth.dispose();
    },
    [geometry, set, moth],
  );

  useFrame((_, delta) => {
    elapsed.current += Math.min(delta, 0.05) * (reducedMotion ? 0.15 : 1);
    uniforms.time.value = elapsed.current;
  });

  useFrame((state) => {
    pool.current?.update(state.camera);
  });

  return <group ref={group} name="butterflies" />;
}
