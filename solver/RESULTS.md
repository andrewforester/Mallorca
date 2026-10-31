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

## Turn and river subgame solver in the arena (2026-10-28)

The solver is not on `master`: its code is on the branch `feat/subgame-solver` (pull request #18, closed unmerged
on 2026-10-31). It solves the turn and river at play time over all 1326 combos with vectorised DCFR, from Bayes
ranges over the blueprint. These are its measurements, kept here for when it is ported again.

Code at efecf9c, M3 Pro, the same play file as above, 100 bb, blinds 10/20, duplicate pairs. Each match ran in
chunks of 1000 pairs with seeds 101 to 110 (`cfr-solve` vs `cfr`), 301 to 305 (`cfr-solve` vs `math`) and 201 to
202 (`cfr-browser` vs `cfr`, the game's `BROWSER_SOLVER` counts). The totals are the mean of the chunks, with the
95% interval as the square root of the sum of the squared chunk intervals over the number of chunks.

| bot         | opponent | turn, river iterations | hands  | bb/100 (95% interval) |
| ----------- | -------- | ---------------------- | ------ | --------------------- |
| cfr-solve   | cfr      | 50, 200                | 20,000 | +10.6 ± 12.7          |
| cfr-solve   | math     | 50, 200                | 10,000 | +20.7 ± 20.5          |
| cfr-browser | cfr      | 12, 200                | 4,000  | -7.6 ± 32.2           |

Chunks of `cfr-solve` vs `cfr`: -9.5, +10.6, +27.9, +20.8, -6.3, -21.4, +17.6, +33.7, +7.1, +25.6. Chunks of
`cfr-solve` vs `math`: +28.9, +17.9, +22.1, +23.5, +11.0. A chunk of 1000 pairs took about an hour.

- Neither success criterion of the solver design is met. Against the blueprint the interval still includes zero;
  at this effect size a significant answer needs about 50,000 to 60,000 hands.
- Against `math` the solver does not beat the blueprint's +32.8 ± 9.2; the intervals overlap, so it is not shown to
  be worse either.
- The browser counts are too few hands to say anything.
- Likely causes, not measured: unsafe re-solving with Bayes ranges from a coarse blueprint, the single river size
  inside a turn tree, and 50 turn iterations short of convergence.

### On the `v2` blueprint (2026-10-31)

Code at 0373ee6 on that branch, the `v2` play file of checkpoint 10, M3 Pro, 100 bb, blinds 10/20, duplicate pairs,
8 to 10 workers. `cfr-solve:<play file>` and `cfr:<play file>` play the same file with and without the solver.

| bot | opponent | turn, river iterations | hands | seed | bb/100 (95% interval) |
| --- | --- | --- | --- | --- | --- |
| cfr-solve v2 | cfr v2 | 50, 200 | 10,000 | 101 | +23.2 ± 20.7 |
| cfr-solve v2 | cfr v2 | 50, 200 | 40,000 | 201 | +17.2 ± 9.9 |
| cfr-solve v2 | math | 50, 200 | 10,000 | 101 | +24.6 ± 21.1 |
| cfr-solve v2 | math | 50, 200 | 40,000 | 201 | +26.0 ± 9.8 |
| cfr-solve v2 | cfr v2 | 12, 200 | 40,000 | 301 | +1.8 ± 11.1 |

Decision time of `cfr-solve` on `v2` in Node, one thread, 300 hands against the blueprint:

| turn iterations | turn p50 | turn p95 | turn max | river p50 (200 iterations) |
| --- | --- | --- | --- | --- |
| 12 | 0.78 s | 1.21 s | 3.9 s | 65 ms |
| 25 | 1.61 s | 2.30 s | 6.3 s | 64 ms |
| 50 | 3.16 s | 4.39 s | 10.3 s | 65 ms |

- At 50 turn iterations the solver beats its own blueprint: +18 ± 9 over the 50,000 hands pooled, the first
  significant gain (on `v1` it was +10.6 ± 12.7).
- Against `math` it does not add to the blueprint (+26.0 ± 9.8 against +33.1 ± 10.2 for `v2` alone).
- At the game's 12 turn iterations the gain is gone, and 50 iterations do not fit a game: about 65 ms per turn
  iteration, so 3.2 s at the median and up to 10 s, over the 5 s fallback budget, and a phone is slower still.
- So the game keeps playing the blueprint alone, and the solver is not merged. It is worth porting when 50 turn
  iterations fit in about a second: fewer sizes in the turn tree, the river from the blueprint inside a turn solve,
  or threads in WebAssembly.

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
