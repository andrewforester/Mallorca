import numpy as np

TORSO_CM = 0.9
SLEEVE_CM = 0.4
NECKLINE_CM = 0.4
EASE_CM = 3.0
RIB_CM = 1.5
RIB_LIFT_CM = 0.25
COVER_MARGIN_CM = 2.0
NECK_RADIUS_CM = 7.5
FRONT_DROP_CM = 0.5
SIDE_RISE_CM = 3.5
BACK_DROP_CM = 1.0
TILE_CM = 3.2
RIB_SQUEEZE = 2.0
EDGE_ROUNDS = 12
RELAX_ROUNDS = 10
TAUBIN_SHRINK = 0.5
TAUBIN_GROW = -0.53
BIB_ABOVE_SIDE_CM = 3.0
WEAR = ("spine_", "clavicle", "upperarm", "lowerarm", "pelvis")
SLEEVE = ("upperarm", "lowerarm")
BIB = ("spine_", "clavicle", "upperarm", "neck")
BARE = ("hand", "thumb", "index", "middle", "ring", "pinky")


def keep_tris(mesh, kept):
    tris = mesh["index"][kept]
    used = np.unique(tris)
    new = np.full(len(mesh["position"]), -1, np.int64)
    new[used] = np.arange(len(used))
    for key in ("position", "normal", "uv", "skinIndex", "skinWeight", "layout"):
        mesh[key] = mesh[key][used]
    mesh["index"] = new[tris].astype(np.uint32)


def welded(position):
    _, group = np.unique(np.round(position, 3), axis=0, return_inverse=True)
    return group.reshape(-1)


def influence(mesh, names, prefixes):
    si, sw = mesh["skinIndex"].astype(np.int64), mesh["skinWeight"]
    hit = np.vectorize(lambda j: names[j].startswith(prefixes))(si)
    return (sw * hit).sum(1)


def neckline(position, marks):
    front, side, back = marks
    x, y, z = position[:, 0], position[:, 1], position[:, 2]
    c = z / np.maximum(np.hypot(x, z), 1e-6)
    height = side + (front - side) * np.clip(c, 0, 1) + (back - side) * np.clip(-c, 0, 1)
    return (y > height) & (np.hypot(x, z) < NECK_RADIUS_CM)


def region(mesh, names, marks, hem, from_head):
    worn = influence(mesh, names, WEAR) > 0.5
    bare = influence(mesh, names, BARE) > 0.5
    y = mesh["position"][:, 1]
    bib = from_head & (influence(mesh, names, BIB) > 0.5) & (y < marks[1] + BIB_ABOVE_SIDE_CM)
    keep = ((worn & ~bare & ~from_head & (y > hem)) | bib) & ~neckline(mesh["position"], marks)
    return keep[mesh["index"]].all(1)


def joined(body, face):
    n = len(body["position"])
    out = {k: np.concatenate([body[k], face[k]]) for k in ("position", "normal", "uv", "skinIndex", "skinWeight")}
    out["index"] = np.concatenate([body["index"], face["index"].astype(np.int64) + n])
    out["layout"] = np.arange(len(out["position"]))
    return out, np.arange(len(out["position"])) >= n


def boundary_edges(tris, group):
    edges = np.sort(np.concatenate([group[tris[:, [0, 1]]], group[tris[:, [1, 2]]], group[tris[:, [2, 0]]]]), 1)
    unique, count = np.unique(edges, axis=0, return_counts=True)
    return unique[count == 1]


def boundary(tris, group):
    return np.unique(boundary_edges(tris, group))


def relax(moved, tris, group):
    pairs = np.concatenate([group[tris[:, [0, 1]]], group[tris[:, [1, 2]]], group[tris[:, [2, 0]]]])
    pairs = np.unique(np.sort(pairs, 1), axis=0)
    count = np.bincount(pairs.ravel(), minlength=group.max() + 1)[:, None]
    point = np.zeros((group.max() + 1, 3))
    np.add.at(point, group, moved)
    point /= np.maximum(np.bincount(group, minlength=len(point))[:, None], 1)
    for _ in range(RELAX_ROUNDS):
        for k in (TAUBIN_SHRINK, TAUBIN_GROW):
            mean = np.zeros_like(point)
            np.add.at(mean, pairs[:, 0], point[pairs[:, 1]])
            np.add.at(mean, pairs[:, 1], point[pairs[:, 0]])
            point = point + k * (mean / np.maximum(count, 1) - point) * (count > 0)
    return point[group]


