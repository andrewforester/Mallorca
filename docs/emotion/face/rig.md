# Her face rig: from emotion to MetaHuman controls (audit, 2026-11-11)

Paths are relative to `web/`. Numbers marked "probe" come from running the real `riglogic.wasm` + `behavior.dna` and `src/face/*` in node.

## 1. Pipeline and where values are clamped

| #   | Step                  | Code                                        | What happens to a value                                                                                                                                                                                                                                                                                           |
| --- | --------------------- | ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Felt PAD              | `src/face/expression.ts:13-29`              | mood × 0.5 + Σ emotion × `EMOTION_PAD` (surprise is skipped). Each axis is clamped to [-1, 1] (l.28).                                                                                                                                                                                                             |
| 2   | Shown PAD             | `expression.ts:31-38`, `frame.ts:40`        | `felt·(1-mask) + acted·mask`. Bluff acts `[0.2, 0, 0.6]` (`stance.ts:11`). For `hide` the acted PAD is 0, so the mask pulls her face to neutral.                                                                                                                                                                  |
| 3   | Anchor mix            | `anchors.ts:247-254`                        | Gaussian RBF over 11 anchors, `exp(-d²/σ²)` with σ = 0.27, normalised to a sum of 1.                                                                                                                                                                                                                              |
| 4   | Base weights          | `anchors.ts:277-289` → `shaped` `l.269-275` | Σ anchor.face × mix (mix < 0.002 is skipped), then × `expressiveness × FACE_GAIN(1.4)` × `look[region]` × `sideGain`. **No clamp.**                                                                                                                                                                               |
| 5   | Pulses                | `expression.ts:49-103`                      | One plan per pulse face, keeping the strongest impulse (threshold 0.12). `amp = min(1, amount·(1.1 - 0.3·mask + s·(leak-1)))`. The weights are `shaped(PULSE_FACES[f], look, 1)`, so they are **not** scaled by expressiveness or FACE_GAIN. A `control` pulse is added once `s = smoothstep(.3,.75,mask) > .05`. |
| 6   | Motion: base          | `src/ui/avatar/motion.ts:166-169`           | **The first clamp:** each target is clamped to [0, 1] _before_ easing (`clamp(target,0,1)`, l.167). A 1.54 becomes 1.0 here. Then `ease` with rate 3.2/s (τ ≈ 0.31 s, 63 % in 0.31 s, 95 % in 0.94 s). The frame is sampled every 0.1 s (`live.ts:28,65-68`).                                                     |
| 7   | Motion: pulses        | `motion.ts:170-178`                         | Per weight, the **max** over the live pulses of `w·amp·envelope` (linear attack/hold/release, `l.57-62`), then **added** to the eased base.                                                                                                                                                                       |
| 8   | Speech                | `motion.ts:182-195`                         | `viseme_*` set by max (0.7, or 0.45 for E and I), `jawOpen` by max 0.22.                                                                                                                                                                                                                                          |
| 9   | Gaze weights          | `motion.ts:235-246`                         | Adds `eyeLookDown/Up*` weights. The rig ignores them (step 12); only the GLB avatar uses them.                                                                                                                                                                                                                    |
| 10  | Eye closure cap       | `motion.ts:73-80,153`                       | Per side, if eyeSquint + cheekSquint + eyeBlink > 0.9, all three are scaled down to sum to 0.9.                                                                                                                                                                                                                   |
| 11  | Blink and final clamp | `motion.ts:154-159`                         | The blink takes `max(weight, blink)`. **The second clamp:** every weight is clamped to [0, 1] (l.157-159). Base + pulse above 1 saturates here.                                                                                                                                                                   |
| 12  | ARKit → controls      | `rig/controls.ts:13-27,46-56`               | `out[c] += w × gain` for each mapped control. `eyeLook*` names are skipped (l.21). Gaze comes from `eyes`: yaw/0.5 and pitch/0.35, by max (l.29-44). **The third clamp:** every control to [0, 1] (l.55).                                                                                                         |
| 13  | RigLogic              | `rig/rigState.ts:95-109`                    | wasm evaluates joints, 782 blend channels and 82 animated maps. Joints whose name matches `/neck/i` are frozen to neutral (57 joints, l.65,101-102). Head, neck and spine angles come from the Pose (l.33-40,118-125). The neck gets half of `pose.neck` on each of `neck_01` and `neck_02`.                      |
| 14  | Wrinkles              | `RigAvatar.ts:185-193` → `skin.ts:176-190`  | Maps go to per-mask vec3 (wm1, wm2, wm3), then to the shader (§4).                                                                                                                                                                                                                                                |

