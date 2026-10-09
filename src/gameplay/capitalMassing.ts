import type { ParishPoint } from "./ashenParish.ts";
import type { CapitalSurface } from "./capitalLayout.ts";

export type CapitalFoundation = { surface: CapitalSurface; bottom: number };

/** Closed masonry under the terraces, with the same lift wells as the paving. */
export function buildCapitalFoundations(
  shafts: Array<{ id: string; center: ParishPoint }>,
): CapitalFoundation[] {
  const foundations: CapitalFoundation[] = [];
  const disk = (id: string, radius: number, top: number, bottom: number) => {
    const vertices = Array.from({ length: 24 }, (_, i): ParishPoint => {
      const a = (i * Math.PI * 2) / 24;
      return [Math.sin(a) * radius, top, 12 + Math.cos(a) * radius];
    });
    foundations.push({ surface: { id, area: "kiln", layer: "upper", vertices }, bottom });
  };
  disk("chapel-podium", 24.5, 23.35, 0);
  disk("entry-podium", 31.5, 7.35, -4);
  for (const [id, x0, x1, z0, z1] of [
    ["plaza-north", -19, 19, -44, -31],
    ["plaza-south", -19, 19, -25, -20],
    ["plaza-tunnel-roof", -19, 19, -31, -25],
    ["chapel-neck", -11, 11, -20, 10],
  ] as const)
    foundations.push({
      surface: {
        id,
        area: "yard",
        layer: "upper",
        vertices: [
          [x0, 23.35, z0],
          [x0, 23.35, z1],
          [x1, 23.35, z1],
          [x1, 23.35, z0],
        ],
      },
      bottom: id === "plaza-tunnel-roof" ? 19 : 0,
    });
  // The eastern town rests on broad descending masonry terraces. Keep their
  // highest coping below the cellar so the inhabited floors and returns stay clear.
  for (let i = 0; i < 10; i++) {
    const x0 = 70 + i * 2,
      x1 = x0 + 2,
      top = 3.3 - i * 1.2;
    foundations.push({
      surface: {
        id: `town-retaining-step:${i}`,
        area: "foundry",
        layer: "lower",
        vertices: [
          [x0, top, -18],
          [x0, top, 30],
          [x1, top, 30],
          [x1, top, -18],
        ],
      },
      bottom: -18,
    });
  }
  const clip = (v: ParishPoint[], axis: 0 | 2, edge: number, less: boolean) => {
    const out: ParishPoint[] = [];
    for (let i = 0; i < v.length; i++) {
      const a = v[i],
        b = v[(i + 1) % v.length];
      const inside = less ? a[axis] <= edge : a[axis] >= edge;
      const next = less ? b[axis] <= edge : b[axis] >= edge;
      if (inside) out.push(a);
      if (inside !== next) {
        const t = (edge - a[axis]) / (b[axis] - a[axis]);
        out.push(a.map((value, j) => value + (b[j] - value) * t) as ParishPoint);
      }
    }
    return out;
  };
  let result = foundations;
  for (const shaft of shafts) {
    const cut: CapitalFoundation[] = [];
    for (const f of result) {
      let remaining = f.surface.vertices;
      for (const [axis, edge, less] of [
        [0, shaft.center[0] - 3.1, true],
        [0, shaft.center[0] + 3.1, false],
        [2, shaft.center[2] - 3.1, true],
        [2, shaft.center[2] + 3.1, false],
      ] as const) {
        if (remaining.length < 3) break;
        const outside = clip(remaining, axis, edge, less);
        if (outside.length >= 3)
          cut.push({
            ...f,
            surface: {
              ...f.surface,
              id: `${f.surface.id}:${shaft.id}:${cut.length}`,
              vertices: outside,
            },
          });
        remaining = clip(remaining, axis, edge, !less);
      }
    }
    result = cut;
  }
  return result;
}
