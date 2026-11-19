# Emotion → face: literature for a continuous mapping

Scope: 11 OCC-style emotions (hope, fear, joy, distress, relief, disappointment, pride, shame, anger, injustice/resentment, surprise), a PAD mood and a "mask" (display rules), driving a MetaHuman face through ARKit-style shape names.

Confidence notes: entries marked **[verified]** were checked against an online source during this research; the rest is standard FACS/EMFACS literature cited from the primary references (Ekman, Friesen & Hager 2002 FACS manual; Ekman & Friesen 1975 _Unmasking the Face_), which are not freely online. Shape names for the MetaHuman rig should be checked against the project's DNA/control list.

AU shorthand: 1 inner brow raise, 2 outer brow raise, 4 brow lowerer, 5 upper lid raise, 6 cheek raise (orbicularis oculi, lateral), 7 lid tightener, 9 nose wrinkle, 10 upper lip raise, 12 lip corner pull, 14 dimpler, 15 lip corner depressor, 16 lower lip depressor, 17 chin raiser, 18 pucker, 20 lip stretch, 22 funnel, 23 lip tightener, 24 lip presser, 25 lips part, 26 jaw drop, 27 mouth stretch, 28 lip suck, 43 eyes closed, 45 blink, 51/52 head turn L/R, 53/54 head up/down, 55/56 head tilt L/R, 57/58 head forward/back, 61–64 eyes left/right/up/down.

---

## 1. Prototypes per emotion (FACS / EMFACS + head and gaze)

Main sources: Ekman, Friesen & Hager, _FACS Investigator's Guide_ (2002) EMFACS prototype table; Ekman & Friesen, _Unmasking the Face_ (1975); Matsumoto & Ekman (2008) "Facial expression analysis", _Scholarpedia_ <http://www.scholarpedia.org/article/Facial_expression_analysis>; Cordaro et al. (2018) "Universals and cultural variations in 22 emotional expressions across five cultures", _Emotion_ 18(1) <https://doi.org/10.1037/emo0000302>; Keltner & Cordaro (2017) "Understanding multimodal emotional expressions" in _The Science of Facial Expression_; Du, Tao & Martinez (2014) "Compound facial expressions of emotion", _PNAS_ <https://doi.org/10.1073/pnas.1322355111>.

