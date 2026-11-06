# MetaHuman

Her MetaHuman look (#75) is authored in MetaHuman Creator inside Unreal Engine, which runs only on Windows. This folder
holds what is needed to rebuild that setup. The license terms are in `web/public/avatar/LICENSE.md`.

## The workstation

`cloud/workstation.sh` drives a Windows Server 2022 VM on Google Cloud with one NVIDIA L4 and an RTX Virtual Workstation
license (`nvidia-l4-vws`), a `g2-standard-8` spot instance with a 250 GB disk that survives the VM. Unreal Engine 5.8
with MetaHuman Creator Core Data is installed on that disk.

```sh
export MH_PROJECT=<project>
cloud/workstation.sh create
cloud/workstation.sh password
cloud/workstation.sh tasks
cloud/workstation.sh start
cloud/workstation.sh stop
cloud/workstation.sh snapshot
```

- `create` makes the VM. The NVIDIA vWS driver installs on first boot (`sysprep-specialize-script-url`), and
  `cloud/startup.ps1` enables OpenSSH with the key from the `mallorca-ssh-key` metadata, `~/.ssh/mallorca_gcp.pub` by
  default. With `MH_SNAPSHOT=<snapshot>` it boots from a snapshot of a ready disk instead of a fresh image.
- `password` creates the Windows user `andrew` and prints its password for Remote Desktop (Windows App on macOS).
  Keep it out of the repository.
- `tasks` installs two scheduled tasks: `MallorcaIdleStop` (`cloud/idle.ps1`) shuts the VM down after 45 minutes with
  no Remote Desktop or SSH session, CPU under 20% and network under 1 MB/s, so an idle VM costs only its disk;
  `MallorcaShot` (`cloud/shot.ps1`) saves a screenshot of the Remote Desktop session to `C:\mallorca\shot.png`.
- `start` lets the current public IP through the firewall (Remote Desktop and SSH are open to that one address only)
  and starts the VM, retrying while the zone has no spot L4 capacity. The external IP changes on every start: `ip`
  prints it.
- `snapshot` saves the disk. On a stockout, `MH_ZONE=<other zone> MH_SNAPSHOT=<snapshot> cloud/workstation.sh create`
  brings the same machine up elsewhere.

On-demand L4 capacity was out in every EU and US zone when the VM was made, which is why it is a spot instance: Google
may stop it, the disk stays, and `start` brings it back.

Once on the VM: sign in to the Epic Games Launcher and install Unreal Engine 5.8 with the option MetaHuman Creator Core
Data, without extra target platforms.

## From a Creator character to the game

Her look is the Ready Player Me `brunette.glb` of the TalkingHead project (CC BY-NC 4.0), conformed to a MetaHuman.
The scripts in `ue/` run inside the editor through Python remote execution (`ue/rexec.py <script>` on the VM, with the
Face project open); they read and write under `C:\mallorca`.

1. `ue/conform_prep.py` imports `C:\mallorca\ue\brunette_body.fbx` (the glb's merged body and head, exported from
   Blender) as a static mesh and places a camera on its face; `ue/conform.py` tracks the face contours in that render,
   conforms a new character `/Game/Her/Brunette_<n>` to the mesh and records its path in `current_asset.txt`.
2. Add the groom `Hair_L_StraightBangs` and the eyebrows `Eyebrows_M_Natural` in the Creator window, then
   `ue/rig.py` requests the auto rig (sign in to Epic once when the editor asks).
3. `ue/export_dcc.py` writes the DCC export (`head.dna`, `Maps`, `Masks`); `ue/synth.py` draws the skin Creator
   synthesizes into render targets (`Synth/BASECOLOR`, `Synth/NORMAL`), because those textures live only on the GPU;
   `ue/cards.py` and `ue/helmet.py` write the hair cards, the helmet and their textures to `cards/`.
4. Copy those folders into one local folder (the Creator export) and run, with the OpenRigLogic Python bindings on
   `ORL_PYTHON` and `pip install -r export/requirements.txt`:

```sh
python export/build.py <creator export> <archetype head.dna> <round_spectacles 1k glTF folder> web/public/avatar/her --check
```

The archetype is `Engine/Plugins/MetaHuman/MetaHumanCoreTechLib/Content/ArchetypeDNA/SKM_Face.dna` of the same Unreal
Engine install: the groom cards are modelled on that head, and each card vertex follows its nearest archetype vertex
onto hers. The DNA files of MetaHuman-DNA-Calibration (Ada and others) are not used: their license limits what is made
from them to Unreal Engine. The glasses are Poly Haven's
[Round Spectacles](https://polyhaven.com/a/round_spectacles) (CC0), downloaded as glTF 1k. `--check` decodes the packed
rig and fails when a position is off by more than 0.005 cm, a blendshape delta by more than 0.03 cm, or the folder
exceeds 15 MB.

`export/` writes:

- `rig.json` and `rig.bin`: controls, joints, animated maps, wrinkle masks and the meshes. Positions, normals and UVs are
  int16, skin weights and blendshape deltas int8, each with a scale and an offset per component; deltas under 0.01 cm are
  dropped. Hair cards and the helmet carry no blendshapes: `follow` names the head vertex each card vertex moves with.
- `behavior.dna` for RigLogic, `masks.r8` (the wrinkle masks, 128 px each, channels in `export/mask_channels.json`),
  `mapping.json` (ARKit and viseme weights to MetaHuman controls, `export/controls.py`), the textures and `glasses/`.

## RigLogic in the browser

`riglogic/build.sh` builds `web/src/ui/avatar/rig/riglogic.wasm`: OpenRigLogic (MIT, https://github.com/EpicGames/OpenRigLogic,
the UE 5.8.5 snapshot `d3d329b`) and `riglogic/rl.cpp`, a C wrapper over the DNA reader and RigLogic, linked by
emscripten as a standalone module with no JavaScript glue. It needs `emcc`, CMake and Ninja; set `RL_WORK` to reuse a
checkout and build folder. `web/src/ui/avatar/rig/riglogic.ts` instantiates it.
