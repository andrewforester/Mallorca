# Her MetaHuman Face Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The game's live face becomes the brunette MetaHuman head driven by RigLogic in the browser, with the
Rocketbox glb and the portrait as fallbacks.

**Architecture:** A new renderer `RigAvatar` in `web/src/ui/avatar/rig/` takes the existing `Pose` and turns it into
MetaHuman raw controls, RigLogic joint and blendshape outputs, and wrinkle map weights. Assets are produced offline by
Python tools in `web/tools/avatar/metahuman/export/` into `web/public/avatar/her/`; RigLogic is a standalone wasm built
by `web/tools/avatar/metahuman/riglogic/`.

**Tech Stack:** TypeScript, three.js, Preact, Vitest, Playwright; Python 3 with OpenRigLogic's DNA bindings, numpy,
Pillow; emscripten for the wasm.

**Spec:** `docs/superpowers/specs/2026-11-06-metahuman-face-design.md`

**Prototype to port:** `.claude/worktrees/bridge-cse_01D7ckTqU2yU4k6aYuQBqjrp/web/prototypes/emotion-lab/face/live.ts`
and `normals.ts` (branch `spike/metahuman-tier2`); local pipeline `~/workspace/mallorca-assets/spike/`
(`export_brunette.py`, `groom_brunette.py`, `export_live.py`, `arkit_map.py`, `wasm/rl.cpp`).

## Global Constraints

- CLAUDE.md rules: no comments in code; files at most 400 lines, functions 60, nesting 3, complexity 12, 4 params; no
  import cycles; layer `ui` only; TDD; never weaken lint or tests.
- Before every commit: `npm run lint`, `npx tsc --noEmit`, `npm test` (from `web/`, after `source ~/.nvm/nvm.sh && nvm use`).
- Assets in `web/public/avatar/her/` total at most 15 MB.
- The face source is CC BY-NC 4.0 (Ready Player Me `brunette.glb`, TalkingHead project); credited in `LICENSE.md`.
- Glasses: Poly Haven "Round Spectacles", Sean Buckley, CC0. Fit 0.8 of the eye-joint distance, 2.6 cm in front of the
  eye joints, 0.3 cm down; lens `MeshBasicMaterial` color `0x1a2630`, opacity 0.03.
- Shader values from the spike: wrinkle normal gain 4.0; crease darkening `clamp(crease * 3.5, 0, 0.4)` times
  `smoothstep(147, 151, restY)`, from wm1 and wm2 only; lid normal bend toward `(0, 0.35, 1)` by `0.6 * lidA`.
- Neck joints (name matches `/neck/i`) take neutral values from RigLogic; only `Pose.neck` moves them.

## Review Focus

- A lost WebGL context or a failed fetch of any `her/` file: the seat drops to the glb, then to the portrait, never a
  blank seat. Test in Task 6.
- Weights above 1 (the face layer multiplies anchors by 1.4): controls clamp to [0, 1]. Test in Task 3.
- A pose weight with no mapping (an unknown name): ignored, no throw. Test in Task 3.
- Tab hidden and shown again: the rig does not jump; dt is capped as today by `mountFace`. Covered by existing loop.
- A device that cannot render (software GL): no request to `her/` at all. Test in Task 6 (e2e).

---

### Task 1: Export tools and packed assets

**Files:**
- Create: `web/tools/avatar/metahuman/export/head.py`, `groom.py`, `pack.py`, `requirements.txt`
- Create: `web/public/avatar/her/*` (generated)
- Modify: `web/tools/avatar/metahuman/README.md`

**Interfaces:**
- Produces `her/rig.json`:
  `{ controls: string[], joints: string[], parents: number[], maps: string[], masks: string[], meshes: MeshSection[] }`
  where `MeshSection = { name, position: Q, normal: Q, uv: Section, index: Section, skinIndex: Section,
  skinWeight: Section, targets: { channel: number, index: Section, delta: Q }[], follow?: Section }`,
  `Section = { offset: number, length: number, type: 'uint8'|'uint16'|'uint32'|'float32'|'int16' }` and
  `Q = Section & { scale: number[3], offset3: number[3] }` for int16 data decoded as `v * scale + offset3`.
- `follow` (cards and helmet only): uint32 index of the nearest head vertex; such meshes carry no `targets`.
- Produces `her/rig.bin`, `her/behavior.dna`, `her/masks.r8` (256x256 x masks.length), `her/mapping.json`, webp textures
  named as in the spike, `her/hair_cards.png`, `her/eyelashes.png`, `her/glasses/` (Poly Haven 1k gltf).

