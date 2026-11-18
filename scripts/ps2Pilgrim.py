"""Convert the Cathedral Pilgrim v4 into a PS2-era, animation-ready character.

blender -b --python-exit-code 1 --python scripts/ps2Pilgrim.py [-- --stage rig|full]

Reads the v4 source (left untouched) and writes cathedral-pilgrim-ps2.{blend,glb}:
  * one skinned body mesh + rigid sword and shield meshes, one 512px palettised atlas
  * the Universal Animation Library 2 (UE-mannequin) skeleton: same bone names and
    rest orientations, so UAL2 clips play on it in three.js by bone name
  * real five-finger hands on the finger bones, smooth joint weights, cape bones
  * the authored A-pose guard stance stored as the default pose and as an action
"""
from pathlib import Path
import sys, json, math
import bpy, bmesh
import numpy as np
from mathutils import Vector, Matrix, Quaternion

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / 'public/assets/characters/ashen-parish/pilgrim-v4/cathedral-pilgrim-v4.blend'
OUT = ROOT / 'public/assets/characters/ashen-parish/pilgrim-ps2'
DOC = ROOT / 'docs/characters/ashen-parish/pilgrim-ps2'
ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
STAGE = ARGS[ARGS.index('--stage') + 1] if '--stage' in ARGS else 'full'
UAL_ZIP = ROOT / 'public/assets/Universal Animation Library 2[Standard].zip'
UAL_GLB = 'Universal Animation Library 2[Standard]/Unreal-Godot/UAL2_Standard.glb'
OUT.mkdir(parents=True, exist_ok=True); DOC.mkdir(parents=True, exist_ok=True)
CLIPS = ['Idle_Shield_Loop', 'Sword_Regular_A', 'Sword_Regular_B', 'Sword_Regular_C', 'Sword_Regular_Combo',
         'Sword_Heavy_Combo', 'Sword_Block', 'Sword_Dash', 'Shield_Dash', 'Shield_OneShot', 'Idle_Shield_Break',
         'Hit_Knockback', 'Consume', 'Zombie_Walk_Fwd_Loop']


def ual_path():
    import zipfile, tempfile
    tmp = Path(tempfile.gettempdir()) / 'ual2-extract'
    target = tmp / UAL_GLB
    if not target.exists():
        with zipfile.ZipFile(UAL_ZIP) as z: z.extract(UAL_GLB, tmp)
    return target


bpy.ops.wm.open_mainfile(filepath=str(SRC))
bpy.context.preferences.filepaths.save_version = 0
sc = bpy.context.scene
old_rig = bpy.data.objects['PilgrimRig']
OB = {b.name: (old_rig.matrix_world @ b.head_local, old_rig.matrix_world @ b.tail_local) for b in old_rig.data.bones}

# ---------------------------------------------------------------- 1. bake modifiers, cull, decimate
DECIMATE = {'Torn short pilgrim cape': .15, 'Asymmetric rust-red shoulder mantle': .2, 'Ragged layered charcoal tunic': .6, 'Open cloth hood': .7,
            'Downturned iron helmet brim': .55, 'Supply pouch volume': .5, 'Brass pilgrim flask': .5,
            'Scuffed leather boot L': .7, 'Scuffed leather boot R': .7, 'Stern face beneath brim': .85}
DROP = ('Curled glove finger', 'Glove thumb', 'Closed leather glove', 'Token hanging eye', 'Straight tapered iron sword',
        'Sword dark leather grip', 'Sword iron crossguard', 'Sword pommel', 'Shield plank seam', 'Pouch flap fastener',
        'Belt buckle central pin')
SHIELD = ('Convex round wooden shield', 'Shield central iron boss', 'Shield iron binding', 'Shield grip', 'Shield held leather grip',
          'Shield rear leather arm strap')
parts = {}
for ob in [o for o in bpy.data.objects if o.type == 'MESH' and o.parent == old_rig]:
    if ob.name.startswith(DROP):
        bpy.data.objects.remove(ob); continue
    for m in list(ob.modifiers):
        if m.type == 'ARMATURE': m.show_viewport = False
        if m.type == 'BEVEL' and ob.name.startswith(('Rectangular brass belt buckle', 'Hanging religious token')): ob.modifiers.remove(m)
    if ob.name in DECIMATE:
        d = ob.modifiers.new('ps2 decimate', 'DECIMATE'); d.ratio = DECIMATE[ob.name]; d.use_collapse_triangulate = True
        ob.modifiers.move(ob.modifiers.find('ps2 decimate'), 0)
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(ob.evaluated_get(dg), preserve_all_data_layers=True, depsgraph=dg)
    me.transform(ob.matrix_world)
    groups = {g.index: g.name for g in ob.vertex_groups}
    w = [{groups[g.group]: g.weight for g in v.groups if g.weight > 0} for v in me.vertices]
    if not any(w):  # modifiers can drop deform layers; fall back to the object's single bone
        w = [{groups[0]: 1.0} for _ in me.vertices]
    for i, d in enumerate(w):
        if not d: w[i] = {groups[0]: 1.0}
    mats = [s.material for s in ob.material_slots]
    name = ob.name
    bpy.data.objects.remove(ob)
    me.name = name
    parts[name] = dict(mesh=me, weights=w, mats=mats)
for name in list(parts):
    me = parts[name]['mesh']
    if me.uv_layers: me.uv_layers[0].name = 'SourceUV'
    else: me.uv_layers.new(name='SourceUV')

# ---------------------------------------------------------------- 2. UAL2 skeleton fitted to the pilgrim
before = set(bpy.data.objects)
bpy.ops.import_scene.gltf(filepath=str(ual_path()))
imported = [o for o in bpy.data.objects if o not in before]
arm = next(o for o in imported if o.type == 'ARMATURE')
ual_actions = {a.name: a for a in bpy.data.actions if a.name in CLIPS or a.name == 'A_TPose'}
for o in imported:
    if o != arm: bpy.data.objects.remove(o)
arm.animation_data_clear()
for pb in arm.pose.bones: pb.matrix_basis = Matrix()
arm.name = 'PilgrimSkeleton'; arm.data.name = 'PilgrimSkeleton'
assert arm.matrix_world == Matrix(), arm.matrix_world
for c in list(arm.users_collection): c.objects.unlink(arm)
sc.collection.objects.link(arm)
bpy.context.view_layer.objects.active = arm
bpy.ops.object.mode_set(mode='EDIT')
eb = arm.data.edit_bones
orig = {b.name: (b.head.copy(), b.tail.copy(), b.matrix.copy(), b.length) for b in eb}
for b in eb: b.use_connect = False


