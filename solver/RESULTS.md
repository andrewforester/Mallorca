# Results

One row per training run or measured checkpoint. Record the preset, the figures and the run time; change one lever
at a time (see "How to improve").

| date | preset | fingerprint prefix | stack | iterations | hours | average positive regret | LBR mbb/hand (95% interval) | match bb/100 vs call | match bb/100 vs raise | match bb/100 vs random | browser file size gzip |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-10-24 | v1 ckpt 2 | b93c4ff8 | 2000 | 3,217,521,891 | 1 | 56.97 | +803 ± 76 (200k hands) |  |  |  | 0.94 MB |
| 2026-10-24 | v1 ckpt 4 | b93c4ff8 | 2000 | 6,467,908,375 | 2 | 39.93 | +931 ± 75 (200k hands) |  |  |  | 0.93 MB |
| 2026-10-24 | v1 ckpt 6 | b93c4ff8 | 2000 | 9,754,898,862 | 3 | 32.26 | +899 ± 77 (200k hands) |  |  |  | 0.93 MB |
| 2026-10-24 | v1 ckpt 8 | b93c4ff8 | 2000 | 13,047,733,757 | 4 | 27.71 | +912 ± 76 (200k hands) |  |  |  | 0.93 MB |
| 2026-10-24 | v1 ckpt 10 | b93c4ff8 | 2000 | 16,354,701,840 | 5 | 24.64 | +1017 ± 76 (200k hands) |  |  |  | 0.93 MB |
| 2026-10-24 | v1 ckpt 12 | b93c4ff8 | 2000 | 19,573,609,966 | 6 | 22.41 | +923 ± 76 (200k hands) |  |  |  | 0.93 MB |
| 2026-10-24 | v1 ckpt 14 | b93c4ff8 | 2000 | 22,864,043,913 | 7 | 20.66 | +905 ± 77 (200k hands) |  |  |  | 0.93 MB |
| 2026-10-24 | v1 ckpt 16 | b93c4ff8 | 2000 | 26,165,838,457 | 8 | 19.26 | +977 ± 76 (200k hands) |  |  |  | 0.93 MB |
| 2026-10-24 | v1 ckpt 18 | b93c4ff8 | 2000 | 29,469,934,361 | 9 | 18.08 | +1001 ± 34 (1M hands) | +190.1 ± 4.0 | +114.6 ± 8.0 | +143.5 ± 7.1 | 0.93 MB |
| 2026-10-24 | v1 ckpt 18 | b93c4ff8 | 2500 | 29,469,934,361 | 9 | 18.08 | +988 ± 82 (200k hands) | +201.4 ± 4.6 | +176.8 ± 10.0 | +208.9 ± 8.6 | 0.93 MB |
| 2026-10-24 | v1 ckpt 18 | b93c4ff8 | 3000 | 29,469,934,361 | 9 | 18.08 | +1170 ± 89 (200k hands) | +212.7 ± 5.2 | +238.9 ± 12.0 | +274.4 ± 10.2 | 0.93 MB |
| 2026-10-31 | v2 ckpt 4 | 1bee68fc | 2000 | 1,479,135,769 | 2 | 581.88 | +665 ± 82 (200k hands) |  |  |  |  |
| 2026-10-31 | v2 ckpt 8 | 1bee68fc | 2000 | 2,908,585,385 | 4 | 410.40 | +647 ± 83 (200k hands) |  |  |  |  |
| 2026-10-31 | v2 ckpt 10 | 1bee68fc | 2000 | 3,305,238,419 | 4.6 | 384.04 | +713 ± 37 (1M hands) | +222.8 ± 5.0 | +129.4 ± 8.3 | +191.0 ± 7.7 | 2.31 MB |

## First run (v1, 2026-10-24)

