# Arena

Duplicate matches between two bots, reported in bb/100 with a 95% confidence interval.

```
npm run arena -- --a math --b always-call --pairs 2000
```

Flags: `--a`, `--b` (`math`, `cfr`, `always-call`, `always-raise`, `min-bettor`, `random`), `--pairs` (1000), `--seed` (1), `--workers` (available cores), `--out <file>` (JSON report), `--save-hands <file>` (JSONL hand records).

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
```

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
