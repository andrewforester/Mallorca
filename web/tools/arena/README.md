# Arena

Duplicate matches between two bots, reported in bb/100 with a 95% confidence interval.

```
npm run arena -- --a math --b always-call --pairs 2000
```

Flags: `--a`, `--b` (`math`, `cfr`, `always-call`, `always-raise`, `min-bettor`, `random`), `--pairs` (1000), `--seed` (1), `--workers` (available cores), `--dir <path>` (results directory), `--out <file>` (JSON report), `--save-hands <file>` (JSONL hand records), `--no-hands`.

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
