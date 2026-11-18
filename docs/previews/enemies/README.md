# Sacred Capital enemy implementation

Approved references: [refinement 02](../../concepts/capital/enemies-v2.png) and [special encounters](../../concepts/capital/enemy-specials-v1.png).

Seven articulated models replace the original untextured rigs. The shared diffuse atlas is at `public/assets/characters/ashen-parish/enemies/sacred-capital-atlas.png`; its generation prompt is saved with the concepts. Models use about 2,500–3,900 triangles each. Geometry is batched within joints, retaining separate shoulders, elbows, knees, hands, heads, jaws and props. A restrained atlas-based baked-light contribution keeps colors readable in shaded districts.

| Enemy             | Campaign placement                            | Defining features                                                                                                                                  |
| ----------------- | --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cinder Sentinel   | Existing wall, bridge, town and garden guards | Open wicket shield, face ornament, broken civic fan, teal armor; guarded sword combo.                                                              |
| Lantern Penitent  | Existing cathedral, gallery and town casters  | Arched spine, wax mask, chest lantern, candle arch; ember cast.                                                                                    |
| Ossuary Hound     | Existing garden, town and tunnel packs        | Low blind muzzle, iron jaw brace, high grave markers, cord tail; quadruped lunge.                                                                  |
| Kiln Bound        | Foundry street, replacing one guard           | Cracked ceramic mantle, recessed iron mask, leather apron, two-handed articulated tongs; slow clamp and long recovery.                             |
| Crypt Clinger     | Undercroft tunnel, replacing one hound        | Burial frame, split wood mask, folded limbs, elongated hands; gradual close-range unfolding and low rush. Ground constraints for hands and feet.   |
| Bell Widow        | Bellkeeper's walk, replacing beacon guard     | Hollow tilted bell, aged face and hair, indigo mourning strips, long bracing arm, wooden hammer; two audible bronze strikes and radial floor cues. |
| Procession Bearer | Cathedral boss approach, replacing nave guard | Empty open shrine, ochre cloth, bronze face, stone-footed walking poles; planted-pole shrine slam and long recovery.                               |

## Review

`review.html` is a development review artifact. With `vp dev` running, open `/docs/previews/enemies/review.html`. Add `?phase=windup` or `?phase=strike` to compare attack poses. It imports the actual gameplay model factory and pose application. Studio lighting exposes model surfaces.

- `gameplay-idle.png`: neutral/folded lineup in Three.js.
- `gameplay-windup.png`: attack preparations.
- `gameplay-attack.png`: contact poses.
- `campaign-widow.png`, `campaign-bearer.png`, `campaign-kiln.png`, `campaign-clinger.png`: live campaign models with PS2 presentation and scene lighting.
- `campaign-errors.json`: runtime exceptions observed during district inspections.

Alternative offline geometry inspection:

```sh
node --experimental-strip-types scripts/exportEnemyReview.ts /tmp/enemy-review.json
blender -b -t 8 --python scripts/renderEnemyReview.py -- /tmp/enemy-review.json docs/previews/enemies/offline-review.png
```

Offline lighting differs from gameplay. The Three.js and campaign captures are the visual verification targets.

## Validation

`parishSpecialEnemies.test.ts` checks district floors and clearance, attack timing, recovery, both bell strikes, wall/floor separation, avoiding the shrine slam, Clinger wake-up, finite joint transforms, pose continuity, and batched versus original geometry for all seven models. Existing collision, respawn, defense and AI tests remain in the full suite.

`vp run test` passes 395 tests. Production build and type checking pass. Changed files pass `vp check`; repository-wide `vp check` is stopped by formatting in five pre-existing `docs/one-page/*.html` files. Repository lint/type checking also runs separately with `vp check --no-fmt`.

## Animation recording

`enemy-animations-60fps.mp4` is the corrected, silent 52-second animation review: the seven-enemy lineup followed by Bell Widow and Procession Bearer closeups. It covers idle, locomotion in place, windup, contact, recovery, stagger, silhouette rotation, and death. These are the actual gameplay rigs and pose functions on the studio review stage, rather than a recording of a player encounter.

