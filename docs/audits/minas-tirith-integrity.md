# Minas Tirith floor and collision re-audit

Re-audited 2026-10-11 after repairing the earlier findings, including the expanded lowest-tier courtyard.

## Spawn-side prow gap repair

The player's screenshot identified an actual fall-through gap beside the central
rock wall near the spawn. Terrace segments used a single polar angle for their
inner and outer endpoints, while the prow wall is straight at `x = ±4.5`. This
left an un-authored wedge nearly one metre wide at the front of the lowest tier.
The earlier surface scan missed it because the gap was outside the authored
surface outlines. Thus zero missing floors inside those outlines did not establish
that the surrounding intended walking space was complete.

The first segment on both sides of all six terraces now meets the straight wall
at both radii. Paving, foundation and collision use the same corrected outline.
`capitalProwFloor.test.ts` reproduced missing floor heights and a real capsule
falling while walking from `[±7, 0, 94]` towards `[±4.96, 0, 94]`. Both checks now
pass. The regression samples the intended strip independently of the floor outlines
across all six terraces and checks rendered paving as well as navigation heights.
The final dense scan has 512,119 unobstructed samples and zero missing floors;
all five threshold capsule support checks and all 353 Node tests pass. Production build and `vp check`
pass (zero errors, 135 warnings).

## Coplanar surface and shading repair

A further geometry probe reproduced overlapping visible floor faces at the main gate,
tier landings, chapel and gallery. The renderer now clips overlapping coplanar,
same-facing triangles before static batching. Uncovered parts retain their original
positions and world-projected UVs, and the original collision geometry is preserved.
This trims 8,720 architecture triangles and replaces the doorway-only depth bias.

Slabs now use the full outline to determine winding, including when clipping leaves
the first three vertices collinear. Their top, bottom and side faces have independent
normals: flat paving no longer bends in the lighting at each slab edge.

`capitalSeams.test.ts` checks single visible coverage at the reproduced joins,
outward faces with collinear vertices in either winding, flat top normals, and a
grid across partially overlapping rotated slabs. It also checks that nearby floors
remain separate and clipped geometry has finite positions, normals and UVs.
The final floor re-scan still covers 511,999 unobstructed points with zero missing
visible or collision floors; all five threshold capsule checks and the reference
clearance audit pass. All 351 Node tests and the production build pass. `vp check`
reports zero errors and 135 warnings. The built-in `vp test` uses Vitest and reports
no suites for the repository's `node:test` files; use the authored `vp run test` script.
Browser screenshot capture remains unreliable, so this is geometry and collision
verification rather than a complete visual walkthrough.

The default player spawn is `[14, 0, 87.5]`, next to the City Wall Ember on the
lowest terrace. These are foot coordinates; the controller places the capsule
centre above them. The exterior road is at `y = -20`, twenty metres below that
terrace. Resting at Oblivion Chapel changes the respawn to `[-7, 48, -12]`.

## Repairs

| Earlier finding                          | Repair                                                                         | Verification                                                                                 |
| ---------------------------------------- | ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| Visible gap at backyard lower door       | Added visible threshold paving                                                 | Original failing point and dense surface scan pass                                           |
| Visible gap at great gate                | Added visible threshold paving at the relocated gate                           | Original failing point and dense surface scan pass                                           |
| Visible gap at west gallery door         | Added visible threshold paving                                                 | Original failing point and dense surface scan pass                                           |
| Visible gap at colosseum gate            | Added visible threshold paving                                                 | Original failing point and dense surface scan pass                                           |
| Visible gap at colosseum lift doorway    | Added visible threshold paving                                                 | Original failing point and dense surface scan pass                                           |
| Lift side walls had no colliders         | Meshes and colliders now use one shared geometry definition                    | Player capsule is blocked on both sides of all three lifts at low, middle and high positions |
| Riding filter would ignore the new walls | Explicitly exclude only the ridden deck; attached wall handles remain blocking | Side-wall regression uses the gameplay collision predicate while already riding              |
| Town lift orientation                    | Rotate the moving deck and walls to match the angled shaft and landings        | Capsule corridor sweeps pass at both town landings                                           |

