from pathlib import Path

import numpy as np

from dnafile import load, mesh_arrays
from groom import nearest
from seated import rotation, seated
from skintone import body_color
from knit import knit
from sweater import keep_tris, marks_of, sweater

SHARED_TOLERANCE_CM = 0.05
SEAM_CM = 0.02
LEGS = ("thigh_l", "thigh_r")
LOD = 0
HEM_ABOVE_PELVIS_CM = 6.0


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


def body_meshes(r, merged, face, colour):
    m = next(i for i in r.getMeshIndicesForLOD(LOD))
    mesh = mesh_arrays(r, m)
    mesh["name"] = "body"
    mesh["targets"] = []
    mesh["uv"] = mesh["uv"] - np.floor(mesh["uv"].min(0))
    remap_skin(mesh, joint_map(r, merged, leg_joints(r)))
    world = world_of(r)
    pelvis = world["pelvis"][1, 3]
    colour(mesh, seam_height(mesh, face))
    worn, covered = sweater(mesh, face, merged, marks_of(world), pelvis + HEM_ABOVE_PELVIS_CM)
    keep_tris(mesh, ~covered[mesh["index"]].all(1))
    above(mesh, pelvis)
    seam_normals(mesh, face)
    return mesh, worn


def body(src, header, face, out):
    src = Path(src)
    head_reader, r = load(src / "head.dna"), load(src / "body.dna")
    error = shared_joint_error(head_reader, r)
    if error > SHARED_TOLERANCE_CM:
        raise SystemExit(f"shared joints differ by {error:.4f} cm")
    part = {"body": skeleton(set(header["joints"]), r)}
    merged = header["joints"] + part["body"]["joints"]
    part["pose"] = {"sitting": seated(src / "body.dna", set(merged))}
    mesh, worn = body_meshes(r, merged, face, lambda m, seam: body_color(src, m, face, seam, out))
    knit(out)
    return part, [mesh, worn]
