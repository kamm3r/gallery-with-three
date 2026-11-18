"""Polish the CURRENT pilgrim in place, preserving its file name and rig.

blender -b --python-exit-code 1 --python scripts/polishPilgrim.py
Use -- --quick for the three latest reported-area close-ups.
"""
from pathlib import Path
import bpy
import bmesh
import math
import json
import sys
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'public/assets/characters/ashen-parish/pilgrim-v4'
DOC=ROOT/'docs/characters/ashen-parish/pilgrim-v4'
FILE=OUT/'cathedral-pilgrim-v4.blend'
bpy.ops.wm.open_mainfile(filepath=str(FILE))
bpy.context.preferences.filepaths.save_version=0
sc=bpy.context.scene
rig=bpy.data.objects['PilgrimRig']
S=1.85/(862-20)
def X(px):return (px-443)*S
def Z(py):return (862-py)*S
def P(px,py,y):return (X(px),y,Z(py))
surface=bpy.data.materials['Pilgrim • clean garment surfaces']
paint=bpy.data.materials['Pilgrim • reference-painted cloth']
iron=bpy.data.materials['Equipment • worn steel']
reference=bpy.data.images['pilgrim-turnaround.png']
changed=[]

def recalc(data):
    bm=bmesh.new();bm.from_mesh(data)
    bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
    bm.to_mesh(data);bm.free();data.update()

def replace_mesh(ob,vertices,faces,materials,bone):
    old=ob.data
    data=bpy.data.meshes.new(ob.name+' • editable surface')
    data.from_pydata(vertices,[],faces);data.update();recalc(data)
    ob.data=data
    for mat in materials:data.materials.append(mat)
    data.uv_layers.new(name='PaintedReferenceUV')
    for modifier in list(ob.modifiers):
        if modifier.type!='ARMATURE':ob.modifiers.remove(modifier)
    ob.vertex_groups.clear();group=ob.vertex_groups.new(name=bone)
    group.add(list(range(len(data.vertices))),1,'REPLACE')
    ob.parent=rig
    if not any(m.type=='ARMATURE' for m in ob.modifiers):
        m=ob.modifiers.new('Humanoid skin','ARMATURE');m.object=rig
    if old.users==0:bpy.data.meshes.remove(old)
    changed.append(ob.name)
    return ob

def new_object(name,collection,vertices,faces,material,bone):
    data=bpy.data.meshes.new(name)
    ob=bpy.data.objects.new(name,data);bpy.data.collections[collection].objects.link(ob)
    return replace_mesh(ob,vertices,faces,[material],bone)

def box_uv(ob,tile=None,rect=None,only=None):
    positions=ob.data.vertices
    minima=[min(v.co[i] for v in positions) for i in range(3)]
    maxima=[max(v.co[i] for v in positions) for i in range(3)]
    uv=ob.data.uv_layers.active
    for poly in ob.data.polygons:
        if only is not None and not only(poly):continue
        axis=max(range(3),key=lambda i:abs(poly.normal[i]))
        axes=[i for i in range(3) if i!=axis]
        for li in poly.loop_indices:
            point=positions[ob.data.loops[li].vertex_index].co
            u,v=[(point[i]-minima[i])/max(.001,maxima[i]-minima[i]) for i in axes]
            if tile is not None:
                col=tile%2;bottom=1-tile//2
                uv.data[li].uv=(col*.5+.009+.482*u,bottom*.5+.009+.482*v)
            else:
                x0,x1,y0,y1=rect
                uv.data[li].uv=((x0+(x1-x0)*u)/reference.size[0],1-(y1-(y1-y0)*v)/reference.size[1])

def bvh(name):
    bpy.context.view_layer.update()
    return BVHTree.FromObject(bpy.data.objects[name],bpy.context.evaluated_depsgraph_get())

def front_hit(trees,x,z):
    hits=[tree.ray_cast(Vector((x,-1,z)),Vector((0,1,0)))[0] for tree in trees]
    hits=[h.y for h in hits if h is not None]
    return min(hits) if hits else None

def rear_hit(trees,x,z):
    hits=[tree.ray_cast(Vector((x,1,z)),Vector((0,-1,0)))[0] for tree in trees]
    hits=[h.y for h in hits if h is not None and h.y>0]
    return max(hits) if hits else None