def place(name, head, length=None):
    b = eb[name]; M = orig[name][2].copy(); M.translation = head; b.matrix = M
    b.length = length if length else orig[name][3]
    return b


def tail(name): return eb[name].tail.copy()


def subtree(root):
    out = []
    for b in eb[root].children_recursive: out.append(b.name)
    return out


# spine: keep UAL orientations, place on the pilgrim's centre line
for name, z, length in [('pelvis', .93, None), ('spine_01', 1.03, None), ('spine_02', 1.16, None), ('spine_03', 1.30, .17),
                        ('neck_01', 1.468, .081), ('Head', 1.549, .2)]:
    place(name, Vector((0, 0, z)), length)
HAND_SCALE = .86
boots = {s: parts[f'Scuffed leather boot {s.upper()}']['mesh'] for s in 'lr'}
for s, S in (('l', 'L'), ('r', 'R')):
    shoulder = OB[f'UpperArm.{S}'][0]
    cdir = orig[f'clavicle_{s}'][2].col[1].xyz.normalized()
    place(f'clavicle_{s}', shoulder - cdir * .19, .19)
    place(f'upperarm_{s}', shoulder, (OB[f'UpperArm.{S}'][1] - OB[f'UpperArm.{S}'][0]).length)
    place(f'lowerarm_{s}', tail(f'upperarm_{s}'), (OB[f'Forearm.{S}'][1] - OB[f'Forearm.{S}'][0]).length)
    wrist = tail(f'lowerarm_{s}'); h0 = orig[f'hand_{s}'][0]
    place(f'hand_{s}', wrist, orig[f'hand_{s}'][3] * HAND_SCALE)
    for n in subtree(f'hand_{s}'):
        place(n, wrist + (orig[n][0] - h0) * HAND_SCALE, orig[n][3] * HAND_SCALE)
    place(f'thigh_{s}', OB[f'Thigh.{S}'][0], (OB[f'Thigh.{S}'][1] - OB[f'Thigh.{S}'][0]).length)
    place(f'calf_{s}', tail(f'thigh_{s}'), (OB[f'Shin.{S}'][1] - OB[f'Shin.{S}'][0]).length)
    vs = np.array([v.co[:] for v in boots[s].vertices])
    toe_y = vs[:, 1].min(); xs = vs[:, 0].mean()
    ball_target = Vector((xs, toe_y + .085, .035))
    ankle_target = OB[f'Shin.{S}'][1]
    place(f'foot_{s}', tail(f'calf_{s}'), (ball_target - ankle_target).length)
    place(f'ball_{s}', tail(f'foot_{s}'), .055); place(f'ball_leaf_{s}', tail(f'ball_{s}'), .03)
    globals()[f'BALL_{s}'] = ball_target
# cape bones (not in UAL; follow the chest, ready for spring physics)
for name, h, t, parent in [('cape_01', (0, .13, 1.46), (0, .19, 1.16), 'spine_03'), ('cape_02', (0, .19, 1.16), (0, .21, .76), 'cape_01')]:
    b = eb.new(name); b.head = h; b.tail = t; b.roll = 0; b.parent = eb[parent]
REST_HEADS = {b.name: b.head.copy() for b in eb}
bpy.ops.object.mode_set(mode='POSE')
vl = bpy.context.view_layer


def swing(name, target_dir, pivot=None):
    pb = arm.pose.bones[name]; M = pb.matrix.copy(); cur = M.col[1].xyz.normalized()
    R = cur.rotation_difference(target_dir.normalized()).to_matrix().to_4x4()
    head = M.translation.copy()
    pb.matrix = Matrix.Translation(head) @ R @ Matrix.Translation(-head) @ M
    vl.update()


def rotate(name, axis, angle):
    pb = arm.pose.bones[name]; M = pb.matrix.copy(); head = M.translation.copy()
    pb.matrix = Matrix.Translation(head) @ Matrix.Rotation(angle, 4, axis.normalized()) @ Matrix.Translation(-head) @ M
    vl.update()


def P(name): return arm.pose.bones[name]


for s, S in (('l', 'L'), ('r', 'R')):
    for new, old in (('upperarm', 'UpperArm'), ('lowerarm', 'Forearm'), ('hand', 'Hand'), ('thigh', 'Thigh'), ('calf', 'Shin')):
        h, t = OB[f'{old}.{S}']; swing(f'{new}_{s}', t - h)
    swing(f'foot_{s}', globals()[f'BALL_{s}'] - P(f'foot_{s}').head)


def palm_normal(s):  # rest palms face -Z (T-pose, palms down)
    return (P(f'hand_{s}').matrix.to_3x3() @ arm.data.bones[f'hand_{s}'].matrix_local.to_3x3().inverted() @ Vector((0, 0, -1))).normalized()


def grip(s, angles=(72, 84, 52), thumb=(20, 38, 30)):
    pn = palm_normal(s); hd = P(f'hand_{s}').matrix.col[1].xyz.normalized()
    axis = hd.cross(pn).normalized()  # knuckle line: rotating about it moves fingers into the palm
    for f in ('index', 'middle', 'ring', 'pinky'):
        for i, a in zip((1, 2, 3), angles):
            rotate(f'{f}_0{i}_{s}', axis, math.radians(a))
    # thumb wraps over the curled index finger instead of curling into the palm
    swing(f'thumb_01_{s}', (P(f'index_01_{s}').head - P(f'thumb_01_{s}').head) * .6 + pn * .012 + (P(f'index_02_{s}').head - P(f'thumb_01_{s}').head) * .4)
    swing(f'thumb_02_{s}', P(f'index_02_{s}').head - pn * .004 - P(f'thumb_02_{s}').head)
    swing(f'thumb_03_{s}', P(f'index_03_{s}').head - pn * .006 - P(f'thumb_03_{s}').head)


# right wrist: ulnar deviation so the sword rests point-forward-down
pn = palm_normal('r'); hand_dir = P('hand_r').matrix.col[1].xyz
width = (P('pinky_01_r').head - P('index_01_r').head).normalized()
for sign in (1, -1):
    test = (Matrix.Rotation(math.radians(38 * sign), 3, pn) @ (-width))
    if test.z < -.25: break
rotate('hand_r', pn, math.radians(38 * sign))
grip('r'); grip('l', angles=(70, 80, 50))
vl.update()
POSE = {pb.name: pb.matrix_basis.copy() for pb in arm.pose.bones}
SKIN = {b.name: (arm.pose.bones[b.name].matrix @ b.matrix_local.inverted()) for b in arm.data.bones}


