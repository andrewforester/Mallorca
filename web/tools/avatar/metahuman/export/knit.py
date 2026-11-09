from pathlib import Path

import numpy as np
from PIL import Image

SIZE = 512
COLUMNS = 8
ROWS = 10
LEAN = np.radians(62)
STRENGTH = 5.0


def leg(x, y, cx, cy, angle, length, width):
    dx, dy = x - cx, y - cy
    along = dx * np.cos(angle) + dy * np.sin(angle)
    across = -dx * np.sin(angle) + dy * np.cos(angle)
    return np.exp(-(along / length) ** 2 - (across / width) ** 2)


def stitch_height():
    w, h = SIZE / COLUMNS, SIZE / ROWS
    y, x = np.mgrid[0:SIZE, 0:SIZE].astype(np.float64)
    lx, ly = np.mod(x, w), np.mod(y, h)
    height = np.zeros((SIZE, SIZE))
    for oy in (-h, 0.0, h):
        cy = h / 2 + oy
        height = np.maximum(height, leg(lx, ly, w * 0.3, cy, LEAN, h * 0.55, w * 0.16))
        height = np.maximum(height, leg(lx, ly, w * 0.7, cy, np.pi - LEAN, h * 0.55, w * 0.16))
    return height


def normal_map(height):
    gy, gx = np.gradient(height)
    n = np.stack([-gx * STRENGTH, gy * STRENGTH, np.ones_like(height)], -1)
    n /= np.linalg.norm(n, axis=2, keepdims=True)
    return ((n * 0.5 + 0.5) * 255).round().astype(np.uint8)


def knit(out):
    out = Path(out)
    height = stitch_height()
    Image.fromarray(normal_map(height)).save(out / "knit_normal_map.webp", quality=90)
