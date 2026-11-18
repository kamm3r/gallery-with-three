"""Shape corrections against the approved concept. Blender component meshes are truth."""
import math
import bpy
from mathutils import Vector


def horse_pose(point):
    p=Vector(point)
    if p.y>0:p.y*=1.3
    if p.y<-.65 and p.z>1.7:
        t=max(0,min(1,(-p.y-.65)/.29));a=math.radians(25)*t
        x,y=p.x,p.y+.65
        p.x=x*math.cos(a)-y*math.sin(a)
        p.y=-.65+x*math.sin(a)+y*math.cos(a)
    return p


def refine_shapes(objects):
    head_terms=('withered skull','exposed eye','eyelid','hollow cheek','gaunt jaw','lip seam','carved tooth','mask ','mask left','mask raised','mask fastening','mask broken','broken upper right','fractured mask')
    parasite_terms=('parasite hooked rib','rib spur','petrified root web')
    for ob in objects:
        name=ob.name;me=ob.data
        for v in me.vertices:
            p=v.co
            if name.startswith('Marshal |'):
                if any(t in name for t in head_terms):
                    p.z=2.58+(p.z-2.58)*.8
                    p.y-=max(0,p.z-2.6)*.08
                if any(t in name for t in parasite_terms):
                    p.x=-.22+(p.x+.22)*.65
                    p.z=2.43+(p.z-2.43)*.8
                    p.y+=(p.x+.22)*.1
                if any(t in name for t in ('executioner','crossguard','seal guard','seal cross','grip winding','blade fuller')):
                    angle=math.radians(50);x,y=p.x+.574,p.y+.285
                    p.x=-.574+x*math.cos(angle)-y*math.sin(angle);p.y=-.285+x*math.sin(angle)+y*math.cos(angle)
                if any(t in name for t in ('notched executioner blade','blade fuller')):
                    p.z=2.55+(p.z-2.55)*.75
                if 'flared funeral collar' in name and p.z>2.48:
                    p.z=2.48+(p.z-2.48)*.65
            else:
                if any(t in name.lower() for t in ('eye socket','eye cavity','eye ridge','eyelid')):
                    p.x+=.012 if p.x>0 else -.012;p.y-=.07
                if any(t in name for t in ('grave-mask','chamfron')):
                    p.z+=.105;p.y-=.035
                if not any(t in name for t in ('Rein','stirrup','funeral hanging','Girth','breast','harness')):
                    p.z+=max(0,p.z-1.5)*.25
                p[:]=horse_pose(p)
            if name.startswith('Marshal |') and ('mantle' in name or 'coat skirt' in name) and p.y>.1:
                p.y=.1+(p.y-.1)*1.3
            # Advance one foreleg as in the concept; keep the hoof on the ground.
            if any(t in name for t in ('Foreleg','Shaped hoof')) and p.x<0 and p.y<-.35:
                p.y-=.23*max(0,1-p.z/1.4)
        me.update()