Answer to "is 1.54 clamped to 1?": yes, at `motion.ts:167` before easing. A pulse on top of it then adds nothing, because the sum is clamped again at `motion.ts:158`. A mapping gain below 1 caps the reachable control value. browInnerUp → browRaiseIn reaches at most 0.8, eyeWide → eyeWiden 0.7, mouthPress → mouthPressU/D 0.45, mouthRoll → lip roll-in 0.45, mouthShrugLower → chinRaiseD 0.4, mouthShrugUpper → chinRaiseU 0.5, eyeSquint → eyeLidPress 0.3.

Smoothing and time constants:

| Quantity                | Rate (1/s)                                      | Location                                         |
| ----------------------- | ----------------------------------------------- | ------------------------------------------------ |
| Base expression         | 3.2                                             | motion.ts:167                                    |
| Eye yaw and pitch       | 18                                              | motion.ts:237-238                                |
| Head yaw / pitch / roll | 4 / 3 / 2                                       | motion.ts:253-255                                |
| Blink envelope          | 0.07 / 0.04 / 0.13 s                            | motion.ts:228                                    |
| Viseme envelope         | 0.05 / 0.03 / 0.10 s                            | motion.ts:185                                    |
| Open pulse              | attack 0.12, hold 0.5+0.8·amount, release 0.9 s | expression.ts:64-66 (masked: 0.05 / 0.12 / 0.14) |
| Control pulse           | 0.15 / 1.1 / 0.6 s, delay 0.3, 2 blinks         | expression.ts:71-77                              |

## 2. mapping.json (`public/avatar/her/mapping.json`)

All 52 ARKit names plus 15 visemes are mapped. L and R are symmetric; the L side is shown.

| ARKit                                     | Controls (gain)                                                                             |
| ----------------------------------------- | ------------------------------------------------------------------------------------------- |
| browDownLeft                              | browDownL 1, browLateralL 0.6                                                               |
| browInnerUp                               | browRaiseInL 0.8, browRaiseInR 0.8                                                          |
| browOuterUpLeft                           | browRaiseOuterL 1                                                                           |
| cheekSquintLeft                           | eyeCheekRaiseL 1                                                                            |
| eyeBlinkLeft                              | eyeBlinkL 1                                                                                 |
| eyeSquintLeft                             | eyeSquintInnerL 1, eyeLidPressL 0.3                                                         |
| eyeWideLeft                               | eyeWidenL 0.7                                                                               |
| eyeLookDown/Up/In/OutLeft                 | eyeLookDownL / UpL / RightL / LeftL 1 (skipped in controls.ts:21, gaze goes through `eyes`) |
| mouthSmileLeft                            | mouthCornerPullL 1                                                                          |
| mouthFrownLeft                            | mouthCornerDepressL 1                                                                       |
| mouthDimpleLeft                           | mouthDimpleL 1                                                                              |
| mouthPressLeft                            | mouthPressUL 0.45, mouthPressDL 0.45                                                        |
| mouthStretchLeft                          | mouthStretchL 1                                                                             |
| mouthUpperUpLeft                          | mouthUpperLipRaiseL 1                                                                       |
| mouthLowerDownLeft                        | mouthLowerLipDepressL 1                                                                     |
| noseSneerLeft                             | noseWrinkleL 1                                                                              |
| mouthRollLower / Upper                    | mouthLower/UpperLipRollInL+R 0.45                                                           |
| mouthShrugLower                           | jawChinRaiseDL+DR 0.4                                                                       |
| mouthShrugUpper                           | jawChinRaiseUL+UR 0.5                                                                       |
| mouthFunnel                               | mouthFunnelUL/UR/DL/DR 1                                                                    |
| mouthPucker                               | mouthLipsPurse×4 1, mouthLipsTowards×4 0.4                                                  |
| mouthClose                                | mouthLipsTogether×4 1 (**probe: no effect alone**, it is a jawOpen corrective)              |
| mouthLeft / mouthRight                    | mouthLeft / mouthRight 1                                                                    |
| jawOpen / jawForward / jawLeft / jawRight | jawOpen / jawFwd / jawLeft / jawRight 1                                                     |
| cheekPuff                                 | mouthCheekBlowL+R 1                                                                         |
| tongueOut                                 | tongueOut 1                                                                                 |
| visemes                                   | add mouthLowerLipBite, tongueTipUp and tongueUp; everything else reuses the controls above  |

