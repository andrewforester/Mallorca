# Natural style from leading traits, the characters, and the bluff

An addendum to `2026-11-10-emotion-play-model-design.md` (PR #171). That design was taken into implementation while
the owner kept working on the model in a prototype. This document records what was decided after it, and what is
still open, so the implementation can take it over.

Status of each part:

| Part                                              | Status                                    |
| ------------------------------------------------- | ----------------------------------------- |
| 1. `control` (self-control) removed               | decided                                   |
| 1. composure and discipline from the Big Five     | open, a proposal below                    |
| 2. natural style from leading traits              | decided                                   |
| 3. characters: 16 extremes, 8 intermediate, nine  | decided; names of the new ones are open   |
| 4. bluff, the game to her feelings                | decided                                   |
| 4. certainty, and the bluff, sizing, looseness axes | decided                                  |
| 5. mood returns to rest all the time              | recommended                               |
| 6. reference numbers                              | from the prototype                        |

## 1. Personality

### Self-control goes (decided)

`Personality.control` was introduced in #81 to split experience into the knowledge of the game and self-control, and
every profile got `control = experience`. With experience gone from the model, a hand-set self-control is a second
knob that mostly repeats the Big Five: trait self-control goes with high conscientiousness and low neuroticism. The
owner decided to remove it. A character is the Big Five plus `suppression`.

The coping stance loses its `control` term:

```
coping = σ(−1.2·N + 0.6·E − 0.5·A)
```

### Composure and discipline (open)

Both are a filter between her state and her play, not part of the state: composure is the threshold where the state
starts to take over, discipline the ceiling of what can reach the play. Without self-control they come from the Big
Five. The proposal separates their meanings, so that "feels strongly but plays by the rules" and "calm but sloppy"
are different people:

```
composure  = clamp(0.55 − 0.35·N + 0.1·C, 0.15, 1.1)      emotional stability
discipline = clamp(0.45 + 0.4·C − 0.1·N, 0, 0.95)        conscientiousness
```

| Character | C    | N    | composure, now → proposed | discipline, now → proposed |
| --------- | ---- | ---- | ------------------------- | -------------------------- |
| mallorca  | 0.2  | 0.1  | 0.60 → 0.54               | 0.63 → 0.52                |
| ingrid    | 0.8  | −0.8 | 0.93 → 0.91               | 0.93 → 0.85                |
| mira      | 0.2  | 0.1  | 0.55 → 0.54               | 0.53 → 0.52                |
| nina      | 0.8  | 0.8  | 0.43 → 0.35               | 0.44 → 0.69                |
| lola      | −0.6 | 0.8  | 0.18 → 0.21               | 0.06 → 0.13                |
| rita      | −0.7 | −0.4 | 0.51 → 0.62               | 0.32 → 0.21                |

The owner postponed this choice. Until it is made, the implementation needs some formula once `control` is gone;
the proposal is the default unless the owner says otherwise.

## 2. Natural style from leading traits (decided)

### The problem

In the current coefficients every axis loads on the same pattern (O+, C−, E+, A−, N−), the general risk propensity of
Nicholson et al. (2005). The axes are near copies of each other (cosine of the trait weights up to 0.85), so
characters line up on one line from cautious to bold. Of the 32 extreme Big Five profiles (each trait ±0.8), 14 fall
into the two poles "cautious on every axis" and "bold on every axis", and 6 of the 16 poker styles are reached by none.

### The requirement

- An extreme person, each trait at ±0.8, lands in a corner of the poker style: each of aggression, looseness, bluff
  and stickiness at about 70% of the way to the edge, ×1.62 or ×0.62 (`2^±0.7`). The edges are symmetric, 0.5 and 2.
- The 32 extreme profiles cover all 16 corners of those four axes, two per corner. Sizing is not part of the corner;
  it splits each pair.
- Every trait still adds a little to every axis, differently per axis.
- Characters are ordinary people, not poker types. Their play follows from the traits, sometimes unconventionally.

### The leading trait of each axis

| Axis       | Leading trait               | Support                                                                                      |
| ---------- | --------------------------- | -------------------------------------------------------------------------------------------- |
| aggression | extraversion                | assertiveness is a facet of extraversion                                                     |
| looseness  | openness                    | curiosity and sensation seeking (Nicholson et al., 2005)                                     |
| bluff      | low agreeableness           | low honesty and straightforwardness predict deception (Honesty-Humility research)           |
| stickiness | low neuroticism             | anxiety prefers the safe option, and folding is safe (Raghunathan and Pham, 1999; Lerner and Keltner, 2001) |
| sizing     | low conscientiousness       | weak support; the impulsive bet big on impulse, the conscientious keep measured sizes      |

Weights per axis (the leading trait has weight 1):

| Axis       | O    | C    | E    | A     | N     |
| ---------- | ---- | ---- | ---- | ----- | ----- |
| aggression | 0.05 | 0    | 1    | −0.15 | −0.25 |
| looseness  | 1    | −0.2 | 0.15 | 0     | 0.1   |
| bluff      | 0.15 | −0.2 | 0    | −1    | −0.1  |
| stickiness | 0.15 | −0.1 | 0    | −0.2  | −1    |
| sizing     | 0.05 | −1   | 0.2  | −0.2  | −0.15 |

The secondary weights, in words: the calm press harder and the competitive a little (aggression); the impulsive and
the sociable play more hands (looseness); the sloppy, the imaginative and the calm bluff a little more (bluff); the
distrustful and the curious call a little more (stickiness); the bold and the manipulative bet bigger, the latter as
in Yan and Palomäki (2016), where Machiavellian players bluffed bigger, not more often (sizing).

### The formula

```
nature_k = Σ_t w_k,t · trait_t  /  (0.8 · max_t |w_k,t|)
style_k  = 2 ^ tanh(atanh(0.7) · nature_k + push_k)
```

`push_k` is the push of section 4 of the PR #171 design, with the four-weight axes of section 4 below. This replaces `nature_k` there (`Σ|w|` normalisation and
`atanh(0.8)`) and the `STYLE_COEFFICIENTS` table.

