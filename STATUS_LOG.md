# 2026-10-07 — Repair parish surface z-fighting

Reproduced striped burial-terrace paving in the native preview: ten floor tiles
shared their top plane with the crypt ceiling. The boss slab also overlapped its
approach and vestibule paving. Lowered and inset the crypt ceiling while keeping
its underside height, and partitioned the rendered boss slab around the authored
tiles. The full boss collision slab and route topology remain intact.

Separated cloister roof caps from wall tops, buried architectural footings and
trim contacts, inset overlapping stair parapets, and bevelled the lower skirts
of sloped tiles. Planter retaining walls now sit beneath their coping rather
than sharing its top face; this repairs an overlap introduced by the refinement
pass. Window panels extend behind their reveals. Support and fixture-clearance
checks still pass.

Moss, court paving inlays and rose glass use a negative polygon offset. Ground
overlays retain scene depth testing, do not write depth or cast shadows, and
static batches preserve each layer's render order. Existing spatial batching and
foliage instancing are retained.

Six new regression tests fail against the original overlaps and pass with the
repairs. All 276 Node tests, typecheck and production build pass. vp check reports
zero errors and the existing 130 warnings. Built-in vp test still rejects the
48 node:test files as missing Vitest suites; vp run test runs the gameplay suite.
A temporary world-space triangle probe found no exposed, differently shaded
coplanar intersections above 0.01 square metres in the final scenery. This is an
exact-plane geometry check, not a universal GPU flicker or frame-rate claim.

Inspected native garden, court, cloister, arcade and boss-approach views. Saved
before/after garden captures in docs/ashen-parish-z-fighting-before.png and
docs/ashen-parish-z-fighting-fixed.png. GPU programs link and WebGL reports no
error. Used the normal retry button after an inspection death, then restored
the player to the refuge with 100 health, no invulnerability, released controls
and the default camera. Removed the temporary triangle probe.

# 2026-10-07 — Refine parish architecture and planted spaces

Following the user's architecture/atmosphere/detail direction, added six
soil-filled stone beds and two court benches. Shrubs root in the rendered soil;
retaining walls and bench legs meet the existing floors. Shared prop footprints
keep navigation and Rapier in agreement. Upgraded existing planters, pews and
rubble from single boxes to built forms.

Added slate roof courses and ridge caps, refuge corner quoins, layered cathedral
archivolts, portal shafts, blind lancets, tower masonry, string courses and
stained rose-window tracery. Arcade pilasters embed in the existing narrow
piers; cloister roof ribs and chimney iron bands articulate the side buildings.
Court paving rings now use flat segmented stone inlays. Static details still
use the spatial batches; shrub leaves use existing culled foliage instances.

Preserved the floor plan and shortcut topology. Clearance checks found the
existing kiln guard inside the cathedral facade; moved it onto the vestibule
pavement. All authored enemy spawns now clear static blockers at player radius.

Validation: 270 Node tests pass, including new geometry-contact tests for
roof tiles, quoins, soil roots, bench legs and garden floor support. Existing
closed-gate reachability, actual fire clearance, batching, disposal and graphics
detail tests pass. Typecheck and production build pass; vp check reports zero
errors and the existing 130 warnings. Built-in vp test retains the Node/Vitest
runner mismatch (now 47 files); vp run test is the gameplay suite.

Inspected native court views during construction; saved the court image at
docs/ashen-parish-court-refinement.png before the final tower/window details.
Later native snapshot calls failed on the preview client; evaluated the final
live scene instead, verifying linked GPU programs and no WebGL error. Restored
player health, refuge position and default camera values after inspection.
No hardware frame-rate claim is made for this detail pass.

# 2026-10-07 — Repair embedded fire fixtures and detached dressing

Actual mesh-interior checks reproduced eight braziers intersecting entrance
piers, court columns, crypt masonry or foundry furnaces. Moved those fixtures
onto clear pavement, and moved the cathedral approach fires farther from the
facade. All fourteen braziers now have shared Rapier/navigation footprints;
the ten short decorative columns share their rendering and collision plan.

