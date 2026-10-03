/** Live /playground test. Accepts PlayerRuntime props and R3F state. */
export function checkCollisionCourse(runtime, state) {
  const body = runtime.controllerRef.current.body;
  const results = [];
  // [name, startX, startZ, frames]: rough domes, step lane (.30m), 12-degree ramp.
  for (const [name, x, z, frames] of [
    ["rough", 16, 20, 180],
    ["steps", -4.5, 20, 240],
    ["slope", -27, 20, 180],
  ]) {
    runtime.hangRef.current.active = false;
    runtime.rollRef.current.active = false;
    runtime.cameraYawRef.current = 0;
    Object.assign(runtime.controlsRef.current, {
      forward: false,
      backward: false,
      left: false,
      right: false,
      run: false,
      jump: false,
    });
    body.setTranslation({ x, y: 1.3, z }, true);
    runtime.controllerRef.current.velocity.set(0, 0, 0);
    for (let i = 0; i < 40; i++) state.advance(state.clock.elapsedTime + 1 / 60);
    runtime.controlsRef.current.forward = true;
    let tilt = 0,
      maxHeight = 0;
    for (let i = 0; i < frames; i++) {
      state.advance(state.clock.elapsedTime + 1 / 60);
      const q = body.rotation();
      tilt = Math.max(
        tilt,
        (Math.acos(Math.min(1, 1 - 2 * (q.x * q.x + q.z * q.z))) * 180) / Math.PI,
      );
      maxHeight = Math.max(maxHeight, body.translation().y);
    }
    runtime.controlsRef.current.forward = false;
    results.push({ name, position: body.translation(), tilt, maxHeight });
  }
  if (
    results.some((r) => r.tilt > 1 || r.position.y < 0.9) ||
    results[0].position.z > 14 ||
    results[1].maxHeight < 1.5 ||
    results[2].position.z > 8
  ) {
    throw new Error(`Movement park regression: ${JSON.stringify(results)}`);
  }
  return results;
}
