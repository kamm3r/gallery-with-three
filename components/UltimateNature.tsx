import { useFBX } from '@react-three/drei';
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { CuboidCollider, CylinderCollider, RigidBody } from '@react-three/rapier';
import { groundHeight, isDryLand, PLAY_RADIUS, scatter, type ScatterPoint } from '../gameplay/terrain';
import { inPortalGarden, HUB_PORTALS, firstPathDistance } from '../gameplay/hubPortals';
import { useWorld } from 'koota/react';
import { InstanceBatch } from '../gameplay/ecs/traits';
import { simplifyGeometry } from '../gameplay/simplifyGeometry';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const PACK = '/assets/Ultimate Nature Pack - Jun 2019-20260917T180657Z-1-001/Ultimate Nature Pack - Jun 2019/FBX/';
type Specimen = ScatterPoint;
const palette: Record<string, string> = {
  Green: '#537e38', DarkGreen: '#355c2e', Wood: '#65513b',
  Rock: '#7b8175', White: '#d2d5bb', Black: '#48473c',
};

// Bake the FBX's centimetres, transforms, and ground pivot into shared
// geometry once. Every specimen then shares its geometry and materials.
export function NatureBatch({ model, points, tree = false, leafColor }: { model: string; points: Specimen[]; tree?: boolean; leafColor?: string }) {
  const world = useWorld();
  const group = useRef<THREE.Group>(null);
  const source = useFBX(`${PACK}${model}.fbx`);
  const parts = useMemo(() => {
    source.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(source);
    const size = bounds.getSize(new THREE.Vector3());
    const center = bounds.getCenter(new THREE.Vector3());
    const factor = 1 / (tree ? size.y : Math.max(size.x, size.y, size.z));
    const normalize = new THREE.Matrix4().makeScale(factor, factor, factor)
      .multiply(new THREE.Matrix4().makeTranslation(-center.x, -bounds.min.y, -center.z));
    const geometries: THREE.BufferGeometry[] = [];
    source.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      const materials = (Array.isArray(object.material) ? object.material : [object.material]) as THREE.MeshPhongMaterial[];
      const geometry = object.geometry.index ? object.geometry.toNonIndexed() : object.geometry.clone();
      geometry.applyMatrix4(new THREE.Matrix4().multiplyMatrices(normalize, object.matrixWorld));
      const colors = new Float32Array(geometry.getAttribute('position').count * 3);
      const groups = geometry.groups.length ? geometry.groups : [{ start: 0, count: colors.length / 3, materialIndex: 0 }];
      for (const group of groups) {
        const material = materials[group.materialIndex ?? 0];
        const color = new THREE.Color(palette[material.name] ?? material.color ?? '#ffffff');
        if (leafColor && /green/i.test(material.name)) color.set(leafColor);
        for (let i = group.start; i < group.start + group.count; i++) color.toArray(colors, i * 3);
      }
      for (const attribute of Object.keys(geometry.attributes)) if (attribute !== 'position' && attribute !== 'normal') geometry.deleteAttribute(attribute);
      geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      geometry.clearGroups();
      geometries.push(geometry);
    });
    const geometry = mergeGeometries(geometries)!;
    for (const part of geometries) part.dispose();
    return [{ geometry, low: simplifyGeometry(geometry), material: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .95 }) }];
  }, [source, tree, leafColor]);
  useLayoutEffect(() => {
    const meshes = group.current!.children as THREE.InstancedMesh[];
    const matrices = new Float32Array(points.length * 16);
    const transform = new THREE.Object3D();
    points.forEach((point, i) => {
      transform.position.set(point.x, point.y, point.z);
      transform.rotation.set(0, point.rotation, 0);
      transform.scale.setScalar(point.scale);
      transform.updateMatrix();
      transform.matrix.toArray(matrices, i * 16);
    });
    const bounds = new THREE.Box3();
    for (const part of parts) { part.geometry.computeBoundingBox(); bounds.union(part.geometry.boundingBox!); }
    const sphere = bounds.getBoundingSphere(new THREE.Sphere());
    const entity = world.spawn(InstanceBatch({
      points, matrices, levels: new Uint8Array(points.length),
      detail: meshes.filter(mesh => mesh.name === 'nature-detail'),
      proxy: meshes.filter(mesh => mesh.name === 'nature-lod'),
      radius: sphere.radius, centerY: sphere.center.y,
      near: tree ? 44 : 26, far: tree ? 155 : model.startsWith('Plant') ? 55 : 95, shadows: true,
    }));
    return () => entity.destroy();
  }, [world, points, parts, tree, model]);
  useEffect(() => () => {
    for (const part of parts) {
      part.geometry.dispose();
      part.low.dispose();
      for (const material of Array.isArray(part.material) ? part.material : [part.material]) material.dispose();
    }
  }, [parts]);
  return <group ref={group}>{parts.flatMap((part, index) => [
    <instancedMesh key={`${index}-detail`} name='nature-detail' args={[part.geometry, part.material, points.length]} count={0} frustumCulled={false} castShadow receiveShadow dispose={null} />,
    <instancedMesh key={`${index}-low`} name='nature-lod' args={[part.low, part.material, points.length]} count={0} frustumCulled={false} receiveShadow dispose={null} />,
  ])}</group>;
}