House window panels now overlap their facades and have connected trim/sills.
Lanterns hang from braced wall plates; banner brackets reach the correct wall
face, and cloth headers are pinned along their rods. Tree branches begin
inside the actual tapered trunks. Moss conforms to floor heights and clips
away over cutaways; wall ivy is static against masonry and grass wind leaves
the roots fixed. Removed duplicate cathedral finials from the original shell.

Fire bodies are scaled to their bowls (one metre for the refuge's main flame
body), with bounded headroom for the tips, orange fringes and gold cores.
Point-light intensity and smoke size are lower. Coal beds contain individual
embers; brazier hardware is spatially batched. The final volumetric flame
implementation and its GPU checks are documented in docs/graphics-performance.md.
Koota timing, reduced motion, fixed instance buffers and graphics budgets remain.

Validation: all 267 Node tests, typecheck and production build pass; vp check
reports zero errors and the existing 130 warnings. Eight fixture regressions
check actual mesh clearance, window contact, branch joins, moss grounding,
solid footprints, wall mounts and banner headers. Native rendered views of
the entrance, court, foundry, crypt and house facade were inspected. An actual
Rapier walk raised the player's feet onto the refuge bowl's 0.5125 m collider,
rather than passing through its body. Probe health and controls were restored.
After resuming the preview, native screenshot capture succeeded; the actual
after-image is saved at docs/ashen-parish-fixtures-fixed.png.
Textured scenery construction measured 339.4 ms; atmosphere construction 6.7 ms,
with 405 visible scenery meshes and 48 fixture meshes. These are construction
and submission counts, not FPS results. Built-in vp test retains the existing
Node/Vitest mismatch (46 files); the passing gameplay command is vp run test.

# 2026-10-07 — Ground architectural details and replace the smooth flame shader

Reproduced five support defects with rays through the rendered source geometry:
floating finial pedestals/candles, columns outside pavement, a two-metre foundry
roof gap, a projecting cloister facade without a footing, and flat foundations
below sloping stairs. Finials now sit on buttress caps and statue candles on the
plinth. The refuge exit has a real landing, the court's corner columns moved
inside the pavement, the foundry roof meets its walls, and projecting facades
have cliff footings. Stair foundations follow the slab underside; suspended
stairs have stringers and piers with shared Rapier/navigation footprints.
Navigation now checks the full vertical span of solid props. Also attached
window/door surrounds, lantern brackets and coping courses, moved the tree
beside the house door, and rejected scattered leaves/grass over the void.

Fire uses rising three-octave fractal noise, domain distortion and turbulent
outline erosion, informed by https://greentec.github.io/shadertoy-fire-shader-en/.
Split tongues, per-plane/per-brazier variation and a small hot core replace the
smooth cone. Flame bases start in the coal beds. Warm and blue burial flames
still share two instanced submissions, fixed buffers and the Koota game clock.
Reduced motion stops their animation; particle/light budgets remain unchanged.

Validation: 258/258 gameplay tests, typecheck and build pass; vp check reports
zero errors and the existing 130 warnings. Seven support regressions pass,
including the initially failing scenery and scattered-floor-detail checks.
In the native preview, all shader programs linked without WebGL errors. An
isolated 128x224 flame render found more split outline rows than the prior shader
(17 versus 5 at the sampled pose), and reduced-motion frames matched exactly.
Actual Rapier frame advances kept the character grounded at (14, 0, 151).
Textured scenery construction took 250.3 ms in one probe, with 392 visible meshes
(previous prop follow-up: 388). This is not an FPS measurement. Native saved
snapshot capture still fails; live canvas frames were inspected through native
evaluation. Built-in vp test retains the Node/Vitest mismatch (45 files).

# 2026-10-06 — Repair the refuge canopy and house doors

Replaced the floating cloth sheet and disconnected poles with a pitched,
draped fabric canopy, scalloped hem, four grounded timber posts, crossbeams,
diagonal braces and iron fittings. Its supported edges have zero wind weight;
motion still follows the Koota parish-air clock and reduced-motion setting.
The four posts share their rendering, Rapier and enemy-navigation footprints.

