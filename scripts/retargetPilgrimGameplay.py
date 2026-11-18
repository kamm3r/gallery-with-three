"""Retarget the game's player clips (Casual_Male_gameplay.glb) onto the PS2 pilgrim.

blender -b --python-exit-code 1 --python scripts/retargetPilgrimGameplay.py [-- --renders]

Writes public/assets/characters/ashen-parish/pilgrim-ps2/cathedral-pilgrim-ps2-gameplay.glb with
every gameplay clip under its original name, so AnimatedCharacter drives the pilgrim exactly
like the old player. Both rigs rest in a T-pose, so each pilgrim bone copies its source bone's
world-space rotation change from rest. Hip translation is scaled by the leg-length ratio, the
fingers keep the guard grip, and the right hand carries one fixed offset that lines the
pilgrim's blade up with the original sword.
"""
from pathlib import Path
import sys, json, math
import bpy
import numpy as np
from mathutils import Matrix, Vector, Quaternion

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'public/assets/characters/ashen-parish/pilgrim-ps2'
DOC = ROOT / 'docs/characters/ashen-parish/pilgrim-ps2'
SOURCE = ROOT / 'public/assets/quaternius/ultimate-animated-character/Casual_Male_gameplay.glb'
GAME_SCALE = 1.05  # world metres per pilgrim unit in the game (Casual_Male used 0.82)
RENDERS = '--renders' in sys.argv
COMPARE = '--compare' in sys.argv

bpy.ops.wm.open_mainfile(filepath=str(OUT / 'cathedral-pilgrim-ps2.blend'))
sc = bpy.context.scene; vl = bpy.context.view_layer
tgt = bpy.data.objects['PilgrimSkeleton']
guard = bpy.data.actions['Pilgrim_Guard_Pose']
before_actions = set(bpy.data.actions)
before = set(bpy.data.objects)
bpy.ops.import_scene.gltf(filepath=str(SOURCE))
imported = [o for o in bpy.data.objects if o not in before]
src = next(o for o in imported if o.type == 'ARMATURE')
src_sword = next(o for o in imported if o.name.startswith('PlayerSword'))
clips = [a for a in bpy.data.actions if a not in before_actions]
for o in imported: o.hide_render = True

MAP = {'pelvis': 'Body', 'spine_01': 'Hips', 'spine_02': 'Abdomen', 'spine_03': 'Torso', 'neck_01': 'Neck', 'Head': 'Head'}
for s, S in (('l', 'L'), ('r', 'R')):
    MAP.update({f'clavicle_{s}': f'Shoulder.{S}', f'upperarm_{s}': f'UpperArm.{S}', f'lowerarm_{s}': f'LowerArm.{S}',
                f'hand_{s}': f'Fist.{S}', f'thigh_{s}': f'UpperLeg.{S}', f'calf_{s}': f'LowerLeg.{S}', f'foot_{s}': f'Foot.{S}'})
FINGER = ('index', 'middle', 'ring', 'pinky', 'thumb')

# guard-pose basis for fingers (they keep the grip in every gameplay clip)
tgt.animation_data.action = guard
if guard.slots: tgt.animation_data.action_slot = guard.slots[0]
sc.frame_set(1); vl.update()
GRIP = {pb.name: pb.matrix_basis.copy() for pb in tgt.pose.bones if pb.name.startswith(FINGER)}
tgt.animation_data.action = None
for pb in tgt.pose.bones: pb.matrix_basis = Matrix()
vl.update()

sw = src.matrix_world
src.animation_data_create()
src.animation_data.action = None
for pb in src.pose.bones: pb.matrix_basis = Matrix()
vl.update()
SRC_REST = {b.name: sw @ b.matrix_local for b in src.data.bones}
TGT_REST = {b.name: b.matrix_local.copy() for b in tgt.data.bones}


def leg(arm_rest, hip, ankle): return (arm_rest[hip].translation - arm_rest[ankle].translation).length


K = (leg(TGT_REST, 'thigh_l', 'foot_l') / leg(SRC_REST, 'UpperLeg.L', 'Foot.L'))


# --- blade alignment: fixed rest-space rotation on hand_r so our sword matches theirs
def frame_of(points, origin):
    P = np.array(points); c = P.mean(0); U, S, Vt = np.linalg.svd(P - c)
    blade = Vector(Vt[0]); guard_axis = Vector(Vt[1])
    proj = (P - np.array(origin[:])) @ np.array(blade[:])
    if abs(proj.min()) > abs(proj.max()): blade = -blade
    return blade.normalized(), guard_axis.normalized()


