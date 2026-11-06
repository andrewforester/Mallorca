import os
import unreal
dst = open("C:/mallorca/ue/current_asset.txt").read().strip()
c = unreal.load_asset(dst)
world = unreal.get_editor_subsystem(unreal.UnrealEditorSubsystem).get_editor_world()
out = "C:/mallorca/export/synth"
os.makedirs(out, exist_ok=True)
for k, t in c.synthesized_face_textures.items():
    if t is None:
        continue
    w = t.blueprint_get_size_x()
    h = t.blueprint_get_size_y()
    name = str(k).split(".")[-1].split(":")[0].strip("<> ")
    rt = unreal.RenderingLibrary.create_render_target2d(world, w, h, unreal.TextureRenderTargetFormat.RTF_RGBA8_SRGB if "ALBEDO" in name.upper() or "BASE" in name.upper() else unreal.TextureRenderTargetFormat.RTF_RGBA8)
    canvas, size, ctx = unreal.RenderingLibrary.begin_draw_canvas_to_render_target(world, rt)
    canvas.draw_texture(t, unreal.Vector2D(0, 0), unreal.Vector2D(w, h), unreal.Vector2D(0, 0), unreal.Vector2D(1, 1), unreal.LinearColor(1, 1, 1, 1), unreal.BlendMode.BLEND_OPAQUE)
    unreal.RenderingLibrary.end_draw_canvas_to_render_target(world, ctx)
    unreal.RenderingLibrary.export_render_target(world, rt, out, name)
    print(name, w, h)
