"""Component UV painting for the PS2 monument: no camera projection or baked light.

Small shared material swatches describe cloth seams, tooled metal and corrosion.
Loft/tube UVs follow their authored rings, preserving folds and articulated parts.
"""
import math
from pathlib import Path
import bpy
import numpy as np

SWATCHES={
    'cloth':(0,0,256,(61,64,57)),
    'armor':(256,0,128,(111,101,75)),
    'bronze':(384,0,128,(92,89,70)),
    'leather':(256,128,128,(48,48,40)),
    'horse':(384,128,128,(85,83,65)),
    'bone':(0,256,128,(126,116,87)),
    'stone':(128,256,128,(101,99,87)),
    'mask':(256,256,128,(133,125,98)),
    'strip':(384,256,128,(76,76,60)),
    'ornament':(0,384,128,(132,118,82)),
    'dark':(128,384,128,(37,41,36)),
    'hand':(256,384,128,(103,96,73)),
    'mane':(384,384,128,(53,56,46)),
}


def category(name):
    n=name.lower()
    if 'plinth' in n:return 'stone'
    if 'blade fuller' in n:return 'dark'
    if 'notched executioner blade' in n:return 'bronze'
    if any(t in n for t in ('eye cavity','nostril','lip seam','fractured mask','exposed eye','eye socket')):return 'dark'
    if any(t in n for t in ('mask','skull','cheek','jaw','tooth','eyelid','brow')) and n.startswith('marshal'):return 'mask'
    if any(t in n for t in ('finger','glove')):return 'hand'
    if any(t in n for t in ('mantle ritual','chain','buckle','rivet','fastening','binding','rolled edge','reliquary','seal cross','seal guard','centre rib')):return 'ornament'
    if any(t in n for t in ('mantle','coat skirt','lapel','burial coat','sleeve','hips','collar','saddlecloth')):return 'cloth'
    if 'funeral hanging' in n:return 'strip'
    if any(t in n for t in ('rein','bridle','belt','strap','girth','grip winding','stirrup','boot')):return 'leather'
    if any(t in n for t in ('parasite','rib spur','root web')):return 'bone'
    if any(t in n for t in ('mane','tail','hoof')):return 'mane'
    if n.startswith('marshal') or any(t in n for t in ('grave-mask','chamfron','harness','blade')):return 'armor'
    return 'horse'


def make_image(folder):
    # The painted atlas follows fixed swatch boundaries, never a scene camera.
    source=bpy.data.images.load(str(Path(__file__).resolve().parents[1]/'docs/concepts/capital/hollow-marshal-ps2-atlas-v1.png'));source.pack()
    reduced=source.copy();reduced.scale(512,512)
    pixels=np.array(reduced.pixels[:],dtype=np.float32).reshape(512,512,4)
    bpy.data.images.remove(reduced)
    rgba=pixels.reshape(-1,4)
    rgb=np.clip(np.rint(rgba[:,:3]*255/8)*8,0,255).astype(np.uint8)
    palette,indices=np.unique(rgb,axis=0,return_inverse=True)
    # Deterministic nearest 256-color palette if the 5-bit swatches need more.
    if len(palette)>256:
        counts=np.bincount(indices);selected=np.argsort(counts)[-256:];clut=palette[selected]
        remap=np.empty(len(palette),int)
        for start in range(0,len(palette),1024):
            remap[start:start+1024]=((palette[start:start+1024,None].astype(float)-clut[None].astype(float))**2).sum(2).argmin(1)
        indices=remap[indices];palette=clut
    if len(palette)<256:palette=np.concatenate([palette,np.repeat(palette[:1],256-len(palette),axis=0)])
    rgba[:,:3]=palette[indices]/255
    image=bpy.data.images.new('Hollow Marshal | painted 512 atlas',width=512,height=512)
    image.colorspace_settings.name='sRGB';image.pixels[:]=rgba.ravel().tolist()
    image.filepath_raw=str(folder/'marshal-painted-atlas.png');image.file_format='PNG';image.save();image.pack()
    return image,dict(size=512,palette=palette.ravel().tolist(),indices=indices.astype(np.uint8).tolist())


