import * as THREE from "three";
import { capitalStatueGeometry } from "./capitalStatues.ts";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

type Size = readonly [number, number, number];
/** Construction pieces shared by the city and its kit catalogue. */
export type CapitalKitModel =
  | "block"
  | "pillar"
  | "post"
  | "wall"
  | "crate"
  | "corner-wall"
  | "walkway"
  | "stairs"
  | "room"
  | "hallway"
  | "curved-stairs"
  | "elevator"
  | "doorway"
  | "door"
  | "double-door"
  | "fallen-beam"
  | "scaffold"
  | "wooden-bridge"
  | "drum"
  | "debris"
  | "log-pile"
  | "roof"
  | "spire"
  | "window"
  | "banner"
  | "arch-window"
  | "arch-panel"
  | "bridge-arch"
  | "tapered-drum"
  | "sentinel-statue"
  | "greatsword"
  | "equestrian-statue"
  | "cage-brazier"
  | "flame"
  | "gable-panel"
  | "dome"
  | "ring"
  | "lawn-quadrant"
  | "bare-tree"
  | "crane";

/** Deterministic scatter, so clutter pieces are identical in the catalogue and the city. */
function scatter(seed: number) {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
}

/**
 * Metre-sized construction pieces. `block` is centred; every other piece stands on Y=0,
 * centred in X/Z. Openings and stair flights face +Z; stairs climb towards -Z.
 */
