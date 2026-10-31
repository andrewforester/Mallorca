# Arena

Duplicate matches between two bots, reported in bb/100 with a 95% confidence interval.

```
npm run arena -- --a math --b always-call --pairs 2000
```

Flags: `--a`, `--b` (`math`, `cfr`, `cfr-tilted`, `cfr-confident`, `cfr-cautious`, `cfr-talk-obvious`, `cfr-talk-subtle`, `cfr-talk-hidden`, `reader`, `tilt-exploiter`, `always-call`, `always-raise`, `min-bettor`, `random`), `--pairs` (1000), `--seed` (1), `--workers` (available cores), `--dir <path>` (results directory), `--out <file>` (JSON report), `--save-hands <file>` (JSONL hand records), `--no-hands`, `--stats` (adds `styleStats` of bot A to the report and prints it).

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

`cfr` is the `v1` blueprint of `solver/` (checkpoint 18) in `src/cfr/v1.mlcs.gz`, played through
`src/cfr/mallorca.wasm`; `npm run arena` builds the module first. Reference runs on the same machine, seed in
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

## Styled and talking bots (issue #23)

| Bot                                                      | What it is                                                                                                                                                                                                                                                         |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `cfr-tilted`                                             | `cfr` with the style aggression 1.6, bluff 1.8, tightness 0.85 (1.25, 1.3, 0.85 at the first clamps)                                                                                                                                                               |
| `cfr-confident`                                          | `cfr` with the style 1.15, 1, 0.95                                                                                                                                                                                                                                 |
| `cfr-cautious`                                           | `cfr` with the style 0.9, 0.9, 1.2                                                                                                                                                                                                                                 |
| `cfr-talk-obvious`, `cfr-talk-subtle`, `cfr-talk-hidden` | plain `cfr` that, after deciding a raise, speaks with the chance of the base habit `herBet` for its hand strength class at that level                                                                                                                              |
| `reader`                                                 | the `math` bot that uses the talk: facing a bet after the opponent spoke, a math fold becomes a call when the call is at most half the pot; facing a bet after the opponent was silent, a math call becomes a fold                                                 |
| `tilt-exploiter`                                         | the `math` bot that punishes tilt without knowing it: facing a bet or raise, a math fold becomes a call when the call is at most half the pot (the pot including the bet being called), and a math bet or raise with a weak strength class becomes a call or check |

A bot may implement `spoke()` (did it speak on its last decision) and `heard(spoke)`. The match loop calls
`other.heard(actor.spoke())` after every raise by an actor that has `spoke`, before the next decision, and `heard`
holds only for the next decision.

Cost of a style: `cfr-tilted vs cfr` should lose at most 5 bb/100. Readability of the habits: `reader` should win
against `cfr-talk-obvious` by more than the interval above what it wins against `cfr-talk-hidden`.

### Table talk results

Measured at commit `74659d2`. Commit `6c2d9d4` came after these runs and changed only `src/talk/talk.ts`, which no
arena bot uses, so it did not change any arena bot. Results are the first bot's bb/100 with a 95% interval. A
negative number is a loss. Seeds: 2 for the style runs, 1 and 3 for readability, 4 for the exploiter runs; each
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

Cost of a style: the goal holds against `cfr`. The most tilted style of the first clamps loses -0.2 ± 2.6 bb/100 to
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
raises over decisions), `foldToBet` and `raiseFrequency` (folds and raises over decisions facing a bet or raise).
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
exploiter gains +17.4 ± 8.4 bb/100 on `cfr-tilted`, above the paired interval. Bets after the flop rise by
4.9 points (30.3% against 25.4%, each known to about ±0.5 points), which reaches the 5 point bar within the
precision of the frequencies; raises facing a bet rise by 2.1. The cost against
`cfr` stays inside the 5 bb/100 allowance (+0.4 ± 2.7), and the exploited cost of 17.4 bb/100 is under the 25 bb/100
stop. The clamps are not widened further.

The style runs also print bb/100; `cfr` vs `cfr` at 20000 pairs gives -6.2 ± 7.7, which is noise: the bot plays itself, so its
true value is zero; the 200000 pair runs above are the measure of cost.

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