- [ ] **Step 1:** Port `export_brunette.py` to `head.py` (args: Creator export dir, out dir) and `groom_brunette.py` to
  `groom.py` (cards, helmet, brows, scalp, lashes; no glasses; replace per-card blendshape copies by `follow`).
- [ ] **Step 2:** Write `pack.py` that converts the float sections to int16 per axis and writes `rig.json` /
  `rig.bin`; `--check` decodes back and fails if any position error exceeds 0.005 cm or the folder exceeds 15 MB.
- [ ] **Step 3:** Run head, groom, pack with `--check` on `~/workspace/mallorca-assets/brunette_mh`. Expected: check
  passes, size printed.
- [ ] **Step 4:** README: the steps from a Creator character to `public/avatar/her/`. Commit
  `feat(tools): export her MetaHuman head, groom and packed rig for the browser`.

### Task 2: Standalone RigLogic wasm and its loader

**Files:**
- Create: `web/tools/avatar/metahuman/riglogic/rl.cpp`, `build.sh`
- Create: `web/src/ui/avatar/rig/riglogic.wasm`, `riglogic.ts`, `riglogic.test.ts`

**Interfaces:**
- `createRig(wasm: BufferSource, dna: Uint8Array): Promise<Rig>`
- `interface Rig { controlCount: number; jointCount: number; neutral(): Float32Array; set(i: number, v: number): void;
  calculate(): void; joints(): Float32Array; blends(): Float32Array; maps(): Float32Array }` (views into wasm memory,
  re-created after growth).

- [ ] **Step 1: Failing test** `riglogic.test.ts` (node env): load `riglogic.wasm` and `public/avatar/her/behavior.dna`;
  expect `controlCount === rigJson.controls.length`, `joints().length === rigJson.joints.length * 9`; after
  `set(indexOf('CTRL_expressions_jawOpen'), 1)` and `calculate()` some joint output differs from 0, and
  `maps().length === rigJson.maps.length`.
- [ ] **Step 2:** `build.sh` builds OpenRigLogic with emcmake and links `rl.cpp` with `-sSTANDALONE_WASM --no-entry
  -sALLOW_MEMORY_GROWTH=1 -DRL_DISABLE_RUNTIME_FEATURE_DETECTION`, exporting `malloc`, `free` and the `rl_*` functions.
  `riglogic.ts` instantiates with the WASI stubs the module imports (return 0 / no-op).
- [ ] **Step 3:** Run the test, PASS. Commit `feat(ui): RigLogic as a standalone wasm with a typed loader`.

### Task 3: Pure rig maths

**Files:**
- Create: `web/src/ui/avatar/rig/controls.ts`, `joints.ts`, `blend.ts` and their `.test.ts`

**Interfaces:**
- `controlsOf(weights: Weights, eyes: [number, number], mapping: Mapping, index: Map<string, number>, out: Float32Array): void`
  with `Mapping = Record<string, Record<string, number>>`; eye yaw/pitch to eyeLook as in the spike
  (yaw / 0.5, pitch / 0.35).
- `jointTransform(base: Float32Array, delta: Float32Array | null, j: number, out: { position, quaternion, scale })`
  (Euler XYZ degrees, order `'ZYX'` in three).
- `applyBlends(base: Float32Array, targets: Target[], blends: Float32Array, out: Float32Array): void`;
  `followHead(head: Float32Array, headBase: Float32Array, follow: Uint32Array, base: Float32Array, out: Float32Array)`;
  `NormalTracker` from the spike's `normals.ts`.

- [ ] **Step 1: Failing tests:**
  `controlsOf({ jawOpen: 1.4 })` gives 1 on `CTRL_expressions_jawOpen`; `controlsOf({ unknownName: 1 })` leaves `out`
  zero and does not throw; eyes `[0.25, 0]` sets `eyeLookLeftL` and `eyeLookLeftR` to 0.5.
  `jointTransform` with delta rotation `[0, 90, 0]` gives a quaternion rotating x to -z.
  `applyBlends` with weight 0.5 adds half the delta; `followHead` moves a card vertex by its head vertex offset;
  `NormalTracker` on a quad folded 90 degrees returns normals at 45 degrees on the fold.
- [ ] **Step 2:** Implement. **Step 3:** Tests pass. Commit `feat(ui): the maths of her rig: controls, joints, blendshapes`.

### Task 4: Asset loading

**Files:**
- Create: `web/src/ui/avatar/rig/assets.ts`, `assets.test.ts`