function buildGeometry(model: CapitalKitModel, size: Size, thickness = 0.2): THREE.BufferGeometry {
  if (model === "sentinel-statue" || model === "equestrian-statue")
    return capitalStatueGeometry(model, size);
  const [w, h, d] = size;
  const t = thickness;
  const parts: THREE.BufferGeometry[] = [];
  const box = (
    x: number,
    y: number,
    z: number,
    sx: number,
    sy: number,
    sz: number,
    rotation?: THREE.Euler,
  ) => {
    const g = new THREE.BoxGeometry(sx, sy, sz);
    if (rotation) g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(rotation));
    parts.push(g.translate(x, y, z));
  };
  const cylinder = (x: number, y: number, z: number, r: number, height: number, lying = 0) => {
    const g = new THREE.CylinderGeometry(r, r, height, 12);
    if (lying) g.rotateZ(Math.PI / 2).rotateY(lying);
    parts.push(g.translate(x, y, z));
  };
  // Broad painted zones survive the 360-line presentation; no extra draw calls.
  const paint = (from: number, color: string) => {
    const c = new THREE.Color(color);
    for (const part of parts.slice(from)) {
      const count = part.getAttribute("position").count;
      const values = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) values.set([c.r, c.g, c.b], i * 3);
      part.setAttribute("color", new THREE.BufferAttribute(values, 3));
    }
  };
  if (model === "block") return new THREE.BoxGeometry(w, h, d);
  if (model === "crate") box(0, h / 2, 0, w, h, d);
  else if (model === "pillar") {
    // A square shaft under a wider cap block with its vertical corners cut off. The cap
    // fills the footprint; the shaft is set in from it.
    const cap = Math.min(0.8, h * 0.27),
      cut = Math.min(w, d) * 0.12;
    box(0, (h - cap) / 2, 0, w * 0.76, h - cap, d * 0.76);
    const outline = [
      [-w / 2 + cut, -d / 2],
      [w / 2 - cut, -d / 2],
      [w / 2, -d / 2 + cut],
      [w / 2, d / 2 - cut],
      [w / 2 - cut, d / 2],
      [-w / 2 + cut, d / 2],
      [-w / 2, d / 2 - cut],
      [-w / 2, -d / 2 + cut],
    ];
    const shape = new THREE.Shape(outline.map(([x, y]) => new THREE.Vector2(x, y)));
    parts.push(
      new THREE.ExtrudeGeometry(shape, { depth: cap, bevelEnabled: false })
        .rotateX(-Math.PI / 2)
        .translate(0, h - cap, 0),
    );
  } else if (model === "post") {
    // Round bollard on a square foot, finished with a ball knob.
    const knob = w * 0.42;
    cylinder(0, (h - knob) / 2, 0, w * 0.3, h - knob);
    box(0, w * 0.12, 0, w, w * 0.24, d);
    parts.push(new THREE.SphereGeometry(knob, 12, 8).translate(0, h - knob, 0));
  } else if (model === "wall") {
    // A free-standing wall with a coping lip along the top that overhangs both faces.
    // The faces are across the thinner of X and Z.
    const lip = Math.min(0.3, h * 0.1),
      over = 0.2,
      alongX = w >= d;
    box(0, (h - lip) / 2, 0, w, h - lip, d);
    box(0, h - lip / 2, 0, alongX ? w : w + 2 * over, lip, alongX ? d + 2 * over : d);
  } else if (model === "corner-wall") {
    // A back (-Z) wall and a left (-X) wall joined by a 45° chamfer, extruded from the
    // footprint. Shape Y is -Z, so `rotateX` stands it up on the floor.
    const c = Math.min(w, d) * 0.4,
      k = t * Math.tan(Math.PI / 8);
    const outline = [
      [w / 2, d / 2],
      [-w / 2 + c, d / 2],
      [-w / 2, d / 2 - c],
      [-w / 2, -d / 2],
      [-w / 2 + t, -d / 2],
      [-w / 2 + t, d / 2 - c - k],
      [-w / 2 + c + k, d / 2 - t],
      [w / 2, d / 2 - t],
    ];
    const shape = new THREE.Shape(outline.map(([x, y]) => new THREE.Vector2(x, y)));
    parts.push(
      new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false }).rotateX(-Math.PI / 2),
    );
  } else if (model === "walkway") {
    // A bridge deck: a thin slab between two tall, thin side boards (`t` thick, `h`
    // tall) that stand on the floor along its long edges.
    const deck = 0.15;
    box(0, deck / 2, 0, w - 2 * t, deck, d);
    for (const side of [-1, 1]) box(side * (w / 2 - t / 2), h / 2, 0, t, h, d);
  } else if (model === "stairs") {
    // A straight flight of 0.2 m risers and 0.3 m treads, then a top landing. Each step
    // only reaches a fixed depth below its tread, so the underside is stepped, and
    // the landing is a slab of the same depth.
    const count = Math.max(1, Math.round(h / 0.2)),
      rise = h / count,
      run = Math.min(0.3, d / count),
      slab = Math.min(h, 0.5 + rise);
    for (let i = 0; i < count; i++) {
      const top = rise * (i + 1),
        depth = Math.min(top, slab);
      box(0, top - depth / 2, d / 2 - run * (i + 0.5), w, depth, run);
    }
    const landing = d - run * count;
    if (landing > 0.01) box(0, h - slab / 2, -d / 2 + landing / 2, w, slab, landing);
  } else if (model === "room") {
    // Open-topped shell. The front (+Z) wall has a doorway; halls add a side door too.
    const door = Math.min(1.4, w - 2 * t),
      doorH = Math.min(2.4, h);
    box(0, t / 2, 0, w, t, d);
    box(0, h / 2, -d / 2 + t / 2, w, h, t);
    const sideDoor = w >= 8;
    for (const side of [-1, 1]) {
      const x = side * (w / 2 - t / 2);
      if (side > 0 && sideDoor) {
        const front = d / 2 - t - 1.2;
        box(x, h / 2, (-d / 2 + front - door) / 2, t, h, front - door + d / 2);
        box(x, h / 2, (front + d / 2) / 2, t, h, d / 2 - front);
        box(x, (h + doorH) / 2, front - door / 2, t, h - doorH, door);
      } else box(x, h / 2, 0, t, h, d);
    }
    const side = (w - door) / 2;
    for (const s of [-1, 1]) box((s * (w - side)) / 2, h / 2, d / 2 - t / 2, side, h, t);
    if (h > doorH) box(0, (h + doorH) / 2, d / 2 - t / 2, door, h - doorH, t);
  } else if (model === "hallway") {
    // A covered corridor: floor, two walls and a ceiling, open at both ends.
    box(0, t / 2, 0, w, t, d);
    box(0, h - t / 2, 0, w, t, d);
    for (const side of [-1, 1]) box(side * (w / 2 - t / 2), h / 2, 0, t, h - 2 * t, d);
  } else if (model === "curved-stairs") {
    // A half-turn flight around the -Z half circle, climbing from -X to +X. Each tread
    // only reaches a fixed depth below its nosing, so the underside is stepped too.
    const outer = w / 2,
      inner = outer * 0.45,
      count = Math.max(2, Math.round(h / 0.15)),
      rise = h / count,
      depth = (i: number) => Math.min(rise * (i + 1), 0.5 + rise);
    for (let i = 0; i < count; i++) {
      const a0 = (Math.PI * i) / count,
        a1 = (Math.PI * (i + 1)) / count;
      const shape = new THREE.Shape();
      shape.absarc(0, 0, outer, a0, a1, false);
      shape.absarc(0, 0, inner, a1, a0, true);
      shape.closePath();
      const top = rise * (count - i);
      const step = new THREE.ExtrudeGeometry(shape, {
        depth: depth(count - i - 1),
        bevelEnabled: false,
        curveSegments: 3,
      })
        .rotateX(-Math.PI / 2)
        .translate(0, top - depth(count - i - 1), 0);
      parts.push(step.scale(1, 1, d / w));
    }
  } else if (model === "elevator") {
    // A shaft frame with a sill, header and continuous corner uprights.
    // The central opening stays clear for the moving car and both landing exits.
    const border = Math.max(t, 0.3);
    const ring = (y: number, thick: number) => {
      box(0, y, -(d - border) / 2, w, thick, border);
      box(0, y, (d - border) / 2, w, thick, border);
      for (const s of [-1, 1]) box((s * (w - border)) / 2, y, 0, border, thick, d - 2 * border);
    };
    ring(h - 0.2, 0.4);
    ring(0.1, 0.2);
    for (const x of [-1, 1])
      for (const z of [-1, 1])
        box((x * (w - border)) / 2, h / 2, (z * (d - border)) / 2, border, h, border);
  } else if (model === "doorway" || model === "door" || model === "double-door") {
    // Upright surround in the XY plane: two broad jambs and a lintel, open at the floor.
    // Door leaves hinge separately (`capitalKitLeaves`) so they can swing.
    box(-w / 2 + t / 2, h / 2, 0, t, h, d);
    box(w / 2 - t / 2, h / 2, 0, t, h, d);
    box(0, h - t / 2, 0, w - 2 * t, t, d);
  } else if (model === "fallen-beam") {
    // A collapsed timber support beam lying along Z: a square-edged section cut into
    // short lengths with hairline joints. Some lengths have a chunk knocked out of a
    // top corner, and the +Z end is snapped into splinters. It is rolled onto its -X
    // edge, so it tilts across its width.
    const rand = scatter(19),
      first = parts.length,
      seg = 0.3,
      stub = 0.5,
      count = Math.floor((d - stub) / seg);
    for (let i = 0; i < count; i++) {
      const z = -d / 2 + seg * (i + 0.5);
      if (rand() < 0.22) {
        // A chunk out of one top corner: the length is cut down on that side.
        const side = rand() < 0.5 ? -1 : 1,
          bite = w * (0.25 + rand() * 0.15),
          drop = h * (0.25 + rand() * 0.2);
        box(0, (h - drop) / 2, z, w, h - drop, seg - 0.006);
        box((-side * bite) / 2, h - drop / 2, z, w - bite, drop, seg - 0.006);
      } else box(0, h / 2, z, w, h, seg - 0.006);
    }
    // The snapped end: four splinters of uneven length and height.
    const z0 = -d / 2 + count * seg;
    for (let k = 0; k < 4; k++) {
      const len = (d / 2 - z0) * (0.3 + rand() * 0.7),
        pw = w / 4;
      box(
        -w / 2 + pw * (k + 0.5),
        (h * (0.5 + rand() * 0.4)) / 2,
        z0 + len / 2,
        pw - 0.02,
        h * (0.5 + rand() * 0.4),
        len,
        new THREE.Euler((rand() - 0.5) * 0.1, (rand() - 0.5) * 0.1, 0),
      );
    }
    // Roll the beam about its -X edge so the +X side rides up.
    const roll = new THREE.Matrix4().makeRotationZ(0.14);
    for (const part of parts.slice(first))
      part
        .translate(w / 2, 0, 0)
        .applyMatrix4(roll)
        .translate(-w / 2, 0, 0);
  } else if (model === "wooden-bridge") {
    // A long, run-down plank bridge spanning Z, its deck top at `h`. Cross planks on
    // two beams (a short post at each end) are missing, snapped short, skewed or
    // sagging, and a couple of the lost ones lie on the floor underneath.
    const rand = scatter(31),
      post = 0.2,
      beams = [-0.3 * w, 0.3 * w],
      end = d / 2 - 0.2;
    let fallen = 0;
    for (let z = -d / 2 + 0.15; z < d / 2 - 0.1; z += 0.29) {
      const roll = rand();
      if (roll < 0.12) {
        // A missing plank; the first two lie dropped beneath the deck.
        if (fallen++ < 2)
          box(
            (rand() - 0.5) * w * 0.4,
            0.06,
            z + (rand() - 0.5) * 0.3,
            w * (0.5 + rand() * 0.3),
            0.12,
            0.26,
            new THREE.Euler(0, (rand() - 0.5) * 0.9, 0),
          );
        continue;
      }
      const snapped = roll < 0.28,
        len = w * (snapped ? 0.6 + rand() * 0.2 : 0.85 + rand() * 0.15),
        side = rand() < 0.5 ? -1 : 1,
        x = snapped ? side * (w - len) * 0.5 : (rand() - 0.5) * (w - len);
      box(
        x,
        h - 0.07 - rand() * 0.05,
        z + (rand() - 0.5) * 0.06,
        len,
        0.14,
        0.27,
        new THREE.Euler(0, (rand() - 0.5) * 0.1, (rand() - 0.5) * 0.05),
      );
    }
    for (const x of beams) {
      box(x, h - 0.27, 0, 0.22, 0.26, d - 0.1);
      for (const z of [-end, end]) box(x, (h - 0.14) / 2, z, post, h - 0.14, post);
    }
  } else if (model === "scaffold") {
    // Four legs, two long bearers and a deck of loose cross boards.
    const rand = scatter(29);
    for (const sx of [-1, 1])
      for (const sz of [-1, 1]) box((sx * (w - 0.2)) / 2, h / 2, (sz * (d - 0.2)) / 2, 0.2, h, 0.2);
    for (const sx of [-1, 1]) box((sx * (w - 0.2)) / 2, h - 0.1, 0, 0.2, 0.2, d);
    for (let z = -d / 2 + 0.15; z < d / 2; z += 0.32)
      box(
        (rand() - 0.5) * 0.25,
        h + 0.04,
        z,
        w + 0.2 + rand() * 0.3,
        0.06,
        0.26,
        new THREE.Euler(0, (rand() - 0.5) * 0.12, 0),
      );
  } else if (model === "debris") {
    // Scattered offcuts; `thickness` scales the pieces (0.2 → 0.12–0.42 m).
    const rand = scatter(47),
      k = t / 0.2;
    for (let i = 0; i < 16; i++) {
      const s = (0.12 + rand() * 0.3) * k;
      box(
        (rand() - 0.5) * Math.max(0, w - s),
        s * 0.25 + rand() * h * 0.5,
        (rand() - 0.5) * Math.max(0, d - s),
        s * (1 + rand()),
        s * 0.5,
        s,
        new THREE.Euler((rand() - 0.5) * 0.6, rand() * Math.PI, (rand() - 0.5) * 0.6),
      );
    }
  } else if (model === "log-pile") {
    // A packed cluster of sawn rounds stood on end, one rolled onto its side.
    const rand = scatter(83),
      r = Math.min(w, d) / 3 / 2 - 0.02,
      cols = Math.max(1, Math.floor(w / (2 * r))),
      rows = Math.max(1, Math.floor(d / (2 * r)));
    let n = 0;
    for (let row = 0; row < rows; row++)
      for (let col = 0; col < cols; col++, n++) {
        if (n === 4) continue;
        const rr = r * (0.82 + rand() * 0.18),
          x = -w / 2 + r + col * 2 * r + (row % 2) * r * 0.5 + (rand() - 0.5) * 0.08,
          z = -d / 2 + r + row * 2 * r + (rand() - 0.5) * 0.08,
          len = Math.min(h, 0.25 + rand() * 0.2);
        if (n === cols * rows - 1) cylinder(x, rr, z, rr, len, rand() * Math.PI);
        else cylinder(x, len / 2, z, rr, len);
      }
  } else if (model === "drum") {
    cylinder(0, h / 2, 0, w / 2, h);
  } else if (model === "roof") {
    // A gable roof: its ridge runs along X at height `h`, the slopes fall to ±Z, and the
    // eaves overhang the footprint by `t` all round.
    const shape = new THREE.Shape([
      new THREE.Vector2(-d / 2 - t, 0),
      new THREE.Vector2(d / 2 + t, 0),
      new THREE.Vector2(0, h),
    ]);
    parts.push(
      new THREE.ExtrudeGeometry(shape, { depth: w + 2 * t, bevelEnabled: false })
        .rotateY(Math.PI / 2)
        .translate(-w / 2 - t, 0, 0),
    );
  } else if (model === "gable-panel") {
    const shape = new THREE.Shape([
      new THREE.Vector2(-w / 2, 0),
      new THREE.Vector2(w / 2, 0),
      new THREE.Vector2(0, h),
    ]);
    parts.push(
      new THREE.ExtrudeGeometry(shape, { depth: d, bevelEnabled: false }).translate(0, 0, -d / 2),
    );
  } else if (model === "spire") {
    // A four-sided pyramid cap on a short square drum.
    const drum = Math.min(h * 0.15, 0.6);
    box(0, drum / 2, 0, w, drum, d);
    parts.push(
      new THREE.ConeGeometry(Math.SQRT1_2, 1, 4, 1)
        .rotateY(Math.PI / 4)
        .scale(w, h - drum, d)
        .translate(0, drum + (h - drum) / 2, 0),
    );
  } else if (model === "window") {
    // A window surround in the XY plane: sill, head, jambs and a centre mullion, `t` broad.
    box(0, t / 4, 0.05, w + 0.2, t / 2, d + 0.1);
    box(0, h - t / 2, 0, w, t, d);
    for (const s of [-1, 1]) box((s * (w - t)) / 2, h / 2, 0, t, h, d);
    box(0, h / 2, 0, t / 2, h - t, d / 2);
  } else if (model === "arch-window" || model === "arch-panel") {
    const radius = w / 2,
      spring = h - radius;
    const shape = new THREE.Shape();
    shape.moveTo(-radius, 0);
    shape.lineTo(radius, 0);
    shape.lineTo(radius, spring);
    shape.absarc(0, spring, radius, 0, Math.PI, false);
    shape.closePath();
    if (model === "arch-window") {
      const inner = radius - t;
      const hole = new THREE.Path();
      hole.moveTo(-inner, t);
      hole.lineTo(-inner, spring);
      hole.absarc(0, spring, inner, Math.PI, 0, true);
      hole.lineTo(inner, t);
      hole.closePath();
      shape.holes.push(hole);
    }
    parts.push(
      new THREE.ExtrudeGeometry(shape, {
        depth: d,
        bevelEnabled: false,
        curveSegments: 12,
      }).translate(0, 0, -d / 2),
    );
  } else if (model === "bridge-arch") {
    // A full spandrel around an open-bottom semicircular arch, standing in XY.
    const inner = w / 2 - t,
      spring = h - t - inner;
    const shape = new THREE.Shape();
    shape.moveTo(-w / 2, 0);
    shape.lineTo(-w / 2, h);
    shape.lineTo(w / 2, h);
    shape.lineTo(w / 2, 0);
    shape.lineTo(inner, 0);
    shape.lineTo(inner, spring);
    shape.absarc(0, spring, inner, 0, Math.PI, false);
    shape.lineTo(-inner, 0);
    shape.closePath();
    parts.push(
      new THREE.ExtrudeGeometry(shape, {
        depth: d,
        bevelEnabled: false,
        curveSegments: 16,
      }).translate(0, 0, -d / 2),
    );
  } else if (model === "greatsword") {
    // Forged blade: sharp edges, raised shoulders and a recessed central fuller.
    const profile = [-1, -0.64, -0.2, 0, 0.2, 0.64, 1];
    const relief = [0, 0.42, 0.48, 0.22, 0.48, 0.42, 0];
    const levels = [
      [0, 0.015],
      [0.12, 0.22],
      [0.65, 0.31],
      [0.72, 0.27],
    ];
    const vertices: number[] = [];
    const triangle = (a: number[], b: number[], c: number[]) => vertices.push(...a, ...b, ...c);
    for (const side of [-1, 1]) {
      const at = (row: number, col: number) => [
        profile[col] * w * levels[row][1],
        levels[row][0] * h,
        side * relief[col] * d,
      ];
      for (let row = 0; row < levels.length - 1; row++)
        for (let col = 0; col < profile.length - 1; col++) {
          const a = at(row, col),
            b = at(row, col + 1),
            c = at(row + 1, col + 1),
            e = at(row + 1, col);
          if (side > 0) {
            triangle(a, b, c);
            triangle(a, c, e);
          } else {
            triangle(a, c, b);
            triangle(a, e, c);
          }
        }
    }
    const blade = new THREE.BufferGeometry();
    blade.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
    const uv: number[] = [];
    for (let i = 0; i < vertices.length; i += 3)
      uv.push(vertices[i] / w + 0.5, vertices[i + 1] / h);
    blade.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    blade.computeVertexNormals();
    const bladeColors: number[] = [];
    for (let i = 0; i < vertices.length; i += 9) {
      const x = (Math.abs(vertices[i]) + Math.abs(vertices[i + 3]) + Math.abs(vertices[i + 6])) / 3;
      const shade = x < w * 0.07 ? 0.38 : x < w * 0.21 ? 0.73 : 0.95;
      for (let j = 0; j < 3; j++) bladeColors.push(shade, shade, shade);
    }
    blade.setAttribute("color", new THREE.Float32BufferAttribute(bladeColors, 3));
    parts.push(blade);
    const guard = new THREE.Shape();
    guard.moveTo(-w * 0.5, h * 0.705);
    guard.lineTo(-w * 0.47, h * 0.75);
    guard.lineTo(-w * 0.13, h * 0.765);
    guard.lineTo(w * 0.13, h * 0.765);
    guard.lineTo(w * 0.47, h * 0.75);
    guard.lineTo(w * 0.5, h * 0.705);
    guard.lineTo(w * 0.1, h * 0.728);
    guard.lineTo(-w * 0.1, h * 0.728);
    guard.closePath();
    parts.push(
      new THREE.ExtrudeGeometry(guard, { depth: d * 1.4, bevelEnabled: false }).translate(
        0,
        0,
        -d * 0.7,
      ),
    );
    paint(1, "#9e8d69");
    const grip = parts.length;
    cylinder(0, h * 0.858, 0, d * 0.42, h * 0.19);
    paint(grip, "#433b36");
    for (let i = 0; i < 12; i++)
      parts.push(
        new THREE.TorusGeometry(d * 0.46, d * 0.07, 4, 10)
          .rotateX(Math.PI / 2)
          .translate(0, h * (0.775 + i * 0.015), 0),
      );
    parts.push(
      new THREE.SphereGeometry(1, 8, 6)
        .scale(w * 0.085, h * 0.035, d * 0.85)
        .translate(0, h * 0.965, 0),
    );
  } else if (model === "cage-brazier") {
    // Crown-shaped basket; chunky forged ribs remain readable at PS2 resolution.
    cylinder(0, h * 0.025, 0, w * 0.38, h * 0.05);
    cylinder(0, h * 0.36, 0, w * 0.085, h * 0.65);
    cylinder(0, h * 0.66, 0, w * 0.2, h * 0.06);
    parts.push(new THREE.CylinderGeometry(w * 0.46, w * 0.2, h * 0.1, 8).translate(0, h * 0.73, 0));
    for (const level of [0.79, 0.97])
      parts.push(
        new THREE.TorusGeometry(w * 0.46, w * 0.035, 4, 8)
          .rotateX(Math.PI / 2)
          .translate(0, h * level, 0),
      );
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      cylinder(Math.cos(a) * w * 0.46, h * 0.875, Math.sin(a) * d * 0.46, w * 0.045, h * 0.25);
      parts.push(
        new THREE.ConeGeometry(w * 0.065, h * 0.06, 4).translate(
          Math.cos(a) * w * 0.46,
          h * 0.97,
          Math.sin(a) * d * 0.46,
        ),
      );
    }
    paint(0, "#77716a");
    const collars = parts.length;
    for (const level of [0.1, 0.58, 0.65]) cylinder(0, h * level, 0, w * 0.16, h * 0.035);
    paint(collars, "#c0a474");
  } else if (model === "flame") {
    parts.push(
      new THREE.SphereGeometry(1, 7, 5).scale(w * 0.5, h * 0.3, d * 0.5).translate(0, h * 0.3, 0),
    );
    parts.push(
      new THREE.ConeGeometry(1, 1, 7)
        .scale(w * 0.4, h * 0.65, d * 0.4)
        .rotateZ(-0.15)
        .translate(w * 0.06, h * 0.67, 0),
    );
  } else if (model === "tapered-drum") {
    // Octagonal transition: thickness is the top-to-bottom radius ratio.
    parts.push(
      new THREE.CylinderGeometry(Math.max(0.01, t), 1, h, 8)
        .rotateY(Math.PI / 8)
        .scale(w / 2, 1, d / 2)
        .translate(0, h / 2, 0),
    );
  } else if (model === "dome") {
    parts.push(
      new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2).scale(w / 2, h, d / 2),
    );
  } else if (model === "ring") {
    const radius = Math.min(w, d) / 2;
    const shape = new THREE.Shape();
    shape.absarc(0, 0, radius, 0, Math.PI * 2, false);
    const hole = new THREE.Path();
    hole.absarc(0, 0, Math.max(0.01, radius - t), 0, Math.PI * 2, true);
    shape.holes.push(hole);
    parts.push(
      new THREE.ExtrudeGeometry(shape, {
        depth: h,
        bevelEnabled: false,
        curveSegments: 24,
      }).rotateX(-Math.PI / 2),
    );
  } else if (model === "lawn-quadrant") {
    // One quarter of a circular lawn, clipped back from both crossing paths and
    // from the central fountain. Rotate four copies around the same centre.
    const radius = Math.min(w, d) / 2,
      inner = Math.min(radius * 0.26, 3.38),
      margin = Math.min(t, inner / Math.SQRT2 - 0.01),
      outerAngle = Math.asin(margin / radius),
      innerAngle = Math.asin(margin / inner);
    const shape = new THREE.Shape();
    shape.absarc(0, 0, radius, outerAngle, Math.PI / 2 - outerAngle, false);
    shape.lineTo(margin, Math.sqrt(inner * inner - margin * margin));
    shape.absarc(0, 0, inner, Math.PI / 2 - innerAngle, innerAngle, true);
    shape.closePath();
    parts.push(
      new THREE.ExtrudeGeometry(shape, {
        depth: h,
        bevelEnabled: false,
        curveSegments: 24,
      }).rotateX(-Math.PI / 2),
    );
  } else if (model === "bare-tree") {
    const rand = scatter(1717),
      up = new THREE.Vector3(0, 1, 0);
    const limb = (a: THREE.Vector3, b: THREE.Vector3, r0: number, r1: number) => {
      const direction = b.clone().sub(a),
        length = direction.length();
      const g = new THREE.CylinderGeometry(r1, r0, length, 6);
      g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up, direction.normalize()));
      parts.push(g.translate(...a.clone().add(b).multiplyScalar(0.5).toArray()));
    };
    const branch = (
      start: THREE.Vector3,
      direction: THREE.Vector3,
      length: number,
      radius: number,
      depth: number,
    ) => {
      const end = start.clone().addScaledVector(direction, length);
      limb(start, end, radius, radius * 0.65);
      if (depth === 0) return;
      for (const side of [-1, 1]) {
        const next = direction
          .clone()
          .add(
            new THREE.Vector3(
              side * (0.3 + rand() * 0.45),
              (rand() - 0.4) * 0.45,
              (rand() - 0.5) * 0.9,
            ),
          )
          .normalize();
        branch(end, next, length * (0.58 + rand() * 0.12), radius * 0.62, depth - 1);
      }
    };
    const foot = new THREE.Vector3(),
      bend = new THREE.Vector3(-w * 0.12, h * 0.23, d * 0.015),
      crown = new THREE.Vector3(-w * 0.22, h * 0.43, d * 0.04);
    limb(foot, bend, w * 0.065, w * 0.045);
    limb(bend, crown, w * 0.045, w * 0.028);
    for (let i = 0; i < 9; i++) {
      const angle = i * 2.399;
      branch(
        crown.clone().lerp(bend, i % 3 === 0 ? 0.35 : 0),
        new THREE.Vector3(
          Math.cos(angle) * 0.8,
          0.25 + rand() * 0.4,
          Math.sin(angle) * 0.8,
        ).normalize(),
        h * (0.27 + rand() * 0.11),
        w * 0.025,
        5,
      );
      const root = new THREE.Vector3(Math.cos(angle) * w * 0.24, 0.08, Math.sin(angle) * d * 0.24);
      limb(new THREE.Vector3(0, h * 0.08, 0), root, w * 0.04, w * 0.006);
    }
  } else if (model === "crane") {
    const up = new THREE.Vector3(0, 1, 0);
    const beam = (a: number[], b: number[], width: number) => {
      const start = new THREE.Vector3(...a),
        end = new THREE.Vector3(...b),
        direction = end.clone().sub(start);
      const g = new THREE.BoxGeometry(width, direction.length(), width);
      g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up, direction.normalize()));
      parts.push(g.translate(...start.add(end).multiplyScalar(0.5).toArray()));
    };
    const pivot = [0, h * 0.62, 0],
      tip = [0, h, d * 0.5];
    beam([0, 0, 0], pivot, 0.3);
    for (const side of [-1, 1]) beam([(side * w) / 2, 0, -d * 0.2], pivot, 0.2);
    beam([0, h * 0.35, -d * 0.3], tip, 0.26);
    beam(pivot, tip, 0.16);
    beam(tip, [0, h * 0.38, d * 0.5], 0.045);
    box(0, h * 0.35, d * 0.5, 0.18, 0.3, 0.18);
  } else if (model === "banner") {
    // A cloth hanging from a rod, swallow-tailed at the foot.
    box(0, h - 0.05, 0, w + 0.3, 0.1, 0.1);
    box(0, (h - 0.1 + h * 0.18) / 2, 0, w, h - 0.1 - h * 0.18, d);
    for (const s of [-1, 1]) box((s * w) / 4, (h * 0.18) / 2, 0, w / 2 - 0.04, h * 0.18, d);
  }
  const flat = parts.map((p) => (p.index ? p.toNonIndexed() : p));
  for (const p of flat) {
    p.clearGroups();
    if (!p.hasAttribute("color"))
      p.setAttribute(
        "color",
        new THREE.BufferAttribute(
          new Float32Array(p.getAttribute("position").count * 3).fill(1),
          3,
        ),
      );
  }
  const merged = mergeGeometries(flat)!;
  for (const p of new Set([...parts, ...flat])) p.dispose();
  return merged;
}

