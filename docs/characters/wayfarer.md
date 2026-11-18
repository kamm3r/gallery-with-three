# Wayfarer NPC

A plague-road survivor near the playground Start spawn at `[3, 0, 21]`. The editor scene tree lists **Wayfarer · PS2 NPC**. The character idles, looks around, and has a solid capsule collider.

The model uses 2,452 triangles and a 256 × 256 diffuse atlas. The face has its own UV island and mesh shaped around the brow, cheekbones, nose, lips, and jaw. The pointed hood, raised collar, linen face wrap, split coat, and map satchel define the silhouette from different angles. The belt lantern adds a warm accent to the charcoal and faded burgundy palette. Each sleeve runs from shoulder to wrist as one surface. Seams, folds, facial features, and edge wear are painted into the texture.

Thomas Potter's [PS2 character modeling tutorial](https://www.youtube.com/watch?v=4nmGalgbP9A) guided the modeling and UV work. The [original Sly Cooper postmortem](https://media.gdcvault.com/GD_Mag_Archives/GDM_May_2003.pdf) informed the focus on color and details that read from the gameplay camera. [2D lead Karin Yamagiwa Madan's production notes](https://karinmadan.artstation.com/projects/XnkW6n) describe the team's texture budgets, palettes, and painted textures.

`src/gameplay/wayfarer.ts` builds the model used both in the scene and in the [turntable](../previews/wayfarer/model.html). Regenerate the texture with `uv run --with pillow python scripts/paintWayfarerAtlas.py`.
