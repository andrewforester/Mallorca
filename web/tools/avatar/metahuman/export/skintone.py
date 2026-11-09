from pathlib import Path

import numpy as np
from PIL import Image

NECK_CM = 4.0
SIZE = 1024
D65 = np.array([0.95047, 1.0, 1.08883])
RGB_XYZ = np.array([[0.4124, 0.3576, 0.1805], [0.2126, 0.7152, 0.0722], [0.0193, 0.1192, 0.9505]])


def to_linear(c):
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def to_srgb(c):
    c = np.clip(c, 0, 1)
    return np.where(c <= 0.0031308, c * 12.92, 1.055 * c ** (1 / 2.4) - 0.055)


def lab(rgb):
    xyz = to_linear(rgb) @ RGB_XYZ.T / D65
    f = np.where(xyz > 0.008856, np.cbrt(xyz), 7.787 * xyz + 16 / 116)
    return np.stack([116 * f[..., 1] - 16, 500 * (f[..., 0] - f[..., 1]), 200 * (f[..., 1] - f[..., 2])], -1)


def rgb(lab_values):
    fy = (lab_values[..., 0] + 16) / 116
    f = np.stack([fy + lab_values[..., 1] / 500, fy, fy - lab_values[..., 2] / 200], -1)
    xyz = np.where(f > 0.2069, f ** 3, (f - 16 / 116) / 7.787) * D65
    return to_srgb(xyz @ np.linalg.inv(RGB_XYZ).T)


def samples(image, uv):
    h, w = image.shape[:2]
    x = np.clip((uv[:, 0] * w).astype(int), 0, w - 1)
    y = np.clip(((1 - uv[:, 1]) * h).astype(int), 0, h - 1)
    return image[y, x]


def neck(mesh, seam_y, side):
    y = mesh["position"][:, 1]
    band = (y > seam_y) & (y < seam_y + NECK_CM) if side > 0 else (y < seam_y) & (y > seam_y - NECK_CM)
    return mesh["uv"][band]


def body_color(src, body_mesh, face, seam_y, out):
    src, out = Path(src), Path(out)
    head = np.asarray(Image.open(src / "Synth/BASECOLOR").convert("RGB"), np.float64) / 255
    body = np.asarray(Image.open(src / "Maps/Body_Basecolor.png").convert("RGB").resize((SIZE, SIZE), Image.LANCZOS),
                      np.float64) / 255
    want = lab(samples(head, neck(face, seam_y, +1)))
    have = lab(samples(body, neck(body_mesh, seam_y, -1)))
    scale = want.std(0) / np.maximum(have.std(0), 1e-6)
    moved = (lab(body) - have.mean(0)) * scale + want.mean(0)
    Image.fromarray((rgb(moved) * 255).round().astype(np.uint8)).save(out / "body_color_map.webp", quality=88)
    Image.open(src / "Maps/Body_Normal.png").convert("RGB").resize((SIZE, SIZE), Image.LANCZOS).save(
        out / "body_normal_map.webp", quality=82)
