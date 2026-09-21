/** Live /playground test. Accepts PlayerRuntime props and R3F state. */
export function checkCollisionCourse(runtime, state) {
  const body = runtime.controllerRef.current.body;
  const results = [];
  for (const [name, x, z, frames] of [['rough', -31, -19, 180], ['narrow', 38, 11, 240], ['wide', 46, 0, 180], ['stairs', -10.5, -2, 150]]) {
    runtime.hangRef.current.active = false;
    runtime.rollRef.current.active = false;
    runtime.cameraYawRef.current = 0;
    Object.assign(runtime.controlsRef.current, { forward: false, backward: false, left: false, right: false, run: false, jump: false });
    body.setTranslation({ x, y: 1.3, z }, true);
    body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    for (let i = 0; i < 40; i++) state.advance(state.clock.elapsedTime + 1 / 60);
    runtime.controlsRef.current.forward = true;
    let tilt = 0, maxHeight = 0;
    for (let i = 0; i < frames; i++) {
      state.advance(state.clock.elapsedTime + 1 / 60);
      const q = body.rotation();
      tilt = Math.max(tilt, Math.acos(Math.min(1, 1 - 2 * (q.x * q.x + q.z * q.z))) * 180 / Math.PI);
      maxHeight = Math.max(maxHeight, body.translation().y);
    }
    runtime.controlsRef.current.forward = false;
    results.push({ name, position: body.translation(), tilt, maxHeight });
  }
  if (results.some(r => r.tilt > 1 || r.position.y < .9) || results[0].position.z > -29 || results[1].position.z < 8.8 || results[2].position.z > -10 || results[3].maxHeight < 2.5) {
    throw new Error(`Collision course regression: ${JSON.stringify(results)}`);
  }
  return results;
}
