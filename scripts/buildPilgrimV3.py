"""Reference-fitted, projection-textured Cathedral Pilgrim.

Run with Blender: blender -b --python-exit-code 1 --python scripts/buildPilgrimV3.py
The turnaround is a generated painting reference, never a substitute render.
Every visible body part is modeled as three-dimensional editable geometry.
"""
import bpy
import math
import json
import numpy as np
import bmesh
from pathlib import Path
from mathutils import Vector

ROOT=Path(__file__).resolve().parents[1]
REVISION=globals().get('ASSET_REVISION',3)
OUT=ROOT/f'public/assets/characters/ashen-parish/pilgrim-v{REVISION}'
DOC=ROOT/f'docs/characters/ashen-parish/pilgrim-v{REVISION}'
OUT.mkdir(parents=True,exist_ok=True);DOC.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.context.preferences.filepaths.save_version=0
sc=bpy.context.scene;sc.name='Cathedral Pilgrim • reference fitted'
sc.unit_settings.system='METRIC'
HEIGHT=1.85;TOP=20;BOTTOM=862;CENTRE=443
SCALE=HEIGHT/(BOTTOM-TOP)
def X(px):return (px-CENTRE)*SCALE
def Z(py):return (BOTTOM-py)*SCALE
def P(px,py,depth=0):return (X(px),depth,Z(py))

ref=bpy.data.images.load(str(OUT/'pilgrim-turnaround.png'));ref.pack()
IW,IH=ref.size[:]
side_ref=bpy.data.images.load(str(OUT/'pilgrim-side-reference.png'));side_ref.pack()
SW,SH=side_ref.size[:]
SIDE_TOP=20;SIDE_BOTTOM=862;SIDE_SCALE=HEIGHT/(SIDE_BOTTOM-SIDE_TOP)
side_pixels=np.array(side_ref.pixels[:],dtype=np.float32).reshape(SH,SW,4)[::-1,:,:3]
side_background=np.median(side_pixels[:,20:160,:],axis=1)
side_fg=np.linalg.norm(side_pixels-side_background[:,None,:],axis=2)>.12
side_interior=side_fg & np.roll(side_fg,2,axis=1) & np.roll(side_fg,-2,axis=1)
# Projection padding samples the painted subject, never the neutral backdrop.
# This edits UV coordinates only; the generated painting stays unmodified.
pixels=np.array(ref.pixels[:],dtype=np.float32).reshape(IH,IW,4)[::-1,:,:3]
background=np.median(pixels[:,20:160,:],axis=1)
foreground=np.linalg.norm(pixels-background[:,None,:],axis=2)>.12
interior=foreground & np.roll(foreground,2,axis=1) & np.roll(foreground,-2,axis=1)
projection_corrections=[]
def padded_reference(px,py,rear):
    row=max(TOP,min(BOTTOM-1,int(round(py))))
    lo,hi=(1000,1650) if rear else (200,690)
    candidates=np.flatnonzero(interior[row,lo:hi])+lo
    if len(candidates):
        ix=max(0,min(IW-1,int(round(px))))
        if not interior[row,ix]:
            corrected=int(candidates[np.argmin(abs(candidates-px))])
            projection_corrections.append(abs(corrected-px));px=corrected
    return px,py
def side_projection(v,positive):
    centre=SW*.25 if positive else SW*.75
    px=centre+(1 if positive else -1)*v.y/SIDE_SCALE
    py=SIDE_BOTTOM-v.z/SIDE_SCALE
    row=max(SIDE_TOP,min(SIDE_BOTTOM-1,int(round(py))))
    lo,hi=(200,690) if positive else (1000,1650)
    candidates=np.flatnonzero(side_interior[row,lo:hi])+lo
    if len(candidates):
        ix=max(0,min(SW-1,int(round(px))))
        if not side_interior[row,ix]:px=int(candidates[np.argmin(abs(candidates-px))])
    return px/SW,1-py/SH
atlas=bpy.data.images.load(str(ROOT/'public/assets/characters/ashen-parish/ashen-atlas.png'));atlas.pack()
def material(name,metal=False,legacy=False,side=False):
    m=bpy.data.materials.new(name);m.use_nodes=True
    bs=m.node_tree.nodes.get('Principled BSDF')
    tex=m.node_tree.nodes.new('ShaderNodeTexImage');tex.image=atlas if legacy else side_ref if side else ref
    tex.interpolation='Closest'
    m.node_tree.links.new(tex.outputs['Color'],bs.inputs['Base Color'])
    m.node_tree.links.new(tex.outputs['Color'],bs.inputs['Emission Color'])
    bs.inputs['Emission Strength'].default_value=.18
    bs.inputs['Roughness'].default_value=.84 if metal else .96
    bs.inputs['Metallic'].default_value=.16 if metal else 0
    m.use_backface_culling=False
    return m