All three house doors now use beveled planks clipped to their pointed arches,
recessed dark backing, iron hinge straps/studs, paired ring handles and stone
thresholds. Shared 256-pixel wood and woven-cloth maps are generated once during
construction. Static details remain batched, and owned resources dispose once.

Validation: 251/251 gameplay tests, typecheck and production build pass. The
canopy-support and door-outline checks failed on the old geometry, then passed
on the replacement. Wind attachment checks pass. Actual Rapier traversal went
from z=135 to z=127.62 beneath the canopy at x=-9. All 91 shader programs linked,
and WebGL reported no error. Native screenshot capture failed, so no rendered
after-image is claimed. Two textured scenery construction probes took
207.6–267.1 ms in the native preview, with 388 visible scenery meshes. Built-in vp test retains
the existing Node/Vitest suite mismatch.

# 2026-10-06 — Remove repeated loading work and retain the world on respawn

Measured textured scenery construction at 7,890 ms in the T3 preview. Static
batching repeatedly serialized shared materials, including texture-image data.
Caching one description per material reduced the same browser call to 179.7 ms.
The regression test now observes one serialization instead of 100.

Parish retry previously replaced the renderer and rebuilt the whole level;
development StrictMode doubled that construction. Retry now resets the existing
Koota encounter/combat binding, reconciles enemy/projectile entities and
teleports to the saved shrine while preserving Canvas, Rapier and GPU resources.
Death/roll/landing state, Warden cues/death poses and revived enemy collider
positions reset without rebuilding their models. Checkpoint/shortcut/cache
progress survives. Preparation frame waits fall back after 100 ms if RAF stalls.

Browser retry restored health and closed the result screen in the first sample
at 30 ms, preserving renderer/canvas/environment/combat identity and making zero
shader compilation calls. This measures the state/UI commit, not presentation
latency. Game-frame checks verified kiln respawn, sword/roll animations, restored
enemies and a 2.06 m controller walk. Preview RAF throttling prevents a reliable
total initial-load comparison; see docs/graphics-performance.md.

Validation: 249/249 Node tests pass; typecheck and production build pass.
Built-in vp test still rejects the 44 node:test files as having no Vitest suite.

# 2026-10-06 — Repair stair architecture and add saved graphics controls

Fixed the screenshot sites: slope-following parapets and matching Rapier
trimeshes, an open arcade bay at the middle stair arrival, anchored high-walk
banner masts, wall brackets and a roof beam/hanger/clapper for the bell. Ivy
and rubble follow sloped wall bases instead of floating beside them.

Display now has Low/Medium/High/Ultra presets and independent render scale,
dynamic resolution with 30/60 FPS targets, shadows, ambient occlusion, bloom,
world detail and decorative particles. Controls save automatically; individual
changes select Custom. Legacy resolution and key bindings are preserved.

Fixed adaptive resolution discarding sustained frames above 120 ms. Menus now
preserve adapted DPR. Main parish views skip HUD snapshot rerenders. Foliage
quality changes existing instance counts; smoke/embers use culled spatial cells
and fixed buffers. Texture/shader preparation and zero-delta warmup frames run
behind an overlay. Resolution, lighting caches and frame telemetry are ECS-owned.

Validation: 245/245 Node tests pass; typecheck and production build pass.
vp check has zero errors and the existing 130 warnings. Built-in vp test still
rejects the node:test files as having no Vitest suite. Browser assertions cover
saved settings, custom presets, actual shadows/particles, frozen gameplay during
quality changes and preserved DPR across pause/resume. Actual controller traversal
reached the upper arcade at +14 m through the repaired middle ascent.

After the shared preview disconnected, hardware-backed local Chromium measured
six three-second stair runs at 960×600 on RX 7900 XTX: Low/Medium/High each
held ~60 FPS, p99/worst 16.8 ms and no frames over 50 ms. A six-second active
Warden check at 1280×800/DPR 0.875 also had no frames over 50 ms. The initial
native preview was much slower, but the environments differ; this is not a
controlled before/after improvement claim or a lower-end hardware guarantee.
See docs/graphics-performance.md for conditions and limits.

