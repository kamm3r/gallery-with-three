# Essential tests

Run `vp test`. All suites use `vite-plus/test`.

Keep coverage on behavior whose failure blocks playing or loses progress:

- Real Rapier player movement, collision, moving platforms and resource cleanup.
- Frame timing, animation pause and native browser navigation.
- Input, rebinding, settings and menu interaction.
- Combat damage/defense, checkpoints, saves and inventory.

Avoid tests that inspect component source, assert exact scenery layouts, lock
artistic choices, or mirror implementation details. Editor migration and its test
coverage are deferred. Add a regression case when fixing an actual gameplay or
lifecycle bug; do not restore broad per-component test scaffolding.
