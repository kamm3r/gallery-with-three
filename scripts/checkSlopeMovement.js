/** Dev-browser regression check. Run in /playground with PlayerRuntime props
 * and the live R3F state. Walks up each ramp, then releases movement. */
export function checkSlopeMovement(runtime, state) {
  const body = runtime.controllerRef.current.body;
  const results = [];
  for (const [x, angle] of [[-6.5, 10], [0, 20], [6.5, 35]]) {
    runtime.hangRef.current.active = false;
    runtime.rollRef.current.active = false;
    runtime.cameraYawRef.current = 0;
    Object.assign(runtime.controlsRef.current, { forward: false, backward: false, left: false, right: false, run: false, jump: false });
    body.setTranslation({ x, y: 1.2, z: 7 }, true);
    body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    body.setRotation({ x: 0, y: 1, z: 0, w: 0 }, true);
    for (let i = 0; i < 45; i++) state.advance(state.clock.elapsedTime + 1 / 60);
    runtime.controlsRef.current.forward = true;
    let tilt = 0, contactChanges = 0;
    let grounded = runtime.controllerRef.current.isOnGround;
    for (let i = 0; i < 150; i++) {
      if (i === 100) runtime.controlsRef.current.forward = false;
      state.advance(state.clock.elapsedTime + 1 / 60);
      const q = body.rotation();
      tilt = Math.max(tilt, Math.acos(Math.min(1, 1 - 2 * (q.x*q.x + q.z*q.z))) * 180 / Math.PI);
      if (grounded !== runtime.controllerRef.current.isOnGround) contactChanges++;
      grounded = runtime.controllerRef.current.isOnGround;
    }
    results.push({ angle, tilt, contactChanges });
  }
  if (results.some(result => result.tilt > 1 || result.contactChanges > 2)) {
    throw new Error(`Slope instability: ${JSON.stringify(results)}`);
  }
  return results;
}