**Interfaces:**
- `decode(bin: ArrayBuffer, s: Section | Q): Float32Array | Uint32Array | Uint16Array | Uint8Array`
- `loadAssets(base: string, fetcher = fetch): Promise<RigAssets>` with
  `RigAssets = { header: RigHeader, bin: ArrayBuffer, dna: Uint8Array, masks: Uint8Array, mapping: Mapping }`.

- [ ] **Step 1: Failing tests:** an int16 section `[-32767, 0, 32767]` with scale 2/65534 and offset 0 decodes to
  `[-1, 0, 1]` within 1e-4; a uint16 index section decodes to `Uint16Array`; `loadAssets` with a fetcher that
  rejects one file rejects.
- [ ] **Step 2:** Implement. **Step 3:** Pass. Commit `feat(ui): load her packed rig assets`.

### Task 5: Materials and the renderer

**Files:**
- Create: `web/src/ui/avatar/rig/skin.ts`, `materials.ts`, `glasses.ts`, `mesh.ts`, `RigAvatar.ts`
- Modify: `web/src/ui/avatar/avatar.ts` to export `interface FaceRenderer { canvas; load(): Promise<void>;
  resize(w, h): void; render(pose: Pose): void; dispose(): void }` implemented by `Avatar` (its `load` takes no
  argument; the URL moves to the constructor).

**Interfaces:**
- `new RigAvatar(base: string)` implements `FaceRenderer`. `render(pose)` runs `controlsOf`, `calculate`, joints (neck
  joints neutral), `Pose.head/neck/spine/shoulder` onto `head`, `neck_01`+`neck_02` (half each), `spine_05`,
  `clavicle_l/r` as world-space rotations about the rest frame (spike `applyHead`), blends, normals, map weights.
- `skinMaterial(textures, maskTexture, count, blinkMasks: [number, number]): THREE.Material` with the shader values in
  Global Constraints; 12 skin influences through `skinIndex1/2`, `skinWeight1/2`.
- `fitGlasses(scene: THREE.Group, eyes: [Vector3, Vector3], head: THREE.Bone): void`.

- [ ] **Step 1: Failing test** `RigAvatar.test.ts` (node, no WebGL): with a stub renderer factory, `load()` builds a
  skeleton of `header.joints.length` bones and `render(neutralPose)` leaves every `/neck/i` bone at its neutral
  transform after a pose with weights `{ eyeBlinkLeft: 1 }`.
- [ ] **Step 2:** Port the spike in the files above, split to the size limits. **Step 3:** Pass, lint clean.
  Commit `feat(ui): her MetaHuman renderer with skin, hair, lashes and glasses`.

### Task 6: The seat picks the rig

**Files:**
- Modify: `web/src/ui/avatar/live.ts` (`LiveOptions.create: () => FaceRenderer` replaces `url`),
  `web/src/ui/avatar/FaceSeat.tsx` (rig, then glb, then portrait), `web/src/ui/AppFace.test.tsx`, `web/e2e/face.spec.ts`
- Modify: `web/public/avatar/portrait.webp` (still of the new face from the contact run), `LICENSE.md`,
  `ARCHITECTURE.md` (rows for `public/avatar/her/` and `tools/avatar/metahuman/export`)

- [ ] **Step 1: Failing tests:** `AppFace.test.tsx`: when the rig mount rejects, the glb mount is tried and the seat
  ends `live`; when both reject, `portrait`. `face.spec.ts`: on a capable browser the seat reaches `data-face="live"`
  and requests `avatar/her/rig.json`; a software renderer requests nothing under `avatar/her/`.
- [ ] **Step 2:** Implement. **Step 3:** `npm test`, `npm run test:e2e` pass; `npm run contact`, look at both sheets.
- [ ] **Step 4:** LICENSE.md: attribution "brunette.glb by Ready Player Me, from met4citizen/TalkingHead, CC BY-NC 4.0,
  conformed in MetaHuman Creator", the game is non-commercial while it is used; Poly Haven CC0 credit; MetaHuman
  section updated from "not built yet" to built. Commit `feat(ui): her MetaHuman face at the table`.

### Task 7: Frame rate and the PR

- [ ] **Step 1:** Measure fps for 20 s of a scene on desktop and with CDP CPU throttling 4x at 390x844
  (`web/tools/avatar/metahuman/fps.ts`, ported from the spike). If phone-class is below 30 fps, `canRender` gains a
  `rig` tier gate (cores and memory) and phones keep the glb; record numbers in the PR.
- [ ] **Step 2:** Full checks: lint, tsc, test, golden not needed, build, e2e. Open the PR "feat: her MetaHuman face
  (#75)" with contact sheets and fps; squash merge only on the owner's word.
