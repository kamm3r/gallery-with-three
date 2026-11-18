"""Bake the static watchman, an Hollow Marshal, and a modeled horse.

blender -b -t 8 --python scripts/buildCapitalStatues.py
Source character stays untouched. Exports synchronous kit geometry and an editable blend.
"""
from pathlib import Path
import bpy, math, json, base64, struct, sys
sys.path.insert(0,str(Path(__file__).resolve().parent))
from capitalHollowMarshal import build_hollow_marshal
from hollowMarshalRefine import refine_shapes, add_plinth
from hollowMarshalPaint import bake_atlas
from hollowMarshalStudio import make_studio
from mathutils import Vector, Matrix
ROOT=Path(__file__).resolve().parents[1]
DOC=ROOT/'docs/previews/hollow-marshal';DOC.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=str(ROOT/'public/assets/characters/ashen-parish/pilgrim-ps2/cathedral-pilgrim-ps2.blend'))
bpy.context.preferences.filepaths.save_version=0
arm=bpy.data.objects['PilgrimSkeleton'];scene=bpy.context.scene
body=bpy.data.objects['Pilgrim_Body'];sword=bpy.data.objects['Pilgrim_Sword'];shield=bpy.data.objects['Pilgrim_Shield']
# Sample the existing painted AO into the stone, rather than retaining skin/clothing colours.
image=bpy.data.images.get('pilgrim-ps2-atlas.png')
if image is None:image=bpy.data.images.load(str(ROOT/'public/assets/characters/ashen-parish/pilgrim-ps2/pilgrim-ps2-atlas.png'))
pixels=list(image.pixels[:]);iw,ih=image.size

def bake(source,name,offset=Vector((0,0,0))):
    dg=bpy.context.evaluated_depsgraph_get();ob=source.evaluated_get(dg)
    mesh=bpy.data.meshes.new_from_object(ob,preserve_all_data_layers=True,depsgraph=dg)
    mesh.transform(source.matrix_world);mesh.transform(Matrix.Translation(offset));mesh.calc_loop_triangles()
    points=[];colors=[];normals=[]
    uv=mesh.uv_layers.active.data
    for tri in mesh.loop_triangles:
        for li in tri.loops:
            loop=mesh.loops[li];v=mesh.vertices[loop.vertex_index]
            points.append(tuple(v.co));normals.append(tuple(loop.normal))
            u,vv=uv[li].uv;idx=(int(vv*ih)%ih*iw+int(u*iw)%iw)*4
            r,g,b=pixels[idx:idx+3];lum=.2126*r+.7152*g+.0722*b
            # Broad recesses stay dark; weathered edges retain the source's painted relief.
            value=.22+.74*math.sqrt(max(0,lum))
            colors.append((value*.98,value*.96,value*.91))
    bpy.data.meshes.remove(mesh)
    return points,normals,colors

def combine(parts):return tuple(sum([p[i] for p in parts],[]) for i in range(3))

sentinel=combine([bake(o,o.name) for o in [body,sword,shield]])
# Horse: section-modeled anatomy. Coordinates in metres, front is -Y.
horse=[]
authored=[]
source_objects=set(bpy.data.objects)

def age_color(p,n,tint):
    # Aged bronze values are baked into the mesh, including broad verdigris streaks.
    x,y,z=p
    grain=.92+.065*math.sin(x*83+y*73+z*97)+.035*math.sin(x*191-y*127+z*63)
    broad=math.sin(x*10+math.sin(z*5)+y*6)*math.sin(z*3.7+y*9)
    patina=max(0,min(.72,(broad-.42)*1.5))
    value=(tint[0]+tint[1]+tint[2])/3
    shade=grain*(.88+.18*max(0,n[2]))
    bronze=(value*.43*shade,value*.285*shade,value*.15*shade)
    green=(value*.17,value*.26,value*.215)
    return tuple(max(.008,min(1,a*(1-patina)+b*patina)) for a,b in zip(bronze,green))

