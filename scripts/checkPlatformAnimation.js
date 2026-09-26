/** Run on /playground with live PlayerRuntime props and R3F state. */
export function checkPlatformAnimation(runtime, state) {
  const body = runtime.controllerRef.current.body;
  Object.assign(runtime.controlsRef.current, {
    forward: false,
    backward: false,
    left: false,
    right: false,
    run: false,
    jump: false,
  });
  const platform = state.scene.getObjectByName("platform-x");
  const x = platform.position.x;
  body.setTranslation({ x, y: 2.75, z: -19 }, true);
  runtime.controllerRef.current.velocity.set(0, 0, 0);
  let worldMax = 0,
    relativeMax = 0,
    supportedFrames = 0;
  let previous = body.translation();
  for (let i = 0; i < 360; i++) {
    state.advance(state.clock.elapsedTime + 1 / 60);
    // World speed from displacement: the platform carry isn't in velocity.
    const now = body.translation();
    const worldSpeed = Math.hypot(now.x - previous.x, now.z - previous.z) * 60;
    previous = now;
    if (i <= 60) continue;
    const controller = runtime.controllerRef.current;
    worldMax = Math.max(worldMax, worldSpeed);
    relativeMax = Math.max(
      relativeMax,
      Math.hypot(controller.relativeVelOnPlane.x, controller.relativeVelOnPlane.z),
    );
    if (controller.isOnPlatform) supportedFrames++;
  }
  if (worldMax < 1 || relativeMax >= 0.2 || supportedFrames < 290)
    throw new Error("Platform rider is not stationary relative to its support");
  return { worldMax, relativeMax, supportedFrames };
}
