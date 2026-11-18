# Sacred Capital enemy refinement 02

Status: approved for implementation. All seven enemy types have articulated, atlas-textured gameplay models. The four additions have campaign placements and distinct combat behavior. See ../../previews/enemies/README.md for review artifacts and validation.

The first lineup relied on similar rust, burgundy cloth, bandages, and familiar monster silhouettes. This pass gives each role a distinct outline, material, and landmark tied to its district. Images are visual targets rather than final topology or rig specifications.

| Enemy             | Distinctive feature                                              | Proposed behavior and placement                                                                                                                  |
| ----------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Cinder Sentinel   | Gate-shaped shield, broken civic crest, crooked neck, faded teal | Existing shield guard role on walls and bridges. Preserve visible sword windup around shield.                                                    |
| Lantern Penitent  | Backward arch, chest lantern, hanging wax fingers                | Existing ranged role in cathedral galleries. Lantern brightness can telegraph a shot.                                                            |
| Ossuary Hound     | Low head, high grave-marker shoulders, short hindquarters        | Existing rushing quadruped in gardens and tunnels. Keep four-legged gait readable.                                                               |
| Kiln Bound        | Broad ceramic mantle, low head, furnace tongs                    | Proposed foundry heavy. Tongs open before a committed clamp; long recovery.                                                                      |
| Crypt Clinger     | Folded niche posture, burial mask, reversed hands                | Proposed undercroft ambusher. Unfolds from rest before a low rush; no instant unseen hit.                                                        |
| Bell Widow        | Sideways bronze bell cowl, uneven reaching posture               | Proposed bellkeeper-walk special. Two clearly separated bell strikes with a readable pause; investigate collision and wave range after approval. |
| Procession Bearer | Empty open shrine on back, two stone-footed poles                | Proposed boss-approach special. Plants poles before shrine slam, exposing its back during recovery.                                              |

## Modeling and gameplay decisions

- Preserve the PS2 look with angular modeled anatomy, painted diffuse textures and sparse emissive areas.
- Treat large ornaments as rigid attachments; reduce small trim before sacrificing silhouette.
- Match gameplay hit volumes to the body and attacks, not decorative overhead props.
- Crypt Clinger needs distinct folded, unfolding and locomotion poses. Hound needs an actual quadruped rig.
- The generated Sentinel includes a face motif in the gate shield. Decide whether that stays as carved ornament during approval.
- Use the existing three gameplay roles as the baseline. New attacks, spawn locations and encounter balance are implemented and covered by encounter tests.

Generated with the built-in image tool. Full reproducible prompts are in enemies-v2.prompt.md and enemy-specials-v1.prompt.md.
