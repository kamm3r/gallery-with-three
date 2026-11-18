# Ossuary Hound v4

This replaces the segmented procedural Hound with a continuous, reference-fitted skin mesh. The chest, loin, neck, skull and limbs are welded and relaxed in Blender. The lower jaw, muzzle, leather harness and uneven stone fragments retain independent joint weights. The runtime submits the model as one indexed skinned mesh.

## Files

- `ossuary-hound-v4.blend`: editable mesh and projected paint source.
- `bind-pose.json`: gameplay joint matrices used when building the mesh.
- `src/gameplay/generated/ossuary-hound-v4.json`: indexed runtime geometry, UVs, normals, colours and skin weights.
- `public/assets/characters/ashen-parish/enemies/ossuary-hound-paint-v4.png`: dark-backed copy of the approved painting used for UV projection.

Rebuild with `blender -b --python-exit-code 1 --python scripts/buildOssuaryHound.py`, then format the generated JSON with `vp fmt src/gameplay/generated/ossuary-hound-v4.json`.

The standing and attack review images are rendered from the actual deformed runtime mesh by `scripts/exportEnemyPoses.ts` and `scripts/renderEnemyReview.py`.

## Paint preparation

The built-in imagegen tool prepared the dark-backed paint source from the approved concept. The geometry is built by the Blender script.

Final image-edit prompt:

Precise texture preparation edit of this approved concept sheet. Preserve ALL THREE DOG DRAWINGS exactly: same design, anatomy, position, scale, fur, equipment, lighting and painted detail. Preserve the canvas dimensions and exact layout; do not redraw, resize, shift or add anything to the dogs. Change ONLY the parchment background and title lettering: replace all parchment and all letters with an even matte dark warm grey #504b43, including every gap between the legs, every gap between ears, and around the head close-up. The dogs must remain fully intact in their original exact positions. No outlines, no new shadows, no vignettes. This is a production diffuse-paint source for UV projection onto a 3D dog, so preserving the original dogs and positions is more important than beautifying the image. Uniform dark grey background everywhere the original beige parchment showed; absolutely no beige remains outside the dogs.

## Head refinement (v7 review)

The head now has a broader skull and snout, a thin shaped mandible, splayed torn ears, heavier eyelids, arched basket bars, and crown bridle straps. These are runtime geometry changes in the same skinned asset; the approved paint source is unchanged. The close-up review is `docs/previews/enemies/hound-head-portrait-v7.png`. This was followed by the v8 head and paint correction below.

## Head and paint correction (v8)

The revised skull has forward-facing almond sockets with inset amber irises, a lower forehead, smaller cheek masses, one folded ear and one torn upright ear, a flat central bridle, and thinner cage bars. A dedicated front/side diffuse head source replaces the stretched face from the perspective concept. The built-in imagegen prompt is saved at `docs/concepts/capital/ossuary-hound-head-paint-v8-prompt.md`.

`ossuary-hound-head-paint-v8.png` is a texture source, not a model render. The Blender builder packs it above the original body paint into `ossuary-hound-atlas-v8.png`, remaps the UVs, and exports the same single skinned draw mesh. The original body pixels are preserved byte-for-byte after decoding to RGB. The editable Blender source and runtime asset are rebuilt together.

Render a genuine head pose using `node --experimental-strip-types scripts/exportEnemyPoses.ts hound /tmp/hound-head.json pounce head front`; replace `front` with `quarter`, `profile`, or `jaw`. Then pass that JSON to `scripts/renderEnemyReview.py`.

## Texture bake correction (v9)

The v9 source removes the dense pale cracks and wood-grain appearance. `scripts/bakeHoundAtlas.py` replaces the hard per-triangle projection switches with interpolated front/side paint, gives the folded ears a dedicated projection fit, and adds material-scale fur detail to the torso and legs. It bakes the result into packed `GameAtlas` UV islands on a 2048×2048 atlas, with half the space reserved for the head. Material tint is baked once; exported vertex colours are white to avoid double tinting.

The runtime uses `ossuary-hound-atlas-v9.png`. The source and built-in imagegen prompt are documented in `docs/concepts/capital/ossuary-hound-head-paint-v9-prompt.md`. The Blender builder still rebuilds the editable source and indexed skin asset together. Exported review geometry now includes the actual skinned normals, so UV island splits do not introduce false hard shading in offline renders.

## PS2 rebuild (v10)

The voxel-remeshed sculpt and projected concept paint are gone. `scripts/buildOssuaryHound.py` now lofts the hide ring by ring (12-sided trunk and skull, 8-sided limbs bridged into flank openings), about 1,750 triangles in total, with authored UV charts. `scripts/paintHoundAtlas.py` paints the 512×512 diffuse atlas (`ossuary-hound-atlas-v10.png`) in the same parametric space as the UVs and dithers it to 5 bits per channel. Soft ambient shading is baked into vertex colours. `scripts/bakeHoundAtlas.py` and the v4–v9 paint sources are no longer used.