src_pts = [sw @ src_sword.matrix_world @ v.co for v in src_sword.data.vertices] if False else None
dg = bpy.context.evaluated_depsgraph_get()
src_sword_eval = src_sword.evaluated_get(dg)
src_pts = [src_sword.matrix_world @ v.co for v in src_sword_eval.data.vertices]
sword = bpy.data.objects['Pilgrim_Sword']
tgt_pts = [v.co.copy() for v in sword.data.vertices]  # bind (T-pose) coordinates
bs, gs = frame_of(src_pts, SRC_REST['Fist.R'].translation)
bt, gt = frame_of(tgt_pts, TGT_REST['hand_r'].translation)
best = None
for sign in (1, -1):
    Fs = Matrix((bs, gs * sign, bs.cross(gs * sign))).transposed()
    Ft = Matrix((bt, gt, bt.cross(gt))).transposed()
    R = Fs @ Ft.transposed()
    ang = R.to_quaternion().angle
    if best is None or ang < best[1]: best = (R, ang)
RC = best[0]
print('BLADE_OFFSET_DEGREES', math.degrees(best[1]))


def children_first(arm):
    order = []
    def walk(b):
        order.append(b)
        for c in b.children: walk(c)
    for b in arm.data.bones:
        if not b.parent: walk(b)
    return order


ORDER = children_first(tgt)
pelvis_src0 = SRC_REST['Body'].translation


def bake(action):
    src.animation_data.action = action
    if action.slots: src.animation_data.action_slot = action.slots[0]
    lo, hi = (int(round(x)) for x in action.frame_range)
    out = bpy.data.actions.new(action.name)
    keys = {}  # (bone, path, index) -> [(frame, value)]
    for f in range(lo, hi + 1):
        sc.frame_set(f); vl.update()
        sp = {pb.name: sw @ pb.matrix for pb in src.pose.bones}
        pose = {}
        for b in ORDER:
            n = b.name; rest = TGT_REST[n]
            if b.parent:
                M0 = pose[b.parent.name] @ TGT_REST[b.parent.name].inverted() @ rest
            else:
                M0 = rest.copy()
            if n in MAP:
                sn = MAP[n]
                D = sp[sn].to_3x3() @ SRC_REST[sn].to_3x3().inverted()
                rot = D @ (RC if n == 'hand_r' else Matrix.Identity(3)) @ rest.to_3x3()
                head = M0.translation.copy()
                if n == 'pelvis':
                    head = rest.translation + (sp['Body'].translation - pelvis_src0) * K
                desired = Matrix.Translation(head) @ rot.to_4x4()
                basis = M0.inverted() @ desired
            elif n in GRIP:
                basis = GRIP[n]
            else:
                basis = Matrix()
            pose[n] = M0 @ basis
            loc, q, _ = basis.decompose()
            for i in range(3): keys.setdefault((n, 'location', i), []).append((f - lo, loc[i]))
            for i in range(4): keys.setdefault((n, 'rotation_quaternion', i), []).append((f - lo, q[i]))
    # quaternion continuity per bone
    tgt.animation_data.action = out
    for b in ORDER:
        n = b.name; qs = [Quaternion([keys[(n, 'rotation_quaternion', i)][k][1] for i in range(4)]) for k in range(hi - lo + 1)]
        for k in range(1, len(qs)):
            if qs[k].dot(qs[k - 1]) < 0: qs[k].negate()
        for i in range(4): keys[(n, 'rotation_quaternion', i)] = [(k, qs[k][i]) for k in range(len(qs))]
    for (n, path, i), kv in keys.items():
        fc = out.fcurves.new(f'pose.bones["{n}"].{path}', index=i, action_group=n) if hasattr(out, 'fcurves') else None
        if fc is None:
            fc = out.fcurve_ensure_for_datablock(tgt, f'pose.bones["{n}"].{path}', index=i, group_name=n)
        fc.keyframe_points.add(len(kv))
        fc.keyframe_points.foreach_set('co', [x for p in kv for x in p])
        for kp in fc.keyframe_points: kp.interpolation = 'LINEAR'
        fc.update()
    return out


for pb in tgt.pose.bones: pb.rotation_mode = 'QUATERNION'
tgt.animation_data_create()
baked = []
for a in sorted(clips, key=lambda a: a.name):
    src_name = a.name; a.name = src_name + '__casual'
    b = bake(a); b.name = src_name; b.use_fake_user = True; baked.append(b)
    print('BAKED', b.name, len(b.frame_range))

# ledge hand height in the game, for LEDGE_HAND_HEIGHT
tgt.animation_data.action = bpy.data.actions['LedgeHang']
if bpy.data.actions['LedgeHang'].slots: tgt.animation_data.action_slot = bpy.data.actions['LedgeHang'].slots[0]
sc.frame_set(0); vl.update()
ledge = max(tgt.pose.bones['hand_r'].head.z, tgt.pose.bones['hand_l'].head.z) * GAME_SCALE
print('LEDGE_HAND_HEIGHT', ledge)