PAINT=material('Pilgrim • reference-painted cloth')
METAL=material('Pilgrim • reference-painted steel',True)
WOOD=material('Equipment • worn wood',legacy=True)
IRON=material('Equipment • worn steel',True,True)
LEATHER=material('Equipment • leather',legacy=True)
SIDE_PAINT=material('Pilgrim • painted side cloth',side=True)
SIDE_METAL=material('Pilgrim • painted side steel',True,side=True)

def coll(name):
    c=bpy.data.collections.new(name);sc.collection.children.link(c);return c
BODY=coll('01 • Body and clothing')
ARMOR=coll('02 • Fitted armor and helmet')
CLOTH=coll('03 • Hood, mantle and cape')
GEAR=coll('04 • Belt and equipment')
WEAPONS=coll('05 • Sword and shield • toggle collection')
STUDIO=coll('Studio • excluded from game export')
CURRENT=BODY

arm=bpy.data.armatures.new('Pilgrim humanoid')
rig=bpy.data.objects.new('PilgrimRig',arm);BODY.objects.link(rig)
bpy.context.view_layer.objects.active=rig;rig.select_set(True)
bpy.ops.object.mode_set(mode='EDIT')
def bone(name,head,tail,parent=None):
    b=arm.edit_bones.new(name);b.head=head;b.tail=tail
    if parent:b.parent=arm.edit_bones[parent]
bone('Root',(0,0,0),(0,0,.2))
bone('Hips',P(443,424),P(443,350),'Root')
bone('Spine',P(443,350),P(443,275),'Hips')
bone('Chest',P(443,275),P(443,194),'Spine')
bone('Neck',P(443,194),P(443,157),'Chest')
bone('Head',P(443,157),P(443,50),'Neck')
for side,shoulder,elbow,wrist,hand,hip,knee,ankle in [
    ('R',(354,231),(310,325),(280,432),(274,474),381,380,373),
    ('L',(533,229),(573,325),(604,432),(611,474),504,508,515)]:
    bone('Clavicle.'+side,P(443,194),P(*shoulder),'Chest')
    bone('UpperArm.'+side,P(*shoulder),P(*elbow),'Clavicle.'+side)
    bone('Forearm.'+side,P(*elbow),P(*wrist),'UpperArm.'+side)
    bone('Hand.'+side,P(*wrist),P(*hand),'Forearm.'+side)
    bone('Thigh.'+side,P(hip,474),P(knee,632),'Hips')
    bone('Shin.'+side,P(knee,632),P(ankle,786),'Thigh.'+side)
    bone('Foot.'+side,P(ankle,786),P(ankle,847,-.15),'Shin.'+side)
bone('Cape.01',P(443,178,.13),P(443,333,.19),'Chest')
bone('Cape.02',P(443,333,.19),P(443,521,.19),'Cape.01')
bpy.ops.object.mode_set(mode='OBJECT');rig.show_in_front=True
rig['forward']='-Y';rig['units']='metres'

