"""PS2-style Ossuary Hound: hand-lofted low-poly skin, authored UV charts and a
painted 512px atlas. Run in Blender:

    blender -b --python-exit-code 1 --python scripts/buildOssuaryHound.py

All coordinates use the game's X-right / Y-up / Z-forward frame. Geometry is
built ring by ring (no remesh, no decimate, no projected concept art), so the
silhouette, edge flow and texel layout are all deliberate.
"""
import bpy, json, math, sys
import numpy as np
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
from paintHoundAtlas import paint_atlas, RECTS, SIZE

OUT = ROOT / 'src/gameplay/generated/ossuary-hound-v4.json'
ATLAS = ROOT / 'public/assets/characters/ashen-parish/enemies/ossuary-hound-atlas-v10.png'
DOC = ROOT / 'docs/characters/ashen-parish/ossuary-hound-v4'
BIND = json.loads((DOC / 'bind-pose.json').read_text())
P = {b['name']: Vector(b['position']) for b in BIND}
NAMES = list(P)
INDEX = {name: i for i, name in enumerate(NAMES)}
TAU = math.tau


def clamp(t, a=0.0, b=1.0):
    return max(a, min(b, t))


def uv_in(rect, u, v):
    """Normalised chart coordinates (v down) -> atlas UV, inset half a texel."""
    x0, y0, x1, y1 = RECTS[rect]
    px = x0 + .5 + clamp(u) * (x1 - x0 - 1)
    py = y0 + .5 + clamp(v) * (y1 - y0 - 1)
    return (px / SIZE, 1 - py / SIZE)


# ----------------------------------------------------------------- mesh store
class Part:
    def __init__(self, name, smooth):
        self.name, self.smooth = name, smooth
        self.verts = []  # (Vector, weights dict)
        self.faces = []  # (indices, uvs)

    def v(self, p, w):
        self.verts.append((Vector(p), {w: 1} if isinstance(w, str) else dict(w)))
        return len(self.verts) - 1

    def f(self, ids, uvs, inside=None):
        ids, uvs = list(ids), list(uvs)
        if inside is not None:
            pts = [self.verts[i][0] for i in ids]
            centre = sum(pts, Vector()) / len(pts)
            normal = Vector()
            for i in range(len(pts)):  # Newell
                a, b = pts[i], pts[(i + 1) % len(pts)]
                normal += Vector(((a.y - b.y) * (a.z + b.z), (a.z - b.z) * (a.x + b.x), (a.x - b.x) * (a.y + b.y)))
            if normal.dot(centre - Vector(inside)) < 0:
                ids.reverse(); uvs.reverse()
        self.faces.append((ids, uvs))


parts = []


def new_part(name, smooth=False):
    p = Part(name, smooth); parts.append(p); return p


# ------------------------------------------------------------ torso and skull
N = 12
#        z      cy     rx     top    bot   px   pt   keel
RINGS = [
    (-.930, 1.220, .060, .070, .090, 1.0, 1.0, .00),
    (-.860, 1.190, .150, .150, .200, .9, .9, .05),
    (-.720, 1.150, .195, .210, .240, .9, .85, .10),
    (-.550, 1.170, .185, .215, .200, .9, .8, .10),
    (-.400, 1.220, .140, .200, .190, .9, .75, .12),
    (-.220, 1.220, .165, .220, .210, .9, .75, .15),
    (-.020, 1.190, .215, .280, .300, .9, .75, .22),
    (.180, 1.170, .235, .320, .335, .9, .75, .30),
    (.330, 1.170, .232, .320, .330, .9, .75, .30),
    (.470, 1.190, .205, .280, .290, .9, .8, .25),
    (.580, 1.240, .160, .220, .260, .9, .9, .15),
    (.640, 1.300, .135, .165, .210, .9, .9, .08),
    (.700, 1.360, .122, .135, .180, .85, .9, .05),
    (.800, 1.395, .152, .150, .205, .8, .75, .12),
    (.900, 1.390, .142, .140, .168, .8, .7, .10),
    (.975, 1.345, .112, .100, .123, .75, .7, .04),
    (1.060, 1.315, .094, .090, .093, .75, .7, .00),
    (1.160, 1.300, .084, .078, .078, .75, .7, .00),
    (1.215, 1.285, .070, .060, .063, .8, .8, .00),
]
HEAD_FROM = 12  # first ring of the head chart (seam hides under the collar)
Z_TAIL, Z_NOSE = -.95, 1.25


def ring_params(z):
    if z <= RINGS[0][0]:
        return RINGS[0]
    for a, b in zip(RINGS, RINGS[1:]):
        if z <= b[0]:
            t = (z - a[0]) / (b[0] - a[0])
            return tuple(a[i] + (b[i] - a[i]) * t for i in range(8))
    return RINGS[-1]


