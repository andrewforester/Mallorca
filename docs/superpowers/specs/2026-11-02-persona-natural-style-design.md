# Her natural style from character and experience, stage 4

Stages 1 to 3 made her persona the core: her feeling, face, words and bias all come from it. The bias a solver plays
is `clamp(baseline × emotional, 0.5, 2)` over five axes, and `baseline` was neutral for every personality. This
stage fills `baseline` with a natural style derived from the Big Five, pulled toward the blueprint by experience,
and separates the knowledge of the game from self-control, so that "strong but hot" and "weak but cold" can be
expressed and played against each other in the arena.

The owner's hypothesis to test: a strong but hot player can lose to a weak but cold one, on one blueprint.

## The three knobs

`Personality` gains `control` in [0, 1], self-control. `experience` now means only the knowledge of the game.

| Parameter     | Face                                    | Play                                         |
| ------------- | --------------------------------------- | -------------------------------------------- |
| `suppression` | the mask at rest                        | none                                         |
| `control`     | indirectly, through overload            | discipline, the main lever                   |
| `experience`  | indirectly and weakly, through overload | the natural style is pulled to the blueprint |

```
discipline = clamp(0.25 + 0.2·C − 0.15·N + 0.5·control, 0, 0.95)
composure  = clamp(0.45 + 0.15·C − 0.25·N + 0.2·control + 0.15·experience, 0.1, 1.2)
baseline_k = exp((1 − experience) · Σ_t coefficient_k,t · trait_t)
```

Every existing profile gets `control = experience`, so its discipline and composure stay exactly as they were and
only its baseline changes. Experience keeps a small weight in composure: experienced players are less sensitive to
each loss (Palomäki, Laakasuo and Salmela, 2014), but they still loosen up after big losses (Smith, Levere and
Kurtzman, 2009; Eil and Lien, 2014), which is why experience does not carry discipline any more.

The exponential form makes ×2 and ×0.5 symmetric, gives exactly 1 at experience 1 and at a neutral personality,
and the emotional part still multiplies on top inside the common clamp [0.5, 2]. Target size, a design choice: the
most extreme novice of the profiles deviates by 50 to 60% on some axis, profiles with experience 0.7 and above by
at most 5%.

## Coefficients

Labels as in `docs/emotion/README.md`: D direction (sign from research, size ours), G design.

| Axis       | O       | C       | E       | A       | N       |
| ---------- | ------- | ------- | ------- | ------- | ------- |
| aggression | +0.15 D | −0.15 D | +0.30 D | −0.20 D | −0.25 D |
| looseness  | +0.25 D | −0.30 D | +0.20 D | 0       | +0.10 G |
| bluff      | +0.20 G | −0.10 G | +0.25 G | −0.25 D | −0.30 G |
| sizing     | +0.10 G | 0       | +0.15 G | −0.20 D | −0.15 G |
| stickiness | +0.15 G | −0.20 D | +0.10 G | +0.15 G | +0.30 D |

Sources of the directions: risk propensity rises with E and O and falls with C and A (Nicholson et al., 2005);
aggressive players score higher on E, a trend in the one direct poker study (Brown and Mitchell, 2010); N lowers
risk taken for gains (Lauriola and Levin, 2001); low A goes with deception (Heck et al., 2018) and with harder
bargaining (Barry and Friedman, 1998); Machiavellian players bluff bigger, not more often (Palomäki, Yan and
Laakasuo, 2016), read through low A as an inference; N and low C go with chasing losses (MacLaren et al., 2011;
Dudfield, Malouff and Meynadier, 2023). No study links Big Five to tracked poker statistics (VPIP, aggression
factor, bluff frequency), so no coefficient is labelled data.

Resulting styles:

| Profile            | aggression | looseness | bluff | sizing | stickiness |
| ------------------ | ---------- | --------- | ----- | ------ | ---------- |
| Mallorca (exp 0.7) | 1.01       | 1.04      | 1.00  | 1.00   | 1.05       |
| Mira (0.5)         | 1.01       | 1.02      | 1.01  | 1.00   | 1.03       |
| Ingrid (0.9)       | 0.99       | 0.96      | 1.00  | 1.01   | 0.96       |
| Lola (0.2)         | 1.17       | 1.49      | 1.09  | 1.02   | 1.47       |
| Nina (0)           | 0.67       | 0.96      | 0.65  | 0.79   | 1.25       |