- Code at 9d1035e, M3 Pro, 12 threads, about 0.9M iterations per second, 9 hours, a checkpoint every 30 minutes.
- Average positive regret falls about as 1/sqrt(T), from 136.5 at 5.4e8 iterations to 18.1 at 2.9e10.
- LBR does not fall after the first hour: about +800 mbb/hand at checkpoint 2, then 900 to 1050 for every later
  checkpoint, all inside each other's intervals except checkpoint 2. The strategy keeps converging inside the
  abstraction while its exploitability in the real game stays flat. By lever 1 below that means the abstraction is
  the limit, not the training time: a second night on `v1` is not worth it.
- The strategy beats all three baselines by a wide margin at 100, 125 and 150 bb.
- At 150 bb (`--stack 3000`) LBR is about 170 mbb/hand worse than at 100 bb; at 125 bb the difference is inside
  the interval.
- The browser file (preflop and flop) is 2.16 MB raw, 0.93 MB gzipped.
- Next run: lever 2 (256 buckets) or lever 3 (better buckets), measured against the 1M-hand figure of checkpoint
  18.

## Second run (v2, 2026-10-31)

- Code at 9bb2312, preset `v2` (256 buckets per street, potential-aware buckets, the new preflop and postflop sizes),
  M3 Pro on 6 of 12 threads at normal priority, so the fans stay low. Buckets took 11 minutes on 6 threads.
- About 0.2M iterations per second, 4.6 hours, 3.3e9 iterations: 9 times fewer than the `v1` night on a tree with
  12 times as many action slots (65.8M). The average positive regret is not comparable with `v1`: it falls from
  1135 at checkpoint 1 to 384 at checkpoint 10.
- LBR is +713 ± 37 mbb/hand over 1M hands, against +1001 ± 34 for `v1` ckpt 18: about 29% lower with fewer
  iterations. Checkpoints 4 and 8 (+665 and +647 over the same 200k hands) are inside each other's intervals, so
  LBR is flat after 2 hours, as in `v1`. A second night on `v2` is not expected to move it much; the next lever is
  the abstraction or the bet sizes again (levers 3 and 5).
- `match` beats every baseline by more than `v1` does: +222.8 against call (`v1` +190.1), +129.4 against raise
  (+114.6), +191.0 against random (+143.5).
- The browser file (preflop and flop) is 6.91 MB raw, 2.31 MB gzipped. The play file is 72.0 MB raw, 51.2 MB
  gzipped, 40.8 MB with brotli at quality 11 and 41.1 MB with `xz -9e`; `v1` was 7.37 MB raw and 3.61 MB gzipped.

### Arena (2026-10-31)

The play file of checkpoint 10 in the web arena (`cfr:<play file>`), 100 bb, blinds 10/20, duplicate pairs:

| a | b | hands | seed | bb/100 (95% interval) |
| --- | --- | --- | --- | --- |
| v2 ckpt 10 | v1 ckpt 18 (`cfr`) | 400,000 | 2 | +10.3 ± 3.2 |
| v2 ckpt 10 | v1 ckpt 18 (`cfr`) | 40,000 | 1 | +12.7 ± 10.0 |
| v2 ckpt 10 | math | 40,000 | 1 | +33.1 ± 10.2 |

- `v2` beats `v1` head to head with the interval above zero.
- Against the math bot `v2` wins as much as `v1` (+32.8 ± 9.2 on the same seed): the lower LBR does not show
  against this opponent.

## Against Slumbot (200 bb, 2026-10-31)