export function capitalKitGeometry(model: CapitalKitModel, size: Size, thickness?: number) {
  const geometry = buildGeometry(model, size, thickness);
  geometry.userData.capitalKit = model;
  return geometry;
}

/** One hinged door leaf: a box whose front hinge edge sits on the local origin. */
export type CapitalKitLeaf = {
  geometry: THREE.BufferGeometry;
  /** Hinge position in the piece's frame. */
  hinge: Size;
  /** Rotation about Y that swings the leaf fully open towards +Z. */
  openAngle: number;
};

/**
 * The swinging leaves of a `door` (one, hinged on the left jamb) or `double-door` (two,
 * hinged on each jamb, meeting in the middle). Both open outwards, towards +Z.
 */
export function capitalKitLeaves(
  model: CapitalKitModel,
  size: Size,
  thickness = 0.2,
): CapitalKitLeaf[] {
  const [w, h, d] = size;
  const t = thickness;
  const count = model === "door" ? 1 : model === "double-door" ? 2 : 0;
  const width = (w - 2 * t) / Math.max(1, count),
    depth = Math.max(0.05, d * 0.5);
  return Array.from({ length: count }, (_, i) => {
    const side = i === 0 ? 1 : -1;
    const geometry = new THREE.BoxGeometry(width - 0.03, h - t - 0.02, depth).translate(
      (side * width) / 2,
      (h - t) / 2,
      -depth / 2,
    );
    geometry.userData.capitalKit = "leaf";
    return {
      geometry,
      hinge: [-side * (w / 2 - t), 0, depth / 2] as Size,
      openAngle: (-side * Math.PI) / 2,
    };
  });
}

