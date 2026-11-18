"""Build original modular Ashen Parish character assets with Blender 5.x.

Run: blender -b --python scripts/buildAshenCharacter.py
No downloaded geometry; the approved artwork is a design reference only.
"""

import bpy
import json
import math
import random
from pathlib import Path
from mathutils import Vector, Quaternion
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
bpy.context.preferences.filepaths.save_version = 0
OUT = ROOT / 'public/assets/characters/ashen-parish'
DOC = ROOT / 'docs/characters/ashen-parish'
OUT.mkdir(parents=True, exist_ok=True)
DOC.mkdir(parents=True, exist_ok=True)
random.seed(39)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
for collection in list(bpy.data.collections):
    if collection.users == 0:
        bpy.data.collections.remove(collection)
master = bpy.context.scene
master.name = '00 • Modular source'

# One packed, exported 512px atlas. Deliberately modest texel density, with
# multiscale wear instead of high-frequency static on every surface.
PALETTE = {
    'iron': (0.195, .215, .225), 'edge': (.37, .38, .36),
    'leather': (.145, .086, .049), 'charcoal': (.087, .083, .070),
    'rust_red': (.32, .085, .045), 'moss': (.135, .166, .074),
    'ochre': (.39, .255, .077), 'skin': (.38, .255, .165),
    'wood': (.29, .19, .10), 'brass': (.47, .34, .145),
    'wrap': (.41, .365, .255), 'black': (.031, .034, .029),
    'rust': (.31, .155, .075), 'wax': (.39, .105, .055),
    'candle': (.94, .72, .34), 'glass': (.30, .245, .135),
}
atlas = np.ones((512, 512, 4), dtype=np.float32)
rng = np.random.default_rng(39)
yy, xx = np.mgrid[0:128, 0:128]
def soft_noise(size):
    values = rng.random((size,size))
    points = np.linspace(0,size-1,128)
    horizontal = np.array([np.interp(points,np.arange(size),row) for row in values])
    return np.array([np.interp(points,np.arange(size),column) for column in horizontal.T]).T

for index, (name, color) in enumerate(PALETTE.items()):
    coarse = soft_noise(7)
    medium = soft_noise(19)
    noise = .55 + .48 * coarse + .28 * medium + .10 * rng.random((128, 128))
    if name in ('moss', 'charcoal', 'rust_red', 'ochre', 'wrap'):
        noise += .018 * ((xx % 2 == 0) + (yy % 2 == 0))
        noise += .09 * np.sin(xx*.18+np.sin(yy*.05))
        noise *= .77+.23*np.minimum(1,yy/38)
    tile = np.array(color)[None, None, :] * noise[:, :, None]
    if name in ('iron', 'edge', 'brass'):
        tarnish = np.clip((.39-coarse)*3,0,.6) * medium
        tile = tile*(1-tarnish[:,:,None]) + np.array((.16,.075,.025))*tarnish[:,:,None]
        tile += (.06*np.exp(-((xx-37)/32)**2))[:,:,None]
        for _ in range(65):
            x, y = rng.integers(3, 120, size=2)
            length = int(rng.integers(2, 17))
            tile[y:y+1, x:min(127, x+length)] *= 1.55
            tile[y+1:y+2,x:min(127,x+length)] *= .77
    if name == 'wood':
        tile *= (.9 + .12 * np.sin(xx * .43 + np.sin(yy * .07)))[:, :, None]
    tx, ty = index % 4, index // 4
    atlas[ty*128:(ty+1)*128, tx*128:(tx+1)*128, :3] = np.clip(tile, 0, 1)
image = bpy.data.images.new('Ashen • painted wear atlas • 512', 512, 512)
image.pixels.foreach_set(atlas.ravel())
image.filepath_raw = str(OUT / 'ashen-atlas.png')
image.file_format = 'PNG'
image.save()
image.pack()
MATS = {}
for index, name in enumerate(PALETTE):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*PALETTE[name], 1)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    tex = mat.node_tree.nodes.new('ShaderNodeTexImage')
    tex.image = image
    tex.interpolation = 'Linear'
    mat.node_tree.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
    bsdf.inputs['Roughness'].default_value = .62 if name in ('iron','edge','brass') else .92
    bsdf.inputs['Metallic'].default_value = .65 if name in ('iron', 'edge', 'brass') else 0
    if name == 'candle':
        bsdf.inputs['Emission Color'].default_value = (1, .49, .11, 1)
        bsdf.inputs['Emission Strength'].default_value = .8
    MATS[name] = mat

def collection(name):
    c = bpy.data.collections.new(name)
    master.collection.children.link(c)
    return c

COMMON = collection('BASE • shared body + humanoid rig')
PILGRIM = collection('OUTFIT • Cathedral Pilgrim')
KEEPER = collection('OUTFIT • Grave Keeper')
KNIGHT = collection('OUTFIT • Penitent Knight')
SWORD = collection('WEAPON • sword and shield')
TOOLS = collection('EQUIPMENT • burial tools and lantern')
HAMMER = collection('WEAPON • two-handed war hammer')
GREAT = collection('WEAPON • two-handed greatsword')
CURRENT = COMMON
RIG = None