Probe findings on mapped controls:

- `eyeLidPressL/R` moves only neck-named joints (26 joints, all frozen by `rigState.ts:65`), so its 0.3 in the eyeSquint mapping is effectively dead.
- `eyeLookDownL/R` also drives the `wm1_blink` wrinkle map at 1.0, so looking at the cards creases her upper lids.

### Rig controls driven by no ARKit name

`rig.json` has 263 controls. 186 are not reached by an ARKit name or the gaze; 4 of those are reached only by visemes. 21 move nothing on their own: noseWrinkleUpper, mouthStretchLipsClose, mouthLipsTogether, jawOpenExtreme and 12 `q*` eye-aim quaternion values.

The "vis." column is the probe's max joint displacement at control = 1, in rig units (cm), plus the wrinkle maps it drives.

| Use (FACS)                                     | Unused control                                                                                                                                      | Vis.                                              | Value                                                                                                                                                         |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AU4+AU6/7 scowl (anger, disgust, pain)         | **eyeFaceScrunchL/R**                                                                                                                               | 8.5 + browsDown 1, browsLateral 0.5, cheekRaise 1 | High: a strong anger and disgust cue with wrinkles                                                                                                            |
| AU5 upper lid raiser (anger stare, fear)       | **eyeUpperLidUpL/R**                                                                                                                                | 15–16                                             | High: lid lift without the brow (eyeWiden also moves the brows)                                                                                               |
| AU7 lid tightener (anger, pride, contempt)     | **eyeLowerLidUpL/R**                                                                                                                                | 12                                                | High: the anger glare. Today only eyeSquintInner exists.                                                                                                      |
| Lower lid down (fear, surprise)                | eyeLowerLidDownL/R                                                                                                                                  | 12                                                | Medium                                                                                                                                                        |
| Relaxed, heavy lids (sadness, tiredness, calm) | eyeRelaxL/R                                                                                                                                         | 19–20 + blink map 0.5                             | Medium                                                                                                                                                        |
| AU23 lip tightener (anger, control)            | **mouthLipsTightenUL/UR/DL/DR**                                                                                                                     | 3–3.5 + lips 0.5                                  | High                                                                                                                                                          |
| AU24 lip presser                               | **mouthLipsPressL/R**                                                                                                                               | 3.9–4.6                                           | High. Today's "press" (mouthPressU/D) is a different, stronger shape at 0.45 gain.                                                                            |
| Thin, rolled-in lips (anger, holding back)     | mouthLipsThin*, mouthLipsThinInward*                                                                                                                | 1.4–2.6                                           | Low to medium                                                                                                                                                 |
| AU17 chin raiser (sad, pout, doubt, anger)     | jawChinRaise is reached only through mouthShrug at 0.4/0.5. **jawChinCompressL/R** is unused.                                                       | 6.7–7.8 + chinRaise 0.3                           | High                                                                                                                                                          |
| AU9/10 disgust, contempt                       | noseNasolabialDeepenL/R; noseNostrilDilate/Compress/Depress                                                                                         | 4.5–7                                             | Medium. Nostril dilation fits anger, fear and arousal.                                                                                                        |
| AU14 one-sided dimple (contempt)               | mouthSharpCornerPullL/R; mouthCornerSharpen*                                                                                                        | 8.5–9 + smile, lips                               | Medium. Contempt now uses mouthDimple + mouthSmile.                                                                                                           |
| AU12/15 corner fine-tune                       | mouthCornerUp/Down/Wide/Narrow L/R; mouthUp/Down                                                                                                    | 1–3                                               | Low                                                                                                                                                           |
| Jaw tension (anger)                            | **jawClenchL/R** (masseter/temple), jawBack                                                                                                         | 2.5–3; jawBack 6                                  | Medium. Clench is subtle but anatomically right.                                                                                                              |
| Neck tension (anger, effort, fear)             | **neckStretchL/R**, neckMastoidContract, neckThroat*, neckSwallowPh1-4                                                                              | 12–16                                             | Currently **unusable**: those joints are frozen (`rigState.ts:65`). The neckStretch wrinkle map would still work (see §4). Swallow fits fear and nervousness. |
| Pupils (arousal)                               | eyePupilWide/Narrow L/R                                                                                                                             | ~1                                                | Low to medium. Pupils widen with arousal and fear.                                                                                                            |
| Brow lateral alone (AU4 knit, worry)           | browLateralL/R is reached only through browDown at 0.6                                                                                              | 5.8–7.8 + browsLateral map                        | Medium. The corrugator knit without lowering ("worried frown") is not reachable alone.                                                                        |
| Other                                          | earUp, eyelashes*, mouthCheekSuck, mouthLipsBlow, mouthUpperLipBite, lip push/pull/thick/shift/roll-out/towards-teeth, sticky lips, teeth*, tongue* |                                                   | Not emotional, or speech only                                                                                                                                 |