# Small, nearest-filtered texture: coarse corrosion, worn scratches and casting pits.
TILE=128
patina=bpy.data.images.new('Hollow Marshal | 128px bronze patina',width=TILE,height=TILE,alpha=True)
patina.colorspace_settings.name='Non-Color'
def hash2(x,y):
    v=math.sin(x*127.1+y*311.7)*43758.5453
    return v-math.floor(v)
def noise(x,y,period):
    x,y=x%period,y%period
    ix,iy=math.floor(x),math.floor(y);fx,fy=x-ix,y-iy
    fx=fx*fx*(3-2*fx);fy=fy*fy*(3-2*fy)
    a,b=hash2(ix%period,iy%period),hash2((ix+1)%period,iy%period)
    c,d=hash2(ix%period,(iy+1)%period),hash2((ix+1)%period,(iy+1)%period)
    return (a*(1-fx)+b*fx)*(1-fy)+(c*(1-fx)+d*fx)*fy
texels=[]
for y in range(TILE):
    for x in range(TILE):
        broad=noise(x/16,y/16,8);grain=hash2(x,y)
        pits=hash2(x//2,y//2)>.89
        scratches=hash2(x//11,y//2)>.975 and x%11<8
        value=.7+.14*broad+.11*grain-.08*pits+.05*scratches
        green=max(0,(noise(x/8,y/32,16)-.56)*1.6)
        rgb=[value*(1-green*.42),value*(1+green*.12),value*(1+green*.3)]
        texels.extend([round(max(0,min(1,v))*255) for v in rgb]+[255])
patina.pixels[:]=[v/255 for v in texels]
patina.filepath_raw=str(DOC/'bronze-patina.png');patina.file_format='PNG';patina.save();patina.pack()
def uv_projection(me):
    uv=me.uv_layers.new(name='BronzeWorldProjection')
    for poly in me.polygons:
        n=poly.normal
        for li in poly.loop_indices:
            p=me.vertices[me.loops[li].vertex_index].co
            uv.data[li].uv=(p.x/4,-p.y/4) if abs(n.z)>=max(abs(n.x),abs(n.y)) else (-p.y/4,p.z/4) if abs(n.x)>abs(n.y) else (p.x/4,p.z/4)
def add_patina(mat,attribute):
    tex=mat.node_tree.nodes.new('ShaderNodeTexImage');tex.image=patina;tex.interpolation='Closest'
    mul=mat.node_tree.nodes.new('ShaderNodeMixRGB');mul.blend_type='MULTIPLY';mul.inputs[0].default_value=1
    mat.node_tree.links.new(attribute.outputs['Color'],mul.inputs[1]);mat.node_tree.links.new(tex.outputs['Color'],mul.inputs[2])
    mat.node_tree.links.new(mul.outputs[0],mat.node_tree.nodes.get('Principled BSDF').inputs['Base Color'])

bronze_material=bpy.data.materials.new('Hollow Marshal | weathered cast bronze')
bronze_material.use_nodes=True
bs=bronze_material.node_tree.nodes.get('Principled BSDF');bs.inputs['Roughness'].default_value=.95;bs.inputs['Metallic'].default_value=.15
attr=bronze_material.node_tree.nodes.new('ShaderNodeVertexColor');attr.layer_name='Bronze'
add_patina(bronze_material,attr)
bronze_material.diffuse_color=(.22,.14,.07,1)

def style_source(ob,tint):
    me=ob.data;ca=me.color_attributes.new(name='Bronze',type='FLOAT_COLOR',domain='CORNER')
    for i,lo in enumerate(me.loops):ca.data[i].color=(*age_color(me.vertices[lo.vertex_index].co,lo.normal,tint),1)
    uv_projection(me)
    me.materials.append(bronze_material);ob['base_tint']=tint;authored.append(ob)

def meshpart(name,verts,faces,tint=(.59,.57,.51),smooth=True):
    # Give two-sided sheets separate back vertices; shared fronts/backs cancel normals.
    verts=list(verts);seen=set();back_vertices={};split_faces=[]
    for face in faces:
        key=frozenset(face)
        if key in seen:
            back=[]
            for index in face:
                if index not in back_vertices:
                    back_vertices[index]=len(verts);verts.append(verts[index])
                back.append(back_vertices[index])
            split_faces.append(tuple(back))
        else:split_faces.append(face);seen.add(key)
    faces=split_faces
    m=bpy.data.meshes.new(name);m.from_pydata(verts,[],faces);m.update()
    o=bpy.data.objects.new(name,m);scene.collection.objects.link(o)
    for p in m.polygons:p.use_smooth=smooth
    m.calc_loop_triangles();p=[];n=[];c=[]
    for tr in m.loop_triangles:
        for li in tr.loops:
            lo=m.loops[li];v=m.vertices[lo.vertex_index];p.append(tuple(v.co));n.append(tuple(lo.normal));c.append(age_color(v.co,lo.normal,tint))
    style_source(o,tint)
    horse.append((p,n,c));return o

def loft(name,sections,axis='y',sides=12,tint=(.59,.57,.51)):
    # along, horizontal centre, vertical centre, horizontal radius, vertical radius
    vs=[]
    for along,cx,cz,rx,rz in sections:
        for i in range(sides):
            a=i*2*math.pi/sides
            if axis=='y':vs.append((cx+math.cos(a)*rx,along,cz+math.sin(a)*rz))
            else:vs.append((cx+math.cos(a)*rx,cz+math.sin(a)*rz,along))
    fs=[]
    for row in range(len(sections)-1):
        for i in range(sides):
            a=row*sides+i;b=row*sides+(i+1)%sides;c=(row+1)*sides+(i+1)%sides;d=(row+1)*sides+i
            fs.append((a,d,c,b) if axis=='y' else (a,b,c,d))
    fs.extend([tuple(range(sides-1,-1,-1)),tuple((len(sections)-1)*sides+i for i in range(sides))])
    if axis=='y':fs[-2]=tuple(reversed(fs[-2]));fs[-1]=tuple(reversed(fs[-1]))
    if sections[-1][0] < sections[0][0]:fs=[tuple(reversed(f)) for f in fs]
    ob=meshpart(name,vs,fs,tint);ob['uv_ring_sides']=sides;ob['uv_ring_count']=len(sections)
    return ob

loft('Horse barrel and quarters',[(-.84,0,1.35,.19,.27),(-.62,0,1.32,.33,.43),(-.28,0,1.28,.36,.41),(.23,0,1.31,.39,.38),(.56,0,1.35,.36,.42),(.78,0,1.31,.22,.31)],sides=16)
# Strong breast and a curved, tapering neck; the throat is cut back beneath the jaw.
loft('Arched neck',[(1.3,0,-.66,.29,.31),(1.54,0,-.74,.25,.27),(1.78,0,-.88,.19,.23),(1.98,0,-1,.13,.17),(2.08,0,-1.08,.11,.12)],axis='z')
loft('Head and muzzle',[(-1.5,0,1.79,.125,.13),(-1.38,0,1.82,.14,.14),(-1.19,0,1.98,.14,.19),(-1.02,0,2.02,.13,.2),(-.94,0,2.03,.1,.13)],sides=10)
for side in [-1,1]:
    # Shoulder/forearm/knee/cannon/fetlock, one leg advanced to break the rigid stance.
    x=side*.255;front=-.58
    advance=.15 if side==1 else -.09
    # The upper attachment is buried in the barrel; the forearm tapers into a
    # distinct carpal joint, slender cannon and angled pastern rather than a cone.
    loft('Foreleg',[(.09,x,front+advance-.025,.052,.065),
        (.19,x,front+advance+.005,.048,.057),
        (.34,x,front+advance+.035,.032,.037),
        (.59,x,front+advance+.045,.034,.04),
        (.70,side*.245,front+advance*.55+.055,.057,.058),
        (.91,side*.235,front+.025,.063,.075),
        (1.15,side*.215,front+.015,.09,.12),
        (1.49,side*.17,front+.03,.13,.165)],axis='z',sides=8)
    rear=.57
    # Thigh -> forward stifle -> backward hock -> straight cannon. The upper
    # thigh joins inside the croup instead of presenting a separate capped lump.
    loft('Hind leg and hock',[(.09,x,rear-.015,.054,.067),
        (.19,x,rear+.02,.046,.056),
        (.39,side*.25,rear+.075,.031,.039),
        (.61,side*.245,rear+.13,.056,.066),
        (.79,side*.235,rear+.035,.068,.075),
        (.97,side*.225,rear-.13,.09,.115),
        (1.2,side*.20,rear-.045,.125,.165),
        (1.52,side*.15,rear,.155,.19)],axis='z',sides=10)
    for y in [front+advance-.045,rear-.035]:
        # Squared toe, sloping front wall and a smaller coronet above the hoof.
        loft('Shaped hoof',[(0,x,y-.018,.073,.105),(.045,x,y-.012,.075,.105),
            (.145,x,y+.025,.046,.055)],
            axis='z',sides=8,tint=(.25,.25,.23))
    # Ears lean apart and forward; flat inner ear faces are recessed.
    loft('Pointed ear',[(2.1,side*.09,-1.01,.055,.07),(2.24,side*.12,-.99,.035,.045),(2.33,side*.13,-.98,.008,.012)],axis='z',sides=6)
    loft('Nostril',[(-1.48,side*.097,1.82,.013,.026),(-1.43,side*.107,1.83,.013,.022)],sides=6,tint=(.22,.21,.19))
# Readable inset horse eyes and nasal openings, independent of texture lighting.
for side in [-1,1]:
    nose=[(side*.12,-1.49,1.83),(side*.134,-1.46,1.856),(side*.133,-1.42,1.83),(side*.12,-1.45,1.804)]
    meshpart('Horse | inset nostril',nose,[(0,1,2,3),(3,2,1,0)],(.15,.16,.14),False)
# Mane in a single irregular swept ribbon, not a row of cubes.
vs=[]
for i,(y,z) in enumerate([(-.48,1.43),(-.57,1.66),(-.68,1.9),(-.84,2.11),(-1.01,2.18)]):
    vs.extend([(-.045,y,z-.08),(.045,y,z-.08),(0,y+.09,z+(.025 if i%2 else .07))])
fs=[]
for i in range(4):
    k=i*3
    for j in range(3):fs.append((k+j,k+(j+1)%3,k+3+(j+1)%3,k+3+j))
meshpart('Swept mane',vs,fs,(.29,.28,.25))
loft('Swept tail',[(.8,0,1.43,.1,.1),(.95,.025,1.21,.09,.13),(1.02,.04,.9,.065,.14),(1.1,.06,.62,.04,.1),(1.14,.08,.47,.016,.025)],sides=8,tint=(.3,.29,.25))
# Thin straps follow the head and flank; no oversized saddle rectangle.
def strap(name,points,width=.018,tint=(.28,.27,.24)):
    for a,b in zip(points,points[1:]):
        a,b=Vector(a),Vector(b);direction=b-a
        bpy.ops.mesh.primitive_cylinder_add(vertices=4,radius=width,depth=direction.length,location=(a+b)*.5)
        ob=bpy.context.object;ob.name=name;ob.rotation_mode='QUATERNION';ob.rotation_quaternion=direction.to_track_quat('Z','Y')
        bpy.context.view_layer.update();me=ob.data;me.transform(ob.matrix_world);ob.matrix_world=Matrix();me.calc_loop_triangles()
        pp=[];nn=[];cc=[]
        for tr in me.loop_triangles:
            for li in tr.loops:
                lo=me.loops[li];pp.append(tuple(me.vertices[lo.vertex_index].co));nn.append(tuple(lo.normal));cc.append(age_color(me.vertices[lo.vertex_index].co,lo.normal,tint))
        style_source(ob,tint)
        horse.append((pp,nn,cc))
strap('Horse | muzzle lip seam',[(-.085,-1.505,1.775),(0,-1.526,1.764),(.085,-1.505,1.775)],.006,(.2,.2,.17))
for side in [-1,1]:
    strap('Bridle',[(side*.12,-1.42,1.78),(side*.16,-1.12,2.12),(side*.1,-.98,2.17)])
    strap('Rein',[(side*.12,-1.42,1.85),(side*.19,-.91,1.69),(.12,-.44,2.29)],.012)
    # Saddlecloth with a shaped hem draping over the barrel.
    vs=[(side*.14,-.3,1.69),(side*.29,-.34,1.58),(side*.38,-.28,1.29),(side*.35,.2,1.17),(side*.38,.49,1.3),(side*.28,.48,1.56),(side*.14,.42,1.69)]
    meshpart('Draped saddlecloth',vs,[tuple(range(7)) if side==1 else tuple(range(6,-1,-1))],(.38,.37,.33),False)
    strap('Girth',[(side*.17,-.05,1.69),(side*.36,-.05,1.49),(side*.37,-.05,1.12),(side*.2,-.05,.92)],.028)
# Original Hollow Marshal geometry, independent of the player mesh and textures.
king_start=len(horse)
build_hollow_marshal(meshpart,loft,strap)
rider=combine(horse[king_start:]);horse=horse[:king_start]
# Re-extract the export from the editable components after fitting the concept silhouette.
refine_shapes(authored)
add_plinth(meshpart)
concept_image=bpy.data.images.load(str(ROOT/'docs/concepts/capital/hollow-marshal-concept-v1.png'));concept_image.pack()
baked,painted_image,paint_data=bake_atlas(authored,concept_image,DOC)
me=baked.data;me.calc_loop_triangles();atlas_uv=me.uv_layers['GameAtlas'].data
pp,nn,cc,mounted_uv=[],[],[],[]
for tri in me.loop_triangles:
    for li in tri.loops:
        lo=me.loops[li];pp.append(tuple(me.vertices[lo.vertex_index].co));nn.append(tuple(lo.normal));cc.append((1,1,1));mounted_uv.append(tuple(atlas_uv[li].uv))
mounted=(pp,nn,cc)
base_points=[tuple(v.co) for ob in authored if ob.name.startswith('Plinth |') for v in ob.data.vertices]
# Save the actual Blender component objects, so the mask, ribs and cloth stay editable.
for ob in source_objects:
    if ob.name in bpy.data.objects:bpy.data.objects.remove(ob,do_unlink=True)
for title,prefix in [('Marshal | editable sculpt','Marshal |'),('Horse | editable sculpt',None)]:
    coll=bpy.data.collections.new(title);scene.collection.children.link(coll)
    for ob in authored:
        if (ob.name.startswith('Marshal |')) != (prefix is not None):continue
        for old in list(ob.users_collection):old.objects.unlink(ob)
        coll.objects.link(ob)
reference=concept_image
ref=bpy.data.objects.new('REFERENCE | approved Hollow Marshal concept',None);scene.collection.objects.link(ref)
ref.empty_display_type='IMAGE';ref.data=reference;ref.empty_display_size=4;ref.location=(4,1,1.8);ref.rotation_euler=(math.pi/2,0,0);ref.hide_render=True
export_collection=bpy.data.collections.new('GAME | atlas export');scene.collection.children.link(export_collection)
for old in list(baked.users_collection):old.objects.unlink(baked)
export_collection.objects.link(baked);baked.hide_render=True;baked.hide_set(True)
scene['asset']='Hollow Marshal equestrian monument';scene['concept']='docs/concepts/capital/hollow-marshal-concept-v1.png'
for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type=='VIEW_3D':
            area.spaces.active.region_3d.view_location=(0,0,1.6)
            area.spaces.active.region_3d.view_distance=5
for _ in range(3):bpy.ops.outliner.orphans_purge(do_recursive=True)
make_studio(scene)
bpy.ops.wm.save_as_mainfile(filepath=str(DOC/'hollow-marshal.blend'))
# Remove source/studio/temporary objects and create the final, editable baked assets.
for ob in list(bpy.data.objects):bpy.data.objects.remove(ob,do_unlink=True)

def object_from_data(name,data):
    positions,normals,colors=data
    mesh=bpy.data.meshes.new(name);mesh.from_pydata(positions,[],[(i,i+1,i+2) for i in range(0,len(positions),3)]);mesh.update()
    ob=bpy.data.objects.new(name,mesh);scene.collection.objects.link(ob)
    ca=mesh.color_attributes.new(name='Stone',type='FLOAT_COLOR',domain='CORNER')
    for i,lo in enumerate(mesh.loops):ca.data[i].color=(*colors[lo.vertex_index],1)
    # Keep the source's authored shading after baking its pose.
    mesh.normals_split_custom_set([normals[lo.vertex_index] for lo in mesh.loops])
    for p in mesh.polygons:p.use_smooth=True
    mat=bpy.data.materials.new(name);mat.use_nodes=True;bs=mat.node_tree.nodes.get('Principled BSDF');bs.inputs['Roughness'].default_value=.96
    attr=mat.node_tree.nodes.new('ShaderNodeVertexColor');attr.layer_name='Stone';mat.node_tree.links.new(attr.outputs['Color'],bs.inputs['Base Color']);ob.data.materials.append(mat)
    if name=='Hollow Marshal':
        bs.inputs['Roughness'].default_value=.88;bs.inputs['Metallic'].default_value=.08
        uv=mesh.uv_layers.new(name='GameAtlas')
        for i,lo in enumerate(mesh.loops):uv.data[i].uv=mounted_uv[lo.vertex_index]
        tex=mat.node_tree.nodes.new('ShaderNodeTexImage');tex.image=painted_image;tex.interpolation='Closest'
        mat.node_tree.links.new(tex.outputs['Color'],bs.inputs['Base Color'])
        mat.node_tree.links.new(tex.outputs['Color'],bs.inputs['Emission Color']);bs.inputs['Emission Strength'].default_value=0
    return ob

objects=[object_from_data('Pilgrim Watchman',sentinel),object_from_data('Hollow Marshal',mounted)]
# Indexed, quantised kit data. Native X/Z/Y -> three.js X/Y/Z; horses face -Z.
out={}
for name,data,reverse in [('sentinel',sentinel,False),('mounted',mounted,True)]:
    ps,ns,cs=data;low=[min(p[i] for p in ps) for i in range(3)];high=[max(p[i] for p in ps) for i in range(3)]
    # Preserve the source's proportions through a uniform fit in the kit dimensions.
    sy=high[2]-low[2];cx=(low[0]+high[0])/2;cy=(low[1]+high[1])/2
    positions=[];normals=[];colors=[];indices=[];uvs=[];lookup={}
    for vertex_index,(p,n,c) in enumerate(zip(ps,ns,cs)):
        sign=-1 if reverse else 1
        v=(sign*(p[0]-cx)/sy,(p[2]-low[2])/sy,-sign*(p[1]-cy)/sy)
        no=(sign*n[0],n[2],-sign*n[1])
        key=tuple(round(x*16384) for x in v)+tuple(round(x*127) for x in no)+tuple(round(max(0,min(1,x))*255) for x in c)
        if name=='mounted':key+=tuple(round(max(0,min(1,x))*65535) for x in mounted_uv[vertex_index])
        if key not in lookup:
            lookup[key]=len(positions)//3;positions.extend(key[:3]);normals.extend(key[3:6]);colors.extend(key[6:9])
            if name=='mounted':uvs.extend(key[9:11])
        indices.append(lookup[key])
    def enc(fmt,values):return base64.b64encode(struct.pack('<'+str(len(values))+fmt,*values)).decode()
    out[name]=dict(identity="hollow-marshal" if name=="mounted" else "pilgrim-watchman", position=enc('h',positions),normal=enc('b',normals),color=enc('B',colors),index=enc('H',indices),vertices=len(positions)//3,triangles=len(indices)//3,width=(high[0]-low[0])/sy,depth=(high[1]-low[1])/sy)
    if name=='mounted':
        out[name]['uv']=enc('H',uvs)
        blo=[min(p[i] for p in base_points) for i in range(3)];bhi=[max(p[i] for p in base_points) for i in range(3)]
        out[name]['base']=dict(position=[-((blo[0]+bhi[0])/2-cx)/sy,(blo[2]-low[2])/sy,((blo[1]+bhi[1])/2-cy)/sy],size=[(bhi[0]-blo[0])/sy,(bhi[2]-blo[2])/sy,(bhi[1]-blo[1])/sy])
placement={k:out['mounted'][k] for k in ['width','depth','base']}
(ROOT/'src/gameplay/generated/capitalStatuePlacement.ts').write_text('// Generated by scripts/buildCapitalStatues.py.\nexport const capitalMountedPlacement = '+json.dumps(placement,separators=(',',':'))+';\n')
text='// Generated by scripts/buildCapitalStatues.py. Do not edit the packed mesh data.\nexport const capitalStatueData = '+json.dumps(out,separators=(',',':'))+';\n'
text += 'export const capitalPatinaData = '+json.dumps(dict(size=TILE,pixels=base64.b64encode(bytes(texels)).decode()),separators=(',',':'))+';\n'
text += 'export const capitalPaintData = '+json.dumps(dict(size=paint_data['size'],palette=base64.b64encode(bytes(paint_data['palette'])).decode(),indices=base64.b64encode(bytes(paint_data['indices'])).decode()),separators=(',',':'))+';\n'
(ROOT/'src/gameplay/generated/capitalStatueData.ts').write_text(text)
# Review the exact atlas-mapped mesh used by the game, with consistent framing.
objects[0].hide_render=True
objects[1].location=(0,0,0)
for _ in range(3):bpy.ops.outliner.orphans_purge(do_recursive=True)
camera=make_studio(scene)
scene.render.filepath=str(DOC/'marshal-model.png');bpy.ops.render.render(write_still=True)
scene.render.resolution_x=1000;scene.render.resolution_y=800
camera.location=(2,-4,2.8);camera.rotation_euler=(Vector((-.12,0,2.71))-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.ortho_scale=1.65
scene.render.filepath=str(DOC/'marshal-closeup.png');bpy.ops.render.render(write_still=True)
scene.render.resolution_x=1000;scene.render.resolution_y=1000
for name,position,target in [('side',(-7,-.2,2.65),(0,0,1.5)),('rear',(3,6,3),(0,.3,1.5))]:
    camera.location=position;camera.rotation_euler=(Vector(target)-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.ortho_scale=4.0
    scene.render.filepath=str(DOC/('marshal-'+name+'.png'));bpy.ops.render.render(write_still=True)
# Inspect the repaired hem, limb attachments and lower-leg anatomy directly.
scene.render.resolution_x=1000;scene.render.resolution_y=760
camera.location=(-7,-.2,1.75);camera.rotation_euler=(Vector((0,.05,.9))-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.ortho_scale=2.9
scene.render.filepath=str(DOC/'marshal-cloak-legs.png');bpy.ops.render.render(write_still=True)
print('CAPITAL_STATUES',json.dumps({n:{k:v for k,v in d.items() if k in ['vertices','triangles','width','depth']} for n,d in out.items()}))
