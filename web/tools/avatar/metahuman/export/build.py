import argparse
import subprocess
from pathlib import Path

from glasses import glasses
from groom import groom
from head import head
from pack import check, write

WEB = Path(__file__).resolve().parents[4]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("creator", help="the Creator export: head.dna, Maps, Masks, Synth, cards, mask_channels.json")
    parser.add_argument("archetype", help="head DNA of a default MetaHuman, the space the groom cards are in")
    parser.add_argument("glasses", help="folder of the Poly Haven round_spectacles 1k glTF")
    parser.add_argument("out")
    parser.add_argument("--check", action="store_true")
    a = parser.parse_args()
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    header, meshes = head(a.creator, out)
    face = next(m for m in meshes if m["name"] == "head")
    meshes += groom(a.creator, a.archetype, face, out)
    glasses(a.glasses, out / "glasses")
    write(header, meshes, out)
    files = [str(f) for f in [*out.glob("*.json"), *out.glob("glasses/*.gltf")]]
    subprocess.run(["npx", "prettier", "--write", "--log-level", "warn", *files], cwd=WEB, check=True)
    if a.check:
        check(meshes, out)


if __name__ == "__main__":
    main()