Emotion gaps against FACS prototypes, as the current anchors and pulses stand:

- **Anger** (AU4+5+7+23/24, ±17): the anchor has browDown, noseSneer, mouthPress, eyeSquint, a little eyeWide, jawForward and mouthUpperUp. It lacks AU5 (an upper lid raise that keeps the brows down; eyeWide also lifts them), AU7 (lower lid up), AU23 (LipsTighten), AU24 (LipsPress) and AU17 (chin). noseSneer and upperLipUp read as disgust more than anger. The probe shows `anger 1.0` with neutral mood gives PAD (-0.51, 0.59, 0.25) = **87 % irritated, 13 % anger**. The anger anchor at (-0.65, 0.8, 0.65) is almost unreachable by the emotion alone, because its dominance of 0.65 is well above anger's 0.25.
- **Shame**: the tonic face is identical to disappointment (both land 95–99 % on `worry`). The shame pulse's `eyeLookDown` 0.4 is **dropped** by `controls.ts:21`. There is no head-down response and no gaze aversion. Unused capacity: gaze down through `eyes`, head pitch, AU54 head down and AU64 eyes down.
- **Pride**: the tonic face is smug plus joy (asymmetric smile). There is no head-up or tilt-back beyond the generic dominance pitch (−0.08·d rad). Possible: head back, AU7 lower lid up, a slight AU12, chin up.
- **Hope**: `hope 1.0` gives PAD (0.2, 0.2, -0.1), **95 % neutral**, so hope is invisible in the tonic face. Its pulse is `flash` (brows up plus a smile).
- **Surprise**: excluded from the felt PAD (`expression.ts:20`). It shows only as a pulse.
- **Contempt**: `PULSE_FACES.contempt` exists, but no `Emotion` maps to it (`EMOTION_PULSE`, `anchors.ts:233-245`). `sigh` is also unused. Neither is reachable.