if RENDERS or COMPARE:
    cam = bpy.data.objects['Model camera']; sc.render.resolution_x, sc.render.resolution_y = 520, 560
    shots = []
    if COMPARE:
        src.location.x += 1.4
        for o in imported:
            if o.type == 'MESH' and not o.name.startswith('Icosphere'): o.hide_render = False
    for name, t in [('Idle', .3), ('Run', .25), ('Walk', .5), ('Roll', .45), ('SwordSlash', .45), ('SwordSlashHeavy', .5),
                    ('Guard', .5), ('Parry', .5), ('JumpAttack', .5), ('LedgeHang', .5), ('Death', 1), ('SeatedIdle', .5)]:
        act = bpy.data.actions[name]; tgt.animation_data.action = act
        if act.slots: tgt.animation_data.action_slot = act.slots[0]
        lo, hi = act.frame_range; sc.frame_set(int(lo + (hi - lo) * t)); vl.update()
        cam.location = (3.4, -5, 1.3); cam.rotation_euler = (Vector((0, 0, .95)) - cam.location).to_track_quat('-Z', 'Y').to_euler()
        cam.data.type = 'ORTHO'; cam.data.ortho_scale = 2.6
        if COMPARE:
            src.animation_data.action = bpy.data.actions[name + '__casual']; src.animation_data.action_slot = src.animation_data.action.slots[0]
            cam.location = (.7 + 3.4, -6, 1.3); cam.rotation_euler = (Vector((.7, 0, 1.0)) - cam.location).to_track_quat('-Z', 'Y').to_euler(); cam.data.ortho_scale = 3.4
            sc.frame_set(int(lo + (hi - lo) * t)); vl.update()
        p = DOC / f'{"compare" if COMPARE else "game"}-{name}.png'; sc.render.filepath = str(p); bpy.ops.render.render(write_still=True); shots.append(p)

# ---- export: gameplay names the game already looks for
for o in imported: bpy.data.objects.remove(o)
for a in list(bpy.data.actions):
    if a.name.endswith('__casual'): bpy.data.actions.remove(a)
sword.name = 'PlayerSword'; bpy.data.objects['Pilgrim_Shield'].name = 'PlayerShield'
socket = bpy.data.objects.new('SwordSocket', None); sc.collection.objects.link(socket)
socket.parent = tgt; socket.parent_type = 'BONE'; socket.parent_bone = 'hand_r'
# socket: origin at the grip, +Z along the blade, +Y toward the knuckles (Casual_Male fist convention)
grip = Vector(np.array([v.co[:] for v in sword.data.vertices]).mean(0)) if False else None
tip_axis = bt; grip_c = TGT_REST['hand_r'].translation
pts = np.array([v.co[:] for v in sword.data.vertices]); proj = (pts - np.array(grip_c[:])) @ np.array(tip_axis[:])
near = pts[proj < np.percentile(proj, 12)].mean(0)  # pommel/grip end
grip_c = Vector(near) + tip_axis * .07
hand_y = TGT_REST['hand_r'].to_3x3().col[1].normalized()
y = (hand_y - tip_axis * hand_y.dot(tip_axis)).normalized(); x = y.cross(tip_axis)
socket.matrix_world = Matrix.Translation(grip_c) @ Matrix((x, y, tip_axis)).transposed().to_4x4()
tgt.animation_data.action = None
for t in list(tgt.animation_data.nla_tracks): tgt.animation_data.nla_tracks.remove(t)
for act in baked:
    tr = tgt.animation_data.nla_tracks.new(); tr.name = act.name; tr.strips.new(act.name, 0, act); tr.mute = True
for pb in tgt.pose.bones: pb.matrix_basis = Matrix()
vl.update()
meshes = [bpy.data.objects[n] for n in ('Pilgrim_Body', 'PlayerSword', 'PlayerShield')]
for o in bpy.data.objects: o.select_set(o == tgt or o in meshes or o == socket)
vl.objects.active = tgt
glb = OUT / 'cathedral-pilgrim-ps2-gameplay.glb'
bpy.ops.export_scene.gltf(filepath=str(glb), use_selection=True, export_format='GLB', export_yup=True,
                          export_skins=True, export_animations=True, export_animation_mode='NLA_TRACKS',
                          export_rest_position_armature=True, export_def_bones=False, export_apply=False,
                          export_texcoords=True, export_normals=True)
info = dict(glb=glb.name, clips=sorted(a.name for a in baked), game_scale=GAME_SCALE, ledge_hand_height=round(ledge, 3),
            hip_motion_scale=round(K, 4), blade_offset_degrees=round(math.degrees(best[1]), 2), bytes=glb.stat().st_size)
(OUT / 'gameplay-manifest.json').write_text(json.dumps(info, indent=2))
print('PILGRIM_GAMEPLAY_DONE', json.dumps(info))
