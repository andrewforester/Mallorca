import sys
sys.path.insert(0, "C:/mallorca/ue")
import importlib
import json
import studio
importlib.reload(studio)
import unreal

SRC = "C:/mallorca/ue/brunette_body.fbx"
DEST = "/Game/Targets"
NAME = "BrunetteBody"

task = unreal.AssetImportTask()
task.filename = SRC
task.destination_path = DEST
task.destination_name = NAME
task.automated = True
task.replace_existing = True
task.save = True
ui = unreal.FbxImportUI()
ui.import_mesh = True
ui.import_as_skeletal = False
ui.import_materials = False
ui.import_textures = False
ui.mesh_type_to_import = unreal.FBXImportType.FBXIT_STATIC_MESH
ui.static_mesh_import_data.combine_meshes = True
ui.static_mesh_import_data.import_rotation = unreal.Rotator(0.0, 0.0, float(open("C:/mallorca/ue/rot.txt").read().strip() or 0))
task.options = ui
unreal.AssetToolsHelpers.get_asset_tools().import_asset_tasks([task])
mesh = unreal.load_asset(DEST + "/" + NAME)
verts, idx, *_ = studio.SUB.get_mesh_data_for_conforming(mesh)
pts = [(v.x, v.y, v.z) for v in verts]
top = max(p[2] for p in pts)
head = [p for p in pts if p[2] > top - 30]
cx = sum(p[0] for p in head) / len(head)
cy = sum(p[1] for p in head) / len(head)
front = max(head, key=lambda p: p[1])
back = min(head, key=lambda p: p[1])
print("verts", len(pts), "height", round(top, 1), "head center", round(cx, 1), round(cy, 1), "+y extreme", [round(c, 1) for c in front], "-y extreme", [round(c, 1) for c in back])

studio.clear()
actor = studio.ACTORS.spawn_actor_from_class(unreal.StaticMeshActor, unreal.Vector(0, 0, 0), unreal.Rotator(0, 0, 0))
actor.static_mesh_component.set_static_mesh(mesh)
actor.set_actor_label(studio.TAG + "_target")
actor.tags = [studio.TAG]
center = unreal.Vector(cx, cy, top - 13.0)
distance, fov = 120.0, 20.0
cam = center + unreal.Vector(0, distance, 0)
rot = unreal.MathLibrary.find_look_at_rotation(cam, center)
cap = studio.ACTORS.spawn_actor_from_class(unreal.SceneCapture2D, cam, rot)
cap.tags = [studio.TAG]
comp = cap.capture_component2d
comp.fov_angle = fov
comp.capture_every_frame = False
comp.capture_source = unreal.SceneCaptureSource.SCS_FINAL_COLOR_LDR
comp.texture_target = unreal.RenderingLibrary.create_render_target2d(studio.world(), 1024, 1024, unreal.TextureRenderTargetFormat.RTF_RGBA8)
pp = comp.post_process_settings
pp.override_auto_exposure_method = True
pp.auto_exposure_method = unreal.AutoExposureMethod.AEM_MANUAL
pp.override_auto_exposure_bias = True
pp.auto_exposure_bias = 8.4
comp.post_process_settings = pp
comp.post_process_blend_weight = 1.0
up = unreal.Vector(0, 0, 1)
side = unreal.Vector(1, 0, 0)
for offset, power in [(side * 35 + up * 30, 8.0), (side * -35 + up * 30, 8.0), (up * -45, 3.5)]:
    loc = center + unreal.Vector(0, 110, 0) + offset
    studio.light(unreal.RectLight, loc, unreal.MathLibrary.find_look_at_rotation(loc, center), power)
json.dump({"location": [cam.x, cam.y, cam.z], "rotation": [rot.pitch, rot.yaw, rot.roll], "fov": fov}, open("C:/mallorca/renders/brunette_camera.json", "w"))
print("prep done")