# 2026-10-06 — Add inhabited detail and motion from the approved concept

The concept comparison exposed bare paving, cone trees and even lighting in
the replacement renderer. Added eighteen branching trees with fuller autumn
and cypress foliage, ivy, understory, moss, leaf litter, clustered supplies,
grave candles/crosses, house lanterns, cloth shelter and hanging banners.
Carved masonry, finials, a folded-robed monument and distant ridges add more
varied silhouettes. Warm dusk lighting and a parish-specific grade contrast
with the blue burial flames.

Fourteen braziers have flickering fire; embers and smoke rise from the refuge
and foundry. Wind, cloth, sky drift, flames and particles use the Koota-owned
parish-air game clock. Reduced motion stills wind/flicker and hides moving
particles. Foliage is instanced in culled cells; static props batch with the
architecture, and the fire/particle buffers remain unchanged during updates.
The existing four-point-light budget still applies. Supply piles and trunks
share physics/navigation footprints; all routes and offerings stay reachable.

Validation: 231/231 Node tests pass; typecheck and production build pass.
vp check reports zero errors and the existing 130 warnings. Built-in vp test
still rejects all 39 node:test files as having no Vitest suite. Added four
tests for ECS animation state, light/reduced-motion behavior, fixed particle
buffers, foliage culling/submission bounds and resource disposal.

Native preview rendering was inspected from the refuge, court and west
burial terrace, plus an overview. Screenshot saving failed after the initial
before capture; no new screenshot is claimed. Hardware FPS and GPU frame
time remain unmeasured. The richer procedural environment still has less
sculptural detail than the painted reference.

# 2026-10-06 — Replace the actual layout after the scenery-only pass missed the request

The previous replacement retained the old floor footprint. Removed that authored
layout and rebuilt it around the approved concept's spatial composition:
foreground refuge, continuous raised court and attached west burial terrace,
lower ossuary underneath, rear cloister, long eastern arcade, bell landing,
eastern foundry, and wide cathedral stair. Old disconnected room footprints,
barred primary procession corridor and rectangular foundry loop are removed.

New elevations: refuge 0 m; burial chambers −6 m; court/garden/cloister +6 m;
cathedral +12 m; bell walk/foundry +14 m. Updated floor geometry/collision,
architecture footprints, all enemy and reward placements, shrine respawns,
optional gates, portal, map, bounds and boss simulation/impact floor height.
Existing Koota encounter ownership and movement/combat systems remain.
Foundations only fill below the lowest floor, preserving underpasses and vaults.

Validation: 227 Node tests pass. Native controller walks reached the new court
at +6 m, cathedral at +12 m, east arcade at +14 m and ossuary at −6 m. Tests
explicitly reject old crypt/foundry footprints and exercise the new plan's
reachability, gates, overlapping floors and raised boss simulation.

# 2026-10-06 — Replace the rejected parish scenery from scratch

Removed the previous parish architecture renderer and the reused AshArena
scenery from this area. Built a complete replacement environment: monumental
cathedral and spires, refuge houses/chapel/canopy, courtyard arcades and
medallion paving, actual arched aqueducts, open bell tower, burial vaults,
cloister and roofed foundry. Added weathered masonry textures, trees, rocky
silhouettes and a lighter sky; fixed the missing sky exposed by visual checks.

Static architecture shares navigation footprints. Wall collision uses actual
trimeshes with open doorways, while buildings and tower supports have solid
colliders. Scenery batches by spatial cell and releases owned resources on
unmount. Existing encounter/ECS logic and connected floor routes are retained.
Native player movement reached the upper bridge at Y≈8 and ossuary at Y≈−4;
visual checks covered refuge, court, cathedral and the upper overlook.

Validation: 226 Node tests pass, including three new environment tests.
Build and typecheck pass; vp check reports zero errors and 130 existing warnings.
Built-in vp test still rejects the project's Node test suites.