/**
 * Project the checker at a consistent 4 m world scale, choosing one axis per face so a
 * cathedral wall and a small pier share cell sizes. Indexed input is returned de-indexed.
 */
export function capitalKitUv(geometry: THREE.BufferGeometry, transform = new THREE.Matrix4()) {
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  const pos = g.getAttribute("position");
  const rotation = new THREE.Matrix3().setFromMatrix4(transform);
  const uv: number[] = [];
  const v = new THREE.Vector3(),
    n = new THREE.Vector3();
  const a = new THREE.Vector3(),
    b = new THREE.Vector3(),
    c = new THREE.Vector3();
  for (let i = 0; i < pos.count; i += 3) {
    a.fromBufferAttribute(pos, i);
    b.fromBufferAttribute(pos, i + 1);
    c.fromBufferAttribute(pos, i + 2);
    n.subVectors(b, a).cross(c.sub(a)).applyMatrix3(rotation);
    const horizontal = Math.abs(n.y) >= Math.max(Math.abs(n.x), Math.abs(n.z));
    const eastWest = Math.abs(n.x) > Math.abs(n.z);
    for (let j = 0; j < 3; j++) {
      v.fromBufferAttribute(pos, i + j).applyMatrix4(transform);
      if (horizontal) uv.push(v.x / 4, v.z / 4);
      else if (eastWest) uv.push(v.z / 4, v.y / 4);
      else uv.push(v.x / 4, v.y / 4);
    }
  }
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  return g;
}

