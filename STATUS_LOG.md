# Status log

## 2026-09-27 14:30 EEST — revised trees and live Leva lab

The proving grounds now show five daylight trees and five Halloween partners.
Four species are fixed references; the gold-ringed pair at the west end updates
from Leva's **Procedural trees** controls. Species, seed, width, height, lobe
size, and density change both seasonal versions. **New seed** and **Reset shape**
are available, and **Tree lab** teleports between the live trees. The revised
generator gives each deciduous crown a smaller core and an outline formed by
branch clusters; the evergreen uses staggered whorls. Branch coordinates now
scale once with the shape controls. The forest and Halloween world still use
their existing trees.

The [paired overview](docs/custom-tree-variants-preview.png), daylight
[front](docs/custom-trees-preview.png), [rear](docs/custom-trees-rear-preview.png),
and [side](docs/custom-tree-side-preview.png), Halloween
[front](docs/halloween-trees-preview.png) and [rear](docs/halloween-trees-rear-preview.png),
and [live lab controls](docs/procedural-tree-leva-preview.png) were captured in
headless Chromium. The
[previous silhouette](docs/custom-trees-before-shape-revision.png) shows the
rounder core before this revision. An interactive browser check changed seed,
species, and density, then reset shape: both live versions regenerated, the
fixed references kept their geometry, and no page errors occurred.

| Check              | Result                                               |
| ------------------ | ---------------------------------------------------- |
| `vp check`         | Pass: 0 errors, 130 existing warnings.               |
| `vp run typecheck` | Pass.                                                |
| `vp run test`      | Pass: 153/153, including five procedural tree tests. |
| `vp build`         | Pass: playground chunk 39.17 kB raw / 14.54 kB gzip. |

The ten visible foliage meshes total **209,024 triangles**; wood adds
**11,760 triangles**. Five day/Halloween pairs share crown geometry within
each pair. The eight fixed references alone contain **164,864 foliage
triangles**, an average of 20,608 per tree. At that detail, replacing all 340
Halloween tree placements would create roughly **7.0 million foliage
triangles before culling**. These are mesh counts and a projection, not frame
rate measurements. A production swap still needs distance LOD, instancing or
batching, and measured FPS/GPU/memory comparisons on target hardware. The
test-zone revision does not change production tree rendering.

## 2026-09-27 08:18 EEST — procedural Ghibli-style tree prototypes

The eight test-zone trees now come from a deterministic, seeded generator in
`src/gameplay/proceduralTrees.ts`. Four species profiles set the broad shape;
foliage clusters and supporting limbs grow around the trunk, with staggered
whorls for the evergreen. Each Halloween tree uses its daylight partner's seed
and crown, plus procedurally placed bare tips and a smaller, seasonal canopy.
The four-band painted foliage shader remains in use. The current [paired
overview](docs/custom-tree-variants-preview.png), daylight [front](docs/custom-trees-preview.png),
[rear](docs/custom-trees-rear-preview.png), and [side](docs/custom-tree-side-preview.png),
and Halloween [front](docs/halloween-trees-preview.png) and
[rear](docs/halloween-trees-rear-preview.png) captures were inspected in headless
Chromium; there were no page errors. The test zone is the only consumer of these
trees; the forest and Halloween world still use their existing tree models.

| Check              | Result                                                   |
| ------------------ | -------------------------------------------------------- |
| `vp check`         | Pass: 0 errors, 130 pre-existing warnings.               |
| `vp run typecheck` | Pass.                                                    |
| `vp run test`      | Pass: 151/151, including three seeded-generation checks. |
| `vp build`         | Pass: playground chunk 36.75 kB raw / 13.72 kB gzip.     |

The eight foliage meshes total **153,088 triangles**, and their trunk and
branch meshes add **5,680 triangles**. Mesh geometry is shared between each
day/Halloween pair's crowns. Applying the current average foliage detail to
all 340 Halloween tree placements would create roughly **6.5 million foliage
triangles before culling**. That is a projection from mesh counts, not an FPS
measurement. A full-scene move still needs distance LOD, instancing or batching,
and a measured comparison on target hardware. GPU time, hardware FPS, and
memory trends remain unmeasured.

