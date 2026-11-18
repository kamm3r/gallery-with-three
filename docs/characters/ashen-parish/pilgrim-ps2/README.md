# Cathedral Pilgrim: PS2 souls-like, animation-ready

[Blender source](../../../../public/assets/characters/ashen-parish/pilgrim-ps2/cathedral-pilgrim-ps2.blend) ·
[GLB](../../../../public/assets/characters/ashen-parish/pilgrim-ps2/cathedral-pilgrim-ps2.glb) ·
[atlas](../../../../public/assets/characters/ashen-parish/pilgrim-ps2/pilgrim-ps2-atlas.png) ·
[validation](validation.json)

Built from revision 4 (left untouched) by `scripts/ps2Pilgrim.py`:

```sh
blender -b --python-exit-code 1 --python scripts/ps2Pilgrim.py
blender -b --python-exit-code 1 --python scripts/validatePilgrimPs2.py
node --experimental-strip-types --test tests/pilgrimPs2.test.ts
```

## PS2 look

- **7.4k triangles**: body 6.6k, sword 142, shield 726. Revision 4 had 16.7k
  triangles spread across 130 loose parts. The cape and mantle are decimated,
  and the micro-bevels and hidden detail are gone.
- **One material, one 512² texture.** Albedo and ambient occlusion are baked into
  a shared atlas, then quantised to a **128-colour palette**, like an 8-bit CLUT
  texture. Sampling is nearest-neighbour, the material is fully rough, and there
  are no normal or specular maps. The face and hood opening get 3× texel density.
- **Grade:** slightly desaturated with lifted blacks, so the colours sit in the
  muted King's Field / early-souls range.

## Rig

- **Skeleton:** the Universal Animation Library 2 (UE-mannequin) skeleton, with
  all 65 bones under the same names, hierarchy and rest orientations (max
  difference 0.03°). It adds `cape_01` and `cape_02`, which follow the chest and
  are ready for spring physics.
- **Bind pose:** T-pose. The authored A-pose guard stance was inverse-skinned
  onto the T-pose with a round-trip error under 0.001 mm. It is the GLB's default
  pose and is also stored as the `Pilgrim_Guard_Pose` clip.
- **Weights:** smooth weights from distance to the posed bone segments, with at
  most 3 influences. The skirt follows the thighs at partial strength, and armour
  plates blend only between neighbouring torso bones.
- **Hands:** new five-finger gloves weighted to the finger bones, so clips can
  open and close them. The sword grip runs across the right palm, with the thumb
  over the index finger. The shield grip runs across the left palm, the board
  sits on the back of the hand, and a forearm strap holds it on the arm.
- **Weapons:** `Pilgrim_Sword` is rigid on `hand_r` and `Pilgrim_Shield` on
  `hand_l`. Each is a separate mesh, so it can be hidden or swapped.

## Using it in three.js

The GLB embeds `Pilgrim_Guard_Pose` plus these UAL2 clips: Idle_Shield_Loop,
Sword_Regular_A/B/C/Combo, Sword_Heavy_Combo, Sword_Block, Sword_Dash,
Shield_Dash, Shield_OneShot, Idle_Shield_Break, Hit_Knockback, Consume and
Zombie_Walk_Fwd_Loop. Play them with `AnimationMixer` as usual.

In the embedded clips, the left-hand finger channels are pinned to the guard
grip. UAL2's sword-only clips assume an empty off-hand and would open the hand
off the shield grip.

Any other UAL2 clip can be loaded straight from `UAL2_Standard.glb`, because the
bones match by name and rest orientation. Keep the quaternion tracks and the
`pelvis`/`root` position tracks. Drop the other bones' position tracks, which
would impose the mannequin's proportions. While the shield is equipped, also
drop the `*_l` finger tracks.

## Renders

`front`, `three-quarter`, `back`, `right-side`, `face` and the fist close-ups
show the default guard pose. Each `anim-*.png` is a frame of a UAL2 clip
playing on this rig in Blender.

## In the game

The player now wears the Pilgrim (`PLAYER_MODEL` in
`src/gameplay/characterAnimations.ts`). The Killer enemy keeps Casual_Male.
`scripts/retargetPilgrimGameplay.py` bakes all 37 of the game's player clips
onto the Pilgrim skeleton under their original names and writes
`cathedral-pilgrim-ps2-gameplay.glb`. Add `-- --renders` to refresh
[gameplay-sheet.png](gameplay-sheet.png).

- **Retargeting:** each bone copies the source bone's world rotation relative
  to rest; both rigs rest in a T-pose. Hip motion is scaled by leg length
  (0.70). The fingers keep the guard grip.
- **Sword alignment:** a fixed hand offset lines the blade up with the original
  sword in every clip.
- **Game objects:** the sword and shield are `PlayerSword` and `PlayerShield`,
  and both hide when unarmed. The flashlight mounts on `SwordSocket`.
- **Scale:** the model is drawn at 1.05 world metres per unit.
  `LEDGE_HAND_HEIGHT` is 1.855 m, measured from the hang pose.

Re-run the retarget after rebuilding the model:

```sh
blender -b --python-exit-code 1 --python scripts/ps2Pilgrim.py
blender -b --python-exit-code 1 --python scripts/retargetPilgrimGameplay.py
```
