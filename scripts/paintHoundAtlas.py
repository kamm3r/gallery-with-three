"""Hand-authored 512px diffuse atlas for the PS2-style Ossuary Hound.

Every chart is painted in the same parametric space the mesh UVs use
(length along the body x angle from the spine), so ribs, eyes, lips and toes
land on the geometry by construction. Pure numpy; called by buildOssuaryHound.py.
"""
import numpy as np

SIZE = 512
RECTS = {
    'body': (0, 0, 512, 176),
    'head': (0, 176, 256, 336),
    'jaw': (0, 336, 128, 400),
    'ear': (128, 336, 192, 400),
    'fur_hide': (192, 336, 256, 400),
    'tail': (0, 400, 256, 432),
    'leather': (0, 432, 256, 456),
    'iron': (0, 456, 32, 488),
    'bone': (32, 456, 64, 488),
    'mouth': (64, 456, 96, 488),
    'fur': (96, 456, 128, 488),
    'front_leg': (256, 176, 336, 512),
    'rear_leg': (336, 176, 432, 512),
    'stone0': (432, 176, 512, 272),
    'stone1': (432, 272, 512, 368),
    'stone2': (432, 368, 512, 448),
}
HIDE = np.array([.40, .345, .30])
BALD = np.array([.50, .41, .37])
PINK = np.array([.50, .37, .34])
SCAR = np.array([.34, .12, .11])
LEATHER = np.array([.25, .145, .095])
IRON = np.array([.17, .16, .155])
RUST = np.array([.45, .25, .14])
STONE = np.array([.40, .39, .355])
BONE = np.array([.84, .78, .60])


