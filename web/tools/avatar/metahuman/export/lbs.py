import numpy as np

from groom import nearest, vertex_normals
from seated import rotation
from sweater import boundary, welded

GAP_CM = 0.3
REACH_CM = 3.0
PASSES = 12
EXTRA_CM = 0.02
ROUNDS = 6
HEAD_TURN_RAD = 0.2
HEAD_TURNS = [((0, 1, 0), 0.0), ((0, 1, 0), HEAD_TURN_RAD), ((0, 1, 0), -HEAD_TURN_RAD),
              ((1, 0, 0), HEAD_TURN_RAD), ((1, 0, 0), -HEAD_TURN_RAD)]


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


def turn(axis, angle):
    m = np.eye(4)
    m[:3, :3] = rotation(*(np.degrees(angle) * np.array(axis)))
    return m


def under(names, parent, top):
    def below(n):
        while n is not None:
            if n == top:
                return True
            n = parent[n]
        return False

    return np.array([below(n) for n in names])


def skin_matrices(head_reader, header, part):
    names = header["joints"] + part["body"]["joints"]
    rows = {n: [*head_reader.getNeutralJointTranslation(j), *head_reader.getNeutralJointRotation(j)]
            for j, n in enumerate(header["joints"])}
    parent = {n: (None if p == j else header["joints"][p]) for j, (n, p) in enumerate(zip(header["joints"], header["parents"]))}
    for n, p, row in zip(part["body"]["joints"], part["body"]["parents"], part["body"]["rest"]):
        rows[n], parent[n] = row, p or None
    seated = worlds(names, parent, {**rows, **part["pose"]["sitting"]})
    unbind = np.linalg.inv(worlds(names, parent, rows))
    neck = under(names, parent, "neck_01")
    pivot = np.eye(4)
    pivot[:3, 3] = seated[names.index("neck_01")][:3, 3]
    out = []
    for axis, angle in HEAD_TURNS:
        moved = seated.copy()
        moved[neck] = pivot @ turn(axis, angle) @ np.linalg.inv(pivot) @ seated[neck]
        out.append(moved @ unbind)
    return out


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
    through = (depth < 0) & ~cloth["rim"][near]
    return near, depth, (gap < REACH_CM) & (through | (gap < GAP_CM))


def cloth_of(sweater, skins):
    at, _ = posed(sweater, skins)
    tris = sweater["index"].astype(np.int64)
    group = welded(sweater["position"])
    return {"at": at, "normal": vertex_normals(at, tris), "rim": np.isin(group, boundary(tris, group))}


def push_once(cards, cloth, skins):
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
    return int(moved.sum())


def push_out(cards, sweater, poses):
    clothes = [cloth_of(sweater, skins) for skins in poses]
    for _ in range(ROUNDS):
        if not sum(push_once(cards, cloth, skins) for cloth, skins in zip(clothes, poses)):
            break
    left = sum(int(inside(posed(cards, skins)[0], cloth)[2].sum()) for cloth, skins in zip(clothes, poses))
    if left:
        raise SystemExit(f"{left} hair card vertices still inside her sweater")