## 3. Head and gaze

What Motion takes in (`motion.ts:21-24,109-145`):

- `MotionOptions { random, calm }`.
- `setFrame(FaceFrame)`, which uses only `weights`, `shown` and `idle {nervous, arousal, blinkRate}`. It ignores `felt`, `mask` and `prosody`.
- `setThinking(bool)`.
- `cue(pulse | gaze{target, then})`. Gaze cues come from game events only (`game/faceCues.ts:11-23`: holeCards → cards, street → board, acted/handEnded → player).
- `speak`, `sync` and `silence`.

How emotion reaches head and gaze today:

| Channel                      | Formula                                                                                                                                                              | Max effect                                                                          |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Head pitch (positive = down) | `0.3·eyesPitch − 0.08·D − 0.03·A + 0.07·max(0,−P)` from **shown** PAD (`motion.ts:252-254`). Split 0.6 head, 0.4 neck (l.266-267).                                   | About ±0.08 rad (4.6°) from dominance and 0.07 rad (4°) down from negative valence. |
| Head roll                    | `0.04·D` (l.255)                                                                                                                                                     | 2.3°                                                                                |
| Spine                        | `+0.03·max(0,−D)` slump (l.268)                                                                                                                                      | 1.7°                                                                                |
| Head yaw                     | follows the eyes × 0.35, no emotion term                                                                                                                             |                                                                                     |
| Gaze target                  | events and thinking only. Nervousness raises the glance probability `0.06 + 0.75·nervous` and widens the glance set to cards/board/away/down when > 0.3 (l.214-223). |                                                                                     |
| Blink rate                   | `blinkRate·(1 + 1.6·nervous + 0.5·max(0, arousal))` (l.201)                                                                                                          |                                                                                     |
| Breath period                | `4.2 − 1.2·nervous` s (l.263)                                                                                                                                        |                                                                                     |

Absent: anger head-down with gaze up, pride tilt-back as a distinct gesture, shame gaze-down or aversion (dropped, see §2), head tilt for interest or doubt, and any pulse-driven head motion. Pulses carry only weights and blinks (`face/expression.ts:83-91`).

## 4. Wrinkle maps

- **Source:** RigLogic animated maps (`rig.maps()`, 82 outputs, the same order as `rig.json.maps`). The DNA computes them from the raw controls. Each mask exists twice, as `head_cmN_color.*` and `head_wmN_normal.*`; only the `_wm` normal entries are used (`skin.ts:185`). The `cm` color-map outputs are discarded.
- **Packing:** `wrinkleWeights` (`skin.ts:176-190`) sums each map into `uWm[mask].{x,y,z}` for wm1, wm2 and wm3 (`wm13_lips` feeds both x and z). This happens every frame in `RigAvatar.render` (`RigAvatar.ts:188-193`).
- **Shader** (`skin.ts:62-101`): `wmA = clamp(Σ mask_i(uv)·uWm[i], 0, 1)`. The normal is `nb + 4·Σ wmA_k·(wm_k − nb)`. A colour crease darkens the skin by up to 40 % from wm1 and wm2 only (not wm3), and only above `vRest.y` ≈ 147–151, which is the forehead and brow band. The lid fold is a separate effect driven by upper-lid bone angles (`uLids`, `rigState.ts:111-116`).
- **Mask coverage** (`masks.r8`, texels > 10 % out of 16 384): browsRaiseOuter L/R = **0** and cheekRaiseUpper L/R = **0** (empty, export defect). lips_D = 7 (almost empty), browsDown = 102 (small), browsLateral = 717, noseWrinkler = 996, smile = 1005, neckStretch = 2382.

Which control drives which map (probe, control = 1):

