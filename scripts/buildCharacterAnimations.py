"""Run with Blender -b <original Casual_Male.blend> --python this_script.

Creates a separate editable source and GLB. Never modifies the supplied pack.
Derived poses retain the original rig and its foot IK controls.
"""
import bpy
import math
from pathlib import Path
from mathutils import Vector, Quaternion

ROOT = Path(__file__).resolve().parents[1]
rig = next(obj for obj in bpy.context.scene.objects if obj.type == 'ARMATURE')
scene = bpy.context.scene
scene.render.fps = 24
originals = {action.name: action for action in bpy.data.actions}


def sample(name, frame):
    rig.animation_data.action = originals[name]
    scene.frame_set(int(frame), subframe=frame % 1)
    return {bone.name: bone.matrix_basis.copy() for bone in rig.pose.bones}


idle = sample('Idle', 0)
seated = sample('SitDown', 23)


def apply(pose):
    for bone in rig.pose.bones:
        bone.matrix_basis = pose[bone.name]
    bpy.context.view_layer.update()


def aim(name, direction):
    bone = rig.pose.bones[name]
    matrix = bone.matrix.copy()
    current = matrix.to_quaternion() @ Vector((0, 1, 0))
    rotation = current.rotation_difference(Vector(direction).normalized())
    matrix = rotation.to_matrix().to_4x4() @ matrix
    matrix.translation = bone.head
    bone.matrix = matrix
    bpy.context.view_layer.update()


def rotate(name, axis, angle):
    bone = rig.pose.bones[name]
    bone.rotation_quaternion = bone.rotation_quaternion @ Quaternion(axis, angle)


def move_foot(side, forward, up):
    # Move the existing IK target in armature space, keeping knee constraints.
    bone = rig.pose.bones['Foot.' + side]
    matrix = bone.matrix.copy()
    matrix.translation += Vector((0, -forward, up))
    bone.matrix = matrix
    bpy.context.view_layer.update()


apply(idle)
for side, sign in [('L', 1), ('R', -1)]:
    aim('UpperArm.' + side, (sign * .16, -.65, .85))
    aim('LowerArm.' + side, (-sign * .08, -.35, 1))
    aim('Fist.' + side, (0, -1, -.15))
move_foot('L', .48, .72)
move_foot('R', .46, .14)
hang_pose = {bone.name: bone.matrix_basis.copy() for bone in rig.pose.bones}
hand_height = sum(rig.pose.bones['Fist.' + side].head.z for side in ['L', 'R']) / 2 * .82
print('LEDGE_HAND_HEIGHT', hand_height)
print('LEDGE_WALL_DISTANCE', -sum(rig.pose.bones['Fist.' + side].head.y for side in ['L', 'R']) / 2 * .82)


def interpolate(a, b, t):
    return {name: a[name].lerp(b[name], t) for name in a}


def make_action(name, duration, pose_at):
    frames = round(duration * scene.render.fps)
    # Sample all source poses before assigning the new action.
    poses = [pose_at(frame / frames) for frame in range(frames + 1)]
    if name in ['JumpRise', 'JumpFall']:
        apply(idle)
        resting_height = rig.pose.bones['Hips'].head.z
        for index, pose in enumerate(poses):
            apply(pose)
            lift = max(0, rig.pose.bones['Hips'].head.z - resting_height)
            root_bone = rig.pose.bones['Bone']
            matrix = root_bone.matrix.copy()
            matrix.translation.z -= lift
            root_bone.matrix = matrix
            bpy.context.view_layer.update()
            poses[index] = {bone.name: bone.matrix_basis.copy() for bone in rig.pose.bones}
    action = bpy.data.actions.new(name)
    action.use_fake_user = True
    rig.animation_data.action = action
    for frame, pose in enumerate(poses):
        scene.frame_set(frame)
        apply(pose)
        for bone in rig.pose.bones:
            bone.keyframe_insert('location', frame=frame, group=bone.name)
            bone.keyframe_insert('rotation_quaternion', frame=frame, group=bone.name)
            bone.keyframe_insert('scale', frame=frame, group=bone.name)
    return action


def hang_at(t):
    apply(hang_pose)
    # Keep shoulders and wrists still so the grip does not swim along the edge.
    return {bone.name: bone.matrix_basis.copy() for bone in rig.pose.bones}


def falling(t):
    apply(idle)
    for side, sign in [('L', 1), ('R', -1)]:
        aim('UpperArm.' + side, (sign * .18, .12, -1))
        aim('LowerArm.' + side, (sign * .1, -.5, -.85))
    move_foot('L', .08, .15)
    move_foot('R', -.08, .23)
    rotate('Head', (1, 0, 0), .08)
    settled = {bone.name: bone.matrix_basis.copy() for bone in rig.pose.bones}
    # Continue from the rise endpoint, then settle once instead of looping a pose.
    progress = min(1, t / .7)
    return interpolate(sample('Jump', 12), settled, progress * progress * (3 - 2 * progress))


