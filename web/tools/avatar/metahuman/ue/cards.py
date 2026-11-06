import json
import os
import unreal
reg = unreal.AssetRegistryHelpers.get_asset_registry()
out = "C:/mallorca/export/cards"
os.makedirs(out, exist_ok=True)
roots = {"hair": "/MetaHumanCharacter/Optional/Grooms/GroomAssets/Hair/Hair_L_StraightBangs", "brows": "/MetaHumanCharacter/Optional/Grooms/GroomAssets/Eyebrows/Eyebrows_M_Natural"}
manifest = {}
for key, root in roots.items():
    assets = [a for a in reg.get_assets_by_path(root, recursive=True)]
    meshes = sorted(str(a.package_name) for a in assets if str(a.asset_class_path.asset_name) == "StaticMesh" and "CardsMesh" in str(a.package_name))
    groups = {}
    for m in meshes:
        g = m.split("_Group")[1].split("_")[0]
        lod = int(m.split("_LOD")[-1])
        if g not in groups or lod < groups[g][1]:
            groups[g] = (m, lod)
    manifest[key] = {"meshes": [], "textures": []}
    for g, (m, lod) in sorted(groups.items()):
        sm = unreal.load_asset(m)
        n_sections = sm.get_num_sections(0)
        for sec in range(n_sections):
            verts, tris, normals, uvs, tangents = unreal.ProceduralMeshLibrary.get_section_from_static_mesh(sm, 0, sec)
            data = {"positions": [[v.x, v.y, v.z] for v in verts], "triangles": list(tris), "normals": [[v.x, v.y, v.z] for v in normals], "uvs": [[u.x, u.y] for u in uvs]}
            fn = "%s_g%s_s%d.json" % (key, g, sec)
            json.dump(data, open(os.path.join(out, fn), "w"))
            manifest[key]["meshes"].append({"file": fn, "source": m, "lod": lod, "verts": len(verts)})
    for a in assets:
        if str(a.asset_class_path.asset_name) == "Texture2D":
            t = unreal.load_asset(str(a.package_name))
            task = unreal.AssetExportTask()
            task.object = t
            task.filename = os.path.join(out, str(a.asset_name) + ".tga")
            task.automated = True
            task.prompt = False
            ok = unreal.Exporter.run_asset_export_task(task)
            manifest[key]["textures"].append({"file": str(a.asset_name) + ".tga", "ok": ok})
json.dump(manifest, open(os.path.join(out, "manifest.json"), "w"), indent=1)
print(json.dumps(manifest)[:1500])
