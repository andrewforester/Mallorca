# One general model of the game, her feelings and her play

Her play style is five numbers (aggression, looseness, bluff, sizing, stickiness) sent to the solver. Today they come
from a natural style that experience pulls back to the blueprint, times an emotional factor that only negative load
lets through. In experiments (2026-11-10) this gave three problems: most characters play almost the blueprint, every
character tilts in the same direction (looser and more aggressive), and positive emotions never reach the play. The
appraisal of table events is a table of special cases, and the fear inside a hand repeats what the solver already
knows from equity.

This design replaces both directions, the game to her feelings and her feelings to her play, with one general
model. Characters differ only through their traits passing the same formulas. Everything moves continuously, sharply
only when the situation changes sharply, and extreme states converge to the edges instead of being clipped.

The design was built and tuned in a prototype outside the repository. Its numbers are the acceptance reference
(section "Reference numbers").

## Scope

In scope: the cash game; the emotion engine (`src/emotion`); its readers in `persona`, `face`, `game` and the debug
panel; the arena's persona bots; nine characters on the start screen.

Out of scope, each a later task: her own bluff (the fear of a bluff at risk and the bluff in general); tournaments
(stakes relative to a shrinking stack); difficulty labels measured in the arena; the start screen redesign (#127);
the face showing the new approach axis in head and gaze, which comes as its own step with screenshots.

## 1. Personality

`Personality` keeps the Big Five in [-1, 1], `suppression` and `control` in [0, 1]. `experience` is removed from the
model: it no longer pulls the style to the blueprint and no longer adds to composure. The field, its slider and the
arena's style bots that read it go.

Two derived stances drive the appraisal, both logistic so they stay in (0, 1):

```
selfBlame = σ(1.2·C + 0.8·N + 0.8·A − 0.6·E)
control   = σ(−1.2·N + 0.6·E − 0.5·A + (control − 0.5))
urgency   = clamp01(0.5·N − 0.5·C)
```

`selfBlame` is whom she blames for a bad outcome: herself, or the opponent. `control` is the sense of coping, whether
pressure feels like a challenge or a threat. `urgency` is negative urgency from the UPPS model of impulsivity: acting
rashly under strong emotion.

`composure = clamp(0.45 + 0.15·C − 0.25·N + 0.2·control, 0.1, 1.2)` and
`discipline = clamp(0.25 + 0.2·C − 0.15·N + 0.5·control, 0, 0.95)` stay as they are, minus experience.

## 2. The game to her feelings: appraisal

Every event is appraised on the same axes, and emotions follow from the axes by one set of formulas. No event kind
names an emotion.

| Axis         | Meaning                                       | Range   |
| ------------ | --------------------------------------------- | ------- |
| `value`      | how good or bad, signed                       | [-1, 1] |
| `realized`   | it happened, or it may still happen           | bool    |
| `resolved`   | how much of an earlier expectation it settles | [0, 1]  |
| `self`       | her share of the cause                        | [0, 1]  |
| `opponent`   | the opponent's share                          | [0, 1]  |
| `luck`       | the cards' share                              | [0, 1]  |
| `expected`   | how likely a good outcome looked before       | [0, 1]  |
| `unexpected` | how much it went against the odds             | [0, 1]  |
| `control`    | her sense of coping at this moment            | (0, 1)  |

Sizes of bets and equity changes are in bb through `scaled(bb) = 1 − e^(−|bb| / 20)`, a smooth curve with no
threshold. Results go through `settled(bb) = |bb| / (|bb| + 20)`, the same slope for small pots that keeps growing
past 60 bb (section "Addendum after the feeling-check").

### Events to axes

- `deal`: `value = 0.6 · smoothstep(0.6, 0.85, equity)`, luck.
- `street`, every change of her equity: `value = Δequity · (0.3 + 0.7 · scaled(atStake))`, luck for a new card or
  the reveal, opponent when his action narrowed his range,
  `resolved = |Δequity|`, `expected` = the equity before, `unexpected = sat(3 · (|Δequity| − 0.15))`. There is no
  20% swing threshold any more: a small change gives a small reaction.
- `opponentBet`: prospective, opponent,
  `value = −0.6 · scaled(size) · 4·eq·(1 − eq) · (1 + raise · 0.5 · (1 + sat(pressure / 3)))`,
  `control = leaning(control, eq)`. A bet weighs most when the outcome is open, and little against her nuts or her
  dead hand.
- `result`: realized, `value = ±settled(net)`, `resolved = 1`, `expected` = her equity when the money went in. The
  cards' share is `smoothstep(0.5, 0.95, expected)` on a loss (lost while ahead) and `smoothstep(0.5, 0.9, 1 −
expected)` on a win (won while behind). The rest is shared between her and the opponent by
  `σ(logit(stance) ± ln 3)`: `+` when her bet was called last, `−` when she called his, the stance alone when nobody
  bet; the stance is `selfBlame` on a loss and `control` on a win.
- `bluff`, `mistake`: realized, self, `value = +0.8 · scaled(pot)` or `−scaled(pot)`, `−scaled(cost)`.
- `ownMove` bet keeps today's reactions until the bluff task, through the axes: below 45% equity a prospective bad
  event of her own, `−0.5 · scaled(amount) · (1 − eq)` (fear); from 70% a realized good one,
  `0.2 · scaled(amount) · smoothstep(0.7, 0.9, eq)` (joy and pride).
- `ownMove` fold: realized, opponent, `value = −0.35 · scaled(facing) · smoothstep(0.35, 0.75, eq)`, `resolved = 1`.
- `chat`: opponent; tease −0.25, mock bluff −0.35, compliment +0.25, friendly +0.1 realized; claim of strength −0.12 and
  of weakness +0.1 prospective.

### Axes to emotions

With `m = |value|`. A bad outcome is one magnitude divided by who is to blame and whether she copes, not a sum of
independent reactions: frustration with a target and a sense of control becomes anger or injustice, without control
it stays distress and disappointment.

```
bad, realized:
  distress       = m · (1 − (opponent + luck·expected) · control)
  injustice      = m · luck · expected
  anger          = m · opponent · control
  shame          = m · self
  disappointment = m · expected · (1 − control)