`v2` checkpoint 10 (`cfr:solver/data/v2/v2-10-play.mlcs`) against [Slumbot](https://www.slumbot.com) over its API,
with `npm run arena:external` (issue #15, `web/tools/arena/external/`). Slumbot plays 200 bb (blinds 50/100), twice
the depth of the blueprint, so the bot plays the deeper half of every hand through off-tree translation. Not
duplicated, so the interval is wide; all-in EV and the baseline that Slumbot returns cut it.

| date | strategy | stack | hands | raw bb/100 | all-in EV bb/100 | baseline bb/100 | commit |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-10-31 | v2 ckpt 10 | 200 bb | 2,058 | +32.5 ± 80.6 | -13.7 ± 72.2 | -9.3 ± 75.4 | 791ca85 |

- An interim figure: every interval contains 0. The run continues to about 110,000 hands, where all-in EV reaches
  about ±10 (standard deviation per hand 1671 bb/100, 107,000 hands projected). The final row replaces this one.
- Standard deviation per hand: raw 1866, all-in EV 1671, baseline 1746. The Slumbot baseline (its own result in our
  seat with our cards) correlates only about 0.5 with ours, so it removes less variance than all-in EV; its mean,
  +41.8 ± 78.9, is consistent with 0, as the estimate needs.
- No hand abandoned, no mismatch between the engine and Slumbot's `winnings` over the 2058 hands.
- Reproduce from the log: the first 2058 lines of `web/arena-out/cfr-v2-10-play-slumbot-s1-20261031.jsonl` (main
  checkout) through `npm run arena:external -- --report <file>` give the row above exactly.

## Arena against the math bot (2026-10-24)

The play file of checkpoint 18 (`export --streets play`, 7.37 MB raw, 3.61 MB gzipped) in the web arena, through
`mallorca-wasm` with off-tree translation, 100 bb, blinds 10/20, duplicate pairs:

| opponent | hands | bb/100 (95% interval) |
| --- | --- | --- |
| math | 40,000 | +32.8 ± 9.2 |
| always-call | 10,000 | +165.3 ± 24.8 |
| always-raise (minimum raise) | 10,000 | +250.7 ± 48.9 |
| random (minimum raise) | 10,000 | +57.2 ± 23.2 |

- The blueprint beats the math bot with the interval above zero.
- It exploits weak opponents far less than the math bot does (math: +905.8 ± 95.9 against always-raise,
  +196.1 ± 45.0 against random, 4000 hands): it plays near equilibrium and does not adapt.
- Against always-call it keeps most of the on-tree `match` figure (+190.1 ± 4.0), so translation costs little
  there.

## How to improve

The first run sets the baseline; no threshold is fixed before it. Each lever names the number it should move.

1. **More iterations.** Resume from the checkpoint for a second night. Should lower LBR mbb/hand while average
   positive regret is still falling; when it flattens, the abstraction is the limit, not the training time.
2. **More buckets.** 128 to 256 or 512 per street, within the memory limit (256 is the cap of the `u8` tables).
   Should lower LBR mbb/hand; costs memory linearly and more iterations to converge.
3. **Better buckets.** Potential-aware buckets on flop and turn (k-means over equity histograms with earth mover's
   distance) and opponent cluster hand strength (OCHS) on the river. Should lower LBR mbb/hand, usually more than
   bucket count at the same memory.
4. **Regret-based pruning.** Skip actions with very negative regret in most iterations. Should raise iterations
   per second, so more training per night.
5. **Bet sizes.** Add the sizes LBR exploits most often, drop the ones the strategy never uses. Should lower LBR
   mbb/hand; every size multiplies the tree.
6. **Vector CFR over public chance** (public chance sampling). Should lower LBR mbb/hand and average positive
   regret at equal iteration count (faster convergence per iteration); a larger rewrite of `cfr`.
7. **Deeper blueprints.** Train presets with `stack` 3000 and 4000 and pick the nearest blueprint by effective
   stack at the start of a hand. Worth it when the arena from #3 shows deep effective stacks are common and the
   `--stack 2500` and `--stack 3000` figures (LBR mbb/hand and match bb/100) are clearly worse than at 2000.
   Should close that gap; costs one night and one browser file per depth.
8. **Cloud.** Only when the levers above are spent and the memory or time limit of the local machine is the
   blocker. Should raise iterations per night and the feasible bucket count; no direct effect on LBR otherwise.
