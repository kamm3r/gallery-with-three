"""Render a pose contact sheet from the gameplay blend without saving over it."""
import bpy
import math
from pathlib import Path
from mathutils import Vector

root = Path(__file__).resolve().parents[1]
rig = next(o for o in bpy.context.scene.objects if o.type == 'ARMATURE')
body = next(o for o in bpy.context.scene.objects if o.type == 'MESH' and o.name == 'Body')
sword = bpy.data.objects.get('PlayerSword')
scene = bpy.context.scene
poses = [('LedgeGrab', 5), ('LedgeHang', 8), ('LedgeClimb', 13), ('SeatedIdle', 12),
         ('JumpRise', 5), ('JumpFall', 6), ('JumpLand', 2), ('SwordSlashQuick', 6)]
for i, (name, frame) in enumerate(poses):
    rig.animation_data.action = bpy.data.actions[name]
    scene.frame_set(frame)
    bpy.context.view_layer.update()
    depsgraph = bpy.context.evaluated_depsgraph_get()
    offset = Vector(((i % 4) * 3.7, 0, 4 if i < 4 else 0))
    for source in [body] + ([sword] if name.startswith('Sword') else []):
        evaluated = source.evaluated_get(depsgraph)
        mesh = bpy.data.meshes.new_from_object(evaluated)
        obj = bpy.data.objects.new(name + '_' + source.name, mesh)
        scene.collection.objects.link(obj)
        obj.matrix_world = source.matrix_world.copy()
        obj.location += offset
    bpy.ops.object.text_add(location=offset + Vector((-1, -.3, -.45)), rotation=(math.pi / 2, 0, 0))
    text = bpy.context.object
    text.data.body = name
    text.data.size = .23
rig.hide_render = True
body.hide_render = True
if sword: sword.hide_render = True
bpy.ops.object.camera_add(location=(6, -24, 6))
camera = bpy.context.object
camera.rotation_euler = (Vector((5.5, 0, 3.5)) - camera.location).to_track_quat('-Z', 'Y').to_euler()
camera.data.type = 'ORTHO'; camera.data.ortho_scale = 15.5
scene.camera = camera
scene.render.engine = 'BLENDER_WORKBENCH'
scene.display.shading.light = 'STUDIO'
scene.display.shading.color_type = 'MATERIAL'
scene.display.shading.show_shadows = True
scene.display.shading.background_type = 'WORLD'
scene.world.color = (.08, .08, .08)
scene.render.resolution_x = 1400; scene.render.resolution_y = 850; scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = 'PNG'
scene.render.filepath = str(root / 'public/assets/characters/animation-poses.png')
bpy.ops.render.render(write_still=True)
