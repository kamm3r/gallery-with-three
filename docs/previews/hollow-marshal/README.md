# Hollow Marshal — PS2-style Blender asset

Open `hollow-marshal.blend` for the editable equestrian monument. Named components include the broken funeral mask, exposed jaw, hooked shoulder ribs, layered armor, bent fingers, buckled coat, notched sword, horse armor, tack, hanging strips, mantle and stone base. The rider uses no player geometry or rig. The approved concept and painted texture source are packed into the file; the hidden GAME collection contains the joined export.

The current pass replaces the camera-projected paintings with a **512×512, 256-color UV atlas**. Tube and loft coordinates follow the authored mesh rings. Cloth uses continuous wrapping coordinates, plates use their own local axes, and stone uses face-aligned coordinates. The texture has 5-bit channel levels, nearest magnification, mipmaps and swatch gutters. The material receives scene lighting and has no emission.

Shape changes include separate bent fingers and knuckles, defined sleeve/elbow sections, fuller webbing at the shoulder growth, exposed horse eyes and nostrils, a muzzle lip crease, face armor raised clear of the head, and circular cloak seals fitted to the actual folds. The mantle is now a closed shell with an inner lining, connected edges and a continuous uneven hem; its envelope clears the hindquarters. Horse legs have tapered forearms/cannons, defined knees and hocks, sloped pasterns and upper attachments buried in the torso. The mesh stays below 9,000 triangles. Source counts are recorded in `validation.json`. `marshal-cloak-legs.png` is a focused render of the repaired area; the validator checks that every mantle edge belongs to two faces.

`marshal-model.png`, `marshal-closeup.png`, `marshal-side.png` and `marshal-rear.png` are actual Blender renders of the exported mesh. They use studio lighting; the game applies its own lighting and postprocessing. The level uses this export at the blade walkway tip, with the generated stone-base bounds driving collision.

The surface source is `docs/concepts/capital/hollow-marshal-ps2-atlas-v1.png`, made with built-in imagegen in edit mode from a fixed swatch layout and the approved concept. The exact prompt is saved beside it in `hollow-marshal-ps2-atlas-v1.prompt.md`. This is a flat material atlas, not a generated model render. The old `marshal-projections` images are historical paint studies and are no longer used by the asset.

Rebuild and validate:

```sh
blender -b -t 8 --python-exit-code 1 --python scripts/buildCapitalStatues.py
./node_modules/.bin/vp fmt src/gameplay/generated/capitalStatueData.ts src/gameplay/generated/capitalStatuePlacement.ts
blender -b -t 8 --python-exit-code 1 --python scripts/validateHollowMarshal.py
./node_modules/.bin/vp run test
./node_modules/.bin/vp run typecheck
./node_modules/.bin/vp build
```

Geometry is authored in `scripts/capitalHollowMarshal.py`, fitted in `scripts/hollowMarshalRefine.py`, painted and UV-mapped in `scripts/hollowMarshalPaint.py`, and assembled/exported by `scripts/buildCapitalStatues.py`.

Use `vp run test`: this repository uses `node:test`; built-in `vp test` invokes Vitest and reports no suites. Whole-project `vp check` has five pre-existing formatting issues in `docs/one-page/*.html`; changed-file checks are run separately.