Checks on the 32 extreme profiles:

- all 16 corners are reached, two profiles each; the pair differs in conscientiousness, so in sizing;
- distance to the edge over the four corner axes: median 0.72, from 0.33 (all secondaries against the leading trait)
  to 0.88 (all with it);
- similarity of the axes (cosine of weights) between 0.07 and 0.39, down from up to 0.85.

## 3. Characters

### Sixteen extremes, one per poker style (decided)

Each trait is ±0.8. Of the two profiles of each corner, the one kept alternates the sign of conscientiousness, so
eight bet big and eight bet small. Keys are descriptive; names are open.

Columns of the style, in the order of `BIAS_KEYS`: aggression, looseness, bluff, sizing, stickiness.

| Key                  | Person                                                   | O  | C  | E  | A  | N  | Style                    | Poker manner                                           |
| -------------------- | -------------------------------------------------------- | -- | -- | -- | -- | -- | ------------------------ | ------------------------------------------------------ |
| boldSchemer          | bold sly schemer                                         | +  | −  | +  | −  | −  | 1.80 1.73 1.80 1.84 1.80 | maniac                                                 |
| nervousCareerist     | ambitious nervous careerist                              | +  | +  | +  | −  | +  | 1.60 1.65 1.54 0.69 0.67 | loose aggressive bluffer who gives up under pressure, small bets |
| lifeOfTheParty       | life of the party                                        | +  | −  | +  | +  | −  | 1.69 1.73 0.74 1.71 1.65 | honest loose aggressive, calls down, big bets          |
| caringActivist       | caring busy activist                                     | +  | +  | +  | +  | +  | 1.42 1.65 0.59 0.60 0.59 | honest loose aggressive, folds to pressure, small bets |
| toughBoss            | tough boss                                               | −  | +  | +  | −  | −  | 1.77 0.59 1.49 0.75 1.60 | tight aggressive bluffer, hard to push off, measured bets |
| hotheadBraggart      | hot-headed braggart                                      | −  | −  | +  | −  | +  | 1.54 0.74 1.60 1.71 0.65 | tight aggressive bluffer who folds when hit back, big bets |
| reliableCaptain      | reliable team captain                                    | −  | +  | +  | +  | −  | 1.65 0.59 0.58 0.64 1.36 | honest tight aggressive, does not fold, small bets     |
| fussyChatterbox      | fussy kind chatterbox                                    | −  | −  | +  | +  | +  | 1.36 0.74 0.61 1.52 0.58 | honest tight aggressive who folds easily, big bets     |
| coldSceptic          | cold sceptical scientist                                 | +  | +  | −  | −  | −  | 0.74 1.36 1.65 0.66 1.73 | quiet loose bluffer who never folds, small bets        |
| gloomyRebel          | gloomy creative rebel                                    | +  | −  | −  | −  | +  | 0.61 1.69 1.73 1.57 0.74 | quiet loose bluffer who folds when hit back, big bets  |
| calmPhilosopher      | calm philosopher                                         | +  | +  | −  | +  | −  | 0.65 1.36 0.63 0.58 1.54 | calling station, small bets                            |
| dreamyArtist         | dreamy vulnerable artist                                 | +  | −  | −  | +  | +  | 0.56 1.69 0.67 1.33 0.63 | loose passive honest, folds, big bets when it bets     |
| unshakableLoner      | sullen unshakable loner                                  | −  | −  | −  | −  | −  | 0.70 0.61 1.69 1.67 1.69 | tight passive bluffer who never folds, big bets        |
| suspiciousGrump      | suspicious pedantic grump                                | −  | +  | −  | −  | +  | 0.59 0.58 1.36 0.58 0.61 | tight passive bluffer who folds, small bets            |
| easygoingHomebody    | easy-going good-natured homebody                         | −  | −  | −  | +  | −  | 0.63 0.61 0.65 1.46 1.49 | tight passive honest who does not fold, big bets       |
| timidStickler        | timid honest stickler                                    | −  | +  | −  | +  | +  | 0.55 0.58 0.55 0.54 0.55 | nit                                                    |

