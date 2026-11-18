# Graphics verification, 2026-10-07

## Surface depth follow-up

The burial terrace had two equal-depth paving owners: its floor tiles and the
crypt ceiling. The boss approach also overlapped the arena slab. The ceiling now
ends inside the floor thickness, and the arena render slab fits around the
approach tiles. The crypt underside height and full boss collision slab are
preserved.

Roof and planter copings own their visible top faces. Footings and arch trim
embed below the paving, overlapping parapets have distinct outer skins, and
sloped floor skirts taper beneath their unchanged walkable surfaces. Window
panels continue under their reveals. These changes repair the authored geometry
without lifting fixtures away from their supports.

Ground moss and paving inlays use negative polygon offset, with depth testing
retained, depth writing disabled and no shadow casting. Rose glass also has a
small negative depth bias. Three.js describes polygon offset as adjusting fragment
depth before depth testing and writing in its
[Material documentation](https://threejs.org/docs/pages/Material.html).
Static batch keys and output meshes now preserve render order, so inlays remain
after the structural paving when merged.

[Before: striped garden paving](ashen-parish-z-fighting-before.png) ·
[After: repaired garden paving](ashen-parish-z-fighting-fixed.png)

Six new tests cover floor ownership, roof and planter caps, parapet skins,
overlay depth settings and batch order. All 276 Node tests, typecheck and build
pass. vp check has zero errors and the existing 130 warnings; built-in vp test
retains the Node/Vitest runner mismatch. Native garden, court, cloister, arcade
and boss-approach views were inspected. Existing spatial batches, instance
culling and graphics settings are retained; this pass makes no FPS claim.

## Fixture placement follow-up

Mesh-interior checks found eight braziers embedded in arch piers, court columns,
crypt walls and foundry furnaces. Their new placements clear actual rendered
masonry rather than just its bounding boxes. House windows meet their facades;
lantern plates and banner brackets penetrate the supporting wall, banner headers
meet their rods, and every branch starts inside its tapered tree trunk. Moss
triangles conform to the floor and are discarded over the cutaways. Wall ivy no
longer drifts away from its surface, and grass wind keeps the roots fixed.

All fourteen brazier bodies and ten short columns have shared physics/navigation
footprints. A native Rapier walking probe climbed onto the refuge bowl at a foot
height of approximately 0.5125 m, verifying its body participates in collision.
Temporary probe health, camera and held inputs were restored afterward.

Native canvas views were inspected at the entrance, court, foundry, crypt and
house facade. Native saved screenshot capture recovered after resuming the
preview; see [the refuge fire and entrance fixtures](ashen-parish-fixtures-fixed.png).
The refuge fire body is 1 m high, with additional transparent space
for bounded tips. Lower fire-light intensity, smaller smoke and orange/gold
colour contrast replace the pale oversized glow. Static brazier hardware and
the added coals are batched, with 48 visible fixture meshes including the two
flame batches. One textured construction probe measured 339.4 ms for scenery
(405 visible meshes) and 6.7 ms for atmosphere. These are not hardware FPS claims.

All 267 Node tests, typecheck and build pass; vp check has zero errors and the
130 existing warnings. The eight new placement tests cover the actual symptoms.
Built-in vp test still rejects the 46 node:test files as missing Vitest suites;
the correct gameplay test command is vp run test.

## Fire volume and colour follow-up

The braziers now contain a 3D noise field sampled through instanced boxes, with
16 bounded ray steps and two noise octaves. The field stays fixed in the world
as the camera moves. Front-shell depth testing keeps the flame visible above
the coals when viewed from above; a camera inside the volume uses the exit shell.
Single-pass materials retain the two instanced flame submissions. This costs
more fragment work than the previous billboard; no hardware FPS claim is made.

Warm fire now runs from orange fringes to a smaller gold core;
funeral fire uses deep blue edges and a cyan core. Only the hottest region reaches
high bloom levels. The emitter height, bounded flame tips, game clock, reduced
motion, static instance matrices, particle settings and light budget are retained.
Low-density fringes are eroded before integration and very faint fragments are
discarded to avoid the soft red haze observed in the native close-up.

`scripts/checkParishFire.js` reads actual GPU pixels across 1,680 fixed-time,
multi-angle renders. All have transparent top clearance and visible heights
below the bowl diameter. Six additional perspective views cover side and overhead
angles; reduced-motion images match at times 0 and 40. Native canvas captures
were inspected under AgX from front, side, rear and overhead. All 267 Node tests
and the production build pass; `vp check` retains zero errors and 130 existing
warnings. Use `vp run test` for the project's `node:test` suite.

## Architectural support and fire follow-up

Support checks now cover actual masonry contact for finial bases and candles,
pavement under every short decorative column and the return portal, roof/wall
contact, the cloister's projecting facade, sloped stair foundations and piers
meeting their stringers. Scattered leaves/grass must have a floor under their
root positions. Five original architectural checks and the scattered-detail
check failed before their respective repairs; all seven support tests now pass.
Piers use the shared prop footprints for rendering, Rapier and navigation,
including their full height. The clipped court corner remains a cutaway; its
unsupported decorative column moved to pavement.

The fire shader adapts interpolated fractal noise and upward domain distortion
from [the supplied explanation](https://greentec.github.io/shadertoy-fire-shader-en/).
Three noise octaves erode the flame outline into moving tongues; per-instance
phase variation prevents identical braziers. The white core is limited to the
coal bed. Warm/blue flames remain **two instanced submissions**, with no additional
textures, CPU deformation or per-frame buffer uploads. ECS timing, particle
detail, reduced motion and the four-light budget are retained.

Native WebGL verification linked both flame programs without errors. In an
isolated 128x224 render at the same sampled time, the replacement produced 17
upper rows containing split tongues versus 5 for the old crossed-plane cone.
Reduced-motion renders at two different times matched pixel-for-pixel. These
fixture results verify noise animation and pause behavior, not artistic quality
or hardware FPS. Live canvas frames were inspected through native evaluation;
native saved screenshot capture still fails, so no shareable capture is attached.

Textured scenery construction took **250.3 ms** in one native-browser probe;
392 visible scenery meshes compare with 388 in the prior prop follow-up. The
full 258-test Node suite, typecheck and build pass. vp check retains zero errors
and the existing 130 warnings. Built-in vp test still reports no Vitest suite
for the 45 node:test files; use `vp run test` for this project's gameplay suite.

## Refuge prop follow-up

The canopy now has a pitched fabric surface with folds, pinned wind anchors,
a scalloped hem and a braced timber frame. Its four corner posts use the shared
physics/navigation prop list. The three house doors use beveled arched planks,
hinge straps, studs, ring handles and stone thresholds. Wood and woven-cloth
textures are shared 256-pixel procedural maps, with no new downloads or per-frame
canvas painting. Static fittings remain batched and cleanup releases resources once.

Both screenshot defects reproduced in geometry checks before the changes:
unsupported canopy corners and rectangular door corners extending into their
arches. The replacement passes those checks and keeps fabric wind weights at
zero along its frame. All 251 gameplay tests, typecheck and production build
pass. Native browser frame advances verified actual Rapier walking under the
canopy from (-9, 0, 135) to approximately (-9, 0, 127.62); all 91 shader programs
linked and WebGL reported no error. Native screenshot capture failed repeatedly,
so visual pixel comparison remains unverified. Textured scenery construction
took 207.6–267.1 ms across two probes in that preview; the traversal count found
388 visible scenery meshes. These are construction/submission checks, not hardware
FPS measurements.

## Loading and respawn follow-up

In the same T3 browser, `buildParishEnvironment(true)` took **7,890 ms** before
the fix and **179.7 ms** afterward, with texture generation enabled in both
calls. Static batching called `Material.toJSON()` for each source mesh; that
also encoded its shared texture images and copied their data into bucket keys.
It now caches each material's description and uses a compact material id in
the keys. Equivalent materials still batch together; spatial cells, shadows,
bounds and resource cleanup remain covered by tests. The regression case went
from 100 serializations of one shared material to one.

The old death/retry replaced the Canvas, WebGLRenderer and environment. Its
first restored-health sample arrived at 15,768.9 ms in the development preview,
before preparation finished. Development StrictMode constructed the scenery
twice. Retry now resets the existing ECS combat record and reconciles enemies
and projectiles while retaining the renderer, physics world, geometry and
models. The first 5 ms polling sample after the retry click showed restored
health and a closed result screen at **30 ms**, with the same canvas, renderer,
environment, encounter and combat references, and zero shader compilation calls.
This is a state/UI commit measurement, not time to a presented playable frame.

The shared preview sometimes withheld animation-frame callbacks even with
`document.hidden === false`; the old preparation wait could then remain pending
indefinitely. Each wait now falls back after 100 ms and cancels the missing
callback. No total initial-load or hardware FPS claim is made from this probe.
In-place reset checks verified the kiln checkpoint (-5, 12, 30), restored enemy
health/flasks, removed projectiles, retained shortcuts/offerings and cleared the
Warden's old sinking death pose. Explicit game-frame advances verified sword
and roll animations and a 2.06 m walk using the actual Rapier controller.

Validation: all 249 Node tests pass, including shared-material serialization,
withheld-frame preparation, retained ECS combat identity and enemy collider
restoration before distance culling. Typecheck and production build pass.
`vp check` retains the existing warnings; built-in `vp test` uses Vitest and
rejects the 44 `node:test` files as having no suite. The package's `vp run test`
command runs the intended test suite.

## Earlier graphics work

The screenshot repairs cover the east stair parapets, the mid-court arcade
intersection, floating high-walk banners and the bell hanger. Wall rendering
and collision follow the floor slopes; ivy and edge rubble use those slopes
too. Low/Medium/High/Ultra presets and independent controls are saved under
the existing settings key. Individual changes select Custom. Existing movement
bindings and legacy render scale are retained.

## Measurement

The initial T3 preview probe at 960×600 and DPR 1.5 recorded 15 visible frames
over roughly three seconds: median 124.9 ms and worst 754.6 ms. This establishes
the reported slow/stuttering behavior in that preview. A later attempted lower
DPR comparison was invalid because the existing adaptive controller overrode
the requested DPR. The native preview disconnected before a matching after
probe; its numbers are **not** a controlled before/after comparison.

Afterward, a local headless Chromium browser used real requestAnimationFrame,
hardware WebGL on AMD Radeon RX 7900 XTX (radeonsi navi31 ACO), a 960×600
viewport and the development build. Each three-second route teleported the
player to (48, 5.25, 120), then walked forward up the aqueduct stair. Dynamic
resolution was disabled for comparisons; the new preparation step had finished.
Each configuration ran twice. Rendering, Rapier movement, ECS simulation and
post-processing remained active. Results were measured from the game's bounded
frame-interval buffer, not from manually advancing synthetic frames.

| Preset | DPR  | Samples per run | FPS   | p99 / worst | Frames >50 ms | Max advance CPU, first / repeat | End-of-route submissions |
| ------ | ---- | --------------- | ----- | ----------- | ------------- | ------------------------------- | ------------------------ |
| Medium | 1    | 181             | 60.00 | 16.8 ms     | 0 / 0         | 8.4 / 4.9 ms                    | 380                      |
| Low    | 0.75 | 181             | 60.00 | 16.8 ms     | 0 / 0         | 3.0 / 3.6 ms                    | 335                      |
| High   | 1.5  | 181             | 60.00 | 16.8 ms     | 0 / 0         | 5.0 / 4.9 ms                    | 380                      |

These short runs validate this route on this machine. They do not establish
minimum hardware, GPU frame time, long-session behavior or worst-case boss
performance. A separate six-second active Warden check at 1280×800 and DPR
0.875 recorded 360 retained samples at 60.00 FPS, p99/worst 16.8 ms, zero
frames over 50 ms and a 7.5 ms maximum advance CPU duration. The player took
damage, confirming live combat. This is a short encounter sample.
One additional shader program appeared during the first Medium
route, without a >50 ms frame; preparation does not precompile every possible
future variant. Initial loading and preset preparation time were excluded.

## Verified changes

- The resolution controller now accepts sustained visible frames up to 500 ms;
  it previously discarded anything over 120 ms, including the slow preview
  samples. Background gaps remain ignored. Menus preserve the current scale.
- HUD snapshots no longer rerender the main parish scenery, player, enemy or
  Warden views. Static environment buffers remain mounted.
- Decorative particles occupy spatial cells with conservative shader-motion
  bounds. Frustum culling can reject offscreen groups. Foliage and particle
  quality change counts/draw ranges without rebuilding buffers.
- Texture initialization, asynchronous shader compilation and two zero-delta
  preparation frames run behind an overlay. Controls and the render loop stay
  suspended during preparation. Shadow resolution and post effects are real
  renderer settings.

Browser assertions checked preset/custom behavior, persistence across reload,
512-pixel low shadows, disabled shadows and particles, and unchanged game time,
player position, enemy state and parish animation time during a paused graphics
change. An adapted DPR of 0.875 survived both opening and closing the menu.
An actual Rapier-controller walk through the middle ascent reached
(51.22, 14.00, 64.00). No page or shader errors were observed. Automated tests cover graphics
validation/migration, slow-frame adaptation, bounded telemetry, particle motion
bounds, stable quality buffers, slope geometry and support placement.

Implementation references: [Three WebGLRenderer](https://threejs.org/docs/pages/WebGLRenderer.html)
for compileAsync/initTexture; [R3F performance pitfalls](https://r3f.docs.pmnd.rs/advanced/pitfalls)
for avoiding rapid React updates and repeated resource creation;
[R3F scaling performance](https://r3f.docs.pmnd.rs/advanced/scaling-performance)
for instancing and bounded resolution changes. Visibility culling is distinct
from occlusion culling: architecture behind a wall can still render if its
cell intersects the camera frustum or the shadow camera.
