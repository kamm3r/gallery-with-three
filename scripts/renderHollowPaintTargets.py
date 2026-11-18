"""Render fixed square geometry guides for concept-aligned texture painting."""
from pathlib import Path
import bpy,json
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[1];DOC=ROOT/'docs/previews/hollow-marshal';OUT=ROOT/'docs/concepts/capital/marshal-projections';OUT.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=str(DOC/'hollow-marshal.blend'))
scene=bpy.context.scene
for ob in bpy.data.objects:
    if ob.type=='MESH' and not ob.get('presentation'):ob.hide_render=not bool(ob.get('asset_export'))
mesh=next(o for o in bpy.data.objects if o.get('asset_export'));mesh.hide_set(False)
mat=bpy.data.materials.new('Geometry guide | neutral clay');mat.use_nodes=True
bs=mat.node_tree.nodes.get('Principled BSDF');bs.inputs['Base Color'].default_value=(.2,.19,.17,1);bs.inputs['Roughness'].default_value=.9
mesh.data.materials.clear();mesh.data.materials.append(mat)
views=dict(front=dict(position=[6,-5,3.3],target=[0,0,1.45],scale=4.05),side=dict(position=[-7,-.2,2.65],target=[0,0,1.5],scale=4),rear=dict(position=[3,6,3],target=[0,.3,1.5],scale=4),face=dict(position=[2,-4,2.8],target=[-.12,0,2.71],scale=1.65))
scene.render.resolution_x=scene.render.resolution_y=1024;scene.render.resolution_percentage=100;scene.cycles.samples=24
camera=scene.camera
for name,config in views.items():
    camera.location=config['position'];camera.rotation_euler=(Vector(config['target'])-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.ortho_scale=config['scale']
    scene.render.filepath=str(OUT/('target-'+name+'.png'));bpy.ops.render.render(write_still=True)
(OUT/'cameras.json').write_text(json.dumps(views,indent=2)+'\n')
