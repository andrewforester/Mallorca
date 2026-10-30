# Arena

Duplicate matches between two bots, reported in bb/100 with a 95% confidence interval.

```
npm run arena -- --a math --b always-call --pairs 2000
```

Flags: `--a`, `--b` (`math`, `cfr`, `always-call`, `always-raise`, `random`), `--pairs` (1000), `--seed` (1), `--workers` (available cores), `--dir <path>` (results directory), `--out <file>` (JSON report), `--save-hands <file>` (JSONL hand records), `--no-hands`.

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
showdown, and the hands, a duplicate pair at a time, as PokerStars text.

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
