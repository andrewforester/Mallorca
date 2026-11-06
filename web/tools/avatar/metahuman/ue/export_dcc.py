import os
import unreal
sub = unreal.get_editor_subsystem(unreal.MetaHumanCharacterEditorSubsystem)
dst = open("C:/mallorca/ue/current_asset.txt").read().strip()
name = dst.split("/")[-1]
c = unreal.load_asset(dst)
if not sub.is_object_added_for_editing(c):
    sub.try_add_object_to_edit(c)
print("hires", c.has_high_resolution_textures, "preview", c.preview_material_type)
out = "C:/mallorca/export/" + name + "_2"
dcc = unreal.MetaHumanDCCExportParams()
dcc.external_path = out
dcc.bake_make_up = True
dcc.compress_in_zip_file = False
dcc.archive_name = name
unreal.MetaHumanCharacterExportBlueprintLibrary.export_dcc(c, dcc)
print("exported", out)
