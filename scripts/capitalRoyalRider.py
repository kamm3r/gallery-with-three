"""Original seated royal monument. No player meshes, rigs, or character textures.

Called by buildCapitalStatues.py; metre-scale sculpt facing Blender -Y.
"""
import math
from mathutils import Vector


def build_royal_rider(meshpart, loft, strap):
    bronze = (.63, .59, .49)
    edge = (.77, .72, .6)
    recess = (.3, .29, .25)
    cloth = (.39, .38, .34)
    face = (.68, .64, .54)

    def tube(name, sections, tint=bronze, sides=10):
        """Continuous bent anatomical/armour sections, with elliptical cross sections."""
        vs, fs = [], []
        for j, (xyz, rx, ry) in enumerate(sections):
            p = Vector(xyz)
            before = Vector(sections[max(0, j - 1)][0])
            after = Vector(sections[min(len(sections) - 1, j + 1)][0])
            tangent = (after - before).normalized()
            across = tangent.cross(Vector((0, 1, 0))).normalized()
            if across.length < .01:
                across = tangent.cross(Vector((1, 0, 0))).normalized()
            front = tangent.cross(across).normalized()
            for k in range(sides):
                a = k * math.tau / sides
                vs.append(tuple(p + across * (rx * math.cos(a)) + front * (ry * math.sin(a))))
        for row in range(len(sections) - 1):
            for k in range(sides):
                a = row * sides + k
                b = row * sides + (k + 1) % sides
                fs.append((a, b, b + sides, a + sides))
        fs += [tuple(range(sides - 1, -1, -1)), tuple((len(sections) - 1) * sides + k for k in range(sides))]
        return meshpart(name, vs, fs, tint)

    # Seated hips, fitted cuirass and raised gorget. The front is a shaped breastplate.
    loft('King | articulated hip armour', [(1.72, 0, .03, .18, .15), (1.85, 0, .02, .19, .15), (1.96, 0, .01, .145, .12)], 'z', 12, bronze)
    loft('King | fitted breastplate', [(1.92, 0, .015, .145, .12), (2.04, 0, .01, .15, .13), (2.23, 0, 0, .225, .15), (2.36, 0, 0, .23, .135), (2.41, 0, 0, .15, .1)], 'z', 16, bronze)
    loft('King | raised collar', [(2.36, 0, 0, .14, .105), (2.44, 0, 0, .125, .1), (2.48, 0, 0, .09, .075)], 'z', 12, edge)
    # Rolled cuirass edges and belt are broad enough to survive the PS2 presentation.
    for z, rx, ry in [(1.95, .152, .128), (2.03, .158, .137)]:
        loft('King | armour waist binding', [(z, 0, .012, rx, ry), (z + .025, 0, .012, rx, ry)], 'z', 12, edge)
    strap('King | breastplate central ridge', [(0, -.124, 2.04), (0, -.16, 2.21), (0, -.14, 2.35)], .009, edge)
    # Embossed eight-ray sun; relief rather than painted-on player equipment.
    loft('King | sun medallion', [(-.162, 0, 2.22, .042, .042), (-.174, 0, 2.22, .032, .032)], 'y', 10, edge)
    for i in range(8):
        a = i * math.tau / 8
        dx, dz = math.cos(a), math.sin(a)
        meshpart('King | heraldic sun ray', [(dx*.045, -.166, 2.22+dz*.045), (dx*.085-dz*.009, -.151, 2.22+dz*.085+dx*.009), (dx*.105, -.14, 2.22+dz*.105), (dx*.085+dz*.009, -.151, 2.22+dz*.085-dx*.009)], [(2,1,0),(3,2,0)], edge, False)
    # Hip-to-knee-to-ankle follows a seated rider, with wide cuisses and tapered greaves.
    for side in [-1, 1]:
        tube('King | seated thigh plate', [((side*.13, .025, 1.83), .115, .12), ((side*.25, -.13, 1.73), .135, .12), ((side*.34, -.31, 1.59), .1, .09), ((side*.35, -.33, 1.53), .085, .08)])
        tube('King | pointed knee plate', [((side*.35, -.33, 1.58), .09, .08), ((side*.36, -.36, 1.52), .105, .1), ((side*.36, -.33, 1.45), .065, .07)], edge, 8)
        tube('King | tapered greave', [((side*.36, -.3, 1.5), .071, .07), ((side*.37, -.24, 1.31), .073, .075), ((side*.38, -.19, 1.11), .05, .055)], bronze, 10)
        loft('King | pointed riding boot', [(-.45, side*.38, 1.055, .025, .025), (-.38, side*.38, 1.055, .061, .045), (-.2, side*.38, 1.085, .063, .08), (-.12, side*.38, 1.08, .045, .055)], 'y', 10, recess)
        # Layered skirt plates on the outside of each thigh, following the seat.
        for layer in range(3):
            z = 1.91 - layer*.075
            meshpart('King | overlapping tasset', [(side*.13, -.12, z), (side*.27, -.1, z), (side*.32, -.2, z-.105), (side*.17, -.24, z-.08)], [(0,1,2,3)] if side == -1 else [(3,2,1,0)], edge, False)

    # Deliberately asymmetric pose: sword held forward and up, left hand on the reins.
    arms = [(-1, (-.22, 0, 2.35), (-.38, -.03, 2.5), (-.46, -.16, 2.72)),
            (1, (.22, 0, 2.35), (.34, -.1, 2.11), (.16, -.39, 2.08))]
    for side, shoulder, elbow, wrist in arms:
        start, mid, end = Vector(shoulder), Vector(elbow), Vector(wrist)
        tube('King | upper arm harness', [(tuple(start), .105, .105), (tuple(start.lerp(mid, .42)), .095, .09), (tuple(mid), .065, .068)], bronze, 10)
        tube('King | elbow and vambrace', [(tuple(mid), .075, .074), (tuple(mid.lerp(end, .3)), .08, .075), (tuple(end), .047, .048)], bronze, 10)
        # Three overlying shoulder lames wrap the shoulder instead of square blocks.
        direction = (mid - start).normalized()
        for layer in range(3):
            p = start + direction * (layer*.042)
            tube('King | overlapping shoulder lame', [(tuple(p-direction*.025), .125-layer*.012, .135-layer*.01), (tuple(p+direction*.045), .118-layer*.012, .12-layer*.01)], edge, 10)
        hand_end = end + (end-mid).normalized()*.09
        tube('King | sculpted closed glove', [(tuple(end), .047, .048), (tuple(end.lerp(hand_end, .55)), .055, .043), (tuple(hand_end), .041, .035)], edge, 8)
        # Thumb and individual knuckle ridges, all joined around the grip area.
        for k in range(4):
            p = end.lerp(hand_end, .3+k*.16)
            strap('King | glove finger ridge', [(p.x-.035, p.y-.04, p.z), (p.x, p.y-.05, p.z+.008), (p.x+.025, p.y-.035, p.z)], .006, bronze)
        tube('King | glove thumb', [(tuple(end+Vector((side*.035,-.025,0))), .019, .018), (tuple(end.lerp(hand_end,.6)+Vector((side*.045,-.02,0))), .016, .015)], bronze, 6)

    # Original face: jaw, cheek planes, sockets, nose, lips and a short divided beard.
    loft('King | head and jaw sculpt', [(2.46, 0, -.005, .048, .052), (2.51, 0, -.02, .075, .066), (2.57, 0, -.014, .095, .079), (2.65, 0, -.005, .104, .088), (2.72, 0, .005, .101, .084), (2.79, 0, .01, .089, .077), (2.83, 0, .01, .055, .055)], 'z', 12, face)
    for side in [-1, 1]:
        # Hood-free hairline, eyebrows and eye cavities establish a distinct face.
        loft('King | swept temple hair', [(2.53, side*.087, .015, .021, .055), (2.64, side*.097, .021, .025, .065), (2.76, side*.082, .024, .023, .061)], 'z', 7, recess)
        meshpart('King | recessed eye socket', [(side*.022, -.087, 2.66), (side*.07, -.078, 2.669), (side*.078, -.078, 2.65), (side*.025, -.091, 2.648)], [(3,2,1,0)] if side==1 else [(0,1,2,3)], recess, False)
        strap('King | heavy brow', [(side*.02, -.092, 2.68), (side*.05, -.091, 2.685), (side*.081, -.074, 2.675)], .012, face)
        strap('King | lower eyelid', [(side*.025, -.094, 2.65), (side*.054, -.086, 2.646), (side*.075, -.078, 2.655)], .005, edge)
        # Angular cheekbone, tapering toward the mouth.
        meshpart('King | cheek plane', [(side*.075,-.077,2.643), (side*.092,-.06,2.618), (side*.055,-.089,2.581), (side*.038,-.097,2.617)], [(2,1,0),(3,2,0)] if side==1 else [(0,1,2),(0,2,3)], face, False)
        loft('King | divided beard', [(2.455, side*.025, -.061, .012, .016), (2.5, side*.031, -.073, .029, .026), (2.555, side*.046, -.072, .032, .022), (2.585, side*.059, -.063, .023, .02)], 'z', 7, recess)
        strap('King | moustache', [(side*.004,-.116,2.585),(side*.025,-.111,2.58),(side*.048,-.094,2.574)], .01, recess)
    meshpart('King | sculpted nose', [(-.018,-.086,2.682),(.018,-.086,2.682),(-.018,-.134,2.609),(.018,-.134,2.609),(-.03,-.105,2.6),(.03,-.105,2.6),(0,-.141,2.613)], [(0,2,6),(0,6,1),(1,6,3),(2,4,6),(3,6,5),(4,5,6)], face, False)
    strap('King | stern mouth', [(-.025,-.103,2.565),(0,-.11,2.563),(.025,-.103,2.565)], .004, recess)

    # Open crown, with a continuous circular band and eight leaf-shaped points.
    vs, fs = [], []
    count=32
    for z, rx, ry in [(2.765,.102,.09),(2.81,.105,.093)]:
        for i in range(count):
            a=i*math.tau/count
            vs.append((rx*math.cos(a), .012+ry*math.sin(a),z))
    for i in range(count):fs.append((i,(i+1)%count,(i+1)%count+count,i+count))
    meshpart('King | crown circlet',vs,fs,edge)
    for i in range(8):
        a=i*math.tau/8
        radial=Vector((math.cos(a),math.sin(a),0));along=Vector((-math.sin(a),math.cos(a),0))
        centre=Vector((radial.x*.104,radial.y*.094+.012,2.805))
        points=[centre-along*.026,centre+along*.026,centre+along*.014+Vector((0,0,.065)),centre+radial*.008+Vector((0,0,.12 if i%2==0 else .09)),centre-along*.014+Vector((0,0,.065))]
        meshpart('King | crown leaf point',[tuple(p) for p in points],[(0,1,2),(0,2,3),(0,3,4)],edge,False)
    for i in range(5):
        a=-math.pi*.8+i*math.pi*.15
        centre=Vector((.107*math.cos(a),.012+.095*math.sin(a),2.786))
        along=Vector((-math.sin(a),math.cos(a),0))
        meshpart('King | circlet inset', [tuple(centre-along*.009),tuple(centre+Vector((0,0,.016))),tuple(centre+along*.009),tuple(centre-Vector((0,0,.016)))],[(0,1,2),(0,2,3)],recess,False)

    # Long royal mantle: a continuous folded sheet, from shoulder clasps over the rump.
    vs,fs=[],[]
    rows=[(2.37,.2,.105),(2.24,.245,.19),(2.02,.26,.265),(1.78,.29,.4),(1.53,.3,.61),(1.25,.27,.76)]
    for row,(z,rx,depth) in enumerate(rows):
        for i in range(13):
            u=i/12;x=(u*2-1)*rx
            fold=math.cos(u*math.pi*8)*(.012+row*.003)
            y=depth-math.sin(u*math.pi)*.035+fold
            vs.append((x,y,z+(0.018 if row==5 and i%2 else 0)))
    for j in range(len(rows)-1):
        for i in range(12):
            k=j*13+i;fs.append((k,k+1,k+14,k+13))
    meshpart('King | folded royal mantle',vs,fs,cloth)
    for side in [-1,1]:
        strap('King | mantle embroidered border', [(side*rx,depth,z) for z,rx,depth in rows], .012, edge)
        loft('King | mantle shoulder clasp', [(-.104,side*.145,2.35,.023,.026),(-.12,side*.145,2.35,.02,.023)],'y',8,edge)
    # A distinct leaf-guard ceremonial sword, aligned through the raised palm.
    grip=Vector((-.475,-.184,2.765));axis=Vector((-.25,-.15,.95)).normalized()
    across=Vector((1,0,0));front=axis.cross(across).normalized()
    strap('King | sword leather grip',[tuple(grip-axis*.065),tuple(grip+axis*.06)],.018,recess)
    cross=grip+axis*.07
    strap('King | swept sword guard',[tuple(cross-across*.105-axis*.025),tuple(cross-across*.055),tuple(cross),tuple(cross+across*.055),tuple(cross+across*.105-axis*.025)],.014,edge)
    vs=[]
    for length,width in [(0,.035),(.34,.029),(.46,0)]:
        p=cross+axis*(length+.02)
        vs.extend([tuple(p-across*width),tuple(p+front*.009),tuple(p+across*width),tuple(p-front*.009)])
    fs=[]
    for j in range(2):
        for k in range(4):fs.append((j*4+k,j*4+(k+1)%4,(j+1)*4+(k+1)%4,(j+1)*4+k))
    meshpart('King | tapered ceremonial blade',vs,fs,edge,False)