/** Adaptable floor slabs follow curved routes and clipped lift openings. */
export function capitalKitPanel(top: readonly Size[], thickness = 1) {
  const n = top.length;
  const vertices = [...top, ...top.map(([x, y, z]) => [x, y - thickness, z])];
  const indices: number[] = [];
  // Use the whole outline: clipping can leave the first three points collinear.
  const normal = top.reduce((area, [x, , z], i) => {
    const next = top[(i + 1) % n];
    return area + z * next[0] - x * next[2];
  }, 0);
  for (let i = 1; i < n - 1; i++) {
    if (normal > 0) indices.push(0, i, i + 1, n, n + i + 1, n + i);
    else indices.push(0, i + 1, i, n, n + i, n + i + 1);
  }
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    if (normal > 0) indices.push(i, n + i, n + j, i, n + j, j);
    else indices.push(i, n + j, n + i, i, j, n + j);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(vertices.flat(), 3));
  g.setIndex(indices);
  // Masonry has hard edges. Shared corner normals made flat paving bulge in the
  // lighting and revealed a dark seam at every adjacent panel.
  const flat = g.toNonIndexed();
  g.dispose();
  flat.setIndex(Array.from({ length: flat.getAttribute("position").count }, (_, i) => i));
  flat.computeVertexNormals();
  flat.userData.capitalKit = "floor";
  return flat;
}