function specimen(x: number, z: number, scale: number, rotation = 0): Specimen {
  return { x, y: groundHeight(x, z) - 0.03, z, scale, rotation, tint: 0.5 };
}

const treeGroups = [
  { model: 'CommonTree_1', points: [specimen(-9, -8, 7.2), specimen(8, -14, 8.5, 1), specimen(-12, 8, 7.5, 2), ...scatter(14, 22, 53, 601, 7, 11)] },
  { model: 'BirchTree_1', points: [specimen(-6, -14, 8), specimen(14, 5, 8, 1), specimen(9, 13, 7), ...scatter(16, 17, 48, 602, 7, 10)] },
  { model: 'PineTree_1', points: scatter(22, 28, 62, 603, 9, 14) },
  { model: 'Willow_1', points: [specimen(-12, -1, 9, 1.1), specimen(-20, 14, 10)] },
];
const plantGroups = [
  { model: 'Bush_1', points: scatter(38, 14, 43, 604, 1.1, 2.1) },
  { model: 'Plant_1', points: scatter(95, 14, 43, 605, 0.5, 1.1) },
  { model: 'Plant_2', points: scatter(80, 14, 40, 606, 0.45, 0.9) },
  { model: 'WoodLog_Moss', points: [specimen(-8, 3, 3.8, 0.4), specimen(8, 8, 3.3, -0.8), specimen(-15, -9, 4, 1)] },
];

treeGroups[0].points.push(...scatter(45, 60, 125, 621, 7, 12));
treeGroups[1].points.push(...scatter(40, 55, 122, 622, 7, 11));
treeGroups[2].points.push(...scatter(65, 65, 136, 623, 10, 16));
treeGroups[3].points.push(specimen(66, 46, 8));
// Broken groves hide the optional paintings, with gaps wide enough to enter.
for (const portal of HUB_PORTALS.slice(1)) {
  for (const [i, angle] of [-2.5,-1.45,-0.45,0.65,1.7].entries()) {
    const bearing = portal.yaw+angle;
    const x = portal.x+Math.sin(bearing)*8;
    const z = portal.z+Math.cos(bearing)*8;
    treeGroups[i%2].points.push(specimen(x,z,8+i%3,bearing));
    plantGroups[0].points.push(specimen(x*0.02+portal.x*0.98+Math.sin(bearing)*6,z*0.02+portal.z*0.98+Math.cos(bearing)*6,1.7,bearing));
  }
}
for (const group of [...treeGroups, ...plantGroups]) {
  group.points = group.points.filter((point) => isDryLand(point.x, point.z) && !inPortalGarden(point.x, point.z) && firstPathDistance(point.x, point.z)>2.5);
  useFBX.preload(`${PACK}${group.model}.fbx`);
}

function LogSeats() {
  const source = useFBX(`${PACK}WoodLog_Moss.fbx`);
  const surface = useMemo(() => {
    source.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(source);
    const size = bounds.getSize(new THREE.Vector3());
    // This mesh has a recessed centre. Seat above its rim, not on the
    // interior surface a downward centre ray would hit.
    return size.y/Math.max(size.x,size.y,size.z);
  }, [source]);
  return <>{plantGroups.find(group=>group.model==='WoodLog_Moss')!.points.map((point,i)=>{
    const yaw=point.rotation+Math.PI/2;
    // Measured SitDown end pose at character scale .82: pelvis is .467 up
    // and .345 behind the model origin; allow .10 for the lower hips.
    return <group key={i} name={`log-seat-${i}`} position={[
      point.x+Math.sin(yaw)*0.345, point.y+surface*point.scale-0.367, point.z+Math.cos(yaw)*0.345,
    ]} rotation={[0,yaw,0]} />;
  })}</>;
}

export function UltimateNature() {
  return <>
    <LogSeats />
    {treeGroups.map(({ model, points }) => <group key={model}>
      <NatureBatch model={model} points={points} tree />
      {points.filter((point) => Math.hypot(point.x, point.z) < PLAY_RADIUS + 1).map((point, i) => <RigidBody key={i} type='fixed' colliders={false} position={[point.x, point.y, point.z]}>
        <CylinderCollider args={[point.scale * 0.24, point.scale * 0.055]} position={[0, point.scale * 0.24, 0]} />
      </RigidBody>)}
    </group>)}
    {plantGroups.map(({ model, points }) => <group key={model}>
      <NatureBatch model={model} points={points} />
      {(model.startsWith('Rock') || model.startsWith('Wood')) && points.map((point, i) => <RigidBody key={i} type='fixed' colliders={false} position={[point.x, point.y, point.z]} rotation={[0, point.rotation, 0]}>
        {model.startsWith('Wood')
          ? <CuboidCollider args={[point.scale * 0.14, point.scale * 0.1, point.scale * 0.45]} position={[0, point.scale * 0.12, 0]} />
          : <CylinderCollider args={[point.scale * 0.4, point.scale * 0.22]} position={[0, point.scale * 0.4, 0]} />}
      </RigidBody>)}
    </group>)}
  </>;
}
