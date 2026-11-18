# Moving to native TypeScript

The app starts from a plain TypeScript entry point with Three.js, Rapier, Koota,
and native HTML/CSS. The forest hub can load and run. The editor and the other
worlds are unavailable until their existing scene code is ported.

## Implemented

- Browser history, pause, settings, input, and HUD use native modules.
- The forest runs a direct Three.js renderer and fixed-step Rapier simulation.
  It uses the existing terrain, water shader, player model, tree asset, and
  portal locations.
- Graphics settings keep PS2 pixel scaling and dithering, render resolution,
  shadows, brightness, and bloom. The app manifest keeps build tooling separate
  from runtime dependencies.

## Remaining game work

- Port the gallery, training grounds, seasonal world, Capital routes, and Warp
  Room routes before enabling their gameplay.
- Finish forest parity for authored scenery, animation transitions, ledge
  movement, camera tools, and portal visuals.
- Port route-specific UI, animation and effects, platform physics, and collision
  events. Verify each scene in the browser before retiring its legacy source.

## Deferred editor work

- Port the scene inspector, asset browser, selection, gizmos, and playback.
  The legacy source stays in the repository for that work.

## Validation

`vp test` runs the essential Vitest suite. Use `vp check`,
`vp test` and `vp build` for project validation.

Tests cover movement/collision against real Rapier, frame timing, animation,
route matching, control bindings, combat, durable progress, inventory and settings.
Scenery snapshots, source-text assertions, detailed layout/balance tests and
editor-only tests were removed. Tests do not transpile or evaluate snippets from
component source. The old TypeScript compiler dependency was removed.

Physics tests run Rapier WASM. Interactive menu behavior, browser history and
WebGL rendering need browser verification as routes move.
