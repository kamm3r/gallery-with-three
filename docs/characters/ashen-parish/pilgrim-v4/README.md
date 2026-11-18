# Cathedral Pilgrim refinement: revision 4

[Editable Blender source](../../../../public/assets/characters/ashen-parish/pilgrim-v4/cathedral-pilgrim-v4.blend)
and [GLB export](../../../../public/assets/characters/ashen-parish/pilgrim-v4/cathedral-pilgrim-v4.glb).
Revision 3 and its original painting references remain intact.

The reported extra arm was a texture-projection defect: the full-character
painting was being sampled by garment surfaces behind the real arm. The tunic,
cape, mantle, wraps and gloves now use a dedicated surface-only atlas. Other
occluded surfaces use bounded patches of the appropriate cloth, steel, leather
or brass, rather than arbitrary regions of the full painted figure.

The refinement also:

- Shortens and seats the sword hilt inside the fist, places the guard below the
  fingers, and gives the thinner blade a slight outward resting angle.
- Replaces painted glove features with clean leather and modeled fingers and
  thumbs, retaining the shared hand bones.
- Removes the face fragment from the helmet rim with a separate iron surface.
- Replaces the stretched mantle clasp with a fitted leather strap and a modeled
  brass buckle, and adds a dark neck lining beneath the hood.
- Adds shield arm straps and connections from the belt to the pouch, flask and
  hanging token.
- Closes the sleeve-to-wrist air gap and tucks the cape's upper edge inside the
  mantle where the two garments overlap.
- Fits the mantle around the sleeve volumes. The rest-pose intersection check
  verifies that neither sleeve cuts through the mantle.
- Uses continuous garment UVs with padding inside each atlas tile, preventing
  neighboring material bleed and the previous collapsed cloak UVs.

The additional atlas was made with the built-in image generation tool from the
existing pilgrim reference. It contains only red cloth, charcoal fabric, brown
leather and beige wraps; it contains no character or equipment. The exact prompt
is in [surface-texture-prompt.json](surface-texture-prompt.json). Final PNGs in
this documentation directory are actual Blender renders of the refined meshes.

The view audit includes front, back, both sides, both front three-quarter views,
a rear three-quarter view, and close-ups of the arm, head and boots. In
[armpit-diagnostic.png](armpit-diagnostic.png), the actual right arm and weapons
are hidden so a painted duplicate cannot be concealed by the real limb.

[Validation results](validation.json) include source and GLB checks, garment
material/UV restrictions, a geometric test that the pommel is inside the glove,
guard placement and equipment attachment checks. The finger segments share the
existing hand bones; they do not yet have individual finger animation. Movement
and combat animation retargeting, an in-game outfit selector and further artistic
polish remain outside this refinement pass.

Continue refining the same source file and validate from the repository root:

```sh
blender -b --python-exit-code 1 --python scripts/polishPilgrim.py
blender -b --python-exit-code 1 --python scripts/validatePilgrimV4.py
```

The polish script edits this existing Blender file in place and refreshes its
GLB and renders. It does not create another revision. `refinePilgrimV4.py` is
the earlier baseline reconstruction, rather than the ongoing editing command.

The latest pass rebuilds the pouch as a rounded leather volume with a fitted
flap, fastener and belt hanger; fits the cape along the torso; closes the helmet
crown/brim seam and thins the rim to 4 mm; removes background texture strips
from both shoulder plates; and replaces the blocky shield supports with two
continuous leather bands around the forearm. Targeted close-ups accompany the
full-character renders. Geometric checks cover pouch contact, cape spacing,
the helmet seam, and shield attachment and arm clearance.

The subsequent detail pass seats the hood and upper face beneath the helmet,
removes stray hood projection marks, replaces the flask's painted outline with
a closed vessel with a narrow neck and shoulder, thins the religious token and
seats its cord, and places the sword guard directly beneath the curled fingers.
The head, hanging gear and sword grip each have a dedicated close-up render.

The belt now uses clean leather with an open modeled brass buckle, pin, tongue
and keeper. The devotional tag has a solid body, physical red cross and hanging
eye. The hand pass reduces palm bulk, aligns the sword behind the fingers and
lowers the shield around the left fist with a modeled handgrip and brackets.

Verification: source and GLB regression checks pass, including zero rest-pose
mantle/sleeve intersections on either side. The production build and all 365
gameplay tests pass. `vp check --no-fmt` has zero errors and the existing 132
warnings. Full `vp check` retains the existing one-page HTML formatting issues;
built-in `vp test` retains the Node/Vitest runner mismatch. Those unrelated
files and the in-game character have not been changed by this refinement.