def material(image,uv_name):
    mat=bpy.data.materials.new('Marshal | UV-painted bronze');mat.use_nodes=True
    bs=mat.node_tree.nodes.get('Principled BSDF');bs.inputs['Roughness'].default_value=.88;bs.inputs['Metallic'].default_value=.08
    coords=mat.node_tree.nodes.new('ShaderNodeUVMap');coords.uv_map=uv_name
    tex=mat.node_tree.nodes.new('ShaderNodeTexImage');tex.image=image;tex.interpolation='Closest';tex.extension='EXTEND'
    mat.node_tree.links.new(coords.outputs['UV'],tex.inputs['Vector'])
    mat.node_tree.links.new(tex.outputs['Color'],bs.inputs['Base Color'])
    return mat


def bake_atlas(objects,concept,folder,size=512):
    image,paint_data=make_image(folder);mat=material(image,'ConceptProjection')
    for ob in objects:
        me=ob.data;uv=me.uv_layers.new(name='ConceptProjection');me.uv_layers.active=uv;uv.active_render=True
        name=ob.name;kind=category(name);tx,ty,span,_=SWATCHES[kind]
        points=np.array([tuple(v.co) for v in me.vertices]);lo=points.min(0);hi=points.max(0);extent=np.maximum(hi-lo,.001)
        centered=points-points.mean(0)
        _,axes=np.linalg.eigh(centered.T@centered)
        planar=centered@axes[:,-2:];pmin=planar.min(0);prange=np.maximum(planar.max(0)-pmin,.001)
        sides=ob.get('uv_ring_sides');rings=ob.get('uv_ring_count')
        for poly in me.polygons:
            ring_uv=[]
            if sides:
                ring_uv=[((me.loops[li].vertex_index%sides)/sides,(me.loops[li].vertex_index//sides)/(rings-1)) for li in poly.loop_indices]
                us=[p[0] for p in ring_uv]
                if max(us)-min(us)>.5:ring_uv=[(u+1 if u<.5 else u,v) for u,v in ring_uv]
            for k,li in enumerate(poly.loop_indices):
                vi=me.loops[li].vertex_index;p=me.vertices[vi].co
                if kind=='stone':
                    axes2=[a for a in range(3) if a!=max(range(3),key=lambda a:abs(poly.normal[a]))]
                    u,v=[(p[a]-lo[a])/extent[a] for a in axes2]
                elif sides:u,v=ring_uv[k]
                elif 'torn folded burial mantle' in name:
                    u=.5+math.atan2(p.x,(p.y-.18)/1.3)/(math.pi*1.22);v=(p.z-.6)/1.87
                elif 'coat skirt' in name:
                    u=(p.y-lo[1])/extent[1];v=(p.z-lo[2])/extent[2]
                else:u,v=(planar[vi]-pmin)/prange
                # Two-pixel gutter prevents mip bleed between shared swatches.
                u=max(0,min(1,u));v=max(0,min(1,v))
                uv.data[li].uv=((tx+2+u*(span-4))/512,(ty+2+v*(span-4))/512)
        me.materials.clear();me.materials.append(mat)
    copies=[]
    for source in objects:
        clone=source.copy();clone.data=source.data.copy();bpy.context.scene.collection.objects.link(clone);copies.append(clone)
    bpy.ops.object.select_all(action='DESELECT')
    for ob in copies:ob.select_set(True)
    bpy.context.view_layer.objects.active=copies[0];bpy.ops.object.join()
    baked=bpy.context.object;baked.name='GAME | Hollow Marshal atlas mesh';baked['asset_export']=True
    me=baked.data;source_uv=me.uv_layers['ConceptProjection'].data
    atlas_uv=me.uv_layers.new(name='GameAtlas');me.uv_layers.active=atlas_uv;atlas_uv.active_render=True
    for i,item in enumerate(atlas_uv.data):item.uv=source_uv[i].uv
    me.materials.clear();me.materials.append(material(image,'GameAtlas'))
    return baked,image,paint_data