def profile(z, theta, inflate=0.0):
    """Surface point of the trunk/skull at depth z, theta measured from the spine."""
    _, cy, rx, top, bot, px, pt, keel = ring_params(z)
    s, c = math.sin(theta), math.cos(theta)
    x = rx * math.copysign(abs(s) ** px, s)
    if c >= 0:
        y = top * c ** pt
    else:
        y = -bot * (-c) ** .9
        x *= 1 - keel * (-c)
    length = math.hypot(x, y) or 1
    return Vector((x + x / length * inflate, cy + y + y / length * inflate, z))


def head_weight(z):
    t = clamp((z - .56) / .16)
    return {'body': 1.0} if t <= 0 else {'head': 1.0} if t >= 1 else {'head': t, 'body': 1 - t}


def trunk_uv(z, phi, ring):
    if ring >= HEAD_FROM:
        return uv_in('head', (z - RINGS[HEAD_FROM][0]) / (Z_NOSE - RINGS[HEAD_FROM][0]), phi)
    return uv_in('body', (z - Z_TAIL) / (RINGS[HEAD_FROM][0] - Z_TAIL), phi)


skin = new_part('Ossuary Hound continuous skin', smooth=True)
grid = []
for ri, ring in enumerate(RINGS):
    grid.append([skin.v(profile(ring[0], k * TAU / N), head_weight(ring[0])) for k in range(N)])
HOLES = {'FR': (9, 3), 'FL': (9, 9), 'BR': (2, 3), 'BL': (2, 9)}  # removed trunk vertex per limb
hole_faces = set()
for ring, k in HOLES.values():
    hole_faces.update({(ring - 1, k - 1), (ring - 1, k), (ring, k - 1), (ring, k)})


def phi_of(k):
    return min(k, N - k) / (N / 2)


for ri in range(len(RINGS) - 1):
    for k in range(N):
        if (ri, k) in hole_faces:
            continue
        k2 = (k + 1) % N
        # Mirrored chart: both flanks share texels. The span that ends on ring
        # HEAD_FROM stays on the body chart, so the chart seam sits under the collar.
        pa, pb = phi_of(k), phi_of(k + 1)
        za, zb = RINGS[ri][0], RINGS[ri + 1][0]
        uvs = [trunk_uv(za, pa, ri), trunk_uv(za, pb, ri), trunk_uv(zb, pb, ri), trunk_uv(zb, pa, ri)]
        skin.f([grid[ri][k], grid[ri][k2], grid[ri + 1][k2], grid[ri + 1][k]], uvs, inside=(0, (RINGS[ri][1] + RINGS[ri + 1][1]) / 2, (za + zb) / 2))
# Rump and nose caps.
for ri, z, cy in [(0, -.955, 1.225), (len(RINGS) - 1, 1.240, 1.275)]:
    tip = skin.v((0, cy, z), head_weight(z))
    for k in range(N):
        k2 = (k + 1) % N
        pa, pb = phi_of(k), phi_of(k + 1)
        zr = RINGS[ri][0]
        skin.f([grid[ri][k], grid[ri][k2], tip], [trunk_uv(zr, pa, ri), trunk_uv(zr, pb, ri), trunk_uv(z, (pa + pb) / 2, ri)], inside=(0, RINGS[ri][1], zr))

# ------------------------------------------------------------------- the legs
M = 8
leg_marks = {}


def limb_ring(part, centre, direction, lat, fa, side, w, shift=0.0):
    d = Vector(direction).normalized()
    forward = d.cross(Vector((1, 0, 0))).normalized()  # forward on a hanging limb, up on the toes
    centre = Vector(centre) + forward * shift
    ids = []
    for j in range(M):
        a = j * TAU / M
        p = centre + Vector((-side * lat * math.cos(a), 0, 0)) + forward * (fa * math.sin(a))
        p.y = max(p.y, .004)
        ids.append(part.v(p, w))
    return ids, centre