def add_wrapped_mantle(meshpart,strap):
    # A continuous volume around both horse flanks; broad torn folds replace flat ribbons.
    rows=[(2.47,.22,.14,.02),(2.25,.28,.21,.04),(2.0,.34,.34,.1),(1.77,.46,.76,.18),(1.5,.55,.85,.2),(1.2,.56,.87,.2),(.9,.55,.87,.21),(.62,.52,.85,.21)]
    cols=25;vs=[]
    for j,(z,rx,ry,cy) in enumerate(rows):
        for k in range(cols):
            u=k/(cols-1);a=(u-.5)*math.pi*1.22
            fold=math.sin(u*math.pi*12+.15*math.sin(j))*(.008+j*.003)
            x=math.sin(a)*(rx+fold);y=cy+math.cos(a)*(ry+fold)
            # Cloth conforms to the hips before falling off the horse's croup.
            zz=z+(.035*math.sin(u*math.pi*6)+.025*math.sin(u*math.pi*18) if j==len(rows)-1 else 0)
            vs.append((x,y,zz))
    # A closed cloth shell: inner lining and connected hem/side edges. Keep the
    # hem continuous; small triangular frays belong to its outline, never missing
    # grid cells that make square holes or let the horse poke through.
    outer_count=len(vs)
    for x,y,z in list(vs):
        radial=Vector((x,y-.18,0)).normalized()
        vs.append((x-radial.x*.012,y-radial.y*.012,z))
    fs=[]
    for j in range(len(rows)-1):
        for k in range(cols-1):
            n=j*cols+k;face=(n,n+1,n+cols+1,n+cols)
            fs.append(face);fs.append(tuple(i+outer_count for i in reversed(face)))
    for row in [0,len(rows)-1]:
        for k in range(cols-1):
            n=row*cols+k;fs.append((n,n+outer_count,n+1+outer_count,n+1))
    for column in [0,cols-1]:
        for row in range(len(rows)-1):
            n=row*cols+column;fs.append((n,n+cols,n+cols+outer_count,n+outer_count))
    meshpart('Marshal | torn folded burial mantle',vs,fs,(.35,.33,.28))
    def surface(angle,z):
        for row in range(len(rows)-1):
            upper,lower=rows[row],rows[row+1]
            if lower[0]<=z<=upper[0]:break
        t=(upper[0]-z)/(upper[0]-lower[0]);u=angle/(math.pi*1.22)+.5
        column=min(cols-2,max(0,int(u*(cols-1))));fraction=u*(cols-1)-column
        a=Vector(vs[row*cols+column]).lerp(Vector(vs[row*cols+column+1]),fraction)
        b=Vector(vs[(row+1)*cols+column]).lerp(Vector(vs[(row+1)*cols+column+1]),fraction)
        point=a.lerp(b,t)
        return tuple(point+Vector((math.sin(angle),math.cos(angle),0))*.014)
    for angle,zc in [(1.36,1.21),(0,1.18)]:
        verts=[]
        for radius in [.067,.057]:
            for k in range(12):
                a=k*math.tau/12;verts.append(surface(angle+math.cos(a)*radius/.7,zc+math.sin(a)*radius))
        faces=[]
        for k in range(12):
            j=(k+1)%12;faces.extend([(k,j,j+12,k+12),(k+12,j+12,j,k)])
        meshpart('Marshal | mantle ritual seal',verts,faces,(.8,.7,.5),False)
        for corners in [[(-.008,-.1),(.008,-.1),(.008,.095),(-.008,.095)],[(-.045,-.007),(.045,-.007),(.045,.007),(-.045,.007)]]:
            meshpart('Marshal | mantle ritual cross',[surface(angle+a/.7,zc+z) for a,z in corners],[(0,1,2,3),(3,2,1,0)],(.8,.7,.5),False)
    # Two curved coat skirts follow the thighs. Their folds have depth, not flat boards.
    for side in [-1,1]:
        points=[];faces=[]
        for row,(z,y,x) in enumerate([(1.97,-.13,.2),(1.78,-.24,.3),(1.55,-.27,.37),(1.29,-.2,.4),(1.04,-.15,.41)]):
            for k in range(5):
                u=k/4
                points.append((side*(x+(u-.5)*.13),y+.022*math.cos(u*math.pi*4),z+(0.09*(k%2) if row==4 else 0)))
        for j in range(4):
            for k in range(4):
                n=j*5+k;faces.extend([(n,n+1,n+6,n+5),(n+5,n+6,n+1,n)])
        meshpart('Marshal | folded coat skirt over thigh',points,faces,(.35,.33,.28))


def add_plinth(meshpart):
    for name,half_x,half_y,z0,z1 in [('base',.78,1.035,-.22,-.055),('cap',.81,1.06,-.055,0)]:
        cut=.07
        outline=[(-half_x+cut,-half_y), (half_x-cut,-half_y), (half_x,-half_y+cut), (half_x,half_y-cut), (half_x-cut,half_y), (-half_x+cut,half_y), (-half_x,half_y-cut), (-half_x,-half_y+cut)]
        vs=[(x,y-.1,z) for z in [z0,z1] for x,y in outline]
        fs=[tuple(range(7,-1,-1)),tuple(range(8,16))]+[(i,(i+1)%8,(i+1)%8+8,i+8) for i in range(8)]
        meshpart('Plinth | worn stone '+name,vs,fs,(.5,.47,.4),False)
