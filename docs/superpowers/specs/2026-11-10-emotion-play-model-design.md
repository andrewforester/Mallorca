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

Sizes are in bb through `scaled(bb) = 1 − e^(−|bb| / 20)`, a smooth curve with no threshold.

### Events to axes

- `deal`: `value = 0.6 · smoothstep(0.6, 0.85, equity)`, luck.
- `street`, every change of her equity: `value = Δequity · (0.3 + 0.7 · scaled(atStake))`, luck,
  `resolved = |Δequity|`, `expected` = the equity before, `unexpected = sat(3 · (|Δequity| − 0.15))`. There is no
  20% swing threshold any more: a small change gives a small reaction.
- `opponentBet`: prospective, opponent,
  `value = −(0.6 · scaled(size) · 4·eq·(1 − eq) + raise · 0.12 · (1 + 0.5 · min(3, pressure)))`,
  `control = leaning(control, eq)`. A bet weighs most when the outcome is open, and little against her nuts or her
  dead hand.
- `result`: realized, `value = ±scaled(net)`, `resolved = 1`, `expected` = her equity when the money went in. The cards'
  share is `smoothstep(0.5, 0.95, expected)` on a loss (lost while ahead) and `smoothstep(0.5, 0.9, 1 − expected)` on
  a win (won while behind). The rest is shared between her and the opponent: by `selfBlame` on a loss, by `control`
  on a win.
- `bluff`, `mistake`: realized, self, `value = +0.8 · scaled(pot)` or `−scaled(pot)`, `−scaled(cost)`.
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

- `load` becomes `{ intensity, reach, composure, discipline, parts }`. `parts` are the emotions' contributions to the
  affect, for the debug panel. `overload` stays as a field equal to `intensity² / (intensity² + composure²)`. It is
  the same smooth threshold, so the mask, the words "on tilt", the prosody and the conversation rules keep reading it.
- `mood` stays the PAD triple, and `approach` is added: the mood's approach. `defaultMood` stays.
- `affect` is added: the play affect `a`.
- `bias` is the style above. `drivers`, `LOAD_SOURCES` and `desperation` go.

Readers that change:

- `face/frame.ts` `nervousOf` reads negative approach of the mood instead of negative dominance.
- `face/expression.ts` `feltPadOf` gains approach next to PAD (unused by the face until the face step).
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
| mallorca | Warm and curious. Opens up when the cards are kind. | A real game    | Oh, it's you. Sit, I'll deal.               |
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