def build_leg(suffix):
    front, side = suffix[0] == 'F', (-1 if suffix[1] == 'L' else 1)
    leg, knee = 'leg' + suffix, 'knee' + suffix
    A, B = P[leg], P[knee]
    rows = []  # (centre, direction, lat, fa, weights, shift)
    if front:
        F = P['foot' + suffix]; last = knee
        rows += [
            (A.lerp(B, .55), B - A, .070, .104, {leg: .6, 'body': .4}, 0),
            (A.lerp(B, .86), B - A, .060, .086, {leg: .85, knee: .15}, 0),
            (B, (B - A).normalized() + (F - B).normalized(), .052, .074, {leg: .5, knee: .5}, -.026),
            (B.lerp(F, .14), F - B, .050, .066, {knee: .85, leg: .15}, 0),
            (B.lerp(F, .50), F - B, .041, .050, knee, 0),
            (B.lerp(F, .80), F - B, .035, .040, knee, 0),
            (B.lerp(F, .90), F - B, .039, .044, {knee: .5, 'foot' + suffix: .5}, 0),
        ]
        marks = [2, 5]
    else:
        C, F = P['hock' + suffix], P['foot' + suffix]; hock = 'hock' + suffix; last = hock
        rows += [
            (A.lerp(B, .38), B - A, .080, .150, {leg: .6, 'body': .4}, 0),
            (A.lerp(B, .74), B - A, .068, .112, {leg: .9, knee: .1}, 0),
            (B, (B - A).normalized() + (C - B).normalized(), .056, .086, {leg: .5, knee: .5}, .018),
            (B.lerp(C, .30), C - B, .050, .074, {knee: .9, leg: .1}, 0),
            (B.lerp(C, .80), C - B, .035, .048, {knee: .9, hock: .1}, 0),
            (C, (C - B).normalized() + (F - C).normalized(), .036, .054, {knee: .5, hock: .5}, -.020),
            (C.lerp(F, .45), F - C, .031, .037, hock, 0),
            (C.lerp(F, .78), F - C, .035, .040, {hock: .5, 'foot' + suffix: .5}, 0),
        ]
        marks = [2, 5]
    foot = 'foot' + suffix
    rows += [
        (F + Vector((0, .030, .040)), (0, -.62, .78), .062, .054, foot, 0),
        (F + Vector((0, -.004, .115)), (0, -.08, 1), .068, .040, foot, 0),
    ]
    rings = [limb_ring(skin, c, d, lat, fa, side, w, shift) for c, d, lat, fa, w, shift in rows]
    lengths = [0.0]
    for (_, a), (_, b) in zip(rings, rings[1:]):
        lengths.append(lengths[-1] + (b - a).length)
    tip_at = F + Vector((0, -.022, .182)); tip_at.y = max(tip_at.y, .008)
    total = lengths[-1] + (tip_at - rings[-1][1]).length
    chart = 'front_leg' if front else 'rear_leg'
    leg_marks[chart] = {'joints': [lengths[i] / total for i in marks], 'paw': lengths[len(rows) - 3] / total}
    for i in range(len(rings) - 1):
        (ra, ca), (rb, cb) = rings[i], rings[i + 1]
        for j in range(M):
            j2 = (j + 1) % M
            ua, ub, va, vb = j / M, (j + 1) / M, lengths[i] / total, lengths[i + 1] / total
            skin.f([ra[j], ra[j2], rb[j2], rb[j]], [uv_in(chart, ua, va), uv_in(chart, ub, va), uv_in(chart, ub, vb), uv_in(chart, ua, vb)], inside=(ca + cb) / 2)
    tip = skin.v(tip_at, foot)
    for j in range(M):
        j2 = (j + 1) % M
        skin.f([rings[-1][0][j], rings[-1][0][j2], tip], [uv_in(chart, j / M, lengths[-1] / total), uv_in(chart, (j + 1) / M, lengths[-1] / total), uv_in(chart, (j + .5) / M, 1)], inside=rings[-1][1])
    # Weld the limb into the trunk: bridge the open flank hole to the first limb ring.
    ring, k = HOLES[suffix]
    hole = [(ring - 1, k - 1), (ring - 1, k), (ring - 1, k + 1), (ring, k + 1), (ring + 1, k + 1), (ring + 1, k), (ring + 1, k - 1), (ring, k - 1)]
    hole_ids = [grid[r][kk] for r, kk in hole]
    hole_pts = [skin.verts[i][0] for i in hole_ids]
    top_ids, top_centre = rings[0]
    best = None
    for order in (list(range(M)), list(range(M - 1, -1, -1))):
        for off in range(M):
            cand = [top_ids[order[(j + off) % M]] for j in range(M)]
            cost = sum((skin.verts[c][0] - hole_pts[j]).length for j, c in enumerate(cand))
            if best is None or cost < best[0]:
                best = (cost, cand)
    match = best[1]
    hole_centre = sum(hole_pts, Vector()) / M
    cy = RINGS[ring][1]

    def flank_uv(p):
        return trunk_uv(p.z, clamp(math.atan2(abs(p.x), p.y - cy) / math.pi), 0)

    for j in range(M):
        j2 = (j + 1) % M
        ids = [hole_ids[j], hole_ids[j2], match[j2], match[j]]
        skin.f(ids, [flank_uv(skin.verts[i][0]) for i in ids], inside=(hole_centre + top_centre) / 2 - Vector((side * .08, 0, 0)))
    return F


feet = {suffix: build_leg(suffix) for suffix in ['FL', 'FR', 'BL', 'BR']}


