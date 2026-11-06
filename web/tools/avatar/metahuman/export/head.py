import json
from pathlib import Path

import numpy as np
from PIL import Image

from controls import mapping
from dnafile import load, mesh_arrays, write_behavior

MESHES = ["head", "teeth", "saliva", "eyeLeft", "eyeRight", "eyeshell", "eyelashes", "eyeEdge", "cartilage"]
MASK_SIZE = 128
CHANNELS = Path(__file__).with_name("mask_channels.json")
MAPS = {
    "head_normal_map": ("Synth/NORMAL", 2048),
    "head_wm1_normal_map": ("Maps/Head_Normal_Animated_WM1.png", 1024),
    "head_wm2_normal_map": ("Maps/Head_Normal_Animated_WM2.png", 1024),
    "head_wm3_normal_map": ("Maps/Head_Normal_Animated_WM3.png", 1024),
    "teeth_color_map": ("Maps/Teeth_Color.png", 1024),
    "teeth_normal_map": ("Maps/Teeth_Normal.png", 1024),
    "eyes_color_map": ("Maps/Eyes_Color.png", 1024),
    "eyes_normal_map": ("Maps/Eyes_Normal.png", 1024),
}


def header_of(r):
    map_names = [r.getAnimatedMapName(i) for i in range(r.getAnimatedMapCount())]
    return {
        "controls": [r.getRawControlName(i).split(".", 1)[1] for i in range(r.getRawControlCount())],
        "joints": [r.getJointName(j) for j in range(r.getJointCount())],
        "parents": [r.getJointParentIndex(j) for j in range(r.getJointCount())],
        "maps": map_names,
        "masks": sorted({n.split(".", 1)[1] for n in map_names}),
        "maskSize": MASK_SIZE,
    }


def write_masks(src, names, out):
    channels = json.loads(CHANNELS.read_text())
    layers = []
    for n in names:
        file, c = channels[n]
        im = np.asarray(Image.open(src / "Masks" / file).convert("RGBA").resize((MASK_SIZE, MASK_SIZE), Image.LANCZOS))[..., c]
        layers.append(im[::-1])
    np.stack(layers).astype(np.uint8).tofile(out / "masks.r8")


def write_maps(src, out):
    for name, (file, size) in MAPS.items():
        Image.open(src / file).convert("RGB").resize((size, size), Image.LANCZOS).save(out / f"{name}.webp", quality=82)
    g = np.asarray(Image.open(src / "Maps/Head_SRMF.png").convert("RGBA"))[..., 1]
    Image.fromarray(g).resize((1024, 1024), Image.LANCZOS).convert("RGB").save(out / "head_roughness_map.webp", quality=88)


def head(src, out):
    src, out = Path(src), Path(out)
    r = load(src / "head.dna")
    meshes = [mesh_arrays(r, m) for m in r.getMeshIndicesForLOD(0)
              if r.getMeshName(m).replace("_lod0_mesh", "") in MESHES]
    header = header_of(r)
    write_masks(src, header["masks"], out)
    write_maps(src, out)
    write_behavior(src / "head.dna", out / "behavior.dna")
    (out / "mapping.json").write_text(json.dumps(mapping()))
    return header, meshes