def mesh(name,verts,faces,mat=PAINT,bone_name=None,projection='auto',smooth=False,legacy_tile=None):
    data=bpy.data.meshes.new(name);data.from_pydata(verts,[],faces);data.update()
    bm=bmesh.new();bm.from_mesh(data)
    if bm.edges and all(e.is_manifold for e in bm.edges):
        bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
        bm.to_mesh(data);data.update()
    bm.free()
    ob=bpy.data.objects.new(name,data);CURRENT.objects.link(ob);data.materials.append(mat)
    if projection=='auto' and legacy_tile is None:
        data.materials.append(SIDE_METAL if mat==METAL else SIDE_PAINT)
    uv=data.uv_layers.new(name='PaintedReferenceUV')
    for poly in data.polygons:
        poly.use_smooth=smooth
        rear=projection=='rear' or (projection=='auto' and poly.normal.y>0.05)
        lateral=projection=='auto' and legacy_tile is None and abs(poly.normal.x)>abs(poly.normal.y)*1.12
        if lateral:poly.material_index=1
        for li in poly.loop_indices:
            v=data.vertices[data.loops[li].vertex_index].co
            px=CENTRE+v.x/SCALE;py=BOTTOM-v.z/SCALE
            if lateral:
                uv.data[li].uv=side_projection(v,poly.normal.x>0)
            elif legacy_tile is not None:
                # Equipment uses the existing packed wear atlas only.
                u=(legacy_tile%4+.04+.92*((v.x*2+v.z*.1)%1))/4
                w=(legacy_tile//4+.04+.92*((v.z*2+v.y)%1))/4
                uv.data[li].uv=(u,w)
            else:
                if rear:px=IW-px
                px,py=padded_reference(px,py,rear)
                uv.data[li].uv=(px/IW,1-py/IH)
    if bone_name:
        g=ob.vertex_groups.new(name=bone_name);g.add(list(range(len(data.vertices))),1,'REPLACE')
        ob.parent=rig;m=ob.modifiers.new('Humanoid skin','ARMATURE');m.object=rig
    ob['construction']='Editable volume; front/back UV projection from painting reference'
    return ob

def blend_height(ob,b1,b2,top,bottom):
    g1=ob.vertex_groups.get(b1) or ob.vertex_groups.new(name=b1)
    g2=ob.vertex_groups.get(b2) or ob.vertex_groups.new(name=b2)
    for v in ob.data.vertices:
        py=BOTTOM-v.co.z/SCALE
        t=max(0,min(1,(py-top)/(bottom-top)))
        g1.add([v.index],1-t,'REPLACE');g2.add([v.index],t,'REPLACE')

def loft(name,rows,bone_name,mat=PAINT,n=16,projection='auto',smooth=False,cap=True):
    # Cross sections are traced in reference pixel coordinates, not assembled
    # from scaled primitive cylinders. Front and back depths are independent.
    vs=[]
    for row in rows:
        py,left,right,front,back,*shift=row
        cy=shift[0] if shift else 0
        cx=(left+right)/2;rx=(right-left)/2
        for i in range(n):
            a=i*math.tau/n;c=math.cos(a)
            depth=cy+(-front*c if c>=0 else -back*c)
            vs.append(P(cx+rx*math.sin(a),py,depth))
    fs=[]
    for j in range(len(rows)-1):
        for i in range(n):
            fs.append((j*n+i,(j+1)*n+i,(j+1)*n+(i+1)%n,j*n+(i+1)%n))
    if cap:fs+=[tuple(range(n)),tuple(reversed([(len(rows)-1)*n+i for i in range(n)]))]
    if rows[0][0]>rows[-1][0]:fs=[tuple(reversed(f)) for f in fs]
    return mesh(name,vs,fs,mat,bone_name,projection,smooth)

def front_panel(name,outline,depth,bone_name,mat=PAINT,thickness=.004):
    # Triangular fans preserve deliberate shape facets and avoid warped ngons.
    cx=sum(x for x,y in outline)/len(outline);cy=sum(y for x,y in outline)/len(outline)
    vs=[P(x,y,depth) for x,y in outline]+[P(cx,cy,depth-.008)]
    fs=[(i,(i+1)%len(outline),len(outline)) for i in range(len(outline))]
    ob=mesh(name,vs,fs,mat,bone_name,'front')
    if ob.data.polygons[0].normal.y>0:
        for p in ob.data.polygons:p.flip()
    m=ob.modifiers.new('Real material thickness','SOLIDIFY');m.thickness=thickness
    return ob

# Body and legs, including the exposed wrists and dirty calf wraps that were
# missing from the previous model. Geometry follows the painted silhouette.
loft('Torso • fitted gambeson',[(188,373,514,.10,.105),(225,376,511,.127,.12),
    (272,376,509,.135,.12),(321,376,510,.12,.115),(352,368,520,.119,.119)],'Chest')
for side,rows in [
    ('R',[(518,350,431,.079,.086),(565,344,432,.086,.089),(591,353,430,.084,.083),
          (615,343,427,.078,.083),(632,334,427,.08,.08),(648,340,422,.078,.078),(666,343,414,.064,.064)]),
    ('L',[(518,455,535,.079,.086),(565,458,543,.086,.089),(591,459,544,.084,.083),
          (615,468,545,.078,.083),(632,467,554,.08,.08),(648,471,545,.078,.078),(666,474,541,.064,.064)])]:
    ob=loft('Baggy trousers '+side,rows,'Thigh.'+side,n=16)
    blend_height(ob,'Thigh.'+side,'Shin.'+side,612,658)
for side,rows in [
    ('R',[(658,343,415,.060,.059),(681,343,412,.061,.062),(707,347,406,.059,.061),
          (737,349,401,.052,.053),(767,346,400,.052,.054)]),
    ('L',[(658,474,542,.060,.059),(681,477,542,.061,.062),(707,481,540,.059,.061),
          (737,487,537,.052,.053),(767,488,543,.052,.054)])]:
    loft('Dirty spiral calf wraps '+side,rows,'Shin.'+side,n=16)
for side,rows in [
    ('R',[(762,342,400,.057,.057),(789,342,397,.058,.061),(810,338,399,.068,.066),
          (834,324,399,.171,.085),(852,320,399,.195,.092),(862,320,399,.195,.094)]),
    ('L',[(762,488,544,.057,.057),(789,490,544,.058,.061),(810,490,552,.068,.066),
          (834,489,565,.171,.085),(852,489,566,.195,.092),(862,489,566,.195,.094)])]:
    loft('Scuffed leather boot '+side,rows,'Foot.'+side,n=16)

for side,rows,skin,cuff,fist in [
    ('R',[(227,320,390,.072,.075),(265,305,368,.072,.072),(294,293,350,.064,.064),
          (313,283,344,.062,.064),(332,280,339,.063,.062)],
     [(334,282,330,.047,.045),(354,278,321,.045,.044),(381,274,314,.043,.043)],
     [(377,268,315,.047,.045),(399,266,309,.047,.045),(428,257,304,.045,.044)],
     [(426,258,302,.040,.037),(451,250,302,.045,.043),(471,247,303,.048,.043),
      (485,256,295,.038,.035),(491,266,286,.022,.024)]),
    ('L',[(247,532,579,.072,.075),(270,537,583,.072,.072),(296,539,591,.064,.064),
          (317,545,602,.062,.064),(338,555,604,.063,.062)],
     [(338,563,605,.047,.045),(355,569,610,.045,.044),(381,577,615,.043,.043)],
     [(377,577,624,.047,.045),(399,582,626,.047,.045),(428,590,632,.045,.044)],
     [(426,590,632,.040,.037),(451,584,636,.045,.043),(471,585,638,.048,.043),
      (485,594,630,.038,.035),(491,601,620,.022,.024)])]:
    ob=loft('Folded tunic sleeve '+side,rows,'UpperArm.'+side,n=16)
    blend_height(ob,'UpperArm.'+side,'Forearm.'+side,303,337)
    loft('Exposed wrist '+side,skin,'Forearm.'+side,n=12,smooth=True)
    loft('Long leather glove cuff '+side,cuff,'Forearm.'+side,n=12)
    loft('Closed leather glove '+side,fist,'Hand.'+side,n=12)

# Flared layered tunic: continuous cut cloth, irregular cut edges and front split.
rows=[(347,372,515,.125,.12),(395,350,538,.143,.137),(448,339,550,.15,.145),
      (501,330,556,.157,.15),(548,327,558,.16,.15)]
ob=loft('Ragged layered charcoal tunic',rows,'Hips',n=48,cap=False)
blend_height(ob,'Hips','Thigh.R',390,1000)
# Both legs influence the lower skirt without pulling all cloth onto one side.
left=ob.vertex_groups.new(name='Thigh.L')
for v in ob.data.vertices:
    if v.co.x>0:
        for g in list(v.groups):
            if ob.vertex_groups[g.group].name=='Thigh.R':
                left.add([v.index],g.weight,'REPLACE');ob.vertex_groups['Thigh.R'].remove([v.index])
    if v.index>=48*(len(rows)-1):
        i=v.index%48
        v.co.z-=SCALE*(9+6*math.sin(i*1.7)+4*math.cos(i*2.8))
m=ob.modifiers.new('Tunic cloth edge','SOLIDIFY');m.thickness=.003

CURRENT=ARMOR
loft('Corroded shaped breastplate',[(214,386,500,.128,.12),(238,378,505,.141,.127),
    (277,378,508,.149,.133),(309,377,510,.133,.128),(330,374,513,.12,.12)],
    'Chest',METAL,n=16)
loft('Rolled lower plate rim',[(321,374,512,.125,.12),(333,373,514,.128,.12)],'Chest',METAL,n=16)

def shoulder_shell(name,outline,centre,depth,bone_name):
    cx,cy=centre;count=len(outline)
    span=max(abs(y-cy) for x,y in outline)
    vs=[P(x,y,-depth*(.68+.32*(1-abs(y-cy)/span))) for x,y in outline]+[P(cx,cy,-depth-.018)]
    vs += [P(cx+(x-cx)*.90,cy+(y-cy)*.90,.07*(.7+.3*(1-abs(y-cy)/span))) for x,y in outline]
    fs=[(i,(i+1)%count,count) for i in range(count)]
    fs += [(i,count+1+i,count+1+(i+1)%count,(i+1)%count) for i in range(count)]
    fs += [tuple(reversed([count+1+i for i in range(count)]))]
    ob=mesh(name,vs,fs,METAL,bone_name)
    m=ob.modifiers.new('Forged plate corner bevel','BEVEL');m.width=.003;m.segments=1
    return ob
shoulder_shell('Single angular pauldron',[(500,163),(531,165),(554,184),(574,214),
    (568,229),(530,246),(493,206)],(533,205),.132,'UpperArm.L')
shoulder_shell('Pauldron lower articulated lame',[(533,235),(570,227),(589,259),
    (543,269)],(558,249),.112,'UpperArm.L')

# Helmet has a broad flared brim and a squat, angular crown, matching the art.
loft('Hammered kettle helmet crown',[(20,438,449,.014,.016),(36,419,467,.043,.044),
    (58,403,483,.065,.067),(79,389,500,.088,.089),(91,386,501,.092,.092)],'Head',METAL,n=12)
loft('Downturned iron helmet brim',[(79,388,499,.089,.089),(100,354,532,.185,.180),
    (109,355,532,.183,.178)],'Head',METAL,n=16)

CURRENT=BODY
loft('Stern face beneath brim',[(109,409,477,.107,.066),(123,408,478,.109,.075),
    (140,417,472,.105,.071),(155,429,462,.075,.055)],'Head',n=16)
mesh('Modeled nose',[P(437,121,-.080),P(451,121,-.080),P(445,132,-.121),
    P(436,135,-.078),P(452,135,-.078)],[(0,1,2),(0,2,3),(1,4,2),(3,2,4)],PAINT,'Head','front')

CURRENT=CLOTH
# A real opening in the hood frames the face; its rear is a volume, not a card.
rows=[(108,397,490,.080,.095),(137,392,495,.093,.100),
      (162,394,499,.100,.100),(181,405,483,.094,.093)]
hood=loft('Open cloth hood',rows,'Head',n=24,cap=False)
remove=[]
for poly in hood.data.polygons:
    centre=poly.center
    if centre.y<-.045 and abs(centre.x)<.07:remove.append(poly.index)
bm=bmesh.new();bm.from_mesh(hood.data);bm.faces.ensure_lookup_table()
bmesh.ops.delete(bm,geom=[bm.faces[i] for i in remove],context='FACES')
bm.to_mesh(hood.data);bm.free();hood.data.update()
m=hood.modifiers.new('Hood cloth thickness','SOLIDIFY');m.thickness=.004
loft('Folded hood cowl',[(155,410,482,.095,.098),(176,393,496,.105,.106),
    (191,403,484,.113,.105)],'Neck',n=24,cap=False)

# Mantle is asymmetric: long over the unarmored shoulder, short beneath plate.
n=48;vs=[]
for j in range(5):
    t=j/4
    for i in range(n):
        a=i*math.tau/n;s=math.sin(a);c=math.cos(a)
        rx=58+(91 if s<0 else 58)*t
        py=157+t*(64+54*abs(s)+37*max(0,-c))
        if j==4:py+=3*math.sin(i*2.1)+2*math.cos(i*1.1)
        depth=(-.11-.024*t) if c>=0 else (.105+.075*t)
        vs.append(P(443+rx*s,py,depth*abs(c)))
fs=[(j*n+i,(j+1)*n+i,(j+1)*n+(i+1)%n,j*n+(i+1)%n)
    for j in range(4) for i in range(n)]
mantle=mesh('Asymmetric rust-red shoulder mantle',vs,fs,PAINT,'Chest')
m=mantle.modifiers.new('Mantle cloth thickness','SOLIDIFY');m.thickness=.004

# Cape uses the actual rear painting on BOTH sides. It remains folded geometry
# with thickness and cloth bones, never a billboard or image plane.
vs=[];cols=33;rows=11
for j in range(rows):
    t=j/(rows-1);width=65+53*math.sin(t*math.pi*.64)
    for i in range(cols):
        u=i/(cols-1);px=443+(u*2-1)*width
        py=184+t*334
        if j==rows-1:py+=8*math.sin(i*1.4)+5*math.cos(i*2.1)
        depth=.13+.065*min(1,t*3)+.014*math.cos(u*math.pi*10)
        vs.append(P(px,py,depth))
fs=[(j*cols+i,j*cols+i+1,(j+1)*cols+i+1,(j+1)*cols+i)
    for j in range(rows-1) for i in range(cols-1)
    if not (j==rows-2 and i in (4,13,24))]
cape=mesh('Torn short pilgrim cape',vs,fs,PAINT,'Cape.01',projection='rear')
blend_height(cape,'Cape.01','Cape.02',315,460)
m=cape.modifiers.new('Cape cloth thickness','SOLIDIFY');m.thickness=.004

CURRENT=GEAR
loft('Leather waist belt',[(334,373,518,.137,.125),(359,368,524,.139,.127)],'Hips',n=24)
front_panel('Rectangular brass belt buckle',[(426,336),(472,337),(472,360),(426,359)],-.154,'Hips',METAL)
loft('Supply pouch volume',[(356,360,414,.027,.029,-.155),(374,345,416,.043,.034,-.155),
    (419,339,410,.047,.034,-.155),(437,342,402,.033,.026,-.155)],'Hips',n=12)
front_panel('Folded pouch flap',[(356,354),(414,361),(410,389),(375,397),(348,385)],-.205,'Hips')
loft('Brass pilgrim flask',[(368,492,511,.013,.014,-.154),(382,489,516,.020,.020,-.154),
    (396,489,525,.034,.032,-.154),(426,496,537,.038,.034,-.154),
    (439,502,531,.029,.026,-.154)],'Hips',METAL,n=12)
front_panel('Hanging religious token',[(473,435),(493,432),(499,473),(477,480),(466,439)],-.181,'Hips')

# Functional, three-dimensional equipment. It can be hidden to inspect the
# complete reference-fitted body without the shield obscuring the left arm.
CURRENT=WEAPONS
def rod(name,a,b,r1,r2,mat,tile,bone_name,n=10):
    a,b=Vector(a),Vector(b);d=(b-a).normalized();u=d.cross(Vector((0,1,0))).normalized()
    if u.length<.1:u=d.cross(Vector((1,0,0))).normalized()
    v=d.cross(u).normalized()
    vs=[tuple(p+r*(u*math.cos(i*math.tau/n)+v*math.sin(i*math.tau/n)))
        for p,r in [(a,r1),(b,r2)] for i in range(n)]
    fs=[tuple(reversed(range(n))),tuple(n+i for i in range(n))]
    fs += [(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
    return mesh(name,vs,fs,mat,bone_name,legacy_tile=tile)
sx,sy,sz=X(275),-.035,Z(460)
rod('Sword dark leather grip',(sx,sy,sz-.055),(sx,sy,sz+.06),.018,.018,LEATHER,2,'Hand.R')
rod('Sword pommel',(sx,sy,sz+.06),(sx,sy,sz+.10),.027,.021,IRON,1,'Hand.R')
rod('Sword iron crossguard',(sx-.09,sy,sz-.075),(sx+.09,sy,sz-.075),.014,.014,IRON,1,'Hand.R')
vs=[]
for z,w in [(sz-.09,.033),(sz-.56,.026),(sz-.68,.018)]:
    vs += [(sx-w,sy,z),(sx,sy-.009,z),(sx+w,sy,z),(sx,sy+.009,z)]
vs.append((sx,sy,sz-.76));fs=[]
for j in range(2):
    for i in range(4):fs.append((j*4+i,j*4+(i+1)%4,(j+1)*4+(i+1)%4,(j+1)*4+i))
for i in range(4):fs.append((8+i,8+(i+1)%4,12))
blade=mesh('Straight tapered iron sword',vs,fs,METAL,'Hand.R',projection='front')
for li,loop in enumerate(blade.data.loops):
    v=blade.data.vertices[loop.vertex_index].co
    u=max(0,min(1,(v.x-sx+.033)/.066))
    t=max(0,min(1,(sz-.09-v.z)/.67))
    blade.data.uv_layers.active.data[li].uv=((402+65*u)/IW,1-(238+76*t)/IH)
cx,cy,cz=X(607),-.105,Z(395);n=24
vs=[(cx,cy-.026,cz)]
for r,dy in [(.153,-.016),(.17,0),(.17,.028)]:
    for i in range(n):
        a=i*math.tau/n;vs.append((cx+r*math.sin(a),cy+dy,cz+r*math.cos(a)))
fs=[(0,1+(i+1)%n,1+i) for i in range(n)]
for j in range(2):
    fs += [(1+j*n+i,1+(j+1)*n+i,1+(j+1)*n+(i+1)%n,1+j*n+(i+1)%n) for i in range(n)]
fs += [tuple(1+2*n+i for i in range(n))]
mesh('Convex round wooden shield',vs,fs,WOOD,'Forearm.L',legacy_tile=8)
for i in range(n):
    a=i*math.tau/n;b=(i+1)*math.tau/n
    rod('Shield iron binding',(cx+.169*math.sin(a),cy,cz+.169*math.cos(a)),
        (cx+.169*math.sin(b),cy,cz+.169*math.cos(b)),.010,.010,IRON,0,'Forearm.L',n=6)
rod('Shield central iron boss',(cx,cy-.022,cz),(cx,cy-.055,cz),.041,.027,IRON,0,'Forearm.L')
for i in [-2,-1,0,1,2]:
    dx=i*.053;h=math.sqrt(.15**2-dx**2)
    rod('Shield plank seam',(cx+dx,cy-.027,cz-h),(cx+dx,cy-.027,cz+h),
        .0018,.0018,LEATHER,2,'Forearm.L',n=4)

if globals().get('PILGRIM_REFINER'):
    PILGRIM_REFINER(globals())

# Packed reference empties, for actual editing in Blender rather than relying
# on the external chat. They are guides only and never render or export.
GUIDES=coll('Reference guides • non-rendering')
for name,rotation,location in [('Front painting',(math.pi/2,0,0),(0,.4,.925)),
                               ('Back painting',(math.pi/2,0,math.pi),(0,-.4,.925))]:
    ob=bpy.data.objects.new(name,None);GUIDES.objects.link(ob);ob.empty_display_type='IMAGE'
    ob.data=ref;ob.empty_display_size=IW*SCALE;ob.rotation_euler=rotation;ob.location=location
    ob.hide_render=True;ob.hide_set(True)

sc.world=bpy.data.worlds.new('Neutral reference studio');sc.world.use_nodes=True
sc.world.node_tree.nodes['Background'].inputs[0].default_value=(.50,.47,.43,1)
sc.world.node_tree.nodes['Background'].inputs[1].default_value=.5
sc.render.engine='CYCLES';sc.cycles.samples=32;sc.cycles.use_denoising=True
sc.cycles.preview_samples=16;sc.cycles.use_preview_denoising=True
sc.view_settings.view_transform='Standard';sc.view_settings.look='None'
sc.render.resolution_x=1000;sc.render.resolution_y=1100;sc.render.resolution_percentage=100
sc.render.image_settings.file_format='PNG'
def point(ob,target):ob.rotation_euler=(Vector(target)-ob.location).to_track_quat('-Z','Y').to_euler()
for name,pos,power,size in [('Soft key',(-3,-4,5),190,5),('Cool fill',(3,-3,3),100,4),('Back fill',(2,4,4),150,4)]:
    data=bpy.data.lights.new(name,'AREA');data.energy=power;data.shape='DISK';data.size=size
    ob=bpy.data.objects.new(name,data);STUDIO.objects.link(ob);ob.location=pos;point(ob,(0,0,.95))
camdata=bpy.data.cameras.new('Model camera');cam=bpy.data.objects.new('Model camera',camdata)
STUDIO.objects.link(cam);camdata.type='ORTHO';camdata.ortho_scale=2.12;sc.camera=cam
cam.location=(2.3,-6,1.95);point(cam,(0,0,.94))
data=bpy.data.meshes.new('Ground');data.from_pydata([(-200,-200,-.005),(200,-200,-.005),
    (200,200,-.005),(-200,200,-.005)],[],[(0,1,2,3)])
ground=bpy.data.objects.new('Neutral ground',data);STUDIO.objects.link(ground)
m=bpy.data.materials.new('Warm gray backdrop');m.diffuse_color=(.29,.265,.235,1);m.use_nodes=True
m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=(.29,.265,.235,1)
m.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value=1;data.materials.append(m)

text=bpy.data.texts.new(f'READ ME • Cathedral Pilgrim revision {REVISION}')
text.write(f'''CATHEDRAL PILGRIM — REFERENCE-FITTED REVISION {REVISION}
The character is REAL editable 3D geometry, with front/back reference-projected
UV textures. The turnaround is AI-generated from the approved concept.
The renders in docs/characters/ashen-parish/pilgrim-v{REVISION} come from this geometry.
This is a fidelity study, not a claim of a finished production game character.
Hide the WEAPONS collection to compare the unobscured body with the reference.
The 22-bone original humanoid skin is retained. No gameplay animation retargeting.
Projection seams at side surfaces need further texture painting before shipping.
The earlier modular model is retained separately. Only this pilgrim is revised.
Rebuild: blender -b --python scripts/buildPilgrimV3.py
''')
for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type=='VIEW_3D':
            sp=area.spaces.active;sp.region_3d.view_perspective='CAMERA'
            sp.shading.type='MATERIAL';sp.shading.use_scene_lights=True;sp.shading.use_scene_world=True
            sp.overlay.show_overlays=False
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/f'cathedral-pilgrim-v{REVISION}.blend'))
views=globals().get('PILGRIM_RENDER_VIEWS') or [
    ('three-quarter',(2.3,-6,1.95),(0,0,.94),True),
    ('front',(0,-6,.94),(0,0,.94),False),
    ('back',(0,6,.94),(0,0,.94),False),
    ('side',(6,-.15,1.4),(0,0,.94),False)]
for config in views:
    view,pos,target,weapons,*options=config
    options=options[0] if options else {}
    WEAPONS.hide_render=not weapons
    camdata.ortho_scale=options.get('scale',2.12)
    hidden={}
    for ob in sc.objects:
        if any(pattern in ob.name for pattern in options.get('hide',[])):
            hidden[ob]=ob.hide_render;ob.hide_render=True
    cam.location=pos;point(cam,target);sc.render.filepath=str(DOC/(view+'.png'))
    bpy.ops.render.render(write_still=True)
    for ob,state in hidden.items():ob.hide_render=state
WEAPONS.hide_render=False
# Keep detailed source objects editable, but merge copies into five functional
# modules for export. Guides, lights, floor and cameras are never included.
export_scene=bpy.data.scenes.new('Temporary export')
bpy.context.window.scene=export_scene
export_rig=rig.copy();export_rig.data=rig.data.copy()
export_scene.collection.objects.link(export_rig)
for c in [BODY,ARMOR,CLOTH,GEAR,WEAPONS]:
    copies=[]
    for ob in c.objects:
        if ob.type!='MESH':continue
        cp=ob.copy();cp.data=ob.data.copy();cp.parent=export_rig
        export_scene.collection.objects.link(cp)
        for mod in cp.modifiers:
            if mod.type=='ARMATURE':mod.object=export_rig
        bpy.ops.object.select_all(action='DESELECT');cp.select_set(True)
        bpy.context.view_layer.objects.active=cp
        for mod in list(cp.modifiers):
            if mod.type!='ARMATURE':bpy.ops.object.modifier_apply(modifier=mod.name)
        copies.append(cp)
    bpy.ops.object.select_all(action='DESELECT')
    for ob in copies:ob.select_set(True)
    bpy.context.view_layer.objects.active=copies[0]
    bpy.ops.object.join();copies[0].name=c.name
bpy.ops.object.select_all(action='SELECT')
bpy.context.view_layer.objects.active=export_rig
bpy.ops.export_scene.gltf(filepath=str(OUT/f'cathedral-pilgrim-v{REVISION}.glb'),export_format='GLB',
    use_selection=True,use_active_scene=True,export_skins=True,export_animations=False,export_yup=True)
bpy.context.window.scene=sc
for ob in list(export_scene.objects):bpy.data.objects.remove(ob,do_unlink=True)
bpy.data.scenes.remove(export_scene)
report={'revision':REVISION,'source':f'cathedral-pilgrim-v{REVISION}.blend','export':f'cathedral-pilgrim-v{REVISION}.glb',
    'references':['pilgrim-turnaround.png','pilgrim-side-reference.png'],
    'construction':'Fitted 3D meshes with four-view projected textures',
    'bones':len(rig.data.bones),'parts':sum(o.type=='MESH' for c in [BODY,ARMOR,CLOTH,GEAR,WEAPONS] for o in c.objects),
    'projection_edge_corrections':len(projection_corrections),
    'export_modules':5,
    'limitation':'Projection transitions and hidden surfaces still need texture painting; no combat or locomotion clips.'}
if globals().get('REFINEMENT_REPORT'):report['refinement']=REFINEMENT_REPORT
(OUT/'manifest.json').write_text(json.dumps(report,indent=2)+'\n')
print('PILGRIM_V3_COMPLETE',json.dumps(report))