# ------------------------------------------------------------- rigid hardware
def tube(part, points, radius, w, rect, sides=3, taper=None):
    """Thin bar along a polyline; rings are shared so hoops stay cheap."""
    points = [Vector(p) for p in points]
    rings = []
    for i, p in enumerate(points):
        d = (points[min(i + 1, len(points) - 1)] - points[max(i - 1, 0)]).normalized()
        u = d.cross(Vector((0, 1, 0)))
        if u.length < .05:
            u = d.cross(Vector((1, 0, 0)))
        u.normalize(); v = d.cross(u).normalized()
        r = radius if taper is None else radius + (taper - radius) * i / (len(points) - 1)
        rings.append([part.v(p + (u * math.cos(j * TAU / sides) + v * math.sin(j * TAU / sides)) * r, w) for j in range(sides)])
    for i in range(len(points) - 1):
        for j in range(sides):
            j2 = (j + 1) % sides
            va, vb = i / (len(points) - 1), (i + 1) / (len(points) - 1)
            part.f([rings[i][j], rings[i][j2], rings[i + 1][j2], rings[i + 1][j]], [uv_in(rect, j / sides, va), uv_in(rect, (j + 1) / sides, va), uv_in(rect, (j + 1) / sides, vb), uv_in(rect, j / sides, vb)], inside=(points[i] + points[i + 1]) / 2)
    return rings


def spike(part, base, tip, radius, w, rect):
    base, tip = Vector(base), Vector(tip)
    d = (tip - base).normalized(); u = d.cross(Vector((0, 0, 1)))
    if u.length < .05:
        u = d.cross(Vector((1, 0, 0)))
    u.normalize(); v = d.cross(u)
    ring = [part.v(base + (u * math.cos(j * TAU / 3) + v * math.sin(j * TAU / 3)) * radius, w) for j in range(3)]
    t = part.v(tip, w)
    for j in range(3):
        part.f([ring[j], ring[(j + 1) % 3], t], [uv_in(rect, .1, .95), uv_in(rect, .9, .95), uv_in(rect, .5, .05)], inside=base)


def ribbon(part, points, widths, w, u0, u1, inside=None, weights=None):
    """Flat leather band; `widths` are per-point half-width vectors."""
    ids = []
    for i, p in enumerate(points):
        ww = weights[i] if weights else w
        ids.append((part.v(Vector(p) - Vector(widths[i]), ww), part.v(Vector(p) + Vector(widths[i]), ww)))
    n = len(points) - 1
    for i in range(n):
        ua, ub = u0 + (u1 - u0) * i / n, u0 + (u1 - u0) * (i + 1) / n
        hint = None if inside is None else (inside(points[i], points[i + 1]) if callable(inside) else inside)
        part.f([ids[i][0], ids[i][1], ids[i + 1][1], ids[i + 1][0]], [uv_in('leather', ua, .04), uv_in('leather', ua, .96), uv_in('leather', ub, .96), uv_in('leather', ub, .04)], inside=hint)


# Lower jaw: a ramus tucked under the cheek, a deep angle, then a tapering
# mandible with raised gum ridges, a sunken mouth floor and an upturned chin.
jaw = new_part('Thin anatomical mandible', smooth=True)
#       z     w     top    bot
JAW = [(.800, .098, 1.222, 1.126), (.860, .100, 1.206, 1.116), (.950, .092, 1.204, 1.134), (1.050, .080, 1.205, 1.149),
       (1.130, .069, 1.206, 1.158), (1.190, .057, 1.207, 1.167), (1.224, .036, 1.204, 1.181)]
JAW_Z0, JAW_LEN = JAW[0][0], 1.236 - JAW[0][0]
jaw_rings = []
for z, w, top, bot in JAW:
    mid = top - (top - bot) * .55
    floor = top - .015
    jaw_rings.append([jaw.v(p, 'jaw') for p in [(-w, top, z), (-w * .66, floor, z), (w * .66, floor, z), (w, top, z), (w * .97, mid, z), (w * .5, bot, z), (-w * .5, bot, z), (-w * .97, mid, z)]])
JAW_V = [.14, 0, 0, .14, .55, .88, 1, .55]  # gum ridge, lip, flank, underside
for i in range(len(JAW) - 1):
    for j in range(8):
        j2 = (j + 1) % 8
        ua, ub = (JAW[i][0] - JAW_Z0) / JAW_LEN, (JAW[i + 1][0] - JAW_Z0) / JAW_LEN
        if j == 1:  # mouth floor
            uvs = [uv_in('mouth', .1, .6), uv_in('mouth', .9, .6), uv_in('mouth', .9, .95), uv_in('mouth', .1, .95)]
        else:
            uvs = [uv_in('jaw', ua, JAW_V[j]), uv_in('jaw', ua, JAW_V[j2]), uv_in('jaw', ub, JAW_V[j2]), uv_in('jaw', ub, JAW_V[j])]
        jaw.f([jaw_rings[i][j], jaw_rings[i][j2], jaw_rings[i + 1][j2], jaw_rings[i + 1][j]], uvs, inside=(0, (JAW[i][2] + JAW[i][3]) / 2 - .01, (JAW[i][0] + JAW[i + 1][0]) / 2))