# 2026-10-06 — Original concept rebuilt as a layered parish

Implemented the approved weathered-stone concept; the Manueline study remains
an unused concept artifact. The layout now has a sunken ossuary/cloister at
−4 m, court and lower service passage at 0 m, and aqueduct/bell/foundry at +8 m.
Routes overlap physically and converge at the kiln before the Warden. Existing
far-side gates remain persistent and halve the shortest shrine-to-kiln route.

Tiles support multiple floor planes and ramps on either axis. Adjacency matches
both ends of shared edges; wall generation, physics, AI floor selection,
visibility, projectiles, area titles and route-map keys respect the new layers.
Enemy and offering placements follow their new floor heights. Decorative
arcades, chapel facade, procession medallion, funeral columns, ramp markings,
parapets and instanced foundations implement the original architecture direction.
Ossuary/cloister roofs have collision; longer exploration visibility makes distant
landmarks readable. StaticScenery and instancing retain rendering batching.

Validation: 223 Node tests pass; vp check has zero errors and existing 130 warnings;
typecheck and production build pass. Built-in vp test retains the existing
Node-test/Vitest mismatch. Native player-controller checks reached Y≈8 on the
upper ascent, Y≈−4 in the ossuary, Y≈0 on both returns to the kiln, and stayed
at Y≈0 beneath the bridge. Visual checks covered the upper overlook and crypt.
Design references, route graph and implementation limits are in
docs/ashen-parish-level-design.md.

# 2026-10-06 — Sourced camera design and more framing space

Recorded primary research and developer writing in docs/combat-camera-research.md,
including an ACM responsiveness study, Norman Nazaroff's input guidance,
Retro Studios' GDC camera slides and Unity's occlusion documentation. Distinguish
published principles from our tunable values; no claim of verified Elden Ring
input timings. The prior 180 ms buffer and 65% recovery cancel remain project tuning.

The parish camera now uses direct spherical orbit, broader pitch, 60° FOV,
a 7.5 m arm and wheel zoom from 4 to 10 m. Enemy/corpse metadata filters camera
sweeps while stonework still blocks them. Occlusion pulls inward immediately,
holds briefly, and eases outward; its distance, timer, pitch/yaw and zoom remain
ECS-owned. Input listeners track their ECS bindings across remounts/hot reload.
Seven instanced floor tiles add 448 m² across the court, refuge and garden;
existing wall, floor, collision and navigation data derive from those tiles.

Validation: native preview reproduced 3.17 m of NPC-induced camera collapse
before the fix, then zero after. A corridor wall limited the camera to 3.37 m;
turning into the corridor restored the 7.5 m arm. Wheel events hit both zoom
bounds (4/10 m). Real Rapier regression checks cover NPC/corpse exclusion and
wall collision; recovery tests cover hold and immediate inward correction.
vp run test: 220 passed; vp check: zero errors, existing 130 warnings;
typecheck and production build pass. Built-in vp test retains its existing
Node-test/Vitest mismatch (37 files report no Vitest suite).

# 2026-10-06 — Responsive attack and dodge input

The player consumed attack and dodge presses while actions were unavailable,
so pressing in the last 50 ms of recovery silently lost the next action.
Added an ECS-owned 180 ms buffer that retains one recent intent per action.
Expired intents, pauses, death/result screens, teleports and blocked traversal
do not produce delayed attacks or rolls. Dodge wins simultaneous requests.
Dodge can cancel sword recovery after 65% of the swing, beyond the 30–50%
damage window; attacks retain their commitment and stamina costs.

Combat clips begin in a layout effect and blend at rate 48 rather than 18
for swords / 28 for rolls. Shared Space still dodges on release to distinguish
a tap from holding sprint; a dedicated sprint key enables key-down dodge.

Validation: vp install; vp check (zero errors, existing 130 warnings);
vp run test (218 passed); vp run typecheck; vp run build; git diff --check.
The regression exercises the checked-in PlayerRuntime acceptance block.
Additional tests cover roll recovery, sword commitment, expiry, near-landing
inputs and simultaneous-action priority. A native preview check confirmed a
buffered attack, next-frame recovery dodge and a buffered second roll using
the live ECS records. The existing built-in vp test runner mismatch remains.

