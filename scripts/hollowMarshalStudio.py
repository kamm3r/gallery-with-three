"""Consistent warm studio for concept-angle, profile and rear comparisons."""
import bpy
from mathutils import Vector


def make_studio(scene):
    coll=bpy.data.collections.new('PRESENTATION | camera and lighting');scene.collection.children.link(coll)
    def move(ob):
        ob['presentation']=True
        for old in list(ob.users_collection):old.objects.unlink(ob)
        coll.objects.link(ob)
        return ob
    bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.225));ground=move(bpy.context.object);ground.name='PRESENTATION | warm neutral floor'
    mat=bpy.data.materials.new('PRESENTATION | brown ground');mat.use_nodes=True
    bs=mat.node_tree.nodes.get('Principled BSDF');bs.inputs['Base Color'].default_value=(.055,.038,.027,1);bs.inputs['Roughness'].default_value=1
    ground.data.materials.append(mat)
    for name,location,energy,size,color in [('key',(-3,-5,7),1100,4,(1,.86,.7)),('fill',(4,2,5),500,4,(.77,.85,1)),('face fill',(4,-6,4),350,5,(1,.9,.78))]:
        bpy.ops.object.light_add(type='AREA',location=location);light=move(bpy.context.object);light.name='PRESENTATION | '+name
        light.data.energy=energy;light.data.size=size;light.data.color=color
    bpy.ops.object.camera_add(location=(6,-5,3.3));camera=move(bpy.context.object);camera.name='PRESENTATION | concept camera'
    camera.rotation_euler=(Vector((0,0,1.45))-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.type='ORTHO';camera.data.ortho_scale=4.05
    scene.camera=camera;scene.render.engine='CYCLES';scene.cycles.samples=32
    scene.view_settings.exposure=.0;scene.render.film_transparent=False
    scene.world.use_nodes=True;nodes=scene.world.node_tree.nodes;nodes.clear()
    bg=nodes.new('ShaderNodeBackground');bg.inputs['Color'].default_value=(.13,.1,.075,1);bg.inputs['Strength'].default_value=.4
    out=nodes.new('ShaderNodeOutputWorld');scene.world.node_tree.links.new(bg.outputs[0],out.inputs[0])
    scene.render.resolution_x=800;scene.render.resolution_y=1024;scene.render.resolution_percentage=100
    return camera
