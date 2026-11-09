from pathlib import Path

import numpy as np

from dnafile import load, mesh_arrays
from groom import nearest
from seated import rotation, seated
from skintone import body_color

SHARED_TOLERANCE_CM = 0.05
SEAM_CM = 0.02
LEGS = ("thigh_l", "thigh_r")
LOD = 1


def local_rows(r):
    return [[*r.getNeutralJointTranslation(j), *r.getNeutralJointRotation(j)] for j in range(r.getJointCount())]


def world_of(r):
    rows, out = local_rows(r), []
    for j, row in enumerate(rows):
        m = np.eye(4)
        m[:3, :3] = rotation(*row[3:])
        m[:3, 3] = row[:3]
        p = r.getJointParentIndex(j)
        out.append(m if p == j else out[p] @ m)
    return {r.getJointName(j): out[j] for j in range(len(out))}


def shared_joint_error(head_reader, body_reader):
    hw, bw = world_of(head_reader), world_of(body_reader)
    return max(float(np.linalg.norm(hw[n][:3, 3] - bw[n][:3, 3])) for n in hw if n in bw)


def leg_joints(r):
    names = [r.getJointName(j) for j in range(r.getJointCount())]
    legs = set()
    for j, n in enumerate(names):
        p = r.getJointParentIndex(j)
        if n in LEGS or (p != j and names[p] in legs):
            legs.add(n)
    return legs


def skeleton(head_names, r):
    names = [r.getJointName(j) for j in range(r.getJointCount())]
    legs = leg_joints(r)
    rows = local_rows(r)
    keep = [j for j, n in enumerate(names) if n not in head_names and n not in legs]
    parent = lambda j: "" if r.getJointParentIndex(j) == j else names[r.getJointParentIndex(j)]
    return {
        "joints": [names[j] for j in keep],
        "parents": [parent(j) for j in keep],
        "rest": [[float(v) for v in rows[j]] for j in keep],
    }


def joint_map(r, merged, legs):
    names = [r.getJointName(j) for j in range(r.getJointCount())]
    index = {n: i for i, n in enumerate(merged)}
    out = np.zeros(len(names), np.int64)
    for j, n in enumerate(names):
        k = j
        while names[k] in legs:
            k = r.getJointParentIndex(k)
        out[j] = index[names[k]]
    return out


def remap_skin(mesh, jmap):
    si = jmap[mesh["skinIndex"].astype(np.int64)]
    sw = mesh["skinWeight"].copy()
    for v in range(len(si)):
        for a in range(si.shape[1]):
            for b in range(a):
                if sw[v, a] > 0 and si[v, b] == si[v, a] and sw[v, b] > 0:
                    sw[v, b] += sw[v, a]
                    sw[v, a] = 0
    mesh["skinIndex"] = si.astype(np.float32)
    mesh["skinWeight"] = sw


def above(mesh, height):
    low = mesh["position"][:, 1] < height
    keep_tris(mesh, ~low[mesh["index"]].all(1))


def keep_tris(mesh, kept):
    tris = mesh["index"][kept]
    used = np.unique(tris)
    new = np.full(len(mesh["position"]), -1, np.int64)
    new[used] = np.arange(len(used))
    for key in ("position", "normal", "uv", "skinIndex", "skinWeight", "layout"):
        mesh[key] = mesh[key][used]
    mesh["index"] = new[tris].astype(np.uint32)


def seam_normals(mesh, face):
    near = nearest(mesh["position"], face["position"])
    gap = np.linalg.norm(mesh["position"] - face["position"][near], axis=1)
    hits = np.flatnonzero(gap < SEAM_CM)
    for v in hits:
        same = np.flatnonzero(np.linalg.norm(face["position"] - face["position"][near[v]], axis=1) < SEAM_CM)
        n = mesh["normal"][v] + face["normal"][same].sum(0) / len(same)
        n /= max(np.linalg.norm(n), 1e-9)
        mesh["normal"][v] = n
        face["normal"][same] = n
    return len(hits)


def seam_height(mesh, face):
    near = nearest(mesh["position"], face["position"])
    gap = np.linalg.norm(mesh["position"] - face["position"][near], axis=1)
    return float(mesh["position"][gap < SEAM_CM, 1].mean())


def body_mesh(r, merged, face):
    m = next(i for i in r.getMeshIndicesForLOD(LOD))
    mesh = mesh_arrays(r, m)
    mesh["name"] = "body"
    mesh["targets"] = []
    remap_skin(mesh, joint_map(r, merged, leg_joints(r)))
    above(mesh, world_of(r)["pelvis"][1, 3])
    seam_normals(mesh, face)
    return mesh


def body(src, header, face, out):
    src = Path(src)
    head_reader, r = load(src / "head.dna"), load(src / "body.dna")
    error = shared_joint_error(head_reader, r)
    if error > SHARED_TOLERANCE_CM:
        raise SystemExit(f"shared joints differ by {error:.4f} cm")
    part = {"body": skeleton(set(header["joints"]), r)}
    merged = header["joints"] + part["body"]["joints"]
    part["pose"] = {"sitting": seated(src / "body.dna", set(merged))}
    mesh = body_mesh(r, merged, face)
    body_color(src, mesh, face, seam_height(mesh, face), out)
    return part, [mesh]