Lola is loose and sticky, the life of the party who calls down; Nina is scared and passive and rarely bluffs.

The hypothesis pair lives only in the arena, as profile traits with fields overridden:

- hot strong: Lola's traits, experience 0.9, control 0.1: style about 1.0, discipline 0.15;
- cold weak: Ingrid's traits, experience 0.2, control 0.9: looseness 0.73, stickiness 0.71, discipline 0.93.

## Code

- `emotion/style.ts`: `STYLE_COEFFICIENTS` and `styleOf(bigFive, experience): PlayBias`; `traitsOf` sets
  `baseline: styleOf(...)` and reads `control` for discipline and composure.
- `emotion/profiles.ts`: `control` for every profile, equal to its experience.
- Everything that builds a `Personality` (debug panel sliders, lab panels and report, tests) gains `control`; the
  debug panel gets a "Self-control" slider and `BiasSection` shows the natural style next to the bias.
- `game/fixtures/sessionPayloads.json` is recorded again in its own commit: Mallorca's baseline moves her bias by up
  to 5%.

## Arena

Sessions: `--session <K>` (default 1, the current independent hands). With `K > 1` a pair is two sessions of K hands
on one series of decks, the second with the seats swapped. Bots are created once per session; stacks reset every
hand as now, while feeling and the session result accumulate. bb/100 and the interval are over pairs of sessions.
A bot factory receives its seat as well as its rng. A bot may implement `events?(events)` to receive the raw engine
events of every step.

`persona:<profile>` is a cfr bot driven by a persona of that profile:

- a model clock: +6 s per action, +8 s between hands, no real waiting;
- after an opponent action it narrows her view of his range with the cfr bot's `opponentRange()`;
- before every decision it sets `view(now).bias` on the cfr bot.

`style:<profile>` is the cfr bot with the constant bias of the profile's baseline, without emotions, so that the cost
of a style and the cost of feeling can be told apart. Both take overrides after `@`:
`persona:lola@experience=0.9,control=0.1`.

Runs, each 200 session pairs of 200 hands (80 000 hands), under `taskpolicy -b`:

| Question                         | Runs                                                                   |
| -------------------------------- | ---------------------------------------------------------------------- |
| profiles against the blueprint   | `style:` and `persona:` for the five profiles against `cfr`, `--stats` |
| hypothesis, head to head         | hot strong against cold weak                                           |
| hypothesis, through an exploiter | both against `tilt-exploiter` on the same decks, paired difference     |

Calibration targets, fixed before the runs and independent of the hypothesis: the most extreme novice's style shows
in her statistics against `cfr` (Lola's VPIP or fold to bet differs from `cfr` by at least 5 points), and profiles
with experience 0.7 or more differ from `cfr` by less than 2 points. The hypothesis is tested, not tuned to; its
result goes into the README whichever way it falls.

## Documentation

`docs/emotion/README.md`: `control` in the input table and the new meaning of experience, the composure and
discipline formulas, a "Natural style" part in "Play bias" with the formula, the coefficient table with labels, the
profile styles and the note that direct data are missing, the new sources. `ARCHITECTURE.md`: the natural style in
emotion, the persona bot and sessions in the arena. `tools/arena/README.md`: the new bots, `--session`, the results.

## Cleanup from the review of stages 1 to 3

Each in its own commit:

1. `PersonaView.stance` duplicates `presenting?.stance`: removed.
2. `faceFrame` computes the mask a second time: it takes the mask from her persona's view.
3. `prototypes/emotion-lab/talkCases.ts` uses the bluff effort for `acting: 'weak'`: the hide effort 0.5.
4. Unused `Feeling.bias()`, `speakFactor()` and `snapshot()` in `persona/perception.ts`: removed.
5. A bluff caught on the river after a call gave shame twice, as a caught bluff and as a mistake: a caught bluff is
   not also a mistake.
6. Fields of `ownMove` that no appraisal reads: removed.

## Testing

- `styleOf`: a neutral personality gives 1 on every axis at any experience; at experience 1 every personality gives
  1; at experience 0 a single trait gives `exp(coefficient)` with the sign of the table on every axis; the profile
  table above.
- `traitsOf`: discipline follows `control`, not experience; composure follows both; existing profiles keep their
  discipline and composure.
- Arena: a session plays K hands with one bot instance; the mirrored session uses the same decks; `persona:` bots
  change their bias after a loss; names with overrides parse and label.