# 2026-10-05 — Gameplay state in Koota

Moved live player input, inventory and shared camera/sprint/result gates into
world traits. Player movement, roll/backstep, ledge, seat, physics-handshake
state and animation timing now use lifecycle-owned ECS records. Parish runs
and progress, Warp/Tiny Tusk runs, Hollow Lane survival, and gallery puzzle
and checkpoint state use ECS adapters instead of independent React refs.

The parish coordinator runs Warden combat, enemy AI and ember projectiles
through queries. Individual enemies and projectiles have traits and lifecycle
tags. Respawns replace obsolete records, expired projectiles are destroyed,
and route teardown destroys encounter entities. The adapter preserves the
existing Three/Rapier interfaces and shared object identities; React continues
to own presentation and settings, and engine resources stay with their adapters.

Regression tests cover ECS ownership, query-to-view updates, Strict Mode-style
remounts, external destruction, 600-frame combat equivalence, corpse tags,
projectile expiry, shrine respawn, and teardown. Input and inventory tests run
against the new world-backed data. Browser checks verified movement, enemy
damage, corpse passage, Warden victory and continued sinking animation.
Warp and Hollow Lane movement and gallery ECS registration also passed in
browser checks. After the canvas teardown delay, leaving the parish reduced
its gameplay, enemy and projectile entity counts to zero.

Validation: vp install; vp check (zero errors, existing 130 warnings);
vp run test (212 passed); vp run typecheck; vp run build; git diff --check.
The built-in vp test still fails because Vitest cannot discover the existing
Node test runner suites; the package.json test script is the passing runner.

# 2026-10-04 — Harder parish encounters

Sentinels now have 120 health, 32 damage, faster closing movement, a forward
step into their strike and a two-hit sequence with a distinct follow-up
preparation. Recovery shortens to 0.9 seconds after the completed sequence.
Hounds have 65 health, 23 damage, faster movement/lunges and 0.65-second
recovery. Penitents have 85 health, 26 damage, faster preparation/recovery and
12-unit-per-second projectiles. Early windups, shields, poise protection,
late tracking locks, hitstun grace and roll invulnerability remain meaningful.

Two separated melee flanks can commit together, capped at two nearby
attackers; enemies on the same approach still take turns. Follow-up
preparation begins from the previous strike's pose and shares its duration
with simulation and armor rules. Sentinels stop advancing at close range,
and abandon the follow-up for recovery if the player retreats beyond reach.

Validation: vp install; vp check (zero errors, existing 130 warnings);
vp run test (205 passed); vp run typecheck; vp build; git diff --check.
Added tests cover separate combo contacts, one roll versus a whole sequence,
retreat/recovery openings, flanking limits, pose continuity, tracking locks
and stationary-player lethality. Existing tests retain checks for stagger
spam, lethal interruptions, shield flanks and readable attack phases.
A browser encounter with actual controller knockback recorded damage at
1.0 and 1.917 seconds, reducing health from 100 to 68 to 36 before recovery.
Difficulty remains an authored tuning pass and needs human playtesting for
final feel and balance. The preview was reset to a fresh refuge run.

# 2026-10-04 — Enemy redesign, expanded routes and rendering budget

Rebuilt the three enemy silhouettes with weathered knight armour, funeral
masks and a lean skeletal hound. Elbows, knees, ankles and jaws articulate;
weapon preparations include overhead and thrust poses. Continuous contact
and recovery timing still follows the encounter simulation, and existing
poise/armor rules remain. Vertex colours let each joint batch using three
shared surfaces. React-owned Warden parts batch reversibly within joints.

