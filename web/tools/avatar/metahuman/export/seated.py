import os
import sys
from pathlib import Path

import numpy as np

from dnafile import load

sys.path.insert(0, os.environ.get("ORL_RIGLOGIC", str(Path(os.environ.get(
    "ORL_PYTHON", str(Path.home() / "workspace/mallorca-assets/build/orl/python/dna"))).parent / "riglogic")))

import riglogic

IN, FWD = (0.0, 1.0, 0.0), (0.0, 0.0, -1.0)
SEATED = {
    "clavicle": [(FWD, 4.0), (IN, 6.0)],
    "upperarm": [(IN, 16.0), (FWD, 12.0)],
    "lowerarm": [(FWD, 25.0)],
}
MIN_MOVE_CM = 0.01
MIN_TURN_DEG = 0.05


def rotation(rx, ry, rz):
    x, y, z = np.radians([rx, ry, rz])
    cx, sx, cy, sy, cz, sz = np.cos(x), np.sin(x), np.cos(y), np.sin(y), np.cos(z), np.sin(z)
    rot_x = np.array([[1, 0, 0], [0, cx, -sx], [0, sx, cx]])
    rot_y = np.array([[cy, 0, sy], [0, 1, 0], [-sy, 0, cy]])
    rot_z = np.array([[cz, -sz, 0], [sz, cz, 0], [0, 0, 1]])
    return rot_z @ rot_y @ rot_x


def quaternion(turns):
    q = np.array([0.0, 0.0, 0.0, 1.0])
    for axis, deg in turns:
        h = np.radians(deg) / 2
        b = np.array([*(np.array(axis) * np.sin(h)), np.cos(h)])
        q = np.array([
            q[3] * b[0] + q[0] * b[3] + q[1] * b[2] - q[2] * b[1],
            q[3] * b[1] - q[0] * b[2] + q[1] * b[3] + q[2] * b[0],
            q[3] * b[2] + q[0] * b[1] - q[1] * b[0] + q[2] * b[3],
            q[3] * b[3] - q[0] * b[0] - q[1] * b[1] - q[2] * b[2],
        ])
    return q


def matrix(q):
    x, y, z, w = q
    return np.array([
        [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
        [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
        [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)],
    ])


def euler(m):
    ry = np.arcsin(-np.clip(m[2, 0], -1, 1))
    rx = np.arctan2(m[2, 1], m[2, 2])
    rz = np.arctan2(m[1, 0], m[0, 0])
    return [float(np.degrees(rx)), float(np.degrees(ry)), float(np.degrees(rz))]


def drivers():
    return {f"{bone}_{side}": quaternion(turns) for bone, turns in SEATED.items() for side in "lr"}


def driver_row(r, j, q):
    t = list(r.getNeutralJointTranslation(j))
    return [float(v) for v in t] + euler(rotation(*r.getNeutralJointRotation(j)) @ matrix(q))


def evaluate(r, quats):
    rl = riglogic.RigLogic(r)
    ri = riglogic.RigInstance(rl)
    controls = [r.getRawControlName(i) for i in range(r.getRawControlCount())]
    for i, c in enumerate(controls):
        joint, part = c.split(".")
        q = quats.get(joint, np.array([0.0, 0.0, 0.0, 1.0]))
        ri.setRawControl(i, float(q["xyzw".index(part[1])]))
    rl.calculate(ri)
    return np.array(ri.getJointOutputs()).reshape(-1, 9), np.array(rl.getNeutralJointValues()).reshape(-1, 9)


def seated(body_dna, keep):
    r = load(body_dna)
    names = [r.getJointName(j) for j in range(r.getJointCount())]
    quats = drivers()
    delta, neutral = evaluate(r, quats)
    out = {}
    for j, n in enumerate(names):
        if n not in keep:
            continue
        if n in quats:
            out[n] = driver_row(r, j, quats[n])
        elif np.abs(delta[j, :3]).max() > MIN_MOVE_CM or np.abs(delta[j, 3:6]).max() > MIN_TURN_DEG:
            out[n] = [float(v) for v in neutral[j, :6] + delta[j, :6]]
    return out