jaw.f(jaw_rings[0], [uv_in('jaw', 0, v) for v in JAW_V], inside=(0, 1.17, .85))
chin = jaw.v((0, 1.192, 1.236), 'jaw')
for j in range(8):
    j2 = (j + 1) % 8
    jaw.f([jaw_rings[-1][j], jaw_rings[-1][j2], chin], [uv_in('jaw', .97, JAW_V[j]), uv_in('jaw', .97, JAW_V[j2]), uv_in('jaw', 1, .5)], inside=(0, 1.19, 1.21))
tongue = new_part('Resting tongue')
tongue_pts = [(.036, 1.196, .88), (.042, 1.203, 1.02), (.032, 1.202, 1.13), (.014, 1.197, 1.185)]
tongue_ids = [(tongue.v((-w, y, z), 'jaw'), tongue.v((w, y, z), 'jaw')) for w, y, z in tongue_pts]
for i in range(3):
    tongue.f([tongue_ids[i][0], tongue_ids[i][1], tongue_ids[i + 1][1], tongue_ids[i + 1][0]], [uv_in('mouth', .1, .05), uv_in('mouth', .9, .05), uv_in('mouth', .9, .45), uv_in('mouth', .1, .45)], inside=(0, 1.1, 1.0))

# Teeth: long canines near the front, worn molars behind.
teeth = new_part('Bared teeth')
for side in (-1, 1):
    for z, length in [(.965, .020), (1.02, .022), (1.075, .024), (1.125, .028), (1.172, .056), (1.205, .020)]:
        x = side * ring_params(z)[2] * .80
        spike(teeth, (x, 1.226, z), (x * .97, 1.226 - length, z + .006), .011, 'head', 'bone')
    for z, length in [(.93, .016), (.985, .020), (1.04, .022), (1.095, .024), (1.145, .046), (1.19, .018), (1.214, .014)]:
        w = np.interp(z, [j[0] for j in JAW], [j[1] for j in JAW]) * .84
        spike(teeth, (side * w, 1.202, z), (side * w * .98, 1.202 + length, z + .004), .010, 'jaw', 'bone')

# Torn bat ears: a thin folded lens, pink inside and hide outside.
ears = new_part('Torn ear', smooth=False)
for side, torn in [(1, True), (-1, False)]:
    def e(p): return ears.v((side * p[0], p[1], p[2]), 'head')
    Bi, Bo, Bb = (.048, 1.520, .835), (.138, 1.475, .805), (.090, 1.515, .745)
    if torn:  # tall, with a bite taken out of the outer edge
        Mi, Mo, Mb = (.086, 1.690, .800), (.204, 1.640, .790), (.140, 1.665, .728)
        T, Nt = (.186, 1.835, .745), (.158, 1.705, .772)
    else:  # the other ear lost its tip long ago
        Mi, Mo, Mb = (.092, 1.660, .802), (.212, 1.612, .792), (.146, 1.640, .726)
        T, Nt = (.168, 1.722, .752), (.196, 1.668, .776)
    front = {k: e(v) for k, v in dict(Bi=Bi, Bo=Bo, Mi=Mi, Mo=Mo, T=T, Nt=Nt).items()}
    spine_front = {k: e(v) for k, v in dict(Bb=Bb, Mb=Mb).items()}
    spine_back = {k: e((v[0] + .006, v[1], v[2] - .012)) for k, v in dict(Bb=Bb, Mb=Mb).items()}
    EAR_UV = dict(Bi=(.15, .95), Bo=(.85, .95), Bb=(.5, .98), Mi=(.2, .45), Mo=(.9, .5), Mb=(.5, .5), T=(.6, .03), Nt=(.75, .32))
    for wall, spine, rect in [('in', spine_front, 'ear'), ('out', spine_back, 'fur_hide')]:
        g = {**front, **spine}
        hint = Vector((side * .13, 1.6, 1.2 if wall == 'out' else -.4))
        for names in [('Bi', 'Mi', 'Mb', 'Bb'), ('Mi', 'T', 'Mb'), ('Bb', 'Mb', 'Mo', 'Bo'), ('Mb', 'T', 'Nt'), ('Mb', 'Nt', 'Mo')]:
            ears.f([g[n] for n in names], [uv_in(rect, *EAR_UV[n]) for n in names], inside=hint)

# Iron basket muzzle: rails and hoops on the skull, a matching cradle on the jaw.
cage = new_part('Iron basket muzzle')
RAIL = math.radians(112)
for side in (-1, 1):
    tube(cage, [profile(z, side * RAIL, .013) for z in (.90, 1.03, 1.14, 1.222)], .0075, 'head', 'iron')
    lower = [(side * (np.interp(z, [j[0] for j in JAW], [j[1] for j in JAW]) + .014), 1.186, z) for z in (.90, 1.03, 1.14, 1.222)]
    tube(cage, lower, .0075, 'jaw', 'iron')
    hinge = profile(.895, side * RAIL, .016)
    tube(cage, [hinge + Vector((-side * .012, 0, 0)), hinge + Vector((side * .014, 0, 0))], .022, 'head', 'iron', sides=5)
