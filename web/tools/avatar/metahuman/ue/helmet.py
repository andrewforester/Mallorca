import json
import unreal
m = "/MetaHumanCharacter/Optional/Grooms/GroomAssets/Hair/Hair_L_StraightBangs/Hair_L_StraightBangs_Helmet_LOD5"
sm = unreal.load_asset(m)
out = []
for sec in range(sm.get_num_sections(0)):
    v, t, n, uv, tg = unreal.ProceduralMeshLibrary.get_section_from_static_mesh(sm, 0, sec)
    out.append({"positions": [[p.x, p.y, p.z] for p in v], "triangles": list(t), "uvs": [[u.x, u.y] for u in uv]})
json.dump(out[0] if len(out) == 1 else {"positions": sum((o["positions"] for o in out), []), "triangles": [], "uvs": []}, open("C:/mallorca/export/cards/helmet.json", "w"))
print("helmet sections", len(out), [len(o["positions"]) for o in out])
mats = [str(s.material_interface.get_path_name()) if s.material_interface else None for s in sm.static_materials]
print("materials", mats)
