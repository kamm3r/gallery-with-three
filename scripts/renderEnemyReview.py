"""Render the exported gameplay meshes, UVs and poses; no proxy concept geometry.
node --experimental-strip-types scripts/exportEnemyReview.ts /tmp/enemy-review.json
blender -b -t 8 --python scripts/renderEnemyReview.py -- /tmp/enemy-review.json docs/previews/enemies/lineup.png
"""
import bpy, json, sys, math
from pathlib import Path
from mathutils import Matrix, Vector
root=Path(__file__).resolve().parents[1]
args=sys.argv[sys.argv.index('--')+1:]
data=json.loads(Path(args[0]).read_text())
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
scene=bpy.context.scene
scene.render.engine='CYCLES';scene.cycles.samples=24
scene.cycles.use_denoising=True
scene.world.color=(.28,.28,.28)
world=bpy.data.worlds.new('Studio') if not scene.world else scene.world
scene.world=world;world.use_nodes=True
world.node_tree.nodes['Background'].inputs[0].default_value=(.58,.61,.65,1)
world.node_tree.nodes['Background'].inputs[1].default_value=.6
mat=bpy.data.materials.new('Actual game atlas');mat.use_nodes=True
nodes=mat.node_tree.nodes; shader=nodes.get('Principled BSDF');shader.inputs['Roughness'].default_value=.96
shader.inputs['Metallic'].default_value=.12
tex=nodes.new('ShaderNodeTexImage');tex.image=bpy.data.images.load(str(root/data['atlas']));tex.interpolation='Closest'
attribute=nodes.new('ShaderNodeVertexColor');attribute.layer_name='game_vertex_color'
multiply=nodes.new('ShaderNodeMixRGB');multiply.blend_type='MULTIPLY';multiply.inputs[0].default_value=1
mat.node_tree.links.new(tex.outputs['Color'],multiply.inputs[1]);mat.node_tree.links.new(attribute.outputs['Color'],multiply.inputs[2]);mat.node_tree.links.new(multiply.outputs[0],shader.inputs['Base Color'])
texture_materials={}
def texture_material(path):
    if path not in texture_materials:
        material=mat.copy();material.name=Path(path).stem
        image_node=next(n for n in material.node_tree.nodes if n.type=='TEX_IMAGE')
        image_node.image=bpy.data.images.load(str(root/path));image_node.interpolation='Closest'
        material.node_tree.nodes.get('Principled BSDF').inputs['Metallic'].default_value=0
        texture_materials[path]=material
    return texture_materials[path]
glow=bpy.data.materials.new('Votive glow');glow.use_nodes=True
g=glow.node_tree.nodes.get('Principled BSDF');g.inputs['Base Color'].default_value=(.5,.22,.035,1);g.inputs['Emission Color'].default_value=(1,.3,.025,1);g.inputs['Emission Strength'].default_value=1.8
floor=bpy.data.materials.new('Ground');floor.use_nodes=True;floor.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value=(.12,.13,.13,1)
ink=bpy.data.materials.new('Labels');ink.use_nodes=True;ink.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value=(.8,.75,.65,1)
framing=data.get('framing') or {}
count=len(data['enemies']);spacing=framing.get('spacing',3.25)
for i,e in enumerate(data['enemies']):
    offset=Vector(((i-(count-1)/2)*spacing,0,0))
    turn=Matrix.Rotation(math.radians(framing.get('turnDegrees',-18)),4,'Z')
    # Three Y-up/Z-forward -> Blender Z-up/-Y-forward.
    convert=Matrix(((1,0,0,0),(0,0,-1,0),(0,1,0,0),(0,0,0,1)))
    for j,m in enumerate(e['meshes']):
        verts=[m['position'][k:k+3] for k in range(0,len(m['position']),3)]
        indices=m['index'] or list(range(len(verts)))
        faces=[indices[k:k+3] for k in range(0,len(indices),3)]
        mesh=bpy.data.meshes.new(e['kind']+str(j));mesh.from_pydata(verts,[],faces);mesh.update()
        ob=bpy.data.objects.new(mesh.name,mesh);scene.collection.objects.link(ob)
        matrix=Matrix([m['matrix'][k:k+4] for k in range(0,16,4)]).transposed()
        ob.matrix_world=Matrix.Translation(offset)@turn@convert@matrix
        mesh.materials.append(glow if m['glow'] else texture_material(m['texture']) if m.get('texture') else mat)
        vertex_colors=mesh.color_attributes.new(name='game_vertex_color',type='FLOAT_COLOR',domain='CORNER')
        uv=mesh.uv_layers.new()
        for poly in mesh.polygons:
            poly.use_smooth=True
            for li in poly.loop_indices:
                vi=mesh.loops[li].vertex_index;uv.data[li].uv=m['uv'][vi*2:vi*2+2]
                color=(m.get('color') or [])[vi*3:vi*3+3]
                vertex_colors.data[li].color=(*color,1) if len(color)==3 else (1,1,1,1)
        if m.get('normal'):
            # UV islands split export vertices. Recomputing normals after that
            # split creates false hard facets that are absent in the game.
            mesh.normals_split_custom_set_from_vertices([m['normal'][k:k+3] for k in range(0,len(m['normal']),3)])
    if e.get('target'):
        # A neutral 1.8m collision mannequin, never substituted for the enemy.
        target=offset+turn@convert@Vector(e['target'])
        target_material=bpy.data.materials.new('Player sized target');target_material.diffuse_color=(.22,.43,.49,1)
        for height,radius,depth in [(.83,.23,1.22),(1.62,.17,.28)]:
            bpy.ops.mesh.primitive_uv_sphere_add(segments=12,ring_count=8,radius=1,location=target+Vector((0,0,height)))
            mannequin=bpy.context.object;mannequin.scale=(radius,radius,depth/2);mannequin.data.materials.append(target_material)
    bpy.ops.object.text_add(location=(offset.x-1.25,-1.7,-.12),rotation=(math.pi/2,0,0))
    text=bpy.context.object;text.data.body=e['name'].upper();text.data.size=.16;text.data.extrude=0;text.data.materials.append(ink)
    bpy.ops.mesh.primitive_cylinder_add(vertices=64,radius=1.4,depth=.05,location=(offset.x,0,-.05))
    bpy.context.object.data.materials.append(floor)
bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.24));bpy.context.object.data.materials.append(floor)
for loc,power,size in [((-5,-8,12),2800,9),((8,0,10),2100,8),((0,5,7),1800,7)]:
    bpy.ops.object.light_add(type='AREA',location=loc);light=bpy.context.object;light.data.energy=power;light.data.shape='DISK';light.data.size=size
    light.rotation_euler=(Vector((0,0,1))-light.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.camera_add(location=(0,-26,framing.get("cameraHeight",10.5)));camera=bpy.context.object
camera.rotation_euler=(Vector((0,0,framing.get('targetHeight',1.45)))-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.type='ORTHO';camera.data.ortho_scale=count*spacing+.15;scene.camera=camera
scene.render.resolution_x=count*framing.get("pixelsPerActor",420);scene.render.resolution_y=framing.get("height",850);scene.render.resolution_percentage=100
scene.view_settings.view_transform='Standard'
scene.render.image_settings.file_format='PNG';scene.render.filepath=str(root/args[1]);Path(scene.render.filepath).parent.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath='/tmp/enemy-review-'+Path(args[1]).stem+'.blend')
bpy.ops.render.render(write_still=True)
