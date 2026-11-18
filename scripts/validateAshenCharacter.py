"""Validate generated Blender source and round-trip each game export.

Run: blender -b --python scripts/validateAshenCharacter.py
"""

import bpy
import json
import math
import struct
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'public/assets/characters/ashen-parish'
DOC = ROOT / 'docs/characters/ashen-parish'
manifest = json.loads((OUT / 'manifest.json').read_text())
bpy.ops.wm.open_mainfile(filepath=str(OUT / manifest['source']))
assert len(bpy.data.scenes) == 6, 'Source, four presets and gallery must be present'
assert any(image.packed_file for image in bpy.data.images if image.size[:] == (512, 512))
source = bpy.data.scenes['00 • Modular source']
assert sum(o.type == 'ARMATURE' for o in source.objects) == 1
source_rig = next(o for o in source.objects if o.type == 'ARMATURE')
bone_names = {b.name for b in source_rig.data.bones}
assert len(bone_names) == 22
for ob in source.objects:
    if ob.type != 'MESH':
        continue
    assert all(math.isfinite(value) for v in ob.data.vertices for value in v.co)
    assert any(m.type == 'ARMATURE' and m.object == source_rig for m in ob.modifiers), ob.name
    assert len(ob.data.uv_layers) == 1, ob.name
    for vertex in ob.data.vertices:
        assert abs(sum(g.weight for g in vertex.groups)-1) < 1e-5, (ob.name, vertex.index)

report = {'blender_source': 'PASS', 'packed_512px_atlas': 'PASS',
          'source_vertex_weights': 'PASS', 'exports': []}
for item in manifest['variants']:
    path = OUT / item['glb']
    raw = path.read_bytes()
    magic, version, length = struct.unpack_from('<III', raw)
    assert magic == 0x46546c67 and version == 2 and length == len(raw)
    json_size, kind = struct.unpack_from('<II', raw, 12)
    assert kind == 0x4e4f534a
    gltf = json.loads(raw[20:20+json_size])
    assert len(gltf['scenes']) == 1, 'Export leaked other outfit scenes'
    assert len(gltf['skins']) == 1
    assert len(gltf['meshes']) == 3, 'Body, outfit, equipment must remain distinct modules'
    assert len(gltf['animations']) == 1
    assert len(gltf['skins'][0]['joints']) == 22
    assert len(gltf['images']) == 1 and gltf['images'][0].get('bufferView') is not None
    assert all('uri' not in image for image in gltf['images']), 'GLB must embed its textures'
    triangles = 0
    primitives = 0
    for mesh in gltf['meshes']:
        for primitive in mesh['primitives']:
            attributes = primitive['attributes']
            assert all(key in attributes for key in ['POSITION', 'NORMAL', 'TEXCOORD_0', 'JOINTS_0', 'WEIGHTS_0'])
            assert gltf['accessors'][attributes['POSITION']]['count'] > 0
            triangles += gltf['accessors'][primitive['indices']]['count'] // 3
            primitives += 1
    # A fresh import verifies the written GLB, not just Blender's source data.
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(path))
    imported = bpy.context.scene
    rig = next(o for o in imported.objects if o.type == 'ARMATURE')
    assert {b.name for b in rig.data.bones} == bone_names
    # Blender's importer may add an Icosphere as a bone display helper.
    skinned = [o for o in imported.objects if o.type == 'MESH' and
               any(m.type == 'ARMATURE' for m in o.modifiers)]
    assert len(skinned) == 3
    assert all(o.parent is not None for o in skinned)
    assert bpy.data.actions, 'Breathing preview must survive import'
    imported.frame_set(1)
    bpy.context.view_layer.update()
    # Evaluated vertices catch broken inverse bind matrices and nonfinite skinning.
    depsgraph = bpy.context.evaluated_depsgraph_get()
    for ob in skinned:
        evaluated = ob.evaluated_get(depsgraph)
        assert all(math.isfinite(v) for vert in evaluated.data.vertices for v in vert.co)
    report['exports'].append({'id': item['id'], 'round_trip': 'PASS', 'triangles': triangles,
                              'draw_primitives': primitives, 'mesh_modules': 3,
                              'bones': 22, 'animations': 1, 'bytes': len(raw)})

(DOC / 'validation.json').write_text(json.dumps(report, indent=2)+'\n')
print('ASHEN_VALIDATION_PASS', json.dumps(report))
