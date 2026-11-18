"""Validate the editable Blender source and its relationship to the game export."""
from pathlib import Path
import bpy,json,base64,math,re
ROOT=Path(__file__).resolve().parents[1]
asset=ROOT/'docs/previews/hollow-marshal/hollow-marshal.blend'
bpy.ops.wm.open_mainfile(filepath=str(asset))
meshes=[o for o in bpy.data.objects if o.type=='MESH' and not o.get('asset_export') and not o.get('presentation')]
assert meshes, 'No editable meshes'
assert not [o for o in bpy.data.objects if o.type=='ARMATURE'], 'Unexpected character rig'
assert not any('Pilgrim' in o.name for o in bpy.data.objects), 'Player objects leaked into the asset'
for feature in ['fractured mask seam','parasite hooked rib','restraint buckle','notched executioner blade','torn folded burial mantle','grave-mask face plate','funeral hanging strip','broken stirrup','articulated curled finger','deep exposed eye socket']:
    assert any(feature in o.name for o in meshes), feature
reference=bpy.data.objects.get('REFERENCE | approved Hollow Marshal concept')
assert reference and reference.data.packed_file, 'Missing packed concept reference'
texture=next(i for i in bpy.data.images if 'painted 512 atlas' in i.name)
assert tuple(texture.size)==(512,512) and texture.packed_file, 'Missing packed painted texture'
triangles=0
for o in meshes:
    me=o.data;me.calc_loop_triangles();triangles+=len(me.loop_triangles)
    assert me.color_attributes.get('Bronze'), o.name
    assert me.uv_layers.get('ConceptProjection'), o.name
    assert all(math.isfinite(v) and 0<=v<=1 for uv in me.uv_layers['ConceptProjection'].data for v in uv.uv), 'Invalid paint UV on '+o.name
    shader=me.materials[0].node_tree.nodes.get('Principled BSDF')
    assert shader.inputs['Emission Strength'].default_value==0, 'Paint should receive scene lighting'
    assert all(math.isfinite(v) for p in me.vertices for v in p.co), o.name
    assert all(lo.normal.length>.9 for lo in me.loops), 'Broken shading on '+o.name
# The mantle must be a closed shell, including its hem and the inner lining.
mantle=next(o for o in meshes if 'torn folded burial mantle' in o.name)
edge_use={}
for polygon in mantle.data.polygons:
    for edge in polygon.edge_keys:
        edge_use[edge]=edge_use.get(edge,0)+1
assert all(count==2 for count in edge_use.values()), 'Open or non-manifold mantle edge'
assert triangles<=9000, f'{triangles} triangles exceeds budget'
text=(ROOT/'src/gameplay/generated/capitalStatueData.ts').read_text()
# Check the packed mounted geometry was generated from these same source triangles.
mounted=text.split('mounted:',1)[-1] if 'mounted:' in text else text.split('"mounted":',1)[-1]
match=re.search(r'triangles\s*:\s*(\d+)',mounted)
if match is None:match=re.search(r'"triangles"\s*:\s*(\d+)',mounted)
assert match and int(match.group(1))==triangles, 'Source/export topology differs'
assert bpy.context.scene.camera, 'Missing review camera'
print('HOLLOW_MARSHAL_VALIDATION',json.dumps(dict(meshes=len(meshes),triangles=triangles,packed_concept=True,atlas_size=list(texture.size),player_objects=False)))
