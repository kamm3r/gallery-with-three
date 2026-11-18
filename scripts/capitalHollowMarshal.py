"""Hollow Marshal: original Blender geometry built from the approved concept sheet.

No player geometry, rig or character textures. Called by buildCapitalStatues.py.
Coordinates are metres, Z up, front -Y; the horse is supplied by the main builder.
"""
import math
from hollowMarshalRefine import add_wrapped_mantle
from mathutils import Vector


def build_hollow_marshal(meshpart, loft, strap):
    metal=(.59,.55,.46);edge=(.81,.73,.55);dark=(.2,.2,.18)
    cloth=(.35,.33,.28);bone=(.67,.61,.47)

    def tube(name, sections, tint=metal, sides=8):
        vs,fs=[],[]
        for j,(p,rx,ry) in enumerate(sections):
            p=Vector(p);t=(Vector(sections[min(j+1,len(sections)-1)][0])-Vector(sections[max(0,j-1)][0])).normalized()
            a=t.cross(Vector((0,1,0))).normalized()
            if a.length<.01:a=t.cross(Vector((1,0,0))).normalized()
            b=t.cross(a).normalized()
            for k in range(sides):
                angle=k*math.tau/sides
                vs.append(tuple(p+a*rx*math.cos(angle)+b*ry*math.sin(angle)))
        for row in range(len(sections)-1):
            for k in range(sides):
                a=row*sides+k;b=row*sides+(k+1)%sides
                fs.append((a,b,b+sides,a+sides))
        fs.extend([tuple(range(sides-1,-1,-1)),tuple((len(sections)-1)*sides+k for k in range(sides))])
        ob=meshpart(name,vs,fs,tint);ob['uv_ring_sides']=sides;ob['uv_ring_count']=len(sections)
        return ob

    def plate(name, outline, tint=metal, thickness=.014):
        # Closed plate: both faces are real, with thickness at the torn edges.
        n=len(outline);vs=[tuple(p) for p in outline]+[(p[0],p[1]+thickness,p[2]) for p in outline]
        fs=[tuple(range(n-1,-1,-1)),tuple(range(n,n*2))]
        fs += [(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
        return meshpart(name,vs,fs,tint,False)

    def buckle(name,x,y,z,w=.065,h=.055):
        outline=[(x-w/2,y,z-h/2),(x+w/2,y,z-h/2),(x+w/2,y,z+h/2),(x-w/2,y,z+h/2),(x-w/2,y,z-h/2)]
        strap(name,outline,.008,edge)
        strap(name+' tongue',[(x,y-.003,z-h*.3),(x,y-.003,z+h*.3)],.005,edge)

    def ring(name,center,radius,plane='xz',tint=edge,segments=10,wire=.007):
        pts=[]
        for k in range(segments+1):
            a=k*math.tau/segments;c,s=math.cos(a)*radius,math.sin(a)*radius
            offset=(c,0,s) if plane=='xz' else (c,s,0) if plane=='xy' else (0,c,s)
            pts.append(tuple(Vector(center)+Vector(offset)))
        strap(name,pts,wire,tint)

    # The long fitted burial coat is continuous and creased, not a rounded torso stack.
    loft('Marshal | seated coat hips',[(1.72,0,.04,.19,.15),(1.88,0,.025,.19,.155),(2.03,0,.02,.145,.12)],'z',12,cloth)
    loft('Marshal | buckled burial coat',[(1.97,0,.02,.145,.12),(2.16,0,.012,.17,.135),(2.34,0,.008,.205,.14),(2.47,0,.015,.2,.12),(2.51,0,.02,.135,.095)],'z',16,cloth)
    # Overlapping lapels frame the fastenings; their silhouette is ragged at the foot.
    for side in [-1,1]:
        plate('Marshal | heavy coat lapel',[(side*.035,-.119,2.04),(side*.12,-.145,2.17),(side*.13,-.143,2.37),(side*.1,-.119,2.49),(side*.04,-.143,2.37)],metal)
        tube('Marshal | seated cuisse', [((side*.14,.04,1.85),.106,.115),((side*.25,-.12,1.76),.12,.115),((side*.34,-.31,1.59),.09,.087)],metal,10)
        tube('Marshal | kneecap', [((side*.34,-.32,1.63),.085,.08),((side*.35,-.35,1.55),.099,.095),((side*.35,-.32,1.48),.062,.065)],edge)
        tube('Marshal | ridged greave', [((side*.35,-.3,1.51),.07,.073),((side*.37,-.24,1.3),.066,.074),((side*.38,-.19,1.1),.049,.05)],metal)
        loft('Marshal | armored boot',[(-.44,side*.38,1.05,.022,.024),(-.37,side*.38,1.054,.056,.043),(-.2,side*.38,1.085,.06,.078),(-.12,side*.38,1.08,.043,.055)],'y',8,dark)
        # Three thin armor lames, following each leg, with a worn raised central rib.
        for j in range(3):
            z=1.9-j*.085
            plate('Marshal | layered leg plate',[(side*.16,-.12,z),(side*.28,-.11,z+.012),(side*.34,-.22,z-.1),(side*.22,-.25,z-.13)],metal)
        strap('Marshal | greave centre rib',[(side*.35,-.373,1.49),(side*.37,-.315,1.28),(side*.38,-.244,1.12)],.007,edge)
        for z in [1.25,1.41]:
            strap('Marshal | greave strap',[(side*.31,-.27,z),(side*.38,-.32,z),(side*.43,-.24,z)],.011,dark)
    for i,(z,rx,ry) in enumerate([(2.08,.158,.137),(2.25,.194,.151),(2.41,.207,.145)]):
        loft('Marshal | restraint belt',[(z-.018,0,.014,rx,ry),(z+.018,0,.014,rx,ry)],'z',12,dark)
        buckle('Marshal | rectangular restraint buckle',.008,-ry+.002,z)
        for side in [-1,1]:
            plate('Marshal | belt rivet',[(side*.075,-ry+.005,z-.008),(side*.083,-ry+.005,z),(side*.075,-ry+.005,z+.008),(side*.067,-ry+.005,z)],edge,.006)

    # One surviving, finely layered ceremonial shoulder; the other has split apart.
    for layer in range(3):
        x=.22+layer*.025;z=2.45-layer*.07
        shoulder_ring=[(.1,-.06,z+.01),(.16,-.145,z),(.32,-.14,z-.025),(.41,-.07,z-.065),(.425,.055,z-.07),(.33,.135,z-.02),(.17,.135,z),(.1,.055,z+.01)]
        verts=shoulder_ring+[(p[0],p[1],p[2]-.014) for p in shoulder_ring]+[(.24,0,z+.065),(.24,0,z+.045)]
        faces=[]
        for k in range(8):faces.extend([(16,k,(k+1)%8),(17,(k+1)%8+8,k+8),(k,k+8,(k+1)%8+8,(k+1)%8)])
        meshpart('Marshal | surviving scalloped pauldron',verts,faces,metal,False)
        strap('Marshal | pauldron rolled edge',[(x-.08,-.06,z-.03),(x,-.115,z-.055),(x+.09,-.07,z-.015)],.009,edge)
    # Arms deliberately lowered to the concept's oath-bearing grip beside the body.
    arms=[(-1,(-.21,.015,2.43),(-.39,-.07,2.22),(-.53,-.26,2.39)),(1,(.23,0,2.41),(.34,-.13,2.2),(.14,-.4,2.28))]
    for side,shoulder,elbow,wrist in arms:
        a,b,c=Vector(shoulder),Vector(elbow),Vector(wrist)
        tube('Marshal | upper sleeve',[(tuple(a),.082,.085),(tuple(a.lerp(b,.35)),.091,.088),(tuple(a.lerp(b,.72)),.071,.07),(tuple(b),.056,.057)],cloth,10)
        tube('Marshal | vambrace',[(tuple(b),.073,.07),(tuple(b.lerp(c,.3)),.077,.074),(tuple(c),.045,.045)],metal,10)
        for j in range(2):
            p=b.lerp(c,.22+j*.24)
            strap('Marshal | forearm binding',[(p.x-.055,p.y-.02,p.z),(p.x,p.y-.075,p.z),(p.x+.05,p.y-.025,p.z)],.009,edge)
        end=c+(c-b).normalized()*.085
        tube('Marshal | gripping glove',[(tuple(c),.043,.045),(tuple(c.lerp(end,.55)),.052,.044),(tuple(end),.038,.03)],metal,8)
        # Four separate knuckles and hooked fingers wrap the grip/reins.
        for k in range(4):
            p=c.lerp(end,.15+k*.2)
            tube('Marshal | articulated curled finger',[
                (tuple(p+Vector((-.027,-.023,0))),.009,.011),
                (tuple(p+Vector((-.012,-.047,.007))),.011,.012),
                (tuple(p+Vector((.019,-.048,.004))),.009,.01),
                (tuple(p+Vector((.029,-.027,-.01))),.006,.008)],metal,5)
        tube('Marshal | glove thumb',[(tuple(c+Vector((side*.032,-.02,0))),.017,.017),(tuple(c.lerp(end,.55)+Vector((side*.037,-.02,0))),.014,.014)],metal,6)

    # Emaciated head under the elongated broken burial mask; no crown or player hat.
    loft('Marshal | neck in collar',[(2.44,0,.015,.065,.06),(2.61,0,.01,.058,.055)],'z',10,dark)
    loft('Marshal | withered skull',[(2.57,0,-.015,.045,.05),(2.63,0,-.025,.071,.061),(2.71,0,-.015,.085,.071),(2.81,0,0,.089,.079),(2.9,0,.015,.076,.069),(2.95,0,.015,.043,.048)],'z',12,metal)
    # Visible right socket and sunken cheek. The small eye is captured as geometry.
    plate('Marshal | exposed eye cavity',[(.016,-.075,2.811),(.071,-.061,2.815),(.077,-.063,2.783),(.023,-.087,2.774)],dark,.004)
    loft('Marshal | exposed eye',[(-.087,.047,2.795,.017,.009),(-.099,.047,2.795,.011,.006)],'y',8,edge)
    strap('Marshal | eyelid ridge',[(.018,-.083,2.817),(.045,-.085,2.822),(.077,-.066,2.815)],.008,metal)
    plate('Marshal | hollow cheek plane',[(.08,-.063,2.77),(.078,-.048,2.716),(.045,-.077,2.674),(.027,-.089,2.728)],metal)
    plate('Marshal | gaunt jaw',[(.052,-.066,2.699),(.07,-.046,2.65),(.024,-.079,2.604),(-.027,-.082,2.622),(-.045,-.069,2.665)],metal)
    strap('Marshal | lip seam',[(-.028,-.089,2.676),(0,-.1,2.672),(.035,-.087,2.677)],.007,dark)
    for i in range(4):
        x=-.022+i*.014
        strap('Marshal | exposed carved tooth',[(x,-.098,2.684),(x+.001,-.102,2.668)],.003,edge)
    # Mask shell has thickness, displaced facets and an uneven long central edge.
    plate('Marshal | mask left broken wing',[(-.094,-.065,2.878),(-.073,-.081,2.977),(-.021,-.092,3.024),(.017,-.103,2.972),(-.001,-.126,2.868),(-.015,-.14,2.747),(-.041,-.112,2.635),(-.075,-.093,2.745)],metal,.022)
    plate('Marshal | mask raised central keel',[(-.025,-.109,2.996),(.017,-.11,2.97),(.029,-.137,2.866),(.012,-.154,2.753),(-.009,-.142,2.664),(-.021,-.156,2.806)],edge,.014)
    plate('Marshal | broken upper right brow',[(.014,-.11,2.975),(.064,-.083,2.942),(.089,-.061,2.896),(.08,-.075,2.84),(.049,-.093,2.858),(.028,-.108,2.834)],metal,.018)
    for pts in [[(-.06,-.085,2.958),(-.041,-.105,2.922),(-.054,-.113,2.883)],[(-.062,-.108,2.805),(-.038,-.139,2.784),(-.049,-.117,2.738)]]:
        strap('Marshal | fractured mask seam',pts,.004,dark)
    for x,z in [(-.073,2.86),(-.049,2.94),(-.063,2.75),(.047,2.91)]:
        loft('Marshal | mask fastening',[(-.107,x,z,.008,.009),(-.12,x,z,.005,.006)],'y',6,edge)
    # High collar and the iron chain that seals the mask to the cuirass.
    loft('Marshal | flared funeral collar',[(2.43,0,.02,.15,.11),(2.56,0,.02,.135,.105),(2.64,0,.025,.11,.09)],'z',12,cloth)
    for i in range(9):
        x=-.09+i*.0225;z=2.48- .025*math.sin(i*math.pi/8)
        ring('Marshal | collar chain link',(x,-.111,z),.014,'xz' if i%2==0 else 'yz',edge,8,.004)
    for side in [-1,1]:
        x=side*.047
        plate('Marshal | chained reliquary',[(x-.018,-.14,2.44),(x+.014,-.14,2.444),(x+.021,-.14,2.383),(x-.014,-.14,2.379)],metal,.012)
        strap('Marshal | reliquary engraved line',[(x,-.153,2.427),(x+.004,-.153,2.394)],.003,edge)

    for side in [-1,1]:
        strap('Marshal | folded collar lip',[(side*.14,-.035,2.47),(side*.12,-.069,2.56),(side*.08,-.065,2.61)],.01,metal)

    # Parasitic fan: five hooked, tapered ribs with open webbed gaps and secondary spurs.
    ribs=[
        [(-.22,.045,2.44),(-.37,.065,2.65),(-.46,.08,2.88),(-.42,.085,3.06),(-.29,.08,3.15)],
        [(-.25,.03,2.45),(-.46,.045,2.62),(-.62,.05,2.83),(-.62,.06,3.01),(-.49,.065,3.1)],
        [(-.27,.02,2.44),(-.5,.03,2.55),(-.73,.035,2.69),(-.8,.045,2.85),(-.7,.05,2.95)],
        [(-.27,.005,2.42),(-.53,.005,2.46),(-.78,.015,2.52),(-.92,.03,2.65),(-.87,.035,2.77)],
        [(-.27,-.01,2.4),(-.5,-.015,2.37),(-.74,-.005,2.37),(-.9,.01,2.46),(-.94,.02,2.58)],
    ]
    for j,path in enumerate(ribs):
        widths=[.049,.035,.026,.014,.0015]
        sections=[]
        for k in range(len(path)-1):
            p0,p1,p2,p3=[Vector(path[max(0,min(len(path)-1,i))]) for i in [k-1,k,k+1,k+2]]
            for step in range(2):
                t=step/2
                p=.5*((2*p1)+(-p0+p2)*t+(2*p0-5*p1+4*p2-p3)*t*t+(-p0+3*p1-3*p2+p3)*t*t*t)
                width=widths[k]*(1-t)+widths[k+1]*t
                sections.append((tuple(p),width,width*.42))
        sections.append((path[-1],widths[-1],widths[-1]*.42))
        tube('Marshal | parasite hooked rib',sections,bone,6)
        for k in [1,2]:
            p=Vector(path[k]);end=p+Vector((-.05,.005,.1 if j>1 else .065))
            tube('Marshal | rib spur',[(tuple(p),.023,.012),(tuple(end),.0015,.0015)],edge,5)
        if j<4:
            # A forked basal web leaves large readable holes between the outer hooks.
            q=ribs[j+1]
            plate('Marshal | petrified root web',[path[0],tuple(Vector(path[1]).lerp(Vector(path[2]),.38)),tuple(Vector(path[1]).lerp(Vector(q[1]),.5)),tuple(Vector(q[1]).lerp(Vector(q[2]),.38)),q[0]],dark,.014)
    for index in (1,3):
        p=Vector(ribs[index][2])
        tube('Marshal | rib spur fork',[(tuple(p),.023,.01),(tuple(p+Vector((-.07,.012,.035))),.018,.008),(tuple(p+Vector((-.11,.02,.11))),.01,.005),(tuple(p+Vector((-.045,.022,.16))),.001,.001)],bone,6)
    # The torn pauldron around the growth has a visibly fractured outer edge.
    for j in range(3):
        plate('Marshal | split infected shoulder plate',[(-.12,-.06,2.5-j*.05),(-.28,-.10,2.53-j*.05),(-.35,-.07,2.47-j*.05),(-.3,-.1,2.42-j*.05),(-.21,-.11,2.45-j*.05)],metal)

    # Upright executioner's blade through the raised fist, with modeled edge notches.
    grip=Vector((-.574,-.285,2.439))
    strap('Marshal | executioner grip',[tuple(grip+Vector((0,0,-.095))),tuple(grip+Vector((0,0,.09)))],.019,dark)
    for j in range(5):ring('Marshal | grip winding',tuple(grip+Vector((0,0,-.06+j*.03))),.021,'xy',metal,8,.003)
    guard_z=2.55
    strap('Marshal | fractured crossguard',[(-.73,-.285,guard_z-.035),(-.67,-.285,guard_z+.005),(-.574,-.285,guard_z),(-.49,-.285,guard_z+.005),(-.43,-.285,guard_z-.035)],.015,edge)
    ring('Marshal | broken seal guard',(-.574,-.303,guard_z),.047,'xz',edge,12,.009)
    strap('Marshal | seal cross',[(-.605,-.316,guard_z),(-.543,-.316,guard_z)],.005,edge)
    strap('Marshal | seal cross',[(-.574,-.316,guard_z-.032),(-.574,-.316,guard_z+.032)],.005,edge)
    outline=[(-.62,-.285,2.59),(-.533,-.285,2.59),(-.53,-.285,3.4),(-.574,-.285,3.56)]
    # Saw-like damage is part of the silhouette, not tiny separate floating chips.
    for z in [3.39,3.24,3.09,2.94,2.79]:
        outline += [(-.617,-.285,z),(-.594,-.285,z-.025),(-.619,-.285,z-.048)]
    plate('Marshal | notched executioner blade',outline,metal,.022)
    strap('Marshal | blade fuller',[(-.574,-.301,2.65),(-.575,-.301,3.4)],.006,dark)

    add_wrapped_mantle(meshpart,strap)

    # Horse dressing from the concept: chamfron, ribbed breast harness and funeral strips.
    plate('Horse | narrow grave-mask face plate',[(-.105,-1.02,2.12),(-.07,-1.16,2.13),(0,-1.29,2.04),(.07,-1.16,2.13),(.105,-1.02,2.12),(.07,-1.28,1.91),(0,-1.38,1.87),(-.07,-1.28,1.91)],metal,.016)
    strap('Horse | chamfron central ridge',[(0,-1.12,2.14),(0,-1.31,2.03),(0,-1.5,1.81)],.009,edge)
    for side in [-1,1]:
        strap('Horse | chamfron side binding',[(side*.09,-1.08,2.13),(side*.08,-1.25,1.98),(side*.04,-1.45,1.82)],.009,edge)
        # Curved segmented breast armor lies over the chest and never crosses the legs.
        for j in range(4):
            x=side*(.04+j*.062);z=1.43-j*.035;y=-.88+j*.034
            plate('Horse | breast harness rib',[(x,y,z+.16),(x+side*.062,y+.035,z+.13),(x+side*.064,y+.045,z-.03),(x,y+.007,z-.065)],metal,.012)
        strap('Horse | harness diagonal',[(side*.31,-.53,1.7),(side*.29,-.76,1.47),(0,-.9,1.38)],.021,edge)
        # Narrow, torn bronze strips with large stamped seals, not microscopic engravings.
        for j in range(5):
            x=side*(.05+j*.06);y=-.9+j*.027;top=1.37-j*.014;bottom=.97+(j%2)*.1
            plate('Horse | funeral hanging strip',[(x,y,top),(x+side*.038,y+.01,top-.012),(x+side*.039,y+.025,bottom+.06),(x+side*.024,y+.016,bottom+.035),(x+side*.008,y+.012,bottom)],cloth,.008)
        # Near stirrup complete; far one has an obvious break in its lower bar.
        x=side*.41
        strap('Horse | stirrup leather',[(side*.28,-.07,1.64),(x,-.16,1.14)],.013,dark)
        points=[(x,-.25,1.14),(x,-.31,.99),(x,-.12,.99),(x,-.1,1.14)]
        if side==1:strap('Horse | complete stirrup',points+[points[0]],.012,metal)
        else:
            strap('Horse | broken stirrup',points[:2],.012,metal)
            strap('Horse | broken stirrup',points[2:],.012,metal)
    ring('Horse | breast seal',(0,-.934,1.43),.058,'xz',edge,12,.009)
    strap('Horse | breast seal cross',[(-.038,-.946,1.43),(.038,-.946,1.43)],.007,edge)
    strap('Horse | breast seal cross',[(0,-.946,1.39),(0,-.946,1.47)],.007,edge)

    # The chamfron leaves the eye open; sculpt a recessed eye facing out of each cheek.
    for side in [-1,1]:
        vs=[(side*.15,-1.14,2.03)]
        for i in range(12):
            a=i*math.tau/12
            vs.append((side*.151,-1.14+.045*math.cos(a),2.03+.022*math.sin(a)))
        fs=[(0,i+1,(i+1)%12+1) for i in range(12)]
        fs += [tuple(reversed(f)) for f in fs]
        meshpart('Horse | deep exposed eye socket',vs,fs,dark,False)
        strap('Horse | upper eye ridge',[(side*.153,-1.185,2.032),(side*.158,-1.15,2.055),(side*.151,-1.105,2.035)],.008,edge)
        strap('Horse | carved mouth crease',[(side*.095,-1.49,1.77),(side*.108,-1.43,1.775),(side*.106,-1.36,1.79)],.005,dark)

    # The concept's two long funeral hangings fall between, rather than over, the forelegs.
    for side in [-1,1]:
        for strip in range(2):
            vs=[]
            for row,(z,y) in enumerate([(1.35,-.91),(1.1,-.94),(.83,-.9),(.57+strip*.12,-.85)]):
                for k in range(3):
                    x=side*(.07+strip*.065+k*.023)
                    vs.append((x,y+.008*math.cos(k*math.pi),z+(.04*(k%2) if row==3 else 0)))
            fs=[]
            for row in range(3):
                for k in range(2):
                    i=row*3+k;fs.extend([(i,i+1,i+4,i+3),(i+3,i+4,i+1,i)])
            meshpart('Horse | long ragged funeral hanging',vs,fs,cloth)