The parish grew from 66 to 109 floor tiles and from seven to ten named areas.
The garden/cloister loop returns from the refuge to the ossuary; the foundry
loop joins both ends of the elevated aqueduct. Twelve authored enemy placements,
physical cover, colonnades, partial roofs, chapel/foundry skylines, procession
standards and three optional offerings give routes landmarks and rewards.
Cover footprints are shared by physics, AI movement and attack visibility.
The map shows actual floor footprints. Skyline ruins were moved beyond the
new routes after browser inspection revealed a tower obscuring the cloister.

Rendering changes include distant animation throttling, dormant Warden
culling, batched gate/shrine parts, constant-time floor lookup, a local
1024-pixel shadow window and twelve light-shaft samples. Optional adaptive
resolution responds to sustained frame pressure, with slow recovery and a
saved Display toggle. A controlled 33 ms browser frame sequence reduced DPR
from 1.5 to 0.875, and HUD updates did not reset it.

At the courtyard, DPR 1.5, renderer submissions fell from 486 to approximately
386 calls despite the added content. Viewports were 1280 × 800 before and
1280 × 801 after. Warm manual render/finish samples were about 2.6 ms after
versus 2.8 ms before on this browser. These are rendering-cost probes, not
real-time FPS measurements or a guarantee on other hardware. The collaborative
preview suspended native animation frames; browser-only timer/resize shims
allowed mounting, then were restored before manual frame verification.

Validation: vp install; vp check (zero errors, existing 130 warnings);
vp run typecheck; vp run test (198 passed); vp build; git diff --check.
Built-in vp test retains the existing Node/Vitest runner mismatch. Tests cover
cover-aware connectivity with both gates barred, offerings, skyline separation,
articulation/batching, attack continuity and adaptive resolution bounds.
Browser checks confirmed floor/elevation at every new region, offering rewards,
all three enemy designs, and the batched Warden entering recovery and damaging
the player. No page errors occurred. Human playtesting is still needed to
judge encounter balance and animation feel across the larger routes.

# 2026-10-04 — Parish rendering and post-victory animation

The parish now budgets four nearby point lights, with hysteresis as the
camera moves. Emissive flames remain visible. Static landmarks and ruins
batch by equivalent material within spatial cells; enemy parts batch only
within their articulated joints. The parish retains SMAA and disables the
redundant postprocessing MSAA pass. Other scenes retain their defaults.

The player celebrates while the victory result is open, then resumes idle,
locomotion and combat animations when exploration continues. Previously,
zero boss health selected the clamped victory clip indefinitely.

At the same courtyard camera, 1280 × 800 viewport and 1.5 render scale,
browser renderer submissions fell from 655 to 486 draw calls and active
point lights from 21 to four. Warm render/finish samples were approximately
3 ms after the change versus approximately 6 ms before; these are local
browser measurements, not a universal FPS guarantee. Actual controller
movement and changing skeletal poses were verified after dismissing the
boss result. Regression tests cover animation selection, joint bounds,
light selection, spatial batching and resource cleanup.

Validation: vp install; vp check; vp run test (189 passed); vp run typecheck;
vp build; git diff --check. The existing built-in vp test runner mismatch
remains: these tests use Node's test runner and pass with vp run test.

# 2026-10-03 — Parish enemy tactics, poise and combat animation

Enemy health hits no longer reset every action into stagger. Species have
poise thresholds, short fixed staggers, recovery of poise after a quiet period,
and protection after a break. Repeated hits never extend stagger. Late
windups and active strikes resist interruption while retaining health damage
and lethal hits. Early windups and recovery can still be punished.

Sentinels guard frontal hits, circle and leave flanks open; penitents retreat
for a bounded time before casting; hounds circle into reachable lunge range.
Nearby melee enemies take turns committing and avoid overlapping. Brief
last-seen memory permits searching before returning home. Existing gate,
elevation, floor and home-leash rules still constrain movement and attacks.

Animations share preparation/contact/follow-through poses across phase
boundaries, with shield reactions, lantern charge, head counter-rotation,
hound crouch/lunge leg poses, and footsteps driven by actual movement. Death
and interruption transitions blend, and reduced motion keeps essential
combat silhouettes while removing idle ornament.

