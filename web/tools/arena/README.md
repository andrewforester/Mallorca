# Arena

Duplicate matches between two bots, reported in bb/100 with a 95% confidence interval.

```
npm run arena -- --a math --b always-call --pairs 2000
```

Flags: `--a`, `--b` (`math`, `cfr`, `cfr-solve`, `always-call`, `always-raise`, `random`), `--pairs` (1000), `--seed` (1), `--workers` (available cores), `--out <file>` (JSON report), `--save-hands <file>` (JSONL hand records).

Each pair plays the same deck twice with the seats swapped, so `bbPer100` is the mean of `net / 2 / bigBlind * 100` over pairs.

Reference run on Apple M3 Pro, 12 cores:

```
math vs always-call: +272.8 ± 42.4 bb/100 over 4000 hands in 37 s
```

`cfr-solve` is the same blueprint with the turn and river subgame solver on (`ARENA_SOLVER` in `bots.ts`): it plays
preflop and the flop from the blueprint and solves the turn with 50 iterations and the river with 200. These are
the largest counts that keep `cfr-solve` vs `cfr` at about 1.4 s per hand on one worker (a turn decision takes
3.4 s at the median, a river decision 70 ms), so 20,000 pairs over 12 workers take about 1.5 hours. The game's
Solver opponent uses fewer turn iterations (`BROWSER_SOLVER` in `src/cfr/solver.ts`, 12 and 200) to stay inside
the 5 s decision budget on a phone.

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