def smooth(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def vnoise(h, w, cy, cx, seed):
    """Bilinear value noise with independent cell sizes (anisotropic streaks)."""
    rng = np.random.default_rng(seed)
    ys, xs = np.arange(h) / cy, np.arange(w) / cx
    y0, x0 = ys.astype(int), xs.astype(int)
    fy, fx = ys - y0, xs - x0
    fy, fx = (fy * fy * (3 - 2 * fy))[:, None], (fx * fx * (3 - 2 * fx))[None, :]
    g = rng.random((y0.max() + 2, x0.max() + 2))
    a, b = g[y0][:, x0], g[y0][:, x0 + 1]
    c, d = g[y0 + 1][:, x0], g[y0 + 1][:, x0 + 1]
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy


def blob(X, Y, x, y, rx, ry):
    return np.exp(-(((X - x) / rx) ** 2 + ((Y - y) / ry) ** 2))


def mix(img, colour, mask):
    m = np.clip(mask, 0, 1)[..., None]
    return img * (1 - m) + np.asarray(colour) * m


def stroke(img, x0, y0, x1, y1, colour, width=1.0, alpha=1.0):
    h, w, _ = img.shape
    Y, X = np.mgrid[0:h, 0:w]
    dx, dy = x1 - x0, y1 - y0
    t = np.clip(((X - x0) * dx + (Y - y0) * dy) / max(1e-6, dx * dx + dy * dy), 0, 1)
    d = np.hypot(X - (x0 + t * dx), Y - (y0 + t * dy))
    return mix(img, colour, (d <= width / 2) * alpha)


def hide(h, w, lum, seed, along='x'):
    """Mangy grey-brown hide with wiry fur streaks running along the given axis."""
    cells = (3, 20) if along == 'x' else (20, 3)
    img = HIDE[None, None, :] * lum[..., None]
    img = img * (1 + .34 * (vnoise(h, w, *cells, seed) - .5))[..., None]
    img = img * (1 + .20 * (vnoise(h, w, 1.5, 4, seed + 1) - .5) if along == 'x' else 1 + .20 * (vnoise(h, w, 4, 1.5, seed + 1) - .5))[..., None]
    patch = vnoise(h, w, 30, 46, seed + 2) + .25 * (vnoise(h, w, 5, 7, seed + 4) - .5)
    img = mix(img, BALD * lum[..., None], .55 * smooth(.62, .80, patch))  # bald mange, ragged edge
    img = img * (1 - .16 * smooth(.50, .62, patch) * (1 - smooth(.62, .72, patch)))[..., None]  # scabbed rim
    img = img * (1 - .28 * smooth(.62, .85, vnoise(h, w, 30, 44, seed + 3)))[..., None]  # grime
    return img


def paint_body(h, w, z0, z1):
    Y, X = np.mgrid[0:h, 0:w]
    z = z0 + (X + .5) / w * (z1 - z0)
    phi = (Y + .5) / h
    lum = np.interp(phi, [0, .07, .32, .7, 1], [.60, .74, 1.02, .88, .62])
    lum = lum * np.interp(z, [z0, -.6, .3, .5, z1], [.8, 1, 1, .86, .74])
    img = hide(h, w, lum, 11)
    img = mix(img, PINK * lum[..., None], .40 * smooth(.66, 1, phi))  # bare belly
    # Starved rib cage: slanted grooves with a lit edge.
    ribs = smooth(-.16, -.04, z) * (1 - smooth(.28, .40, z)) * smooth(.34, .44, phi) * (1 - smooth(.84, .93, phi))
    wave = np.sin(2 * np.pi * (z - .22 * (phi - .4)) / .078)
    img = img * (1 - .42 * ribs * smooth(.1, .9, wave))[..., None]
    img = img * (1 + .22 * ribs * smooth(.3, 1, -wave))[..., None]
    # Knuckled spine, hip point, shoulder blade and the hollow flank.
    ridge = 1 - smooth(.025, .085, phi)
    img = img * (1 + ridge * (.34 * (.5 + .5 * np.cos(2 * np.pi * z / .068)) - .12))[..., None]
    img = img * (1 + .30 * blob(z, phi, -.60, .20, .07, .08) + .24 * blob(z, phi, .46, .26, .06, .10))[..., None]
    img = img * (1 - .34 * blob(z, phi, -.36, .56, .12, .16) - .22 * blob(z, phi, .30, .50, .05, .16))[..., None]
    # Strap sores under the two torso bands.
    for band in (.10, -.48):
        img = mix(img, SCAR * 1.2, .5 * (np.abs(z - band) < .045) * (np.abs(np.abs(z - band) - .038) < .006))
    px = lambda zz: (zz - z0) / (z1 - z0) * w
    for za, pa, zb, pb in [(-.28, .30, -.16, .44), (-.24, .28, -.12, .42), (.40, .55, .50, .40), (-.66, .50, -.60, .68), (.02, .16, .09, .25)]:
        img = stroke(img, px(za), pa * h + 1, px(zb), pb * h + 1, BALD * .95, 1.2, .6)
        img = stroke(img, px(za), pa * h, px(zb), pb * h, SCAR, 1.2)
    return img


def paint_head(h, w, z0, z1):
    Y, X = np.mgrid[0:h, 0:w]
    z = z0 + (X + .5) / w * (z1 - z0)
    phi = (Y + .5) / h
    lum = np.interp(phi, [0, .07, .32, .7, 1], [.62, .76, .98, .84, .58]) * np.interp(z, [z0, .8, 1.0, 1.2], [.74, .9, .88, .74])
    img = hide(h, w, lum, 23)
    px = lambda zz: (zz - z0) / (z1 - z0) * w
    # Sunken cheek below a sharp zygomatic ridge; dark hollow behind the ear root.
    img = img * (1 - .40 * blob(z, phi, .86, .66, .07, .12) - .35 * blob(z, phi, .775, .17, .04, .09))[..., None]
    img = img * (1 + .28 * blob(z, phi, .90, .47, .08, .045) + .22 * blob(z, phi, .93, .08, .05, .06))[..., None]
    # Snarl wrinkles across the top of the muzzle.
    for i, zz in enumerate((1.035, 1.068, 1.10, 1.132)):
        x = px(zz) + 2.2 * np.sin(phi * 11 + i * 1.7) - 5 * phi
        mask = (phi < .52 - i * .05)
        img = mix(img, HIDE * .30, mask * (np.abs(X - x) < .9))
        img = mix(img, HIDE * 1.12, .5 * mask * (np.abs(X - x - 1.6) < .7))
    # Wet black nose leather with a split and nostril.
    nose = smooth(1.178, 1.19, z) * (1 - smooth(.66, .74, phi))
    img = mix(img, [.085, .075, .075], nose)
    img = mix(img, [.26, .25, .25], nose * blob(z, phi, 1.208, .16, .012, .07))
    img = mix(img, [.02, .02, .02], blob(z, phi, 1.216, .40, .010, .07) > .5)
    # Lip line, receded gums, then the dark mouth roof on the underside.
    mouth = smooth(.86, .89, z)
    img = mix(img, [.10, .07, .07], mouth * smooth(.80, .83, phi))
    img = mix(img, [.50, .19, .18], mouth * smooth(.85, .87, phi))
    img = mix(img, [.21, .06, .06], mouth * smooth(.92, .95, phi))
    img = img * (1 - .35 * (1 - mouth) * smooth(.8, 1, phi))[..., None]
    # Eye: deep socket, heavy slanted brow, amber iris with a slit pupil.
    ex, ey = px(.962), .30 * h
    img = mix(img, [.07, .05, .05], smooth(1.25, .7, np.hypot((X - ex) / 17, (Y - ey) / 11.5)))
    ball = np.hypot((X - ex) / 8.5, (Y - ey - 1) / 5.4)
    img = mix(img, [.93, .66, .16], ball < 1)
    img = mix(img, [.60, .30, .06], (ball < 1) * (ball > .72))
    img = mix(img, [.03, .02, .02], (np.abs(X - ex - .5) < 1.6) * (np.abs(Y - ey - 1) < 4.6))
    img = mix(img, [1, .95, .8], (np.abs(X - ex + 3.5) < 1.1) * (np.abs(Y - ey + 1) < 1.1))
    img = stroke(img, ex - 17, ey - 10.5, ex + 15, ey - 2.5, [.05, .04, .04], 5.2)  # scowling upper lid
    img = stroke(img, ex - 18, ey - 15.5, ex + 16, ey - 7.5, HIDE * 1.3, 2.4, .75)  # lit brow bone
    img = stroke(img, ex - 11, ey + 9, ex + 11, ey + 8, BALD * .8, 1.4, .6)  # raw lower lid
    return img


def paint_leg(h, w, marks, seed):
    Y, X = np.mgrid[0:h, 0:w]
    u, t = (X + .5) / w, (Y + .5) / h
    lum = np.interp(t, [0, .25, .7, marks['paw'], 1], [.90, .86, .62, .50, .44]) * (.72 + .28 * np.sin(np.pi * u) ** .7)
    img = hide(h, w, lum, seed, along='y')
    img = img * (1 + .30 * blob(u, t, .75, (marks['joints'][0] + marks['joints'][1]) / 2, .035, .16))[..., None]  # tendon
    for j, at in zip(marks['joints'], (.75, .75)):
        img = img * (1 + .45 * blob(u, t, at, j, .10, .018) - .25 * blob(u, t, at, j + .03, .12, .015))[..., None]  # bony joints
    paw = smooth(marks['paw'], marks['paw'] + .03, t)
    for toe in (.125, .25, .375):  # toe splits on the upper face of the paw
        img = mix(img, HIDE * .16, paw * smooth(marks['paw'] + .035, marks['paw'] + .06, t) * (np.abs(u - toe) < .9 / w))
    img = mix(img, [.10, .09, .09], .85 * paw * smooth(.58, .64, u) * (1 - smooth(.86, .92, u)))  # pads
    return img


def paint_leather(h, w):
    Y, X = np.mgrid[0:h, 0:w]
    img = LEATHER[None, None, :] * (1 + .5 * (vnoise(h, w, 3, 9, 41) - .5))[..., None]
    img = img * np.where((Y < 3) | (Y >= h - 3), .55, 1.0)[..., None]
    img = mix(img, LEATHER * 1.7, ((Y == 5) | (Y == h - 6)) * (X % 6 < 3))  # stitching
    img = mix(img, LEATHER * .35, (vnoise(h, w, 9, 1.2, 42) > .8) * (Y > 6) * (Y < h - 7))  # cracks
    cx, cy = w / 2, h / 2
    dx, dy = np.abs(X - cx), np.abs(Y - cy + .5)
    frame = (dx < 12) * (dy < h / 2 - 1) * ((dx > 8) | (dy > h / 2 - 4.5))
    img = mix(img, [.12, .09, .07], (dx < 13.5) * (dy < h / 2))
    img = mix(img, [.36, .31, .21], frame)
    img = mix(img, [.60, .53, .34], frame * ((Y < cy - 6) | (X < cx - 10)))
    img = mix(img, LEATHER * .9, (dx <= 8) * (dy <= h / 2 - 4.5))
    img = mix(img, [.50, .44, .30], (np.abs(Y - cy + .5) < 1.2) * (X > cx - 10) * (X < cx + 15))  # prong
    for hole in (26, 38, 50):
        img = mix(img, [.07, .05, .04], np.hypot(X - cx - hole, Y - cy + .5) < 1.7)
    return img


def paint_stone(h, w, seed, carving):
    Y, X = np.mgrid[0:h, 0:w]
    img = STONE[None, None, :] * (1 + .30 * (vnoise(h, w, 14, 14, seed) - .5) + .22 * (vnoise(h, w, 2, 2, seed + 1) - .5))[..., None]
    edge = np.minimum(np.minimum(X, w - 1 - X), np.minimum(Y, h - 1 - Y))
    img = img * (.62 + .38 * smooth(0, 9, edge + 6 * (vnoise(h, w, 6, 6, seed + 2) - .5)))[..., None]
    img = mix(img, [.30, .33, .24], .35 * smooth(.6, .8, vnoise(h, w, 18, 18, seed + 3)))  # lichen
    rng = np.random.default_rng(seed)
    for _ in range(3):  # cracks wander across the slab
        x, y = rng.uniform(8, w - 8), 2.0
        angle = rng.uniform(1.2, 1.9)
        while 1 < y < h - 2 and 1 < x < w - 2:
            nx, ny = x + 4 * np.cos(angle), y + 4 * np.sin(angle)
            img = stroke(img, x + 1, y, nx + 1, ny, STONE * 1.2, 1.0, .7)
            img = stroke(img, x, y, nx, ny, STONE * .28, 1.1)
            x, y, angle = nx, ny, angle + rng.uniform(-.6, .6)
    cx = w / 2
    if carving == 'cross':
        shape = ((np.abs(X - cx) < 4.5) * (Y > 16) * (Y < h - 16)) | ((np.abs(Y - 36) < 4.5) * (np.abs(X - cx) < 18))
        lit = np.roll(np.roll(shape, 1, 0), 1, 1) & ~shape
        img = mix(img, STONE * .42, shape)
        img = mix(img, STONE * .22, shape & ~np.roll(np.roll(shape, 1, 0), 1, 1))
        img = mix(img, STONE * 1.28, lit)
    elif carving == 'script':
        rows = ((Y % 12 > 3) * (Y % 12 < 7) * (Y > 14) * (Y < h - 14) * (X > 12) * (X < w - 12))
        img = mix(img, STONE * .45, rows * (vnoise(h, w, 12, 2.5, seed + 5) > .42))
    return img


def paint_atlas(leg_marks, spans):
    atlas = np.empty((SIZE, SIZE, 3))
    atlas[:] = HIDE * .8  # bleed colour for mip levels

    def put(name, img):
        x0, y0, x1, y1 = RECTS[name]
        atlas[y0:y1, x0:x1] = img

    def size(name):
        x0, y0, x1, y1 = RECTS[name]
        return y1 - y0, x1 - x0

    put('body', paint_body(*size('body'), spans['z_tail'], spans['z_neck']))
    put('head', paint_head(*size('head'), spans['z_neck'], spans['z_nose']))
    put('front_leg', paint_leg(*size('front_leg'), leg_marks['front_leg'], 31))
    put('rear_leg', paint_leg(*size('rear_leg'), leg_marks['rear_leg'], 37))
    put('leather', paint_leather(*size('leather')))
    for i, carving in enumerate(['cross', 'script', None]):
        put('stone' + str(i), paint_stone(*size('stone' + str(i)), 50 + i * 7, carving))
    # Jaw: gum ridge, black lip with drooping folds, scabbed flank, shadowed underside.
    h, w = size('jaw'); Y, X = np.mgrid[0:h, 0:w]; u, v = (X + .5) / w, (Y + .5) / h
    jaw = hide(h, w, np.interp(v, [0, .3, .6, 1], [.80, .86, .70, .42]) * np.interp(u, [0, .2, 1], [.7, 1, .9]), 61)
    jaw = mix(jaw, BALD * .8, .6 * blob(u, v, .88, .55, .14, .22))  # bare chin
    jaw = jaw * (1 + .30 * blob(u, v, .16, .50, .07, .16) - .30 * blob(u, v, .30, .62, .08, .14))[..., None]  # jaw angle
    lip = .27 + .05 * np.sin(u * 38) * (1 - smooth(.3, .7, u))  # flews sag toward the hinge
    jaw = mix(jaw, [.09, .065, .065], 1 - smooth(lip - .04, lip + .03, v))
    jaw = mix(jaw, [.52, .20, .19], 1 - smooth(.10, .15, v))
    jaw = mix(jaw, [.30, .09, .09], (v < .15) * (vnoise(h, w, 2, 5, 62) > .62))
    for x in (.08, .15, .23, .33):  # creases in the loose lip
        jaw = stroke(jaw, x * w, .29 * h, (x + .03) * w, .50 * h, HIDE * .28, 1.1, .8)
    jaw = mix(jaw, HIDE * .22, (vnoise(h, w, 2.5, 2.5, 63) > .86) * (v > .35) * (u > .6))  # whisker pores
    put('jaw', jaw)
    # Inner ear: raw pink cartilage, dark canal, a few veins.
    h, w = size('ear'); Y, X = np.mgrid[0:h, 0:w]; u, v = (X + .5) / w, (Y + .5) / h
    ear = np.empty((h, w, 3)); ear[:] = [.36, .23, .215]
    ear = ear * (1 + .25 * (vnoise(h, w, 5, 5, 71) - .5))[..., None]
    ear = mix(ear, [.20, .09, .09], .9 * blob(u, v, .5, .95, .22, .40))
    for x0, x1 in ((.5, .2), (.5, .75), (.52, .55)):
        ear = stroke(ear, x0 * w, .8 * h, x1 * w, .15 * h, [.34, .13, .14], 1.2, .8)
    rim = np.minimum(np.minimum(u, 1 - u), v)
    ear = mix(ear, HIDE * .6, 1 - smooth(.02, .12, rim))
    put('ear', ear)
    h, w = size('fur_hide'); put('fur_hide', hide(h, w, np.full((h, w), .66), 73, along='y'))
    # Tail: length runs along v of the tube, which is the short image axis rotated; keep it dark and wiry.
    h, w = size('tail'); Y, X = np.mgrid[0:h, 0:w]; v = (Y + .5) / h
    put('tail', hide(h, w, np.interp(v, [0, 1], [.74, .40]) * np.ones((h, w)), 79, along='y'))
    h, w = size('iron'); iron = IRON[None, None, :] * (1 + .5 * (vnoise(h, w, 3, 3, 83) - .5))[..., None]
    iron = mix(iron, RUST * .7, .45 * smooth(.55, .75, vnoise(h, w, 6, 6, 84)))
    iron = mix(iron, [.38, .37, .35], vnoise(h, w, 1.5, 1.5, 85) > .88)
    put('iron', iron)
    h, w = size('bone'); Y, X = np.mgrid[0:h, 0:w]; v = (Y + .5) / h
    bone = BONE[None, None, :] * np.interp(v, [0, .55, 1], [1.05, .92, .48])[..., None] * (1 + .12 * (vnoise(h, w, 6, 2, 87) - .5))[..., None]
    put('bone', mix(bone, [.36, .22, .10], .5 * smooth(.75, 1, v)))
    h, w = size('mouth'); Y, X = np.mgrid[0:h, 0:w]; v = (Y + .5) / h
    mouth = np.where((v < .5)[..., None], np.array([.58, .25, .26]), np.array([.21, .06, .06])) * (1 + .3 * (vnoise(h, w, 3, 3, 89) - .5))[..., None]
    put('mouth', mouth)
    h, w = size('fur'); Y, X = np.mgrid[0:h, 0:w]; v = (Y + .5) / h
    put('fur', (HIDE[None, None, :] * np.interp(v, [0, 1], [1.0, .42])[..., None]) * (1 + .4 * (vnoise(h, w, 8, 1.5, 91) - .5))[..., None])
    # PS2 colour depth: ordered dither down to 5 bits per channel.
    bayer = np.array([[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]) / 16 - .5
    dither = np.tile(bayer, (SIZE // 4, SIZE // 4))[..., None]
    atlas = np.clip(np.round(np.clip(atlas, 0, 1) * 31 + dither * .9) / 31, 0, 1)
    return atlas.astype(np.float32)
