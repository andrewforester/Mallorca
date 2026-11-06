import sys
sys.path.insert(0, "C:/mallorca/ue")
import importlib
import json
import studio
importlib.reload(studio)
import unreal

SUB = studio.SUB
print("curves on portrait", studio.capture("brunette"))
cam = json.load(open("C:/mallorca/renders/brunette_camera.json"))
size, pixels = unreal.PromotedFrameUtils.get_promoted_frame_as_pixel_array_from_disk("C:/mallorca/renders/brunette")
result = SUB.track_face_landmarks_from_image(pixels, size.x, size.y)
if isinstance(result, tuple) and len(result) == 1:
    result = result[0]
mesh = unreal.load_asset("/Game/Targets/BrunetteBody")
verts, idx, *_ = SUB.get_mesh_data_for_conforming(mesh)
n = 1
while unreal.EditorAssetLibrary.does_asset_exist("/Game/Her/Brunette_%d" % n):
    n += 1
name = "Brunette_%d" % n
character = unreal.AssetToolsHelpers.get_asset_tools().create_asset(asset_name=name, package_path="/Game/Her", asset_class=unreal.MetaHumanCharacter, factory=unreal.new_object(type=unreal.MetaHumanCharacterFactoryNew))
SUB.try_add_object_to_edit(character)
params = unreal.ConformTargetParams()
params.conform_target_mesh.target_parts_type = unreal.TargetPartsType.COMBINED
params.conform_target_mesh.body_vertices = verts
params.conform_target_mesh.body_vertex_indices = idx
params.estimate_body_joints_from_mesh = True
params.auto_solve = True
params.body_conform_solve_settings.pipeline_name = "combined"
view = unreal.MinimalViewInfo()
view.location = unreal.Vector(*cam["location"])
view.rotation = unreal.Rotator(roll=cam["rotation"][2], pitch=cam["rotation"][0], yaw=cam["rotation"][1])
view.fov = cam["fov"]
view.aspect_ratio = float(size.x) / float(size.y)
view.projection_mode = unreal.CameraProjectionMode.PERSPECTIVE
params.curve_tracking_points = result
params.camera_view_info = view
params.image_size = size
key = unreal.MetaHumanCharacterTargetMeshKey()
key.combined_mesh = mesh
ok = SUB.conform_to_target_meshes(character, key, params)
print("conform", ok)
if ok:
    SUB.commit_posed_state_as_a_pose(character, key)
    unreal.EditorAssetLibrary.save_asset("/Game/Her/" + name)
open("C:/mallorca/ue/current_asset.txt", "w").write("/Game/Her/" + name)
print("character", name)
