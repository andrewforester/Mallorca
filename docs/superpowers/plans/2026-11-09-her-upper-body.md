# Her upper body Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Her MetaHuman gets a seated upper body in a mustard crew-neck sweater, from `body.dna` of the same Creator
export, framed to mid-chest.

**Architecture:** The Python export (`web/tools/avatar/metahuman/export/`) adds body joints, a body mesh, a generated
sweater mesh, a baked seated pose and textures to `rig.json`/`rig.bin`. The browser renderer (`web/src/ui/avatar/rig/`)
builds the extra bones by name, applies the seated table each frame and draws two more skinned meshes.

**Tech Stack:** Python 3 + numpy + Pillow + OpenRigLogic Python bindings (`dna`, `riglogic`); TypeScript + three.js +
vitest; Blender only for throwaway preview renders in the scratchpad.

**Spec:** `docs/superpowers/specs/2026-11-09-her-upper-body-design.md`

## Global Constraints

- Creator export: `~/workspace/mallorca-assets/brunette_mh` (`head.dna`, `body.dna`, `Maps`, `Synth`, `cards`). Python:
  `~/workspace/mallorca-assets/.venv/bin/python` (the bindings segfault under Homebrew 3.15).
- Rebuild command, from `web/`: `ORL_PYTHON=~/workspace/mallorca-assets/build/orl/python/dna
  ~/workspace/mallorca-assets/.venv/bin/python tools/avatar/metahuman/export/build.py ~/workspace/mallorca-assets/brunette_mh
  <archetype SKM_Face.dna> <round_spectacles folder> public/avatar/her --check`. Find the archetype and the glasses
  folder under `~/workspace/mallorca-assets` (`archetype/`, `src/` or `ref/`).
- `public/avatar/her/` at most 17 MB. Shared joints of both DNA files coincide within 0.05 cm.
- Sweater: offset 1.2 cm torso, 0.8 cm sleeves, 0.4 cm at the neckline; rib band 1.5 cm; colour mustard `#c8962e`.
- Hair cards end at least 3 mm outside the sweater and the body in the seated pose.
- Repo rules (`CLAUDE.md`): no comments in code, ESLint size limits (400 lines a file, 60 a function, 4 parameters),
  TDD for TypeScript, never weaken a test, conventional commits with the layer as scope, `git branch --show-current`
  before committing (`feat/her-upper-body`). Before every commit: `npm run lint`, `npx tsc --noEmit`, `npm test`.
- Show the owner a render after tasks 2, 3, 4, 5, 6 and 7 (Read the image in chat).

## Review Focus

- A `rig.json` without `body`/`pose` (an old cache, the fallback path) must still load and render the head: test in task 4.
- Blinks and jaw must not move the body or the sweater; `Pose.neck` alone moves the neck: test in task 4.
- The neck seam must not open or show a normal crease when she talks or turns: checked on the task 5 render with
  `jawOpen` and head yaw 0.3.
- Hair must not cut into the sweater at the extreme head poses `Motion` produces: checked on the task 7 render.
- Phone frame rate must stay at the 2026-11-06 level: `fps.ts` in task 8.

---

### Task 1: Raise the asset limit to 17 MB

**Files:**
- Modify: `web/tools/avatar/metahuman/export/pack.py` (`LIMIT_MB`)
- Modify: `web/tools/avatar/metahuman/README.md` (the "exceeds 15 MB" sentence)

- [ ] **Step 1:** Set `LIMIT_MB = 17.0`, update the README sentence to 17 MB.
- [ ] **Step 2:** Commit alone: `chore(tools): her avatar folder may grow to 17 MB for the upper body`.

### Task 2: Body skeleton and body mesh in the export

**Files:**
- Create: `web/tools/avatar/metahuman/export/body.py`
- Modify: `web/tools/avatar/metahuman/export/build.py`, `pack.py` (`write` takes extra header keys; `check` decodes all meshes)