Gaze rule for all emotions (Adams & Kleck 2003, 2005, _Psych. Science_ / _Emotion_, <https://doi.org/10.1111/1467-9280.t01-1-01427>): **direct gaze strengthens approach emotions** (anger, joy, pride), **averted gaze strengthens avoidance emotions** (fear, sadness, shame). Head up reads dominant, head down submissive (Mignault & Chaudhuri 2003, _J. Nonverbal Behavior_ <https://doi.org/10.1023/A:1023914509763>).

### Anger (hot)

|                |                                                                                                                                                                                                                       |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AUs            | 4 + 5 + 7 + 23 (+ 24 closed mouth) / 4 + 5 + 7 + 10 + 22/25 + 26 (open, shouting); 17 often                                                                                                                           |
| ARKit          | browDownL/R, eyeWide (AU5, small), eyeSquint (AU7), mouthPress / mouthRollLower+Upper (≈AU23), mouthUpperUp (AU10), jawOpen, mouthShrugLower (AU17), noseSneer (light, often co-recruited with AU4 at high intensity) |
| Head / gaze    | Direct, fixed gaze (stare); head slightly down and forward (chin lowered, AU54+57)                                                                                                                                    |
| Low intensity  | Brows only (AU4) or lids only (AU7), or lips only pressed (AU23/24). Ekman: partial anger is ambiguous; one region reads as "concentrating" or "determined"                                                           |
| High intensity | Full brow + lid + lip set; AU5 glaring upper lid; open square mouth with AU10, teeth shown                                                                                                                            |

### Anger (cold / determined)

|             |                                                                                                             |
| ----------- | ----------------------------------------------------------------------------------------------------------- |
| AUs         | 4 (moderate) + 7 + 23 + 24 + 17; **no AU5**, no open mouth                                                  |
| ARKit       | browDown, eyeSquint, mouthPress, mouthRollLower small, mouthShrugLower, jawForward (small)                  |
| Head / gaze | Long direct gaze, reduced blink rate, head still and level or slightly lowered; stillness itself is the cue |
| Low         | Lid tightening + lip press only (looks like focus)                                                          |
| High        | Narrowed eyes, tight thin lips, jaw set; slow head turn toward target                                       |

Basis: Ekman distinguishes closed-mouth (controlled) anger from open-mouth anger in _Unmasking the Face_; "determination" in Cordaro et al. 2018 and Keltner & Cordaro 2017 recruits AU4 + AU7 + AU17/24 with a fixed gaze. Lowered brows (AU4) alone read as dominant/threatening (Keating et al. 1981; Hess, Adams & Kleck 2005 _Cognition & Emotion_ <https://doi.org/10.1080/02699930441000193>).

### Fear (acute) vs anxiety / worry

|             | Fear                                                                                                 | Anxiety / worry                                                                           |
| ----------- | ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| AUs         | 1 + 2 + 4 + 5 + 20 + 25/26                                                                           | 1 + 4 (worry brow, "Omega"), 24 or 28 (lip press/suck), small 20, 17                      |
| ARKit       | browInnerUp, browOuterUp, browDown (small, adds the flat tense look), eyeWide, mouthStretch, jawOpen | browInnerUp + browDown, mouthPress, mouthRollLower, mouthStretch (small), mouthShrugLower |
| Head / gaze | Head pulled back (AU58) or turned away; eyes wide, gaze darting or fixed on threat, then averted     | Gaze aversion, scanning, **raised blink rate**, self-touch, small fidgets                 |
| Low         | Upper lids raised (AU5) and AU1+2+4 brow only; mouth neutral                                         | Brow AU1+4 slight, lip press                                                              |
| High        | Full brow, white sclera above iris, horizontally stretched mouth, jaw open                           | Persistent brow, frequent swallowing, lip biting/sucking                                  |

The AU1+2+4 brow is the most diagnostic fear element and hard to produce voluntarily (Ekman 2003, "Darker side of the face", _Ann. NY Acad. Sci._ <https://doi.org/10.1196/annals.1280.010>). Anxiety correlates: Harrigan & O'Connell (1996) "How do you look when feeling anxious? Facial displays of social anxiety", _Personality and Individual Differences_ <https://doi.org/10.1016/0191-8869(96)00099-6> — AU20 (lip stretch), more blinks, head/eye movements.

### Joy (Duchenne)

|             |                                                                                                                           |
| ----------- | ------------------------------------------------------------------------------------------------------------------------- |
| AUs         | 6 + 12 (+ 25, 26 when laughing)                                                                                           |
| ARKit       | cheekSquint (AU6), eyeSquint (small, lower lid push from cheek), mouthSmile, jawOpen (laugh), mouthUpperUp (small, teeth) |
| Head / gaze | Direct gaze, head slightly up or tilted; laughter adds head back + rhythmic movement                                      |
| Low         | AU12 alone (small closed smile); AU6 joins as intensity rises — low-intensity smiles are mostly non-Duchenne              |
| High        | Strong AU6 crow's feet, lower-lid bulge, lips parted, teeth, jaw drop                                                     |

Sources: Ekman, Davidson & Friesen (1990) "The Duchenne smile", _JPSP_ <https://doi.org/10.1037/0022-3514.58.2.342>; Frank, Ekman & Friesen (1993) "Behavioral markers and recognizability of the smile of enjoyment", _JPSP_ <https://doi.org/10.1037/0022-3514.64.1.83> (enjoyment smiles: AU6, smooth, 0.5–4 s, symmetric). Note: Krumhuber & Manstead (2009) <https://doi.org/10.1037/a0015872> show AU6 can also be posed, so AU6 is a strong but not perfect "felt" cue. Owner preference in this project: smiles from eyes, cheeks, dimples, mouth barely open.

### Surprise

|             |                                                                                                        |
| ----------- | ------------------------------------------------------------------------------------------------------ |
| AUs         | 1 + 2 + 5B + 26 (or 27)                                                                                |
| ARKit       | browInnerUp, browOuterUp, eyeWide, jawOpen                                                             |
| Head / gaze | Head pulls back slightly (AU58), gaze fixes on the cause                                               |
| Low         | Brows up only (AU1+2): reads as questioning/interest; jaw drop only reads as "dumbfounded"             |
| High        | Brows high, lids wide, jaw dropped; very short (≤ 1 s) — the briefest emotion, then turns into another |

Ekman & Friesen 1975; Reisenzein et al. (2006) "The cognitive-evolutionary model of surprise" _Cognition & Emotion_ shows the full prototype is rare in spontaneous surprise — often only brows or only jaw.

### Distress / sadness

|             |                                                                                                                           |
| ----------- | ------------------------------------------------------------------------------------------------------------------------- |
| AUs         | 1 + 4 + 15 (+ 17, + 11, + 43 partial lid droop)                                                                           |
| ARKit       | browInnerUp + browDown, mouthFrown, mouthShrugLower (pouting chin), eyeBlink small (heavy lids), eyeSquint small (crying) |
| Head / gaze | Head down (AU54), gaze down (AU64), slower and fewer movements                                                            |
| Low         | Inner brow AU1 (+4) only, or AU15 only; lids slightly lowered                                                             |
| High        | Oblique brows, mouth corners down, chin quiver/pout, cheeks raised in crying (AU6 appears!)                               |

The AU1+4 brow is one of Ekman's "reliable" muscles (few people can make it voluntarily).

### Disappointment

|             |                                                                                                                |
| ----------- | -------------------------------------------------------------------------------------------------------------- |
| AUs         | Weak sadness set (1 + 4 low), 15, 17, 24 (lip press), sometimes unilateral 14; often a "mouth shrug" (AU15+17) |
| ARKit       | browInnerUp small, mouthFrown, mouthShrugLower, mouthPress, mouthDimple one side                               |
| Head / gaze | Head drop or brief turn aside, gaze down/away, exhale, shoulders sag                                           |
| Low         | Lip press + brief AU15/17 shrug, short gaze aversion                                                           |
| High        | Sadness brow + pout; head shake                                                                                |

No canonical EMFACS prototype; it is a short-lived variant of sadness with self-regulation (lip press). Supported by research on facial reactions to losing (e.g. Matsumoto & Willingham 2006, Olympic judo medalists, _JPSP_ <https://doi.org/10.1037/0022-3514.91.3.568>: losers showed sadness/contempt/disgust elements and controlled, masked smiles on the podium).

### Shame vs embarrassment

|             | Shame                                                              | Embarrassment                                                                                         |
| ----------- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| AUs         | No smile; AU54 (head down) + AU64 (eyes down), sometimes AU1+4 low | Smile (AU12) controlled by AU24/23/15/14 ("suppressed smile"), AU54, AU64, face touch                 |
| ARKit       | Head pitch down, eyeLookDown, browInnerUp small, mouthPress        | mouthSmile + mouthPress / mouthFrown, eyeLookDown, head turn                                          |
| Head / gaze | Head and gaze down, body shrinking; avoids eye contact             | Sequence (Keltner 1995): gaze down → controlled smile → head down and turned left → face touch, ~ 5 s |
| Low         | Brief gaze down                                                    | Gaze aversion + tight smile                                                                           |
| High        | Sustained head down, slumped posture                               | Full sequence, blush                                                                                  |

Sources: Keltner (1995) "Signs of appeasement", _JPSP_ <https://doi.org/10.1037/0022-3514.68.3.441>; Tracy & Matsumoto (2008) pride and shame in Olympic athletes, _PNAS_ <https://doi.org/10.1073/pnas.0802686105>.

### Pride [verified]

|             |                                                                                                                   |
| ----------- | ----------------------------------------------------------------------------------------------------------------- |
| AUs         | Small smile AU12 (low intensity), AU53 head up / tilted back ~15–20°, sometimes AU6 low                           |
| ARKit       | mouthSmile (small, closed), cheekSquint small; head pitch up (rig/transform, not a blendshape)                    |
| Head / gaze | Head tilted slightly back, chest out, expanded posture, arms akimbo or raised; gaze looks down the nose at others |
| Low         | Small closed smile + slight head lift                                                                             |
| High        | Head back, expanded posture, arms up (triumph adds open mouth, AU25/26, shout)                                    |

Tracy & Robins (2004) "Show your pride", _Psychological Science_ <https://www.psychologicalscience.org/journals/psychological-science/j.0956-7976.2004.01503008.x/>; Tracy & Robins (2007/2008) "The prototypical pride expression" <https://pmc.ncbi.nlm.nih.gov/articles/PMC2575323>. Head tilt was tested at 15° vs 30°; the small smile and ~15–20° tilt matter most for recognition. Tracy & Matsumoto 2008 (PNAS, above) find the same in congenitally blind athletes.

### Hope / interest / anticipation

|             |                                                                                                                                                        |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| AUs         | Interest: AU1+2 low or AU4 low (concentration), AU5 small, lips slightly parted (AU25), sometimes AU12 small. Hope has no established facial prototype |
| ARKit       | browInnerUp/browOuterUp small, eyeWide small, jawOpen tiny / mouthClose relaxed                                                                        |
| Head / gaze | Head forward (AU57) and/or tilted, fixed attentive gaze on target, reduced blinks, body leans in                                                       |
| Low         | Gaze fixation + slight forward lean                                                                                                                    |
| High        | Raised brows, wide eyes, parted lips; for hope add lip press or small lip bite (tension of uncertain outcome)                                          |

Sources: Reeve (1993) "The face of interest", _Motivation and Emotion_ <https://doi.org/10.1007/BF00992223> (head/eye fixation, lips parted, brow movement); Rozin & Cohen (2003) "High frequency of facial expressions corresponding to confusion, concentration, and worry", _Emotion_ <https://doi.org/10.1037/1528-3542.3.1.68> (AU4 = concentration; AU1+4 = worry). Cordaro et al. 2018 include interest. Hope ≈ interest + mild positive tension; in an OCC model it is a prospect emotion, so its face should be mostly attention (gaze/head) rather than a smile.

### Relief

|             |                                                                                                                                                                           |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AUs         | No established prototype. Observed: brief AU43 eye closure, exhale (cheek puff release, AU25/26 with outward breath), AU12 small, release of prior tension (AU4/AU24 off) |
| ARKit       | eyeBlink (slow, long), cheekPuff → release, jawOpen small, mouthSmile small, browInnerUp brief                                                                            |
| Head / gaze | Head drops back or down, shoulders drop, gaze up or eyes closed                                                                                                           |
| Low         | Slow blink + exhale                                                                                                                                                       |
| High        | Eyes closed, head back, audible sigh, then smile                                                                                                                          |

Relief is best recognised in voice and breathing (Sauter, Eisner, Ekman & Scott 2010, _PNAS_ <https://doi.org/10.1073/pnas.0908239106>); on the face it is mainly the **removal** of a preceding tension (fear/hope) plus a sigh. Model it as a transition signal.

### Contempt / resentment / injustice

|             |                                                                                                                                               |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| AUs         | Contempt: **unilateral AU14** (and/or unilateral AU12), sometimes AU10 one side; resentment/injustice adds anger elements (AU4, AU7, AU23/24) |
| ARKit       | mouthDimpleL or R (one side), mouthSmileL/R one side, mouthUpperUp one side, noseSneer light, browDown, eyeSquint                             |
| Head / gaze | Head tilted back slightly, looking down the nose; head turned away while eyes stay on target; eye roll (AU61/63 upward sweep)                 |
| Low         | Slight one-sided lip-corner tightening                                                                                                        |
| High        | Clear smirk/sneer + head tilt back + eye roll; with anger: narrowed eyes and lip press                                                        |

Ekman & Friesen (1986) "A new pan-cultural facial expression of emotion", _Motivation and Emotion_ <https://doi.org/10.1007/BF00992253>; Matsumoto & Ekman (2004) contempt, _JPSP_ <https://doi.org/10.1037/0022-3514.87.4.529>. Asymmetry is the key feature, which a symmetric blendshape system loses unless L/R are driven separately.

---

## 2. Intensity

- **FACS intensity scale A–E**: A trace, B slight, C marked/pronounced, D severe/extreme, E maximum. The manual states the scale is **not equal-interval**: A and B (and E) are narrow bands, C and D cover most of the range (Ekman, Friesen & Hager 2002, ch. on intensity scoring; summary in Sayette et al. 2001 "A psychometric evaluation of FACS", _J. Nonverbal Behavior_ <https://doi.org/10.1023/A:1010669602974>).
- **Which AUs appear first.** At low intensity, expressions are **partial**: only one region moves (Ekman & Friesen 1975 describe "partial expressions" for each emotion). Typical first cues: joy → AU12 (AU6 later); surprise → AU1+2; fear → AU5 and/or AU1+2+4; anger → AU4 or AU7 or lip press; sadness → AU1(+4) or AU15; contempt → unilateral AU14. Lower-face cues dominate posed/social low expressions; upper-face cues dominate leakage.
- **Perception vs physical intensity.** Recognition accuracy rises roughly linearly with morph percentage (Hess, Blairy & Kleck 1997, _J. Nonverbal Behavior_ <https://doi.org/10.1023/A:1024902500935>), with low intensities (10–30%) hard for fear, sadness, disgust and easy for happiness and surprise (Wingenbach, Ashwin & Brosnan 2016, ADFES-BIV, _PLoS ONE_ <https://doi.org/10.1371/journal.pone.0147112>). For synthetic faces, Bartneck & Reichenbach (2005) "Subtle emotional expressions of synthetic characters", _IJHCS_ <https://doi.org/10.1016/j.ijhcs.2004.11.007> found perceived intensity tracks geometric intensity, while recognition accuracy saturates early (curvilinear, plateau around mid intensity). Implication: intensity needs a curve with a fast early rise (so small emotions are visible) and compression at the top.
- **Nonlinearity across AUs.** AUs are recruited in sequence rather than all scaling together (partial → full). AU co-activation at high intensity also spreads (AU4 recruits AU9/AU7; strong AU12 recruits AU6; crying recruits AU6).
- **Timing.** Onset typically 0.2–0.5 s for spontaneous expressions; apex 0.5–4 s; offset longer than onset. Spontaneous smiles have faster, smoother onset and less asymmetry than posed ones (Schmidt, Ambadar, Cohn & Reed 2006, _J. Nonverbal Behavior_ <https://doi.org/10.1007/s10919-005-0003-x>; Krumhuber & Kappas 2005, _J. Nonverbal Behavior_ <https://doi.org/10.1007/s10919-004-0887-x>: longer onset/offset with short apex rated most genuine). Surprise is the shortest (< 1 s). Micro-expressions: 1/25–1/2 s, usually one face region. Emotions decay; long-held apex looks posed.

## 3. Blending multiple emotions

- **Ekman's blends** (Ekman & Friesen 1975): two emotions show in **different face regions** (e.g., surprise brows + fear mouth; sadness brows + smiling mouth = "bittersweet"; anger brows + disgust mouth). The three regions are brows/forehead, eyes/lids, lower face. A blend can also be **sequential** (one emotion quickly follows another).
- **Compound expressions** (Du, Tao & Martinez 2014, PNAS, link above): 21 categories, e.g. happily surprised, sadly angry, fearfully surprised. The AU pattern of a compound is **close to the union** of the two components' AUs, with conflicting AUs dropped or attenuated (e.g., happily-disgusted keeps AU10+12, drops AU9 partially). Supports additive-per-AU with conflict rules.
- **Antagonists.** Brow: AU1+2 (raise) and AU4 (lower) **do co-occur** (fear brow AU1+2+4, sadness brow AU1+4) — so they are not mutually exclusive in FACS, but on a blendshape rig adding browInnerUp and browDown fully looks wrong unless the rig has a combination corrective. Mouth: AU12 vs AU15 are antagonists; co-activation reads as a suppressed or "miserable" smile — meaningful at moderate values, mush at full. Lids: AU5 vs AU7/AU43. Jaw: AU25/26/27 are one ordered dimension.
- **ECA approaches.**
  - Bui, Heylen, Poel & Nijholt (2001) "Generation of facial expressions from emotion using a fuzzy rule based system", AI 2001, LNCS 2256 <https://doi.org/10.1007/3-540-45656-2_8> [verified]: fuzzy rules per **pair** of emotions; muscle contraction intensities derived from emotion intensities; the stronger emotion takes the region (upper/lower) where they conflict.
  - Niewiadomski & Pelachaud, Greta: "Fuzzy similarity of facial expressions of embodied agents" (IVA 2007, LNCS 4722) and "Intelligent expressions of emotions" / complex expressions, _IJHCS_ 68(11) 2010 <https://radoslawniewiadomski.github.io/papers/IJHCS10_niewiadomskietal_draft.pdf> [verified]: face split into **areas**; each area of the complex expression is taken from one of the input expressions (superposition) or from the felt one where it leaks (masking); fuzzy similarity picks which. Buisine et al. IVA 2006 <https://radoslawniewiadomski.github.io/papers/IVA06_buisineetal.pdf> evaluate superposition vs masking.
  - Ochs, Niewiadomski & Pelachaud (2010) "How a virtual agent should smile?" IVA — smile types (amused, polite, embarrassed) as distinct AU/timing patterns.
  - Raouzaiou et al. (2002) "Parameterized facial expression synthesis based on MPEG-4", _EURASIP J. Applied Signal Processing_ <https://doi.org/10.1155/S1110865702206149>: intermediate emotions generated by combining FAP ranges of the **neighbouring** archetypal expressions on the activation–evaluation wheel — the same idea as PAD anchors, with the same limitation that an emotion is only as visible as its neighbours.
  - Albrecht, Schröder, Haber & Seidel (2005) "Mixed feelings: expression of non-basic emotions in a muscle-based talking head", _Virtual Reality_ <https://doi.org/10.1007/s10055-005-0153-5>: dimensional interpolation between basic expressions.
- **Games / production.**
  - Valve Source engine (Faceposer) uses FACS-based flex controllers with **dominance rules** (e.g. a blink dominates lid flexes) — <https://developer.valvesoftware.com/wiki/Flex_animation> / <https://developer.valvesoftware.com/wiki/Choreography_creation/Facial_expressions>.
  - Façade (Mateas & Stern 2003, <https://www.interactivestory.net/papers/MateasSternGDC03.pdf>): characters' faces are layered — a base mood expression with momentary reaction expressions overlaid, mixed per facial component.
  - Jason Osipa, _Stop Staring: Facial Modeling and Animation Done Right_ (3rd ed., 2010): brows and lids carry emotion, mouth carries speech; asymmetry and avoiding "twinning" make faces read as alive; build expressions from a small set of combinable controls.
  - Unreal MetaHuman control rig is FACS-based with **corrective combination shapes** (e.g. brow raise + brow down); the rig solves co-activation better than raw ARKit sums (<https://dev.epicgames.com/documentation/en-us/metahuman>).

## 4. Mood vs emotion on the face

- **Mood has no unique facial signal.** Ekman (1994) "Moods, emotions and traits" in Ekman & Davidson (eds.) _The Nature of Emotion_: moods lower the threshold for related emotions and colour their display, but do not have their own expression. Practical consequence: mood should be a **tonic, low-gain baseline + modulation of thresholds/timing**, not a full expression.
- **Tonic cues** that map to PAD:
  - Pleasure: tonic AU12/AU6 trace, relaxed brows vs AU1+4 trace, AU15 tone; depressed mood shows reduced overall expressivity, fewer smiles, gaze down (Ellgring 1989, _Nonverbal Communication in Depression_).
  - Arousal: blink rate (higher with anxiety/arousal; Harrigan & O'Connell 1996), speed and amplitude of movements, lid aperture (AU5 vs heavy lids AU43 partial), breathing rate, fidgeting.
  - Dominance: head pitch (up = dominant), direct gaze and gaze holding, lowered brows (AU4) vs raised brows (AU1+2 = submissive/appeasing), less smiling (Hess, Adams & Kleck 2005; Mignault & Chaudhuri 2003; Keating et al. 1981).
- **PAD-to-face models.**
  - Zhang, Wu, Meng & Cai (2007) "Facial expression synthesis using PAD emotional parameters for a Chinese expressive avatar", ACII 2007 <https://www1.se.cuhk.edu.hk/~hccl/publications/pub/ACII2007.pdf> [verified]: PAD → PEP (partial expression parameters, one per face region) → MPEG-4 FAP, mapping learned from annotated data. Region-wise parameters are the transferable idea.
  - Boukricha, Wachsmuth, Hofstätter & Grammer (2009) "Pleasure-arousal-dominance driven facial expression simulation", ACII 2009 <https://pub.uni-bielefeld.de/record/1998773> [verified]: virtual human Emma, ~25 AUs; random faces rated in PAD; regression gives each AU as a function of P and A at two dominance levels. Gives a continuous AU(P,A,D) field, which is a good model for **mood**, but discrete emotions with similar PAD (joy vs pride, fear vs anxiety, anger vs resentment) collapse.
  - Courgeon, Martin & Jacquemin, MARC (2008/2009) <https://ifaamas.csc.liv.ac.uk/Proceedings/aamas08/proceedings/pdf/paper/AAMAS08_0377.pdf> [verified]: PAD cube with eight labelled expressions at corners, interpolation inside — the same anchor-blend structure as the current implementation.
  - Becker-Asano & Wachsmuth, WASABI (2010) <https://cs.uwaterloo.ca/~jhoey/teaching/cs886-affect/papers/WASABIAAMAS2010.pdf> and Gebhard, ALMA (2005) <https://doi.org/10.1145/1082473.1082478>: both keep **mood in PAD but emotions as separate discrete intensities**; WASABI maps PAD regions to emotions with "awareness likelihood" and drives the face from the emotion intensities, not from the PAD point.
- **Does PAD-anchor blending lose discrete emotions?** Yes, structurally. Mehrabian's PAD placement of OCC emotions (table in Gebhard 2005) puts several emotions in the same octant (joy, pride, hope, relief all +P; fear and shame both −P −D; anger and resentment both −P +A +D). Any mapping that first collapses emotions to a PAD point and then reads the face from that point cannot separate them, and simultaneous opposite emotions average to near neutral. This is why ALMA/WASABI keep emotions and mood as separate channels.

## 5. Display rules and masking

- **Display rules** (Ekman & Friesen 1969 "The repertoire of nonverbal behavior", _Semiotica_; Matsumoto 1990): **intensify, de-intensify (minimise), neutralise, mask (substitute another expression), qualify** (add a smile to comment on the felt expression).
- **Inhibition hypothesis / reliable muscles** (Darwin 1872; Ekman 2003 "Darker side of the face", link above): muscles hard to activate voluntarily are also hard to suppress: AU1+4 (sadness brow), AU1+2+4 (fear brow), AU20, AU6 (felt smile), narrowing of the red lip margin AU23 (anger). Lower face (mouth) is most controllable; upper face (brows, lids) leaks.
- **Empirical leakage.** Porter & ten Brinke (2008) "Reading between the lies", _Psychological Science_ <https://www.psychologicalscience.org/journals/psychological-science/j.1467-9280.2008.02116.x/> [verified]: every participant leaked at least once; masked emotions had more inconsistent expressions and **higher blink rate**; leaks appear in **upper or lower face only**; micro-expressions rare (2% of expressions). Porter, ten Brinke & Wallace (2012) _J. Nonverbal Behavior_ <https://doi.org/10.1007/s10919-011-0120-7>: **high-intensity emotion is harder to neutralise**, leaking in the upper face. Ekman, Friesen & O'Sullivan (1988) "Smiles when lying", _JPSP_ <https://doi.org/10.1037/0022-3514.54.3.414>: masking smiles lack AU6 and carry traces of the felt negative (AU4, AU15, AU14). Hurley & Frank (2011) "Executing facial control during deception", _J. Nonverbal Behavior_ <https://doi.org/10.1007/s10919-010-0102-1>: people suppress eyebrow movements poorly.
- **Control signals.** Suppression itself shows: lip press (AU24), lip suck/bite (AU28), chin raise (AU17), reduced movement overall, more blinks, gaze aversion; poker literature calls this the "frozen" face.
- **Continuous model** (synthesis of the above; also the structure of Niewiadomski's masking where felt areas leak through the displayed expression):
  `shown_AU = felt_AU · (1 − m · c_AU · (1 − λ · I²)) + m · acted_AU + m · effort_AU`
  where m = mask 0..1, c_AU = controllability of that AU (≈0.9 mouth corners/jaw, ≈0.6 lids, ≈0.4 brows, ≈0.3 AU6), I = felt intensity of the emotion driving that AU, λ ≈ 0.5 leakage with intensity, effort_AU = the control signals above scaled by m·I. Optionally short onset leaks: the mask engages with ~150–300 ms delay after an emotion spike, letting a micro-leak through, mostly in one region.

## 6. Exaggeration for readability

- **Principle.** Exaggeration is one of the 12 Disney principles (Thomas & Johnston 1981, _The Illusion of Life_; Lasseter 1987 SIGGRAPH "Principles of traditional animation applied to 3D computer animation" <https://doi.org/10.1145/37402.37407>): push poses past reality so the idea reads, while keeping them believable; clear silhouettes and staging; one idea at a time.
- **Caricatured expressions.** Calder, Young, Rowland & Perrett (1997) "Computer-enhanced emotion in facial expressions", _Proc. R. Soc. B_ <https://doi.org/10.1098/rspb.1997.0130>: expressions caricatured beyond the original (+50%) were rated more intense and recognised at least as well; anti-caricatures the reverse. Calder et al. (2000) _Cognition_ extend this to recognition speed.
- **Avatars.** Mäkäräinen, Kätsyri & Takala (2014) "Exaggerating facial expressions: a way to intensify emotion or a way to the uncanny valley?", _Cognitive Computation_ 6(4) <https://doi.org/10.1007/s12559-014-9273-0> [verified]: perceived intensity rises with exaggeration at all realism levels; stylised faces need stronger expressions for the same perceived intensity; strangeness rises at extreme exaggeration, more so for realistic faces. Hyde, Carter, Kiesler & Hodgins (2013) "Perceptual effects of damped and exaggerated facial motion in animated characters", IEEE FG <https://kilthub.cmu.edu/articles/journal_contribution/Perceptual_Effects_of_Damped_and_Exaggerated_Facial_Motion_in_Animated_Characters/6470309/1> [verified]: ±20% motion; **realistic characters were liked more with exaggerated motion**, cartoon ones with damped motion. Hyde et al. (2015 CHI, 2016) <https://ri.cmu.edu/?p=121975>: higher facial motion magnitude → perceived more extraverted, more persuasive/social.
- **Recommended gain.** The literature supports moderate exaggeration for realistic faces: +20% (Hyde) is safely positive, +50% (Calder) still reads as more intense; beyond that the uncanny risk rises for photoreal faces (Mäkäräinen). For a MetaHuman seen small on a phone, a top-end gain of about **1.2–1.5× realistic apex** is defensible, with exaggeration applied more to timing, head/gaze and the upper face than to wide-open mouths (which also fits the owner's "mouth barely open" preference).

## 7. ARKit 52 ↔ FACS

Apple reference: <https://developer.apple.com/documentation/arkit/arfaceanchor/blendshapelocation> (each 0 neutral … 1 fully articulated). Community mappings: Melinda Ozel's ARKit-to-FACS cheat sheet (linked from <https://developer.apple.com/forums/thread/703686>); cross-system sheet <https://docs.google.com/spreadsheets/d/118jo960co3Mgw8eREFVBsaJ7z0GtKNr52IB4Bz99VTA/edit>; Meta's FACS-based 70-shape set for comparison <https://developers.meta.com/horizon/documentation/unity/move-face-tracking/>. An expert-validated blendshape↔AU mapping is Turrisi et al. (2026) "Blendshape features meet action units", _Computers in Human Behavior Reports_ doi 10.1016/j.chbr.2026.101125 (table not retrieved).

| FACS AU                                | ARKit shape(s)                                             | Quality                                                       |
| -------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------- |
| AU1 inner brow raise                   | browInnerUp (single, not L/R)                              | good, no asymmetry                                            |
| AU2 outer brow raise                   | browOuterUpLeft/Right                                      | good                                                          |
| AU4 brow lowerer                       | browDownLeft/Right                                         | partial: lowers but weak medial (corrugator) pull             |
| AU5 upper lid raise                    | eyeWideLeft/Right                                          | good                                                          |
| AU6 cheek raise                        | cheekSquintLeft/Right                                      | good                                                          |
| AU7 lid tightener                      | eyeSquintLeft/Right                                        | good (mixes some AU6)                                         |
| AU9 nose wrinkle                       | noseSneerLeft/Right                                        | good                                                          |
| AU10 upper lip raise                   | mouthUpperUpLeft/Right                                     | good                                                          |
| AU11 nasolabial deepener               | —                                                          | gap                                                           |
| AU12 lip corner pull                   | mouthSmileLeft/Right                                       | good                                                          |
| AU13 sharp lip pull                    | —                                                          | gap                                                           |
| AU14 dimpler                           | mouthDimpleLeft/Right                                      | good                                                          |
| AU15 lip corner depressor              | mouthFrownLeft/Right                                       | good                                                          |
| AU16 lower lip depressor               | mouthLowerDownLeft/Right                                   | good                                                          |
| AU17 chin raiser                       | mouthShrugLower (lower lip pushed up/out)                  | approximate; no chin-boss bulge                               |
| AU17 effect on upper lip               | mouthShrugUpper                                            | approximate                                                   |
| AU18 pucker                            | mouthPucker                                                | good                                                          |
| AU20 lip stretch                       | mouthStretchLeft/Right                                     | good                                                          |
| AU22 funnel                            | mouthFunnel                                                | good                                                          |
| AU23 lip tightener                     | — (approx. mouthPress + small mouthRollLower/Upper)        | **gap**: no lip-narrowing                                     |
| AU24 lip presser                       | mouthPressLeft/Right                                       | good                                                          |
| AU25 lips part                         | indirect (jawOpen − mouthClose, or mouthLowerDown/UpperUp) | gap                                                           |
| AU26 jaw drop / AU27 mouth stretch     | jawOpen                                                    | one dimension                                                 |
| AU28 lip suck                          | mouthRollLower / mouthRollUpper                            | good                                                          |
| AU29 jaw thrust                        | jawForward                                                 | good                                                          |
| AU30 jaw sideways                      | jawLeft/Right                                              | good                                                          |
| AU33/34 cheek blow/puff                | cheekPuff                                                  | good                                                          |
| AU38/39 nostril dilate/compress        | —                                                          | gap                                                           |
| AU43 eyes closed / AU45 blink          | eyeBlinkLeft/Right                                         | good; AU41/42/44 (droop, slit, squint) only via partial blink |
| AU61–64 eye movements                  | eyeLookIn/Out/Up/Down L/R                                  | good                                                          |
| AU51–58 head                           | none (head transform)                                      | outside blendshapes                                           |
| AU21 neck tightener, AU31 jaw clencher | —                                                          | gap                                                           |
| —                                      | mouthClose, mouthLeft/Right                                | no direct AU (correctives / lip shift)                        |

**Known gaps relevant to this project:** no AU23 (key for cold anger and masking), no true AU17 chin bulge, AU1 not lateralised (no asymmetric worry/skeptic brow), no AU11/AU13/AU38, AU25 only indirect, no wrinkle maps. The **MetaHuman rig itself has FACS controls for most of these** (e.g. CTRL_expressions_mouthLipsTightenU/D, jawChinRaiseD/U, browRaiseInL/R separately, browLateralL/R for corrugator pull, noseNostrilDilate, neckStretch, plus wrinkle maps driven by controls) — verify names in the project's DNA. Driving those controls directly rather than through ARKit names closes the gaps.

---

## Implications for a continuous emotion→face mapping

1. **Keep emotions and mood as separate channels; do not collapse emotions to a PAD point.** This is what ALMA and WASABI do, and what Ekman's view of mood implies. Each emotion e with intensity I_e owns an AU prototype vector P_e (tables above, including unilateral parts and head/gaze). Mood adds a small tonic AU field M(P,A,D) (Boukricha-style regression or a hand-tuned linear map) plus modulation of blink rate, head pitch, gaze holding and movement speed.

2. **Per-emotion intensity curve with staged recruitment.** Instead of scaling the whole prototype by I_e, give each AU in P_e an onset threshold and its own curve: `a_e,AU = w_AU · s((I_e − t_AU)/(1 − t_AU))`, with s a smoothstep or `1 − (1−x)^γ` with γ≈2 (fast early rise, compressed top). Low thresholds for the "first cues" in §2 (AU12 for joy, AU1+2 for surprise, AU4/AU7 for anger, AU1(+4)/AU15 for sadness, unilateral AU14 for contempt, gaze/head for hope, pride and shame), higher for spreading AUs (AU6 for joy, AU5/AU20 for fear, AU10/jawOpen for anger). This makes every emotion visible from small values and avoids the invisible-anchor problem by construction.

3. **Combine emotions per AU with a soft maximum, not a weighted average.** For each AU: `A_AU = 1 − Π_e (1 − a_e,AU)` (probabilistic OR) or a p-norm with p≈3. Both are continuous, never exceed 1, keep a single emotion at full strength, and make two co-present emotions both visible (Du et al.'s "compound ≈ union"). A weighted average dilutes each emotion and is what makes blends unreadable.

4. **Resolve antagonists by difference, regionally.** Define antagonist pairs on the same tissue (browInnerUp+browOuterUp vs browDown only when the rig lacks a corrective; mouthSmile vs mouthFrown; eyeWide vs eyeSquint/eyeBlink; jawOpen vs mouthPress). Output `x' = x − k·min(x, y)` for both, k≈0.5–0.7, so the stronger wins smoothly and a moderate co-activation remains as a meaningful "suppressed smile" or "worried smile". Keep AU1+AU4 together (legit sadness/fear brow) and use the MetaHuman corrective for it. Optionally add Ekman/Bui regional dominance as a soft weight: in each region (brows, lids, lower face) scale the weaker emotion's AUs by `(I_weak / I_strong)^β`, β≈1, which reproduces Ekman's regional blends without special cases.

5. **Head and gaze are part of the prototype, combined the same way.** Pride → pitch up; shame/distress/disappointment → pitch and gaze down; anger/cold anger → direct stare, pitch slightly down, fewer blinks; fear → head back, eyes wide; hope/interest → head forward, fixation; contempt → pitch up with lateral head turn and eyes kept on target. Use Adams & Kleck: approach emotions push gaze toward the player, avoidance emotions push it away; sum as signed contributions and clamp.

6. **Asymmetry as data, not as a special case.** Store L/R separately in prototypes (contempt and resentment AU14/AU12 one side; a small random asymmetry on all AUs for life). Drive MetaHuman controls directly where ARKit lacks L/R (AU1).

7. **Mask as a per-AU controllability filter with intensity-dependent leakage** (formula in §5). Low controllability for AU1+4, AU1+2+4, AU6, AU20, AU23; high for mouth corners and jaw. Add the effort signals (lip press AU24, chin raise AU17, more blinks, less movement) scaled by mask × suppressed intensity, so masking itself is readable — this is exactly the poker tell players look for. An acted pose (neutral or a polite AU12-only smile without AU6) is blended in with the mask.

8. **Timing per emotion.** Use an attack/decay envelope per emotion (onset 0.2–0.5 s, faster for surprise and fear, slower for sadness and relief; apex then decay toward the mood baseline), with relief also driving the release of the previous tension and a sigh/slow blink.

9. **Readability gain.** Apply a global gain of about 1.2–1.5× over realistic apex values, weighted toward upper face, lids, head and gaze rather than the open mouth. Check the extremes for uncanniness at full intensity of two strong emotions combined, since the soft-max lets several prototypes reach their apex at once.

10. **Close the ARKit gaps through the MetaHuman controls**: AU23 (lip tightener), AU17 chin bulge, lateralised AU1, corrugator pull (browLateral) and wrinkle maps matter most for anger, cold anger, worry and masking.