# Material projections must not include background, skin or other pieces of
# equipment. Use a bounded, clean steel patch for the affected metal surfaces.
steel=bpy.data.materials.get('Pilgrim • aged steel surface')
if steel is None:
    steel=bpy.data.materials.new('Pilgrim • aged steel surface');steel.use_nodes=True
    bs=steel.node_tree.nodes.get('Principled BSDF')
    tex=steel.node_tree.nodes.new('ShaderNodeTexImage');tex.image=reference;tex.interpolation='Closest'
    steel.node_tree.links.new(tex.outputs['Color'],bs.inputs['Base Color'])
    steel.node_tree.links.new(tex.outputs['Color'],bs.inputs['Emission Color'])
    bs.inputs['Emission Strength'].default_value=.18
    bs.inputs['Metallic'].default_value=.16;bs.inputs['Roughness'].default_value=.84
    steel.use_backface_culling=False

crown=bpy.data.objects['Hammered kettle helmet crown']
crown.data.materials.clear();crown.data.materials.append(steel)
for poly in crown.data.polygons:poly.material_index=0
box_uv(crown,rect=(399,484,239,309));changed.append(crown.name)

# Replace the 2cm black tire-like brim with an actual 4mm annular iron sheet.
brim=bpy.data.objects['Downturned iron helmet brim'];n=32
rows=[(.110,.080,Z(79)),(.196,.187,Z(102)),(.196,.187,Z(102)-.004),(.110,.080,Z(79)-.003)]
vertices=[]
for rx,ry,z in rows:
    for i in range(n):
        a=i*math.tau/n;vertices.append((rx*math.sin(a),-ry*math.cos(a),z))
faces=[(j*n+i,((j+1)%4)*n+i,((j+1)%4)*n+(i+1)%n,j*n+(i+1)%n)
       for j in range(4) for i in range(n)]
replace_mesh(brim,vertices,faces,[steel,iron],'Head')
box_uv(brim,rect=(399,484,239,309))
dark=[]
for poly in brim.data.polygons:
    if poly.index>=n:
        poly.material_index=1;dark.append(poly.index)
        for li in poly.loop_indices:
            point=brim.data.vertices[brim.data.loops[li].vertex_index].co
            brim.data.uv_layers.active.data[li].uv=(.02+.21*(point.x+.196)/.392,.10)
brim['dark_rim_faces']=dark;brim['rim_thickness_metres']=.004
brim['metal_uv_patch']=[399,484,239,309]

for name in ['Single angular pauldron','Pauldron lower articulated lame']:
    ob=bpy.data.objects[name]
    ob.data.materials.append(steel);index=len(ob.data.materials)-1
    affected={p.index for p in ob.data.polygons}
    for poly in ob.data.polygons:
        if poly.index in affected:poly.material_index=index
    box_uv(ob,rect=(399,484,239,309),only=lambda p:p.index in affected)
    ob['clean_metal_faces']=sorted(affected)
    changed.append(name)

# Rebuild the pouch as a soft, tapered volume fitted against belt/tunic. The
# flap is draped directly onto its front, instead of floating as a separate card.
body_trees=[bvh('Ragged layered charcoal tunic'),bvh('Leather waist belt')]
bag=bpy.data.objects['Supply pouch volume'];n=16
rows=[(1.117,.052,.038),(1.104,.064,.058),(1.075,.074,.066),
      (.969,.071,.064),(.944,.060,.048),(.938,.044,.032)]