Validation: vp install; vp check (0 errors, existing 130 warnings); vp run
test (181 passed); vp run typecheck; vp build; git diff --check. New tests
cover all three species under repeated hit spam, armor/lethal damage, shield
flanks, melee attack turns, retreat/circling, committed tracking, poise
recovery, pose continuity and lunge reach. Browser simulation under heavy-hit
spam recorded an actual enemy strike and player damage; longest stagger was
0.367 seconds and no page errors occurred. Browser rendering was inspected.
Tactics use existing floor/visibility navigation, without global routefinding.
Full human playtesting and hardware performance profiling remain necessary
for final balance.

# 2026-10-03 — Configurable sprint behavior

Menu → Controls now offers hold-dodge-to-sprint or a separate sprint key.
The separate key starts with Left Shift (or an unused key if already bound)
and can be rebound. Dedicated sprint works immediately; dodge fires on
press and never changes sprint state. Shared mode keeps the Elden Ring
hold/release behavior. The choice/key persist with settings; reset restores
shared mode. Conflicting or reserved sprint bindings are rejected.

Validation: vp install; vp check (0 errors, existing 130 warnings); vp run
test (171 passed); vp run typecheck; vp build; git diff --check.

# 2026-10-03 — Elden Ring keyboard defaults and rebinding

F now jumps/climbs; a quick Space release rolls with movement or backsteps
while stationary. Holding Space for 250 ms sprints; release after holding
never dodges. Backsteps retain facing, have shorter travel/recovery, and do
not grant roll invulnerability. Their visual reuses the existing jump clip
retimed to the 0.4-second step.

Menu → Controls accepts custom movement, jump, dodge/sprint, use and attack
bindings. Assigning an occupied key swaps the bindings. Settings persist
across reload; reset restores defaults. Escape cancels capture. R, M and 1
remain reserved for area abilities. Hints follow custom bindings.

Validation: vp install; vp check (0 errors, existing 130 warnings); vp run
test (169 passed); vp run typecheck; vp build; git diff --check. Browser
verified rebinding jump/dodge, persistence after reload, reset, jump input,
hold-to-sprint and release without dodge, then tap-to-dodge; no page errors.
vp test retains the existing Vitest/node:test runner mismatch; vp run test
executes the configured Node suite.

# 2026-10-03 — Ashen Parish playable area

The `/boss` portal now opens into seven connected spaces: refuge, procession
court, ossuary, raised aqueduct, belfry, kiln vestibule and Warden arena. Two
far-side portcullises create return shortcuts. Two ember shrines provide
checkpoints and refill three healing flasks; rest respawns ordinary enemies.
Opened gates survive death for the current realm visit. Falls into the gorge
are fatal. Victory clears the parish and permits exploration.

Seven enemy placements use three original procedural joint rigs: shield-and-
cleaver sentinels, lantern-casting penitents and antlered skeletal hounds.
Simulation owns anticipation, hit timing, pursuit/leashing, projectile travel,
stagger and death; the rigs sample those phases for their custom animations.
The existing custom Warden has a broken bell crown and chained censer. His
five attacks and second phase remain; he activates only through the fog gate.

[Warden arena preview](docs/ashen-parish-boss-preview.png).

Validation: `vp check` passes with 0 errors / 130 existing warnings;
`vp run typecheck` and `vp build` pass; `vp run test` passes 164/164.
Built-in `vp test` still fails because these suites use `node:test`, not Vitest.

Headless Chromium using software WebGL rendered the models without page errors.
A scripted browser check used live controls with teleported starting points and
manually stepped physics to exercise the west passage, court, aqueduct ascent,
belfry descent and crypt approach. Both gates opened from the far side. Fog
entry placed the player at arena z=18. Death/retry returned to kiln z=41 with
100 health and both shortcuts still open. These are targeted integration
checks, not a complete human playthrough or hardware performance benchmark.

Limitations: this is a compact first playable area. Progress lasts for the
current visit; upgrades, equipment, a persistent save, and a full world beyond
the parish are not implemented. Collected embers currently serve as a run score.
Combat pacing, camera clearance and visual polish still need a human playthrough.

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