| Map (wm)                        | Driven by mapped controls                                 | Unused controls that would also drive it                             |
| ------------------------------- | --------------------------------------------------------- | -------------------------------------------------------------------- |
| browsDown (2)                   | browDown 1                                                | eyeFaceScrunch 1                                                     |
| browsLateral (2)                | browLateral 1 (= browDown × 0.6)                          | eyeFaceScrunch 0.5                                                   |
| browsRaiseInner (1)             | browRaiseIn 1 (max 0.8 via browInnerUp)                   |                                                                      |
| browsRaiseOuter (1)             | browRaiseOuter 1, **mask empty**                          |                                                                      |
| blink (1)                       | eyeBlink 1, **eyeLookDown 1**                             | eyeRelax 0.5                                                         |
| squintInner (1)                 | eyeSquintInner 0.8, eyeBlink 0.3                          |                                                                      |
| cheekRaiseInner/Outer/Upper (3) | eyeCheekRaise 0.8, mouthCornerPull 0.8 (Upper mask empty) | eyeFaceScrunch 1, mouthSharpCornerPull 0.5                           |
| noseWrinkler (2)                | noseWrinkle 1                                             |                                                                      |
| smile (3)                       | mouthCornerPull 1, mouthDimple 0.4, mouthLeft/Right 1     | mouthSharpCornerPull 0.5                                             |
| lips U/D (1+3)                  | cornerPull, stretch, dimple 0.5, purse                    | mouthLipsTighten 0.5, mouthSharpCornerPull 1                         |
| mouthStretch (2)                | mouthStretch 1                                            |                                                                      |
| purse (1)                       | mouthLipsPurse 0.2                                        |                                                                      |
| chinRaise (1)                   | jawChinRaiseD 1 (max 0.4 via mouthShrugLower)             | jawChinCompress 0.3                                                  |
| jawOpen (1)                     | jawOpen 1                                                 |                                                                      |
| neckStretch (2)                 | **none**                                                  | neckStretch 1 (the map works even though the neck joints are frozen) |

## 5. Gains and the maximum per region

Tonic weight = `Σ anchor·mix × expressiveness × 1.4 × look[region] × sideGain` (`anchors.ts:269-289`).

- `expressiveness = clamp(0.85 + 0.35·E + 0.1·N, 0.3, 1.4)` (`emotion/personality.ts:99`).
- `MALLORCA_LOOK` (`face/look.ts:13-21`) is brows 1.1, eyes 1.0, mouth 1.1, smileSide 0.3. It is the only look in use, for every character (`game/sessionFace.ts:2,42,62`).
- `sideGain` applies to `mouth*` names only: Left ×(1 + 0.35·0.3) = **1.105**, Right ×**0.895**.
- Overall factor: brows 1.54·expr, eyes 1.4·expr, mouth L 1.70·expr, mouth R 1.38·expr.

The RBF self-weight at an anchor's own PAD is 0.96–1.0 (probe), so an anchor is effectively pure there. Probe at expressiveness 1.0 (anchor at its own PAD) and the clamp it hits:

| Anchor | Top weights before clamp                                   | Clamped at motion.ts:167                                                              |
| ------ | ---------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| joy    | smileL 1.53, smileR 1.24, cheekSquint 0.91, eyeSquint 0.84 | the smile saturates. The eye cap 0.9 then cuts cheek+eye+blink from about 1.8 to 0.9. |
| anger  | browDown 1.54, mouthPressL 0.94, noseSneer 0.77            | the brows saturate. The press reaches 0.94 → control 0.42 (gain 0.45).                |
| sad    | browInnerUp 1.23, frownL 1.10, frownR 0.89                 | browInnerUp saturates → control 0.8                                                   |
| fear   | browInnerUp 1.31, eyeWide 0.77, stretchL 0.68              | browInnerUp saturates. eyeWide → control 0.54.                                        |

