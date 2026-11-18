# Ashen Parish modular character

Original editable low-poly character based on the approved character sheet.
The renders in this directory come from Blender geometry, not image generation.

Open [the revised Blender source](../../../public/assets/characters/ashen-parish/ashen-parish-modular-v2.blend).
The scene dropdown at the top of Blender selects:

| Scene                    | Contents                                                            |
| ------------------------ | ------------------------------------------------------------------- |
| 00 · Modular source      | Shared body and skeleton; separate outfit and equipment collections |
| 01 · Cathedral Pilgrim   | Kettle helmet, red cape, sword and round shield                     |
| 02 · Grave Keeper        | Hood, green coat, apron, grave spade, pick, keys, rope and lantern  |
| 03 · Penitent Hammer     | Layered iron armor, ochre tabard and two-handed war hammer          |
| 04 · Penitent Greatsword | The same knight armor with a two-handed greatsword                  |
| 05 · All outfits         | Rendered lineup; the default opening scene                          |

In scene 00, enable one `OUTFIT` collection and its matching `WEAPON` or
`EQUIPMENT` collection using the Outliner checkboxes. The base collection stays
enabled. The individual preset scenes have independent rig poses and share
editable mesh data with the source. Editing shared mesh data affects its presets.

The character is approximately human scale in metres, with a 22-bone original
humanoid rig. Blender coordinates are forward −Y and up +Z; GLBs export up +Y.
The two cape bones support later animation. Vertex weights are explicit; cloth
does not use simulation. Materials use one packed 512 × 512 wear atlas, also
provided as `ashen-atlas.png`.

Four GLBs live beside the Blender source. Each contains one outfit with three
mesh modules (body, outfit, equipment), one skin and one breathing preview clip.
The exports merge the source's small editable pieces and share atlas materials
to reduce draw submissions. See [validation.json](validation.json) for actual
export triangle and primitive counts.

Revision 2 replaces the thin segmented limbs with fuller continuous weighted
sleeves and trousers, adds folds and shaped glove fingers, replaces cylindrical
shoulders with curved armor shells and contoured greaves, reshapes the helmets
and boots, and gives the pilgrim a broader draped mantle. The Grave Keeper has
a shoulder cowl, a shaped apron and visible repair stitches. Atlas projection
no longer wraps across texture boundaries; wear uses gradual stains and sparse
scratches instead of rectangular noise. Material shading and studio lighting
were revised, and two-handed grips move the weapons clear of the torso.
The original Blender file is retained; `blender-lineup-v1.png` preserves its
render for comparison.

This model still needs further hand-authored shape and texture refinement, motion/deformation
checks, and retargeted locomotion/combat animations before replacing the current
game character. The shared rig deliberately does not claim compatibility with
the existing character pack. The current game and its character are unchanged.
Outfit selection is available through Blender scenes; an in-game outfit menu
has not been implemented.

Rebuild and validate from the repository root:

```sh
blender -b --python scripts/buildAshenCharacter.py
blender -b --python scripts/validateAshenCharacter.py
```

Validation: all four GLBs passed Blender re-import, shared
bone-name, embedded-texture, UV and weight checks. Exports contain 8,292–9,308
triangles and five or six material primitives each. `vp run build` and all 365
gameplay tests (`vp run test`) passed. `vp check --no-fmt` reported zero errors
and 132 existing warnings. The full `vp check` remains blocked by formatting in
five existing `docs/one-page/*.html` files; built-in `vp test` retains the
repository's Node/Vitest mismatch (65 files reported as having no Vitest suite).

The builder replaces only its own revision-2 source and generated files in this character directory
and the matching renders in this documentation directory. It does not modify
the supplied character packs. The approved concept is saved as
`approved-concept.png`; `blender-lineup.png` shows the actual model.
