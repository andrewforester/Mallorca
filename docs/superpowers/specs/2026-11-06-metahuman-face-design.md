# Her MetaHuman face in the game (issue #75)

## Goal

The opponent's live face in the game becomes the MetaHuman head built in the spike: the `brunette` look conformed in
MetaHuman Creator, driven by the full RigLogic rig in the browser (tier 1), with hair cards, lashes, wrinkle maps and
round spectacles. The emotion engine, the face layer and `Motion` stay as they are: the new renderer takes the same
`Pose` as the current one.

## Decisions

- **The face is the brunette conform.** Its shape comes from the Ready Player Me avatar `brunette.glb` of the
  TalkingHead project (CC BY-NC 4.0). The owner chose to ship it with attribution while the game stays
  non-commercial. `web/public/avatar/LICENSE.md` records the attribution, the MetaHuman terms and the glasses.
- **Tier 1 on every capable device.** Phones get the rig too if a phone-class run holds a smooth frame rate
  (measured, see Testing). If it does not, phones keep the Rocketbox glb and tier 2 becomes its own issue.
- **Fallbacks.** Rig face, then the Rocketbox glb, then the portrait. Any load error or a lost context moves one step
  down.
- **Glasses.** Poly Haven "Round Spectacles" by Sean Buckley, CC0, fitted at runtime to the eye joints.

## Components

### `web/src/ui/avatar/rig/` (new, layer `ui`)

| File           | Role                                                                                                   |
| -------------- | ------------------------------------------------------------------------------------------------------ |
| `riglogic.ts`  | Instantiates `riglogic.wasm` (standalone, no emscripten glue) and wraps `rl_*` exports                 |
| `riglogic.wasm`| OpenRigLogic 5.8 (MIT) with a small C++ wrapper, built by `web/tools/avatar/metahuman/riglogic/`        |
| `assets.ts`    | Loads `her/rig.json`, `her/rig.bin` and textures; decodes quantized sections                            |
| `controls.ts`  | Pure: ARKit and viseme weights to raw MetaHuman controls through `mapping.json`, clamped to [0, 1]      |
| `joints.ts`    | Pure: RigLogic joint outputs (translation, Euler XYZ in degrees, scale deltas) to bone transforms        |
| `blend.ts`     | Pure: CPU blendshapes and the normal tracker for the head                                              |
| `skin.ts`      | Skin material: wrinkle normal maps, upper face crease darkening, mouth interior, lid shading on blink  |
| `materials.ts` | Teeth, eyes, lashes, hair cards (two passes), helmet                                                    |
| `glasses.ts`   | Loads and fits the spectacles to `FACIAL_L_Eye` / `FACIAL_R_Eye`, attached to `head`                     |
| `RigAvatar.ts` | Same surface as `Avatar`: `canvas`, `load`, `resize`, `render(pose)`, `dispose`                         |

`Pose.head`, `neck`, `spine` and `shoulder` drive the `head`, `neck_01`/`neck_02`, `spine_05` and `clavicle_l`/`clavicle_r`
joints; neck joints are never
moved by facial controls. `Pose.eyes` drives the eyeLook controls.

### `web/src/ui/avatar/live.ts` and `FaceSeat.tsx`

`mountFace` takes a renderer factory instead of a glb URL. `FaceSeat` tries the rig first, then the glb, then the
portrait. `portrait.webp` becomes a still of the new face.

### Assets: `web/public/avatar/her/`

- `rig.json`: controls, joints, parents, maps, masks, mesh sections.
- `rig.bin`: positions and blendshape deltas quantized to int16 per section with a scale and offset; indices uint16
  or uint32. Hair cards no longer copy head blendshapes: each card vertex stores the index of its nearest head vertex
  and follows that vertex's blendshape offset at runtime.
- `behavior.dna`, `masks.r8`, textures as webp at 2048 for the head and 1024 for the rest, `glasses/`.
- Target: 15 MB in total.

### Tools: `web/tools/avatar/metahuman/`

The local spike scripts move here: `export/head.py` (DNA, maps, masks), `export/groom.py` (hair cards, helmet, brows,
scalp, lashes), `export/pack.py` (quantization), `riglogic/rl.cpp` and `riglogic/build.sh`. The README gains the steps
from a Creator character to `public/avatar/her/`.

## Testing

- Unit tests for `controls`, `joints`, `blend` (quantization round trip, normals of a moved quad) and the renderer
  choice in `FaceSeat` (rig, glb, portrait).
- `npm test`, `npm run test:e2e` (the face seat reaches `data-face="live"`), the contact sheets for phone and desktop.
- Frame rate on desktop and on a throttled phone-class run (4x CPU slowdown, 390x844), recorded in the PR.

## Out of scope

Body motion beyond the current shoulders and spine, tier 2 baking, the face lab sandbox and the photo conform.
