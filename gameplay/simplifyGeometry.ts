import { BufferGeometry, Float32BufferAttribute } from 'three';

/** Vertex-cluster LOD for flat-colour nature meshes. Keeps material groups. */
export function simplifyGeometry(source: BufferGeometry, divisions = 9) {
  source.computeBoundingBox();
  const box = source.boundingBox!;
  const size = [box.max.x - box.min.x, box.max.y - box.min.y, box.max.z - box.min.z];
  const position = source.getAttribute('position');
  const colors = source.getAttribute('color');
  const clusters = new Map<string, { sum: number[]; color: number[]; count: number; id: number }>();
  const vertexCluster: Array<{ sum: number[]; color: number[]; count: number; id: number }> = [];
  for (let i = 0; i < position.count; i++) {
    const p = [position.getX(i), position.getY(i), position.getZ(i)];
    const color = colors ? [colors.getX(i), colors.getY(i), colors.getZ(i)] : [1, 1, 1];
    const key = p.map((value, axis) => Math.round(value / Math.max(size[axis] / divisions, .0001))).join(',') + ':' + color.join(',');
    let cluster = clusters.get(key);
    if (!cluster) { cluster = { sum: [0, 0, 0], color, count: 0, id: clusters.size }; clusters.set(key, cluster); }
    for (let axis = 0; axis < 3; axis++) cluster.sum[axis] += p[axis];
    cluster.count++;
    vertexCluster.push(cluster);
  }
  const output: number[] = [];
  const outputColors: number[] = [];
  const geometry = new BufferGeometry();
  const count = source.index?.count ?? position.count;
  const groups = source.groups.length ? source.groups : [{ start: 0, count, materialIndex: 0 }];
  for (const group of groups) {
    const start = output.length / 3;
    const seen = new Set<string>();
    for (let i = group.start; i + 2 < Math.min(count, group.start + group.count); i += 3) {
      const corners = [0, 1, 2].map(n => vertexCluster[source.index ? source.index.getX(i + n) : i + n]);
      if (new Set(corners.map(c => c.id)).size < 3) continue;
      const key = corners.map(c => c.id).sort((a, b) => a - b).join(',');
      if (seen.has(key)) continue;
      seen.add(key);
      for (const corner of corners) for (let axis = 0; axis < 3; axis++) {
        output.push(corner.sum[axis] / corner.count);
        if (colors) outputColors.push(corner.color[axis]);
      }
    }
    geometry.addGroup(start, output.length / 3 - start, group.materialIndex);
  }
  geometry.setAttribute('position', new Float32BufferAttribute(output, 3));
  if (colors) geometry.setAttribute('color', new Float32BufferAttribute(outputColors, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}