## 2026-09-26 23:11 EEST — Halloween comparison row

The playground now shows four Halloween versions behind the four daylight trees, with a **Halloween trees** test-zone teleport. The seasonal versions reuse the smooth canopy geometry but have smaller crowns, exposed crooked branches, charcoal trunks, and copper, burgundy, moonlit blue, or pale sage color bands. Headless Chromium rendered the eight specimens without page errors. The preview links in the latest entry now show the later procedural revision. Neither the forest nor the Halloween world has been switched to these prototypes.

| Check              | Result                                                                             |
| ------------------ | ---------------------------------------------------------------------------------- |
| `vp check`         | Pass: 0 errors, 130 existing warnings.                                             |
| `vp run typecheck` | Pass.                                                                              |
| `vp run test`      | Pass: 148/148 after moving the Halloween teleport inside the tested player bounds. |
| `vp build`         | Pass: playground chunk 36.90 kB raw / 13.67 kB gzip.                               |

The eight foliage meshes total **146,880 triangles**, and their trunks add **1,920**. The Halloween scene defines 340 tree placements, so a naive full-detail replacement at this average would draw about **6.2 million foliage triangles before culling**. That is a geometry projection, not a frame-rate measurement. The art direction is ready for an in-world trial, but a production swap should first add distance LOD and instancing, then be profiled in daylight and Halloween lighting on target hardware. Hardware FPS, GPU time, and memory trends remain unmeasured.

## 2026-09-26 22:57 EEST — all-angle tree review

The four playground trees now have foliage masses around the trunk, including the back and sides. A secondary sky-fill term keeps the shaded side readable while preserving darker lower foliage. Headless Chromium renders from the front, back, and side were inspected; all four trees rendered without page errors. The preview links in the latest entry now show the later procedural revision. The forest still uses its existing models.

| Check              | Result                                               |
| ------------------ | ---------------------------------------------------- |
| `vp check`         | Pass: 0 errors, 130 existing warnings.               |
| `vp run typecheck` | Pass.                                                |
| `vp run test`      | Pass: 148/148.                                       |
| `vp build`         | Pass: playground chunk 35.12 kB raw / 13.00 kB gzip. |

The four foliage meshes now total **73,440 triangles**; trunks add 432. The extra depth and rear foliage increased the prior canopy count by 2,016 triangles after reducing sphere tessellation. Hardware FPS, GPU time, and memory trends remain unmeasured, so this visual prototype is not yet evidence that a forest-wide replacement will perform well.

## 2026-09-26 19:30 EEST — custom tree prototype update

### Overall status

