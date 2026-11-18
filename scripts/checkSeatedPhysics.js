/** Dev-browser regression check after sitting. Accept PlayerRuntime props and
 * the live R3F state, like the grass streaming check. Advances 30 game seconds.
 */
export function checkSeatedPhysics(runtime, state) {
  const body = runtime.controllerRef.current.body;
  if (!runtime.seatRef.current.active) throw new Error("Sit on a log before running this check");
  const start = { ...body.translation() };
  runtime.controlsRef.current.rollPress++;
  runtime.controlsRef.current.jumpPress++;
  let drift = 0;
  for (let i = 0; i < 1800; i++) {
    state.advance(state.clock.elapsedTime + 1 / 60);
    const position = body.translation();
    drift = Math.max(
      drift,
      Math.hypot(position.x - start.x, position.y - start.y, position.z - start.z),
    );
  }
  if (
    drift > 0.001 ||
    body.isDynamic() ||
    body.collider(0).isEnabled() ||
    runtime.rollRef.current.active
  ) {
    throw new Error(
      `Seated physics regression: drift=${drift}, dynamic=${body.isDynamic()}, collision=${body.collider(0).isEnabled()}`,
    );
  }
  runtime.controlsRef.current.interactPress++;
  for (let i = 0; i < 90; i++) state.advance(state.clock.elapsedTime + 1 / 60);
  if (
    runtime.seatRef.current.active ||
    !body.isDynamic() ||
    !body.collider(0).isEnabled() ||
    runtime.rollRef.current.active
  ) {
    throw new Error("Standing did not restore physics cleanly, or a buffered roll fired");
  }
  return { simulatedSeconds: 30, drift, passed: true };
}
