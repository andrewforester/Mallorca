import json
import os

import unreal

OUT = "C:/mallorca/renders"
SUB = unreal.get_editor_subsystem(unreal.MetaHumanCharacterEditorSubsystem)
ACTORS = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
TAG = "mallorca_studio"


def world():
    return unreal.get_editor_subsystem(unreal.UnrealEditorSubsystem).get_editor_world()


def face_frame(character):
    pts = [(p.x, p.y, p.z) for p in SUB.get_face_landmarks(character)]
    n = len(pts)
    c = [sum(p[i] for p in pts) / n for i in range(3)]
    facing, sign = 1, 1
    top = max(p[2] for p in pts)
    bottom = min(p[2] for p in pts)
    return c, facing, sign, top - bottom


def clear():
    for a in ACTORS.get_all_level_actors():
        if TAG in [str(t) for t in a.tags] or a.get_actor_label().startswith(TAG) or "MetaHuman" in a.get_class().get_name():
            ACTORS.destroy_actor(a)


def light(cls, location, rotation, intensity, width=120.0):
    a = ACTORS.spawn_actor_from_class(cls, location, rotation)
    a.tags = [TAG]
    comp = a.get_component_by_class(unreal.LightComponent)
    comp.set_intensity(intensity)
    if isinstance(comp, unreal.RectLightComponent):
        comp.set_source_width(width)
        comp.set_source_height(width)
        comp.set_attenuation_radius(1000.0)
    return a


def setup(character, distance=120.0, fov=20.0):
    clear()
    actor = SUB.spawn_meta_human_actor(character, True)
    actor.set_actor_label(TAG + "_" + character.get_name())
    actor.tags = [TAG]
    c, facing, sign, height = face_frame(character)
    center = unreal.Vector(c[0], c[1], c[2] + 1.5)
    forward = [0.0, 0.0, 0.0]
    forward[facing] = float(sign)
    fwd = unreal.Vector(*forward)
    cam_loc = center + fwd * distance
    cam_rot = unreal.MathLibrary.find_look_at_rotation(cam_loc, center)
    cap = ACTORS.spawn_actor_from_class(unreal.SceneCapture2D, cam_loc, cam_rot)
    cap.tags = [TAG]
    comp = cap.capture_component2d
    comp.fov_angle = fov
    comp.capture_every_frame = False
    comp.capture_on_movement = False
    comp.capture_source = unreal.SceneCaptureSource.SCS_FINAL_COLOR_LDR
    rt = unreal.RenderingLibrary.create_render_target2d(world(), 1024, 1024, unreal.TextureRenderTargetFormat.RTF_RGBA8)
    comp.texture_target = rt
    pp = comp.post_process_settings
    pp.override_auto_exposure_method = True
    pp.auto_exposure_method = unreal.AutoExposureMethod.AEM_MANUAL
    pp.override_auto_exposure_bias = True
    pp.auto_exposure_bias = 8.4
    comp.post_process_settings = pp
    comp.post_process_blend_weight = 1.0
    back = center - fwd * 90
    plane = ACTORS.spawn_actor_from_class(unreal.StaticMeshActor, back, unreal.MathLibrary.make_rot_from_z(fwd))
    plane.tags = [TAG]
    plane.static_mesh_component.set_static_mesh(unreal.load_asset("/Engine/BasicShapes/Plane.Plane"))
    plane.set_actor_scale3d(unreal.Vector(6, 6, 1))
    up = unreal.Vector(0, 0, 1)
    side = unreal.Vector(fwd.y, -fwd.x, 0)
    for offset, power in [(side * 35 + up * 30, 8.0), (side * -35 + up * 30, 8.0), (up * -45, 3.5)]:
        loc = center + fwd * 110 + offset
        light(unreal.RectLight, loc, unreal.MathLibrary.find_look_at_rotation(loc, center), power)
    return cap, rt


def capture(name):
    os.makedirs(OUT, exist_ok=True)
    cap = next(a for a in ACTORS.get_all_level_actors() if isinstance(a, unreal.SceneCapture2D) and TAG in [str(t) for t in a.tags])
    comp = cap.capture_component2d
    unreal.SystemLibrary.execute_console_command(world(), "r.Streaming.FullyLoadUsedTextures")
    comp.capture_scene()
    rt = comp.texture_target
    unreal.RenderingLibrary.export_render_target(world(), rt, OUT, name)
    pixels = unreal.RenderingLibrary.read_render_target(world(), rt)
    curves = SUB.track_face_landmarks_from_image(pixels, rt.size_x, rt.size_y)
    data = {}
    if curves:
        for key, tp in curves.items():
            data[str(key)] = [[p.x, p.y] for p in tp.tracking_points]
    with open(os.path.join(OUT, name + ".json"), "w") as f:
        json.dump(data, f)
    return len(data)
