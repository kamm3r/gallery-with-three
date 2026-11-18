# Hound texture cleanup v9

Mode: built-in imagegen, editing the v8 head projection source.

Source image: `public/assets/characters/ashen-parish/enemies/ossuary-hound-head-paint-v9.png`.
Runtime baked atlas: `public/assets/characters/ashen-parish/enemies/ossuary-hound-atlas-v9.png`.

The generated sheet is a paint source, not a model preview. `scripts/bakeHoundAtlas.py` blends the front/side source, supplies fur detail across the body, and bakes a conventional packed UV atlas. The runtime renders the same single skinned mesh with the baked texture.

## Final prompt

Use case: precise-object-edit. Asset type: diffuse projection source for an existing PS2 horror enemy model. Edit this two-view head texture sheet. Preserve EXACTLY the dimensions, background, cameras, head outlines, positions, scales, eye/nose/jaw/ear landmarks and front/side layout. Change ONLY the surface painting: remove the dense pale vein-like cracks, marble patterns, wood grain, shiny highlights, and excessive light/dark contrast. Replace them with readable short coarse charcoal-brown fur, subtle warm-grey sparse patches on the muzzle and forehead, and only TWO OR THREE understated healed scars. The head must look like skin and short dog fur rather than stone, wood or a network of veins. Keep amber eyes, dark nostrils, tight black lip seam, torn dark ear tissue. Keep the same gaunt canine identity and all anatomy. Flat even ambient diffuse lighting, no baked specular or directional shadow, muted dark brown/charcoal palette. Clean painted PS2 / early Resident Evil creature texture, small groups of deliberate fur strokes and large readable planes; not photoreal, not noisy, not glossy. Especially provide even, short dark fur over both necks for use as a material swatch. No equipment, no text, no new objects, no changes to background or composition.
