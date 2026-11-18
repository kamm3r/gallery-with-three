# Cathedral Pilgrim: concept matching study

This revision changes the modeling and texturing method. The earlier revisions
used generic procedural volumes and a repeating material atlas, which did not
capture the approved concept. This character uses cross sections fitted to a
derived turnaround and dedicated front, rear and side painting projections.

[Open the editable Blender file](../../../../public/assets/characters/ashen-parish/pilgrim-v3/cathedral-pilgrim-v3.blend).
All the PNGs in this documentation directory are actual Blender geometry renders.
The generated painting references live separately beside the Blender source.
They are textures and non-rendering guides; they are not passed off as renders.

The model now includes the reference's broad downturned kettle brim, asymmetric
red mantle, single angular shoulder plate, rust-stained breastplate, exposed
wrists, long leather gloves, flared tunic, baggy trousers, dirty calf wraps,
short leather boots, pouch, flask and hanging token. Body, armor, cloth, equipment
and weapons remain separately editable. Hide collection 05 to inspect the body
without its sword and shield. The original 22-bone rig layout is retained.

The two painting sheets were made with the built-in image generation tool using
the approved concept as a reference. Exact prompts are in
[reference-prompts.json](reference-prompts.json). The PNGs are used unmodified;
UV padding samples inside the painted subject to avoid background-colored seams.
The source images and wear atlas are packed into the Blender file and embedded
in the GLB. The export merges copies into five modules while retaining the
individual editable source meshes in Blender.

This is a concept fidelity study for the **Cathedral Pilgrim only**. The Grave
Keeper and Penitent Knight remain in the separate revision-2 file. The new
pilgrim still needs texture blending at transitions between projection views,
painting of occluded surfaces, and movement/combat animation work. It does not
replace the current in-game model or add outfit-selection gameplay.

Rebuild and validate:

```sh
blender -b --python-exit-code 1 --python scripts/buildPilgrimV3.py
blender -b --python-exit-code 1 --python scripts/validatePilgrimV3.py
```

[Validation results](validation.json) check actual body depth, packed textures,
UV bounds, normalized skin weights, GLB re-import and basic deformation probes.
The export has 7,770 triangles, five mesh modules, 14 material primitives and
22 bones. All 365 gameplay tests and the production build pass. The full
`vp check` remains blocked by the five existing `docs/one-page/*.html` formatting
issues; built-in `vp test` retains the repository's Node/Vitest suite mismatch.
Rendered views: [three-quarter](three-quarter.png), [front](front.png),
[back](back.png), [side](side.png).