def fist(s):
    """Centre of the cylinder the curled fingers close around."""
    pts = [P(f'{f}_0{i}_{s}').head for f in ('index', 'middle', 'ring', 'pinky') for i in (2, 3)]
    pts += [P(f'{f}_04_leaf_{s}').head for f in ('index', 'middle', 'ring', 'pinky')]
    knuck = sum((P(f'{f}_01_{s}').head for f in ('index', 'middle', 'ring', 'pinky')), Vector()) / 4
    ring_c = sum(pts, Vector()) / len(pts)
    return knuck.lerp(ring_c, .62)


# ---------------------------------------------------------------- 3. new animatable hands (built at rest, then posed)
leather = bpy.data.materials.new('PS2 • glove leather'); leather.use_nodes = True
nt = leather.node_tree; bsdf = nt.nodes['Principled BSDF']
noise = nt.nodes.new('ShaderNodeTexNoise'); noise.inputs['Scale'].default_value = 140; noise.inputs['Detail'].default_value = 6
ramp = nt.nodes.new('ShaderNodeValToRGB'); ramp.color_ramp.elements[0].color = (.07, .035, .018, 1); ramp.color_ramp.elements[1].color = (.24, .13, .065, 1)
nt.links.new(noise.outputs['Fac'], ramp.inputs['Fac']); nt.links.new(ramp.outputs['Color'], bsdf.inputs['Base Color'])


def ring(center, axis, up, r_side, r_up, n=6):
    axis = axis.normalized(); u = (up - axis * up.dot(axis)).normalized(); v = axis.cross(u)
    return [center + u * math.cos(2 * math.pi * k / n + math.pi / n) * r_up + v * math.sin(2 * math.pi * k / n + math.pi / n) * r_side for k in range(n)]


def tube(verts, faces, weights, rings, wts, cap=True):
    n = len(rings[0]); base = len(verts)
    for r, w in zip(rings, wts): verts += r; weights += [w] * n
    for j in range(len(rings) - 1):
        a = base + j * n; b = a + n
        for k in range(n): faces.append((a + k, a + (k + 1) % n, b + (k + 1) % n, b + k))
    faces.append(tuple(range(base + n - 1, base - 1, -1)))
    if cap:
        tip = sum(rings[-1], Vector()) / n; i = len(verts); verts.append(tip); weights.append(wts[-1])
        last = base + (len(rings) - 1) * n
        for k in range(n): faces.append((last + k, last + (k + 1) % n, i))


def build_hand(s):
    R = {b.name: (b.head_local.copy(), b.tail_local.copy()) for b in arm.data.bones}
    verts, faces, weights = [], [], []
    up = Vector((0, 0, 1))
    hd = (R[f'hand_{s}'][1] - R[f'hand_{s}'][0]).normalized()
    wrist = R[f'hand_{s}'][0] - hd * .012
    knuck = (R[f'index_01_{s}'][0] + R[f'pinky_01_{s}'][0]) / 2 + hd * .004
    side = (R[f'pinky_01_{s}'][0] - R[f'index_01_{s}'][0]); half = side.length / 2 + .011
    sd = side.normalized(); mid = lambda t: wrist.lerp(knuck, t)
    # palm: 3 rings from wrist to knuckles, a flattened octagon, weighted to the hand
    centre_off = (R[f'index_01_{s}'][0] + R[f'pinky_01_{s}'][0]) / 2 - knuck
    rings, wts = [], []
    for t, wsc, th in ((0, .78, .019), (.55, 1, .021), (1, 1, .017)):
        c = mid(t) + centre_off * t + Vector((0, 0, -.002))
        rings.append(ring(c, hd, up, half * wsc, th, 8)); wts.append({f'hand_{s}': 1})
    wts[0] = {f'hand_{s}': .6, f'lowerarm_{s}': .4}
    tube(verts, faces, weights, rings, wts, cap=False)
    faces.append(tuple(range(len(verts) - 1, len(verts) - 9, -1)))
    for f, r in (('index', .0095), ('middle', .0098), ('ring', .0092), ('pinky', .0082)):
        heads = [R[f'{f}_0{i}_{s}'][0] for i in (1, 2, 3)] + [R[f'{f}_04_leaf_{s}'][0]]
        d = (heads[-1] - heads[0]).normalized()
        start = heads[0] - d * .012
        pts = [start] + heads[1:]
        ws = [{f'{f}_01_{s}': 1}, {f'{f}_01_{s}': .5, f'{f}_02_{s}': .5}, {f'{f}_02_{s}': .5, f'{f}_03_{s}': .5}, {f'{f}_03_{s}': 1}]
        rs = [ring(p, d, up, r * (1 - .08 * j), r * .92 * (1 - .08 * j)) for j, p in enumerate(pts)]
        tube(verts, faces, weights, rs, ws)
    th = [R[f'thumb_0{i}_{s}'][0] for i in (1, 2, 3)] + [R[f'thumb_04_leaf_{s}'][0]]
    d = (th[-1] - th[0]).normalized()
    ws = [{f'hand_{s}': .5, f'thumb_01_{s}': .5}, {f'thumb_01_{s}': .5, f'thumb_02_{s}': .5}, {f'thumb_02_{s}': .5, f'thumb_03_{s}': .5}, {f'thumb_03_{s}': 1}]
    rs = [ring(p, d, up, .0118 - .001 * j, .0105 - .001 * j) for j, p in enumerate(th)]
    tube(verts, faces, weights, rs, ws)
    me = bpy.data.meshes.new(f'Glove {s}'); me.from_pydata([v[:] for v in verts], [], faces); me.update()
    bm = bmesh.new(); bm.from_mesh(me); bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces)); bm.to_mesh(me); bm.free()
    me.uv_layers.new(name='SourceUV'); me.materials.append(leather)
    return me, weights


def forward(me, weights):
    """Rest -> posed (linear blend skinning)."""
    for v, w in zip(me.vertices, weights):
        M = sum((SKIN[b] * x for b, x in w.items()), Matrix.Diagonal((0, 0, 0, 0)))
        v.co = M @ v.co


for s in 'lr':
    me, w = build_hand(s); forward(me, w)
    parts[f'Glove {s}'] = dict(mesh=me, weights=w, mats=[leather], rigid=True)