for z in (1.015, 1.105, 1.195):
    tube(cage, [profile(z, math.radians(a), .014) for a in (-112, -62, 0, 62, 112)], .0065, 'head', 'iron')
    jw = np.interp(z, [j[0] for j in JAW], [j[1] for j in JAW]) + .014
    jb = np.interp(z, [j[0] for j in JAW], [j[3] for j in JAW]) - .014
    tube(cage, [(-jw, 1.186, z), (-jw * .62, jb, z), (jw * .62, jb, z), (jw, 1.186, z)], .0065, 'jaw', 'iron')
front_top = profile(1.222, 0, .014)
tube(cage, [profile(1.015, 0, .016), profile(1.105, 0, .016), profile(1.195, 0, .016), front_top, (0, 1.232, 1.262)], .0065, 'head', 'iron')
tube(cage, [profile(1.222, -RAIL, .013), (-.04, 1.232, 1.262), (.04, 1.232, 1.262), profile(1.222, RAIL, .013)], .0065, 'head', 'iron')
tube(cage, [(-.064, 1.186, 1.222), (-.036, 1.176, 1.258), (.036, 1.176, 1.258), (.064, 1.186, 1.222)], .0065, 'jaw', 'iron')

# Leather: bridle, collar and two torso bands. Buckles are painted, PS2-fashion.
straps = new_part('Leather harness', smooth=True)
crown = [profile(.868, math.radians(a), .009) for a in (-112, -80, -45, 0, 45, 80, 112)]
ribbon(straps, crown, [(0, 0, .016)] * len(crown), 'head', .02, .30, inside=(0, 1.38, .868))
bridge = [profile(z, 0, .011) for z in (.868, .94, 1.015)]
ribbon(straps, bridge, [(.015, 0, 0)] * 3, 'head', .02, .16, inside=(0, 1.3, .95))
collar_w = head_weight(.635)
collar = [profile(.635 - .03 * math.cos(k * TAU / N), k * TAU / N, .016) for k in range(N + 1)]
for half in (range(0, 7), range(6, 13)):
    ribbon(straps, [collar[k] for k in half], [(0, 0, .036)] * 7, collar_w, 0, 1, inside=(0, 1.3, .635))
STONES = [(.225, 1.525, .215, .43), (-.195, 1.485, .205, .44), (-.535, 1.43, .155, .255)]


def slab_top(i, x):
    z, cy, w, l = STONES[i]
    return cy + .012 - .07 * min(1, abs(x) / w) ** 1.5


for z, stone in [(.10, 0), (-.48, 2)]:
    w = STONES[stone][2]
    side_pts = [profile(z, k * TAU / N, .013) for k in range(2, 11)]  # right flank, belly, left flank
    over = [Vector((x, slab_top(stone, x) + .012, z)) for x in (-w - .016, -w * .55, 0, w * .55, w + .016)]
    loop = [over[2], over[3], over[4]] + side_pts + [over[0], over[1], over[2]]
    centre = (0, ring_params(z)[1], z)
    # Two halves of the strip texture, so one painted buckle lands on each flank.
    half = len(loop) // 2
    ribbon(straps, loop[:half + 1], [(0, 0, .032)] * (half + 1), 'body', .1, .9, inside=centre)
    ribbon(straps, loop[half:], [(0, 0, .032)] * (len(loop) - half), 'body', .9, .1, inside=centre)

# Cracked funerary slabs strapped along the spine.
for i, (z, cy, w, l) in enumerate(STONES):
    slab = new_part('Fitted funerary fragment ' + str(i))
    outline = [(-w, -l * .35), (-w * .6, -l * .52), (w * .3, -l * .47), (w, -l * .1), (w * .75, l * .4), (w * .15, l * .48), (-w * .4, l * .42), (-w * .95, l * .1)]
    def suv(x, zz, rect='stone' + str(i)): return uv_in(rect, (x + w) / (2 * w), (zz + l * .52) / (l * 1.04))
    top = [slab.v((0, cy + .012, z), 'body')] + [slab.v((x, cy - .07 * (abs(x) / w) ** 1.5, z + zz), 'body') for x, zz in outline]
    bottom = [slab.v((x * .94, cy - .07 * (abs(x) / w) ** 1.5 - .05, z + zz * .94), 'body') for x, zz in outline]
    hint = (0, cy - .06, z)
    for k in range(8):
        k2 = (k + 1) % 8
        slab.f([top[0], top[k + 1], top[k2 + 1]], [suv(0, 0), suv(*outline[k]), suv(*outline[k2])], inside=hint)
        edge = [suv(outline[k][0], outline[k][1]), suv(outline[k2][0], outline[k2][1]), suv(outline[k2][0] * .9, outline[k2][1] * .9), suv(outline[k][0] * .9, outline[k][1] * .9)]
        slab.f([top[k + 1], top[k2 + 1], bottom[k2], bottom[k]], edge, inside=hint)

