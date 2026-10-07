/** Dev-browser regression check. Run in /playground with PlayerRuntime props
 * and the live R3F state. Walks up each ramp, then releases movement. */
export function checkSlopeMovement(runtime, state) {
  const body = runtime.controllerRef.current.body;
  const results = [];
  // 12/25/40-degree lanes, entries at z=16 approached from z=20.
  for (const [x, angle] of [
    [-27, 12],
    [-23, 25],
    [-19, 40],
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
    body.setTranslation({ x, y: 1.2, z: 20 }, true);
    runtime.controllerRef.current.velocity.set(0, 0, 0);
    body.setRotation({ x: 0, y: 1, z: 0, w: 0 }, true);
    for (let i = 0; i < 45; i++) state.advance(state.clock.elapsedTime + 1 / 60);
    runtime.controlsRef.current.forward = true;
    let tilt = 0,
      contactChanges = 0;
    let grounded = runtime.controllerRef.current.isOnGround;
    for (let i = 0; i < 150; i++) {
      if (i === 100) runtime.controlsRef.current.forward = false;
      state.advance(state.clock.elapsedTime + 1 / 60);
      const q = body.rotation();
      tilt = Math.max(
        tilt,
        (Math.acos(Math.min(1, 1 - 2 * (q.x * q.x + q.z * q.z))) * 180) / Math.PI,
      );
      if (grounded !== runtime.controllerRef.current.isOnGround) contactChanges++;
      grounded = runtime.controllerRef.current.isOnGround;
    }
    results.push({ angle, tilt, contactChanges });
  }
  if (results.some((result) => result.tilt > 1 || result.contactChanges > 2)) {
    throw new Error(`Slope instability: ${JSON.stringify(results)}`);
  }
  // Downhill leg: the 40-degree lane at run speed. Without ground snapping
  // the body outruns the slope and isOnGround flickers every few frames.
  runtime.hangRef.current.active = false;
  runtime.rollRef.current.active = false;
  runtime.cameraYawRef.current = Math.PI;
  Object.assign(runtime.controlsRef.current, {
    forward: false,
    backward: false,
    left: false,
    right: false,
    run: false,
    jump: false,
  });
  body.setTranslation({ x: -19, y: 4.3, z: 12.8 }, true);
  runtime.controllerRef.current.velocity.set(0, 0, 0);
  body.setRotation({ x: 0, y: 1, z: 0, w: 0 }, true);
  for (let i = 0; i < 45; i++) state.advance(state.clock.elapsedTime + 1 / 60);
  runtime.controlsRef.current.forward = true;
  runtime.controlsRef.current.run = true;
  let downhillChanges = 0;
  let downhillGrounded = runtime.controllerRef.current.isOnGround;
  for (let i = 0; i < 150; i++) {
    if (i === 100) {
      runtime.controlsRef.current.forward = false;
      runtime.controlsRef.current.run = false;
    }
    state.advance(state.clock.elapsedTime + 1 / 60);
    if (downhillGrounded !== runtime.controllerRef.current.isOnGround) downhillChanges++;
    downhillGrounded = runtime.controllerRef.current.isOnGround;
  }
  results.push({ angle: -40, tilt: 0, contactChanges: downhillChanges });
  if (downhillChanges > 4) {
    throw new Error(`Downhill instability: ${JSON.stringify(results)}`);
  }
  return results;
}