For replay, open `review.html?animate=1` with the dev server running, then call `window.enemyReview.play()` in the console. Add `&kinds=widow,bearer` for the special-enemy view. The corrected video uses `window.enemyReview.exportVideo({fps:60})`: every pose is evaluated at an exact 1/60-second step, rendered, and encoded with WebCodecs. Both 1,560-frame sections are combined as H.264 MP4 at 1920×880 and 60fps. Rendering time does not affect playback timing. The older `enemy-animations.mp4` used a realtime screen recording that captured only about 2.38 frames per second during active motion; its 30fps container repeated frames and is superseded.

## Anatomy and motion refinement

The earlier reel `enemy-animations-refined-60fps.mp4` predates the model and attack rework below. The current revision is shown in the multi-angle pose sheets.

- `src/gameplay/enemyMotion.ts` contains per-enemy anticipation, contact and follow-through poses, stride timing, step height, stance duration and weight shifts. These are the main artistic animation controls.
- `src/gameplay/parishRigPose.ts` applies anatomical hinges, explicit IK bend poles, joint limits, yaw-relative planted feet and palms, supported weapons, and different collapse poses.
- `src/gameplay/parishModels.ts` owns bone lengths, mirrored hand anatomy and prop attachment points. The Widow has an extended support arm. Fixed finger grips are batched; the Penitent retains animated casting fingers.

All rigs use +Z as forward. Elbows flex around negative local X; human knees flex around positive local X. Quadruped forelegs use their own elbow pole. A planted hand has its palm toward the floor and fingers toward the actor's forward direction, including after the actor turns.

`enemyAnatomy.test.ts` tests hinge direction, reach, bend limits, facing yaw, palm/finger orientation, distinct gaits, the Clinger's lifted attacking hand, two-handed tong grips, and actual joint-transform continuity across attack phases. The full suite passes 395 tests.

## Model and attack rework

The earlier Kiln Bound had disconnected garment strips and exposed gaps between waist and knees. Its pelvis now connects to a continuous leather wrap, with a rear bib, full harness and joined hip moulds. Separate fired-clay shoulder shells and a back bridge create a real neck opening.

These sheets contain front, rear, side, preparation, contact and follow-through views of the actual gameplay geometry:

- [Kiln Bound](kiln-long-weapon-poses.png): connected garment and torso; two-handed torso-driven tong clamp. Both grips remain attached across all sampled attack frames.
- [Lantern Penitent](acolyte-rebuilt-poses.png): draws both hands to its chest lantern, then extends a casting palm. The projectile originates at lantern height.
- [Ossuary Hound](hound-rebuilt-poses.png): crouch, extended forelegs, bite and landing.
- [Crypt Clinger](clinger-rebuilt-poses.png): raised hand drawn behind the shoulder, cross-body rake at body height, planted support hand.
- [Bell Widow](widow-rebuilt-poses.png): hammer pulls away from the bell and reaches its moving rim at contact. The calculation accounts for the model scale and hammer grip.
- [Procession Bearer](bearer-rebuilt-poses.png): braces on the poles and tips its shrine on a modeled back hinge; the shrine roof reaches the floor at the damage frame. Attack-start range matches its reach.

The Sentinel's established sword attack remains unchanged.

`enemyAttackContact.test.ts` checks the continuous rear garment, both tong grips throughout every attack phase, hammer-to-rim contact, and shrine-to-floor contact. These checks supplement visual pose inspection. Offline review lighting differs from in-game lighting.

Reproduce a sheet with:

```sh
node --experimental-strip-types scripts/exportEnemyPoses.ts kiln
blender -b -t 8 --python scripts/renderEnemyReview.py -- /tmp/kiln-poses.json docs/previews/enemies/kiln-rebuilt-poses.png
```

### Kiln weapon proportions

The current tongs have approximately 45% more overall length, wider and thicker jaws, and a lower diagonal carry matching the concept's visible silhouette. The two grip anchors remain fixed; only the working end extends. `kiln-long-weapon-poses.png` shows the updated model. Grip, anatomy and rendering tests pass after this change.

### Kiln attack pattern clip

`kiln-attack-pattern-60fps.mp4` shows two real-time cycles from front and side using the current enlarged tongs: 1.35 seconds of windup, 0.65 seconds of forward thrust and clamp, and 1.70 seconds of recovery. Contact occurs 0.32 seconds into the strike. The clip contains 444 fixed-step frames at 60fps (7.4 seconds).

The review view is `/docs/previews/enemies/review.html?animate=1&kinds=kiln&views=front,side&attack=1`, exported with `window.enemyReview.exportVideo({fps:60,seconds:7.4,start:5})`.
