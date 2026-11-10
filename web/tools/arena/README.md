# Arena

Duplicate matches between two bots, reported in bb/100 with a 95% confidence interval. Matches against external
bots (Slumbot) are in [`external/`](external/README.md).

```
npm run arena -- --a math --b always-call --pairs 2000
```

Flags: `--a`, `--b` (`math`, `cfr`, `cfr:<play file>`, a cfr bot with a bias after `@` such as `cfr:src/cfr/v2.mlcs.gz@sizing=1.5,stickiness=1.4` (axes `aggression`, `bluff`, `tightness`, `sizing`, `stickiness`, the rest 1; labelled `cfr-v2-sizing1.5-stickiness1.4`), `cfr-tilted`, `cfr-confident`, `cfr-cautious`, `cfr-talk-obvious`, `cfr-talk-subtle`, `cfr-talk-hidden`, `reader`, `tilt-exploiter`, `always-call`, `always-raise`, `min-bettor`, `random`), `--pairs` (1000), `--seed` (1), `--workers` (available cores), `--dir <path>` (results directory), `--out <file>` (JSON report), `--save-hands <file>` (JSONL hand records), `--no-hands`, `--stats` (adds `styleStats` of bot A to the report and prints it).

Every run is saved. The report goes to `<dir>/<a>-<b>-<pairs>-s<seed>-<YYYYMMDD-HHMMSS>.json` and the hands next to
it as `.jsonl`, unless `--out` or `--save-hands` name other paths; `--no-hands` skips the hands. The default
directory is `web/arena-out` of the main checkout, shared by all worktrees; `--dir` or `ARENA_DIR` override it. The
report holds `a`, `b`, `pairs`, `hands`, `seed`, `bbPer100`, `ci95`, `durationMs`, `commit`, `finishedAt` and
`handsFile` (relative to the report, or `null`).

## Viewer

```
npm run arena:ui
```

opens a local page over the results directory (`ARENA_DIR` overrides it): every run with its bb/100, and for a run
with hands the cumulative result of bot A, the result by position, by the street of the last action and by
showdown, and the hands, a duplicate pair at a time, as PokerStars text. The viewer finds a hands file only in the
results directory itself, so a run saved with `--save-hands` elsewhere shows no hands there.

Each pair plays the same deck twice with the seats swapped, so `bbPer100` is the mean of `net / 2 / bigBlind * 100` over pairs.

Reference run on Apple M3 Pro, 12 cores:

```
math vs always-call: +272.8 ± 42.4 bb/100 over 4000 hands in 37 s
```

`cfr` is the `v1` blueprint of `solver/` (checkpoint 18) in `src/cfr/v1.mlcs.gz` (`SHIPPED_STRATEGIES.cfr` in
`src/cfr/strategies.ts`), played through `src/cfr/mallorca.wasm`; `npm run arena` builds the module first. `cfr:<play file>` plays any play file
(`.mlcs` or `.mlcs.gz`, for example `cfr:../solver/data/v2/v2-18-play.mlcs`) and is named `cfr-<file name>` in the
report, so two blueprints can meet: `npm run arena -- --a cfr:<v2 play file> --b cfr --pairs 20000`. Reference runs on the same machine, seed in
brackets:

```
cfr vs math:         +32.8 ± 9.2 bb/100 over 40000 hands in 287 s  (2)
cfr vs always-call: +165.3 ± 24.8 bb/100 over 10000 hands in 1 s   (3)
cfr vs always-raise: +250.7 ± 48.9 bb/100 over 10000 hands in 1 s  (3)
cfr vs random:       +57.2 ± 23.2 bb/100 over 10000 hands in 1 s   (3)
math vs always-raise: +905.8 ± 95.9 bb/100 over 4000 hands in 41 s (3)
math vs random:      +196.1 ± 45.0 bb/100 over 4000 hands in 27 s  (3)
```

