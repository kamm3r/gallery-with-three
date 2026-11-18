# Archived crowned-king iteration

The active builder now outputs the [Hollow Marshal Blender asset](../hollow-marshal/README.md). This folder preserves the previous model and renders.

# Capital statue replacement

The mounted monument is an original crowned king, authored in `scripts/capitalRoyalRider.py`. Its face, short beard, open crown, sun heraldry, fitted armour, seated limbs, hands, ceremonial sword, and folded mantle are modeled independently. It uses no player meshes, rig, or textures. The standing watchman still uses the project's PS2 Pilgrim mesh. The horse is retained from the previous modeling pass.

Rebuild with:

```sh
blender -b -t 8 --python-exit-code 1 --python scripts/buildCapitalStatues.py
./node_modules/.bin/vp fmt src/gameplay/generated/capitalStatueData.ts
```

The source character is untouched. `capital-statues.blend` contains the editable frozen assets. The script writes quantized indexed mesh data into `src/gameplay/generated/capitalStatueData.ts`; `capitalStatues.ts` decodes it synchronously for the kit and level. Uniform scaling preserves anatomy. Geometry is owned and disposed by the existing environment pipeline and participates in static batching.

Only the standing watchman samples the source character albedo/AO into neutral vertex tints. The king and horse use independently authored vertex tints. The level's stone and bronze materials supply the final colour. `statue-review.png` is an offline source-geometry review, not an in-game screenshot. The watchman and mounted king contain 7,436 and 4,774 triangles respectively. `crowned-king.png` and `king-closeup.png` show the king with the level’s bronze base colour, without game lighting or screen effects.