# ---------------------------------------------------------------- 4. sword rebuilt around the right fist
steel = bpy.data.materials.new('PS2 • sword steel'); steel.use_nodes = True
nt = steel.node_tree; bsdf = nt.nodes['Principled BSDF']
noise = nt.nodes.new('ShaderNodeTexNoise'); noise.inputs['Scale'].default_value = 60; noise.inputs['Detail'].default_value = 8
ramp = nt.nodes.new('ShaderNodeValToRGB'); ramp.color_ramp.elements[0].color = (.12, .1, .085, 1); ramp.color_ramp.elements[0].position = .3
ramp.color_ramp.elements[1].color = (.58, .58, .56, 1); ramp.color_ramp.elements[1].position = .62
nt.links.new(noise.outputs['Fac'], ramp.inputs['Fac']); nt.links.new(ramp.outputs['Color'], bsdf.inputs['Base Color'])
grip_leather = leather
c = fist('r')
blade_dir = (P('index_01_r').head - P('pinky_01_r').head).normalized()
edge = (P('hand_r').matrix.col[1].xyz - blade_dir * P('hand_r').matrix.col[1].xyz.dot(blade_dir)).normalized()
flat = blade_dir.cross(edge)
SW = dict(c=c, d=blade_dir, e=edge, f=flat)


def sword_mesh():
    verts, faces, mats = [], [], []

    def add(pts, fs, m):
        b = len(verts); verts.extend(pts); faces.extend(tuple(i + b for i in f) for f in fs); mats.extend([m] * len(fs))

    L = lambda a, e=0, f=0: c + blade_dir * a + edge * e + flat * f
    # grip: hexagonal tube through the fist
    rs = [ring(L(a), blade_dir, edge, .0115, .0135) for a in (-.058, -.03, 0, .03, .05)]
    b = len(verts)
    for r in rs: verts.extend(r)
    for j in range(len(rs) - 1):
        for k in range(6): faces.append((b + j * 6 + k, b + j * 6 + (k + 1) % 6, b + (j + 1) * 6 + (k + 1) % 6, b + (j + 1) * 6 + k)); mats.append(1)
    # crossguard: chamfered bar, slightly drooping arms
    g0 = .058
    gb = []
    for e, droop in ((-.075, .01), (-.025, 0), (.025, 0), (.075, .01)):
        for a, f in ((-.009, -.009), (-.009, .009), (.008, .009), (.008, -.009)):
            gb.append(L(g0 + a + droop, e, f * (.75 if abs(e) > .05 else 1)))
    gf = [(0, 1, 2, 3)[::-1], (12, 13, 14, 15)]
    for j in range(3):
        for k in range(4):
            a = j * 4 + k; bq = j * 4 + (k + 1) % 4
            gf.append((a, bq, bq + 4, a + 4))
    add(gb, gf, 0)
    # blade: lozenge section with ricasso, taper and point
    sec = lambda a, w, t: [L(a, -w, 0), L(a, 0, -t), L(a, w, 0), L(a, 0, t)]
    stations = [(.07, .026, .0075), (.1, .025, .0072), (.4, .021, .0065), (.62, .016, .0055), (.72, .009, .004)]
    bb = len(verts)
    for a, w, t in stations: verts.extend(sec(a, w, t))
    for j in range(len(stations) - 1):
        for k in range(4):
            i0 = bb + j * 4 + k; i1 = bb + j * 4 + (k + 1) % 4
            faces.append((i0, i1, i1 + 4, i0 + 4)); mats.append(0)
    tip = len(verts); verts.append(L(.79)); last = bb + (len(stations) - 1) * 4
    for k in range(4): faces.append((last + k, last + (k + 1) % 4, tip)); mats.append(0)
    faces.append((bb + 3, bb + 2, bb + 1, bb)); mats.append(0)
    # wheel pommel
    pr = ring(L(-.06), blade_dir, edge, .017, .021, 8); pr2 = ring(L(-.076), blade_dir, edge, .017, .021, 8)
    pb_ = len(verts); verts.extend(pr + pr2)
    for k in range(8): faces.append((pb_ + k, pb_ + (k + 1) % 8, pb_ + 8 + (k + 1) % 8, pb_ + 8 + k)); mats.append(0)
    faces.append(tuple(range(pb_ + 7, pb_ - 1, -1))); mats.append(0); faces.append(tuple(range(pb_ + 8, pb_ + 16))); mats.append(0)
    me = bpy.data.meshes.new('Pilgrim sword'); me.from_pydata([v[:] for v in verts], [], faces); me.update()
    for p, m in zip(me.polygons, mats): p.material_index = m
    bm = bmesh.new(); bm.from_mesh(me); bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces)); bm.to_mesh(me); bm.free()
    me.uv_layers.new(name='SourceUV'); me.materials.append(steel); me.materials.append(grip_leather)
    return me


me = sword_mesh()
parts['Pilgrim sword'] = dict(mesh=me, weights=[{'hand_r': 1}] * len(me.vertices), mats=[steel, grip_leather], rigid=True)

# ---------------------------------------------------------------- 5. shield re-seated: grip across the left palm, face on the back of the hand
for n in [n for n in parts if n.startswith('Shield rear leather arm strap')]: del parts[n]
shield_parts = [n for n in parts if n.startswith(SHIELD)]
board = parts['Convex round wooden shield']['mesh']
bv = np.array([v.co[:] for v in board.vertices]); bc = Vector(bv.mean(0))
g = parts['Shield held leather grip']['mesh']; gc = Vector(np.array([v.co[:] for v in g.vertices]).mean(0))
old_normal = Vector((0, -1, 0)); old_up = Vector((0, 0, 1))  # face points forward; the grip bar runs vertically
lc = fist('l'); pnl = palm_normal('l'); hdl = P('hand_l').matrix.col[1].xyz.normalized()
new_normal = -pnl  # shield face sits on the back of the hand
new_up = hdl.cross(pnl).normalized()  # grip bar along the knuckle line
Rold = Matrix((old_up.cross(old_normal), old_normal, old_up)).transposed()
Rnew = Matrix((new_up.cross(new_normal), new_normal, new_up)).transposed()
Rm = Rnew @ Rold.inverted()
T = Matrix.Translation(lc) @ Rm.to_4x4() @ Matrix.Translation(-gc)
# slide the board toward the elbow so it covers the forearm (grip sits off-centre on enarmes shields)
fore = (P('lowerarm_l').head - P('lowerarm_l').tail).normalized()
board_shift = Matrix.Translation((fore - new_normal * fore.dot(new_normal)).normalized() * .055)
for n in shield_parts:
    m = parts[n]['mesh']
    m.transform((Matrix() if n.startswith(('Shield held leather grip', 'Shield grip')) else board_shift) @ T)
    parts[n]['weights'] = [{'hand_l': 1}] * len(m.vertices); parts[n]['rigid'] = True
