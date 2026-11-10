import json
import os
import unreal
reg = unreal.AssetRegistryHelpers.get_asset_registry()
out = "C:/mallorca/export/cards"
grooms = "/MetaHumanCharacter/Optional/Grooms/GroomAssets/"
hairstyles = json.load(open("C:/mallorca/ue/hairstyles.json"))
roots = {name: (grooms + "Hair/" + name, "hair") for name in hairstyles.values()}
roots["Eyebrows_M_Natural"] = (grooms + "Eyebrows/Eyebrows_M_Natural", "brows")


def export_texture(asset, folder):
    task = unreal.AssetExportTask()
    task.object = unreal.load_asset(str(asset.package_name))
    task.filename = os.path.join(folder, str(asset.asset_name) + ".tga")
    task.automated = True
    task.prompt = False
    return {"file": str(asset.asset_name) + ".tga", "ok": unreal.Exporter.run_asset_export_task(task)}


def export_cards(root, key, folder):
    assets = list(reg.get_assets_by_path(root, recursive=True))
    meshes = sorted(str(a.package_name) for a in assets if str(a.asset_class_path.asset_name) == "StaticMesh" and "CardsMesh" in str(a.package_name))
    groups = {}
    for m in meshes:
        g = m.split("_Group")[1].split("_")[0]
        lod = int(m.split("_LOD")[-1])
        if g not in groups or lod < groups[g][1]:
            groups[g] = (m, lod)
    manifest = {"meshes": [], "textures": []}
    for g, (m, lod) in sorted(groups.items()):
        sm = unreal.load_asset(m)
        for sec in range(sm.get_num_sections(0)):
            verts, tris, normals, uvs, tangents = unreal.ProceduralMeshLibrary.get_section_from_static_mesh(sm, 0, sec)
            data = {"positions": [[v.x, v.y, v.z] for v in verts], "triangles": list(tris), "uvs": [[u.x, u.y] for u in uvs]}
            fn = "%s_g%s_s%d.json" % (key, g, sec)
            json.dump(data, open(os.path.join(folder, fn), "w"))
            manifest["meshes"].append({"file": fn, "source": m, "lod": lod, "verts": len(verts)})
    for a in assets:
        if str(a.asset_class_path.asset_name) == "Texture2D":
            manifest["textures"].append(export_texture(a, folder))
    json.dump(manifest, open(os.path.join(folder, "manifest.json"), "w"), indent=1)
    return manifest


for name, (root, key) in roots.items():
    folder = out if key == "brows" else os.path.join(out, name)
    os.makedirs(folder, exist_ok=True)
    manifest = export_cards(root, key, folder)
    print(name, len(manifest["meshes"]), [t["file"] for t in manifest["textures"]])
