import type { ParishPoint } from "./ashenParish.ts";
import type { CapitalSurface } from "./capitalLayout.ts";

type Height = (s: CapitalSurface, x: number, z: number) => number | null;
/** Connections require a shared opening within a 0.3 m step, with capsule clearance.
 * Projected overlap alone never links stacked floors. IDs survive actor updates and retries.
 */
export function buildCapitalNavigation(
  surfaces: CapitalSurface[],
  height: Height,
  blocked: (x: number, y: number, z: number, radius: number) => boolean,
) {
  const links = new Map(surfaces.map((s) => [s.id, new Set<string>()]));
  const bounds = surfaces.map((s) =>
    ([0, 1, 2] as const).map((axis) => [
      Math.min(...s.vertices.map((p) => p[axis])),
      Math.max(...s.vertices.map((p) => p[axis])),
    ]),
  );
  const edges = (s: CapitalSurface) =>
    s.vertices.map((a, i) => [a, s.vertices[(i + 1) % s.vertices.length]] as const);
  const crossing = (a: ParishPoint, b: ParishPoint, c: ParishPoint, d: ParishPoint) => {
    const ux = b[0] - a[0],
      uz = b[2] - a[2],
      vx = d[0] - c[0],
      vz = d[2] - c[2],
      det = ux * vz - uz * vx;
    if (Math.abs(det) < 1e-8) return null;
    const t = ((c[0] - a[0]) * vz - (c[2] - a[2]) * vx) / det;
    const q = ((c[0] - a[0]) * uz - (c[2] - a[2]) * ux) / det;
    return t >= -0.001 && t <= 1.001 && q >= -0.001 && q <= 1.001
      ? ([a[0] + t * ux, a[2] + t * uz] as const)
      : null;
  };
  for (let i = 0; i < surfaces.length; i++)
    for (let j = i + 1; j < surfaces.length; j++) {
      if (
        bounds[i].some(
          ([low, high], axis) =>
            high < bounds[j][axis][0] - 0.01 || low > bounds[j][axis][1] + 0.01,
        )
      )
        continue;
      const a = surfaces[i],
        b = surfaces[j];
      const points: [number, number][] = [...a.vertices, ...b.vertices].map((p) => [p[0], p[2]]);
      for (const [p, q] of edges(a))
        for (const [r, s] of edges(b)) {
          const hit = crossing(p, q, r, s);
          if (hit) points.push([...hit]);
        }
      const overlap = points.filter(([x, z]) => {
        const ya = height(a, x, z),
          yb = height(b, x, z);
        return ya !== null && yb !== null && Math.abs(ya - yb) < 0.3;
      });
      // Sample the shared opening densely along its widest span: endpoints often lie
      // on door jambs, and a narrow clear strip may pass beside a house or a stair.
      let span: [[number, number], [number, number]] | null = null,
        widest = -1;
      for (const p of overlap)
        for (const q of overlap) {
          const d = Math.hypot(p[0] - q[0], p[1] - q[1]);
          if (d > widest) [widest, span] = [d, [p, q]];
        }
      const hasClearSpan = (p: [number, number], q: [number, number]) => {
        const length = Math.hypot(p[0] - q[0], p[1] - q[1]);
        if (length < 0.85) return false;
        const steps = Math.max(4, Math.min(60, Math.ceil(length / 0.2)));
        const clear: [number, number][] = [];
        for (let k = 1; k < steps; k++) {
          const t = k / steps,
            x = p[0] + (q[0] - p[0]) * t,
            z = p[1] + (q[1] - p[1]) * t;
          const y = height(a, x, z),
            yb = height(b, x, z);
          if (y !== null && yb !== null && Math.abs(y - yb) < 0.3 && !blocked(x, y, z, 0.42))
            clear.push([x, z]);
        }
        return clear.some((p) => clear.some((q) => Math.hypot(p[0] - q[0], p[1] - q[1]) >= 0.85));
      };
      // A doorway may straddle two terrace panels. Its longest diagonal can run
      // into a jamb while a shorter shared span still contains the clear opening.
      if (
        (span && hasClearSpan(...span)) ||
        overlap.some((p) => overlap.some((q) => hasClearSpan(p, q)))
      ) {
        links.get(a.id)!.add(b.id);
        links.get(b.id)!.add(a.id);
      }
    }
  return {
    links,
    connected: (from: string, to: string) => from === to || Boolean(links.get(from)?.has(to)),
  };
}