### Eight intermediate characters (decided)

Found by solving the new weights for the rest styles of the eight previous types, so they keep those styles exactly.
Their traits stay within ±0.7: people with a few pronounced features, between the extremes and the average. None
repeats an extreme.

| Key                  | Person                                                          | O     | C     | E     | A     | N     | Style                    |
| -------------------- | --------------------------------------------------------------- | ----- | ----- | ----- | ----- | ----- | ------------------------ |
| nervousPragmatist    | down to earth, blunt, a bit sloppy, anxious                     | −0.52 | −0.32 | 0.24  | −0.30 | 0.52  | 1.10 0.77 1.18 1.26 0.71 |
| curiousOptimist      | curious confident optimist, a little blunt                      | 0.57  | −0.08 | 0.28  | −0.22 | −0.23 | 1.33 1.49 1.28 1.20 1.30 |
| noisyBully           | noisy self-assured bully                                        | 0.47  | −0.43 | 0.60  | −0.52 | 0.06  | 1.55 1.53 1.54 1.54 1.12 |
| plainRealist         | plain down-to-earth person, slightly conservative               | −0.25 | −0.10 | −0.07 | 0.08  | 0.04  | 0.92 0.84 0.92 1.04 0.94 |
| quietTidy            | quiet kind tidy person, calm                                    | −0.22 | 0.29  | −0.50 | 0.44  | −0.20 | 0.70 0.77 0.71 0.73 1.03 |
| softMiddle           | soft calm middle-of-the-road person                             | 0.17  | 0.21  | −0.17 | 0.16  | −0.24 | 0.91 1.06 0.89 0.85 1.17 |
| calmCurious          | calm curious one who wants to see every hand                    | 0.70  | 0.10  | −0.02 | 0.10  | −0.53 | 1.10 1.51 1.03 0.99 1.49 |
| reservedConservative | reserved conservative                                           | −0.42 | 0.25  | −0.40 | 0.32  | 0.05  | 0.72 0.70 0.73 0.74 0.86 |

