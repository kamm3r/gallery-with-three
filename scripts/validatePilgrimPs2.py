"""Validate the PS2 pilgrim GLB against the UAL2 skeleton, without Blender scene state.

blender -b --python-exit-code 1 --python scripts/validatePilgrimPs2.py

Checks that every UAL2 bone exists with the same parent and the same rest-pose local
rotation (recovered from inverse bind matrices), so UAL2 clips drive it directly in
three.js; plus budget, single material/texture, rigid weapons and weight sanity.
"""
from pathlib import Path
import json, struct, zipfile, io
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'public/assets/characters/ashen-parish/pilgrim-ps2'
DOC = ROOT / 'docs/characters/ashen-parish/pilgrim-ps2'
UAL_ZIP = ROOT / 'public/assets/Universal Animation Library 2[Standard].zip'
UAL_GLB = 'Universal Animation Library 2[Standard]/Unreal-Godot/UAL2_Standard.glb'


def load(data):
    assert data[:4] == b'glTF'
    n = struct.unpack_from('<I', data, 12)[0]
    js = json.loads(data[20:20 + n])
    off = 20 + n; bn = struct.unpack_from('<I', data, off)[0]
    return js, data[off + 8:off + 8 + bn]


def accessor(js, binary, i):
    a = js['accessors'][i]; v = js['bufferViews'][a['bufferView']]
    comps = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}[a['type']]
    dt = {5126: np.float32, 5125: np.uint32, 5123: np.uint16, 5121: np.uint8}[a['componentType']]
    start = v.get('byteOffset', 0) + a.get('byteOffset', 0)
    stride = v.get('byteStride')
    item = comps * np.dtype(dt).itemsize
    if stride and stride != item:
        raw = np.frombuffer(binary, np.uint8, count=stride * a['count'], offset=start).reshape(a['count'], stride)[:, :item]
        return np.frombuffer(raw.tobytes(), dt).reshape(a['count'], comps)
    return np.frombuffer(binary, dt, count=comps * a['count'], offset=start).reshape(a['count'], comps)


def quat_to_mat(q):
    x, y, z, w = q
    return np.array([[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
                     [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
                     [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]])


def parents(js):
    p = {}
    for i, n in enumerate(js['nodes']):
        for c in n.get('children', []): p[c] = i
    return p


ours, obin = load((OUT / 'cathedral-pilgrim-ps2.glb').read_bytes())
with zipfile.ZipFile(UAL_ZIP) as z: ual, ubin = load(z.read(UAL_GLB))
report = {}

# --- skeleton: names, hierarchy, rest local rotation
skin = ours['skins'][0]; joints = skin['joints']
ibm = accessor(ours, obin, skin['inverseBindMatrices']).reshape(-1, 4, 4).transpose(0, 2, 1)  # column-major
rest_world = {j: np.linalg.inv(m) for j, m in zip(joints, ibm)}
op = parents(ours); up_ = parents(ual)
oname = {i: n.get('name') for i, n in enumerate(ours['nodes'])}
uname = {i: n.get('name') for i, n in enumerate(ual['nodes'])}
uidx = {v: k for k, v in uname.items()}
ual_joints = ual['skins'][0]['joints']
missing, parent_mismatch, worst = [], [], (0.0, '')
for uj in ual_joints:
    name = uname[uj]
    oj = next((j for j in joints if oname[j] == name), None)
    if oj is None: missing.append(name); continue
    upn = uname.get(up_.get(uj)); opn = oname.get(op.get(oj))
    if upn != opn and upn in [uname[x] for x in ual_joints]: parent_mismatch.append((name, upn, opn))
    R = rest_world[oj][:3, :3]; R /= np.linalg.norm(R, axis=0)
    if op.get(oj) in rest_world:
        P = rest_world[op[oj]][:3, :3]; P = P / np.linalg.norm(P, axis=0); local = P.T @ R
    else:
        local = R
    uq = ual['nodes'][uj].get('rotation', [0, 0, 0, 1])
    ang = np.degrees(np.arccos(np.clip((np.trace(local.T @ quat_to_mat(uq)) - 1) / 2, -1, 1)))
    if ang > worst[0]: worst = (float(ang), name)
report['ual_bones'] = len(ual_joints)
report['missing_ual_bones'] = missing
report['parent_mismatches'] = parent_mismatch
report['max_rest_rotation_difference_degrees'] = round(worst[0], 4)
report['worst_bone'] = worst[1]
assert not missing, missing
assert not parent_mismatch, parent_mismatch
assert worst[0] < .5, worst

# --- meshes, material, texture, budget
tris = {}
for m in ours['meshes']:
    t = 0
    for p in m['primitives']:
        t += ours['accessors'][p['indices']]['count'] // 3
    tris[m['name']] = t
report['triangles'] = tris; report['total_triangles'] = sum(tris.values())
assert report['total_triangles'] <= 8000, tris
report['materials'] = len(ours['materials']); assert report['materials'] == 1
report['images'] = len(ours['images']); assert report['images'] == 1
img = ours['images'][0]; v = ours['bufferViews'][img['bufferView']]
png = obin[v.get('byteOffset', 0):v.get('byteOffset', 0) + v['byteLength']]
w, h = struct.unpack('>II', png[16:24]); report['texture_size'] = [w, h]
assert w <= 512 and h <= 512

# --- weights: normalised, <=4 influences, weapons rigid
for node in ours['nodes']:
    if 'mesh' not in node: continue
    m = ours['meshes'][node['mesh']]; name = m['name']
    for p in m['primitives']:
        W = accessor(ours, obin, p['attributes']['WEIGHTS_0']).astype(np.float64)
        J = accessor(ours, obin, p['attributes']['JOINTS_0'])
        if W.dtype != np.float64 or W.max() > 1.5: W = W / 255.0
        s = W.sum(1); assert np.abs(s - 1).max() < 2e-2, (name, np.abs(s - 1).max())
        used = {oname[joints[j]] for j, w_ in zip(J.ravel(), W.ravel()) if w_ > 1e-3}
        if name == 'Pilgrim_Sword': assert used == {'hand_r'}, used
        if name == 'Pilgrim_Shield': assert used == {'hand_l'}, used
        report.setdefault('influencing_bones', {})[name] = len(used)

# --- clips present
anims = [a['name'] for a in ours.get('animations', [])]
report['animations'] = anims
for n in ['Pilgrim_Guard_Pose', 'Sword_Regular_A', 'Sword_Block', 'Idle_Shield_Loop', 'Hit_Knockback']:
    assert n in anims, n
report['status'] = 'PASS'
(DOC / 'validation.json').write_text(json.dumps(report, indent=2))
print('PILGRIM_PS2_VALIDATED', json.dumps(report))
