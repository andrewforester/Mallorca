import numpy as np

from groom import nearest, vertex_normals
from seated import rotation

GAP_CM = 0.3
REACH_CM = 3.0
PASSES = 12
EXTRA_CM = 0.02


def matrix_of(row):
    m = np.eye(4)
    m[:3, :3] = rotation(*row[3:6])
    m[:3, 3] = row[:3]
    return m


def worlds(names, parent, rows):
    out = {}

    def world(n):
        if n not in out:
            local = matrix_of(rows[n])
            out[n] = local if parent[n] is None else world(parent[n]) @ local
        return out[n]

    return np.array([world(n) for n in names])


def skin_matrices(head_reader, header, part):
    names = header["joints"] + part["body"]["joints"]
    rows = {n: [*head_reader.getNeutralJointTranslation(j), *head_reader.getNeutralJointRotation(j)]
            for j, n in enumerate(header["joints"])}
    parent = {n: (None if p == j else header["joints"][p]) for j, (n, p) in enumerate(zip(header["joints"], header["parents"]))}
    for n, p, row in zip(part["body"]["joints"], part["body"]["parents"], part["body"]["rest"]):
        rows[n], parent[n] = row, p or None
    seated = {**rows, **part["pose"]["sitting"]}
    return worlds(names, parent, seated) @ np.linalg.inv(worlds(names, parent, rows))


def blended(mesh, skins):
    w = mesh["skinWeight"] / np.maximum(mesh["skinWeight"].sum(1, keepdims=True), 1e-9)
    return np.einsum("vk,vkab->vab", w, skins[mesh["skinIndex"].astype(np.int64)])


def posed(mesh, skins):
    m = blended(mesh, skins)
    return np.einsum("vab,vb->va", m, np.c_[mesh["position"], np.ones(len(mesh["position"]))])[:, :3], m


def inside(cards, cloth):
    near = nearest(cards, cloth["at"])
    offset = cards - cloth["at"][near]
    depth = (offset * cloth["normal"][near]).sum(1)
    gap = np.linalg.norm(offset, axis=1)
    return near, depth, (gap < REACH_CM) & ((depth < 0) | (gap < GAP_CM))


def push_out(cards, sweater, skins):
    at, _ = posed(sweater, skins)
    cloth = {"at": at, "normal": vertex_normals(at, sweater["index"].astype(np.int64))}
    hair, blend = posed(cards, skins)
    moved = np.zeros(len(hair), bool)
    for _ in range(PASSES):
        near, depth, hit = inside(hair, cloth)
        hair[hit] += cloth["normal"][near[hit]] * (GAP_CM + EXTRA_CM - depth[hit])[:, None]
        moved |= hit
    near, _, hit = inside(hair, cloth)
    hair[hit] = cloth["at"][near[hit]] + cloth["normal"][near[hit]] * (GAP_CM + EXTRA_CM)
    moved |= hit
    back = np.einsum("vab,vb->va", np.linalg.inv(blend[moved]), np.c_[hair[moved], np.ones(moved.sum())])[:, :3]
    cards["position"][moved] = back.astype(np.float32)
    left = inside(posed(cards, skins)[0], cloth)[2].sum()
    if left:
        raise SystemExit(f"{left} hair card vertices still inside her sweater")
    return int(moved.sum())
