# Her face: from feelings to a continuous, vivid expression (issue #181)

Research and proposal. The two sources behind it:

- [literature.md](literature.md): FACS prototypes per emotion, intensity, blending, mood vs emotion, masking,
  exaggeration, the ARKit to FACS table.
- [rig.md](rig.md): an audit of our pipeline from `FaceFrame` to the MetaHuman controls, clamps, unused controls,
  head and gaze, wrinkle maps, tests.

The face sandbox `web/prototypes/face-sandbox` (`npm run face`) shows the real face with sliders for every emotion,
the mood, the mask and pulses, and prints the anchor mix and the strongest muscles.

## What is wrong today

1. **Emotions collapse into a PAD point.** `feltPadOf` sums each emotion's PAD vector with the mood, and the face is a
   Gaussian blend of 11 anchors around that point. Emotions with no anchor nearby disappear: hope 1.0 is 95% neutral,
   injustice 1.0 is 97% irritated, shame looks like disappointment, anger 1.0 with a neutral mood is 87% irritated and
   13% anger. Opposite emotions average to neutral. The literature calls this out: joy, pride and hope share an
   octant, and ALMA and WASABI keep emotion and mood in separate channels for this reason.
2. **The strong faces saturate and then clip.** `FACE_GAIN` 1.4 times expressiveness pushes the main channels of joy,
   anger, sadness and fear above 1 already at expressiveness 1; three clamps cut them to 1. Above about 0.65
   expressiveness only changes the minor channels.
3. **The anger shape is weak and partly wrong.** It lacks the upper lid raise (AU5), the lid tightener (AU7), the lip
   tightener and presser (AU23, AU24) and the chin raiser (AU17); the nose sneer and the upper lip raise read as
   disgust.
4. **Two thirds of the rig is idle.** 186 of 263 controls are reached by nothing. The rig has the exact controls we
   miss: `eyeUpperLidUp`, `eyeLowerLidUp`, `eyeFaceScrunch`, `browLateral`, `mouthLipsTighten*`, `mouthLipsPress`,
   `jawChinRaise*`, `jawChinCompress`, `jawClench`, `mouthSharpCornerPull`, `noseNostrilDilate`,
   `mouthCornerDepress`.
5. **Head and gaze ignore the emotion.** Only the shown mood tilts the head, at most about 4.6 degrees. No head down
   with the eyes up in anger, no tilt back in pride, no gaze down in shame (the shame pulse asks for it and
   `controls.ts` drops it).
6. **Surprise, hope and relief live only in pulses**, and the pulse faces are a second, separate mapping.
7. **The mask is one number for the whole face**, while in people the mouth is easy to control and the brows and
   the orbicularis leak.

## Proposal: one continuous mapping

Every feeling contributes on its own channel; nothing passes through an anchor search.

1. **A prototype per emotion.** Each of the 11 emotions gets a prototype from the FACS literature: target values on
   rig controls (ARKit names and raw MetaHuman controls, left and right apart), a head offset (pitch, yaw, roll), a
   gaze offset and a blink rate factor. Anger is the cold, determined form (AU4+7+23+24+17, a still stare, the head
   slightly lowered with the eyes up); injustice is anger plus a one-sided contempt corner; hope is interest (brows a
   little up, gaze fixed, lips parted, head forward); relief is released tension with a slow blink; shame is the
   worry brow with the gaze and head down; pride is a small smile with the head tilted back.
2. **A continuous intensity curve.** Each control of a prototype has a threshold; key controls start at 0, secondary
   ones later. The activation rises fast and saturates: `a = smoothstep-like((i - t) / (1 - t)) ^ gamma` with
   `gamma < 1`, so 0.2 is already visible and 1 is vivid. The prototypes are tuned to be readable and a little
   exaggerated at 1 (about 1.2 to 1.5 times a realistic face, weighted to brows, lids, head and gaze, not an open
   mouth), and stay within the rig's range so nothing clips.
3. **Blending by soft maximum.** For each control the emotions combine as `1 - prod(1 - a_e)`, so two emotions never
   exceed 1 and never cancel. Antagonists on the same tissue (smile vs frown corners, lip press vs jaw open, brow
   lowerer vs brow raiser where they cannot coexist) resolve smoothly by difference, `x - k * min(x, y)`: the stronger
   wins without a switch.
4. **Mood as a tonic layer.** The PAD mood drives a small baseline field (at most about 0.3 per control): pleasure the
   mouth corners and cheeks, arousal the lids and the blink rate, dominance the head pitch and the chin. It never
   produces a discrete emotion face by itself.
5. **The mask per control.** Each control has a controllability (mouth high, brows and orbicularis low). The mask
   suppresses a control by `mask * controllability`, and the suppression weakens as intensity grows, so strong
   feelings leak through the brows first. A masked strong feeling adds visible effort: lip press, chin raise, more
   blinks. The acted pose for a bluff keeps its meaning. Overload still weakens the mask.
6. **Pulses use the same prototypes.** An impulse plays the prototype of its emotion through the same curve with an
   onset, apex and offset envelope; there is no second table of pulse faces. Surprise stays a pulse because it lasts
   about a second, and its prototype is the classic AU1+2+5+26.
7. **Head and gaze from feelings.** The prototype offsets of head and gaze combine like the controls and feed
   `Motion`, which keeps its smoothing, idle and game gaze cues.
8. **Per character.** Expressiveness scales the intensity before the curve (not the weights after it), so a reserved
   character shows less at the same feeling but still reaches the same shape.

## How we check it

- Unit tests per emotion: monotonic and continuous from 0 to 1, visible at 0.2, no control above 1, each emotion's
  defining controls present (for anger: brow lowerer, lid tightener, lip tightener, chin raiser, head down).
- Blending tests: soft maximum, antagonists, mask by controllability, leakage at high intensity.
- The face sandbox for tuning by eye, and a contact sheet of every emotion at 0.25, 0.5, 0.75 and 1.
