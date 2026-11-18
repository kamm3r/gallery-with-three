"""Blender-source and GLB round-trip checks for the reference-fitted pilgrim."""
import bpy
import json
import math
import struct
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
REVISION=globals().get('ASSET_REVISION',3)
OUT=ROOT/f'public/assets/characters/ashen-parish/pilgrim-v{REVISION}'
DOC=ROOT/f'docs/characters/ashen-parish/pilgrim-v{REVISION}'
bpy.ops.wm.open_mainfile(filepath=str(OUT/f'cathedral-pilgrim-v{REVISION}.blend'))
rig=next(o for o in bpy.context.scene.objects if o.type=='ARMATURE')
names={b.name for b in rig.data.bones}
assert len(names)==22
assert len([i for i in bpy.data.images if i.packed_file])>=3
meshes=[o for o in bpy.context.scene.objects if o.type=='MESH' and
        any(m.type=='ARMATURE' for m in o.modifiers)]
assert len(meshes)>40
for ob in meshes:
    assert all(math.isfinite(x) for v in ob.data.vertices for x in v.co),ob.name
    assert len(ob.data.uv_layers)==1,ob.name
    assert all(-.001<=x<=1.001 for uv in ob.data.uv_layers.active.data for x in uv.uv),ob.name
    assert all(abs(sum(g.weight for g in v.groups)-1)<1e-5 for v in ob.data.vertices),ob.name
    ys=[v.co.y for v in ob.data.vertices]
    if any(word in ob.name.lower() for word in ['trousers','boot','sleeve','breastplate','helmet crown']):
        assert max(ys)-min(ys)>.08,('Body part must be a volume, not a reference card',ob.name)

regression=globals().get('PILGRIM_VALIDATION_REFINER')
regression_report=regression(globals()) if regression else {}
raw=(OUT/f'cathedral-pilgrim-v{REVISION}.glb').read_bytes()
magic,version,size=struct.unpack_from('<III',raw)
assert magic==0x46546c67 and version==2 and size==len(raw)
n,kind=struct.unpack_from('<II',raw,12)
assert kind==0x4e4f534a
gltf=json.loads(raw[20:20+n])
assert len(gltf['scenes'])==1 and len(gltf['skins'])==1
assert len(gltf['skins'][0]['joints'])==22
assert len(gltf['meshes'])==5
assert len(gltf['images'])==(4 if REVISION>=4 else 3)
assert not gltf.get('cameras') and not gltf.get('animations')
assert all(i.get('bufferView') is not None and 'uri' not in i for i in gltf['images'])
triangles=primitives=0
for mesh in gltf['meshes']:
    for p in mesh['primitives']:
        assert all(a in p['attributes'] for a in ['POSITION','NORMAL','TEXCOORD_0','JOINTS_0','WEIGHTS_0'])
        triangles+=gltf['accessors'][p['indices']]['count']//3;primitives+=1

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(OUT/f'cathedral-pilgrim-v{REVISION}.glb'))
rig=next(o for o in bpy.context.scene.objects if o.type=='ARMATURE')
assert {b.name for b in rig.data.bones}==names
skin=[o for o in bpy.context.scene.objects if o.type=='MESH' and
      any(m.type=='ARMATURE' for m in o.modifiers)]
assert len(skin)==5
# Simple deformation probes catch incorrect inverse-bind matrices, not just
# successful parsing of a glTF file. They are not a substitute for motion review.
from mathutils import Quaternion
for name,axis,angle in [('UpperArm.R',(1,0,0),.3),('Thigh.L',(1,0,0),.25),
                        ('Cape.01',(1,0,0),.12)]:
    bone=rig.pose.bones[name];bone.rotation_mode='QUATERNION'
    original=bone.rotation_quaternion.copy()
    bone.rotation_quaternion=original@Quaternion(axis,angle)
    bpy.context.view_layer.update();dg=bpy.context.evaluated_depsgraph_get()
    for ob in skin:
        evaluated=ob.evaluated_get(dg)
        assert all(math.isfinite(x) for v in evaluated.data.vertices for x in v.co)
        assert all(abs(x)<4 for v in evaluated.data.vertices for x in v.co)
    bone.rotation_quaternion=original

report={'source_geometry':'PASS','packed_references':'PASS','normalized_skin_weights':'PASS',
        'uv_bounds':'PASS','real_body_depth':'PASS','glb_round_trip':'PASS',
        'basic_deformation_probes':'PASS','mesh_modules':5,'bones':22,
        'texture_images':len(gltf['images']),'triangles':triangles,'draw_primitives':primitives,'bytes':len(raw),
        'scope':'Cathedral Pilgrim only. Surface transitions still need paint cleanup; no gameplay animations.'}
if regression_report:report['refinement_regressions']=regression_report
(DOC/'validation.json').write_text(json.dumps(report,indent=2)+'\n')
print('PILGRIM_V3_VALIDATED',json.dumps(report))
