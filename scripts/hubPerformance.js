/** Dev-browser check. Pass the live R3F root state; restores the camera afterward.
 * Measures main-thread streaming stalls, not display FPS or GPU frame time.
 * Run with the game paused, after the hub's initial grass has loaded.
 */
export async function measureGrassStreaming(state, budgetMs = 16.7) {
  const position = state.camera.position.clone();
  const samples = [];
  try {
    for (let i = 0; i < 12; i++) {
      state.camera.position.x = i % 2 ? 9.9 : 10.1;
      const start = performance.now();
      state.advance(state.clock.elapsedTime + 1 / 60);
      await new Promise((resolve) => setTimeout(resolve, 0));
      samples.push(performance.now() - start);
    }
    const measured = samples.slice(2);
    return { samples, budgetMs, pass: Math.max(...measured) < budgetMs, worstMs: Math.max(...measured) };
  } finally {
    state.camera.position.copy(position);
  }
}