# Whip tail, wiry fur cards and claws.
tail = new_part('Whip tail', smooth=True)
tail_pts = [(0, 1.30, -.84), (.012, 1.13, -1.03), (.03, .88, -1.25), (.06, .62, -1.47), (.085, .42, -1.64)]
tail_rings = tube(tail, tail_pts[:-1], .046, 'tail', 'tail', sides=5, taper=.014)
tail_tip = tail.v(tail_pts[-1], 'tail')
for j in range(5):
    tail.f([tail_rings[-1][j], tail_rings[-1][(j + 1) % 5], tail_tip], [uv_in('tail', j / 5, .8), uv_in('tail', (j + 1) / 5, .8), uv_in('tail', (j + .5) / 5, 1)], inside=tail_pts[-2])
fur = new_part('Wiry fur cards')


def tuft(a, b, tip, w):
    ids = [fur.v(a, w), fur.v(b, w), fur.v(tip, w)]
    fur.f(ids, [uv_in('fur', .1, .95), uv_in('fur', .9, .95), uv_in('fur', .5, .05)])


for i, (t, size) in enumerate([(.30, .8), (.47, 1.1), (.62, .7), (.76, 1.0), (.90, .8)]):  # sparse hair under the tail
    seg = min(3, int(t * 4)); f = t * 4 - seg
    a, b = Vector(tail_pts[seg]), Vector(tail_pts[seg + 1])
    p = a.lerp(b, f); axis = (b - a).normalized(); under = axis.cross(Vector((1, 0, 0))).normalized()
    if under.z < 0: under = -under
    tuft(p - axis * .03 * size, p + axis * .04 * size, p + axis * .13 * size + under * .035 * size + Vector((.012 * (i % 2 * 2 - 1), 0, 0)), 'tail')
for i, (z, size) in enumerate([(.47, .8), (.53, 1.2), (.585, .9), (.635, 1.3), (.69, 1.0), (.735, .7), (-.005, .7), (-.40, .8), (-.70, .9), (-.775, 1.2), (-.85, .8)]):  # ragged hackles between the slabs
    top = profile(z, 0); lean = (i % 2 * 2 - 1) * .02
    tuft(top + Vector((lean * .3, -.012, .035 * size)), top + Vector((lean * .3, -.012, -.03 * size)), top + Vector((lean, .042 * size, -.105 * size)), head_weight(z))
for side in (-1, 1):
    for i in range(4):  # cheek and throat ruff breaking up the neck outline
        z = .70 + i * .035; a = side * math.radians(105 + i * 16)
        p = profile(z, a)
        tuft(p + Vector((0, .022, .012)), p + Vector((0, -.022, .012)), p + Vector((side * .022, -.035 - i * .008, -.075)), head_weight(z))
    for z in (.30, .12, -.06):  # brisket fringe under the ribs
        p = profile(z, side * math.radians(168))
        tuft(p + Vector((0, .01, .04)), p + Vector((0, .01, -.04)), p + Vector((side * .01, -.065, -.07)), 'body')
    for suffix in (['FL', 'BL'] if side < 0 else ['FR', 'BR']):  # feathering behind elbow and hock
        joint = P[('knee' if suffix[0] == 'F' else 'hock') + suffix]
        bone = ('knee' if suffix[0] == 'F' else 'hock') + suffix
        tuft(joint + Vector((0, .05, -.035)), joint + Vector((0, -.06, -.03)), joint + Vector((0, -.05, -.12)), bone)
claws = new_part('Claws')
for suffix, F in feet.items():
    for i in (-1, 0, 1):
        base = F + Vector((i * .034, -.012, .168 - abs(i) * .012)); tip = F + Vector((i * .040, -.040, .222 - abs(i) * .014))
        tip.y = max(tip.y, .004); base.y = max(base.y, .02)
        spike(claws, base, tip, .011, 'foot' + suffix, 'bone')

# ------------------------------------------------------------------ the atlas
pixels = paint_atlas(leg_marks, dict(z_tail=Z_TAIL, z_neck=RINGS[HEAD_FROM][0], z_nose=Z_NOSE))
image = bpy.data.images.new('Ossuary Hound PS2 atlas v10', width=SIZE, height=SIZE, alpha=False)
rgba = np.concatenate([pixels[::-1], np.ones((SIZE, SIZE, 1), dtype=np.float32)], axis=2)
image.pixels.foreach_set(rgba.astype(np.float32).ravel())
image.filepath_raw = str(ATLAS); image.file_format = 'PNG'; image.save(); image.pack()