Visible thresholds use the same paving texture with a depth bias to prevent flickering where the patches overlap neighboring floors. Other already-covered thresholds remain invisible.

## Lower-city layout update

The reference-inspired lowest tier is now 35 m deep (96 m outer radius, 61 m inner radius). Eight detached blocks form an inner street and outer street, joined by cross streets. A 16 m diameter gate forecourt remains unobstructed. The great gate, stairs, shrine, breach offering and external road follow the enlarged district; affected road inhabitants and street houses move with the road. The upper tier radii are unchanged.

A new real Rapier player-capsule route test traverses both east and west inner streets, two cross streets on each side, and the outer streets. Existing full climb, breach, doorway, house and lower-road route tests continue to pass. The plan image in the design document is generated from the authored floors and blocking footprints; it is not an in-game screenshot.

## Gate and roof rendering corrections

The main entrance and approach stairs are now on the front centreline under the prow. A longitudinal entrance passage joins the lowest transverse passage through an open T junction. The prow ends at the curtain so it cannot obstruct the stairs. The real capsule route covers the stairs, gate, entrance passage, junction and return to the arrival area.

Roof and masonry panel side faces previously used one winding regardless of outline direction: some fascia vanished under backface culling, making solid panels look like floating planes. Side triangles now follow the outline's orientation. Wall infill also used base coordinates for centred blocks, placing their visible bottoms below their colliders and leaving disconnected edges; centred placement now matches collision. Lift shaft headers now connect to their sills through corner uprights.

`capitalStructure.test.ts` has regression checks for the centreline placement, shaft supports, rendered infill heights and front-face visibility of fascia from four directions for both outline windings. These checks reproduced the failures before their fixes. They extend the earlier floor-only audit, which did not detect disconnected walls or inward-facing slab edges. They are not a complete visual inspection of every roof.

## Re-audit results

- **Zero missing visible floors and zero missing collision floors** in the sampled scan.
- **604 authored walkable surfaces**, with **511,999 unobstructed sample points**. Another 58,027 points inside blocking solids are excluded.
- Interior sampling uses barycentric grids with at most 0.5 m steps. Perimeter sampling uses at most 0.25 m steps, inset 0.02 m into each surface.
- All five repaired thresholds pass actual capsule support checks at their centers; supported foot heights differ from authored floor heights by less than 0.001 m.
- All six lift boarding/exit corridors pass capsule shape sweeps against the actual static level geometry plus the new moving lift colliders.
- Lift wall checks pass at both landings and halfway through travel, including the rotated town lift. These checks reuse the same moving body across heights.
- Reference clearance audit passes: **604 surfaces, 33 doors, 24 rooms**.
- Existing route, home entry, anchor placement, boss floor, shaft clearance and navigation connectivity checks pass.
- Full automated test suite: **330 tests pass**. Production build passes. `vp check` reports zero errors and existing warnings.

## Reproduction

```sh
vp exec node --experimental-strip-types scripts/auditCapitalIntegrity.ts
vp exec node --experimental-strip-types scripts/auditCapitalMetrics.ts
vp exec node --experimental-strip-types --test tests/capital.test.ts tests/capitalMovement.test.ts tests/capitalLiftCollision.test.ts tests/enemyDeathCollision.test.ts tests/capitalStructure.test.ts
vp run test
vp check
vp run build
```

The integrity script now exits 0. Machine-readable coverage results and persistent threshold support checks are in `minas-tirith-integrity.json`.

## Limits

These results cover sampled floor coverage, static route traversal and lift collision/approach tests. They are not a proof that every decorative wall or roof is watertight, nor an exhaustive test of every jump or roll at every edge. Lift corridor checks are shape sweeps, not a complete frame-by-frame ride using the mounted controller. Intentionally open shafts and exterior voids are excluded from the floor scan. Browser screenshot inspection still failed, so this re-audit does not include a complete visual walkthrough.