### The nine characters of PR #171 under the new weights

They keep their Big Five. Their rest style changes:

| Key      | O    | C    | E    | A    | N    | Style, new               | Poker manner, new                                                   |
| -------- | ---- | ---- | ---- | ---- | ---- | ------------------------ | ------------------------------------------------------------------- |
| mallorca | 0.4  | 0.2  | 0.4  | 0.5  | 0.1  | 1.26 1.35 0.71 0.85 0.89 | light honest loose aggressive: active, almost no bluff              |
| ingrid   | 0.2  | 0.8  | −0.2 | −0.4 | −0.8 | 1.05 0.95 1.29 0.66 1.64 | steady grinder: never pushed off a hand, bluffs a little, small bets |
| mira     | 0.3  | 0.2  | 0.2  | 0.9  | 0.1  | 1.04 1.24 0.59 0.78 0.83 | friendly recreational player, never bluffs                          |
| nina     | −0.3 | 0.8  | −0.4 | 0.3  | 0.8  | 0.65 0.74 0.68 0.57 0.58 | nit                                                                 |
| lola     | 0.5  | −0.6 | 0.7  | 0.2  | 0.8  | 1.40 1.63 0.94 1.49 0.64 | loose aggressive but scared: big bets, gives up when hit back       |
| sol      | 0.8  | −0.5 | 0.9  | 0.5  | −0.2 | 1.69 1.74 0.83 1.52 1.22 | honest loose aggressive, big bets                                   |
| rita     | 0.8  | −0.7 | 0.9  | −0.6 | −0.4 | 1.79 1.75 1.68 1.78 1.57 | maniac                                                              |
| vera     | −0.4 | 0.8  | 0.4  | −0.5 | 0.6  | 1.25 0.74 1.18 0.63 0.66 | aggressive fit-or-fold: tight, presses, folds when pressed back     |
| greta    | −0.6 | 0.5  | −0.8 | 0.2  | 0.2  | 0.59 0.62 0.75 0.63 0.76 | rock                                                                |

What moves most: stickiness now follows calm. Ingrid no longer folds to pressure (0.71 → 1.64), and the anxious fold
(Lola 1.49 → 0.64). The agreeable rarely bluff (Mallorca 0.71, Mira 0.59, Sol 0.83).

The reference numbers of the PR #171 design (dynamics) were computed with the old natural style; section 6 replaces
them.

## 4. Bluff and certainty (decided)

The PR #171 design left her own bluff out of scope. The owner decided both directions below.

### What a bluff is, next to the other axes

In the solver (#159), aggression is how often she bets or raises rather than checks or calls; bluff is betting a
hand in the bottom 35% of the strength order when she is checked to after the flop. A bluff needs, beyond
assertiveness: risk with an outcome decided by the opponent, not the cards; willingness to deceive; and a sense of
influence over the opponent ("desire for control" predicted bluffing frequency in Yan and Palomäki, 2016). Bluff and
stickiness are mirror beliefs about the opponent: "he will fold" and "he is bluffing".

### The game to her feelings

The persona's special events `bluff` (pride if through, shame if caught, for everyone) and `mistake` (a weak river
call lost) and the heuristic that detects a bluff go. Two general notions replace them:

- **Belief in winning the pot** instead of bare equity, wherever equity is read (tension, the lean of hope and fear,
  the expectation before an outcome):
  ```
  foldChance = bet / (pot + bet)                 her estimate after her own bet, the bluff break-even of theory
  belief     = foldChance + (1 − foldChance) · equity
  ```
  A call by the opponent resets `foldChance` to 0. The theoretical estimate stays until her model of the opponent
  can replace it.
