"""Regression checks for the visual defects reported against revision 3."""
import bpy
import runpy
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree

ROOT=Path(__file__).resolve().parents[1]
def regression(g):
    roles={'Ragged layered charcoal tunic':1,'Asymmetric rust-red shoulder mantle':0,
           'Torn short pilgrim cape':0,'Dirty spiral calf wraps L':3,'Dirty spiral calf wraps R':3,
           'Closed leather glove R':2,'Closed leather glove L':2,
           'Long leather glove cuff R':2,'Long leather glove cuff L':2,
           'Dark neck lining beneath hood':1,'Torso • fitted gambeson':1}
    for name,tile in roles.items():
        ob=bpy.data.objects[name]
        col=tile%2;bottom=1-tile//2
        for poly in ob.data.polygons:
            mat=ob.data.materials[poly.material_index]
            images=[node.image for node in mat.node_tree.nodes if node.type=='TEX_IMAGE']
            assert len(images)==1 and images[0].name.startswith('pilgrim-surface-atlas'),name
            for li in poly.loop_indices:
                u,v=ob.data.uv_layers.active.data[li].uv
                assert col*.5+.008<=u<=col*.5+.492,(name,'tile bleed',u)
                assert bottom*.5+.008<=v<=bottom*.5+.492,(name,'tile bleed',v)
    # This directly checks the wrist artifact instead of only checking file size
    # or that the rig exists. The pommel must be buried in the closed glove.
    fist=bpy.data.objects['Closed leather glove R']
    tree=BVHTree.FromObject(fist,bpy.context.evaluated_depsgraph_get())
    pommel=bpy.data.objects['Sword pommel']
    signed=[]
    for vertex in pommel.data.vertices:
        hit,normal,_,_=tree.find_nearest(vertex.co)
        signed.append((vertex.co-hit).dot(normal))
    assert max(signed)<-.002,('Pommel protrudes from glove',max(signed))
    assert pommel.vertex_groups.get('Hand.R') is not None
    guard=bpy.data.objects['Sword iron crossguard']
    finger_bottom=min(v.co.z for o in bpy.context.scene.objects
                      if o.name.startswith('Curled glove finger R') for v in o.data.vertices)
    guard_gap=finger_bottom-max(v.co.z for v in guard.data.vertices)
    assert guard_gap>0,('Guard intersects fingers',guard_gap)
    if guard.get('seated_below_curled_fingers'):
        assert guard_gap<.009,('Exposed handle below fingers',guard_gap)
    brim=bpy.data.objects['Downturned iron helmet brim']
    for i in brim.get('dark_rim_faces',list(range(16,32))):
        mat=brim.data.materials[brim.data.polygons[i].material_index]
        assert mat.name.startswith('Equipment • worn steel'),('Face projection on helmet rim',i)
    straps=[o for o in bpy.context.scene.objects if o.name.startswith('Shield rear leather arm strap')]
    assert len(straps)==(2 if brim.get('rim_thickness_metres') else 6)
    assert all(o.vertex_groups.get('Forearm.L') for o in straps)
    assert any(o.name.startswith('Mantle brass buckle frame') for o in bpy.context.scene.objects)
    fingers=[o for o in bpy.context.scene.objects if o.name.startswith('Curled glove finger')]
    assert len(fingers)==32
    assert all(o.vertex_groups.get('Hand.R') or o.vertex_groups.get('Hand.L') for o in fingers)
    for side in ['L','R']:
        wrist=bpy.data.objects['Exposed wrist '+side]
        sleeve=bpy.data.objects['Folded tunic sleeve '+side]
        assert max(v.co.z for v in wrist.data.vertices)>min(v.co.z for v in sleeve.data.vertices)+.003
        for poly in sleeve.data.polygons:
            py=862-poly.center.z/(1.85/(862-20))
            if py<285:
                mat=sleeve.data.materials[poly.material_index]
                assert any(n.type=='TEX_IMAGE' and n.image.name.startswith('pilgrim-surface-atlas')
                           for n in mat.node_tree.nodes),'Painted mantle leaked onto sleeve'
    depsgraph=bpy.context.evaluated_depsgraph_get()
    mantle_tree=BVHTree.FromObject(bpy.data.objects['Asymmetric rust-red shoulder mantle'],depsgraph)
    sleeve_intersections={}
    for side in ['L','R']:
        sleeve_tree=BVHTree.FromObject(bpy.data.objects['Folded tunic sleeve '+side],depsgraph)
        sleeve_intersections[side]=len(mantle_tree.overlap(sleeve_tree))
    assert not any(sleeve_intersections.values()),('Sleeve pokes through mantle',sleeve_intersections)
    polish_report={}
    if brim.get('rim_thickness_metres'):
        assert abs(brim['rim_thickness_metres']-.004)<1e-6
        crown_tree=BVHTree.FromObject(bpy.data.objects['Hammered kettle helmet crown'],depsgraph)
        for vertex in list(brim.data.vertices)[:32]:
            point=vertex.co.copy();point.z+=.001
            hit,normal,_,_=crown_tree.find_nearest(point)
            assert (point-hit).dot(normal)<0,'Open gap between crown and brim'
        support=[BVHTree.FromObject(bpy.data.objects[n],depsgraph) for n in
                 ['Ragged layered charcoal tunic','Leather waist belt']]
        pouch=bpy.data.objects['Supply pouch volume'];gaps=[]
        for i in pouch['rear_contact_indices']:
            point=pouch.data.vertices[i].co
            hits=[t.ray_cast(Vector((point.x,-1,point.z)),Vector((0,1,0)))[0] for t in support]
            ys=[h.y for h in hits if h is not None]
            assert ys,'No support behind pouch'
            gaps.append(min(ys)-point.y)
        assert min(gaps)>.001 and max(gaps)<.008,('Pouch floats away from body',gaps)
        pouch_tree=BVHTree.FromObject(pouch,depsgraph)
        for vertex in bpy.data.objects['Folded pouch flap'].data.vertices:
            point=vertex.co;hit,_,_,_=pouch_tree.ray_cast(Vector((point.x,-1,point.z)),Vector((0,1,0)))
            assert hit is not None and .0005<hit.y-point.y<.0045,'Pouch flap detaches from body'
        cape=bpy.data.objects['Torn short pilgrim cape']
        assert .004<min(cape['back_clearance_samples'])<=max(cape['back_clearance_samples'])<.035
        for strap in straps:
            assert strap.get('fitted_arm_band')
            anchor=strap['shield_anchor_y']
            for i in [0,14,15,29]:
                assert abs(strap.data.vertices[i].co.y-anchor)<.002
            band_tree=BVHTree.FromObject(strap,depsgraph)
            for name in ['Exposed wrist L','Long leather glove cuff L']:
                assert not band_tree.overlap(BVHTree.FromObject(bpy.data.objects[name],depsgraph)),('Shield band clips arm',strap.name)
        polish_report={'same_source_filename':'PASS','thin_closed_helmet_brim':'PASS',
                       'pouch_body_support':'PASS','pouch_flap_contact':'PASS',
                       'cape_back_spacing':'PASS','shield_band_mounts_and_clearance':'PASS'}
        hood=bpy.data.objects['Open cloth hood']
        if hood.get('seated_under_helmet'):
            brim_bottom=min(v.co.z for v in brim.data.vertices)
            for name in ['Open cloth hood','Stern face beneath brim']:
                assert max(v.co.z for v in bpy.data.objects[name].data.vertices)>brim_bottom+.005,('Head gap',name)
            flask=bpy.data.objects['Brass pilgrim flask']
            reference_width,reference_height=bpy.data.images['pilgrim-turnaround.png'].size
            for uv in flask.data.uv_layers.active.data:
                assert 507/reference_width-1e-6<=uv.uv.x<=519/reference_width+1e-6,'Flask background projection'
                assert 1-424/reference_height-1e-6<=uv.uv.y<=1-409/reference_height+1e-6,'Flask background projection'
            assert all(len(p.vertices)==4 for p in list(flask.data.polygons)[1:-1]),'Open flask shell'
            polish_report.update({'hood_and_face_under_brim':'PASS',
                                  'sword_guard_finger_gap_metres':guard_gap})
        buckle=bpy.data.objects['Rectangular brass belt buckle']
        if buckle.get('physical_open_frame'):
            for name in ['Belt buckle central pin','Belt buckle leather tongue','Belt leather keeper',
                         'Token red vertical inlay','Token red crossbar','Token hanging eye',
                         'Shield held leather grip','Shield grip upper bracket','Shield grip lower bracket']:
                assert bpy.data.objects.get(name) is not None,('Missing equipment geometry',name)
            assert bpy.data.objects['Shield held leather grip'].vertex_groups.get('Hand.L')
            assert bpy.data.objects['Hanging religious token'].get('modeled_cross')
            polish_report['modeled_buckle_tag_and_shield_grip']='PASS'
    for name in ['Pouch belt loop','Flask belt hanger','Token leather cord']:
        assert any(o.name.startswith(name) and o.vertex_groups.get('Hips') for o in bpy.context.scene.objects)
    source=g['OUT']/'cathedral-pilgrim-v4.blend';export=g['OUT']/'cathedral-pilgrim-v4.glb'
    assert export.stat().st_mtime>=source.stat().st_mtime,'Export is older than Blender source; rebuild first'
    return {'no_full_figure_projection_on_garments':'PASS','garment_uv_tile_bounds':'PASS',
            'pommel_hidden_inside_glove':'PASS','pommel_clearance_metres':-max(signed),
            'guard_below_fingers':'PASS','helmet_rim_no_face_texture':'PASS',
            'physical_shield_straps':'PASS','physical_mantle_clasp':'PASS',
            'modeled_fingers_bound_to_hands':'PASS','belt_accessory_connections':'PASS',
            'sleeve_wrist_overlap_no_air_gap':'PASS',
            'rest_pose_mantle_sleeve_intersections':sleeve_intersections,
            'in_place_polish':polish_report}

runpy.run_path(str(ROOT/'scripts/validatePilgrimV3.py'),init_globals={
    'ASSET_REVISION':4,'PILGRIM_VALIDATION_REFINER':regression},run_name='__main__')