# bracket feet must still meet the board after the slide: stretch brackets toward the board along the normal (they're thin)
# forearm loop: a leather enarme strap wrapping the forearm and riveted to the board
bm_ = np.array([v.co[:] for v in board.vertices]); nrm = np.array(new_normal[:])
back_plane = (bm_ @ nrm).min()  # board's rear surface along the outward normal
F = P('lowerarm_l').tail.lerp(P('lowerarm_l').head, .42)
k = new_up; n_ = new_normal; f_ = (P('lowerarm_l').head - P('lowerarm_l').tail).normalized()
near = back_plane - F.dot(n_)  # distance from forearm axis to board back
verts = []; faces = []
for depth in (-.016, .016):
    for (u, v_) in ((-.042, near + .004), (.042, near + .004), (.048, -.034), (-.048, -.034)):
        for r in (0, .006):
            sgn_u = 1 if u > 0 else -1; sgn_v = 1 if v_ > 0 else -1
            verts.append(F + f_ * depth + k * (u + sgn_u * r) + n_ * (v_ + sgn_v * r * (0 if v_ > 0 else 1)))
# index: depth(2) x corner(4) x layer(2)
idx = lambda d, c, l: d * 8 + c * 2 + l
for c in range(4):
    c2 = (c + 1) % 4
    for l in (0, 1):
        faces.append((idx(0, c, l), idx(0, c2, l), idx(1, c2, l), idx(1, c, l)))
    for d in (0, 1):
        faces.append((idx(d, c, 0), idx(d, c, 1), idx(d, c2, 1), idx(d, c2, 0)))
me = bpy.data.meshes.new('Shield forearm strap'); me.from_pydata([x[:] for x in verts], [], faces); me.update()
bmx = bmesh.new(); bmx.from_mesh(me); bmesh.ops.recalc_face_normals(bmx, faces=list(bmx.faces)); bmx.to_mesh(me); bmx.free()
me.uv_layers.new(name='SourceUV'); me.materials.append(leather)
parts['Shield forearm strap'] = dict(mesh=me, weights=[{'hand_l': 1}] * len(me.vertices), mats=[leather], rigid=True)
shield_parts.append('Shield forearm strap')

print('PART_TRIS', sorted(((sum(len(q.vertices) - 2 for q in v['mesh'].polygons), k) for k, v in parts.items()), reverse=True)[:22])
# ---------------------------------------------------------------- 6. smooth weights from distance to posed bone segments
CAND = {
    'Hips': ['pelvis', 'spine_01'], 'Spine': ['spine_01', 'spine_02'], 'Chest': ['spine_02', 'spine_03'],
    'Neck': ['neck_01', 'spine_03', 'Head'], 'Head': ['Head'], 'Cape.01': ['spine_03', 'cape_01', 'cape_02'], 'Cape.02': ['cape_01', 'cape_02'],
}
for s, S in (('l', 'L'), ('r', 'R')):
    CAND.update({f'Clavicle.{S}': [f'clavicle_{s}'], f'UpperArm.{S}': [f'clavicle_{s}', f'upperarm_{s}', f'lowerarm_{s}'],
                 f'Forearm.{S}': [f'upperarm_{s}', f'lowerarm_{s}', f'hand_{s}'], f'Hand.{S}': [f'hand_{s}'],
                 f'Thigh.{S}': ['pelvis', f'thigh_{s}', f'calf_{s}'], f'Shin.{S}': [f'thigh_{s}', f'calf_{s}', f'foot_{s}'],
                 f'Foot.{S}': [f'calf_{s}', f'foot_{s}', f'ball_{s}']})
OVERRIDE = {  # rigid pieces: (bone list) -> distance blend only among these
    'Asymmetric rust-red shoulder mantle': ['spine_03', 'clavicle_l', 'clavicle_r', 'neck_01'],
    'Single angular pauldron': ['clavicle_l', 'upperarm_l'], 'Pauldron lower articulated lame': ['upperarm_l'],
    'Corroded shaped breastplate': ['spine_02', 'spine_03'], 'Rolled lower plate rim': ['spine_02'],
    'Ragged layered charcoal tunic': ['pelvis', 'spine_01', 'spine_02', 'thigh_l', 'thigh_r'],
    'Torso • fitted gambeson': ['pelvis', 'spine_01', 'spine_02', 'spine_03', 'clavicle_l', 'clavicle_r'],
    'Open cloth hood': ['Head', 'neck_01'], 'Folded hood cowl': ['neck_01', 'Head', 'spine_03'],
    'Dark neck lining beneath hood': ['neck_01', 'Head'],
    'Torn short pilgrim cape': ['spine_03', 'cape_01', 'cape_02'],
    'Mantle clasp leather strap': ['spine_03'],
}
seg = {b.name: (np.array(P(b.name).head[:]), np.array(P(b.name).tail[:])) for b in arm.data.bones}


def seg_dist(pts, bone):
    a, b = seg[bone]; ab = b - a
    t = np.clip(((pts - a) @ ab) / max(ab @ ab, 1e-9), 0, 1)
    return np.linalg.norm(pts - (a + t[:, None] * ab), axis=1)


for n, p in parts.items():
    if p.get('rigid'): continue
    me = p['mesh']; pts = np.array([v.co[:] for v in me.vertices])
    if n in OVERRIDE:
        cand_v = [OVERRIDE[n]] * len(pts)
    else:
        cand_v = [sorted({b for g in w for b in CAND.get(g, ['pelvis'])}) for w in p['weights']]
    bones = sorted({b for c in cand_v for b in c})
    D = np.stack([seg_dist(pts, b) for b in bones], 1)
    W = 1 / (D + .012) ** 4
    mask = np.zeros_like(W)
    for i, c in enumerate(cand_v):
        for b in c: mask[i, bones.index(b)] = 1
    W *= mask
    if n == 'Ragged layered charcoal tunic':  # skirt follows legs only partially
        for s in 'lr':
            j = bones.index(f'thigh_{s}'); W[:, j] *= .55
    if n == 'Torn short pilgrim cape':  # top stays on the chest
        z = pts[:, 2]; j = bones.index('spine_03'); W[:, j] *= np.clip((z - 1.25) / .15, 0, 1) * 40 + .01
    # keep the 3 strongest, normalise
    order = np.argsort(-W, 1)[:, 3:]
    np.put_along_axis(W, order, 0, 1)
    W /= W.sum(1, keepdims=True)
    p['weights'] = [{bones[j]: float(W[i, j]) for j in np.nonzero(W[i] > .01)[0]} for i in range(len(pts))]
    for d in p['weights']:
        t = sum(d.values())
        for k in d: d[k] /= t