**Interfaces:**
- Produces: `body(src: Path, header: dict, face: dict, out: Path) -> tuple[dict, list[dict]]` returning
  `({"body": {"joints": [...], "parents": [...names...], "rest": [[tx,ty,tz,rx,ry,rz], ...]}}, [body_mesh])`.
  `body_mesh` has the same keys as `dnafile.mesh_arrays` output, `name="body"`, `targets=[]`, skin indices into the
  merged joint list `header["joints"] + body["joints"]`.
- Produces: `shared_joint_error(head_reader, body_reader) -> float`, the largest world distance in cm between
  same-named joints.

- [ ] **Step 1: Failing check.** In `pack.check`, fail with `"shared joints differ"` when `rig["body"]` is missing or
  `shared_joint_error > 0.05`. Run the rebuild command: expected `check failed` / missing `body`.
- [ ] **Step 2: Implement `body.py`.**
  - World transforms of the body joints come from the DNA neutral joint translations and rotations (`getNeutralJoint*`),
    Euler XYZ in degrees composed as `joints.ts` does (`ZYX` order), chained by `getJointParentIndex`.
  - New joints: every body joint whose name is not in the head joints and is not a leg joint (`thigh`, `calf`, `foot`,
    `ball`, toes). `parents` are names; `""` for `root`.
  - Mesh: LOD1 (`body_lod1_mesh`) through `mesh_arrays`; drop triangles whose three vertices are all below the
    `pelvis` world height. Re-weight: influences on leg joints move to their nearest kept ancestor.
  - Seam normals: for body vertices within 0.02 cm of a head vertex, set both normals to their normalised sum (the head
    normal is written back into `face["normal"]`).
  - `build.py`: call after `groom`, merge the returned header part, append the mesh.
- [ ] **Step 3: Run the rebuild command.** Expected: `position error … folder … MB` with no failure, `shared joints`
  within tolerance.
- [ ] **Step 4: Preview.** Throwaway Blender render in the scratchpad of head + body (front and three-quarter), shown to
  the owner. Skin covered by the sweater is still there at this point.
- [ ] **Step 5: Commit** `feat(tools): export her body skeleton and upper body mesh` (tool code and regenerated
  `public/avatar/her/`).

### Task 3: Baked seated pose

**Files:**
- Create: `web/tools/avatar/metahuman/export/seated.py`
- Modify: `body.py` / `build.py` to add `"pose": {"sitting": {...}}` to the header

**Interfaces:**
- Produces: `seated(body_dna: Path, keep: set[str]) -> dict[str, list[float]]`, joint name to local
  `[tx, ty, tz, rx, ry, rz]` (cm, degrees, same convention as `rest`), for the driver joints and every joint the RBF
  solvers move away from neutral by more than 0.01 cm or 0.05°, restricted to `keep` (head joints + body joints).
- Constant `SEATED`: local rotation offsets in degrees from the bind pose for `upperarm_l/r`, `lowerarm_l/r`,
  `clavicle_l/r`, `hand_l/r`. Start: upper arms down to about 10° from the torso and 15° forward, forearms 25° forward,
  clavicles 4° forward. Tune by render.