With 0 as the passive size of the translation (issue #17):

```
cfr vs math:       +32.5 ± 9.3 bb/100 over 40000 hands in 309 s  (2)
cfr vs min-bettor: +243.8 ± 33.9 bb/100 over 10000 hands in 1 s (7)
cfr vs always-raise: +247.7 ± 56.0 bb/100 over 10000 hands in 1 s (3)
cfr vs random:     +128.0 ± 24.4 bb/100 over 10000 hands in 1 s (3)
cfr vs always-call: +165.3 ± 24.8 bb/100 over 10000 hands in 2 s (3)
```

Against `random`, which raises the minimum, the fix more than doubles the win rate (+57.2 ± 23.2 before).

`min-bettor` bets the minimum whenever nothing is bet and otherwise checks or calls. Before the fix `cfr` won
+235.5 ± 42.9 against it with the same seed: it calls every bet, so it loses to `cfr` either way. The leak shows
in the fold rate instead. Villain on the button raises to 100, the bot calls and checks the flop, villain bets
into 200, 1200 hands a row:

| villain bet | pot fraction | fold before | fold after | pot odds bound |
| ----------- | ------------ | ----------- | ---------- | -------------- |
| 20          | 0.1          | 40%         | 13%        | 9%             |
| 50          | 0.25         | 43%         | 22%        | 20%            |
| 100         | 0.5          | 46%         | 40%        | 33%            |
| 150         | 0.75         | 57%         | 48%        | 43%            |
| 200         | 1.0          | 50%         | 50%        | 50%            |

## Biased and talking bots (issue #23)

| Bot                                                      | What it is                                                                                                                                                                                                                                                         |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `cfr-tilted`                                             | `cfr` with the bias aggression 1.6, bluff 1.8, tightness 0.85 (1.25, 1.3, 0.85 at the first clamps)                                                                                                                                                                |
| `cfr-confident`                                          | `cfr` with the bias 1.15, 1, 0.95                                                                                                                                                                                                                                  |
| `cfr-cautious`                                           | `cfr` with the bias 0.9, 0.9, 1.2                                                                                                                                                                                                                                  |
| `cfr-talk-obvious`, `cfr-talk-subtle`, `cfr-talk-hidden` | plain `cfr` that, after deciding a raise, speaks with the chance of the `herBet` rule for its hand strength class behind a mask of 0, 0.5 and 0.9 (`speakChanceOf`)                                                                                                |
| `reader`                                                 | the `math` bot that uses the talk: facing a bet after the opponent spoke, a math fold becomes a call when the call is at most half the pot; facing a bet after the opponent was silent, a math call becomes a fold                                                 |
| `tilt-exploiter`                                         | the `math` bot that punishes tilt without knowing it: facing a bet or raise, a math fold becomes a call when the call is at most half the pot (the pot including the bet being called), and a math bet or raise with a weak strength class becomes a call or check |

A bot may implement `spoke()` (did it speak on its last decision) and `heard(spoke)`. The match loop calls
`other.heard(actor.spoke())` after every raise by an actor that has `spoke`, before the next decision, and `heard`
holds only for the next decision.

Cost of a bias: `cfr-tilted vs cfr` should lose at most 5 bb/100. Readability of the `herBet` rule: `reader` should win
against `cfr-talk-obvious` by more than the interval above what it wins against `cfr-talk-hidden`.

### Table talk results

Measured at commit `74659d2`. Commit `6c2d9d4` came after these runs and changed only `src/talk/talk.ts`, which no
arena bot uses, so it did not change any arena bot. Results are the first bot's bb/100 with a 95% interval. A
negative number is a loss. Seeds: 2 for the bias runs, 1 and 3 for readability, 4 for the exploiter runs; each
pair of runs that is compared uses the same seed, so both play the same decks.

| Run                            | Seed | Pairs  | Hands  | bb/100       |
| ------------------------------ | ---- | ------ | ------ | ------------ |
| `cfr-tilted` vs `cfr`          | 2    | 200000 | 400000 | -0.2 ± 2.6   |
| `cfr-confident` vs `cfr`       | 2    | 200000 | 400000 | -0.3 ± 2.5   |
| `cfr-cautious` vs `cfr`        | 2    | 200000 | 400000 | -0.4 ± 2.4   |
| `reader` vs `cfr-talk-obvious` | 1    | 5000   | 10000  | -28.3 ± 14.5 |
| `reader` vs `cfr-talk-subtle`  | 1    | 5000   | 10000  | -37.6 ± 14.2 |
| `reader` vs `cfr-talk-hidden`  | 1    | 5000   | 10000  | -50.1 ± 14.7 |
| `math` vs `cfr-talk-obvious`   | 1    | 5000   | 10000  | -34.9 ± 19.1 |
| `reader` vs `cfr-talk-obvious` | 3    | 20000  | 40000  | -26.2 ± 7.2  |
| `reader` vs `cfr-talk-hidden`  | 3    | 20000  | 40000  | -42.4 ± 7.3  |
| `math` vs `cfr-talk-obvious`   | 3    | 20000  | 40000  | -32.3 ± 9.1  |
| `math` vs `cfr-talk-hidden`    | 3    | 20000  | 40000  | -32.3 ± 9.1  |

The `cfr-tilted` row is the first corner, aggression 1.25 and bluff 1.3.

Cost of a bias: the goal holds against `cfr`. The most tilted bias of the first clamps loses -0.2 ± 2.6 bb/100 to
`cfr`, inside the 5 bb/100 allowance. `cfr` is a fixed blueprint that does not adapt, so this bounds the cost only
against such an opponent: shifted mixed frequencies cost little near equilibrium, and the interval still allows a
loss of about 2.8 bb/100 at the tilted corner. What tilt costs against an opponent that exploits it is measured below.

Readability: the goal holds at seed 3. There `reader` scores -26.2 ± 7.2 against `cfr-talk-obvious` and -42.4 ± 7.3
against `cfr-talk-hidden`. The difference is 16.2 bb/100 against a combined interval of about 10.3. The 5000 pair
run at seed 1 points the same way (-28.3 against -50.1), but there the difference of 21.8 barely clears the
combined interval of about 20.6, so on its own it is marginal. The cleaner measure is the reader's edge over `math`,
which ignores the talk: +6.1 bb/100 against obvious habits and -10.1 against hidden ones. The reader gains from
obvious habits, but the gain over `math` against obvious habits alone (+6.1) is inside its own noise, and against
hidden habits the reader does worse than `math`, because its rule of folding after silence has no basis there.
`math` scores the same -32.3 ± 9.1 against both opponents: a talking bot plays exactly as plain `cfr` does and the
speech changes nothing for a bot that does not listen, so the two runs play the same hands.

### Is tilt noticeable

`--stats` counts, for bot A over all its hands: `vpip` and `pfr` (hands with a call or raise, and with a raise,
before the flop), and after the flop `aggressionFactor` (bets and raises over calls), `betFrequency` (bets and
raises over decisions), `foldToBet` and `raiseFrequency` (folds and raises over decisions facing a bet or raise),
`betSize` (the mean of chips put in by a bet or raise after the flop over the pot before it) and `preflopRaiseSize`
(the same for raises before the flop).
These runs were made at commit `9c94cc8`; those at the second corner also had the clamp change of the next commit.
Noticeable means: `betFrequency` or `raiseFrequency` of `cfr-tilted` differs from `cfr` by at least 5 percentage
points, and the gain of `tilt-exploiter` on `cfr-tilted` over its result on `cfr` is larger than the paired 95%
interval of that gain (the two runs play the same decks; see below).

Behaviour of bot A against `cfr`, seed 2, 20000 pairs (40000 hands) each. Each frequency is known to about
±0.5 points (95%); that is the precision of one frequency, not an interval of the difference between two.

| Bot A                    | vpip  | pfr   | af   | bet   | fold to bet | raise | decisions after the flop | facing a bet |
| ------------------------ | ----- | ----- | ---- | ----- | ----------- | ----- | ------------------------ | ------------ |
| `cfr`                    | 74.1% | 43.7% | 2.12 | 25.4% | 45.9%       | 7.0%  | 68745                    | 17471        |
| `cfr-tilted` (1.25, 1.3) | 74.5% | 46.3% | 2.39 | 27.6% | 45.9%       | 7.8%  | 66737                    | 16595        |
| `cfr-confident`          | 74.3% | 45.3% | 2.29 | 26.7% | 46.2%       | 7.3%  | 67479                    | 16901        |
| `cfr-cautious`           | 73.9% | 42.5% | 2.01 | 24.5% | 46.0%       | 6.5%  | 69601                    | 17792        |
| `cfr-tilted` (1.6, 1.8)  | 75.0% | 49.0% | 2.84 | 30.3% | 46.9%       | 9.1%  | 64072                    | 15509        |

Exploiter, seed 4, 20000 pairs (40000 hands) each. The paired interval compares the two runs pair by pair over the
same decks and is tighter than the combined one, which treats them as independent. For pair `i` let `d_i` be
`(net_i of the second run − net_i of the first) / 2 / bigBlind × 100`, with pairs matched by index; the gain is the
mean of `d_i` and the paired interval is `1.96 × sd(d) / √pairs`.
`npm run arena:paired -- <first.jsonl> <second.jsonl>` computes it from two saved hands files:

```
second minus first: +5.8 ± 5.7 bb/100 over 20000 pairs
second minus first: +17.4 ± 8.4 bb/100 over 20000 pairs
```

(`tilt-exploiter` vs `cfr` first, then vs `cfr-tilted` at 1.25, 1.3 and at 1.6, 1.8.)

| Run                                          | bb/100       | gain over `vs cfr` | combined interval | paired interval |
| -------------------------------------------- | ------------ | ------------------ | ----------------- | --------------- |
| `tilt-exploiter` vs `cfr`                    | -87.7 ± 12.3 |                    |                   |                 |
| `tilt-exploiter` vs `cfr-tilted` (1.25, 1.3) | -81.9 ± 13.1 | +5.8               | ± 18.0            | ± 5.7           |
| `tilt-exploiter` vs `cfr-tilted` (1.6, 1.8)  | -70.3 ± 13.8 | +17.4              | ± 18.5            | ± 8.4           |

Plain cost at the new corner, seed 2: `cfr-tilted` (1.6, 1.8) vs `cfr` +0.4 ± 2.7 bb/100 over 400000 hands.

At the first clamps tilt was not noticeable: bets after the flop rose by 2.2 points and raises facing a bet by 0.8,
and the exploiter's gain of +5.8 was inside even the paired interval. The clamps were widened to the bound of the
task, aggression 1.6 and bluff 1.8 with tightness unchanged, and the mood coefficients with them (aggression
`0.5 tilt`, bluff `0.8 tilt`), so that a fully tilted mood reaches the corner.

Decision: at 1.6 and 1.8 tilt counts as noticeable. Duplicate runs with the same seed play the same decks, so the
paired interval is the test for them; the combined interval assumes independent runs and overstates the noise. The
exploiter gains +17.4 ± 8.4 bb/100 on `cfr-tilted`, above the paired interval, and the decision rests on that paired
gain. Bets after the flop rise by 4.9 points (30.3% against 25.4%, each known to about ±0.5 points), just under the
5 point bar, so the betting shift alone does not meet it; raises facing a bet rise by 2.1. The cost against
`cfr` stays inside the 5 bb/100 allowance (+0.4 ± 2.7), and the exploited cost of 17.4 bb/100 is under the 25 bb/100
stop. The clamps are not widened further.

The bias runs also print bb/100; `cfr` vs `cfr` at 20000 pairs gives -6.2 ± 7.7, which is noise: the bot plays itself, so its
true value is zero; the 200000 pair runs above are the measure of cost.

These runs predate issue #80: since then tightness also moves `cfr-tilted`, `cfr-confident` and `cfr-cautious`, and
their figures above are not re-measured.

### The axes at their edges (issue #80)

The bias used to multiply the blueprint's probabilities, so a pure decision could not move and looseness, stickiness
and sizing barely changed play (`cfr@tightness=0.5,stickiness=2` played 74.2% vpip against 74.1%). Now tightness
before the flop and stickiness after it, at nodes with a fold, and aggression at nodes without one, play a hand as a
slightly stronger or weaker one: the row of the same node is blended from the two buckets next to the shifted
strength percentile, `δ = 0.35 ln(1/tightness)`, `0.2 ln(stickiness)` and `0.2 ln(aggression)`. Preflop classes are
ordered by their equity against a random hand; buckets after the flop are already ordered by strength. Sizing
multiplies the pot fraction of the bot's own bet or raise. Aggression keeps its factor between calls and raises;
bluff has its own rule, below. The goal: the edges of each axis, 0.5 and 2 (the clamp of the
emotion model), make a different kind of player.

Each axis against `cfr`, seed 5, 2000 pairs (4000 hands) per point, each frequency known to about ±1.5 points:

| Axis, statistic                   | 0.5   | 0.67  | 0.8   | 1     | 1.25  | 1.5   | 2     |
| --------------------------------- | ----- | ----- | ----- | ----- | ----- | ----- | ----- |
| `tightness`, vpip                 | 84.2% | 82.8% | 80.6% | 73.7% | 68.2% | 64.0% | 55.5% |
| `stickiness`, fold to bet         | 59.5% | 53.6% | 50.5% | 45.6% | 40.6% | 35.6% | 29.2% |
| `aggression`, af                  | 1.03  | 1.38  | 1.64  | 2.09  | 2.70  | 3.30  | 4.33  |
| `aggression`, bet after the flop  | 15.9% | 19.8% | 22.1% | 25.8% | 30.1% | 33.6% | 37.9% |
| `sizing`, bet size after the flop | 0.55  | 0.62  | 0.68  | 0.80  | 0.97  | 1.13  | 1.47  |

Loose play stops near 84% vpip: in the big blind after a limp the bot checks, which is not voluntary, and only a
raise would add to vpip. Small sizes are held up by the minimum bet and raise.

The edges against `cfr`, seed 2, 20000 pairs (40000 hands) each, frequencies known to about ±0.5 points:

| Bot A            | bb/100       | vpip  | pfr   | af   | bet   | fold to bet | raise | bet size | preflop raise |
| ---------------- | ------------ | ----- | ----- | ---- | ----- | ----------- | ----- | -------- | ------------- |
| `cfr`            | -6.2 ± 7.7   | 74.1% | 43.7% | 2.12 | 25.4% | 45.9%       | 7.0%  | 0.81     | 1.43          |
| `tightness=0.5`  | -8.5 ± 11.8  | 84.3% | 59.8% | 2.41 | 25.9% | 50.7%       | 6.4%  | 0.79     | 1.47          |
| `tightness=2`    | -17.5 ± 7.5  | 56.1% | 30.6% | 1.83 | 24.0% | 41.7%       | 7.5%  | 0.82     | 1.36          |
| `stickiness=0.5` | -20.1 ± 7.5  | 74.1% | 43.7% | 2.83 | 25.2% | 59.9%       | 4.5%  | 0.78     | 1.43          |
| `stickiness=2`   | -13.5 ± 10.6 | 74.1% | 43.7% | 1.74 | 26.4% | 29.1%       | 12.0% | 0.90     | 1.43          |
| `aggression=0.5` | -9.5 ± 7.8   | 71.4% | 33.4% | 1.14 | 16.7% | 40.0%       | 6.6%  | 0.86     | 1.43          |
| `aggression=2`   | -19.6 ± 10.3 | 78.8% | 55.1% | 4.55 | 38.0% | 51.9%       | 10.3% | 0.80     | 1.43          |
| `sizing=0.5`     | +0.8 ± 8.1   | 74.1% | 43.7% | 2.03 | 25.6% | 45.5%       | 7.1%  | 0.54     | 1.00          |
| `sizing=2`       | -6.0 ± 11.8  | 74.1% | 43.7% | 1.90 | 23.7% | 44.5%       | 6.9%  | 1.50     | 2.51          |

The neutral bot plays the blueprint exactly: its row is the `cfr` row of the table above. All runs play the same
decks, so the -6.2 of `cfr` against itself is the luck of those decks, and the cost of an edge is about its result
minus -6.2: about 11 to 14 bb/100 for the nit, the bot that folds to bets and the maniac, about 7 for the calling
station after the flop, and within the noise for the loose bot before the flop, the passive one and both sizes.
Folding too much costs more than calling too much. Sizing is free against `cfr`, which does not read sizes; its
value is that a person can. The gain of an exploiting opponent is not measured: `tilt-exploiter` is too simple to
stand for one.

### Bluff

Bluffing is not aggression: aggression is how often she bets with any hand, bluffing is which hands her bets hold.
`bluff` acts only where she is checked to after the flop, and only on a hand in the bottom 35% of the street's
strength order: with `t = log2(bluff)`, a share `t` of its checks moves into its bets (into the node's average bet mix
when the hand never bets), and below 1 a share `-t` of its bets moves back into the check. At 2 she bets every such
hand, at 0.5 none, sizes stay the blueprint's, and spots facing a bet are left to stickiness and aggression.

`--stats` measures it as `riverBluffShare`: the share of her river bets and raises made with a hand that beats less
than 35% of the other hands on the board. At equilibrium a bet of 0.8 pot holds about 31% bluffs (`B / (P + 2B)`).

Against `cfr-v2`, seed 5, 2000 pairs (4000 hands) per point, the river share known to about ±4 points:

| `bluff`                 | 0.5   | 0.67  | 0.8   | 1     | 1.25  | 1.5   | 2     |
| ----------------------- | ----- | ----- | ----- | ----- | ----- | ----- | ----- |
| river bluffs            | 4.0%  | 12.4% | 17.4% | 21.8% | 25.7% | 29.6% | 32.5% |
| bet after the flop      | 22.1% | 25.5% | 27.5% | 29.9% | 34.2% | 38.1% | 43.8% |
| bet size after the flop | 0.82  | 0.79  | 0.79  | 0.80  | 0.82  | 0.81  | 0.81  |

The edges against `cfr-v2`, seed 2, 20000 pairs (40000 hands) each:

| Bot A              | bb/100      | af   | bet   | fold to bet | raise | bet size | river bluffs | river bets |
| ------------------ | ----------- | ---- | ----- | ----------- | ----- | -------- | ------------ | ---------- |
| `cfr-v2`           | -1.8 ± 10.0 | 2.28 | 29.3% | 41.6%       | 14.6% | 0.81     | 23.8%        | 4939       |
| `cfr-v2@bluff=0.5` | -3.6 ± 9.6  | 1.73 | 21.7% | 42.7%       | 15.3% | 0.84     | 3.6%         | 4066       |
| `cfr-v2@bluff=2`   | -3.5 ± 11.4 | 3.28 | 43.2% | 37.2%       | 15.1% | 0.83     | 35.2%        | 6081       |

At 0.5 her river bets are almost all for value; at 2 she bets every weak hand checked to her and about a third of
her river bets are bluffs. The upper edge is held by the hands that reach the river: a bluffer who bets the flop and
the turn with air takes many of those pots before the river. Raise frequency and sizes do not move, and fold to bet
moves only because she faces fewer bets. Neither edge costs a measurable amount against `cfr-v2`, which does not
exploit either; a player who calls too much would punish 2, and one who folds too much would punish 0.5.

### Poker statistics of the axes

`--stats` also adds `pokerStats` of bot A to the report, each a rate with its number of chances (`of`): `steal` and
`limp` (her first move on the button), `bigBlindDefence` (a call or raise against an open), `threeBet` (a raise
against a single raise), `foldToThreeBet`, `continuationBet` (a bet on the flop as the last raiser before it, when no
bet was made), `foldToContinuationBet`, `donkBet` (a bet out of position on the flop into the raiser),
`checkRaise`, `foldToFlopBet`, `foldToTurnBet`, `foldToRiverBet`, `wentToShowdown` (of the hands that saw a flop)
and `wonAtShowdown` (the share of the showdown pots she took).

Each axis and some mixes against `cfr-v2`, after #161, seed 2, 10000 pairs (20000 hands) each; every run plays the
same decks, frequencies with a few hundred chances or more are known to about ±1 to 2 points, and bb/100 is noise
at this size. Mixes: `screenshot` aggression 0.78, bluff 0.66, tightness 0.74, sizing 0.83, stickiness 1.44;
`tight` tightness 1.35, stickiness 0.69, aggression 0.78; `TAG` the same with aggression 1.4; `LAG` tightness 0.74,
stickiness 1.44, aggression 1.4; `nit` tightness 1.8, stickiness 0.5, bluff 0.7; `station` tightness 0.6,
stickiness 2, aggression 0.6, bluff 0.5; `maniac` aggression 1.4, bluff 1.6, tightness 0.8, sizing 1.2; `rock`
tightness 2, stickiness 0.5, aggression 0.5, bluff 0.5; `whale` tightness 0.5, stickiness 2, aggression 0.5.

| Profile        | bb/100       | VPIP | PFR  | steal | limp | BB def | 3-bet | F 3-bet | c-bet | F c-bet | donk | x/r  | F flop | F turn | F river | AF   | bet  | size | river bluff | WTSD | W$SD |
| -------------- | ------------ | ---- | ---- | ----- | ---- | ------ | ----- | ------- | ----- | ------- | ---- | ---- | ------ | ------ | ------- | ---- | ---- | ---- | ----------- | ---- | ---- |
| blueprint      | +3.3 ± 13.7  | 74.3 | 42.6 | 59.3  | 33.9 | 71.3   | 18.0  | 50.9    | 59.1  | 39.7    | 10.0 | 13.9 | 40.0   | 40.7   | 45.6    | 2.28 | 29.4 | 0.81 | 23.5        | 33.2 | 49.1 |
| tightness-0.5  | -0.6 ± 15.4  | 80.6 | 42.6 | 59.3  | 38.1 | 85.4   | 17.6  | 22.9    | 59.1  | 43.3    | 10.3 | 13.6 | 42.2   | 41.3   | 45.9    | 2.25 | 29.0 | 0.80 | 24.5        | 32.6 | 48.9 |
| tightness-2    | -3.0 ± 13.0  | 62.8 | 39.0 | 54.7  | 28.5 | 49.5   | 14.5  | 70.2    | 58.7  | 34.8    | 8.6  | 13.9 | 37.9   | 39.2   | 43.9    | 2.27 | 29.6 | 0.82 | 20.6        | 34.6 | 49.8 |
| stickiness-0.5 | +1.1 ± 12.5  | 74.3 | 42.6 | 59.3  | 33.9 | 71.3   | 18.0  | 50.9    | 59.1  | 50.2    | 10.0 | 11.2 | 51.2   | 50.5   | 56.8    | 2.73 | 28.7 | 0.78 | 19.0        | 28.5 | 51.9 |
| stickiness-2   | -1.8 ± 15.7  | 74.3 | 42.6 | 59.3  | 33.9 | 71.3   | 18.0  | 50.9    | 59.1  | 24.4    | 10.0 | 13.4 | 26.8   | 31.1   | 36.1    | 1.76 | 28.9 | 0.81 | 25.7        | 39.3 | 47.3 |
| aggression-0.5 | -2.7 ± 11.7  | 70.4 | 26.8 | 39.3  | 53.9 | 71.3   | 11.2  | 48.1    | 30.8  | 37.0    | 1.6  | 11.2 | 38.0   | 38.1   | 41.9    | 0.89 | 13.6 | 1.10 | 11.5        | 44.4 | 53.8 |
| aggression-2   | +5.7 ± 17.6  | 79.1 | 58.6 | 74.6  | 18.6 | 71.3   | 30.1  | 53.1    | 84.8  | 44.7    | 29.1 | 18.1 | 40.7   | 45.6   | 52.5    | 5.26 | 51.8 | 0.75 | 28.5        | 23.2 | 42.6 |
| sizing-0.5     | +2.3 ± 13.5  | 74.3 | 42.6 | 59.3  | 33.9 | 71.3   | 18.0  | 50.8    | 60.0  | 39.6    | 9.9  | 14.1 | 39.2   | 40.2   | 44.5    | 2.30 | 30.4 | 0.61 | 23.7        | 36.5 | 51.6 |
| sizing-2       | -2.2 ± 16.0  | 74.3 | 42.6 | 59.3  | 33.9 | 71.3   | 18.0  | 51.3    | 56.8  | 39.8    | 10.0 | 13.9 | 40.9   | 42.8   | 47.6    | 2.25 | 27.9 | 1.19 | 23.1        | 30.1 | 47.9 |
| screenshot     | -4.9 ± 14.2  | 75.9 | 36.7 | 52.4  | 43.1 | 78.5   | 15.0  | 36.7    | 40.3  | 31.4    | 3.6  | 12.7 | 31.6   | 34.5   | 40.3    | 1.18 | 18.8 | 0.84 | 12.8        | 44.4 | 49.2 |
| tight          | +8.6 ± 11.6  | 68.1 | 35.9 | 51.6  | 38.2 | 61.7   | 14.2  | 59.7    | 47.7  | 43.2    | 3.7  | 11.6 | 45.1   | 44.5   | 49.4    | 1.76 | 22.0 | 0.87 | 16.2        | 34.8 | 53.6 |
| TAG            | -5.7 ± 13.9  | 72.0 | 49.1 | 66.4  | 23.4 | 61.7   | 21.0  | 62.7    | 73.2  | 46.8    | 18.0 | 12.8 | 45.8   | 48.4   | 55.1    | 3.84 | 39.7 | 0.74 | 23.4        | 26.0 | 47.0 |
| LAG            | -6.0 ± 17.2  | 79.8 | 50.6 | 67.5  | 28.0 | 78.5   | 23.3  | 38.5    | 73.1  | 34.6    | 18.0 | 15.2 | 34.2   | 37.5   | 44.4    | 2.97 | 39.2 | 0.76 | 27.6        | 30.6 | 44.5 |
| nit            | -1.3 ± 11.8  | 65.0 | 39.6 | 55.6  | 29.8 | 53.2   | 15.1  | 67.4    | 51.4  | 46.1    | 8.0  | 11.3 | 48.3   | 51.0   | 57.4    | 2.44 | 25.8 | 0.79 | 11.1        | 30.9 | 51.5 |
| station        | -6.9 ± 15.0  | 76.4 | 30.7 | 44.8  | 52.0 | 82.5   | 12.2  | 27.9    | 27.5  | 25.0    | 2.0  | 11.1 | 25.6   | 30.2   | 35.8    | 0.69 | 12.8 | 1.04 | 2.8         | 51.8 | 49.5 |
| maniac         | -1.0 ± 18.5  | 79.1 | 50.6 | 67.5  | 27.5 | 76.9   | 23.3  | 41.9    | 76.9  | 34.2    | 36.6 | 18.2 | 38.6   | 40.7   | 46.9    | 4.10 | 47.3 | 0.86 | 32.5        | 24.3 | 46.7 |
| rock           | -11.2 ± 10.2 | 59.0 | 24.7 | 36.4  | 46.8 | 49.5   | 10.0  | 65.2    | 24.5  | 42.0    | 1.1  | 9.3  | 47.0   | 46.8   | 50.2    | 0.94 | 12.0 | 1.16 | 0.2         | 40.9 | 56.4 |
| whale          | -6.7 ± 14.6  | 76.7 | 26.7 | 39.3  | 58.1 | 85.4   | 10.8  | 20.5    | 30.8  | 25.5    | 1.7  | 9.8  | 26.3   | 29.8   | 34.4    | 0.67 | 12.9 | 1.08 | 13.9        | 51.5 | 51.1 |

Each axis moves its own statistics and leaves the rest: tightness moves the big blind defence (50% to 85%) and the
fold to a 3-bet (70% to 23%), stickiness the folds after the flop (fold to a flop bet 51% to 27%), aggression the
raises and bets (PFR 27% to 59%, c-bet 31% to 85%, af 0.89 to 5.26), sizing only the bet size (0.61 to 1.19 pot).
Statistics of a later decision also move with the hands that reach it, so an axis can shift them a little without
touching that decision (aggression 2 folds more to a c-bet, most likely because it reaches the flop with other hands and more 3-bet pots).
Two things stand out: a passive bot bets fewer times but bigger (bet size 1.10 at aggression 0.5, 0.81 neutral),
because the small bets of the blueprint go to the check first; and the tightest preflop profiles still play 59% to
65% of hands, since the blueprint plays 74% heads-up and the shift moves the odds of continuing, not a share of the
range.

The fold axes were then calibrated to the archetype edges of issue #80: `LOOSE_SHIFT` 0.35 to 0.45 and
`STICKY_SHIFT` 0.2 to 0.31. Against `cfr-v2`, seed 2, 10000 pairs each: tightness 0.5 / 2 play 81.7% / 58.9% vpip
(80.6% / 62.8% before), stickiness 0.5 / 2 fold 57.4% / 25.1% to a bet (52.3% / 30.6% before). Loose play is held
near 84% vpip by the checked big blind after a limp. The mixes in the table above that use these axes were measured
before the change.

## Managing runs

Local runs live in the results directory (`web/arena-out` of the main checkout), each as `<name>.json` and
`<name>.jsonl`. Published runs live in `web/arena-results/` as `<name>.json` and `<name>.jsonl.gz`, listed in
`index.json`.

| To                      | Do                                                                                   |
| ----------------------- | ------------------------------------------------------------------------------------ |
| add a local run         | `npm run arena -- --a <bot> --b <bot> --pairs <n>`; it is saved and listed at once   |
| remove a local run      | delete its `.json` and `.jsonl` from the results directory                           |
| publish a run           | `npm run arena:publish -- <name>`, commit `web/arena-results/`, merge to `master`    |
| replace a published run | publish it again: the files and the index are overwritten                            |
| unpublish a run         | delete its two files in `web/arena-results/`, `npm run arena:publish`, commit, merge |

The viewer reads the directory on every page load, so `npm run arena:ui` shows a new or removed local run after a
reload. The public page changes when the commit reaches `master` and the site is deployed.

## Publishing

```
npm run arena:publish -- cfr-math-20000 cfr-always-call-2000-s3-20261030-154845
```

copies the named runs from the results directory (a file name with or without `.json`, or a path) into
`web/arena-results/`: the report and the hands as `.jsonl.gz`, and rewrites `index.json`. Commit the files; after the
merge the runs are public at `<site>/arena/`. To unpublish a run, delete its files and run `npm run arena:publish`
with no argument to rewrite the index. A 20 000 pair run adds about 2 MB.