# ---------------------------------------------------------------- 7. assemble objects (posed space)
col = bpy.data.collections.new('Pilgrim PS2'); sc.collection.children.link(col)
for c in list(bpy.data.collections):
    if c is not col and c.name not in ('Pilgrim PS2',) and not c.objects and not c.children: bpy.data.collections.remove(c)


def make_object(name, names):
    objs = []
    for n in names:
        p = parts[n]; ob = bpy.data.objects.new(n, p['mesh']); col.objects.link(ob)
        ob.vertex_groups.clear()
        if not p['mesh'].materials:
            for m in p['mats']: p['mesh'].materials.append(m)
        for i, w in enumerate(p['weights']):
            for b, x in w.items():
                g = ob.vertex_groups.get(b) or ob.vertex_groups.new(name=b); g.add([i], x, 'REPLACE')
        objs.append(ob)
    bpy.ops.object.mode_set(mode='OBJECT') if bpy.context.object and bpy.context.object.mode != 'OBJECT' else None
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs: o.select_set(True)
    vl.objects.active = objs[0]; bpy.ops.object.join(); ob = vl.objects.active; ob.name = name; ob.data.name = name
    bpy.ops.object.select_all(action='DESELECT')
    return ob


bpy.ops.object.mode_set(mode='OBJECT')
for s_ in 'lr':
    dbg = bpy.data.objects.new(f'Debug_Hand_{s_}', parts[f'Glove {s_}']['mesh'].copy()); col.objects.link(dbg)
    if not dbg.data.materials: dbg.data.materials.append(leather)
    dbg.hide_render = True
weapon_names = ['Pilgrim sword'] + shield_parts
body = make_object('Pilgrim_Body', [n for n in parts if n not in weapon_names])
sword = make_object('Pilgrim_Sword', ['Pilgrim sword'])
shield = make_object('Pilgrim_Shield', shield_parts)
MESHES = [body, sword, shield]
# remove the old rig, painting empties and leftovers
for o in list(bpy.data.objects):
    if o.type in ('EMPTY',) or o is old_rig: bpy.data.objects.remove(o)
for o in MESHES:
    for p in o.data.polygons: p.use_smooth = True
    o.data.set_sharp_from_angle(angle=math.radians(50)) if hasattr(o.data, 'set_sharp_from_angle') else None
print('PS2_TRIS', {o.name: sum(len(p.vertices) - 2 for p in o.data.polygons) for o in MESHES})


# ---------------------------------------------------------------- render helpers
CAM = bpy.data.objects['Model camera']


def aim(pos, target, scale):
    CAM.location = pos; d = Vector(target) - Vector(pos)
    CAM.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler(); CAM.data.type = 'ORTHO'; CAM.data.ortho_scale = scale


def shoot(name, pos, target, scale, solo=False, res=(700, 760)):
    aim(pos, target, scale)
    for o in bpy.data.objects:
        if o.type == 'MESH' and o.name != 'Neutral ground':
            o.hide_render = (solo and o.name == 'Pilgrim_Body') or (not solo and o.name.startswith('Debug_')); sc.render.resolution_x, sc.render.resolution_y = res
    sc.render.filepath = str(DOC / f'{name}.png'); bpy.ops.render.render(write_still=True)


sc.cycles.samples = 24 if hasattr(sc, 'cycles') else None
VIEWS = [('front', (0, -6, 1.0), (0, 0, .93), 2.05), ('three-quarter', (3.6, -4.8, 1.3), (0, 0, .93), 2.05),
         ('back', (0, 6, 1.0), (0, 0, .93), 2.05), ('right-side', (-6, 0, 1.0), (0, 0, .93), 2.05),
         ('sword-hand', (-1.4, -6, 1.0), (-.38, -.15, .82), .5), ('shield-hand', (5, -3, 1.1), (.4, 0, .9), .62),
         ('face', (0.6, -6, 1.62), (0, 0, 1.6), .5),
         ('fist-outside', (-6, -.6, .88), (-.34, .03, .88), .26, True), ('fist-front', (-.6, -6, .88), (-.34, .03, .88), .26, True),
         ('fist-inside', (6, -1.5, .88), (-.34, .03, .88), .26, True), ('fist-below', (-1, -3, -4), (-.34, .03, .88), .26, True),
         ('shield-fist', (-6, 1.5, .95), (.36, 0, .9), .5, True)]
if STAGE == 'rig':
    for v in VIEWS: shoot('stage-' + v[0], *v[1:])
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT / 'debug-rig.blend'))
    raise SystemExit(0)

# ---------------------------------------------------------------- 8. shared atlas UVs (texel priority: face, hands, helmet)
for o in [o for o in bpy.data.objects if o.name.startswith('Debug_')]: bpy.data.objects.remove(o)
ATLAS = 512
for o in MESHES:
    uv = o.data.uv_layers.new(name='PS2Atlas'); o.data.uv_layers.active = uv
    o.data.uv_layers['SourceUV'].active_render = True
bpy.ops.object.select_all(action='DESELECT')
for o in MESHES: o.select_set(True)
vl.objects.active = body
bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.uv.smart_project(angle_limit=math.radians(78), island_margin=.002, area_weight=.6, scale_to_bounds=False)
bpy.ops.object.mode_set(mode='OBJECT')


def priority(o, verts):
    if o != body: return 1.0 if o == shield else 1.3
    gi = {g.index: g.name for g in o.vertex_groups}
    w = {}
    for v in verts:
        for g in o.data.vertices[v].groups: w[gi[g.group]] = w.get(gi[g.group], 0) + g.weight
    top = max(w, key=w.get) if w else ''
    z = max(o.data.vertices[v].co.z for v in verts)
    if top == 'Head' and z < 1.72: return 3.0  # face and hood opening
    if top == 'Head': return 1.25
    if 'index' in top or 'middle' in top or 'thumb' in top or 'ring' in top or 'pinky' in top or top.startswith('hand'): return 1.35
    if top.startswith('cape'): return .75
    return 1.0


