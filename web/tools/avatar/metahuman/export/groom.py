import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

from dnafile import load, positions

Image.MAX_IMAGE_PIXELS = None
BROW = np.array([40, 28, 22], np.float32)
HAIR = np.array([38, 26, 20], np.float32)
LASH = np.array([34, 22, 17], np.float32)
HAIR_CARDS = ["hair_g0_s0.json", "hair_g1_s0.json"]
HELMET_REACH_CM = 3.0


def nearest(points, ref):
    out = np.zeros(len(points), np.int64)
    ref32 = ref.astype(np.float32)
    rn = (ref32 ** 2).sum(1)
    for a in range(0, len(points), 2048):
        p = points[a:a + 2048].astype(np.float32)
        out[a:a + 2048] = (rn[None, :] - 2 * p @ ref32.T).argmin(1)
    return out


def read_cards(cards, files):
    P, U, I = [], [], []
    for f in files:
        d = json.loads((cards / f).read_text())
        p = np.array(d["positions"], np.float64)[:, [0, 2, 1]]
        I.append(np.array(d["triangles"], np.int64).reshape(-1, 3)[:, ::-1] + sum(len(x) for x in P))
        P.append(p)
        U.append(np.array(d["uvs"], np.float32) if d["uvs"] else np.zeros((len(p), 2), np.float32))
    return np.concatenate(P), np.concatenate(U), np.concatenate(I)


def vertex_normals(pos, tris):
    nrm = np.zeros_like(pos)
    t = pos[tris]
    fn = np.cross(t[:, 1] - t[:, 0], t[:, 2] - t[:, 0])
    for c in range(3):
        np.add.at(nrm, tris[:, c], fn)
    return nrm / np.maximum(np.linalg.norm(nrm, axis=1, keepdims=True), 1e-9)


def card_mesh(name, files, ctx, reach=None):
    P, U, I = read_cards(ctx["cards"], files)
    near = nearest(P, ctx["arch"])
    if reach is not None:
        far = np.linalg.norm(P - ctx["arch"][near], axis=1) > reach
        I = I[~far[I].any(1)]
    follow = ctx["first"][near]
    head = ctx["head"]
    pos = (ctx["pos"][near] + (P - ctx["arch"][near])).astype(np.float32)
    return {
        "name": name,
        "position": pos,
        "normal": vertex_normals(pos, I).astype(np.float32),
        "uv": U,
        "index": I.astype(np.uint32),
        "skinIndex": head["skinIndex"][follow],
        "skinWeight": head["skinWeight"][follow],
        "targets": [],
        "follow": follow.astype(np.uint32),
    }


def paint(color, mask, tone, gain, cap):
    a = np.clip(mask * gain, 0, cap)[..., None]
    return color * (1 - a) + tone * a


def alpha_of(path, size):
    return np.asarray(Image.open(path).convert("RGBA").getchannel("A").resize(size), np.float32) / 255


def head_color(src, out):
    base = Image.open(src / "Synth/BASECOLOR").convert("RGB")
    col = np.asarray(base, np.float32)
    col = paint(col, alpha_of(src / "cards/Eyebrows_M_Natural_baked.tga", base.size), BROW, 1.1, 0.92)
    col = paint(col, alpha_of(src / "cards/Hair_L_StraightBangs_baked.tga", base.size), HAIR, 1.3, 0.95)
    Image.fromarray(col.clip(0, 255).astype(np.uint8)).save(out / "head_color_map.webp", quality=90)


def hair_texture(src, out):
    attr = Image.open(src / "cards/Hair_L_StraightBangs_CardsAtlas_Attribute.tga").convert("RGB").resize((2048, 2048))
    attr = np.asarray(attr, np.float32) / 255
    cover, along = attr[..., 0], attr[..., 1]
    shade = np.where(cover > 0.05, 0.8 + 0.4 * along, 0.95)[..., None]
    rgba = np.dstack([np.clip(HAIR * shade, 0, 255), np.clip(cover, 0, 1) ** 0.55 * 255]).astype(np.uint8)
    Image.fromarray(rgba, "RGBA").save(out / "hair_cards.webp", quality=90)


def lashes(src, out):
    im = np.asarray(Image.open(src / "Maps/Eyelashes_Color.png").convert("RGBA"))
    a = np.asarray(Image.fromarray(im[..., 3]).filter(ImageFilter.MaxFilter(5)), np.float32)
    a = np.clip((a / 255) ** 0.4 * 1.4, 0, 1)
    rgb = np.broadcast_to(LASH, im.shape[:2] + (3,))
    Image.fromarray(np.dstack([rgb, a * 255]).astype(np.uint8), "RGBA").resize((1024, 1024), Image.LANCZOS).save(
        out / "eyelashes.webp", quality=90)


def groom(src, archetype, head_mesh, out):
    src, out = Path(src), Path(out)
    ar = load(archetype)
    r = load(src / "head.dna")
    first = np.zeros(int(head_mesh["layout"].max()) + 1, np.int64)
    first[head_mesh["layout"][::-1]] = np.arange(len(head_mesh["layout"]))[::-1]
    ctx = {"cards": src / "cards", "arch": positions(ar, 0), "pos": positions(r, 0), "first": first, "head": head_mesh}
    head_color(src, out)
    hair_texture(src, out)
    lashes(src, out)
    return [card_mesh("cards", HAIR_CARDS, ctx), card_mesh("helmet", ["helmet.json"], ctx, HELMET_REACH_CM)]