- [ ] **Step 1:** Read the `default` RBF pose input values from `body.dna` to learn the raw-control convention (the
  quaternions are the drivers' local rotations; confirm whether the neutral rotation is included). Write that finding
  as the conversion function `control_quaternion(neutral_deg, offset_deg) -> [qx, qy, qz, qw]`.
- [ ] **Step 2:** Implement `seated` with the `riglogic` bindings: load `body.dna`, set the four raw controls of each
  driver, calculate, read joint outputs (neutral + delta), keep the joints above.
- [ ] **Step 3:** Add a check in `pack.check`: every key of `pose.sitting` is in the merged joints. Rebuild with
  `--check`.
- [ ] **Step 4: Preview.** Pose the scratchpad render with the table (numpy linear blend skinning over the merged
  skeleton), front and side, shown to the owner. Retune `SEATED` until the arms hang naturally and the shoulders show
  no dents.
- [ ] **Step 5: Commit** `feat(tools): bake her seated pose with the body correctives`.

### Task 4: Body bones and the seated pose in the browser

**Files:**
- Modify: `web/src/ui/avatar/rig/assets.ts` (types), `rigState.ts`
- Test: `web/src/ui/avatar/rig/rigState.test.ts`

**Interfaces:**
- Produces in `assets.ts`:
  `interface BodySkeleton { joints: string[]; parents: string[]; rest: number[][] }`,
  `RigHeader.body?: BodySkeleton`, `RigHeader.pose?: { sitting: Record<string, number[]> }`.
- `RigData.header` becomes `Pick<RigHeader, 'controls' | 'joints' | 'parents' | 'body' | 'pose'>`. `state.bones` holds
  head bones first, then body bones in `body.joints` order, so skin indices of body meshes match.

- [ ] **Step 1: Failing tests** in `rigState.test.ts` (real `rig.json` from tasks 2–3):
  - `builds her body bones after the face bones`: `state.bones.length === header.joints.length + header.body!.joints.length`,
    `bone('lowerarm_l').parent === bone('upperarm_l')`, `bone('pelvis').parent === bone('root')`.
  - `holds her arms in the seated pose`: after `update(pose())`, the local quaternion of `upperarm_l` equals the
    `ZYX` Euler of `header.pose!.sitting.upperarm_l` (degrees) to 5 decimals.
  - `keeps her body still when she blinks or opens her jaw`: snapshot of every body bone and `upperarm_*` unchanged to
    5 decimals between `pose()` and `pose({ weights: { eyeBlinkLeft: 1, jawOpen: 1 } })`.
  - `lowers her shoulders with Pose.shoulder on top of the seated pose`: `clavicle_l` world quaternion differs from the
    seated one for `shoulder: 0.1`.
  - `loads a header without a body as before`: a `RigState` from the header with `body` and `pose` deleted has
    `header.joints.length` bones and passes the jaw test.
- [ ] **Step 2:** Run `npx vitest run src/ui/avatar/rig/rigState.test.ts`: the new tests fail.
- [ ] **Step 3: Implement.** Body bones get their `rest` through `jointTransform` on a 9-float row (scale 1). Order per
  frame: RigLogic joints, then `sitting` rows replace local transforms, then `applyPose`. Rest quaternions for
  `applyPose` are taken after the seated table is applied once in the constructor. Keep `rigState.ts` under the ESLint
  limits; move the body bone building into `bodyBones.ts` if needed.
- [ ] **Step 4:** Run the test file, then `npm run lint`, `npx tsc --noEmit`, `npm test`: all pass.
- [ ] **Step 5: Commit** `feat(ui): her body bones and seated pose in the rig`.

### Task 5: Body mesh, skin tone and the bust frame

**Files:**
- Modify: `body.py` (textures `body_color_map.webp`, `body_normal_map.webp`, 1024 px), `materials.ts`,
  `RigAvatar.ts`, `stage.ts`
- Test: `web/src/ui/avatar/rig/assets.test.ts` (if it lists expected files), `stage` test if one exists

**Interfaces:**
- Produces: `frameBust(camera: THREE.PerspectiveCamera, head: THREE.Vector3): void` in `stage.ts` replacing
  `frameHead` for the rig; the glb `Avatar` keeps its own framing unless the contact sheet shows a mismatch.

- [ ] **Step 1: Skin tone.** `body_color(src, out)`: Lab mean and standard deviation of `Maps/Body_Basecolor.png` and of
  `Synth/BASECOLOR` over the neck UV region both cover (take it from the seam vertices' UVs, dilated), then transfer the
  body to the head's statistics.
- [ ] **Step 2:** `materials.ts`: `body` mesh gets `skinMaterial` with the body textures and no wrinkle layers (pass a
  flag or a variant; keep `skin.ts` within limits).
- [ ] **Step 3:** `frameBust`: same headroom as now, bottom at mid-chest (start `BELOW_HEAD = 0.55`). Tune on the
  contact sheets.
- [ ] **Step 4:** `npm run contact`; Read `web/e2e/contact/phone.png` and `desktop.png`; show the owner. Check the seam
  at `jawOpen` and head yaw 0.3 with a scratchpad Playwright script on the dev server.
- [ ] **Step 5:** lint, tsc, `npm test`; commit `feat(ui): her body and skin under the face, framed to the chest`.

### Task 6: Sweater mesh and fabric material

**Files:**
- Create: `web/tools/avatar/metahuman/export/sweater.py`, `web/src/ui/avatar/rig/fabric.ts`
- Modify: `body.py` (drop covered skin), `build.py`, `materials.ts`, `web/public/avatar/LICENSE.md`

**Interfaces:**
- Produces: `sweater(body_lod1: dict, joints: dict, out: Path) -> dict` mesh named `sweater` (no targets);
  `covered(body_mesh: dict, sweater_mesh: dict) -> np.ndarray` boolean per body triangle.
- Produces: `fabricMaterial(normal: THREE.Texture, roughness: THREE.Texture, color: THREE.ColorRepresentation): THREE.MeshPhysicalMaterial`.

- [ ] **Step 1:** Region: torso and arm triangles of LOD1 by dominant joint (`spine_*`, `clavicle_*`, `upperarm_*`,
  `lowerarm_*` and their helpers), ending at the wrist (`hand_*` weight > 0.5 excluded) and the hips.
- [ ] **Step 2:** Neckline: drop triangles above a curve through points 2 cm above each clavicle's world position and
  4 cm under the jugular notch at the front, 1 cm under the `neck_01` base at the back.
- [ ] **Step 3:** Offset along smoothed vertex normals by the constraint values, eased over 3 cm to 0.4 cm at the
  neckline. Rib bands: vertices within 1.5 cm of the neckline, cuffs and hem get UV `v` in a separate band.
- [ ] **Step 4:** Drop body skin triangles fully inside the sweater, keeping a 2 cm band under every edge.
- [ ] **Step 5:** Knit textures 512 px from a CC0 source, saved as `knit_normal_map.webp`, `knit_roughness_map.webp`;
  credit added to `LICENSE.md`. `fabric.ts` with sheen, repeat set so a stitch is about 4 mm.
- [ ] **Step 6:** Rebuild with `--check`; Blender preview and the contact sheets, shown to the owner.
- [ ] **Step 7:** lint, tsc, `npm test`; commit `feat(tools): generate her sweater` and
  `feat(ui): her knit sweater material` (two commits).

### Task 7: Hair outside the sweater

**Files:**
- Modify: `web/tools/avatar/metahuman/export/groom.py` or `body.py` (after the sweater exists)

**Interfaces:**
- Produces: `push_out(cards: dict, surfaces: list[dict], posed: Callable, gap_cm: float = 0.3) -> None` moving card
  vertices in place.

- [ ] **Step 1:** Add to `pack.check`: no card vertex inside the posed sweater or body (signed distance along the nearest
  surface normal < 0.3 cm). Rebuild: expect failure if any.
- [ ] **Step 2:** Implement the push in the seated pose, converting the move back to bind space through the follow
  vertex. Rebuild: the check passes.
- [ ] **Step 3:** Render head yaw ±0.3 and pitch ±0.15 on the dev server, show the owner.
- [ ] **Step 4:** Commit `feat(tools): her hair lies on the sweater`.

### Task 8: Portrait, docs and the full check

**Files:**
- Modify: `web/public/avatar/portrait.webp`, `web/tools/avatar/metahuman/README.md`, `ARCHITECTURE.md` row of
  `web/public/avatar/` (face and upper body)

- [ ] **Step 1:** Redraw `portrait.webp` from the live render at the current size.
- [ ] **Step 2:** README: `body.py`, `seated.py`, `sweater.py`, the new files and sections.
- [ ] **Step 3:** `npm run lint`, `npx tsc --noEmit`, `npm test`, `npm run build`, `npm run test:e2e`, and
  `node tools/avatar/metahuman/fps.ts <preview url>`; record fps in the PR.
- [ ] **Step 4:** Commit `docs: her upper body in the avatar tools`; push and open the PR to `master` on the owner's go.
