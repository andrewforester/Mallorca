import json
import shutil
from pathlib import Path

from PIL import Image

TEXTURE_SIZE = 512


def glasses(src, out):
    src, out = Path(src), Path(out)
    (out / "textures").mkdir(parents=True, exist_ok=True)
    gltf = json.loads((src / "round_spectacles_1k.gltf").read_text())
    for image in gltf["images"]:
        name = Path(image["uri"]).with_suffix(".webp").name
        Image.open(src / image["uri"]).convert("RGB").resize((TEXTURE_SIZE, TEXTURE_SIZE), Image.LANCZOS).save(
            out / "textures" / name, quality=88)
        image["uri"] = f"textures/{name}"
        image["mimeType"] = "image/webp"
    shutil.copy(src / gltf["buffers"][0]["uri"], out / gltf["buffers"][0]["uri"])
    (out / "glasses.gltf").write_text(json.dumps(gltf))
