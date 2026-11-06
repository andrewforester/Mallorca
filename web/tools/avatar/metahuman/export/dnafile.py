import os
import sys
from pathlib import Path

sys.path.insert(0, os.environ.get("ORL_PYTHON", str(Path.home() / "workspace/mallorca-assets/build/orl/python/dna")))

import numpy as np
import dna

KEEP = []
MIN_DELTA_CM = 0.01


def load(path, layer=None):
    stream = dna.FileStream(str(path), dna.FileStream.AccessMode_Read, dna.FileStream.OpenMode_Binary)
    reader = dna.BinaryStreamReader(stream, dna.DataLayer_All if layer is None else layer)
    reader.read()
    KEEP.append((stream, reader))
    return reader


def write_behavior(src, out):
    stream = dna.FileStream(str(out), dna.FileStream.AccessMode_Write, dna.FileStream.OpenMode_Binary)
    writer = dna.BinaryStreamWriter(stream)
    writer.setFrom(load(src, dna.DataLayer_Behavior), dna.DataLayer_Behavior)
    writer.write()


def positions(r, m):
    return np.stack([r.getVertexPositionXs(m), r.getVertexPositionYs(m), r.getVertexPositionZs(m)], 1)


def mesh_index(r, name):
    return next(i for i in range(r.getMeshCount()) if r.getMeshName(i) == f"{name}_lod0_mesh")


def skin(r, m, count):
    si = np.zeros((count, 12), np.float32)
    sw = np.zeros((count, 12), np.float32)
    for v in range(count):
        idx = list(r.getSkinWeightsJointIndices(m, v))
        w = list(r.getSkinWeightsValues(m, v))
        si[v, :len(idx)] = idx
        sw[v, :len(w)] = w
    return si, sw


def faces(r, m):
    tris = []
    for f in range(r.getFaceCount(m)):
        c = list(r.getFaceVertexLayoutIndices(m, f))
        tris += [(c[0], c[k], c[k + 1]) for k in range(1, len(c) - 1)]
    return np.array(tris, np.uint32)


def targets(r, m, layout_of):
    out = []
    for t in range(r.getBlendShapeTargetCount(m)):
        vi = list(r.getBlendShapeTargetVertexIndices(m, t))
        d = np.stack([r.getBlendShapeTargetDeltaXs(m, t), r.getBlendShapeTargetDeltaYs(m, t),
                      r.getBlendShapeTargetDeltaZs(m, t)], 1)
        idx, dd = [], []
        for k, p in enumerate(vi):
            if np.linalg.norm(d[k]) < MIN_DELTA_CM:
                continue
            for li in layout_of.get(int(p), []):
                idx.append(li)
                dd.append(d[k])
        if idx:
            out.append((r.getBlendShapeChannelIndex(m, t), np.array(idx, np.uint32), np.array(dd, np.float32)))
    return out


def mesh_arrays(r, m):
    lay = np.array([r.getVertexLayoutPositionIndices(m), r.getVertexLayoutTextureCoordinateIndices(m),
                    r.getVertexLayoutNormalIndices(m)]).T
    pos = positions(r, m)
    uv = np.stack([r.getVertexTextureCoordinateUs(m), r.getVertexTextureCoordinateVs(m)], 1)
    nrm = np.stack([r.getVertexNormalXs(m), r.getVertexNormalYs(m), r.getVertexNormalZs(m)], 1)
    si, sw = skin(r, m, len(pos))
    layout_of = {}
    for li, pi in enumerate(lay[:, 0]):
        layout_of.setdefault(int(pi), []).append(li)
    return {
        "name": r.getMeshName(m).replace("_lod0_mesh", ""),
        "position": pos[lay[:, 0]].astype(np.float32),
        "normal": nrm[lay[:, 2]].astype(np.float32),
        "uv": uv[lay[:, 1]].astype(np.float32),
        "index": faces(r, m),
        "skinIndex": si[lay[:, 0]],
        "skinWeight": sw[lay[:, 0]],
        "targets": targets(r, m, layout_of),
        "layout": lay[:, 0],
    }