def smooth_edge(moved, edges, group, chosen):
    edges = edges[np.isin(edges, chosen).all(1)]
    point = {g: moved[group == g].mean(0) for g in np.unique(edges)}
    near = {g: [] for g in point}
    for a, b in edges:
        near[a].append(b)
        near[b].append(a)
    for _ in range(EDGE_ROUNDS):
        point = {g: 0.5 * p + 0.5 * np.mean([point[n] for n in near[g]], 0) for g, p in point.items()}
    for g, p in point.items():
        moved[group == g] = p


def smooth_normals(position, tris, group):
    t = position[tris]
    face = np.cross(t[:, 1] - t[:, 0], t[:, 2] - t[:, 0])
    acc = np.zeros((group.max() + 1, 3))
    for c in range(3):
        np.add.at(acc, group[tris[:, c]], face)
    n = acc[group]
    return n / np.maximum(np.linalg.norm(n, axis=1, keepdims=True), 1e-9)


def edge_distance(position, edge_points):
    out = np.full(len(position), np.inf)
    for a in range(0, len(edge_points), 512):
        d = np.linalg.norm(position[:, None, :] - edge_points[None, a:a + 512, :], axis=2)
        out = np.minimum(out, d.min(1))
    return out


def cm_per_uv(position, uv, tris):
    d3 = np.linalg.norm(position[tris[:, 1]] - position[tris[:, 0]], axis=1)
    d2 = np.linalg.norm(uv[tris[:, 1]] - uv[tris[:, 0]], axis=1)
    ok = d2 > 1e-6
    return float(np.median(d3[ok] / d2[ok]))


def thickness(mesh, names, near_neck, rib):
    arm = influence(mesh, names, SLEEVE)
    base = TORSO_CM * (1 - arm) + SLEEVE_CM * arm
    ease = np.clip(near_neck / EASE_CM, 0, 1)
    return NECKLINE_CM + (base - NECKLINE_CM) * ease * ease * (3 - 2 * ease) + RIB_LIFT_CM * rib


def sweater(body, face, names, marks, hem):
    full, from_head = joined(body, face)
    kept = region(full, names, marks, hem, from_head)
    tris = full["index"][kept]
    group = welded(full["position"])
    pos = full["position"]
    edge = boundary(tris, group)
    edge_points = pos[np.isin(group, edge)]
    to_edge = edge_distance(pos, edge_points)
    neck_points = edge_points[edge_points[:, 1] > marks[0] - 1]
    near_neck = edge_distance(pos, neck_points)
    rib = (to_edge < RIB_CM).astype(np.float64)
    normal = smooth_normals(pos, tris, group)
    moved = pos + normal * thickness(full, names, near_neck, rib)[:, None]
    moved = relax(moved, tris, group)
    neck_groups = np.unique(group[np.isin(group, edge) & (pos[:, 1] > marks[0] - 1)])
    smooth_edge(moved, boundary_edges(tris, group), group, neck_groups)
    scale = cm_per_uv(pos, full["uv"], tris) / TILE_CM
    uv = full["uv"] * scale
    uv[:, 0] *= np.where(rib > 0, RIB_SQUEEZE, 1.0)
    mesh = {**full, "name": "sweater", "position": moved.astype(np.float32), "normal": normal.astype(np.float32),
            "uv": uv.astype(np.float32), "index": full["index"], "targets": []}
    keep_tris(mesh, kept)
    covered = np.zeros(len(pos), bool)
    covered[np.unique(tris)] = True
    covered &= to_edge > COVER_MARGIN_CM
    return mesh, covered[:len(body["position"])]


def marks_of(world):
    clavicle = (world["clavicle_l"][1, 3] + world["clavicle_r"][1, 3]) / 2
    return clavicle - FRONT_DROP_CM, clavicle + SIDE_RISE_CM, world["neck_01"][1, 3] - BACK_DROP_CM
