# The painted forest

A third-person WebGL experience built with Vite, React, React Three Fiber,
Rapier, and Koota. Explore a forest clearing and jump through paintings
to enter a gallery, a collision course, Halloween Hollow, a boss arena, or the
Warp Room.

The seasonal painting currently leads to a fixed Halloween world at `/seasons`,
with jack-o'-lanterns, autumn and dead trees, gravestones, moonlight, and fog.
It does not automatically rotate through the four seasons.

## Run locally

Requires Node.js 20.19 or newer.

```bash
npm install
npm run dev
```

Open the local URL printed by Vite, usually `http://localhost:5173`.

## Controls

- `WASD` or arrow keys move and turn the character.
- Click the world and move the mouse to look around, or drag to orbit.
- Press `F` to jump or climb a ledge.
- Tap `Space` while moving to roll; tap while stationary to backstep.
- Hold `Space` to sprint. Releasing after a sprint does not dodge.
- Rebind movement, jump, dodge/sprint, interact, and attack in Menu → Controls. Choose “Hold dodge key” or “Separate sprint key” in Sprint controls; dedicated sprint defaults to Left Shift and can be rebound. Bindings save automatically; Reset control defaults restores this layout.
- Press `Escape` or click Menu to pause. Use the arrow keys and Enter to
  navigate the menu; Escape goes back or resumes play.
- Jump into a painting to travel between levels.

Touch controls appear on small or touch-enabled screens.

The pause menu freezes the player, moving platforms, animations, and portal
transitions. Menu → Options → Display has Low, Medium, High and Ultra graphics
presets, plus independent render scale, dynamic resolution (30/60 FPS target),
shadows, ambient occlusion, bloom, world detail and decorative particles.
Changing a graphics control selects Custom. New installations default to Medium;
existing saved resolution and controls are preserved. Display also includes
brightness and fullscreen. Game options include camera sensitivity,
inverted vertical look, control hints, and
reduced motion. Settings are saved in this browser. Returning to the forest
from the menu resets progress in the current area.

## The Warp Room

The painting lying face up on the lake island leads to `/warp`, a hub in the
style of Crash Bandicoot 2. Five portals lead to short platforming levels:
Turtle Woods, Snow Go, The Pits, Boulder Dash, and Road to Ruin. Each level
has crates to break, fruit, patrolling critters, checkpoint crates, one power
crystal, and a gem for breaking every counted crate. TNT crates explode three
seconds after you land on them. Nitro crates explode when touched. Aku Aku
mask crates absorb one hit each.

- Jump on crates and critters, or press the left mouse button, `J`, or `E` to
  spin.
- Collect all five crystals to open the center pad. It leads to Tiny Tusk, a
  boss who leaps at you, sends out shockwaves when he lands, and is dazed after
  a few slams. Jump on his head three times while he is dazed to win.
- Progress is saved in this browser. From the pause menu inside a level, you
  can go back to the Warp Room.

Level layouts are data in `src/gameplay/warpLevels.ts`. The rules are pure
functions in `warpRun.ts` and `warpBoss.ts`. Tests check that each gap can be
jumped at walking speed. Simulated players with human-like reaction times,
who don't sprint, check that the boulder chase and the boss fight can be won.

## Forest landscape

The hub has a 240-unit-wide playable area, a winding river, a collidable wooden
bridge, and two lakes, including a planted island. The water is shallow enough
to wade through; swimming is not implemented. Terrain rendering, collision,
and prop placement share the same height function.

Instanced grass and flowers sway in shared wind gusts and bend away from the
player. Grass uses camera-centered chunks, distance thinning, and density
scaled by render quality. Grass generation runs in a worker, streams one patch
per frame, and retains at most 160 patches for revisits. Distant patches submit
fewer instances rather than only hiding their vertices in the shader.
The twenty-minute day/night cycle updates sun/moon
lighting, fog, and ray-marched volumetric clouds. Pausing freezes the cycle;
reduced motion disables wind, water ripples, and cloud drift.