# ------------------------------------------------------------------- export
positions, normals, uvs, colors, skin_indices, skin_weights, indices, part_ranges = [], [], [], [], [], [], [], []
blend_verts, blend_faces, blend_uvs = [], [], []
triangle_count = 0


def pack_weights(w):
    items = sorted(w.items(), key=lambda kv: -kv[1])[:4]
    total = sum(v for _, v in items)
    ids = [INDEX[k] for k, _ in items]; ws = [round(v / total, 6) for _, v in items]
    ws[0] = round(ws[0] + 1 - sum(ws), 6)
    while len(ids) < 4:
        ids.append(0); ws.append(0)
    return ids, ws


def face_normal(pts):
    n = Vector()
    for i in range(len(pts)):
        a, b = pts[i], pts[(i + 1) % len(pts)]
        n += Vector(((a.y - b.y) * (a.z + b.z), (a.z - b.z) * (a.x + b.x), (a.x - b.x) * (a.y + b.y)))
    return n


for part in parts:
    first = len(positions) // 3
    unique = {}
    smooth_normals = {}
    if part.smooth:
        for ids, _ in part.faces:
            n = face_normal([part.verts[i][0] for i in ids])  # area weighted
            for i in ids:
                key = tuple(round(c, 5) for c in part.verts[i][0])
                smooth_normals[key] = smooth_normals.get(key, Vector()) + n
    base = len(blend_verts)
    blend_verts.extend(v for v, _ in part.verts)
    for ids, face_uvs in part.faces:
        pts = [part.verts[i][0] for i in ids]
        flat = face_normal(pts).normalized()
        blend_faces.append([base + i for i in ids]); blend_uvs.append(face_uvs)
        corners = []
        for i, uv in zip(ids, face_uvs):
            p, w = part.verts[i]
            n = smooth_normals[tuple(round(c, 5) for c in p)].normalized() if part.smooth else flat
            # Baked sky/ground ambient: PS2 characters carried their soft shading in vertex colour.
            shade = round(.66 + .34 * clamp(.5 + .5 * n.y) ** .8, 4)
            bone_ids, ws = pack_weights(w)
            key = (tuple(round(c, 6) for c in p), tuple(round(c, 6) for c in n), tuple(round(c, 6) for c in uv), tuple(bone_ids), tuple(ws), shade)
            if key not in unique:
                unique[key] = len(positions) // 3
                positions.extend(key[0]); normals.extend(key[1]); uvs.extend(key[2]); colors.extend((shade, shade, shade))
                skin_indices.extend(bone_ids); skin_weights.extend(ws)
            corners.append(unique[key])
        order = [(0, 1, 2)] if len(corners) == 3 else None
        if order is None and len(corners) == 4:  # split quads along the shorter diagonal
            order = [(0, 1, 2), (0, 2, 3)] if (pts[0] - pts[2]).length <= (pts[1] - pts[3]).length else [(0, 1, 3), (1, 2, 3)]
        if order is None:
            order = [(0, k, k + 1) for k in range(1, len(corners) - 1)]
        for tri in order:
            indices.extend(corners[k] for k in tri); triangle_count += 1
    part_ranges.append({'name': part.name, 'start': first, 'count': len(positions) // 3 - first})
asset = {'parts': part_ranges, 'bones': NAMES, 'bindMatrices': [b['matrix'] for b in BIND], 'position': positions, 'normal': normals, 'color': colors, 'uv': uvs, 'skinIndex': skin_indices, 'skinWeight': skin_weights, 'index': indices}
OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(json.dumps(asset, separators=(',', ':')))

# Editable source: the same mesh and atlas, Z-up for Blender.
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.context.preferences.filepaths.save_version = 0
image = bpy.data.images.load(str(ATLAS))
mesh = bpy.data.meshes.new('Ossuary Hound PS2')
mesh.from_pydata([(v.x, -v.z, v.y) for v in blend_verts], [], blend_faces); mesh.update()
layer = mesh.uv_layers.new(name='GameAtlas')
for poly, face_uvs in zip(mesh.polygons, blend_uvs):
    for li, uv in zip(poly.loop_indices, face_uvs):
        layer.data[li].uv = uv
material = bpy.data.materials.new('Hound PS2 diffuse'); material.use_nodes = True
shader = material.node_tree.nodes.get('Principled BSDF'); shader.inputs['Roughness'].default_value = 1
tex = material.node_tree.nodes.new('ShaderNodeTexImage'); tex.image = image; tex.interpolation = 'Closest'
material.node_tree.links.new(tex.outputs['Color'], shader.inputs['Base Color'])
mesh.materials.append(material)
bpy.context.scene.collection.objects.link(bpy.data.objects.new('Ossuary Hound PS2', mesh))
DOC.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=str(DOC / 'ossuary-hound-v4.blend'))
print(json.dumps({'vertices': len(positions) // 3, 'triangles': triangle_count, 'parts': len(parts), 'atlas': str(ATLAS)}))
