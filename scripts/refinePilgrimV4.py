"""Refine the pilgrim's projection leaks, hilt fit and equipment attachment.

blender -b --python-exit-code 1 --python scripts/refinePilgrimV4.py
Keeps the revision-3 model and textures unchanged.
"""
from pathlib import Path
import runpy
import shutil
import math
import sys
import bpy
import numpy as np
from mathutils import Vector, Quaternion

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'public/assets/characters/ashen-parish/pilgrim-v4'
OUT.mkdir(parents=True,exist_ok=True)
for name in ['pilgrim-turnaround.png','pilgrim-side-reference.png']:
    target=OUT/name
    if not target.exists():
        shutil.copy2(ROOT/'public/assets/characters/ashen-parish/pilgrim-v3'/name,target)

def refine(g):
    mesh=g['mesh'];rod=g['rod'];rig=g['rig'];S=g['SCALE']
    X=g['X'];Z=g['Z'];IW=g['IW'];IH=g['IH'];C=g['CENTRE'];B=g['BOTTOM']
    front=g['pixels'];changed={};restrictions={}

    def record(ob,policy):
        ob['surface_policy']=policy
        changed[ob.name]=policy

    def front_material(ob,poly):
        # The first material always samples the front/rear painting. Lateral
        # material 1 sampled complete figures and therefore included their arms.
        poly.material_index=0

    def patch(ob,poly,rect,axis='x'):
        xmin=min(v.co.x for v in ob.data.vertices);xmax=max(v.co.x for v in ob.data.vertices)
        ymin=min(v.co.y for v in ob.data.vertices);ymax=max(v.co.y for v in ob.data.vertices)
        zmin=min(v.co.z for v in ob.data.vertices);zmax=max(v.co.z for v in ob.data.vertices)
        x0,x1,y0,y1=rect
        front_material(ob,poly)
        for li in poly.loop_indices:
            v=ob.data.vertices[ob.data.loops[li].vertex_index].co
            u=(v.x-xmin)/max(.001,xmax-xmin) if axis=='x' else (v.y-ymin)/max(.001,ymax-ymin)
            t=(zmax-v.z)/max(.001,zmax-zmin)
            ob.data.uv_layers.active.data[li].uv=((x0+(x1-x0)*u)/IW,1-(y0+(y1-y0)*t)/IH)

    # These regions contain only the stated surface, without the painted belt
    # equipment, hands or arms that were leaking onto unrelated geometry.
    clean_patches={
        'charcoal':(350,535,495,540),
        'sleeve':(305,329,277,314),
        'steel':(399,484,239,309),
        'leather':(358,397,397,423),
        'brass':(502,522,402,429),
    }
    for ob in list(bpy.context.scene.objects):
        if ob.type!='MESH':continue
        name=ob.name
        for poly in ob.data.polygons:
            lateral=abs(poly.normal.x)>abs(poly.normal.y)*1.12
            rear=poly.normal.y>0.05
            policy=None
            if name=='Ragged layered charcoal tunic':policy='charcoal'
            elif name=='Torso • fitted gambeson' and (lateral or rear):policy='sleeve'
            elif name in ['Corroded shaped breastplate','Rolled lower plate rim'] and lateral:policy='steel'
            elif name=='Leather waist belt' and (lateral or rear):policy='leather'
            elif name=='Supply pouch volume' and (lateral or rear):policy='leather'
            elif name=='Brass pilgrim flask' and (lateral or rear):policy='brass'
            if policy:
                patch(ob,poly,clean_patches[policy],axis='y' if lateral else 'x')
                record(ob,'clean_'+policy+'_patch')
                restrictions.setdefault(name,[]).append({'polygon':poly.index,'rect':clean_patches[policy]})

    def red_region(px,py,rear):
        row=max(160,min(529,int(round(py))))
        if rear:
            lo,hi=1195,1458
        else:
            lo,hi=295,554
        pixels=front[row,lo:hi,:]
        red=(pixels[:,0]>pixels[:,1]*1.72)&(pixels[:,1]>pixels[:,2]*1.05)&(pixels[:,0]>.055)
        candidates=np.flatnonzero(red)+lo
        if len(candidates)>8:
            # Keep UVs in the connected cloak/mantle material, rather than
            # snapping to the nearest part of a full human silhouette.
            low,high=candidates[2],candidates[-3]
            px=max(low,min(high,px))
            return px,py
        # Hem tears or deeply occluded shoulders have no clean red paint on
        # that row. A safe fold patch supplies cloth, never fingers or skin.
        return 1265+(px%1)*100,320+((py-160)%140)

    for name in ['Torn short pilgrim cape','Asymmetric rust-red shoulder mantle']:
        ob=bpy.data.objects[name]
        for poly in ob.data.polygons:
            rear=name=='Torn short pilgrim cape' or poly.normal.y>0.05
            front_material(ob,poly)
            for li in poly.loop_indices:
                v=ob.data.vertices[ob.data.loops[li].vertex_index].co
                px=C+v.x/S;py=B-v.z/S
                # Preserve the intentional front clasp, which belongs to the
                # mantle, while excluding armor/arm pixels at its side edges.
                if name.startswith('Asymmetric') and not rear and abs(px-C)<43 and py<215:
                    uv=(px/IW,1-py/IH)
                else:
                    if rear:px=IW-px
                    px,py=red_region(px,py,rear)
                    uv=(px/IW,1-py/IH)
                ob.data.uv_layers.active.data[li].uv=uv
        record(ob,'red_cloth_only_projection')

    # Seat the pommel completely inside the fist and align the guard below the
    # fingers. In v3 the long hilt rose through the wrist as a silver bracelet.
    sx=g['sx'];old_sy=g['sy'];old_sz=g['sz'];new_sy=-.006
    sword_parts=[]
    for name,limits,radius in [
        ('Sword dark leather grip',(Z(493),Z(438)),.81),
        ('Sword pommel',(Z(439),Z(432)),.62),
    ]:
        ob=bpy.data.objects[name];sword_parts.append(ob)
        oldmin=min(v.co.z for v in ob.data.vertices);oldmax=max(v.co.z for v in ob.data.vertices)
        for v in ob.data.vertices:
            v.co.x=sx+(v.co.x-sx)*radius
            v.co.y=new_sy+(v.co.y-old_sy)*radius
            v.co.z=limits[0]+(v.co.z-oldmin)/(oldmax-oldmin)*(limits[1]-limits[0])
        record(ob,'hilt_seated_in_fist')
    guard=bpy.data.objects['Sword iron crossguard'];sword_parts.append(guard)
    for v in guard.data.vertices:
        v.co.x=sx+(v.co.x-sx)*.84
        v.co.y+=new_sy-old_sy
        v.co.z+=Z(498)-(old_sz-.075)
    blade=bpy.data.objects['Straight tapered iron sword'];sword_parts.append(blade)
    oldmin=min(v.co.z for v in blade.data.vertices);oldmax=max(v.co.z for v in blade.data.vertices)
    for v in blade.data.vertices:
        v.co.x=sx+(v.co.x-sx)*.85
        v.co.y=new_sy+(v.co.y-old_sy)*.35
        v.co.z=Z(822)+(v.co.z-oldmin)/(oldmax-oldmin)*(Z(505)-Z(822))
    pivot=Vector((sx,new_sy,Z(462)));rotation=Quaternion((0,1,0),.11)
    for ob in sword_parts:
        for v in ob.data.vertices:v.co=rotation@(v.co-pivot)+pivot
        ob.data.update();ob['grip_anchor']=list(pivot)
    record(guard,'guard_below_fingers')
    record(blade,'thin_blade_and_relaxed_outward_angle')

    # Dedicated surface-only paint removes both human silhouettes and the UV
    # collapses caused by forcing a full-person projection into a garment mask.
    surface_image=bpy.data.images.load(str(OUT/'pilgrim-surface-atlas.png'));surface_image.pack()
    surface=bpy.data.materials.new('Pilgrim • clean garment surfaces');surface.use_nodes=True
    bs=surface.node_tree.nodes.get('Principled BSDF')
    tex=surface.node_tree.nodes.new('ShaderNodeTexImage');tex.image=surface_image;tex.interpolation='Closest'
    surface.node_tree.links.new(tex.outputs['Color'],bs.inputs['Base Color'])
    surface.node_tree.links.new(tex.outputs['Color'],bs.inputs['Emission Color'])
    bs.inputs['Emission Strength'].default_value=.18;bs.inputs['Roughness'].default_value=.96
    surface.use_backface_culling=False

    def surface_uv(ob,tile,n=None,only_lateral=False,above_pixel=None):
        ob.data.materials.append(surface);slot=len(ob.data.materials)-1
        col=tile%2;bottom=1-tile//2;pad=.009;span=.5-2*pad
        xmin=min(v.co.x for v in ob.data.vertices);xmax=max(v.co.x for v in ob.data.vertices)
        ymin=min(v.co.y for v in ob.data.vertices);ymax=max(v.co.y for v in ob.data.vertices)
        zmin=min(v.co.z for v in ob.data.vertices);zmax=max(v.co.z for v in ob.data.vertices)
        for poly in ob.data.polygons:
            if only_lateral and abs(poly.normal.x)<=abs(poly.normal.y)*1.12:continue
            if above_pixel is not None and B-poly.center.z/S>=above_pixel:continue
            poly.material_index=slot
            phases=[((ob.data.loops[li].vertex_index%n+n//2)%n)/n for li in poly.loop_indices] if n else []
            cap=n and len(poly.vertices)>4
            seam=n and not cap and max(phases)-min(phases)>.5
            for j,li in enumerate(poly.loop_indices):
                v=ob.data.vertices[ob.data.loops[li].vertex_index].co
                if cap:
                    u=(v.x-xmin)/max(.001,xmax-xmin)
                elif n:
                    u=phases[j]+(1 if seam and phases[j]<.5 else 0)
                else:
                    axis=1 if abs(poly.normal.x)>abs(poly.normal.y) else 0
                    u=(v[axis]-(ymin if axis else xmin))/max(.001,(ymax-ymin) if axis else (xmax-xmin))
                t=(v.z-zmin)/max(.001,zmax-zmin)
                if cap:t=(v.y-ymin)/max(.001,ymax-ymin)
                ob.data.uv_layers.active.data[li].uv=(col*.5+pad+span*u,bottom*.5+pad+span*t)
        record(ob,'surface_atlas_tile_'+str(tile)+('_lateral' if only_lateral else '_all'))

    surface_uv(bpy.data.objects['Ragged layered charcoal tunic'],1,n=48)
    surface_uv(bpy.data.objects['Asymmetric rust-red shoulder mantle'],0,n=48)
    # The old mantle crossed straight through the sleeve volume at its side
    # edge. Add real cloth tessellation and drape it outside both upper sleeves.
    from mathutils.bvhtree import BVHTree
    mantle=bpy.data.objects['Asymmetric rust-red shoulder mantle']
    bpy.context.view_layer.objects.active=mantle
    subdivision=mantle.modifiers.new('Cloth drape tessellation','SUBSURF')
    subdivision.subdivision_type='SIMPLE';subdivision.levels=1
    while mantle.modifiers.find(subdivision.name)>0:
        bpy.ops.object.modifier_move_up(modifier=subdivision.name)
    bpy.ops.object.modifier_apply(modifier=subdivision.name)
    profiles=[]
    for side,sign in [('L',1),('R',-1)]:
        vertices=bpy.data.objects['Folded tunic sleeve '+side].data.vertices
        rows=[]
        for start in range(0,len(vertices),16):
            ring=[v.co for v in vertices[start:start+16]]
            xs=[v.x for v in ring];ys=[v.y for v in ring]
            rows.append((ring[0].z,(min(xs)+max(xs))/2,(min(ys)+max(ys))/2,
                         (max(xs)-min(xs))/2,(max(ys)-min(ys))/2))
        profiles.append((sign,np.array(sorted(rows))))
    drape_adjusted=0
    for _ in range(2):
        for vertex in mantle.data.vertices:
            for sign,rows in profiles:
                z=vertex.co.z
                if not rows[0,0]-.052<=z<=rows[-1,0]+.052:continue
                closest_z=max(rows[0,0],min(rows[-1,0],z))
                cx,cy,rx,ry=[float(np.interp(closest_z,rows[:,0],rows[:,i])) for i in range(1,5)]
                dx=(vertex.co.x-cx)/rx;dy=(vertex.co.y-cy)/ry
                dz=(z-closest_z)/.04
                radius=math.sqrt(dx*dx+dy*dy+dz*dz);target=1+.014/min(rx,ry)
                if radius<target:
                    if radius<.001:dx,dy,radius=sign,0,1
                    vertex.co.x=cx+rx*dx*target/radius
                    vertex.co.y=cy+ry*dy*target/radius
                    vertex.co.z=closest_z+.04*dz*target/radius
                    drape_adjusted+=1
    mantle.data.update();record(mantle,'surface_atlas_tile_0_draped_outside_sleeves')
    # Cape is a rectangular drape grid, not a tube: map its true column fraction.
    cape=bpy.data.objects['Torn short pilgrim cape'];surface_uv(cape,0)
    for poly in cape.data.polygons:
        for li in poly.loop_indices:
            index=cape.data.loops[li].vertex_index
            cape.data.uv_layers.active.data[li].uv=(.009+.482*(index%33)/32,
                                                   .509+.482*(1-index//33/10))
    for side in ['L','R']:
        surface_uv(bpy.data.objects['Dirty spiral calf wraps '+side],3,n=16)
        surface_uv(bpy.data.objects['Long leather glove cuff '+side],2,n=12)
        palm=bpy.data.objects['Closed leather glove '+side]
        # A narrower wrist fits the reference contour. The previous broad top
        # row interpolated through gray background pixels between two UV rows.
        if side=='R':
            for v in palm.data.vertices:
                py=B-v.co.z/S
                if py<451:
                    t=max(0,min(1,(451-py)/25))
                    v.co.x-=4*S*t
                    centre=X(280)-4*S*t
                    v.co.x=centre+(v.co.x-centre)*(1-.18*t)
        for v in palm.data.vertices:v.co.y*=.75
        surface_uv(palm,2,n=12)
        wrist=bpy.data.objects['Exposed wrist '+side]
        top=max(v.co.z for v in wrist.data.vertices)
        for v in wrist.data.vertices:
            if abs(v.co.z-top)<1e-6:v.co.z+=S*(4 if side=='R' else 2)
        wrist.data.update();record(wrist,'skin_overlaps_sleeve_end_no_air_gap')
    surface_uv(bpy.data.objects['Torso • fitted gambeson'],1,n=16)
    for side in ['L','R']:
        # These rows sit beneath the real mantle/pauldron. Side photographs
        # show the covering garment here, which used to print a second cape
        # panel directly onto the sleeve when viewed from the opposite side.
        surface_uv(bpy.data.objects['Folded tunic sleeve '+side],1,n=16,above_pixel=285)
        surface_uv(bpy.data.objects['Baggy trousers '+side],1,n=16,above_pixel=570)
    surface_uv(bpy.data.objects['Leather waist belt'],2,n=24)
    surface_uv(bpy.data.objects['Supply pouch volume'],2,n=12,only_lateral=True)

    # The lower helmet band must not project the face from immediately beneath
    # the reference brim. Give its band and underside actual dark iron paint.
    brim=bpy.data.objects['Downturned iron helmet brim']
    brim.data.materials.append(g['IRON']);iron_slot=len(brim.data.materials)-1
    for poly in brim.data.polygons:
        if 16<=poly.index<32 or poly.normal.z<-.5:
            poly.material_index=iron_slot
            for li in poly.loop_indices:
                v=brim.data.vertices[brim.data.loops[li].vertex_index].co
                brim.data.uv_layers.active.data[li].uv=(.02+.21*(v.x-X(354))/(X(532)-X(354)),.10)
    record(brim,'dark_iron_rim_no_face_projection')

    # Model the fingers instead of relying on a painted fist to suggest a grip.
    g['CURRENT']=g['BODY'];rod.__globals__['CURRENT']=g['BODY']
    for side,px,sign in [('R',275,-1),('L',611,1)]:
        centre=X(px)
        for finger in range(4):
            z=Z(477)+finger*.019
            points=[(centre+sign*.034,-.006,z),(centre+sign*.035,-.032,z),
                    (centre+sign*.013,-.051,z),(centre-sign*.020,-.047,z),
                    (centre-sign*.026,-.025,z)]
            for i in range(4):
                ob=rod('Curled glove finger '+side,points[i],points[i+1],.0085,.0085,
                       g['LEATHER'],2,'Hand.'+side,n=6)
                surface_uv(ob,2)
        points=[(centre-sign*.029,-.010,Z(442)),(centre-sign*.037,-.041,Z(451)),
                (centre-sign*.020,-.058,Z(460))]
        for i in range(2):
            ob=rod('Glove thumb '+side,points[i],points[i+1],.012,.011,
                   g['LEATHER'],2,'Hand.'+side,n=7)
            surface_uv(ob,2)
        palm.data.update();record(palm,'clean_leather_palm_with_modeled_fingers')
    g['CURRENT']=g['BODY'];mesh.__globals__['CURRENT']=g['BODY']
    neck=g['loft']('Dark neck lining beneath hood',[(149,425,463,.052,.052),
        (174,422,468,.055,.054),(191,415,478,.070,.064)],'Neck',n=16)
    surface_uv(neck,1,n=16)

    # Replace the painted/stretched mantle clasp with a physical strap and
    # brass buckle, so it has only one position at every viewing angle.
    g['CURRENT']=g['CLOTH'];mesh.__globals__['CURRENT']=g['CLOTH']
    strap=g['front_panel']('Mantle clasp leather strap',[(409,190),(492,188),(496,208),(412,211)],
                            -.151,'Chest',g['PAINT'],.004)
    mantle_tree=BVHTree.FromObject(bpy.data.objects['Asymmetric rust-red shoulder mantle'],
                                 bpy.context.evaluated_depsgraph_get())
    # Tuck the upper cape inside the mantle wherever their silhouettes overlap.
    cape=bpy.data.objects['Torn short pilgrim cape']
    for v in cape.data.vertices:
        if B-v.co.z/S<276:
            hit,_,_,_=mantle_tree.ray_cast(Vector((v.co.x,1,v.co.z)),Vector((0,-1,0)))
            if hit is not None and hit.y>0:v.co.y=min(v.co.y,hit.y-.008)
    cape.data.update();record(cape,'surface_atlas_tile_0_and_tucked_upper_edge')
    def fitted_depth(x,z,offset):
        hit,_,_,_=mantle_tree.ray_cast(Vector((x,-1,z)),Vector((0,1,0)))
        return hit.y-offset if hit is not None else -.15-offset
    for v in strap.data.vertices:v.co.y=fitted_depth(v.co.x,v.co.z,.005)
    strap.data.update()
    surface_uv(strap,2)
    brass=g['material']('Mantle buckle • aged brass',metal=True,legacy=True)
    points=[g['P'](442,190,-.169),g['P'](466,190,-.169),
            g['P'](466,208,-.169),g['P'](442,208,-.169),g['P'](442,190,-.169)]
    for i in range(4):
        ob=rod('Mantle brass buckle frame',points[i],points[i+1],.0035,.0035,brass,9,'Chest',n=6)
        for v in ob.data.vertices:v.co.y=fitted_depth(v.co.x,v.co.z,.012)+(v.co.y+.169)
        ob.data.update()
    ob=rod('Mantle buckle pin',g['P'](441,199,-.174),g['P'](466,199,-.174),.002,.002,brass,9,'Chest',n=5)
    for v in ob.data.vertices:v.co.y=fitted_depth(v.co.x,v.co.z,.017)+(v.co.y+.174)
    ob.data.update()
    record(strap,'physical_mantle_clasp_no_duplicated_buckle')

    # Connect the projected accessories to their supporting belt. Removing the
    # painted clothing layer also removed the old painted cords and hangers.
    g['CURRENT']=g['GEAR'];rod.__globals__['CURRENT']=g['GEAR']
    belt_tree=BVHTree.FromObject(bpy.data.objects['Leather waist belt'],bpy.context.evaluated_depsgraph_get())
    def belt_anchor(px,py):
        p=Vector(g['P'](px,py,-1))
        hit,_,_,_=belt_tree.ray_cast(p,Vector((0,1,0)))
        return (p.x,hit.y-.004 if hit is not None else -.12,p.z)
    accessory_paths=[
        ('Pouch belt loop',[belt_anchor(379,344),g['P'](379,354,-.14),g['P'](379,365,-.193)],.005),
        ('Flask belt hanger',[belt_anchor(500,350),g['P'](500,366,-.15),g['P'](500,377,-.178)],.0045),
        ('Token leather cord',[belt_anchor(463,354),g['P'](470,397,-.168),g['P'](479,435,-.185)],.0025),
    ]
    for name,path,radius in accessory_paths:
        for i in range(len(path)-1):
            ob=rod(name,path[i],path[i+1],radius,radius,g['LEATHER'],2,'Hips',n=6)
            surface_uv(ob,2);record(ob,'belt_to_accessory_connection')

    # Give the shield a real rear arm mounting, rather than leaving an air gap.
    g['CURRENT']=g['WEAPONS']
    # Helpers resolve their module globals, so change the owning dictionary too.
    rod.__globals__['CURRENT']=g['WEAPONS']
    cx,cy,cz=g['cx'],g['cy'],g['cz']
    for z in [cz-.055,cz+.055]:
        points=[(cx-.060,cy+.029,z),(cx-.041,.018,z),
                (cx+.041,.018,z),(cx+.060,cy+.029,z)]
        for i in range(3):
            ob=rod('Shield rear leather arm strap',points[i],points[i+1],.009,.009,
                   g['LEATHER'],2,'Forearm.L',n=6)
            record(ob,'physical_shield_attachment')
    # Metadata is packed into the source so the reason for each edit survives
    # outside this conversation and can be checked independently of screenshots.
    text=bpy.data.texts.new('REFINEMENT • revision 4')
    text.write('Revision 4 fixes full-figure texture leakage onto garments, hides the\n'
               'pommel inside the fist, places the guard below the fingers, thins and\n'
               'angles the blade, and adds shield arm straps. Geometry remains rigged.\n'
               'Use arm-closeup and armpit-diagnostic renders to check the reported issue.\n')
    g['REFINEMENT_REPORT']={'changes':changed,'clean_patch_sources':clean_patches,
                            'surface_atlas':'pilgrim-surface-atlas.png',
                            'mantle_drape_adjustments':drape_adjusted,
                            'regression':'Garment-only atlas on cape, mantle and tunic; pommel inside fist; dark iron helmet rim.'}

views=[
    ('three-quarter',(2.3,-6,1.95),(0,0,.94),True),
    ('arm-closeup',(2.3,-6,1.95),(-.255,-.035,1.03),True,{'scale':.85}),
    ('armpit-diagnostic',(2.3,-6,1.95),(-.255,-.035,1.03),False,
        {'scale':.85,'hide':['Folded tunic sleeve R','Exposed wrist R','Long leather glove cuff R','Closed leather glove R']}),
    ('front',(0,-6,.94),(0,0,.94),False),
    ('back',(0,6,.94),(0,0,.94),False),
    ('left-side',(6,-.15,1.4),(0,0,.94),False),
    ('right-side',(-6,-.15,1.4),(0,0,.94),False),
    ('reverse-three-quarter',(-2.3,-6,1.95),(0,0,.94),True),
    ('rear-three-quarter',(-2.3,6,1.95),(0,0,.94),False),
    ('head-closeup',(2.3,-6,1.95),(0,0,1.60),False,{'scale':.62}),
    ('boots-closeup',(2.3,-6,1.95),(0,-.02,.28),False,{'scale':.64}),
]
if '--quick' in sys.argv:views=[v for v in views if v[0] in ['three-quarter','arm-closeup','right-side']]
runpy.run_path(str(ROOT/'scripts/buildPilgrimV3.py'),init_globals={
    'ASSET_REVISION':4,'PILGRIM_REFINER':refine,'PILGRIM_RENDER_VIEWS':views},run_name='__main__')