cx=X(381);vertices=[];rear_indices=[]
for row,(z,rx,depth) in enumerate(rows):
    support=front_hit(body_trees,cx,z)
    if support is None:support=-.115
    a=front_hit(body_trees,cx-.008,z);b=front_hit(body_trees,cx+.008,z)
    slope=max(-.9,min(.9,(b-a)/.016)) if a is not None and b is not None else -.45
    for i in range(n):
        a=i*math.tau/n;x=cx+rx*math.sin(a)
        rear=support+slope*(x-cx)
        y=rear-.003-depth*(.5+.5*math.cos(a))
        vertices.append((x,y,z))
    rear_indices.append(row*n+n//2)
faces=[(j*n+i,(j+1)*n+i,(j+1)*n+(i+1)%n,j*n+(i+1)%n)
       for j in range(len(rows)-1) for i in range(n)]
faces += [tuple(range(n)),tuple(reversed([(len(rows)-1)*n+i for i in range(n)]))]
replace_mesh(bag,vertices,faces,[surface],'Hips');box_uv(bag,tile=2)
bag['rear_contact_indices']=rear_indices;bag['rear_clearance_metres']=.003
bag_tree=bvh(bag.name)
flap=bpy.data.objects['Folded pouch flap'];vertices=[]
flap_rows=[(1.116,.050),(1.102,.061),(1.071,.065),(1.047,.054)]
for j,(z,rx) in enumerate(flap_rows):
    for i in range(9):
        t=i/8;x=cx+(t*2-1)*rx
        zz=z-(.013*(1-abs(t*2-1)) if j==len(flap_rows)-1 else 0)
        y=front_hit([bag_tree],x,zz)
        if y is None:y=(front_hit(body_trees,x,zz) or -.115)-.04
        vertices.append((x,y-.002,zz))
faces=[(j*9+i,j*9+i+1,(j+1)*9+i+1,(j+1)*9+i)
       for j in range(len(flap_rows)-1) for i in range(8)]
replace_mesh(flap,vertices,faces,[surface],'Hips')
box_uv(flap,tile=2)
m=flap.modifiers.new('Leather flap thickness','SOLIDIFY');m.thickness=.002
flap['flap_clearance_metres']=.002
for ob in list(sc.objects):
    if ob.name.startswith('Pouch flap fastener'):bpy.data.objects.remove(ob,do_unlink=True)
flap_tree=bvh(flap.name);z=1.058;front=front_hit([flap_tree],cx,z)
front=front if front is not None else -.18
vertices=[];n=8
for yy,r in [(front-.0005,.0045),(front-.0035,.0034)]:
    for i in range(n):
        a=i*math.tau/n;vertices.append((cx+r*math.cos(a),yy,z+r*math.sin(a)))
faces=[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
faces += [tuple(reversed(range(n))),tuple(n+i for i in range(n))]
stud=new_object('Pouch flap fastener','04 • Belt and equipment',vertices,faces,
                bpy.data.materials.get('Mantle buckle • aged brass') or iron,'Hips')
for uv in stud.data.uv_layers.active.data:uv.uv=(.375,.625)

# Use a flat leather hanger, with both ends meeting actual supporting surfaces.
def remove_prefix(prefix):
    for ob in list(sc.objects):
        if ob.name.startswith(prefix):bpy.data.objects.remove(ob,do_unlink=True)
remove_prefix('Pouch belt loop')
path=[]
for x,z,trees in [(cx,1.145,[body_trees[1]]),(cx,1.124,body_trees),(cx,1.105,[bag_tree])]:
    y=front_hit(trees,x,z)
    path.append((x,(y if y is not None else -.13)-.003,z))
vertices=[]
for x,y,z in path:vertices.extend([(x-.008,y,z),(x+.008,y,z)])
loop=new_object('Pouch belt loop','04 • Belt and equipment',vertices,[(0,1,3,2),(2,3,5,4)],surface,'Hips')
box_uv(loop,tile=2)
m=loop.modifiers.new('Leather hanger thickness','SOLIDIFY');m.thickness=.003

# Fit a denser cape to the back contours. It has controlled spacing and folds,
# rather than the old uniform Y plane several centimetres off the character.
cape=bpy.data.objects['Torn short pilgrim cape']
if not cape.get('fitted_cape_tessellation'):
    bpy.context.view_layer.objects.active=cape
    mod=cape.modifiers.new('Cape contour tessellation','SUBSURF')
    mod.subdivision_type='SIMPLE';mod.levels=1
    while cape.modifiers.find(mod.name)>0:bpy.ops.object.modifier_move_up(modifier=mod.name)
    bpy.ops.object.modifier_apply(modifier=mod.name)
    cape['fitted_cape_tessellation']=True
profiles=[]
for name,count in [('Torso • fitted gambeson',16),('Ragged layered charcoal tunic',48),('Corroded shaped breastplate',16)]:
    vertices=bpy.data.objects[name].data.vertices;profile=[]
    for start in range(0,len(vertices),count):
        ring=[v.co for v in vertices[start:start+count]]
        xs=[v.x for v in ring]
        profile.append((sum(v.z for v in ring)/len(ring),(min(xs)+max(xs))/2,
                        (max(xs)-min(xs))/2,max(v.y for v in ring)))
    profiles.append(np.array(sorted(profile)))
def smooth_back(x,z):
    values=[]
    for profile in profiles:
        if not profile[0,0]<=z<=profile[-1,0]:continue
        cx,rx,ry=[float(np.interp(z,profile[:,0],profile[:,i])) for i in range(1,4)]
        values.append(ry*math.sqrt(max(0,1-((x-cx)/rx)**2)))
    return max(values) if values else .08
mantle_tree=bvh('Asymmetric rust-red shoulder mantle')
contacts=[]
for vertex in cape.data.vertices:
    x,z=vertex.co.x,vertex.co.z
    py=862-z/S;t=max(0,min(1,(py-184)/334))
    rear=smooth_back(x,z)
    gap=.009+.007*t+.005*(1+math.cos((x/.26)*math.pi*5))
    if abs(x)>.17:gap+=.008
    vertex.co.y=rear+gap
    if py<276:
        mantle=rear_hit([mantle_tree],x,z)
        if mantle is not None and mantle>rear+.008:
            vertex.co.y=max(rear+.004,min(vertex.co.y,mantle-.006))
    if abs(x)<.16 and py>=280:contacts.append(vertex.co.y-rear)
cape.data.update();cape['back_clearance_samples']=contacts
cape['back_spacing_range_metres']=[min(contacts),max(contacts)]
changed.append(cape.name)

# Two continuous flat bands follow the real forearm at each height, with their
# ends attached to the back of the shield. No rectangular rod cages or large air gaps.
remove_prefix('Shield rear leather arm strap')
def arm_section(z):
    ob=bpy.data.objects['Exposed wrist L'] if z>Z(379) else bpy.data.objects['Long leather glove cuff L']
    rows=[];vertices=ob.data.vertices
    for start in range(0,len(vertices),12):
        ring=[v.co for v in vertices[start:start+12]]
        xs=[v.x for v in ring];ys=[v.y for v in ring]
        rows.append((ring[0].z,(min(xs)+max(xs))/2,(min(ys)+max(ys))/2,
                     (max(xs)-min(xs))/2,(max(ys)-min(ys))/2))
    rows=np.array(sorted(rows))
    return [float(np.interp(z,rows[:,0],rows[:,i])) for i in range(1,5)]
shield=bpy.data.objects['Convex round wooden shield']
shield_back=max(v.co.y for v in shield.data.vertices)
for band,z in enumerate([Z(370),Z(420)]):
    vertices=[];count=15
    for dz in [-.012,.012]:
        zz=z+dz;ax,ay,rx,ry=arm_section(zz);rx+=.006;ry+=.006
        points=[(ax-rx*.80,shield_back-.001)]
        points += [(ax+rx*math.cos(math.pi-i*math.pi/12),ay+ry*math.sin(math.pi-i*math.pi/12))
                   for i in range(13)]
        points += [(ax+rx*.80,shield_back-.001)]
        vertices += [(x,y,zz) for x,y in points]
    faces=[(i,i+1,count+i+1,count+i) for i in range(count-1)]
    ob=new_object('Shield rear leather arm strap','05 • Sword and shield • toggle collection',vertices,faces,surface,'Forearm.L')
    box_uv(ob,tile=2)
    m=ob.modifiers.new('Leather band thickness','SOLIDIFY');m.thickness=.003
    ob['shield_anchor_y']=shield_back
    ob['fitted_arm_band']=True

# Refine the newly reported head, hanging gear and sword-hand transitions.
# Store absolute targets / a marker so repeated polishing cannot accumulate offsets.
hood=bpy.data.objects['Open cloth hood']
if not hood.get('seated_under_helmet'):
    top=max(v.co.z for v in hood.data.vertices)
    for v in hood.data.vertices:
        t=max(0,(v.co.z-(top-.065))/.065)
        v.co.z+=.030*t
    hood.data.update();hood['seated_under_helmet']=True
    changed.append(hood.name)
face=bpy.data.objects['Stern face beneath brim']
if not face.get('seated_under_helmet'):
    top=max(v.co.z for v in face.data.vertices)
    for v in face.data.vertices:
        t=max(0,(v.co.z-(top-.040))/.040)
        v.co.z+=.025*t
    face.data.update();face['seated_under_helmet']=True
    changed.append(face.name)

# Give the hood a cloth-only surface, including the formerly white side specks.
for name in ['Open cloth hood','Folded hood cowl']:
    ob=bpy.data.objects[name];ob.data.materials.clear();ob.data.materials.append(surface)
    for poly in ob.data.polygons:poly.material_index=0
    box_uv(ob,tile=1)

# A flask is a solid metal vessel, without a painted silhouette on its faces.
flask=bpy.data.objects['Brass pilgrim flask']
rows=[(.934,.026),(.943,.036),(.996,.039),(1.030,.032),(1.048,.015),(1.072,.014),(1.078,.015)]
verts=[]
for z,r in rows:
    cx=.145+(1.0-z)*.20
    for i in range(12):
        a=2*math.pi*i/12;verts.append((cx+r*math.cos(a),-.154+r*.85*math.sin(a),z))
faces=[tuple(reversed(range(12)))]
for j in range(len(rows)-1):
    for i in range(12):faces.append((j*12+i,j*12+(i+1)%12,(j+1)*12+(i+1)%12,(j+1)*12+i))
faces.append(tuple((len(rows)-1)*12+i for i in range(12)))
replace_mesh(flask,verts,faces,[paint],'Hips')
flask.data.materials.clear();flask.data.materials.append(paint)
for poly in flask.data.polygons:poly.material_index=0
box_uv(flask,rect=(507,519,409,424))
changed.append(flask.name)
# Give the flat token an honest thin edge; keep its painted cross on the front.
token=bpy.data.objects['Hanging religious token']
for mod in token.modifiers:
    if mod.type=='SOLIDIFY':mod.thickness=.003
# Tighten the cord's final attachment into the top of the token.
cords=sorted([o for o in sc.objects if o.name.startswith('Token leather cord')],key=lambda o:o.name)
if cords and not token.get('cord_seated'):
    cord=cords[-1];low=min(v.co.z for v in cord.data.vertices)
    for v in cord.data.vertices:
        if v.co.z<low+.012:v.co.z-=.008
    cord.data.update();token['cord_seated']=True
changed.append(token.name)

# Place the guard immediately below the curled fingers instead of leaving a
# long bare section of handle. Keep the pommel buried in the palm.
guard=bpy.data.objects['Sword iron crossguard']
if not guard.get('seated_below_curled_fingers'):
    fingers=[o for o in sc.objects if o.name.startswith('Curled glove finger R')]
    finger_bottom=min(v.co.z for o in fingers for v in o.data.vertices)
    target=finger_bottom-.006
    delta=target-max(v.co.z for v in guard.data.vertices)
    for name in ['Sword iron crossguard','Straight tapered iron sword']:
        ob=bpy.data.objects[name]
        for v in ob.data.vertices:v.co.z+=delta
        ob.data.update();changed.append(name)
    grip=bpy.data.objects['Sword dark leather grip']
    lo=min(v.co.z for v in grip.data.vertices);hi=max(v.co.z for v in grip.data.vertices)
    for v in grip.data.vertices:v.co.z+=delta*(hi-v.co.z)/(hi-lo)
    grip.data.update();guard['seated_below_curled_fingers']=True

# Model the belt hardware and devotional tag instead of projecting their image.
def detail_box(name,centre,size,mat,bone='Hips',collection='04 • Belt and equipment',tile=None):
    old=bpy.data.objects.get(name)
    if old:bpy.data.objects.remove(old,do_unlink=True)
    x,y,z=centre;a,b,c=[v/2 for v in size]
    vv=[(x+dx*a,y+dy*b,z+dz*c) for dx,dy,dz in
        [(-1,-1,-1),(1,-1,-1),(1,1,-1),(-1,1,-1),(-1,-1,1),(1,-1,1),(1,1,1),(-1,1,1)]]
    ob=new_object(name,collection,vv,[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)],mat,bone)
    if tile is not None:box_uv(ob,tile=tile)
    else:
        for uv in ob.data.uv_layers.active.data:uv.uv=(.10,.10) if mat==iron else (.375,.625)
    return ob
brass=bpy.data.materials['Mantle buckle • aged brass']
belt=bpy.data.objects['Leather waist belt'];belt.data.materials.clear();belt.data.materials.append(surface)
for poly in belt.data.polygons:poly.material_index=0
box_uv(belt,tile=2)
buckle=bpy.data.objects['Rectangular brass belt buckle']
# Four beveled metal rails leave a real opening over the belt tongue.
bx=X(449);bz=Z(348);by=front_hit([bvh(belt.name)],bx,bz)-.012
vv=[];ff=[]
for x0,z0,x1,z1 in [(-.050,-.029,.050,-.022),(-.050,.022,.050,.029),(-.050,-.022,-.043,.022),(.043,-.022,.050,.022)]:
    start=len(vv)
    vv += [(bx+x,by+y,bz+z) for x,y,z in [(x0,-.006,z0),(x1,-.006,z0),(x1,.002,z0),(x0,.002,z0),(x0,-.006,z1),(x1,-.006,z1),(x1,.002,z1),(x0,.002,z1)]]
    ff += [tuple(start+i for i in f) for f in [(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)]]
replace_mesh(buckle,vv,ff,[brass],'Hips')
for uv in buckle.data.uv_layers.active.data:uv.uv=(.375,.625)
bevel=buckle.modifiers.new('Rounded worn buckle edges','BEVEL');bevel.width=.0015;bevel.segments=2
buckle['physical_open_frame']=True
for name,centre,size,mat,tile in [
    ('Belt buckle leather tongue',(bx,by+.007,bz),(.080,.006,.038),surface,2),
    ('Belt buckle central pin',(bx-.012,by-.008,bz),(.064,.005,.005),brass,None),
    ('Belt leather keeper',(bx+.068,by+.014,bz),(.011,.012,.049),surface,2)]:
    detail_box(name,centre,size,mat,tile=tile)
# A carved wooden token with a modeled red cross, rounded corners and a hanging eye.
tag=bpy.data.objects['Hanging religious token']
wood=bpy.data.materials.get('Token • worn pale wood')
if wood is None:
    wood=bpy.data.materials.new('Token • worn pale wood');wood.diffuse_color=(.29,.22,.13,1);wood.use_nodes=True
    wood.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=(.29,.22,.13,1)
    wood.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value=.9
red=bpy.data.materials.get('Token • red inlay')
if red is None:
    red=bpy.data.materials.new('Token • red inlay');red.use_nodes=True
    red.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=(.16,.025,.014,1)
    red.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value=.85
cx=X(482);cz=Z(459);yy=-.186
outline=[(-.027,-.042),(.024,-.042),(.028,-.037),(.028,.032),(.019,.041),(-.019,.041),(-.028,.032),(-.028,-.037)]
vs=[(cx+x,yy+dy,cz+z) for dy in [-.002,.002] for x,z in outline]
fs=[tuple(reversed(range(8))),tuple(range(8,16))]+[(i,(i+1)%8,(i+1)%8+8,i+8) for i in range(8)]
replace_mesh(tag,vs,fs,[wood],'Hips');box_uv(tag,tile=3)
bevel=tag.modifiers.new('Worn tag edge','BEVEL');bevel.width=.001;bevel.segments=1
tag['modeled_cross']=True
for name,centre,size in [('Token red vertical inlay',(cx,yy-.003,cz-.002),(.008,.0015,.051)),('Token red crossbar',(cx,yy-.0035,cz+.007),(.032,.0015,.008))]:
    detail_box(name,centre,size,red)
# Bring palm bulk behind the fingers, instead of a large mitten enclosing them.
for side in ['R','L']:
    palm=bpy.data.objects['Closed leather glove '+side]
    if not palm.get('grasp_refined'):
        cx=sum(v.co.x for v in palm.data.vertices)/len(palm.data.vertices)
        for v in palm.data.vertices:
            v.co.x=cx+(v.co.x-cx)*.78
            v.co.y=v.co.y*.75+.009
        palm.data.update();palm['grasp_refined']=True
# Lower the shield face to cover the fist and give that fist an actual handgrip.
for ob in list(sc.objects):
    if ob.type=='MESH' and (ob.name.startswith('Shield ') or ob.name=='Convex round wooden shield') and not ob.name.startswith('Shield rear leather'):
        if not ob.get('shield_hand_position'):
            for v in ob.data.vertices:v.co.z-=.065
            ob.data.update();ob['shield_hand_position']=True
# Seat the sword along the centre of the palm, behind the curled fingers.
for name in ['Sword dark leather grip','Sword pommel','Sword iron crossguard','Straight tapered iron sword']:
    ob=bpy.data.objects[name]
    if not ob.get('palm_depth_aligned'):
        for v in ob.data.vertices:v.co.y+=.015
        ob.data.update();ob['palm_depth_aligned']=True
# The cord passes through a small physical eye on the token.
old=bpy.data.objects.get('Token hanging eye')
if old:bpy.data.objects.remove(old,do_unlink=True)
vs=[];fs=[]
for i in range(12):
    a=i*math.tau/12
    for j in range(6):
        b=j*math.tau/6;r=.005+.0015*math.cos(b)
        vs.append((X(482)-.006+r*math.cos(a),-.186+.0015*math.sin(b),Z(459)+.041+r*math.sin(a)))
for i in range(12):
    for j in range(6):fs.append((i*6+j,((i+1)%12)*6+j,((i+1)%12)*6+(j+1)%6,i*6+(j+1)%6))
eye=new_object('Token hanging eye','04 • Belt and equipment',vs,fs,brass,'Hips')
for uv in eye.data.uv_layers.active.data:uv.uv=(.375,.625)
handx=X(611)
for name,centre,size,mat,tile in [
    ('Shield held leather grip',(handx,-.007,.873),(.024,.025,.091),surface,2),
    ('Shield grip upper bracket',(handx,-.043,.922),(.025,.076,.012),iron,None),
    ('Shield grip lower bracket',(handx,-.043,.824),(.025,.076,.012),iron,None)]:
    detail_box(name,centre,size,mat,'Hand.L' if 'held' in name else 'Forearm.L','05 • Sword and shield • toggle collection',tile)

text=bpy.data.texts.get('CURRENT FILE • polish notes') or bpy.data.texts.new('CURRENT FILE • polish notes')
text.clear();text.write('Pouch body/back/flap, cape contour, helmet brim/metal UVs and shield bands\n'
                        'are refined in this SAME file. No new model version is created.\n'
                        'Update in place: blender -b --python scripts/polishPilgrim.py\n')
sc['current_file_polish']='fitted pouch, contoured cape, thin clean brim, fitted shield bands'

# Save the current path with the normal review camera and all equipment visible.
cam=sc.camera;weapons=bpy.data.collections['05 • Sword and shield • toggle collection']
def aim(pos,target,scale):
    cam.location=pos;cam.rotation_euler=(Vector(target)-cam.location).to_track_quat('-Z','Y').to_euler()
    cam.data.ortho_scale=scale
aim((2.3,-6,1.95),(0,0,.94),2.12);weapons.hide_render=False
bpy.ops.wm.save_as_mainfile(filepath=str(FILE))

views=[
    ('belt-tag-closeup',(0,-6,1.35),(.03,-.14,1.04),.43,False),
    ('hands-sword-closeup',(-1,-6,1.20),(-.37,-.01,.87),.33,True),
    ('shield-held-closeup',(4,4,2.4),(.37,-.02,.94),.52,True),
    ('head-gap-closeup',(0,-6,1.85),(0,0,1.65),.52,False),
    ('hanging-gear-closeup',(1,-6,1.45),(.10,-.12,1.02),.48,False),
    ('sword-grip-closeup',(-1,-6,1.20),(-.37,-.01,.86),.33,True),
    ('pouch-closeup',(-5,-2,1.6),(-.14,-.12,1.02),.47,False),
    ('cape-closeup',(-6,1.6,1.7),(0,.1,1.09),1.12,False),
    ('helmet-top',(1,-4,4.4),(0,0,1.72),.55,False),
    ('shoulder-shield',(-.6,-2.7,4.2),(.28,-.04,1.20),.91,True),
    ('shield-back-closeup',(5,2,3.6),(.34,-.02,1.07),.72,True),
    ('pouch-side',(-6,-.1,1.3),(-.14,-.1,1.025),.43,False),
    ('three-quarter',(2.3,-6,1.95),(0,0,.94),2.12,True),
    ('front',(0,-6,.94),(0,0,.94),2.12,False),
    ('back',(0,6,.94),(0,0,.94),2.12,False),
    ('left-side',(6,-.15,1.4),(0,0,.94),2.12,False),
    ('right-side',(-6,-.15,1.4),(0,0,.94),2.12,False),
    ('arm-closeup',(2.3,-6,1.95),(-.255,-.035,1.03),.85,True),
    ('head-closeup',(2.3,-6,1.95),(0,0,1.60),.62,False),
]
if '--quick' in sys.argv:views=views[:3]
if '--equipment' in sys.argv:
    views=[v for v in views if v[0] in {'belt-tag-closeup','hands-sword-closeup','shield-held-closeup','three-quarter','front','back','left-side','right-side','arm-closeup','hanging-gear-closeup','shoulder-shield','shield-back-closeup','sword-grip-closeup'}]
for name,pos,target,scale,armed in views:
    aim(pos,target,scale);weapons.hide_render=not armed
    sc.render.filepath=str(DOC/(name+'.png'));bpy.ops.render.render(write_still=True)
weapons.hide_render=False

# Export copies, keeping the editable source and current file untouched.
export_scene=bpy.data.scenes.new('Temporary export');bpy.context.window.scene=export_scene
export_rig=rig.copy();export_rig.data=rig.data.copy();export_scene.collection.objects.link(export_rig)
for name in ['01 • Body and clothing','02 • Fitted armor and helmet','03 • Hood, mantle and cape',
             '04 • Belt and equipment','05 • Sword and shield • toggle collection']:
    copies=[]
    for ob in bpy.data.collections[name].objects:
        if ob.type!='MESH':continue
        cp=ob.copy();cp.data=ob.data.copy();cp.parent=export_rig;export_scene.collection.objects.link(cp)
        for mod in cp.modifiers:
            if mod.type=='ARMATURE':mod.object=export_rig
        bpy.ops.object.select_all(action='DESELECT');cp.select_set(True);bpy.context.view_layer.objects.active=cp
        for mod in list(cp.modifiers):
            if mod.type!='ARMATURE':bpy.ops.object.modifier_apply(modifier=mod.name)
        copies.append(cp)
    bpy.ops.object.select_all(action='DESELECT')
    for ob in copies:ob.select_set(True)
    bpy.context.view_layer.objects.active=copies[0];bpy.ops.object.join();copies[0].name=name
bpy.ops.object.select_all(action='SELECT');bpy.context.view_layer.objects.active=export_rig
bpy.ops.export_scene.gltf(filepath=str(OUT/'cathedral-pilgrim-v4.glb'),export_format='GLB',
    use_selection=True,use_active_scene=True,export_skins=True,export_animations=False,export_yup=True)
bpy.context.window.scene=sc
for ob in list(export_scene.objects):bpy.data.objects.remove(ob,do_unlink=True)
bpy.data.scenes.remove(export_scene)
manifest=json.loads((OUT/'manifest.json').read_text())
manifest['parts']=sum(o.type=='MESH' and any(m.type=='ARMATURE' for m in o.modifiers) for o in sc.objects)
manifest['in_place_polish']={'changed':changed,'same_source_file':str(FILE.relative_to(ROOT)),
                            'cape_back_spacing_metres':[min(contacts),max(contacts)],
                            'helmet_rim_thickness_metres':.004,'continuous_shield_bands':2}
(OUT/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
print('CURRENT_PILGRIM_POLISHED',json.dumps(manifest['in_place_polish']))