def seated_at(t):
    apply(seated)
    rotate('Torso', (1, 0, 0), math.sin(t * math.tau) * .015)
    rotate('Head', (0, 1, 0), math.sin(t * math.tau) * .025)
    return {bone.name: bone.matrix_basis.copy() for bone in rig.pose.bones}


grab_start = sample('Jump', 13)
apply(idle)
for side, sign in [('L', 1), ('R', -1)]:
    aim('UpperArm.' + side, (sign * .18, -.8, -.2))
    aim('LowerArm.' + side, (0, -.3, .8))
    aim('Fist.' + side, (0, -1, 0))
rotate('Torso', (1, 0, 0), .2)
foot = rig.pose.bones['Foot.L']
matrix = foot.matrix.copy(); matrix.translation += Vector((0, -.3, .3)); foot.matrix = matrix
support_pose = {bone.name: bone.matrix_basis.copy() for bone in rig.pose.bones}


def climb_at(t):
    if t < .55:
        f = t / .55
        return interpolate(hang_pose, support_pose, f * f * (3 - 2 * f))
    f = (t - .55) / .45
    return interpolate(support_pose, idle, f * f * (3 - 2 * f))


make_action('LedgeGrab', .2, lambda t: interpolate(grab_start, hang_pose, 1 - (1 - t) ** 3))
make_action('LedgeHang', 1.2, hang_at)
make_action('LedgeClimb', 1, climb_at)
make_action('JumpRise', .3, lambda t: sample('Jump', 4 + t * 8))
make_action('JumpFall', .6, falling)
make_action('JumpLand', .2, lambda t: interpolate(sample('Jump', 20), idle, t))
make_action('SitEnter', .65, lambda t: sample('SitDown', t * 23))
make_action('SeatedIdle', 2, seated_at)
make_action('SitExit', .8, lambda t: sample('StandUp', t * 31))


def slash(t, heavy=False):
    # Wind-up 0-.18, contact .18-.3, recovery .3-.6 seconds.
    frame = t / .3 * 8 if t < .3 else 8 + (t - .3) / .2 * 8 if t < .5 else 16 + (t - .5) / .5 * 9
    apply(sample('SwordSlash', frame))
    if heavy:
        rotate('Torso', (0, 1, 0), math.sin(t * math.pi) * -.22)
        rotate('UpperArm.R', (1, 0, 0), math.sin(t * math.pi) * .3)
    return {bone.name: bone.matrix_basis.copy() for bone in rig.pose.bones}


make_action('SwordSlashQuick', .6, slash)
make_action('SwordSlashHeavy', .8, lambda t: slash(t, True))

# A small bone-attached sword, hidden by the game outside combat.
rig.animation_data.action = originals['Idle']
scene.frame_set(0)
steel = bpy.data.materials.new('SwordSteel'); steel.diffuse_color = (.5, .63, .7, 1)
grip = bpy.data.materials.new('SwordGrip'); grip.diffuse_color = (.12, .065, .03, 1)
pieces = []
for name, location, scale, material in [
    ('Blade', (0, 0, .65), (.055, .025, .48), steel),
    ('Guard', (0, 0, .16), (.18, .045, .035), steel),
    ('Grip', (0, 0, .01), (.035, .035, .12), grip),
]:
    bpy.ops.mesh.primitive_cube_add(size=2, location=location)
    obj = bpy.context.object; obj.name = name; obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(material); pieces.append(obj)
bpy.ops.object.select_all(action='DESELECT')
for obj in pieces: obj.select_set(True)
bpy.context.view_layer.objects.active = pieces[0]
bpy.ops.object.join()
sword = bpy.context.object; sword.name = 'PlayerSword'
scene.cursor.location = (0, 0, 0)
bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
sword.parent = rig; sword.parent_type = 'BONE'; sword.parent_bone = 'Fist.R'
sword.location = (0, -.14, 0)

for action in bpy.data.actions: action.use_fake_user = True
scene.frame_start = 0; scene.frame_end = 60
blend = ROOT / 'art/characters/Casual_Male_gameplay.blend'
glb = ROOT / 'public/assets/quaternius/ultimate-animated-character/Casual_Male_gameplay.glb'
blend.parent.mkdir(parents=True, exist_ok=True)
bpy.context.preferences.filepaths.save_version = 0
bpy.ops.wm.save_as_mainfile(filepath=str(blend))
bpy.ops.export_scene.gltf(filepath=str(glb), export_format='GLB', export_animations=True,
    export_animation_mode='ACTIONS', export_frame_range=False, export_force_sampling=True,
    export_anim_slide_to_zero=True)
print('GAMEPLAY_EXPORT', str(glb))