Maximum before clamping, any anchor at expressiveness 1.4: brows 2.16, eyes 1.27, mouth 2.14. After the clamp, each ARKit weight is ≤ 1, and the **control** maximum is `min(1, Σ gain)`. So brows can reach full browDown, but browRaiseIn only 0.8. The eyes reach eyeWiden 0.7 and are otherwise bounded by the closure cap. The mouth press reaches 0.45 and lip roll 0.45.

Consequences:

- From expressiveness ≈ 0.65 the strong anchors (joy, anger, sad, fear) already saturate their main channels. Expressiveness then changes only the minor channels, and pulses on saturated channels add nothing (`motion.ts:158`).
- Pulses are not multiplied by FACE_GAIN or expressiveness. Their peak equals the raw `PULSE_FACES` value × look × side × amp (≤ 1), for example anger browDown 1.10.

## 6. Tests that pin current behaviour

| Test                                                                                                                                                  | Pins                                                                | Affected by an emotion→weights redesign?                             |
| ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `face/face.test.ts:51-55` neutral at origin, mix sums to 1                                                                                            | the RBF blend                                                       | Yes, if the blend is replaced                                        |
| `face.test.ts:57-62` content → joy as V and A grow                                                                                                    | anchor ids `content`, `joy` and their PADs                          | Yes                                                                  |
| `face.test.ts:64-70` joy: jawOpen ≤ .1, upperUp ≤ .1, eyeSquint ≥ .6, dimple ≥ .45                                                                    | joy anchor values (owner rule: smile from the eyes, #136)           | Yes. Keep the intent.                                                |
| `face.test.ts:72-79` look/expressiveness scaling (anger PAD, mouthPress, browDown linear in expressiveness)                                           | `faceOf` linearity, anger anchor containing mouthPress and browDown | Yes                                                                  |
| `face.test.ts:104-128` pulse timings, control pulse, joy pulse has mouthSmileLeft, threshold 0.12                                                     | `pulsesFor`, `pulsesOf`, `PULSE_FACES.joy`                          | Partly, if pulse faces change                                        |
| `face.test.ts:130-180` frame: mask, calm neutral (Σweights < 0.5), hot vs cold bad beat (shown PAD), nervousness                                      | `faceFrame`, PAD, `nervousOf`                                       | Only "calm neutral Σ < 0.5" depends on weights                       |
| `ui/avatar/motion.test.ts:40-82` easing to 0.6, pulse fade, **max of overlapping pulses**, **pulse added to base (0.1 + 0.8 = 0.9)**, eye closure cap | Motion compositing                                                  | Yes, if compositing or clamping changes                              |
| `motion.test.ts:84-180` gaze, thinking, visemes, calm head, breathing                                                                                 | gaze, head, breath                                                  | Yes, if emotion starts to drive head or gaze                         |
| `ui/avatar/rig/controls.test.ts:26-53` clamp > 1, gain scaling, unknown names ignored, eyeLook weights ignored in favour of gaze                      | `controlsOf`                                                        | Only if raw controls bypass ARKit, or eyeLook weights start to count |
| `rig/rigState.test.ts:46-55` neck still when blinking                                                                                                 | the neck-joint freeze                                               | Yes, if neck controls are enabled                                    |
| `rigState.test.ts:76-97` lids, look-down lowers lids, browDownLeft yields blends and maps                                                             | the rig itself                                                      | No                                                                   |
| `rig/assets.test.ts:79-96,145-166` loads the mapping, mirrored wrinkle masks                                                                          | asset files                                                         | Only if `mapping.json` changes shape                                 |
| `rig/riglogic.test.ts`                                                                                                                                | wasm                                                                | No                                                                   |
| `emotion/appraisal.test.ts:328+` impulses                                                                                                             | emotion layer                                                       | No                                                                   |

Sandbox note: `web/prototypes/face-sandbox/` is untracked in this worktree. It was not audited.
