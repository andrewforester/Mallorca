import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

from dnafile import faces, load, positions

Image.MAX_IMAGE_PIXELS = None
BROW = np.array([40, 28, 22], np.float32)
BROW_SPREAD = 3
BROW_GAMMA = 0.8
HAIR = np.array([38, 26, 20], np.float32)
LASH = np.array([34, 22, 17], np.float32)
HAIRSTYLES = json.loads(Path(__file__).with_name("hairstyles.json").read_text())
SCALP_SIZE = 512
SCALP_BLUR = 2
SNAP_CM = 3.0
FIT_GAP_CM = 0.25
FIT_START_CM = 1.5
FIT_SHARE = 0.1
FIT_STEPS = 60


def nearest(points, ref):
    out = np.zeros(len(points), np.int64)
    ref32 = ref.astype(np.float32)
    rn = (ref32 ** 2).sum(1)
    for a in range(0, len(points), 2048):
        p = points[a:a + 2048].astype(np.float32)
        out[a:a + 2048] = (rn[None, :] - 2 * p @ ref32.T).argmin(1)
    return out


def read_cards(folder):
    P, U, I = [], [], []
    for f in sorted(folder.glob("hair_g*_s*.json")):
        d = json.loads(f.read_text())
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


def fit(P, ctx):
    arch, normal = ctx["arch"], ctx["arch_normal"]
    t = np.array([0.0, arch[:, 1].max() + FIT_START_CM - P[:, 1].max(), 0.0])
    for _ in range(FIT_STEPS):
        q = P + t
        near = nearest(q, arch)
        off = q - arch[near]
        d = np.linalg.norm(off, axis=1)
        k = d <= np.quantile(d, FIT_SHARE)
        n = normal[near[k]]
        step = np.linalg.lstsq(n, FIT_GAP_CM - (n * off[k]).sum(1), rcond=None)[0]
        t += step
        if np.linalg.norm(step) < 1e-3:
            break
    return t if np.linalg.norm(t) > SNAP_CM else np.zeros(3)


def card_mesh(name, P, U, I, ctx):
    near = nearest(P, ctx["arch"])
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


def brow_alpha(path, size):
    a = Image.open(path).convert("RGBA").getchannel("A").filter(ImageFilter.MaxFilter(BROW_SPREAD))
    return (np.asarray(a.resize(size), np.float32) / 255) ** BROW_GAMMA


def head_color(src, out):
    base = Image.open(src / "Synth/BASECOLOR").convert("RGB")
    col = np.asarray(base, np.float32)
    col = paint(col, brow_alpha(src / "cards/Eyebrows_M_Natural_baked.tga", base.size), BROW, 1.15, 0.9)
    Image.fromarray(col.clip(0, 255).astype(np.uint8)).save(out / "head_color_map.webp", quality=90)


def scalp(folder, out):
    roots = np.asarray(Image.open(next(folder.glob("*_Roo*UV*.tga"))).convert("RGBA"), np.float32) / 255
    grown = roots[..., 3] > 0.1
    u, v = roots[..., 0][grown], roots[..., 1][grown]
    h = np.histogram2d(v * SCALP_SIZE, u * SCALP_SIZE, bins=SCALP_SIZE, range=[[0, SCALP_SIZE]] * 2)[0]
    density = np.clip(h / np.quantile(h[h > 0], 0.5), 0, 1)
    mask = Image.fromarray((density * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(SCALP_BLUR))
    mask.save(out / "scalp.webp", quality=90)


def hair_texture(folder, out):
    attr = Image.open(next(folder.glob("*_CardsAtlas_Attribute.tga"))).convert("RGB").resize((2048, 2048))
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


def archetype_normals(ar):
    layout = np.array(ar.getVertexLayoutPositionIndices(0))
    return vertex_normals(positions(ar, 0), layout[faces(ar, 0).astype(np.int64)])


def hairstyle(key, ctx, out):
    folder = ctx["cards"] / HAIRSTYLES[key]
    P, U, I = read_cards(folder)
    shift = fit(P, ctx)
    place = out / "hair" / key
    place.mkdir(parents=True, exist_ok=True)
    hair_texture(folder, place)
    scalp(folder, place)
    return {"key": key, "shift": shift, "mesh": card_mesh("cards", P + shift, U, I, ctx)}


def groom(src, archetype, head_mesh, out):
    src, out = Path(src), Path(out)
    ar = load(archetype)
    r = load(src / "head.dna")
    first = np.zeros(int(head_mesh["layout"].max()) + 1, np.int64)
    first[head_mesh["layout"][::-1]] = np.arange(len(head_mesh["layout"]))[::-1]
    ctx = {"cards": src / "cards", "arch": positions(ar, 0), "arch_normal": archetype_normals(ar),
           "pos": positions(r, 0), "first": first, "head": head_mesh}
    head_color(src, out)
    lashes(src, out)
    return [hairstyle(key, ctx, out) for key in HAIRSTYLES]
