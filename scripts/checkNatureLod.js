/** Same-camera A/B of actual submitted triangles. Not a display-FPS benchmark.
 * Run in the hub after loading. Temporarily draws every instance at full detail,
 * then restores ECS visibility, including its matrix packing cache.
 */
export function checkNatureLod(state, world, InstanceBatch, updateVisibility) {
  const read = () => ({
    calls: state.gl.info.render.calls,
    triangles: state.gl.info.render.triangles,
  });
  try {
    world.query(InstanceBatch).readEach(([batch]) => {
      for (const mesh of batch.detail) {
        mesh.instanceMatrix.array.set(batch.matrices);
        mesh.instanceMatrix.needsUpdate = true;
        mesh.count = batch.points.length;
        mesh.visible = true;
      }
      for (const mesh of batch.proxy) mesh.visible = false;
    });
    state.gl.render(state.scene, state.camera);
    const fullDetail = read();
    world.query(InstanceBatch).readEach(([batch]) => batch.levels.fill(255));
    updateVisibility(world, state.camera);
    state.gl.render(state.scene, state.camera);
    const optimized = read();
    const reduction = 1 - optimized.triangles / fullDetail.triangles;
    if (reduction < 0.15)
      throw new Error(`LOD/culling saved only ${(reduction * 100).toFixed(1)}% of triangles`);
    return { fullDetail, optimized, triangleReductionPercent: reduction * 100 };
  } finally {
    world.query(InstanceBatch).readEach(([batch]) => batch.levels.fill(255));
    updateVisibility(world, state.camera);
  }
}
