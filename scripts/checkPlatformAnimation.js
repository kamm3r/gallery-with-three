/** Run on /playground with live PlayerRuntime props and R3F state. */
export function checkPlatformAnimation(runtime, state) {
  const body = runtime.controllerRef.current.body;
  Object.assign(runtime.controlsRef.current, { forward: false, backward: false, left: false, right: false, run: false, jump: false });
  const platform = state.scene.getObjectByName('platform-x');
  const x = platform.position.x;
  body.setTranslation({ x, y: 2.75, z: -6.5 }, true);
  body.setLinvel({ x: 0, y: 0, z: 0 }, true);
  let worldMax = 0, relativeMax = 0, supportedFrames = 0;
  for (let i = 0; i < 360; i++) {
    state.advance(state.clock.elapsedTime + 1 / 60);
    if (i <= 60) continue;
    const controller = runtime.controllerRef.current;
    const velocity = body.linvel();
    worldMax = Math.max(worldMax, Math.hypot(velocity.x, velocity.z));
    relativeMax = Math.max(relativeMax, Math.hypot(controller.relativeVelOnPlane.x, controller.relativeVelOnPlane.z));
    if (controller.isOnPlatform) supportedFrames++;
  }
  if (worldMax < 1 || relativeMax >= .2 || supportedFrames < 290) throw new Error('Platform rider is not stationary relative to its support');
  return { worldMax, relativeMax, supportedFrames };
}