for o in MESHES:
    bm = bmesh.new(); bm.from_mesh(o.data); uvl = bm.loops.layers.uv['PS2Atlas']; bm.faces.ensure_lookup_table()
    seen = set()
    for f0 in bm.faces:
        if f0.index in seen: continue
        island = [f0]; seen.add(f0.index); stack = [f0]
        while stack:
            f = stack.pop()
            for l in f.loops:
                for l2 in l.edge.link_loops:
                    f2 = l2.face
                    if f2.index in seen: continue
                    # same UVs across the shared edge -> same island
                    a = (l[uvl].uv - l2.link_loop_next[uvl].uv).length + (l.link_loop_next[uvl].uv - l2[uvl].uv).length
                    if a < 1e-5: seen.add(f2.index); island.append(f2); stack.append(f2)
        k = priority(o, {v.index for f in island for v in f.verts})
        if k == 1: continue
        loops = [l for f in island for l in f.loops]
        c = sum((l[uvl].uv for l in loops), Vector((0, 0))) / len(loops)
        for l in loops: l[uvl].uv = c + (l[uvl].uv - c) * k
    bm.to_mesh(o.data); bm.free()
bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT'); bpy.ops.uv.select_all(action='SELECT')
bpy.ops.uv.pack_islands(rotate=True, margin=.0045, shape_method='CONCAVE')
bpy.ops.object.mode_set(mode='OBJECT')

# ---------------------------------------------------------------- 9. bake albedo + AO into one atlas, grade to a PS2 palette
sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'; sc.cycles.samples = 16
ground = bpy.data.objects.get('Neutral ground')
diff = bpy.data.images.new('pilgrim-ps2-diffuse', ATLAS * 2, ATLAS * 2, alpha=True)
ao = bpy.data.images.new('pilgrim-ps2-ao', ATLAS * 2, ATLAS * 2, alpha=False)
mats = {s.material for o in MESHES for s in o.material_slots if s.material}


def target(img):
    for o in MESHES: o.select_set(True)
    vl.objects.active = body
    for m in mats:
        nt = m.node_tree; n = nt.nodes.get('ps2 bake') or nt.nodes.new('ShaderNodeTexImage'); n.name = 'ps2 bake'
        n.image = img; nt.nodes.active = n
        for x in nt.nodes: x.select = x == n


target(diff); sc.render.bake.use_pass_direct = False; sc.render.bake.use_pass_indirect = False
sc.render.bake.margin = 6; sc.render.bake.target = 'IMAGE_TEXTURES'
r = bpy.ops.object.bake(type='DIFFUSE', pass_filter={'COLOR'}, use_clear=True, margin=6); assert r == {'FINISHED'}, r
target(ao); sc.cycles.samples = 64
r = bpy.ops.object.bake(type='AO', use_clear=True, margin=6); assert r == {'FINISHED'}, r


def px(img): return np.array(img.pixels[:], dtype=np.float32).reshape(img.size[1], img.size[0], 4)


D = px(diff); A = px(ao)[..., 0]
rgb = D[..., :3] * (0.56 + 0.44 * A[..., None])
# PS2 grade: slight desaturation toward a cool-warm split, lifted blacks, contrast
lum = rgb @ np.array([.299, .587, .114], np.float32)
rgb = lum[..., None] + (rgb - lum[..., None]) * .9
rgb = np.clip((rgb - .5) * 1.12 + .5, 0, 1) * .94 + .025
# 2x supersampled bake -> box downsample to the final 512 atlas
H = ATLAS
rgb = rgb.reshape(H, 2, H, 2, 3).mean((1, 3)); cov = D[..., 3].reshape(H, 2, H, 2).mean((1, 3))
# 8-bit CLUT: k-means to 128 colours, like a PS2 paletted texture
print('ATLAS_COVERAGE', float((cov > .5).mean()))
rng = np.random.default_rng(7); flat = rgb.reshape(-1, 3); used = flat[cov.reshape(-1) > .5]
C = used[rng.choice(len(used), 128, replace=False)]
for _ in range(14):
    lab = np.argmin(((used[:, None, :] - C[None]) ** 2).sum(-1), 1)
    for k in range(len(C)):
        sel = used[lab == k]
        if len(sel): C[k] = sel.mean(0)
lab = np.argmin(((flat[:, None, :] - C[None]) ** 2).sum(-1), 1)
q = C[lab].reshape(H, H, 3)
final = bpy.data.images.new('pilgrim-ps2-atlas', H, H, alpha=False)
final.pixels[:] = np.concatenate([q, np.ones((H, H, 1), np.float32)], -1).ravel()
final.filepath_raw = str(OUT / 'pilgrim-ps2-atlas.png'); final.file_format = 'PNG'; final.save()
final.filepath = str(OUT / 'pilgrim-ps2-atlas.png')
for img in (diff, ao): bpy.data.images.remove(img)

# ---------------------------------------------------------------- 10. single PS2 material, atlas UV only
ps2 = bpy.data.materials.new('Pilgrim PS2'); ps2.use_nodes = True
nt = ps2.node_tree; bsdf = nt.nodes['Principled BSDF']
tex = nt.nodes.new('ShaderNodeTexImage'); tex.image = final; tex.interpolation = 'Closest'
nt.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
bsdf.inputs['Roughness'].default_value = 1.0
for k in ('Specular IOR Level', 'Specular'):
    if k in bsdf.inputs: bsdf.inputs[k].default_value = 0.0
ps2.use_backface_culling = False
for o in MESHES:
    o.data.materials.clear(); o.data.materials.append(ps2)
    for p_ in o.data.polygons: p_.material_index = 0
    o.data.uv_layers.remove(o.data.uv_layers['SourceUV']); o.data.uv_layers['PS2Atlas'].active_render = True
for m in list(bpy.data.materials):
    if m.users == 0: bpy.data.materials.remove(m)
for im in list(bpy.data.images):
    if im.users == 0: bpy.data.images.remove(im)

POSED = {o.name: [v.co.copy() for v in o.data.vertices] for o in MESHES}
from types import SimpleNamespace
POSED = {k: [SimpleNamespace(co=c) for c in v] for k, v in POSED.items()}
# ---------------------------------------------------------------- 11. inverse skinning: posed A-pose meshes -> T-pose bind
for o in MESHES:
    gi = {g.index: g.name for g in o.vertex_groups}
    for v in o.data.vertices:
        M = Matrix.Diagonal((0, 0, 0, 0)); t = 0
        for g in v.groups:
            if g.weight > 0: M += SKIN[gi[g.group]] * g.weight; t += g.weight
        v.co = (M * (1 / t)).inverted() @ v.co
    o.parent = arm
    m = o.modifiers.new('Skeleton', 'ARMATURE'); m.object = arm
vl.update()
# the evaluated (posed) mesh must reproduce the authored shape
dg = bpy.context.evaluated_depsgraph_get()
err = 0
for o in MESHES:
    ev = o.evaluated_get(dg).to_mesh()
    err = max(err, max((a.co - b.co).length for a, b in zip(ev.vertices, POSED[o.name])))
    o.evaluated_get(dg).to_mesh_clear()