- **Who decided the outcome.** He folded to her bet: the credit is hers, pride by her coping, the rest joy. A
  showdown: the existing split, luck by unexpectedness, the rest self or opponent by self-blame. She folded: "he
  pushed me off" by her belief in the hand, relief otherwise.

A caught bluff is a showdown loss at a low belief: no luck share, so self-blame decides between shame and anger. A
weak call lost at the river is the same: no special event. In the prototype this gives, without any special rule: a
brash character bluffs more after a caught bluff (anger), an anxious one stops (shame); a bluff that gets through
raises the next bluffs, most for the impulsive.

### Certainty, a new coordinate of every emotion

Fear and anger, both negative, move risk in opposite directions through the appraisals of certainty and control
(Lerner and Keltner, 2001). Approach already stands for control; certainty is added the same way, on every emotion,
in the mood and for the face. Values in the direction of Smith and Ellsworth (1985) and Lerner and Keltner (2001):

| Emotion   | anger | pride | joy | relief | injustice | disappointment | distress | shame | hope | surprise | fear |
| --------- | ----- | ----- | --- | ------ | --------- | -------------- | -------- | ----- | ---- | -------- | ---- |
| certainty | 0.6   | 0.6   | 0.5 | 0.4    | 0.3       | 0              | −0.1     | −0.2  | −0.2 | −0.6     | −0.7 |

- **Mood**: certainty accumulates in the mood like approach, with rest 0 for everyone, and enters the affect as
  `2 · mood certainty`.
- **Face**: certainty is shown with approach, as its own step with screenshots (steady gaze and still head when
  certain, darting gaze when not).
- **Intensity** stays the length of (P, A, approach): certainty steers the direction of the play, not how strongly
  the state takes over.

### The axes of the play

The affect becomes four numbers `a = (P, A, approach, certainty)` and the axes `w_k` get a fourth weight:

| Axis `w_k` | P    | A    | approach | certainty |
| ---------- | ---- | ---- | -------- | --------- |
| aggression | 0.1  | 0.3  | 1.0      | 0         |
| looseness  | −0.5 | −0.3 | 0.2      | 0.6       |
| bluff      | 0    | 0.2  | 0.6      | 0.6       |
| sizing     | 0    | 0.4  | 0.5      | 0.5       |
| stickiness | 0.3  | 0.2  | 0.8      | 0         |

- **Bluff**: fear lowers it more than the aggression, joy and pride raise it more.
- **Sizing**: the certain bet big, the uncertain small.
- **Looseness**: sadness pushes to "win it back" (Raghunathan and Pham, 1999: sadness prefers rewarding risky options,
  anxiety safe ones), so the negative pleasure enters with a plus, low arousal and certainty with it; fear tightens.

The push of each emotion at 1:

| Emotion    | anger | pride | injustice | relief | joy  | hope  | disappointment | surprise | distress | shame | fear  |
| ---------- | ----- | ----- | --------- | ------ | ---- | ----- | -------------- | -------- | -------- | ----- | ----- |
| bluff      | 0.84  | 0.60  | 0.52      | 0.42   | 0.40 | −0.14 | −0.22          | −0.30    | −0.40    | −0.46 | −0.56 |
| sizing     | 0.84  | 0.57  | 0.55      | 0.28   | 0.38 | −0.07 | −0.16          | −0.11    | −0.38    | −0.36 | −0.33 |
| looseness  | 0.56  | 0.13  | 0.36      | 0.31   | 0.06 | −0.30 | 0.04           | −0.61    | 0.10     | −0.12 | −0.37 |

Decided: with the new looseness, positive emotions barely loosen her, so on a heater looseness goes slightly down
(Mallorca 1.35 → 1.23) while the other axes go up. This matches the mood-maintenance finding (happy people avoid
risks they can really lose). The PR #171 test "the heater raises everyone" excludes looseness.

## 5. Mood returns to rest all the time (recommended)