Four new smooth-canopy tree prototypes render in the playground's **Custom trees** test zone: broad, spreading, evergreen, and young. Their four-band foliage shader follows [craftzdog's MIT-licensed example](https://github.com/craftzdog/ghibli-style-shader), with a palette and silhouette based on the supplied landscape reference. The existing forest trees have not been replaced. A browser capture recorded this iteration; the latest captures above show the later procedural revision.

| Check                    | Result             | Detail                                                                                                                                   |
| ------------------------ | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `vp check`               | Pass with warnings | 148 files formatted; 0 errors and 130 existing lint warnings.                                                                            |
| `vp run typecheck`       | Pass               | `tsc --noEmit`.                                                                                                                          |
| `vp run test`            | Pass               | 148/148 Node tests.                                                                                                                      |
| `vp build`               | Pass               | Playground chunk: 34.32 kB raw / 12.76 kB gzip; full production build completed.                                                         |
| Headless Chromium render | Pass, limited      | All four trees appeared through software WebGL, with no page errors. This verifies rendering, not gameplay feel or hardware performance. |

### Performance status

The four foliage meshes total **71,424 triangles** in the test zone: 20,832 each for broad and spreading, and 14,880 each for evergreen and young. Each foliage crown is merged into one mesh; trunks add four more tree meshes. This detail is acceptable for a small visual study, but a forest-wide replacement needs distance LOD, shared geometry, or instancing before it can be judged against the current tree system. No representative hardware FPS, GPU time, memory trend, or before/after comparison has been measured. The software WebGL browser capture is not a performance benchmark.

Next: review the visual direction in the test zone, then prototype a lower-detail distant variant and measure the same camera route against the current forest before changing production trees.

## 2026-09-26 17:52 EEST — current snapshot

Branch: `feat/third-person-forest-portal` at `c0c63b6`  
Environment: Node `v24.15.0`, Vite+ `v0.3.3`

### Overall status

**Automated checks are green through the project's test script; interactive browser validation remains open.** The app defines the forest hub, gallery, collision course, Halloween world, Ash Warden realm, Warp Room, five warp levels, and Tiny Tusk encounter. The production build succeeds, and the preview server returns HTTP 200 for `/`, `/gallery`, `/warp`, the entry JavaScript chunks, and the player GLB. HTTP checks establish that files are served; they do not establish that WebGL renders or that the levels play correctly.

| Check                         | Result             | Detail                                                                                                                                   |
| ----------------------------- | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `vp install`                  | Pass               | Dependencies already up to date.                                                                                                         |
| `vp check`                    | Pass with warnings | All 147 files formatted; lint reports 0 errors and 130 warnings, mostly `no-floating-promises` in Node test files.                       |
| `vp run typecheck`            | Pass               | `tsc --noEmit`.                                                                                                                          |
| `vp run test`                 | Pass               | 148/148 Node tests across 22 files. Includes gameplay, level layout, controller, ECS, and simulation checks.                             |
| `vp test`                     | Fail               | Built-in Vitest finds no Vitest suites in the 22 files, which use `node:test`. This command is currently the wrong runner for the suite. |
| `vp build`                    | Pass               | 741 modules transformed; production output generated.                                                                                    |
| Production preview HTTP smoke | Pass, limited      | Routes and sampled assets return 200; no browser rendering test was run.                                                                 |

Known scope: `/seasons` is a fixed Halloween world; season rotation and swimming are not implemented. Koota migration is incremental, with Rapier still owning physics and React still owning UI. These are documented product boundaries, not newly observed regressions.

### Performance status

**Runtime frame rate, GPU time, and memory trend are unmeasured in this snapshot.** The available browser preview automation host was unavailable, so there is no defensible FPS pass/fail result or before/after comparison for the latest batching change.

| Evidence                        | Current value or state                                                                                                             | Interpretation                                                                                                                                           |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Entry HTML JavaScript           | `index` 993.20 kB, `terrain` 969.82 kB, `rapier` 2,237.31 kB; 4,200.33 kB raw / 1,477.38 kB gzip combined                          | The HTML loads or module-preloads all three. This is an initial JavaScript transfer cost, not a measured startup time.                                   |
| Build output                    | 215.61 MiB total                                                                                                                   | Deployment footprint; it is not the per-visit download size.                                                                                             |
| Blender sources in build output | 203 `.blend` files, 190.09 MiB (about 88% of output)                                                                               | Source assets are copied from `public/assets` into `dist`; they are not referenced by the runtime source and are not automatically fetched by a browser. |
| Runtime optimization code       | Static house mesh batching, vegetation LOD/frustum culling, grass worker/streaming/distance thinning, adjustable render resolution | Implemented, but this snapshot does not quantify their frame-time effect.                                                                                |
| Diagnostics                     | Dev-only `r3f-perf` overlay and `scripts/hubPerformance.js` / `scripts/checkNatureLod.js`                                          | Available for a live browser session; neither script produced a result in this snapshot. The grass check measures main-thread stalls, not display FPS.   |

### Next checks

1. Capture repeatable browser results on a named device and viewport: warm-load FPS/frame time, draw calls, triangles, and memory in the hub, Hollow Lane, gallery, and Warp Room. Compare the same camera positions and quality setting across commits.
2. Keep editable Blender sources outside `public/assets`, or exclude them from the production copy, if they are not meant to be served. Verify runtime asset paths afterward.
3. Make the test command and runner agree (`vp run test` currently works; `vp test` currently fails). Address the 130 lint warnings separately.

Commands for the next snapshot: `vp install`, `vp check`, `vp run typecheck`, `vp run test`, `vp build`, then browser profiling with the dev diagnostics or a production build. Record device, browser, viewport, quality setting, route/camera position, sample length, and measured values before asserting a performance improvement.