print('ROUNDTRIP_MAX_ERROR', err)
assert err < 1e-4, err

# ---------------------------------------------------------------- 12. guard pose action + UAL2 clips on the new rig
arm.animation_data_create()


def keep_pose_action():
    act = bpy.data.actions.new('Pilgrim_Guard_Pose'); act.use_fake_user = True
    arm.animation_data.action = act
    if hasattr(arm.animation_data, 'action_slot') and act.slots: arm.animation_data.action_slot = act.slots[0]
    for pb in arm.pose.bones:
        pb.matrix_basis = POSE[pb.name]
        pb.keyframe_insert('location', frame=1); pb.keyframe_insert('rotation_quaternion', frame=1)
    return act


for pb in arm.pose.bones: pb.rotation_mode = 'QUATERNION'
guard = keep_pose_action()
for n, a in ual_actions.items(): a.use_fake_user = n in CLIPS
# UAL2 sword clips assume an empty off-hand and open the left fingers; with the shield equipped
# the left hand must keep its grip, so those channels are pinned to the guard-pose curl.
LEFT_FINGERS = tuple(f'"{f}_0{i}_l"' for f in ('index', 'middle', 'ring', 'pinky', 'thumb') for i in (1, 2, 3))


def channelbags(act):
    for layer in getattr(act, 'layers', []):
        for strip in layer.strips:
            for cb in strip.channelbags: yield cb


stripped = 0
for n in CLIPS:
    act = ual_actions[n]; lo, hi = act.frame_range
    for cb in channelbags(act):
        for fc in [fc for fc in cb.fcurves if fc.data_path.startswith('pose.bones[') and any(k in fc.data_path for k in LEFT_FINGERS)]:
            bone = fc.data_path.split('"')[1]; loc, rot, scl = POSE[bone].decompose()
            value = {'location': loc, 'rotation_quaternion': rot, 'scale': scl}.get(fc.data_path.rsplit('.', 1)[1])
            if value is None: continue
            fc.keyframe_points.clear()
            for f in (lo, hi): fc.keyframe_points.insert(f, value[fc.array_index]).interpolation = 'CONSTANT'
            stripped += 1
print('LEFT_FINGER_CHANNELS_HELD', stripped)


def use_action(act, frame=None):
    for pb in arm.pose.bones: pb.matrix_basis = POSE[pb.name]
    arm.animation_data.action = act
    if hasattr(arm.animation_data, 'action_slot') and act.slots: arm.animation_data.action_slot = act.slots[0]
    lo, hi = act.frame_range
    sc.frame_set(int(lo if frame is None else lo + (hi - lo) * frame)); vl.update()


# ---------------------------------------------------------------- 13. renders: authored pose + clips playing on the rig
sc.cycles.samples = 32
if ground: ground.hide_render = False
use_action(guard)
for v in VIEWS: shoot(*v)
ANIM_SHOTS = [('Sword_Regular_A', .35), ('Sword_Regular_C', .45), ('Sword_Block', .5), ('Idle_Shield_Loop', .3),
              ('Hit_Knockback', .3), ('Consume', .5), ('Zombie_Walk_Fwd_Loop', .25), ('Sword_Heavy_Combo', .6)]
for clip, f in ANIM_SHOTS:
    use_action(ual_actions[clip], f)
    shoot(f'anim-{clip}', (3.4, -5, 1.2), (0, -.1, .9), 2.3)
use_action(guard)

# ---------------------------------------------------------------- 14. export
for o in bpy.data.objects:
    o.select_set(o == arm or o in MESHES)
vl.objects.active = arm
# every exported clip lives in an NLA track so the exporter picks them all up by name
for t in list(arm.animation_data.nla_tracks): arm.animation_data.nla_tracks.remove(t)
for act in [guard] + [ual_actions[c] for c in CLIPS]:
    tr = arm.animation_data.nla_tracks.new(); tr.name = act.name
    st = tr.strips.new(act.name, int(act.frame_range[0]), act)
    tr.mute = True
arm.animation_data.action = None
for pb in arm.pose.bones: pb.matrix_basis = POSE[pb.name]
vl.update()
glb = OUT / 'cathedral-pilgrim-ps2.glb'
bpy.ops.export_scene.gltf(filepath=str(glb), use_selection=True, export_format='GLB', export_yup=True,
                          export_skins=True, export_animations=True, export_animation_mode='NLA_TRACKS',
                          export_rest_position_armature=False, export_def_bones=False, export_apply=False,
                          export_image_format='AUTO', export_texcoords=True, export_normals=True)
# restore guard pose as the file's current state and save the editable source
arm.animation_data.action = guard
if hasattr(arm.animation_data, 'action_slot') and guard.slots: arm.animation_data.action_slot = guard.slots[0]
for c in list(bpy.data.collections):
    if not c.objects and not c.children: bpy.data.collections.remove(c)
final.reload()
bpy.ops.wm.save_as_mainfile(filepath=str(OUT / 'cathedral-pilgrim-ps2.blend'), relative_remap=True)
dbg = OUT / 'debug-rig.blend'
if dbg.exists(): dbg.unlink()
tris = {o.name: sum(len(p.vertices) - 2 for p in o.data.polygons) for o in MESHES}
manifest = dict(
    name='Cathedral Pilgrim — PS2 souls-like', source='cathedral-pilgrim-ps2.blend', glb=glb.name,
    texture=dict(file='pilgrim-ps2-atlas.png', size=ATLAS, palette_colours=128, filter='nearest', baked='albedo × ambient occlusion'),
    triangles=tris, total_triangles=sum(tris.values()), materials=1,
    skeleton=dict(standard='Quaternius Universal Animation Library 2 (UE mannequin names and rest orientations)',
                  bones=len(arm.data.bones), extra_bones=['cape_01', 'cape_02'], bind_pose='T-pose', default_pose='Pilgrim_Guard_Pose'),
    meshes={'Pilgrim_Body': 'skinned, max 3 influences', 'Pilgrim_Sword': 'rigid on hand_r', 'Pilgrim_Shield': 'rigid on hand_l'},
    animations=['Pilgrim_Guard_Pose'] + CLIPS,
    three_js='Clips play by bone name. For clips loaded from UAL2_Standard.glb keep quaternion tracks and pelvis/root position only.',
    roundtrip_max_error_m=err)
(OUT / 'manifest.json').write_text(json.dumps(manifest, indent=2))
print('PS2_PILGRIM_DONE', json.dumps(dict(tris=tris, bytes=glb.stat().st_size)))