bad, prospective:
  fear  = m · (1 − opponent · control)
  anger = m · opponent · control
good, realized:
  joy    = m
  pride  = m · self
  relief = fear now · resolved
good, prospective:
  hope = m
any:
  surprise = unexpected
```

Each amount is multiplied by her gain for that emotion (the Big Five gains of today) and added with saturation. An
impulse does not land at once: it rises over `ATTACK_S = 0.5` s. The split into steps is done in log space, so the
steps add up to exactly one saturated impulse.

### Tension inside a hand

While a hand runs, hope and fear track a target that is a property of the position, not of the solver's equity:

```
atStake  = pot / 2 + ½ · future · |2·eq − 1|,  future = min(stack, pot · streetsLeft)
tension  = sat(atStake / 20) · 4·eq·(1 − eq)
leaning  = σ(logit(control) + 0.5 · logit(eq))
hope*    = tension · leaning · gain(hope)
fear*    = tension · (1 − leaning) · gain(fear)
```

The tension is how much is at stake times how open the outcome is. Future money counts as expected action: money
goes in when someone is clearly ahead, so a limped coin flip is barely tense and a flopped straight is worth more
than the pot. The leaning is her coping, tilted by half the equity: high control feels the tension as excitement,
low control as fear, and her nuts lean to hope. Hope rises with a half-life of 0.8 s, fear of 0.25 s. When the hand
ends both fade with a half-life of `RELEASE_S = 1.5` s, never in one step.

The weight 0.5 on equity is a deliberate compromise. At 0 an impulsive character fears her own nuts; at 1 the fear
repeats the solver's equity almost fully. At 0.5 the difference in aggression between behind and ahead in a big
pot is 0.12, against 0.15 today.

## 3. Her emotional state

The PAD points of the emotions stay as they are. A fourth dimension is added beside them: **approach**, the tendency
to act or to withdraw. It is a property of every emotion, it accumulates in the mood, and every reader of PAD gets it
next to PAD.

| Emotion  | hope | fear  | joy | distress | relief | disappointment | pride | shame | anger | injustice | surprise |
| -------- | ---- | ----- | --- | -------- | ------ | -------------- | ----- | ----- | ----- | --------- | -------- |
| approach | −0.1 | −0.43 | 0.1 | −0.5     | 0.4    | −0.4           | 0.3   | −0.6  | 0.6   | 0.4       | −0.1     |

Approach equals the PAD dominance for every emotion except anger and injustice. In PAD, anger has a dominance of only
+0.25, yet anger is the one negative emotion that moves a person toward action (approach motivation).

The mood becomes four-dimensional. Approach moves with the same rules as P, A and D: toward the weighted centre of
the active emotions over `changeTimeS = 600` s, and back to rest over `returnTimeS = 1200` s. The rest of approach is
0 for everyone. The character at rest is already in the natural style, and a personal rest made mixed emotions pull
anxious characters up and bold ones down.

## 4. Her feelings to her play

```
a         = Σ emotion · (P, A, approach)  +  2 · (mood − rest)          the affect, three numbers
a_approach += 0.8 · urgency · max(0, a_arousal)
intensity = |a|
reach     = (1 − discipline) · intensity² / (intensity² + composure²)
push_k    = 2 · reach · (w_k · a) / intensity
nature_k  = Σ_t STYLE_COEFFICIENTS_k,t · trait_t  /  Σ_t |STYLE_COEFFICIENTS_k,t|      in [-1, 1]
style_k   = 2 ^ tanh(atanh(0.8) · nature_k + push_k)
```

| Axis `w_k` | P   | A   | approach |
| ---------- | --- | --- | -------- |
| aggression | 0.1 | 0.3 | 1.0      |
| looseness  | 0.4 | 0.3 | 0.5      |
| bluff      | 0   | 0.5 | 0.9      |
| sizing     | 0   | 0.6 | 0.6      |
| stickiness | 0.3 | 0.2 | 0.8      |

- **Natural style**: the most extreme character reaches 80% of the log range, ×1.74 or ×0.57, so emotion always has
  room. There is no clamp: `tanh` approaches 0.5 and 2 asymptotically.
- **Reach** replaces load and overload as the gate to play. It is a smooth threshold at composure, not a switch:
  at `intensity = composure` half of what discipline lets through arrives.
- **Direction** comes from the state, so it differs by character without special cases. Anger and pride push up;
  fear, shame and distress push down. Stickiness follows approach: anger calls ("I don't believe you"), fear folds.
- **Urgency** turns arousal into action for the impulsive only: average and conscientious characters are not
  touched.
- The session result has no direct term any more. Losses act through the emotions they caused and through the mood,
  which remembers them for minutes and forgets over 20.

`toBotBias` stays: tightness is `1 / looseness`.

## 5. What readers get

`Snapshot` keeps its shape where readers depend on it, with new meanings and two additions:

- `load` becomes `{ intensity, strain, overload, reach, composure, discipline, parts }`. `parts` are the emotions'
  contributions to the affect, for the debug panel. `strain` is the length of the negative emotions' part of the
  affect plus the mood's part times how unpleasant its shift is, and `overload = strain² / (strain² + composure²)`,
  the same smooth threshold on it: the mask, the words "on tilt", the prosody and the conversation rules read it, so
  joy and pride move her play but never put her on tilt.
- `mood` stays the PAD triple, and `approach` is added: the mood's approach. `defaultMood` stays.
- `affect` is added: the play affect `a`.
- `bias` is the style above. `drivers`, `LOAD_SOURCES` and `desperation` go.

Readers that change:

- `face/frame.ts` `nervousOf` reads negative approach of the mood instead of negative dominance.
- `game/debugView.ts` and the debug panel: the strain block shows intensity against composure, reach and the
  emotions' parts; the mood block shows approach; the personality block loses experience and shows selfBlame,
  control and urgency; the bias block shows nature, the state's push and the sent bias.
- `tools/arena/profileBots.ts`: the style bot plays the natural style `2^(0.8·nature)` without emotion.
- `docs/emotion/README.md`, `ARCHITECTURE.md` (emotion, persona and face sections), and
  `prototypes/emotion-lab` follow the model. `docs/emotion/generated.md` is regenerated.

## 6. Characters

The four presets take the Big Five of the archetype closest to them, four new characters join, and Mallorca keeps her
own. All nine are on the start screen, in the current layout. The neutral profile stays in the debug panel only, as
a reference.

| Key      | Name     | Archetype                          | O    | C    | E    | A    | N    | control | suppression |
| -------- | -------- | ---------------------------------- | ---- | ---- | ---- | ---- | ---- | ------- | ----------- |
| mallorca | Mallorca | warm, curious and steady, as today | 0.4  | 0.2  | 0.4  | 0.5  | 0.1  | 0.7     | 0.35        |
| ingrid   | Ingrid   | cold, organised, unflappable       | 0.2  | 0.8  | −0.2 | −0.4 | −0.8 | 0.8     | 0.85        |
| mira     | Mira     | gentle, kind, easy-going           | 0.3  | 0.2  | 0.2  | 0.9  | 0.1  | 0.5     | 0.3         |
| nina     | Nina     | anxious perfectionist              | −0.3 | 0.8  | −0.4 | 0.3  | 0.8  | 0.3     | 0.55        |
| lola     | Lola     | impulsive and touchy               | 0.5  | −0.6 | 0.7  | 0.2  | 0.8  | 0.1     | 0.08        |
| sol      | Sol      | cheerful outgoing adventurer       | 0.8  | −0.5 | 0.9  | 0.5  | −0.2 | 0.4     | 0.2         |
| rita     | Rita     | brash, quarrelsome, thick-skinned  | 0.8  | −0.7 | 0.9  | −0.6 | −0.4 | 0.3     | 0.2         |
| vera     | Vera     | sharp-tongued but nervous pedant   | −0.4 | 0.8  | 0.4  | −0.5 | 0.6  | 0.2     | 0.5         |
| greta    | Greta    | reserved and cautious              | −0.6 | 0.5  | −0.8 | 0.2  | 0.2  | 0.6     | 0.6         |
| neutral  | (debug)  | average in every trait             | 0    | 0    | 0    | 0    | 0    | 0.5     | 0.3         |

Suppression is kept for the existing four and chosen to fit the new ones; it shapes only the face.

Start screen copy (English, no capitals for emphasis, no dashes as punctuation). The difficulty labels are
provisional until the arena measures them.

| Key      | Line                                                | Label          | Hello                                       |
| -------- | --------------------------------------------------- | -------------- | ------------------------------------------- |
| mallorca | Warm and curious. Opens up when the cards are kind. | A fair fight   | Oh, it's you. Sit, I'll deal.               |
| ingrid   | A professional. Nothing rattles her.                | The toughest   | Your blind.                                 |
| mira     | Kind and easy-going.                                | Comfortable    | Shall we? No hurry.                         |
| nina     | Anxious and exacting. Hates her own mistakes.       | A gentle start | Um, hi. Go easy on me?                      |
| lola     | Quick to laugh, quick to take offence.              | A wild ride    | Finally! Deal me in, I feel lucky.          |
| sol      | Cheerful and bold. Loves a gamble.                  | Lively         | Ooh, a new face! Let's make it interesting. |
| rita     | Brash and stubborn. Never backs down.               | Relentless     | Sit down. I'm not going easy on you.        |
| vera     | Sharp-tongued, but her nerves betray her.           | Prickly        | You're late. Shuffle properly, please.      |
| greta    | Quiet and careful. Waits for her moment.            | Patient        | Good evening. Let's begin.                  |

## Reference numbers

From the prototype, the same scripted session for every character: six calm hands, a bad beat of 100 bb at 91%, four
losses of 12 bb to raises, a cooler of 40 bb, sixteen quiet hands. And a heater: three big wins, two bluffs through,
a suckout of 60 bb, a compliment. Columns: aggression, looseness, bluff, sizing, stickiness.

| Character | At rest                  | Bad beat +15 s           | After the losses         | 5 min of quiet hands     | Heater peak              |
| --------- | ------------------------ | ------------------------ | ------------------------ | ------------------------ | ------------------------ |
| mallorca  | 1.02 1.12 1.00 0.98 1.15 | 1.01 1.10 1.10 1.15 1.08 | 0.85 0.92 0.92 0.96 0.91 | 1.01 1.10 1.01 1.00 1.12 | 1.29 1.42 1.30 1.26 1.42 |
| ingrid    | 1.10 0.77 1.18 1.26 0.71 | 1.12 0.78 1.22 1.30 0.71 | 1.10 0.76 1.20 1.28 0.70 | 1.12 0.78 1.20 1.28 0.71 | 1.14 0.80 1.23 1.31 0.73 |
| sol       | 1.33 1.49 1.28 1.20 1.30 | 1.56 1.61 1.66 1.64 1.41 | 1.45 1.39 1.53 1.48 1.24 | 1.64 1.68 1.62 1.51 1.57 | 1.78 1.84 1.77 1.69 1.75 |
| rita      | 1.55 1.53 1.54 1.54 1.12 | 1.83 1.73 1.88 1.89 1.41 | 1.87 1.66 1.90 1.87 1.43 | 1.90 1.82 1.90 1.86 1.65 | 1.89 1.87 1.90 1.88 1.68 |
| vera      | 0.92 0.84 0.92 1.04 0.94 | 0.80 0.74 0.95 1.21 0.76 | 0.68 0.64 0.76 0.97 0.66 | 0.84 0.82 0.89 1.07 0.86 | 1.36 1.28 1.38 1.48 1.39 |
| nina      | 0.70 0.77 0.71 0.73 1.03 | 0.61 0.65 0.67 0.78 0.77 | 0.55 0.59 0.58 0.63 0.66 | 0.56 0.60 0.57 0.62 0.69 | 0.94 1.10 0.99 1.03 1.41 |
| mira      | 0.91 1.06 0.89 0.85 1.17 | 0.84 0.98 0.94 0.98 1.01 | 0.69 0.79 0.73 0.77 0.82 | 0.82 0.97 0.83 0.82 1.04 | 1.24 1.43 1.24 1.16 1.51 |
| lola      | 1.10 1.51 1.03 0.99 1.49 | 1.43 1.53 1.63 1.66 1.52 | 0.74 0.93 0.87 0.98 0.87 | 0.88 1.09 0.97 1.02 1.07 | 1.91 1.95 1.90 1.82 1.96 |
| greta     | 0.72 0.70 0.73 0.74 0.86 | 0.67 0.65 0.73 0.80 0.75 | 0.61 0.61 0.65 0.70 0.67 | 0.65 0.65 0.69 0.72 0.75 | 0.86 0.85 0.90 0.91 1.05 |
| neutral   | 1.00 1.00 1.00 1.00 1.00 | 0.99 0.96 1.14 1.23 0.91 | 0.86 0.81 0.97 1.05 0.79 | 1.04 1.03 1.10 1.12 1.01 | 1.38 1.40 1.40 1.38 1.38 |

Tests assert the shape of these rows, not the digits: the order of characters at rest, the direction of each
character's tilt, the return toward rest, the heater raising everyone, and every value strictly inside (0.5, 2).

## Addendum after the feeling-check (2026-11-11)

A feeling-check of a 33-hand heads-up session against Sol, where the opponent 3-bet or raised her almost every hand,
found six model issues. The fixes, each in its own commit of PR "emotion play fixes" on top of PR #171:

1. **On tilt from positive feelings.** Overload read the whole affect, so Sol was "on tilt, pleased, proud" after a
   win of 100 bb. Overload now reads only the negative strain (section 5); the reach to the play still gates on the
   whole affect.
2. **Anger on every raise.** The raise added a fixed `0.12 · (1 + 0.5 · min(3, pressure))` whatever her hand, and the
   pressure saturated within a minute. A raise is now the bet term times `1 + 0.5 · (1 + sat(pressure / 3))`: it
   weighs by the size and by how open the outcome is, and the pressure saturates softly.
3. **Style at the asymptote.** The affect parts showed anger at about 0.5 for the whole night: the anger of each
   raise lived for a minute, longer than a hand. A bet is a threat inside the hand, so its anger is now held for the
   hand like hope and fear: it decays with the half-life of anger while the hand runs and fades with `RELEASE_S` when
   it ends. What the hand settles (pushed off a hand she believed in, lost to his bet) angers her as before.
4. **Blame by trait only.** Her share of a result is now `σ(logit(stance) ± ln 3)` by who bet or raised last
   (section 2): her own caught bluff is mostly her doing, shame over anger even for Sol.
5. **Injustice from range narrowing.** A `street` event carries its cause: the narrowing after his action is the
   opponent's, new cards and the reveal are the cards'.
6. **Results saturated near 60 bb.** Results go through `settled(bb) = |bb| / (|bb| + 20)`: 78 bb 0.80, 188 bb 0.90,
   instead of 0.98 and 1.00. The reference rows move by at most 0.11.

The reference session of the code after the fixes, the columns of the addendum
`2026-11-10-natural-style-and-bluff-design.md` (section 6):

| Character | At rest                  | Bad beat +15 s           | After the losses         | 5 min of quiet hands     | Heater peak              | Bluff caught +15 s       | Bluff through +15 s      |
| --------- | ------------------------ | ------------------------ | ------------------------ | ------------------------ | ------------------------ | ------------------------ | ------------------------ |
| mallorca  | 1.26 1.35 0.71 0.85 0.89 | 1.19 1.61 0.81 1.03 0.77 | 1.07 1.62 0.76 0.96 0.71 | 1.28 1.45 0.74 0.89 0.87 | 1.66 1.56 1.26 1.43 1.31 | 0.90 1.35 0.61 0.71 0.68 | 1.46 1.43 0.91 1.10 1.07 |
| ingrid    | 1.05 0.95 1.29 0.66 1.64 | 1.07 0.97 1.32 0.68 1.65 | 1.07 0.97 1.32 0.68 1.65 | 1.05 0.95 1.29 0.66 1.64 | 1.11 0.97 1.37 0.70 1.68 | 1.04 0.95 1.27 0.66 1.63 | 1.07 0.95 1.31 0.67 1.65 |
| sol       | 1.69 1.74 0.83 1.52 1.22 | 1.79 1.89 1.17 1.81 1.25 | 1.82 1.91 1.24 1.83 1.30 | 1.71 1.76 0.85 1.56 1.23 | 1.92 1.85 1.60 1.92 1.72 | 1.57 1.77 0.77 1.46 1.04 | 1.84 1.80 1.23 1.80 1.52 |
| rita      | 1.79 1.75 1.68 1.78 1.57 | 1.91 1.89 1.90 1.94 1.71 | 1.94 1.91 1.93 1.95 1.77 | 1.81 1.75 1.71 1.81 1.59 | 1.95 1.85 1.96 1.97 1.87 | 1.82 1.81 1.75 1.83 1.58 | 1.90 1.80 1.88 1.91 1.76 |
| vera      | 1.25 0.74 1.18 0.63 0.66 | 1.13 0.93 1.31 0.70 0.59 | 1.03 0.93 1.26 0.69 0.58 | 1.31 0.75 1.25 0.66 0.67 | 1.65 0.90 1.75 1.00 0.92 | 0.82 0.73 0.87 0.56 0.55 | 1.48 0.79 1.53 0.79 0.78 |
| nina      | 0.65 0.74 0.68 0.57 0.58 | 0.58 0.94 0.69 0.58 0.53 | 0.55 0.90 0.62 0.55 0.52 | 0.63 0.95 0.69 0.56 0.56 | 0.91 0.99 1.27 0.82 0.73 | 0.53 0.73 0.56 0.52 0.52 | 0.75 0.80 0.86 0.63 0.63 |
| mira      | 1.04 1.24 0.59 0.78 0.83 | 0.93 1.52 0.62 0.90 0.70 | 0.81 1.50 0.59 0.81 0.65 | 1.05 1.37 0.60 0.80 0.81 | 1.46 1.46 0.92 1.31 1.21 | 0.74 1.24 0.54 0.66 0.64 | 1.22 1.32 0.68 0.97 0.97 |
| lola      | 1.40 1.63 0.94 1.49 0.64 | 1.43 1.94 1.43 1.85 0.57 | 1.25 1.95 1.38 1.82 0.55 | 1.51 1.94 1.26 1.66 0.62 | 1.95 1.91 1.95 1.98 1.51 | 0.61 1.69 0.58 0.88 0.51 | 1.92 1.84 1.89 1.96 1.33 |
| greta     | 0.59 0.62 0.75 0.63 0.76 | 0.56 0.70 0.78 0.66 0.66 | 0.54 0.68 0.72 0.63 0.62 | 0.60 0.63 0.77 0.64 0.76 | 0.68 0.68 1.10 0.82 0.96 | 0.53 0.61 0.63 0.57 0.61 | 0.61 0.63 0.83 0.66 0.82 |
| neutral   | 1.00 1.00 1.00 1.00 1.00 | 0.97 1.29 1.19 1.23 0.88 | 0.95 1.32 1.19 1.24 0.85 | 1.05 1.05 1.06 1.08 1.01 | 1.44 1.21 1.64 1.59 1.44 | 0.76 1.02 0.83 0.85 0.77 | 1.17 1.06 1.26 1.24 1.17 |

Against the code of PR #171: rest, heater and bluff through stay within 0.04; after the losses to raises everyone but
Rita and Ingrid is 0.03 to 0.08 lower (Lola's aggression 1.39 to 1.25); a caught bluff drops Sol (aggression 1.64 to
1.57, sizing 1.54 to 1.46), Rita (bluff 1.83 to 1.75), Lola and the average character further. The shape assertions
hold: order at rest, tilt direction, return toward rest, heater raises every axis but looseness, every value strictly
inside (0.5, 2).

A second scripted session, a night against an opponent who raises nearly every hand (33 hands: two wins of 100 bb
early, three of her bluffs caught for 111, 78 and 188 bb, a lost call, small wins and folds). Columns: aggression and
sizing at rest, their mean and maximum over the night, and aggression after each caught bluff.

| Character | At rest   | Mean, PR #171 | Mean, now | Max, PR #171 | Max, now  | After her caught bluffs, PR #171 | After her caught bluffs, now |
| --------- | --------- | ------------- | --------- | ------------ | --------- | -------------------------------- | ---------------------------- |
| mallorca  | 1.26 0.85 | 1.39 1.25     | 1.15 0.93 | 1.74 1.56    | 1.53 1.25 | 1.14 1.03 1.06                   | 0.84 0.86 0.84               |
| ingrid    | 1.05 0.66 | 1.11 0.70     | 1.06 0.67 | 1.15 0.72    | 1.10 0.69 | 1.08 1.07 1.08                   | 1.03 1.03 1.03               |
| sol       | 1.69 1.52 | 1.92 1.91     | 1.77 1.76 | 1.95 1.95    | 1.89 1.88 | 1.88 1.86 1.88                   | 1.64 1.62 1.60               |
| rita      | 1.79 1.78 | 1.97 1.97     | 1.94 1.96 | 1.97 1.98    | 1.95 1.97 | 1.96 1.96 1.97                   | 1.93 1.94 1.94               |
| vera      | 1.25 0.63 | 1.35 0.91     | 1.04 0.67 | 1.74 1.14    | 1.56 0.89 | 1.07 1.00 1.02                   | 0.79 0.80 0.78               |
| nina      | 0.65 0.57 | 0.65 0.63     | 0.58 0.55 | 1.04 0.92    | 0.80 0.70 | 0.55 0.54 0.54                   | 0.53 0.53 0.53               |
| mira      | 1.04 0.78 | 1.09 1.04     | 0.92 0.81 | 1.55 1.43    | 1.29 1.10 | 0.81 0.77 0.78                   | 0.69 0.70 0.69               |
| lola      | 1.40 1.49 | 1.79 1.95     | 1.09 1.64 | 1.98 1.99    | 1.94 1.98 | 1.66 1.33 1.41                   | 0.62 0.65 0.62               |
| greta     | 0.59 0.63 | 0.59 0.70     | 0.56 0.61 | 0.76 0.95    | 0.63 0.72 | 0.54 0.54 0.54                   | 0.53 0.53 0.53               |
| neutral   | 1.00 1.00 | 1.23 1.48     | 0.97 1.14 | 1.59 1.72    | 1.28 1.43 | 1.01 0.91 0.94                   | 0.71 0.74 0.72               |

Tests assert that Sol's mean aggression and sizing stay below 1.85, that every character but Rita drops below her
rest after each caught bluff, and that the anger of his raises no longer holds her style after the folds.

## Second addendum: outcomes, not recalculations (2026-11-11)

A feeling-check of a session with Vera (O −0.4, C 0.8, E 0.4, A −0.5, N 0.6, a tight, nervous pedant) found four
general tendencies of the appraisal. The changes, on top of the first addendum:

1. **Equity changes inside a hand are prospective.** A `street` event is `realized` only when it settles the outcome
   (the new equity is 0 or 1); otherwise it moves hope and fear. Bad and prospective now also gives
   `disappointment = m · hope now`, a light disappointment of the hope she held. Distress, anger at the outcome,
   injustice and shame come from the `result`, sized by `settled(net)`. The `deal` is prospective as well: a premium
   hand flashes hope instead of a joy that outlived a bad beat.
2. **Relief is what was spared.** The axis `resolved` is renamed `spared`: how much of her fear the event takes away.
   `relief = fear now · spared` in every branch where it applies. A win spares all (`spared = 1`); a rising equity
   spares its rise; a fold spares `settled((1 − belief) · toCall)`. A fold is a realized loss of the money she put in,
   `value = −settled(net)`, `self = shareOf(selfBlame, aggressor)`, `expected = belief`, so it mixes relief with
   distress, shame or anger, and disappointment that grows with the belief she gave up. The belief at a fold is her
   current equity, not the equity before the last change.
3. **His range narrowing is not luck, and his bet is priced.** A `street` with `cause: 'opponent'` has no surprise. The
   persona layer sends `toCallBb` with every `street` and with a fold; while she faces his bet her equity counts only
   above the price, `max(0, eq − toCall / (pot + toCall))`, before and after at the same price. A polarizing river bet
   that lifts her equity from 14% to 37% at a price of 33% is now hope +0.03 instead of joy +0.18.
4. **Surprise is improbability.** Equity is a martingale, so a rise from `e0` to `e1` has probability at most `e0 / e1`
   and a fall at most `(1 − e0) / (1 − e1)`. `unexpected = smoothstep(0.3, 0.95, 1 − bound) · sat(4 · |Δequity|)` for a card, unlikely and
   large at once; a 78% favourite who wins is not surprised, a 90% favourite who loses is, and a drop from 93% to 82%
   barely.

The reference rows and the night of the first addendum move as listed in `docs/emotion/README.md`, section "После
второй проверки чувств": rest, bluff caught and bluff through do not move, the heater within 0.08, the bad beat, the losses and the quiet hands
lower by up to 0.35 (Lola's bluff after the bad beat 1.45 to 1.10: no double count of the reveal, no joy from aces,
a folded blind is a small loss), and the mean aggression of the night against a raiser 0 to 0.12 lower (each fold is
now a small loss). All shape assertions hold.

## Delivery

One branch, `feat/emotion-play-model`, one pull request, atomic commits in this order, each with its failing test
first:

1. `feat(emotion)`: personality without experience; stances and urgency.
2. `feat(emotion)`: the appraisal axes and emotions from axes; attack in log space; release of hope and fear.
3. `feat(emotion)`: tension and the threat of a bet.
4. `feat(emotion)`: approach on emotions and in the mood.
5. `feat(emotion)`: the style from the state; load becomes reach.
6. `feat(persona)`, `feat(face)`, `feat(game)`: readers and the debug panel.
7. `feat(emotion)`, `feat(ui)`: the nine characters, the start screen copy.
8. `refactor(arena)`, `docs`: the style bots, the emotion README, ARCHITECTURE.md, the lab, generated.md.

Before the pull request: lint, types, `npm test`, `npm run test:golden`, build, e2e, and one look at the contact
sheets.