/** Door frames are thin (0.15 m) with broad jambs, leaving `w - 2·border` clear. */
const frame = (w: number, h: number, border: number) => ({
  size: [w, h, 0.15] as Size,
  thickness: border,
});

/** The reference layout: props row, walkways and stairs, wall blocks and rooms, openings. */
export const capitalKitCatalogue: Array<{
  name: string;
  model: CapitalKitModel;
  size: Size;
  position: Size;
  rotation?: Size;
  thickness?: number;
}> = [
  {
    name: "Fallen beam",
    model: "fallen-beam",
    size: [0.6, 0.55, 4.6],
    position: [-19.3, 0, -11],
  },
  {
    name: "Wooden bridge",
    model: "wooden-bridge",
    size: [2, 0.72, 4.7],
    position: [-16.6, 0, -11.2],
  },
  {
    name: "Chips",
    model: "debris",
    size: [2.1, 0.15, 1],
    position: [-12.8, 0, -13.2],
    thickness: 0.16,
  },
  { name: "Offcut", model: "crate", size: [1, 0.12, 0.3], position: [-12.7, 0, -11.4] },
  {
    name: "Debris",
    model: "debris",
    size: [2.4, 0.6, 1.9],
    position: [-10.3, 0, -12.6],
    thickness: 0.5,
  },
  { name: "Log rounds", model: "log-pile", size: [2.4, 0.5, 2.4], position: [-10.6, 0, -9.9] },
  {
    name: "Corner wall",
    model: "corner-wall",
    size: [2.6, 3, 3],
    position: [-7.8, 0, -12.1],
    thickness: 0.35,
  },
  { name: "Pillar 1.1 m", model: "pillar", size: [1.1, 3, 1.1], position: [-5, 0, -12.9] },
  { name: "Pillar 0.95 m", model: "pillar", size: [0.95, 2.9, 0.95], position: [-3.3, 0, -12.9] },
  { name: "Post", model: "post", size: [0.55, 2.2, 0.55], position: [-2, 0, -12.9] },
  { name: "Wall 3 × 3", model: "wall", size: [3, 3, 0.5], position: [1.2, 0, -12.9] },
  { name: "Drum", model: "drum", size: [0.52, 0.3, 0.52], position: [-8.2, 0, -10.9] },
  { name: "Crate S", model: "crate", size: [0.6, 0.45, 0.6], position: [-8.2, 0, -9.9] },
  { name: "Crate M", model: "crate", size: [0.68, 0.5, 0.68], position: [-7.1, 0, -11.7] },
  { name: "Crate tall", model: "crate", size: [0.78, 0.7, 1], position: [-7.2, 0, -10.3] },
  { name: "Crate long", model: "crate", size: [0.72, 0.55, 1], position: [-5.8, 0, -11.6] },
  { name: "Crate wide", model: "crate", size: [1.3, 0.4, 0.94], position: [-5.3, 0, -10.2] },
  { name: "Crate lidded", model: "crate", size: [1.25, 0.6, 0.9], position: [-3.9, 0, -11.6] },
  { name: "Crate low", model: "crate", size: [1.25, 0.3, 0.85], position: [-3.9, 0, -10.2] },
  { name: "Beam 3.2", model: "crate", size: [0.42, 0.35, 3.2], position: [-2.2, 0, -10.6] },
  { name: "Beam 3.4", model: "crate", size: [0.42, 0.35, 3.4], position: [-0.4, 0, -10.4] },
  { name: "Beam 3", model: "crate", size: [0.4, 0.3, 3], position: [1, 0, -10.6] },
  { name: "Wall 2.6 × 2.4", model: "wall", size: [0.55, 2.4, 2.6], position: [2.6, 0, -10.4] },
  {
    name: "Bridge 1.5",
    model: "walkway",
    thickness: 0.12,
    size: [1.5, 0.9, 7],
    position: [-18.6, 0, -3.6],
  },
  {
    name: "Bridge 2",
    model: "walkway",
    thickness: 0.12,
    size: [2, 0.9, 7],
    position: [-16.4, 0, -3.6],
  },
  {
    name: "Bridge 4",
    model: "walkway",
    thickness: 0.12,
    size: [4, 0.9, 7],
    position: [-12.8, 0, -3.6],
  },
  { name: "Stairs 1.6", model: "stairs", size: [1.6, 2, 7], position: [-6, 0, -3.6] },
  { name: "Stairs 2", model: "stairs", size: [2, 2, 7], position: [-3.6, 0, -3.6] },
  { name: "Stairs 4", model: "stairs", size: [4, 2, 7], position: [0.2, 0, -3.6] },
  { name: "Hallway 1.8", model: "hallway", size: [1.8, 3, 5], position: [-18.3, 0, 4.6] },
  { name: "Hallway 2.4", model: "hallway", size: [2.4, 3, 5], position: [-16, 0, 4.6] },
  { name: "Hallway 4", model: "hallway", size: [4, 3, 5], position: [-12.6, 0, 4.6] },
  { name: "Room 4", model: "room", size: [4, 2.6, 4], position: [-7.4, 0, 5] },
  { name: "Room 4.4", model: "room", size: [4.2, 2.6, 4.4], position: [-2.4, 0, 5] },
  { name: "Hall 12 × 8", model: "room", size: [12, 3, 8], position: [7.6, 0, 4.4] },
  {
    name: "Elevator",
    model: "elevator",
    size: [4, 2.6, 4],
    position: [6.2, 0, -12],
    thickness: 1,
  },
  { name: "Elevator car", model: "crate", size: [1.9, 0.3, 1.9], position: [6.2, 1.1, -12] },
  {
    name: "Half-turn stairs",
    model: "curved-stairs",
    size: [4.4, 2.8, 4.4],
    position: [5.4, 0, -6.4],
  },
  { name: "Doorway S", model: "doorway", ...frame(1.8, 2.6, 0.4), position: [3.8, 0, -2.4] },
  { name: "Doorway M", model: "doorway", ...frame(2.2, 2.6, 0.45), position: [6.4, 0, -2.4] },
  { name: "Double door", model: "double-door", ...frame(4.8, 3.2, 0.6), position: [12.4, 0, -11] },
  { name: "Door S", model: "door", ...frame(1.8, 2.6, 0.4), position: [10.8, 0, -7.4] },
  { name: "Door M", model: "door", ...frame(2.2, 2.6, 0.45), position: [13.6, 0, -7.4] },
  { name: "Doorway L", model: "doorway", ...frame(4.8, 3.2, 0.6), position: [12.4, 0, -3.6] },
  {
    name: "Gable roof",
    model: "roof",
    size: [4, 1.6, 3],
    position: [16.6, 0, -11],
    thickness: 0.3,
  },
  { name: "Spire", model: "spire", size: [2, 3.2, 2], position: [16.4, 0, -7.4] },
  {
    name: "Window",
    model: "window",
    size: [1.2, 1.8, 0.2],
    position: [16.4, 0, -3.6],
    thickness: 0.2,
  },
  { name: "Banner", model: "banner", size: [1, 2.6, 0.05], position: [16.4, 0, -1.4] },
  {
    name: "Arched window",
    model: "arch-window",
    size: [1.8, 3, 0.3],
    position: [20, 0, -12],
    thickness: 0.2,
  },
  { name: "Arch inset", model: "arch-panel", size: [1.4, 2.6, 0.08], position: [23, 0, -12] },
  { name: "Dome", model: "dome", size: [3, 1.5, 3], position: [20, 0, -7] },
  {
    name: "Fountain ring",
    model: "ring",
    size: [3, 0.5, 3],
    position: [24, 0, -7],
    thickness: 0.3,
  },
  {
    name: "Lawn quadrant",
    model: "lawn-quadrant",
    size: [6, 0.1, 6],
    position: [22, 0, -1],
    thickness: 0.4,
  },
  { name: "Bare tree", model: "bare-tree", size: [5, 6, 5], position: [29, 0, -7] },
  { name: "Stone sentinel", model: "sentinel-statue", size: [1.5, 3, 1.25], position: [33, 0, -2] },
  {
    name: "Tower taper",
    model: "tapered-drum",
    size: [3, 2, 3],
    thickness: 0.7,
    position: [37, 0, 2],
  },
  {
    name: "Bridge arch",
    model: "bridge-arch",
    size: [6, 7, 1.2],
    position: [36, 0, -7],
    thickness: 0.7,
  },
  { name: "Greatsword", model: "greatsword", size: [3, 8, 0.3], position: [42, 0, -7] },
  {
    name: "Hollow Marshal",
    model: "equestrian-statue",
    size: [3.7, 6.4, 4.4],
    position: [47, 0, -7],
  },
  { name: "Cage brazier", model: "cage-brazier", size: [0.8, 2.6, 0.8], position: [41, 0, -1] },
  { name: "Flame", model: "flame", size: [0.45, 0.65, 0.45], position: [43, 0, -1] },
  { name: "Hoist crane", model: "crane", size: [3, 5, 4], position: [29, 0, 1] },
];

export type CapitalKitPalette = "orange" | "blue" | "floor";
const palettes: Record<CapitalKitPalette, { light: string; dark: string; line: string }> = {
  orange: { light: "#ffcb62", dark: "#eea43f", line: "#ffe2a0" },
  blue: { light: "#2f587d", dark: "#203f61", line: "#4d78a0" },
  floor: { light: "#dfe1e3", dark: "#b7bbc0", line: "#eef0f1" },
};

/**
 * The reference blockout material: a 1 m checker in which every metre is split into
 * quarter-metre tiles, so the darker squares read as clusters of small cells.
 */
export function capitalKitTexture(palette: CapitalKitPalette = "orange") {
  const { light, dark, line } = palettes[palette];
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = line;
  ctx.fillRect(0, 0, 256, 256);
  for (let row = 0; row < 16; row++)
    for (let col = 0; col < 16; col++) {
      ctx.fillStyle = (Math.floor(row / 4) + Math.floor(col / 4)) % 2 ? dark : light;
      ctx.fillRect(col * 16 + 1, row * 16 + 1, 14, 14);
    }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 8;
  return texture;
}