The prototype and PR #171 both saw the mood drift during quiet hands: small joys and reliefs are always above the
mood's activity threshold of 0.05, so the mood tracks their centre and only returns to rest when no emotion is
active. With certainty this became visible: the average character's bluff was 1.23 after five quiet minutes.

Fix for the mood's approach and certainty: every step, the emotions push the mood toward their centre at
`intensity / changeTime`, and the mood is always pulled toward rest at `√3 / returnTime`. Small emotions lose to the
pull, strong ones win. The average character is back to 1.03–1.15 after five quiet minutes. The same rule would suit
the PAD part of the mood; the prototype applied it to approach and certainty only.

## 6. Reference numbers

The same scripted session as in the PR #171 design, with everything in this document: leading traits, no
self-control, composure and discipline by the section 1 proposal, belief and certainty, the mood pull of section 5.
Two more columns: her bluff caught at the river (bet 15 into 20 with 10% equity, called) and her bluff through, each
15 s after. Columns of each cell: aggression, looseness, bluff, sizing, stickiness.

| Character | At rest                  | Bad beat +15 s           | After the losses         | 5 min of quiet hands     | Heater peak              | Bluff caught +15 s       | Bluff through +15 s      |
| --------- | ------------------------ | ------------------------ | ------------------------ | ------------------------ | ------------------------ | ------------------------ | ------------------------ |
| mallorca | 1.26 1.35 0.71 0.85 0.89 | 1.24 1.31 0.72 0.96 0.81 | 1.04 1.54 0.69 0.86 0.70 | 1.28 1.43 0.76 0.92 0.88 | 1.57 1.23 0.96 1.22 1.20 | 0.95 1.41 0.63 0.75 0.69 | 1.32 1.40 0.78 0.93 0.93 |
| ingrid | 1.05 0.95 1.29 0.66 1.64 | 1.09 0.93 1.31 0.69 1.66 | 1.05 0.98 1.31 0.68 1.62 | 1.07 0.94 1.31 0.67 1.65 | 1.13 0.91 1.36 0.70 1.69 | 1.04 0.96 1.28 0.66 1.63 | 1.06 0.95 1.30 0.67 1.65 |
| sol | 1.69 1.74 0.83 1.52 1.22 | 1.83 1.69 1.01 1.79 1.34 | 1.75 1.90 1.07 1.77 1.12 | 1.79 1.77 1.03 1.72 1.37 | 1.92 1.59 1.33 1.87 1.71 | 1.62 1.81 0.83 1.54 1.07 | 1.78 1.79 1.04 1.70 1.37 |
| rita | 1.79 1.75 1.68 1.78 1.57 | 1.94 1.71 1.87 1.94 1.77 | 1.94 1.92 1.93 1.96 1.75 | 1.91 1.74 1.86 1.92 1.76 | 1.95 1.59 1.92 1.95 1.88 | 1.88 1.87 1.84 1.90 1.64 | 1.86 1.80 1.83 1.88 1.69 |
| vera | 1.25 0.74 1.18 0.63 0.66 | 1.20 0.75 1.18 0.66 0.62 | 1.11 0.81 1.15 0.64 0.60 | 1.28 0.74 1.25 0.66 0.67 | 1.46 0.71 1.44 0.76 0.77 | 0.98 0.76 1.01 0.59 0.58 | 1.30 0.77 1.28 0.67 0.68 |
| nina | 0.65 0.74 0.68 0.57 0.58 | 0.61 0.75 0.65 0.57 0.55 | 0.58 0.80 0.63 0.55 0.54 | 0.61 0.82 0.66 0.56 0.55 | 0.76 0.71 0.83 0.64 0.64 | 0.56 0.74 0.60 0.54 0.53 | 0.66 0.75 0.70 0.57 0.58 |
| mira | 1.04 1.24 0.59 0.78 0.83 | 0.98 1.19 0.58 0.84 0.74 | 0.80 1.42 0.57 0.74 0.64 | 1.04 1.34 0.61 0.82 0.80 | 1.37 1.13 0.72 1.11 1.11 | 0.75 1.28 0.55 0.67 0.64 | 1.08 1.29 0.62 0.83 0.86 |
| lola | 1.40 1.63 0.94 1.49 0.64 | 1.73 1.69 1.23 1.82 0.69 | 1.28 1.90 1.07 1.67 0.55 | 1.68 1.92 1.52 1.86 0.67 | 1.94 1.57 1.77 1.95 1.39 | 0.70 1.80 0.66 1.11 0.51 | 1.77 1.90 1.78 1.92 0.91 |
| greta | 0.59 0.62 0.75 0.63 0.76 | 0.57 0.62 0.73 0.64 0.68 | 0.55 0.65 0.69 0.61 0.63 | 0.59 0.63 0.76 0.64 0.73 | 0.66 0.60 0.93 0.75 0.92 | 0.54 0.62 0.65 0.58 0.62 | 0.59 0.62 0.76 0.63 0.77 |
| neutral | 1.00 1.00 1.00 1.00 1.00 | 1.00 1.00 1.05 1.17 0.91 | 0.88 1.25 1.04 1.11 0.80 | 1.08 1.04 1.12 1.15 1.03 | 1.36 0.88 1.40 1.44 1.37 | 0.80 1.09 0.89 0.91 0.79 | 1.05 1.04 1.09 1.08 1.04 |

