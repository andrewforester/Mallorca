import json
from pathlib import Path

import numpy as np

Q16 = (np.int16, 32767)
Q8 = (np.int8, 127)
LIMIT_MB = 26.0
POSITION_TOLERANCE_CM = 0.005
DELTA_TOLERANCE_CM = 0.03
SHIFT_LIMIT_CM = 20.0


class Pack:
    def __init__(self):
        self.parts = []
        self.size = 0

    def raw(self, array):
        a = np.ascontiguousarray(array)
        b = a.tobytes()
        pad = (-len(b)) % 16
        self.parts.append(b + b"\0" * pad)
        section = {"offset": self.size, "length": int(a.size), "type": str(a.dtype)}
        self.size += len(b) + pad
        return section

    def index(self, array):
        a = np.asarray(array).reshape(-1)
        return self.raw(a.astype(np.uint16 if a.max(initial=0) < 65536 else np.uint32))

    def quantized(self, array, kind=Q16):
        dtype, q_max = kind
        a = np.asarray(array, np.float64)
        lo, hi = a.min(0), a.max(0)
        offset = (hi + lo) / 2
        scale = np.maximum((hi - lo) / (2 * q_max), 1e-12)
        q = np.clip(np.round((a - offset) / scale), -q_max, q_max).astype(dtype)
        return {**self.raw(q), "scale": scale.tolist(), "offset3": offset.tolist()}


def decode(bin_bytes, s):
    a = np.frombuffer(bin_bytes, np.dtype(s["type"]), s["length"], s["offset"])
    if "scale" not in s:
        return a
    k = len(s["scale"])
    return a.reshape(-1, k) * np.array(s["scale"]) + np.array(s["offset3"])


def mesh_section(pack, m):
    out = {"name": m["name"]}
    out["position"] = pack.quantized(m["position"])
    out["normal"] = pack.quantized(m["normal"])
    out["skinWeight"] = pack.quantized(m["skinWeight"], Q8)
    out["uv"] = pack.quantized(m["uv"])
    out["index"] = pack.index(m["index"])
    out["skinIndex"] = pack.raw(m["skinIndex"].astype(np.uint16))
    out["targets"] = [{"channel": int(c), "index": pack.index(i), "delta": pack.quantized(d, Q8)} for c, i, d in m["targets"]]
    if "follow" in m:
        out["follow"] = pack.index(m["follow"])
    return out


def write(header, meshes, out):
    out = Path(out)
    pack = Pack()
    rig = {**header, "meshes": [mesh_section(pack, m) for m in meshes]}
    (out / "rig.json").write_text(json.dumps(rig))
    (out / "rig.bin").write_bytes(b"".join(pack.parts))
    return rig


def write_hair(style, out):
    place = Path(out) / "hair" / style["key"]
    pack = Pack()
    section = mesh_section(pack, style["mesh"])
    (place / "hair.json").write_text(json.dumps({"mesh": section}))
    (place / "hair.bin").write_bytes(b"".join(pack.parts))


def hair_error(style, out):
    place = Path(out) / "hair" / style["key"]
    section = json.loads((place / "hair.json").read_text())["mesh"]
    decoded = decode((place / "hair.bin").read_bytes(), section["position"])
    return float(np.abs(decoded - style["mesh"]["position"]).max())


def check(meshes, out, styles):
    out = Path(out)
    rig = json.loads((out / "rig.json").read_text())
    data = (out / "rig.bin").read_bytes()
    worst, delta = 0.0, 0.0
    for m, s in zip(meshes, rig["meshes"]):
        worst = max(worst, float(np.abs(decode(data, s["position"]) - m["position"]).max()))
        for (_, _, d), t in zip(m["targets"], s["targets"]):
            delta = max(delta, float(np.abs(decode(data, t["delta"]) - d).max()))
    for style in styles:
        shift = np.round(style["shift"], 2).tolist()
        print(f"hair {style['key']}: shift {shift} cm")
        worst = max(worst, hair_error(style, out))
        if np.linalg.norm(style["shift"]) > SHIFT_LIMIT_CM:
            raise SystemExit(f"check failed: {style['key']} moved by more than {SHIFT_LIMIT_CM} cm")
    if "body" not in rig:
        raise SystemExit("check failed: no body skeleton")
    joints = set(rig["joints"]) | set(rig["body"]["joints"])
    sitting = rig.get("pose", {}).get("sitting")
    if not sitting or not set(sitting) <= joints:
        raise SystemExit("check failed: seated pose missing or names unknown joints")
    size = sum(f.stat().st_size for f in out.rglob("*") if f.is_file()) / 1e6
    print(f"position error {worst:.5f} cm, delta error {delta:.4f} cm, folder {size:.1f} MB")
    if worst > POSITION_TOLERANCE_CM or delta > DELTA_TOLERANCE_CM or size > LIMIT_MB:
        raise SystemExit("check failed")
