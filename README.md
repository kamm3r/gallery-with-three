# The painted forest

A third-person WebGL experience built with Vite, React, React Three Fiber,
Rapier, Ecctrl, and Koota. Explore a forest clearing and jump through paintings
to enter a gallery, a collision course, Halloween Hollow, or a boss arena.

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
- Hold `Shift` to run.
- Press `Space` to jump.
- Press `F` to roll.
- Press `Escape` or click Menu to pause. Use the arrow keys and Enter to
  navigate the menu; Escape goes back or resumes play.
- Jump into a painting to travel between levels.

Touch controls appear on small or touch-enabled screens.

The pause menu freezes the player, moving platforms, animations, and portal
transitions. Display and game options include render quality, brightness,
fullscreen, camera sensitivity, inverted vertical look, control hints, and
reduced motion. Settings are saved in this browser. Returning to the forest
from the menu resets progress in the current area.

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

## Runtime and rendering

[Koota](https://github.com/pmndrs/koota) owns the shared player-position data,
vegetation instance batches, visibility statistics, and moving-platform motion.
Traits and systems live in `gameplay/ecs`. View effects register entities and
destroy them on unmount. Rapier still owns character and collision physics;
React still owns menus and settings. This is an incremental ECS migration.

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

The proving grounds at `/playground` have a 160 × 160 checkerboard floor.
The reference-course extension adds a curved checker hill, red loop, open boat
with a gangplank and mast, branching balance beams, angled wall teeth, and a
stepped tower. The hill and loop use triangle colliders to preserve their curves
and openings. These are procedural approximations of the recording, not its assets.
Ground labels mark 10/20/35/50/65-degree slopes, 18/30/48-cm stairs,
three pyramid/bump fields, seams, narrow beams and gaps, several ledge heights,
80–200-cm passages, low ceilings, rounded contacts, corners, and pushable boxes.
Platforms translate on all three axes; a separate platform rotates. Their ECS
system runs before fixed physics steps to keep motion independent of rendering.
Some obstacles intentionally exceed the controller's limits.

## Player animation source

The editable character is `art/characters/Casual_Male_gameplay.blend`; the original
pack file is untouched. It retains the original actions and adds ledge grab,
hang and pull-up, jump rise/fall/landing, sit enter/idle/exit, and two retimed
sword slashes. These are authored/derived skeletal actions, not motion capture.
The exported `Casual_Male_gameplay.glb` is the runtime model. A bone-attached
sword is visible in the boss encounter. Damage uses the slash's contact window.
Airborne exports remove the source animation's extra vertical lift; physics owns
the jump arc. Ledge detection requires a near-vertical wall and a walkable top,
so ordinary sloped riverbanks cannot be mistaken for hanging ledges.

At a ledge, Space starts the one-second pull-up and backward movement drops.
The controller supplies climb translation; the clip supplies the body pose.
Use E at a seat to sit or stand. The Blender pose sheet is
`art/characters/animation-poses.png` (source material colours, before game styling).

To regenerate with Blender installed:

```bash
blender -b 'public/assets/Ultimate Animated Character Pack - Nov 2019-20260917T180531Z-1-001/Ultimate Animated Character Pack - Nov 2019/Blends/Casual_Male.blend' --python scripts/buildCharacterAnimations.py
blender -b art/characters/Casual_Male_gameplay.blend --python scripts/previewCharacterAnimations.py
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