Technique references: [SimonDev's grass demo](https://github.com/simondevyoutube/Quick_Grass)
and [Guerrilla's volumetric cloud presentation](https://www.guerrilla-games.com/read/the-real-time-volumetric-cloudscapes-of-horizon-zero-dawn).
These are browser-sized implementations, not reproductions of a full AAA renderer.

## Ashen Parish (`/boss`)

The boss painting leads into a newly authored terraced parish. The foreground
refuge opens directly up broad stairs to Procession Court, a continuous raised
plaza. The west garden and rear cloister sit above the sunken ossuary; its
postern returns to the refuge. A long eastern arcade rises to the bell landing
and foundry, with a mid-court ascent and a shortcut to the cathedral. The wide
grand stair leads from the court to the raised Warden floor. Optional return
gates open with **E from their far side** and persist after death. Tombs,
planters, statues and furnaces provide physical cover and block enemy sightlines.
Three offerings grant embers and one flask charge, once per visit.

The refuge and ruins have clustered supplies, cloth shelters, hanging banners,
grave candles, ivy, moss, weeds and fallen leaves. Eighteen branching autumn
and cypress trees replace the cone silhouettes. Braziers flicker, embers rise
and smoke drifts from the refuge and foundry. Warm dusk light contrasts with
the blue burial flames; the parish has its own post-processing palette.
Wind, cloth, flame and particle timing use the Koota-owned `parish-air` game
clock, so they stop with pause. Reduced motion stills wind and flicker and
hides moving particles. Vegetation is instanced by spatial cell, static supplies
join the scenery batches, and particles animate in shaders without per-frame
buffer uploads. Supply piles and tree trunks share physics and AI footprints.

Twelve enemies use three original procedural models with articulated joint rigs:
Cinder Sentinels carry shields and cleavers, Lantern Penitents cast aimed ember
bolts, and lean Ossuary Hounds commit to a forward pounce. Knights have
weathered plate, crested helmets and kite shields; penitents carry funeral
masks and hanging lanterns; hounds have exposed ribs and articulated jaws.
Elbows, knees and feet animate independently. Sentinels alternate overhead
preparations with a thrust silhouette. Their walking,
anticipation, strikes, recovery, stagger and death poses follow simulation time.
Attacks stop tracking before impact; rolls avoid damage during the existing
invulnerability window. Enemies leash back to their home area, and attacks
respect floor elevation, route gaps and closed shortcut gates.

Rest with **E** at either ember shrine to set your retry checkpoint, restore
health and three flask charges, and respawn ordinary enemies. Danger nearby
prevents resting. **R** drinks a flask for 45 health; **M** opens the route map.
Enemies have different combat habits: shielded sentinels guard and circle,
penitents retreat briefly before casting, and hounds circle into a committed
lunge. Nearby melee enemies avoid stacking together. Enemies approaching from the
same direction take turns, but two separate flanks can attack together.
Sentinels step into range and chain two strikes before a short recovery;
hounds close faster and recover quickly, while penitents fire faster bolts.
Health/damage are 120/32 for sentinels, 85/26 for penitents and 65/23 for hounds.
A single early roll does not cover the sentinel's whole sequence; retreating
beyond its follow-up reach creates a safer punish window.
Early windups can be interrupted by breaking poise; late committed swings and
lunges resist interruption while still taking health damage. Hits never extend
an existing stagger, and a short protection window lets enemies retaliate.
Flanking a sentinel bypasses its shield; recovery remains a damage opening.

Use **J** or a captured-pointer click for the sword and **Space** to dodge (hold to sprint); touch
controls include a Sword button. Flask charges refill at a shrine or on
retry; side-route offerings restore one charge. Collected embers are a run score; there is no shop or upgrade system yet.

The Warden remains dormant until **E** at the kiln fog gate. Traversing it moves
you inside and seals the entrance. His custom knight rig now wears a shattered
parish-bell crown and carries a chained censer; the five authored attacks and
second phase remain. Death returns you to your chosen shrine with opened gates
intact. Victory clears the remaining enemies and lets you explore or return to
the forest. Progress lasts for this visit to the realm; it is not saved across
reloads or leaving the route.

Layout, encounters, models and animation sampling live in `ashenParish.ts`,
`parishEncounter.ts`, `parishModels.ts` and `parishAnimation.ts` under
`src/gameplay`. Floors and outer walls use instanced meshes; Rapier colliders
match the raised ramps. Development builds expose `window.__parish` alongside
`window.__r3f` for repeatable traversal and encounter checks.

Parish landmarks batch within spatial cells, and rigid enemy parts batch
within their animated joints. Four nearby point lights illuminate the scene;
distant flames retain their emissive appearance. SMAA provides antialiasing
without an additional MSAA pass. After dismissing the victory result, the
player resumes normal movement and combat animations. Distant enemies reduce
animation work, and the dormant Warden stops drawing outside the nearby view.
A shadow window follows the player (512/1024/2048 pixels for Low/Medium/High);
the parish uses a dusk grade
and height haze with the volumetric shaft pass disabled.
Adaptive resolution lowers pixel cost under sustained frame pressure, then
recovers gradually up to the selected render quality. Toggle it in
Menu → Display. Cool shadows, warm refuge/furnace light and blue burial flames
give the parish's spaces distinct palettes. Stair parapets follow the slopes
in both rendering and collision; the mid-court ascent has a clear arcade bay.
Bell-walk banners have deck-mounted masts, and a roof beam and hanger support
the bell.
The refuge canopy has a braced timber frame and draped, woven fabric with pinned
wind anchors. Its posts share collision and enemy-navigation footprints. House
doors follow their pointed arches, with wood grain, plank seams and iron fittings.
Cathedral finials and candles sit on masonry supports; the exit landing and court
columns have pavement underneath. Roof edges, facade footings and stair foundations
meet their supports. Suspended stair piers share rendering, physics and navigation
footprints. Grass and fallen leaves are rejected outside the floor plan.
Braziers clear arch pillars, columns and furnaces, and their bodies share solid
physics/navigation footprints. House windows meet their facades; lanterns and
banners have wall-mounted brackets, tree branches join their trunks, and moss
clips to pavement instead of bridging cutaways. Wall ivy and cloth headers stay
attached during wind animation.
Fire uses rising fractal noise and distorted, splitting tongues with a small hot
core, following the techniques in [this fire shader breakdown](https://greentec.github.io/shadertoy-fire-shader-en/).
Warm and burial flames remain two instanced draws with fixed geometry buffers.

Parish shader/texture preparation happens behind a loading overlay after the
player model is ready and after graphics changes. Preparation frames use zero
game delta. HUD snapshots do not rerender the main parish views. Foliage detail
changes instance counts in existing buffers; smoke and ember particles are
grouped into culled cells with bounds covering their shader motion. Graphics
quality leaves enemies, damage, collision and attack warnings unchanged.
Static batching caches each shared material description once, avoiding repeated
texture-image encoding during loading. Parish death/retry resets the ECS
encounter and teleports the player to the saved shrine while retaining the
renderer, physics world, level geometry and models. Retry does not rerun shader
preparation. Preparation frame waits have a timeout for throttled previews.
Dynamic resolution accepts sustained visible slow frames and preserves its
current scale when the menu opens. In development, `window.__graphics.summary()`
reports the latest 360 frame intervals, p95/p99, stalls over 50 ms, main-thread
advance time, DPR and total render submissions; `reset()` starts a fresh sample.

Attacks and dodges retain one recent input for 180 ms across recovery or a
near landing. Dodge can cancel the final 35% of a sword swing after its damage
window closes. Early inputs expire; pause, death and traversal clear them.
Combat animations blend in quickly. Shared dodge/sprint still rolls on release;
selecting a separate sprint key in Controls makes dodge trigger on key-down.

## Runtime and rendering

[Koota](https://github.com/pmndrs/koota) owns live gameplay state: player input,
movement/dodge/ledge/seat state, combat and animation timing, parish progress,
Warp level/Tiny Tusk runs, Hollow Lane survival state, gallery puzzles,
inventory, and shared camera/sprint/result gates. It also owns player-position
data, vegetation instance batches, visibility statistics, and platform motion.
Traits and systems live in `gameplay/ecs`. Parish enemies, the Warden, and
ember projectiles have queryable entities; the parish frame coordinator runs
combat, enemy AI, and projectile systems over their records.

`useEcsRef` provides a stable adapter for existing Three/Rapier component APIs;
its mounted data comes from an ECS entity, and effect cleanup destroys that
entity. `useEcsState` subscribes puzzle/checkpoint views to ECS changes. Complex
simulation records use AoS traits, preserving object identity across physics
and animation consumers. Pure rule functions remain independently testable.
React owns presentation, menus, and persisted settings; Rapier owns physics
bodies and contacts. Render resources and temporary calculation buffers remain
with their engine adapters. Route teardown destroys simulation entities. Parish
retry resets the existing combat binding, reconciles enemy/projectile entities
and retains progress and rendering resources.

Trees use their original geometry nearby and vertex-clustered geometry beyond
44 units, with a 3-unit hysteresis band to prevent flicker. Small props switch
at 26 units. Distant trees stop rendering at 155 units, props at 55–95 units,
and flowers at roughly 52 units. Bounds-based frustum checks compact visible
instances into GPU batches. Nearby off-screen shadow casters remain visible to
the shadow pass. Collision stays active independently of visual LOD/culling.
Flat-colour nature materials are baked into vertex colours so each model needs
one material per detail level. Static instance matrices upload only when the
visible membership changes. Grass retains its worker streaming/distance LOD.

## Collision course

The proving grounds at `/playground` are a 170 × 170 test park for the
character controller, modelled on classic controller demo scenes. Ground
labels name each lane. Lanes are entered from +z and walked toward -z.

- **Front field:** 12/25/40/55° slopes with walkable/too-steep strips,
  18/30/48 cm stairs, a funnel squeeze, rough ground, bumpy terrain, moving and
  rotating platforms, pushable boxes and a seesaw, one-way boards, and jump pads.
- **South field:** 2.4/2.1/1.8 m ceilings plus a ramp that wedges under a
  roof, 0.5–3 m ledges, drop-off terraces, 1–4 m gaps, 0.12–1 m beams,
  25/45° ridges, 30/60° valleys, spikes, logs, and 0.1–0.6 m curbs.
- **Back field:** irregular, steep, open-tread, and spiral stairs; bar grates
  with gaps narrower and wider than the capsule; a 40° dome; 30/60° cones; a
  sweeper bar; a fast carousel, elevator, and shuttle; and a hinged plank bridge.
- **North:** inside wall corners of 30/60/90/120°.

Some obstacles intentionally exceed the controller's limits. Platform motion
runs before fixed physics steps, independent of rendering.

The north edge of the proving grounds has two rows of five procedural trees.
Four fixed species (broad, spreading, evergreen, and young) provide daylight
and Halloween references. A gold-ringed pair on the west end is a live tree
lab: both versions use the same seed and update as you change the **Procedural
trees** controls in Leva. Select the species, enter or generate a seed, and
adjust width, height, lobe size, and density. **Reset shape** restores the
default proportions. Choose **Tree lab** in **Test zones** to stand between the
live pair; **Custom trees** and **Halloween trees** show the full reference rows.

Each species uses a seeded generator for its trunk, branches, and foliage
clusters, so the same seed and settings reproduce a shape with foliage on every
side. The Halloween row uses the daylight crowns with charcoal trunks,
generated bare tips, and smaller crowns in copper, burgundy, moonlit blue, and
pale sage. Their smooth, irregular foliage uses four bands of light and shadow,
following the shading approach in
[craftzdog's MIT-licensed example](https://github.com/craftzdog/ghibli-style-shader)
and the supplied landscape reference. Reference seeds and Leva controls live in
`src/components/CustomTreeShowcase.tsx`; generation lives in
`src/gameplay/proceduralTrees.ts`.
They are visual prototypes; the forest and Halloween world still use their
existing tree models. Captures show the [paired layout](docs/custom-tree-variants-preview.png),
the [live tree and Leva controls](docs/procedural-tree-leva-preview.png),
the [daylight front](docs/custom-trees-preview.png) and
[back](docs/custom-trees-rear-preview.png), a
[side view](docs/custom-tree-side-preview.png), and the Halloween
[front](docs/halloween-trees-preview.png) and
[back](docs/halloween-trees-rear-preview.png).

In development, the Leva panel's **Controller** folder tunes the character
controller (speeds, skid, air control, jump arc, skin width, step height,
ground snap, slope limit) live in this world only; other worlds use
`src/gameplay/controllerTuning.ts`. **Copy values** copies the current
settings as JSON; **Reset defaults** restores them. **Test zones** teleports
to any lane. `[` and `]` cycle lanes, and `R` restarts the current one.

## Player animation source

The editable character is `public/assets/characters/Casual_Male_gameplay.blend`; the original
pack file is untouched. It retains the original actions and adds ledge grab,
hang and pull-up, jump rise/fall/landing, sit enter/idle/exit, and two retimed
sword slashes. These are authored/derived skeletal actions, not motion capture.
The exported `Casual_Male_gameplay.glb` is the runtime model. A bone-attached
sword is visible in the boss encounter. Damage uses the slash's contact window.
Airborne exports remove the source animation's extra vertical lift; physics owns
the jump arc. Ledge detection requires a near-vertical wall and a walkable top,
so ordinary sloped riverbanks cannot be mistaken for hanging ledges.

At a ledge, F starts the one-second pull-up and backward movement drops.
The controller supplies climb translation; the clip supplies the body pose.
Use E at a seat to sit or stand. The Blender pose sheet is
`public/assets/characters/animation-poses.png` (source material colours, before game styling).

To regenerate with Blender installed:

```bash
blender -b 'public/assets/Ultimate Animated Character Pack - Nov 2019-20260917T180531Z-1-001/Ultimate Animated Character Pack - Nov 2019/Blends/Casual_Male.blend' --python scripts/buildCharacterAnimations.py
blender -b public/assets/characters/Casual_Male_gameplay.blend --python scripts/previewCharacterAnimations.py
```

## Verification

`scripts/hubPerformance.js` exports a dev-browser boundary-crossing benchmark
that accepts the live R3F root state. It checks main-thread grass streaming
against a 16.7 ms budget, not end-to-end display FPS.
`scripts/checkNatureLod.js` compares actual triangle/draw-call submission with
and without vegetation LOD/culling at the same camera pose. The slope and
moving-platform scripts exercise the live controller in the proving grounds.

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

The parish camera uses full vertical orbit and mouse-wheel distance adjustment
(4–10 metres). Stonework pulls the camera inward; enemies and corpses do not.
The new floor plan has a 64-metre-wide raised court, a foreground refuge,
a west burial terrace over the lower ossuary, and a long eastern arcade.
Wide stairs connect the refuge (0 m), court (+6 m), cathedral (+12 m) and
bell walk (+14 m); the ossuary lies at −6 m.
Camera state remains ECS-owned. See [combat and camera research](docs/combat-camera-research.md)
for primary sources, project tuning choices and validation.

The parish environment is rebuilt from scratch with a monumental cathedral,
refuge houses and chapel, courtyard arcades, arched aqueduct, open bell tower,
sunken burial vaults, cloister and roofed foundry. The old parish architecture
and arena scenery are replaced. Weathered masonry, autumn trees, circular
paving and a lighter sky follow the approved original concept. Static scenery
batches by material and spatial cell; arch collision uses the actual openings.
The map and AI distinguish stacked floors, and optional gates shorten the
postern and cathedral returns. See [the level design notes](docs/ashen-parish-level-design.md).