What the rows show:

- **Rita** tilts up on every axis and stays up for minutes: anger lives in the mood.
- **Ingrid** barely moves: discipline 0.85.
- **Nina, Greta, Mira, Vera** tighten after losses (distress, shame); Mira and Mallorca loosen a little, sadness wants
  to win it back.
- **Lola** swings most: a bad beat sends her bluff from 0.94 to 1.23, a caught bluff drops it to 0.66, a bluff through
  raises it to 1.78. After five quiet minutes she is above her rest (aggression 1.68): composure 0.21 and urgency 0.7
  let even the small joys of the quiet hands through. This is her character, not drift; the average character returns.
- **Caught bluff**: Rita keeps bluffing (1.84, anger), Mira, Nina and Greta stop (shame).

## 7. Taking it into PR #171

1. Remove `Personality.control` and its slider; coping without the control term; composure and discipline by the
   proposal in section 1 unless the owner chooses otherwise.
2. Replace `STYLE_COEFFICIENTS` and the nature normalisation by section 2; update the style tests (order at rest,
   values inside (0.5, 2)) to the new rest styles.
3. Characters: the owner chooses which of the 16 extremes and 8 intermediates go to the start screen and their names;
   until then they live as profiles for the debug panel and the arena.
4. Bluff and certainty by section 4: remove the `bluff` and `mistake` events, add belief and who decided, certainty on
   emotions and in the mood, the four-weight axes.
5. The mood pull of section 5.
6. Take the reference numbers of section 6 instead of those of the PR #171 design; keep asserting shapes, not digits.
   On a heater every axis but looseness goes up; looseness may go slightly down (section 4).

## Sources

- Lerner and Keltner, 2001, Fear, anger, and risk: https://pubmed.ncbi.nlm.nih.gov/11474720/
- Raghunathan and Pham, 1999, All negative moods are not equal:
  https://longevity.stanford.edu/all-negative-moods-are-not-equal-motivational-influences-of-anxiety-and-sadness-on-decision-making/
- Nicholson, Soane, Fenton-O'Creevy and Willman, 2005, Personality and domain-specific risk taking:
  https://eprints.lse.ac.uk/25792/
- Yan and Palomäki, 2016, Machiavelli as a poker mate:
  https://www.sciencedirect.com/science/article/abs/pii/S0191886916302434
- Palena et al., 2022, personality and the tendency to lie, citing Hart et al., 2020:
  https://link.springer.com/content/pdf/10.1007/s12144-022-03132-9.pdf
- Smith and Ellsworth, appraisal dimensions of emotions:
  https://deepblue.lib.umich.edu/items/e4119b87-8694-436f-9db4-3fcec2320bdb/full
