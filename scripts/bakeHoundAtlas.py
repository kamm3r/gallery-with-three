"""Bake blended reference paint onto a conventional, packed gameplay UV atlas.

Runs inside Blender, called by buildOssuaryHound.py. Geometry is unchanged.
"""
import bpy, math
from mathutils import Vector

def smooth(t):
    t=max(0,min(1,t));return t*t*(3-2*t)

def bake_hound_atlas(parts, root, packed, head_paint, project, weights, names, to_game):
    descriptors=[(o.name,bone,paint) for o,bone,paint in parts]
    for part_id,(o,bone,paint) in enumerate(parts):
        bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o
        tri=o.modifiers.new('Triangulate before UV bake','TRIANGULATE');bpy.ops.object.modifier_apply(modifier=tri.name)
        o.data.update()
        part_attr=o.data.attributes.new('part_id','INT','FACE')
        for item in part_attr.data:item.value=part_id
        uv_layers={name:o.data.uv_layers.new(name=name) for name in ['SourceBody','SourceFront','SourceSide','GameAtlas']}
        attrs={name:o.data.color_attributes.new(name=name,type='FLOAT_COLOR',domain='CORNER') for name in ['HeadWeight','FrontWeight','DetailWeight','SourceTint']}
        for poly in o.data.polygons:
            centre=to_game(poly.center);normal=to_game(poly.normal).normalized()
            ids,ws=weights(centre,bone);dominant=names[ids[max(range(4),key=lambda k:ws[k])]]
            for li,vi in zip(poly.loop_indices,poly.vertices):
                vertex=o.data.vertices[vi];v=to_game(vertex.co);n=to_game(vertex.normal).normalized()
                uv_layers['SourceBody'].data[li].uv=project(v,normal,paint,dominant,centre)
                scale=900+(1175-900)*smooth((v.y-1.23)/.16)
                py=interpolate(v.y,[1.10,1.162,1.23,1.31,1.39,1.50,1.75],[805,720,640,535,390,265,65])
                uv_layers['SourceFront'].data[li].uv=((360+v.x*scale)/1536,1-py/1024)
                uv_layers['SourceSide'].data[li].uv=((700+(1.215-v.z)*1150)/1536,1-py/1024)
                head=smooth((v.z-.58)/.16)*smooth((v.y-1.0)/.12) if paint in ['skin','ear'] else 0
                front=smooth((abs(n.z)-abs(n.x)+.35)/.7)
                if paint=='ear':
                    # Folded pinnae need their own chart fit; side projection
                    # otherwise samples background beyond the painted ear.
                    ear_u=max(0,min(1,(abs(v.x)-.055)/.245))
                    ear_v=max(0,min(1,(v.y-1.475)/.305))
                    uv_layers['SourceFront'].data[li].uv=((530+ear_u*40)/1536,1-(240-ear_v*100)/1024)
                    head=1;front=1
                detail=.88*(1-head) if paint=='skin' else 0
                for name,value in [('HeadWeight',head),('FrontWeight',front),('DetailWeight',detail)]:
                    attrs[name].data[li].color=(value,value,value,1)
                tint=(.65,.65,.65,1) if paint.startswith('stone') else (.6,.34,.07,1) if paint=='eye' else (.18,.045,.035,1) if paint=='mouth' else (1,1,1,1)
                attrs['SourceTint'].data[li].color=tint
        o.data.uv_layers.active=uv_layers['GameAtlas']
        o.data.materials.clear()
    bpy.ops.object.select_all(action='DESELECT')
    for o,_,_ in parts:o.select_set(True)
    bpy.context.view_layer.objects.active=parts[0][0];bpy.ops.object.join();joined=bpy.context.object
    joined.name='Ossuary Hound UV mapped skin and equipment'
    joined.data.uv_layers.active=joined.data.uv_layers['GameAtlas']
    joined.data.uv_layers['GameAtlas'].active_render=True
    # Reserve half the atlas for the head instead of allowing the large torso
    # and low-detail hardware to consume nearly all available texels.
    part_attr=joined.data.attributes['part_id'];head_attr=joined.data.color_attributes['HeadWeight']
    head_faces=set()
    for poly in joined.data.polygons:
        _,bone,_=descriptors[part_attr.data[poly.index].value]
        if bone in ['head','jaw'] or sum(head_attr.data[li].color[0] for li in poly.loop_indices)/len(poly.loop_indices)>.8:
            head_faces.add(poly.index)
    bpy.context.tool_settings.mesh_select_mode=(False,False,True)
    for head_region in [False,True]:
        for poly in joined.data.polygons:poly.select=(poly.index in head_faces)==head_region
        bpy.ops.object.mode_set(mode='EDIT')
        bpy.ops.uv.smart_project(angle_limit=math.radians(66),island_margin=.003,area_weight=.2,correct_aspect=True,scale_to_bounds=True)
        bpy.ops.object.mode_set(mode='OBJECT')
        layer=joined.data.uv_layers['GameAtlas']
        for poly in joined.data.polygons:
            if (poly.index in head_faces)==head_region:
                for li in poly.loop_indices:layer.data[li].uv.y=layer.data[li].uv.y*.5+(.5 if head_region else 0)

    source=bpy.data.materials.new('Continuous reference paint bake');source.use_nodes=True
    nodes=source.node_tree.nodes;nodes.clear();links=source.node_tree.links
    def node(kind):return nodes.new(kind)
    def attribute(name):
        n=node('ShaderNodeVertexColor');n.layer_name=name;return n.outputs['Color']
    def texture(image,uv):
        n=node('ShaderNodeTexImage');n.image=image;n.interpolation='Linear';n.extension='EXTEND'
        if isinstance(uv,str):
            coords=node('ShaderNodeUVMap');coords.uv_map=uv;links.new(coords.outputs['UV'],n.inputs['Vector'])
        else:links.new(uv,n.inputs['Vector'])
        return n.outputs['Color']
    def mix(a,b,factor):
        n=node('ShaderNodeMixRGB');links.new(a,n.inputs[1]);links.new(b,n.inputs[2]);links.new(factor,n.inputs[0]);return n.outputs[0]
    def math_node(operation,a,b=None):
        n=node('ShaderNodeMath');n.operation=operation
        for i,value in enumerate([a,b]):
            if value is None:continue
            if isinstance(value,(float,int)):n.inputs[i].default_value=value
            else:links.new(value,n.inputs[i])
        return n.outputs[0]
    # Object coordinates are Blender X / -game-Z / game-Y. Sample a small
    # repeating neck-fur swatch per fragment, so legs do not stretch a few pixels.
    coords=node('ShaderNodeTexCoord');xyz=node('ShaderNodeSeparateXYZ');links.new(coords.outputs['Object'],xyz.inputs[0])
    x=math_node('ADD',math_node('MULTIPLY',xyz.outputs['X'],3.1),math_node('MULTIPLY',xyz.outputs['Y'],-1.5))
    x=math_node('ADD',math_node('MULTIPLY',math_node('FRACT',x),140/1536),1340/1536)
    y=math_node('ADD',math_node('MULTIPLY',math_node('FRACT',math_node('MULTIPLY',xyz.outputs['Z'],2.1)),-180/1024),1-720/1024)
    detail_uv=node('ShaderNodeCombineXYZ');links.new(x,detail_uv.inputs['X']);links.new(y,detail_uv.inputs['Y'])
    body=mix(texture(packed,'SourceBody'),texture(head_paint,detail_uv.outputs[0]),attribute('DetailWeight'))
    head=mix(texture(head_paint,'SourceSide'),texture(head_paint,'SourceFront'),attribute('FrontWeight'))
    colour=mix(body,head,attribute('HeadWeight'))
    tint=node('ShaderNodeMixRGB');tint.blend_type='MULTIPLY';tint.inputs[0].default_value=1
    links.new(colour,tint.inputs[1]);links.new(attribute('SourceTint'),tint.inputs[2])
    emission=node('ShaderNodeEmission');links.new(tint.outputs[0],emission.inputs[0])
    output=node('ShaderNodeOutputMaterial');links.new(emission.outputs[0],output.inputs['Surface'])
    baked=bpy.data.images.new('Ossuary Hound packed game diffuse v9',width=2048,height=2048,alpha=False)
    target=node('ShaderNodeTexImage');target.image=baked;nodes.active=target;target.select=True
    joined.data.materials.append(source)
    scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=1
    scene.render.bake.margin=4;scene.render.bake.use_clear=True
    bpy.ops.object.bake(type='EMIT')
    baked.filepath_raw=str(root/'public/assets/characters/ashen-parish/enemies/ossuary-hound-atlas-v9.png');baked.file_format='PNG';baked.save();baked.pack()
    game=bpy.data.materials.new('Baked PS2 creature diffuse');game.use_nodes=True
    shader=game.node_tree.nodes.get('Principled BSDF');shader.inputs['Roughness'].default_value=1
    tex=game.node_tree.nodes.new('ShaderNodeTexImage');tex.image=baked;tex.interpolation='Closest'
    uv=game.node_tree.nodes.new('ShaderNodeUVMap');uv.uv_map='GameAtlas'
    game.node_tree.links.new(uv.outputs['UV'],tex.inputs['Vector']);game.node_tree.links.new(tex.outputs['Color'],shader.inputs['Base Color'])
    joined.data.materials.clear();joined.data.materials.append(game)
    return joined,descriptors

def interpolate(value,x,y):
    if value<=x[0]:return y[0]
    if value>=x[-1]:return y[-1]
    for i in range(len(x)-1):
        if value<=x[i+1]:return y[i]+(y[i+1]-y[i])*(value-x[i])/(x[i+1]-x[i])