def mesh(name, vertices, faces, material, bone=None, collection_override=None):
    data = bpy.data.meshes.new(name)
    data.from_pydata(vertices, [], faces)
    data.update()
    obj = bpy.data.objects.new(name, data)
    (collection_override or CURRENT).objects.link(obj)
    data.materials.append(MATS[material])
    # Continuous per-object box projection. No modulo at UV boundaries: the
    # old wrap crossed entire atlas tiles and created a patchwork of rectangles.
    tile = list(PALETTE).index(material)
    uv = data.uv_layers.new(name='AtlasUV')
    minimum = [min(v.co[i] for v in data.vertices) for i in range(3)]
    maximum = [max(v.co[i] for v in data.vertices) for i in range(3)]
    for poly in data.polygons:
        n = poly.normal
        axis = max(range(3), key=lambda i: abs(n[i]))
        axes = [i for i in range(3) if i != axis]
        for loop in poly.loop_indices:
            v = data.vertices[data.loops[loop].vertex_index].co
            u,w = [(v[i]-minimum[i])/max(.001,maximum[i]-minimum[i]) for i in axes]
            uv.data[loop].uv = ((tile % 4 + .025 + .95 * u) / 4,
                                (tile // 4 + .025 + .95 * w) / 4)
    if bone and RIG:
        bind(obj, bone)
    return obj

def bind(obj, bone):
    obj.vertex_groups.clear()
    group = obj.vertex_groups.new(name=bone)
    group.add(list(range(len(obj.data.vertices))), 1, 'REPLACE')
    mod = obj.modifiers.new('Shared humanoid skin', 'ARMATURE')
    mod.object = RIG
    obj.parent = RIG

def cube(name, center, size, mat, bone=None, bevel=0):
    x, y, z = center
    a, b, c = [v / 2 for v in size]
    vs = [(x+sx*a, y+sy*b, z+sz*c) for sx, sy, sz in
          [(-1,-1,-1),(1,-1,-1),(1,1,-1),(-1,1,-1),
           (-1,-1,1),(1,-1,1),(1,1,1),(-1,1,1)]]
    obj = mesh(name, vs, [(0,3,2,1),(4,5,6,7),(0,1,5,4),
                         (1,2,6,5),(2,3,7,6),(3,0,4,7)], mat, bone)
    if bevel:
        mod = obj.modifiers.new('Forged edge', 'BEVEL')
        mod.width = bevel
        mod.segments = 1
    return obj

def rings(name, rows, mat, bone=None, n=16, caps=True):
    # Each row: cx, cy, z, x radius, y radius.
    vs = [(x+rx*math.sin(i*math.tau/n), y-ry*math.cos(i*math.tau/n), z)
          for x,y,z,rx,ry in rows for i in range(n)]
    fs = []
    for row in range(len(rows)-1):
        for i in range(n):
            a = row*n+i; b = row*n+(i+1)%n
            fs.append((a,b,b+n,a+n))
    if caps:
        fs += [tuple(reversed(range(n))), tuple((len(rows)-1)*n+i for i in range(n))]
    if rows[0][2] > rows[-1][2]:
        fs=[tuple(reversed(f)) for f in fs]
    ob=mesh(name, vs, fs, mat, bone)
    for p in ob.data.polygons:
        p.use_smooth = len(p.vertices)==4
    return ob

def tube(name, a, b, r1, r2, mat, bone=None, n=8, depth=1):
    a, b = Vector(a), Vector(b)
    direction = (b-a).normalized()
    u = direction.cross(Vector((0,1,0))).normalized()
    if u.length < .1:
        u = direction.cross(Vector((1,0,0))).normalized()
    v = direction.cross(u).normalized()
    vs = [tuple(p + u*math.cos(i*math.tau/n)*r + v*math.sin(i*math.tau/n)*r*depth)
          for p,r in [(a,r1),(b,r2)] for i in range(n)]
    fs = [tuple(reversed(range(n))), tuple(n+i for i in range(n))]
    fs += [(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
    return mesh(name,vs,fs,mat,bone)

def line(name, points, radius, mat, bone=None, n=5):
    for i in range(len(points)-1):
        tube(name+f' {i+1}',points[i],points[i+1],radius,radius,mat,bone,n)

def ring(name, center, radius, thickness, mat, bone=None, plane='XY', n=12):
    x,y,z=center
    pts=[]
    for i in range(n+1):
        a=i*math.tau/n
        pts.append((x+radius*math.cos(a),y+radius*math.sin(a),z) if plane=='XY'
                   else (x+radius*math.cos(a),y,z+radius*math.sin(a)))
    line(name,pts,thickness,mat,bone,n=5)

# Human rest skeleton, metres, forward = -Y, Z up. Armor and hand items have
# explicit weights; no automatic weighting surprises across overlapping layers.
arm = bpy.data.armatures.new('Ashen humanoid • shared topology')
RIG = bpy.data.objects.new('AshenRig', arm)
COMMON.objects.link(RIG)
bpy.context.view_layer.objects.active=RIG
RIG.select_set(True)
bpy.ops.object.mode_set(mode='EDIT')
BONES = {}
def bone(name, head, tail, parent=None):
    b=arm.edit_bones.new(name); b.head=head; b.tail=tail
    if parent: b.parent=arm.edit_bones[parent]
    BONES[name]=(Vector(head),Vector(tail))
bone('Root',(0,0,0),(0,0,.18))
bone('Hips',(0,0,.91),(0,0,1.06),'Root')
bone('Spine',(0,0,1.06),(0,0,1.27),'Hips')
bone('Chest',(0,0,1.27),(0,0,1.49),'Spine')
bone('Neck',(0,0,1.49),(0,0,1.59),'Chest')
bone('Head',(0,0,1.59),(0,0,1.81),'Neck')
for side,s in [('L',1),('R',-1)]:
    bone('Clavicle.'+side,(s*.06,0,1.46),(s*.235,0,1.46),'Chest')
    bone('UpperArm.'+side,(s*.235,0,1.46),(s*.325,-.015,1.20),'Clavicle.'+side)
    bone('Forearm.'+side,(s*.325,-.015,1.20),(s*.375,-.055,.98),'UpperArm.'+side)
    bone('Hand.'+side,(s*.375,-.055,.98),(s*.386,-.07,.88),'Forearm.'+side)
    bone('Thigh.'+side,(s*.105,0,.94),(s*.125,-.015,.53),'Hips')
    bone('Shin.'+side,(s*.125,-.015,.53),(s*.14,0,.13),'Thigh.'+side)
    bone('Foot.'+side,(s*.14,0,.13),(s*.14,-.17,.07),'Shin.'+side)
bone('Cape.01',(0,.13,1.46),(0,.20,1.16),'Chest')
bone('Cape.02',(0,.20,1.16),(0,.24,.85),'Cape.01')
bpy.ops.object.mode_set(mode='OBJECT')
RIG.show_in_front=True
RIG['forward_axis']='-Y; +Z up; units metres'
RIG['retargeting']='Original Ashen humanoid; retarget existing pack animations before game integration.'

def limb(side, mat, armor=False):
    s=1 if side=='L' else -1
    upper='UpperArm.'+side; lower='Forearm.'+side; hand='Hand.'+side
    a,b=BONES[upper]; c=BONES[lower][1]
    sleeve=rings('Tailored sleeve '+side,[
        (s*.228,0,1.47,.083,.087),(s*.259,-.002,1.425,.104,.095),
        (s*.282,-.006,1.36,.096,.087),(s*.305,-.012,1.285,.079,.075),
        (s*.318,-.014,1.246,.077,.071),(s*.323,-.015,1.225,.071,.069),
        (s*.327,-.018,1.209,.080,.073),(s*.33,-.019,1.190,.068,.063),
        (s*.335,-.021,1.174,.078,.069),(s*.339,-.024,1.155,.069,.060),
        (s*.345,-.029,1.13,.075,.063),(s*.352,-.035,1.101,.071,.058),
        (s*.36,-.043,1.065,.065,.057),
        (s*.375,-.055,.984,.048,.044)],mat,upper,n=16)
    lower_group=sleeve.vertex_groups.new(name=lower)
    for v in sleeve.data.vertices:
        t=max(0,min(1,(1.27-v.co.z)/.13))
        sleeve.vertex_groups[upper].add([v.index],1-t,'REPLACE')
        lower_group.add([v.index],t,'REPLACE')
        centre=s*(.235+(1.46-v.co.z)*.28)
        angle=math.atan2(v.co.y+.02,v.co.x-centre)
        fold=.055*math.sin(v.co.z*105+angle*2)*math.exp(-((v.co.z-1.19)/.16)**2)
        v.co.x=centre+(v.co.x-centre)*(1+fold)
        v.co.y=-.02+(v.co.y+.02)*(1+fold)
    for j in range(3):
        zz=1.17-j*.035; xx=s*(.334+j*.009)
        # Small overlapping leather cuff folds, not square robot wrists.
        if j==2:rings('Glove rolled cuff '+side,[(xx,-.032,zz,.068,.060),
            (xx,-.035,zz-.032,.063,.056)],'iron' if armor else 'leather',lower,n=12)
    rings('Shaped glove palm '+side,[(s*.38,-.053,.979,.043,.034),
        (s*.39,-.057,.948,.049,.035),(s*.39,-.056,.892,.046,.034),
        (s*.39,-.058,.877,.031,.024)],'leather',hand,n=12)
    for i in range(4):
        zz=.891+i*.018
        line('Curled glove finger '+side+str(i),[(s*.414,-.059,zz),
            (s*.428,-.084,zz),(s*.412,-.106,zz),(s*.385,-.108,zz)],
            .010,'iron' if armor else 'leather',hand,n=6)
    line('Curved thumb '+side,[(s*.354,-.049,.949),(s*.352,-.084,.937),
        (s*.374,-.112,.929)],.014,'leather',hand,n=7)

def boots(side, armor=False):
    s=1 if side=='L' else -1
    foot='Foot.'+side; shin='Shin.'+side
    rings('Boot leather shaft '+side,[(s*.14,0,.11,.065,.064),(s*.14,.004,.19,.060,.064),
        (s*.14,0,.25,.066,.065),(s*.138,0,.32,.079,.072),
        (s*.138,0,.335,.077,.071)],'leather',shin,n=12)
    rings('Boot folded cuff '+side,[(s*.138,0,.31,.081,.074),
        (s*.138,0,.345,.080,.073)],'leather',shin,n=12,caps=False)
    rings('Boot welt sole '+side,[(s*.14,-.06,.018,.081,.145),
        (s*.14,-.06,.045,.082,.147)],'black',foot,n=16)
    rings('Shaped boot vamp '+side,[(s*.14,-.060,.046,.080,.143),
        (s*.14,-.063,.080,.079,.135),(s*.14,-.044,.12,.069,.100),
        (s*.14,-.001,.18,.058,.063)],'iron' if armor else 'leather',foot,n=16)
    rings('Boot ankle strap '+side,[(s*.14,0,.19,.066,.071),
        (s*.14,0,.21,.066,.071)],'leather',shin,n=12,caps=False)
    cube('Boot clasp '+side,(s*.195,-.052,.202),(.024,.015,.025),'brass',shin,.003)
    if armor:
        for j in range(3):
            zz=.086+j*.022
            line('Sabatons raised lame '+side,[(s*.14-.064,-.13+j*.026,zz),
                (s*.14,-.15+j*.026,zz+.01),(s*.14+.064,-.13+j*.026,zz)],.005,'edge',foot)

def base_body():
    torso=rings('Body • padded gambeson',[(0,0,.92,.165,.125),(0,0,1.06,.166,.118),
        (0,0,1.16,.175,.128),(0,-.005,1.30,.226,.155),(0,0,1.40,.242,.141),
        (0,0,1.465,.226,.124),(0,0,1.51,.10,.082)],'charcoal','Chest',n=16)
    hip=torso.vertex_groups.new(name='Hips'); spine=torso.vertex_groups.new(name='Spine')
    for v in torso.data.vertices:
        h=max(0,min(1,(1.18-v.co.z)/.13)); c=max(0,min(1,(v.co.z-1.18)/.15))
        torso.vertex_groups['Chest'].add([v.index],c,'REPLACE')
        hip.add([v.index],h,'REPLACE');spine.add([v.index],1-h-c,'REPLACE')
    tube('Neck',(0,0,1.47),(0,0,1.63),.064,.067,'charcoal','Neck',n=8)
    for side,s in [('L',1),('R',-1)]:
        leg=rings('Full cut trousers '+side,[(s*.105,0,.97,.105,.115),
            (s*.111,.009,.88,.112,.111),(s*.116,.005,.76,.104,.101),
            (s*.12,-.005,.64,.086,.084),(s*.122,-.012,.604,.087,.083),
            (s*.124,-.017,.58,.076,.077),(s*.125,-.022,.556,.086,.086),
            (s*.125,-.015,.536,.077,.077),(s*.127,-.012,.516,.085,.082),
            (s*.127,-.01,.50,.076,.073),(s*.13,.01,.43,.080,.079),
            (s*.137,.013,.34,.067,.071),(s*.14,0,.22,.054,.055)],'charcoal','Thigh.'+side,n=16)
        shin=leg.vertex_groups.new(name='Shin.'+side)
        for v in leg.data.vertices:
            t=max(0,min(1,(.60-v.co.z)/.13))
            leg.vertex_groups['Thigh.'+side].add([v.index],1-t,'REPLACE');shin.add([v.index],t,'REPLACE')
            centre=s*(.14-(v.co.z-.22)*.045)
            angle=math.atan2(v.co.y,v.co.x-centre)
            fold=.07*math.sin(v.co.z*108+angle*2)*math.exp(-((v.co.z-.60)/.16)**2)
            v.co.x=centre+(v.co.x-centre)*(1+fold);v.co.y*=1+fold
    # Face is a deliberately angular editable mesh, with protruding nose and
    # separate brow/eyes instead of a featureless primitive under the hood.
    rings('Face',[(0,-.008,1.575,.038,.047),(0,-.008,1.60,.060,.065),
        (0,0,1.635,.078,.076),(0,0,1.675,.083,.080),(0,.003,1.71,.079,.079),
        (0,.009,1.75,.077,.075),(0,.014,1.785,.061,.058),
        (0,.014,1.802,.026,.029)],'skin','Head',n=16)
    mesh('Nose',[(-.018,-.070,1.70),(.018,-.070,1.70),(0,-.109,1.65),
                 (-.018,-.075,1.645),(.018,-.075,1.645)],[(0,1,2),(0,2,3),(1,4,2),(3,2,4)],'skin','Head')
    for s in [-1,1]:
        mesh('Narrow recessed eye',[(s*.019,-.081,1.688),(s*.048,-.071,1.691),
            (s*.046,-.073,1.683),(s*.021,-.083,1.682)],[(0,1,2,3)],'black','Head')
        line('Heavy brow',[(s*.017,-.083,1.702),(s*.046,-.076,1.708),
            (s*.057,-.064,1.702)],.006,'charcoal','Head',n=5)
    cube('Mouth',(0,-.072,1.615),(.036,.008,.006),'black','Head')
    mesh('Beard',[(-.063,-.050,1.64),(-.034,-.077,1.628),(0,-.078,1.620),
                  (.034,-.077,1.628),(.063,-.050,1.64),(.043,-.057,1.584),
                  (0,-.066,1.574),(-.043,-.057,1.584)],[(0,1,2,3,4,5,6,7)],'charcoal','Head')

base_body()

def belt():
    rings('Waist leather belt',[(0,0,1.06,.182,.151),(0,0,1.105,.183,.152)],'leather','Hips',n=20,caps=False)
    cube('Belt buckle',(0,-.158,1.082),(.060,.018,.045),'brass','Hips',.006)
    cube('Buckle inset',(0,-.170,1.083),(.039,.007,.025),'black','Hips')
    cube('Buckle pin',(0,-.177,1.083),(.038,.009,.006),'brass','Hips')

def pouch(x,z=1):
    cube('Supply pouch',(x,-.177,z),(.12,.075,.14),'leather','Hips',.023)
    mesh('Pouch flap',[(x-.062,-.219,z+.071),(x+.062,-.219,z+.071),
                      (x+.050,-.224,z+.015),(x,-.231,z-.005),(x-.05,-.224,z+.015)],[(0,1,2,3,4)],'leather','Hips')
    cube('Pouch clasp',(x,-.235,z+.014),(.019,.014,.023),'brass','Hips')

def hood():
    # Front is open from chin to brow; lower cowl frames the face.
    n=16; vs=[]
    rows=[(1.51,.125,.12),(1.61,.11,.123),(1.735,.112,.13),
          (1.795,.095,.104),(1.825,.069,.075),(1.835,.024,.033)]
    for z,rx,ry in rows:
        for i in range(n):
            a=i*math.tau/n
            vs.append((rx*math.sin(a),.015-ry*math.cos(a),z))
    fs=[]
    for row in range(len(rows)-1):
        for i in range(n):
            if row in (0,1) and i in (0,1,2,13,14,15): continue
            fs.append((row*n+i,row*n+(i+1)%n,(row+1)*n+(i+1)%n,(row+1)*n+i))
    fs.append(tuple((len(rows)-1)*n+i for i in range(n)))
    ob=mesh('Open cloth hood',vs,fs,'charcoal','Head')
    for p in ob.data.polygons:p.use_smooth=True
    solid=ob.modifiers.new('Hood cloth thickness','SOLIDIFY'); solid.thickness=.006
    for s in [-1,1]:
        line('Hood stitched edge',[(s*.081,-.078,1.735),(s*.078,-.084,1.66),
                                  (s*.052,-.090,1.585),(0,-.11,1.54)],.009,'charcoal','Head')
    rings('Draped neck cowl',[(0,0,1.505,.151,.131),(0,-.005,1.535,.125,.12),
        (0,-.005,1.56,.09,.10)],'charcoal','Neck',n=20,caps=False)
    if CURRENT==KEEPER:
        # Hood extends over the shoulders, rather than ending in a modern
        # sweatshirt-like collar. A broad uneven hem makes it a work cowl.
        vs=[];n=24
        for j in range(3):
            t=j/2
            for i in range(n):
                a=i*math.tau/n
                zz=1.55-.12*t-.035*t*math.cos(a)
                vs.append(((.105+.165*t)*math.sin(a),-(.10+.075*t)*math.cos(a),zz))
        fs=[tuple(reversed((j*n+i,j*n+(i+1)%n,(j+1)*n+(i+1)%n,(j+1)*n+i)))
            for j in range(2) for i in range(n)]
        cowl=mesh('Grave keeper draped shoulder cowl',vs,fs,'charcoal','Chest')
        for p in cowl.data.polygons:p.use_smooth=True
        m=cowl.modifiers.new('Cowl hem','SOLIDIFY');m.thickness=.005

def skirt(name,mat,top=1.06,bottom=.73,width=.19,depth=.14,split=True):
    if mat=='iron':
        for j in range(3):
            zz=1.13-j*.045
            rings('Overlapping fauld lame',[(0,0,zz,.17+j*.014,.137+j*.006),
                (0,0,zz-.055,.18+j*.014,.142+j*.006)],'iron','Hips',n=16,caps=False)
        for s in [-1,1]:
            x=s*.112
            ob=mesh('Fluted tasset',[(x-.082,-.153,1.015),(x,-.181,1.018),
                (x+.082,-.153,1.015),(x+.072,-.181,.86),(x,-.205,.835),
                (x-.072,-.181,.86)],[(0,1,4,5),(1,2,3,4)],'iron','Hips')
            m=ob.modifiers.new('Plate thickness','SOLIDIFY');m.thickness=.006
            for zz in [.965,.915]:line('Tasset flute',[(x-.07,-.175,zz),
                (x,-.199,zz-.008),(x+.07,-.175,zz)],.0035,'edge','Hips')
        return
    width*=1.12;depth*=1.12
    n=32;rows=6;vs=[]
    for j in range(rows):
        t=j/(rows-1)
        for i in range(n):
            a=i*math.tau/n
            fold=1+.045*math.cos(8*a+.3)+.025*math.cos(13*a)
            radius=(.77+.23*math.sin(t*math.pi/2))*fold
            zz=top+(bottom-top)*t
            if j==rows-1:zz+=.017*math.sin(i*2.3)+.012*math.cos(i*1.3)
            vs.append((width*radius*math.sin(a),-depth*radius*math.cos(a),zz))
    fs=[]
    for j in range(rows-1):
        for i in range(n):
            if split and j>=1 and i in (0,31):continue
            fs.append((j*n+i,j*n+(i+1)%n,(j+1)*n+(i+1)%n,(j+1)*n+i))
    ob=mesh(name+' • draped continuous cloth',vs,fs,mat,'Hips')
    for p in ob.data.polygons:p.flip()
    for p in ob.data.polygons:p.use_smooth=True
    groups={side:ob.vertex_groups.new(name='Thigh.'+side) for side in ['L','R']}
    for v in ob.data.vertices:
        t=max(0,min(.48,(top-v.co.z)/max(.1,top-bottom)*.48))
        ob.vertex_groups['Hips'].add([v.index],1-t,'REPLACE')
        groups['L' if v.co.x>0 else 'R'].add([v.index],t,'REPLACE')
    mod=ob.modifiers.new('Cloth thickness','SOLIDIFY');mod.thickness=.005

def breastplate(heavy=False):
    rows=[(1.09,.164,.125),(1.16,.174,.148),(1.26,.215,.173),
          (1.37,.25 if heavy else .242,.168),(1.445,.228,.137),(1.495,.103,.087)]
    ob=rings('Fitted cuirass',[(0,0,z,x,y) for z,x,y in rows],'iron','Chest',n=16,caps=False)
    # Raised central keel down front, characteristic even at low resolution.
    vs=[]
    for z,rx,ry in rows:
        vs += [(-.025,-ry-.002,z),(0,-ry-.014,z),(.025,-ry-.002,z)]
    fs=[]
    for row in range(len(rows)-1):
        for i in range(2): fs.append((row*3+i,row*3+i+1,(row+1)*3+i+1,(row+1)*3+i))
    mesh('Breastplate central ridge',vs,fs,'iron','Chest')
    for z,x,y in [rows[0],rows[-1]]:
        rings('Plate rolled edge',[(0,0,z-.004,x+.004,y+.004),(0,0,z+.004,x+.004,y+.004)],'edge','Chest',n=16,caps=False)
    for s in [-1,1]:
        for z in [1.20,1.36]:
            cube('Plate rivet',(s*.136,-.118,z),(.012,.013,.012),'brass','Chest',.003)

def pauldron(side,heavy=False):
    s=1 if side=='L' else -1
    count=12;vs=[]
    for theta in [.08,.48,.93,1.40,1.62]:
        for i in range(count+1):
            phi=-math.pi/2+i/count*math.pi
            vs.append((s*(.225+.145*math.sin(theta)*math.cos(phi)),
                .127*math.sin(theta)*math.sin(phi),1.455+.106*math.cos(theta)))
    fs=[(j*(count+1)+i,j*(count+1)+i+1,(j+1)*(count+1)+i+1,(j+1)*(count+1)+i)
        for j in range(4) for i in range(count)]
    if s>0:fs=[tuple(reversed(f)) for f in fs]
    ob=mesh('Sculpted shoulder shell '+side,vs,fs,'iron','UpperArm.'+side)
    for p in ob.data.polygons:p.use_smooth=True
    mod=ob.modifiers.new('Shoulder steel thickness','SOLIDIFY');mod.thickness=.007
    for j in range(2 if heavy else 1):
        vs=[]
        for row in range(2):
            for i in range(count+1):
                phi=-math.pi/2+i/count*math.pi
                vs.append((s*(.246+.130*math.cos(phi)*(1-.06*j)),.121*math.sin(phi),
                    1.44-j*.052-row*.065-.018*math.cos(phi)))
        fs=[(i,i+1,count+2+i,count+1+i) for i in range(count)]
        if s>0:fs=[tuple(reversed(f)) for f in fs]
        ob=mesh('Shaped shoulder lame '+side,vs,fs,'iron','UpperArm.'+side)
        for p in ob.data.polygons:p.use_smooth=True
        m=ob.modifiers.new('Steel edge thickness','SOLIDIFY');m.thickness=.006
        line('Pauldron rolled hem '+side,vs[count+1:],.004,'edge','UpperArm.'+side,n=5)

def cape():
    vs=[]; cols=17; rows=9
    for j in range(rows):
        t=j/(rows-1); z=1.515-t*.70
        width=.145+.17*math.sin(t*math.pi*.70)
        for i in range(cols):
            u=i/(cols-1); x=(u*2-1)*width
            y=.14+.13*min(1,t*2.5) + math.cos(u*math.tau*3)*(.008+.024*t)
            zz=z
            if j==rows-1:
                zz+=.016*math.sin(i*2.2)+(.085 if i in (3,10,14) else 0)
            vs.append((x,y,zz))
    fs=[(j*cols+i,j*cols+i+1,(j+1)*cols+i+1,(j+1)*cols+i)
        for j in range(rows-1) for i in range(cols-1)
        if not (j==rows-2 and i in (2,9,13))]
    ob=mesh('Rust-red ragged cape',vs,fs,'rust_red')
    ob.parent=RIG
    g1=ob.vertex_groups.new(name='Cape.01'); g2=ob.vertex_groups.new(name='Cape.02')
    for v in ob.data.vertices:
        t=max(0,min(1,(1.23-v.co.z)/.32))
        g1.add([v.index],1-t,'REPLACE'); g2.add([v.index],t,'REPLACE')
    m=ob.modifiers.new('Cape skin','ARMATURE'); m.object=RIG
    m=ob.modifiers.new('Cape thickness','SOLIDIFY'); m.thickness=.004
    # A broad draped mantle makes the red fabric part of the gameplay silhouette.
    vs=[];n=32
    profile=[(.11,.11,1.55),(.24,.165,1.50),(.295,.18,1.44),(.33,.19,1.385)]
    for j in range(4):
        t=j/3
        for i in range(n):
            a=i*math.tau/n
            rx,ry,z=profile[j]
            z-=.05*t*max(0,-math.sin(a))
            if j==3:z+=.01*math.sin(i*1.7)
            vs.append((rx*math.sin(a),-ry*math.cos(a),z))
    fs=[(j*n+i,j*n+(i+1)%n,(j+1)*n+(i+1)%n,(j+1)*n+i)
        for j in range(3) for i in range(n) if i not in (0,31)]
    ob=mesh('Draped pilgrim shoulder mantle',vs,fs,'rust_red','Chest')
    for p in ob.data.polygons:p.flip()
    for p in ob.data.polygons:p.use_smooth=True
    m=ob.modifiers.new('Mantle thickness','SOLIDIFY');m.thickness=.006
    cube('Mantle clasp',(0,-.148,1.476),(.042,.019,.026),'brass','Chest',.004)

def strap(name,a,b,width,mat,bone_name):
    a,b=Vector(a),Vector(b)
    d=b-a; cross=Vector((d.z,0,-d.x)).normalized()*width/2
    ob=mesh(name,[tuple(a-cross),tuple(a+cross),tuple(b+cross),tuple(b-cross)],[(0,1,2,3)],mat,bone_name)
    mod=ob.modifiers.new('Leather thickness','SOLIDIFY'); mod.thickness=.006
    return ob

CURRENT=PILGRIM
hood(); breastplate(); cape(); pauldron('L')
skirt('Pilgrim tunic','charcoal',bottom=.70)
belt(); pouch(-.13,.99)
for side in ['L','R']: limb(side,'charcoal'); boots(side)
rings('Kettle helmet crown',[(0,.01,1.735,.111,.104),(0,.015,1.795,.107,.098),
      (0,.023,1.835,.078,.069),(0,.023,1.856,.038,.037)],'iron','Head',n=16)
rings('Wide kettle brim',[(0,0,1.738,.114,.108),(0,-.008,1.713,.184,.164),
                         (0,-.008,1.706,.184,.164)],'iron','Head',n=20,caps=False)
for i in range(8):
    a=i*math.tau/8
    cube('Helmet rivet',(.104*math.sin(a),.01-.095*math.cos(a),1.75),(.012,.012,.012),'brass','Head',.002)
rings('Pilgrim flask',[(.15,-.14,.90,.03,.025),(.15,-.14,.94,.037,.028),
      (.15,-.14,.99,.03,.024),(.15,-.14,1.015,.015,.015)],'brass','Hips',n=8)
cube('Flask stopper',(.15,-.14,1.024),(.033,.03,.023),'wood','Hips')
strap('Flask belt loop',(.15,-.143,1.10),(.15,-.18,.97),.017,'leather','Hips')

CURRENT=KEEPER
hood(); skirt('Green long coat','moss',bottom=.48,width=.205,depth=.155)
rings('Green coat torso',[(0,0,1.055,.176,.132),(0,0,1.15,.179,.137),
      (0,-.006,1.28,.224,.158),(0,0,1.39,.244,.145),
      (0,0,1.465,.23,.128),(0,0,1.51,.10,.09)],'moss','Chest',n=20)
for side,s in [('L',1),('R',-1)]:
    limb(side,'moss'); boots(side)
    tube('Calf puttee '+side,(s*.13,-.008,.50),(s*.14,0,.27),.069,.062,'wrap','Shin.'+side,n=8)
    for i in range(5):
        rings('Wrap band '+side+str(i),[(s*.135,0,.28+i*.039,.064,.064),
                                     (s*.135,0,.29+i*.039,.065,.065)],'wrap','Shin.'+side,n=8,caps=False)
strap('Apron neck loop',(-.105,-.175,1.46),(-.075,-.198,1.25),.025,'leather','Chest')
strap('Apron neck loop R',(.105,-.175,1.46),(.075,-.198,1.25),.025,'leather','Chest')
mesh('Leather apron bib',[(-.10,-.184,1.365),(0,-.199,1.365),(.10,-.184,1.365),
    (-.125,-.164,1.08),(0,-.184,1.08),(.125,-.164,1.08)],[(3,4,1,0),(4,5,2,1)],'leather','Chest')
apron=mesh('Draped leather work apron',[(-.13,-.158,1.08),(0,-.179,1.08),(.13,-.158,1.08),
    (-.145,-.190,.84),(0,-.214,.84),(.145,-.190,.84),
    (-.143,-.202,.59),(-.053,-.22,.56),(.055,-.219,.565),(.143,-.202,.60)],
    [(0,1,4,3),(1,2,5,4),(3,4,7,6),(4,5,9,8,7)],'leather','Hips')
for p in apron.data.polygons:p.flip();p.use_smooth=True
m=apron.modifiers.new('Stable cloth triangulation','TRIANGULATE')
m=apron.modifiers.new('Apron thickness','SOLIDIFY');m.thickness=.004
belt(); pouch(-.15,.99)
strap('Pick shoulder sling',(-.18,-.205,1.46),(.15,-.205,1.08),.037,'leather','Chest')
for s in [-1,1]:
    # Square cloth repair patches, with contrasting stitch marks.
    x=s*.17
    cube('Coat repair patch',(x,-.09,.66),(.07,.012,.08),'moss','Hips')
    for k in range(3): cube('Patch stitch',(x-.027+k*.025,-.099,.69),(.012,.006,.005),'wrap','Hips')
    # Visible stitched reinforcement on the outside of the sleeve.
    patch=mesh('Stitched sleeve repair',[(s*.252,-.099,1.37),(s*.303,-.096,1.355),
        (s*.32,-.087,1.295),(s*.272,-.101,1.31)],[(0,1,2,3)],'moss','UpperArm.'+('L' if s>0 else 'R'))
    for k in range(4):
        z=1.32+k*.012
        line('Sleeve repair stitches',[(s*.27,-.107,z),(s*.282,-.108,z+.002)],
            .0015,'wrap','UpperArm.'+('L' if s>0 else 'R'),n=4)

CURRENT=KNIGHT
breastplate(True)
for side,s in [('L',1),('R',-1)]:
    limb(side,'charcoal',True); boots(side,True); pauldron(side,True)
    upper='Forearm.'+side; a,b=BONES[upper]
    tube('Braced vambrace '+side,a.lerp(b,.15),a.lerp(b,.90),.078,.056,'iron',upper,n=12)
    x=s*.125
    ob=mesh('Pointed knee cop '+side,[(x,-.083,.605),(x-.092,-.068,.54),
        (x,-.132,.535),(x+.092,-.068,.54),(x,-.089,.465)],
        [(0,1,2),(0,2,3),(1,4,2),(2,4,3)],'iron','Shin.'+side)
    m=ob.modifiers.new('Knee plate thickness','SOLIDIFY');m.thickness=.006
    vs=[];n=10
    for z,rx,ry in [(.205,.063,.073),(.31,.074,.09),(.425,.081,.092),(.48,.073,.085)]:
        for i in range(n+1):
            a=-1.65+i/n*3.3
            vs.append((s*.137+rx*math.sin(a),-.003-ry*math.cos(a),z))
    ob=mesh('Contoured shin plate '+side,vs,[(j*(n+1)+i,j*(n+1)+i+1,
        (j+1)*(n+1)+i+1,(j+1)*(n+1)+i) for j in range(3) for i in range(n)],'iron','Shin.'+side)
    for p in ob.data.polygons:p.use_smooth=True
    m=ob.modifiers.new('Greave shell thickness','SOLIDIFY');m.thickness=.006
    line('Greave medial ridge '+side,[(s*.137,-.079,.21),(s*.137,-.104,.36),
        (s*.137,-.094,.475)],.004,'edge','Shin.'+side)
skirt('Penitent ochre split tabard','ochre',bottom=.58,width=.22,depth=.155)
skirt('Plate fauld','iron',top=1.105,bottom=.89,width=.225,depth=.151)
# Gorget and closed helmet leave a true gap at the visor slit.
rings('Articulated gorget',[(0,0,1.47,.135,.11),(0,0,1.54,.085,.085),
      (0,0,1.59,.080,.08)],'iron','Neck',n=10,caps=False)
rings('Black helmet interior',[(0,0,1.60,.083,.080),(0,0,1.81,.083,.08)],'black','Head',n=8)
for piece in [rings('Closed helm jaw',[(0,0,1.585,.073,.078),(0,-.009,1.62,.101,.108),
      (0,-.013,1.685,.11,.123),(0,-.01,1.71,.111,.124)],'iron','Head',n=12),
    rings('Closed helm brow',[(0,-.01,1.72,.114,.124),(0,-.004,1.78,.112,.116),
      (0,.003,1.835,.083,.081),(0,.003,1.867,.033,.03)],'iron','Head',n=12)]:
    for p in piece.data.polygons:p.use_smooth=False
mesh('Helmet keel',[(-.008,-.105,1.725),(0,-.119,1.725),(.008,-.105,1.725),
      (0,-.111,1.80),(0,-.066,1.855)],[(0,1,3),(1,2,3),(0,3,4),(3,2,4)],'edge','Head')
mesh('Visor angular nose',[(-.028,-.135,1.708),(0,-.154,1.705),(.028,-.135,1.708),
    (-.021,-.125,1.635),(0,-.144,1.627),(.021,-.125,1.635)],
    [(0,1,4,3),(1,2,5,4)],'iron','Head')
for s in [-1,1]:
    line('Visor brow edge',[(0,-.138,1.724),(s*.06,-.122,1.729),
        (s*.097,-.079,1.733)],.0035,'edge','Head')
for i in range(3):
    cube('Helm breathing hole',(.052+i*.015,-.124+i*.006,1.645),(.005,.006,.005),'black','Head')
# Rope cincture, including two visible hanging tails.
pts=[(.195*math.sin(i*math.tau/24),-.165*math.cos(i*math.tau/24),1.085+.006*math.sin(i*1.6)) for i in range(25)]
line('Penitent rope cincture',pts,.012,'wrap','Hips')
line('Rope tail L',[(-.02,-.186,1.08),(-.04,-.215,.99),(-.025,-.223,.81)],.012,'wrap','Hips')
line('Rope tail R',[(.02,-.186,1.08),(.05,-.215,.98),(.04,-.223,.85)],.012,'wrap','Hips')
ring('Rope knot',(0,-.186,1.08),.024,.010,'wrap','Hips',plane='XZ',n=8)
tube('Wax seal',(.17,-.16,.94),(.17,-.175,.94),.034,.034,'wax','Hips',n=10)
strap('Seal parchment',(.17,-.16,.94),(.17,-.17,.83),.035,'wrap','Hips')

# Weapons are built relative to a hand grip, then attached through weights to
# the same hand bone. Separate collections make swaps explicit in Blender.
CURRENT=SWORD
x,y,z=-.39,-.078,.92
tube('Sword leather grip',(x,y,z-.075),(x,y,z+.075),.021,.021,'leather','Hand.R',n=8)
cube('Sword crossguard',(x,y,z-.095),(.20,.035,.027),'edge','Hand.R',.006)
cube('Sword pommel',(x,y,z+.095),(.041,.036,.040),'iron','Hand.R',.009)
mesh('Pilgrim blade',[(x-.035,y,z-.11),(x,y-.011,z-.11),(x+.035,y,z-.11),
     (x-.026,y,z-.64),(x,y-.011,z-.64),(x+.026,y,z-.64),(x,y,z-.76),
     (x,y+.011,z-.11),(x,y+.011,z-.64)],
     [(0,1,4,3),(1,2,5,4),(3,4,6),(4,5,6),(2,7,8,5),(7,0,3,8),(5,8,6),(8,3,6)],'edge','Hand.R')
# Shield faces forward and sits off the left forearm, not inside the palm.
sx,sy,sz=.425,-.12,1.10
for i in range(7):
    xx=(i-3)*.047; half=math.sqrt(max(0,.182**2-xx**2))
    cube('Shield plank '+str(i),(sx+xx,sy,sz),(.045,.033,2*half),'wood','Forearm.L',.003)
pts=[(sx+.185*math.sin(i*math.tau/16),sy-.005,sz+.185*math.cos(i*math.tau/16)) for i in range(17)]
line('Shield iron rim',pts,.016,'iron','Forearm.L',n=6)
tube('Shield central boss',(sx,sy-.018,sz),(sx,sy-.055,sz),.045,.028,'iron','Forearm.L',n=8)

CURRENT=TOOLS
sx,sy=-.39,-.07
tube('Grave spade ash handle',(sx,sy,.23),(sx,sy,1.13),.019,.022,'wood','Hand.R',n=8)
cube('Spade grip crosspiece',(sx,sy,1.13),(.115,.036,.035),'wood','Hand.R',.007)
for s in [-1,1]: tube('Spade D handle',(sx+s*.048,sy,1.13),(sx+s*.028,sy,1.02),.010,.010,'iron','Hand.R',n=6)
mesh('Grave spade blade',[(sx-.082,sy,.29),(sx+.082,sy,.29),(sx+.075,sy-.018,.11),
      (sx+.045,sy-.028,.055),(sx,sy-.03,.031),(sx-.045,sy-.028,.055),
      (sx-.075,sy-.018,.11),(sx,sy-.018,.24)],
      [(0,1,7),(1,2,3,7),(3,4,7),(4,5,7),(5,6,0,7)],'iron','Hand.R')
cube('Spade tread',(sx,sy,.282),(.19,.035,.018),'edge','Hand.R',.004)
# Lantern hangs from the left hand with modeled cage, candle and handle.
lx,ly,lz=.39,-.075,.68
for zz,r in [(lz-.085,.066),(lz+.105,.065)]:
    rings('Lantern metal cap',[(lx,ly,zz-.012,r*.85,r*.85),(lx,ly,zz,r,r),
          (lx,ly,zz+.018,r*.82,r*.82)],'brass','Hand.L',n=8)
for i in range(4):
    a=math.pi/4+i*math.pi/2; xx=lx+.048*math.cos(a); yy=ly+.048*math.sin(a)
    tube('Lantern iron bar',(xx,yy,lz-.08),(xx,yy,lz+.11),.006,.006,'iron','Hand.L',n=5)
ring('Lantern handle',(lx,ly,lz+.18),.055,.007,'iron','Hand.L',plane='XZ')
tube('Lantern candle',(lx,ly,lz-.07),(lx,ly,lz+.05),.017,.017,'candle','Hand.L',n=8)
rings('Candle flame',[(lx,ly,lz+.05,.012,.012),(lx,ly,lz+.07,.008,.008),
      (lx+.004,ly,lz+.09,.001,.001)],'candle','Hand.L',n=6)
# Functional key ring and individual key teeth.
ring('Cemetery key ring',(.08,-.175,1.025),.034,.006,'iron','Hips',plane='XZ')
for i in range(3):
    kx=.05+i*.028
    ring('Key bow',(kx,-.18,.996),.012,.004,'brass','Hips',plane='XZ',n=8)
    tube('Key shaft',(kx,-.18,.985),(kx,-.18,.91-i*.012),.004,.004,'brass','Hips',n=5)
    cube('Key bit',(kx+.009,-.18,.919-i*.012),(.022,.010,.012),'brass','Hips')
for i in range(3):
    ring('Coiled work rope',(.19,-.06,.98),.055+i*.009,.006,'wrap','Hips',plane='XZ',n=12)
# Back-mounted grave pick is kept clear of cape/outfit surfaces.
tube('Back pick handle',(-.18,.19,.91),(.19,.19,1.59),.018,.021,'wood','Chest',n=8)
line('Grave pick iron head',[(.02,.19,1.59),(.11,.19,1.64),(.19,.19,1.66),
      (.27,.19,1.64),(.36,.19,1.59)],.020,'iron','Chest',n=6)

def weapon_transform(collection_obj,origin,axis):
    # Weapons are built upright around (0,0,0); orient into the two-hand grip.
    q=Vector((0,0,1)).rotation_difference(Vector(axis).normalized())
    for ob in collection_obj.objects:
        if ob.type!='MESH': continue
        for v in ob.data.vertices: v.co=q@v.co+Vector(origin)
        # UVs intentionally remain in authored local weapon coordinates.

CURRENT=HAMMER
tube('Hammer ash haft',(0,0,-.60),(0,0,.65),.022,.026,'wood','Hand.R',n=8)
for i in range(9):
    rings('Hammer grip binding',[(0,0,-.18+i*.029,.027,.027),(0,0,-.166+i*.029,.027,.027)],'leather','Hand.R',n=8)
cube('Hammer pommel',(0,0,-.60),(.058,.058,.055),'iron','Hand.R',.008)
cube('Cathedral hammer head',(0,0,.62),(.31,.135,.19),'iron','Hand.R',.016)
for x in [-.14,.14]: cube('Hammer striking cap',(x,0,.62),(.06,.17,.23),'edge','Hand.R',.009)
for x in [-.07,.055]:
    cube('Hammer buttress rib',(x,-.078,.62),(.025,.018,.22),'edge','Hand.R',.004)
mesh('Hammer rear pick',[(.05,.01,.71),(.09,.01,.72),(.07,.01,.87),(-.02,.01,.91),
     (.05,-.04,.71),(.09,-.04,.72),(.07,-.025,.87)],[(0,1,2,3),(4,6,5),(0,4,5,1),(1,5,6,2),(2,6,3),(3,6,4,0)],'iron','Hand.R')
weapon_transform(HAMMER,(-.39,-.075,.92),(.63,-.06,.78))

CURRENT=GREAT
tube('Greatsword two-hand grip',(0,0,-.27),(0,0,.04),.023,.025,'leather','Hand.R',n=8)
for i in range(9):
    rings('Greatsword grip wrap',[(0,0,-.25+i*.031,.026,.026),(0,0,-.243+i*.031,.026,.026)],'leather','Hand.R',n=8)
cube('Greatsword steel pommel',(0,0,-.30),(.063,.049,.072),'iron','Hand.R',.013)
line('Gothic crossguard',[(-.18,0,-.015),(-.13,0,.035),(0,0,.065),(.13,0,.035),(.18,0,-.015)],.023,'iron','Hand.R',n=6)
# Diamond-section blade with a separate dark central fuller, 1.04m blade.
vs=[]
for zz,w in [(.075,.052),(.20,.055),(.86,.038),(1.08,.023)]:
    vs += [(-w,0,zz),(0,-.013,zz),(w,0,zz),(0,.013,zz)]
vs.append((0,0,1.19))
fs=[]
for j in range(3):
    for i in range(4): fs.append((j*4+i,j*4+(i+1)%4,(j+1)*4+(i+1)%4,(j+1)*4+i))
for i in range(4):fs.append((12+i,12+(i+1)%4,16))
mesh('Greatsword forged blade',vs,fs,'edge','Hand.R')
mesh('Greatsword recessed fuller',[(-.009,-.0135,.18),(.009,-.0135,.18),
     (.006,-.0135,.93),(0,-.0135,1.02),(-.006,-.0135,.93)],[(0,1,2,3,4)],'iron','Hand.R')
weapon_transform(GREAT,(-.39,-.075,.92),(.55,-.05,.83))

# A contact-free asset source at origin; each scene links only its outfit.
VARIANTS=[('cathedral-pilgrim',PILGRIM,SWORD),('grave-keeper',KEEPER,TOOLS),
          ('penitent-hammer',KNIGHT,HAMMER),('penitent-greatsword',KNIGHT,GREAT)]
ALL_MODULES=[COMMON,PILGRIM,KEEPER,KNIGHT,SWORD,TOOLS,HAMMER,GREAT]

def aim_pose(rig,name,direction):
    pb=rig.pose.bones[name]
    matrix=pb.matrix.copy()
    q=(matrix.to_quaternion()@Vector((0,1,0))).rotation_difference(Vector(direction).normalized())
    matrix=q.to_matrix().to_4x4()@matrix
    matrix.translation=pb.head
    pb.matrix=matrix
    bpy.context.view_layer.update()

def two_hand_pose(rig, greatsword=False, relaxed=False):
    # Hand.R remains near its rest position; bring it and left hand to a shared
    # chest-height grip. Align both arms using analytic 2-bone reach, no live IK
    # constraints exported. The weapon then follows the right hand's skin.
    targets={'R':Vector((-.13,-.30,1.075)),'L':Vector((.035,-.315,1.24))}
    if greatsword:
        # Right hand near the guard, left lower on the long grip.
        targets={'R':Vector((.10,-.285,1.33)),'L':Vector((-.02,-.275,1.15))}
    if relaxed:
        targets={'R':Vector((-.355,-.115,.994)),'L':Vector((.36,-.11,1.02))}
    for side in ['R','L']:
        upper=rig.pose.bones['UpperArm.'+side]
        fore=rig.pose.bones['Forearm.'+side]
        shoulder=upper.head.copy(); target=targets[side]
        l1=upper.length; l2=fore.length
        d=(target-shoulder); length=min(d.length,l1+l2-.001); direction=d.normalized()
        along=(l1*l1-l2*l2+length*length)/(2*length)
        height=math.sqrt(max(0,l1*l1-along*along))
        pole=Vector(((-1 if side=='R' else 1),-.05,-.3))
        pole=(pole-direction*pole.dot(direction)).normalized()
        elbow=shoulder+direction*along+pole*height
        aim_pose(rig,'UpperArm.'+side,elbow-shoulder)
        aim_pose(rig,'Forearm.'+side,target-elbow)
        # Retain hand's original world orientation: weapon axes don't drift
        # when its parent forearm is brought across the chest.
        pb=rig.pose.bones['Hand.'+side]
        matrix=rig.data.bones['Hand.'+side].matrix_local.copy()
        matrix.translation=pb.head
        pb.matrix=matrix
        bpy.context.view_layer.update()

def make_scene(slug,outfit,weapon,index):
    sc=bpy.data.scenes.new(f'{index:02} • '+slug.replace('-',' ').title())
    sc.unit_settings.system='METRIC'
    sc['outfit']=slug
    sc['note']='Editable original model. Outfit meshes share data with Modular source; rig poses are independent.'
    rig=RIG.copy(); rig.data=RIG.data.copy(); rig.name='AshenRig_'+slug
    col=bpy.data.collections.new(slug+' • character')
    sc.collection.children.link(col); col.objects.link(rig)
    for source in [COMMON,outfit,weapon]:
        for ob in source.objects:
            if ob.type!='MESH': continue
            cp=ob.copy(); cp.data=ob.data; cp.name=slug+' • '+ob.name
            cp['module']=source.name
            col.objects.link(cp); cp.parent=rig
            for mod in cp.modifiers:
                if mod.type=='ARMATURE':mod.object=rig
    bpy.context.window.scene=sc
    if slug.startswith('penitent'):two_hand_pose(rig,slug.endswith('greatsword'))
    else:two_hand_pose(rig,relaxed=True)
    return sc,rig,col

def idle_action(rig,slug):
    # Demonstration breathing only, deliberately not advertised as combat clips.
    rig.animation_data_create()
    action=bpy.data.actions.new('PreviewIdle • '+slug)
    rig.animation_data.action=action
    for b in rig.pose.bones:
        b.rotation_mode='QUATERNION'
        base=b.rotation_quaternion.copy()
        location=b.location.copy(); scale=b.scale.copy()
        for f,amt in [(1,0),(25,.012),(49,0)]:
            b.rotation_quaternion=base.copy()
            if b.name in ['Chest','Head','Cape.01','Cape.02']:
                b.rotation_quaternion=base @ Quaternion((1,0,0),amt)
            b.location=location; b.scale=scale
            b.keyframe_insert('rotation_quaternion',frame=f,group=b.name)
            b.keyframe_insert('location',frame=f,group=b.name)
            b.keyframe_insert('scale',frame=f,group=b.name)
        b.rotation_quaternion=base
    action.use_fake_user=True

def setup_render(sc):
    sc.render.engine='CYCLES'
    sc.cycles.samples=32
    sc.cycles.use_denoising=True
    sc.cycles.preview_samples=16
    sc.cycles.use_preview_denoising=True
    sc.render.resolution_x=900; sc.render.resolution_y=1000
    sc.render.resolution_percentage=100
    sc.world=bpy.data.worlds.new(sc.name+' world')
    sc.world.use_nodes=True
    sc.world.node_tree.nodes['Background'].inputs[0].default_value=(.12,.135,.15,1)
    sc.world.node_tree.nodes['Background'].inputs[1].default_value=.35
    sc.view_settings.view_transform='AgX'
    sc.render.image_settings.file_format='PNG'
    sc.render.film_transparent=False

def camera(sc,position,target,ortho):
    data=bpy.data.cameras.new('Portrait camera')
    ob=bpy.data.objects.new('Portrait camera',data); sc.collection.objects.link(ob)
    ob.location=position
    ob.rotation_euler=(Vector(target)-ob.location).to_track_quat('-Z','Y').to_euler()
    data.type='ORTHO'; data.ortho_scale=ortho; data.lens=65
    sc.camera=ob
    return ob

def lights(sc):
    for name,loc,power,size,color in [
        ('Key',(-3,-4,5),560,3,(1,.86,.72)),
        ('Fill',(3,-2,3),190,3,(.70,.79,1)),
        ('Rim',(1,3,4),650,3,(1,.75,.49))]:
        data=bpy.data.lights.new(name,'AREA'); data.energy=power; data.shape='DISK'; data.size=size;data.color=color
        ob=bpy.data.objects.new(name,data); sc.collection.objects.link(ob); ob.location=loc
        ob.rotation_euler=(Vector((0,0,1))-ob.location).to_track_quat('-Z','Y').to_euler()

def ground(sc):
    data=bpy.data.meshes.new('Studio ground'); data.from_pydata([(-200,-200,-.004),(200,-200,-.004),(200,200,-.004),(-200,200,-.004)],[],[(0,1,2,3)])
    ob=bpy.data.objects.new('Studio ground',data);sc.collection.objects.link(ob)
    mat=bpy.data.materials.get('Studio') or bpy.data.materials.new('Studio')
    mat.diffuse_color=(.045,.042,.038,1);mat.use_nodes=True
    mat.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=(.045,.042,.038,1)
    mat.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value=.93
    ob.data.materials.append(mat)

def export_variant(sc,rig,col,slug):
    # Keep the .blend's small editable parts, but merge export copies into
    # body/outfit/equipment modules. All color already lives in the shared atlas.
    temporary=bpy.data.scenes.new('Temporary export')
    bpy.context.window.scene=temporary
    export_rig=rig.copy();export_rig.data=rig.data.copy()
    temporary.collection.objects.link(export_rig)
    export_rig.data.pose_position='REST'
    groups={}
    for ob in col.objects:
        if ob.type!='MESH':continue
        cp=ob.copy();cp.data=ob.data.copy();cp.parent=export_rig
        temporary.collection.objects.link(cp)
        for modifier in cp.modifiers:
            if modifier.type=='ARMATURE':modifier.object=export_rig
        for slot in cp.material_slots:
            name=slot.material.name
            slot.material=MATS['iron' if name in ('iron','edge','brass') else
                               'candle' if name=='candle' else 'charcoal']
        bpy.ops.object.select_all(action='DESELECT')
        cp.select_set(True);bpy.context.view_layer.objects.active=cp
        for modifier in list(cp.modifiers):
            if modifier.type!='ARMATURE':bpy.ops.object.modifier_apply(modifier=modifier.name)
        groups.setdefault(ob['module'],[]).append(cp)
    for module,objects in groups.items():
        bpy.ops.object.select_all(action='DESELECT')
        for ob in objects:ob.select_set(True)
        bpy.context.view_layer.objects.active=objects[0]
        bpy.ops.object.join()
        objects[0].name=module
    export_rig.data.pose_position='POSE'
    temporary.frame_set(1)
    bpy.ops.object.select_all(action='SELECT')
    bpy.context.view_layer.objects.active=export_rig
    bpy.ops.export_scene.gltf(filepath=str(OUT/(slug+'.glb')),export_format='GLB',
        use_selection=True,use_active_scene=True,export_animations=True,export_animation_mode='ACTIVE_ACTIONS',
        export_skins=True,export_yup=True,export_apply=False,
        export_materials='EXPORT',export_extras=True)
    bpy.context.window.scene=sc
    for ob in list(temporary.objects):
        data=ob.data
        bpy.data.objects.remove(ob,do_unlink=True)
        if data.users==0:
            if isinstance(data,bpy.types.Mesh):bpy.data.meshes.remove(data)
            elif isinstance(data,bpy.types.Armature):bpy.data.armatures.remove(data)
    bpy.data.scenes.remove(temporary)

report={'generator':'scripts/buildAshenCharacter.py','source':'ashen-parish-modular-v2.blend',
        'revision':2,'units':'metres','forward':'-Y',
        'atlas':'ashen-atlas.png','atlas_size':[512,512],
        'animation_status':'Shared original rig and breathing preview. Combat/locomotion retargeting not yet done.',
        'variants':[]}
scenes=[]
for index,(slug,outfit,weapon) in enumerate(VARIANTS,1):
    sc,rig,col=make_scene(slug,outfit,weapon,index)
    sc.render.fps=24;sc.frame_start=1;sc.frame_end=49
    idle_action(rig,slug);sc.frame_set(1)
    for ob in sc.objects: ob.select_set(False)
    for ob in col.objects: ob.select_set(True)
    bpy.context.view_layer.objects.active=rig
    export_variant(sc,rig,col,slug)
    tris=sum(sum(len(p.vertices)-2 for p in ob.data.polygons) for ob in col.objects if ob.type=='MESH')
    report['variants'].append({'id':slug,'glb':slug+'.glb','triangles_before_edge_modifiers':tris,
        'mesh_parts':sum(ob.type=='MESH' for ob in col.objects),'bones':len(rig.data.bones)})
    sc.frame_set(1)
    setup_render(sc);camera(sc,(2.7,-5.5,2.6),(0,0,1.10 if slug.endswith('greatsword') else .99),
                            2.55 if slug.endswith('greatsword') else 2.27);lights(sc);ground(sc)
    scenes.append((slug,sc,rig,col))

# Gallery uses linked mesh data and independent rig copies. It is a render
# scene, excluded from the game exports, and the default scene on opening.
gallery=bpy.data.scenes.new('05 • All outfits • rendered lineup')
bpy.context.window.scene=gallery
for i,(slug,sc,rig,col) in enumerate(scenes):
    delta=Vector(((i-1.5)*1.20,0,0))
    newrig=rig.copy();newrig.data=rig.data.copy();newrig.animation_data_clear()
    gallery.collection.objects.link(newrig);newrig.location+=delta
    for ob in col.objects:
        if ob.type!='MESH':continue
        cp=ob.copy();gallery.collection.objects.link(cp);cp.parent=newrig
        for mod in cp.modifiers:
            if mod.type=='ARMATURE':mod.object=newrig
setup_render(gallery)
gallery.render.resolution_x=1920;gallery.render.resolution_y=960
camera(gallery,(1.0,-10,2.55),(0,0,1.02),5.4);lights(gallery);ground(gallery)
gallery['note']='Left to right: Cathedral Pilgrim, Grave Keeper, Penitent Hammer, Penitent Greatsword.'

# Keep unused source modules hidden in the default source view, selectable by
# collection checkbox. Other scenes link independent objects sharing mesh data.
bpy.context.window.scene=master
for lc in bpy.context.view_layer.layer_collection.children:
    if lc.collection in [KEEPER,KNIGHT,TOOLS,HAMMER,GREAT]:lc.exclude=True
master.unit_settings.system='METRIC'
master['instructions']='Switch scenes using the scene dropdown. 00 is the modular source; enable one OUTFIT and its WEAPON collection in the Outliner.'
text=bpy.data.texts.new('START HERE • Ashen Parish')
text.write('''ASHEN PARISH — MODULAR CHARACTER FIRST PASS

Scene dropdown:
00 Modular source: one shared body and rig; separate OUTFIT / WEAPON collections.
01 Cathedral Pilgrim: red cape, kettle helm, sword and round shield.
02 Grave Keeper: hood, green coat, spade, pick, keys, rope and candle lantern.
03 Penitent Hammer: layered armor and two-handed war hammer.
04 Penitent Greatsword: same armor, two-handed sword.
05 All outfits: rendered lineup, default opening scene.

Model units: metres; forward -Y, up +Z. All presets share mesh datablocks.
The 512px atlas is packed and also saved beside the GLBs.
All character pieces have explicit armature weights. Capes have two bones.
GLBs contain the selected outfit only and a breathing PreviewIdle clip.
Game movement/combat animations are NOT yet retargeted. These files do not
replace Casual_Male_gameplay.glb or change gameplay.
Weapons and equipment are separate named meshes. No cloth simulation.
This is a generated editable low-poly first pass, not a finished sculpt.

Rebuild: blender -b --python scripts/buildAshenCharacter.py
''')
(OUT/'manifest.json').write_text(json.dumps(report,indent=2)+'\n')
bpy.context.window.scene=gallery
for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type=='VIEW_3D':
            area.spaces.active.region_3d.view_perspective='CAMERA'
            area.spaces.active.shading.type='MATERIAL'
            area.spaces.active.shading.use_scene_lights=True
            area.spaces.active.shading.use_scene_world=True
            area.spaces.active.overlay.show_overlays=False
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'ashen-parish-modular-v2.blend'))
gallery.render.filepath=str(DOC/'blender-lineup.png')
bpy.ops.render.render(write_still=True)
for slug,sc,rig,col in scenes:
    bpy.context.window.scene=sc
    sc.render.filepath=str(DOC/(slug+'.png'))
    bpy.ops.render.render(write_still=True)
for slug,sc,rig,col in scenes[:2]:
    bpy.context.window.scene=sc
    cam=sc.camera
    cam.location=(-2.7,5.5,2.6)
    cam.rotation_euler=(Vector((0,0,.99))-cam.location).to_track_quat('-Z','Y').to_euler()
    sc.render.filepath=str(DOC/(slug+'-back.png'))
    bpy.ops.render.render(write_still=True)
print('ASHEN_BUILD_COMPLETE',json.dumps(report))
