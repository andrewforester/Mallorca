# Mallorca solver

A Rust workspace for a CFR poker trainer.

- `crates/core`: pure game logic, cards, RNG, the card abstraction, the CFR core, checkpoints, the strategy file and
  measurement. Builds for `wasm32-unknown-unknown`.
- `crates/trainer`: the command line trainer that owns threads, files and clocks.
- `crates/wasm`: the WebAssembly module the web arena and the browser bot load, a plain `extern "C"` ABI over
  `mallorca-core::bot`.

Start with `CLAUDE.md` for the working rules.

Checkpoints are keyed by a fingerprint of blinds, stack, buckets, bet sizes, the tree and the bucket tables, so `name`, `threads`, `checkpoint_minutes`, `memory_limit_gb` and the `[cfr]` parameters may change between resumes.

## Overnight runbook for `v1`

Run everything from `solver/` in release mode. `D=data/v1` below; the preset is `presets/v1.toml` (stack 2000,
128 buckets per street, 12 threads, a checkpoint every 30 minutes). Bucket counts are capped at 256 by the `u8`
bucket tables, and a preset outside 1 to 256 is rejected when it loads; 512 buckets need a new table format.

```
cargo build --release -p mallorca-trainer
T=target/release/mallorca-trainer
P=presets/v1.toml
D=data/v1
mkdir -p $D
```

1. Bucket tables, once per bucket configuration (the `tiny` build takes about 25 s in release; `v1` has more
   buckets but the same table sizes):
   `$T buckets --preset $P --out $D`
2. Check the tree and the memory estimate: `$T tree --preset $P`
3. Measure the speed and get the iteration count for each night length:
   `$T calibrate --preset $P --data $D --minutes 30`
   It trains in a scratch directory and deletes it, so it never touches real checkpoints.
4. Train overnight, on mains power, under `caffeinate` so the M3 Pro neither sleeps nor idles for the 9 hours:
   `caffeinate -dims $T train --preset $P --data $D --minutes 540`
   Checkpoints are written every `checkpoint_minutes` (30) and on exit. Ctrl-C stops after the current iterations
   and writes a final checkpoint; a second Ctrl-C aborts without one. Release builds abort on a panic, so a crash
   writes no final checkpoint: the last periodic checkpoint is the recovery point, and running the same command
   again resumes from it.
5. For each checkpoint `N` (files `$D/checkpoints/N.ckpt`), export both variants and measure:
   - browser file: `$T export --preset $P --data $D --checkpoint N --streets browser --out $D/v1-N-browser.bin`
     (preflop and flop only; its gzip size is printed and goes into `RESULTS.md`)
   - full file: `$T export --preset $P --data $D --checkpoint N --streets all --out $D/v1-N-all.bin`
     (all streets, needed by `lbr` and `match`)
   - play file for the arena and the browser, version 2: `$T export --preset $P --data $D --checkpoint N --streets play --out $D/v1-N-play.mlcs`
     (all streets, the flop table and turn and river thresholds; needs `river_hs.f32` from step 1 and checks the
     thresholds against the tables). On a `bucketing = "potential"` preset the file is version 3: the flop table and
     the turn and river centroids from `centroids.bin`, checked against the tables on every class
   - exploitability: `$T lbr --strategy $D/v1-N-all.bin --hands 1000000`
6. Strength against fixed opponents, on the last checkpoint:
   `$T match --strategy $D/v1-last-all.bin --opponent all --deals 200000`
7. Deeper stacks, on the last checkpoint only, for both `lbr` and `match`:
   `$T lbr --strategy $D/v1-last-all.bin --hands 1000000 --stack 2500` and `--stack 3000`
   `$T match --strategy $D/v1-last-all.bin --opponent all --deals 200000 --stack 2500` and `--stack 3000`

`lbr` prints mbb/hand with a 95% interval; `match` prints bb/100 with a 95% interval per opponent. `train` prints
the average positive regret at every checkpoint. Copy the figures into `RESULTS.md`.

### Expected artefact sizes

Bucket tables, the same size for every preset because they are indexed by canonical hand class. Each `.bkt` file
starts with a 9 byte header: magic `MLCB`, `u16` format version 1, `u8` street (1 flop, 2 turn, 3 river) and `u16`
bucket count, all little-endian, then one `u8` bucket per class. `train` and `export` refuse a table whose street or
bucket count differs from the preset, naming the file; rebuild the tables with `buckets` after changing `buckets`.

| File | Size |
| --- | --- |
| `flop.bkt` | 1.3 MB (1,286,801 bytes) |
| `turn.bkt` | 14 MB (13,960,059 bytes) |
| `river.bkt` | 123 MB (123,156,263 bytes) |
| `river_hs.f32` | 493 MB (492,625,016 bytes) |

The `v1` tree (`tree --preset presets/v1.toml`): 41,410 nodes, 1,950,352 infosets, 5.3M action slots at 128
buckets (5,302,197). Each action slot holds an `f32` regret and an `f64` strategy sum, 12 bytes, so a `v1`
checkpoint is 63,626,430 bytes (a 66 byte header, then all regrets, then all strategy sums). The `memory estimate`
is action slots * 12 bytes (`tree` prints that) plus the three bucket tables (`train` adds them); `train` checks it
against `memory_limit_gb` before training starts.

### Resuming

Run the same `train` command again. It loads the latest checkpoint in `$D/checkpoints` and continues counting
iterations from it; `--minutes` or `--iterations` apply to the new session. A checkpoint is accepted only if its
fingerprint matches (blinds, stack, buckets, bet sizes, tree and bucket tables); a mismatch is an error, never a
silent restart. `name`, `threads`, `checkpoint_minutes`, `memory_limit_gb` and the `[cfr]` parameters may change
between resumes. To start over, use a new `--data` directory or remove `$D/checkpoints`.

## `v2`: potential-aware buckets

`presets/v2.toml` keeps stack 2000 and 12 threads and changes the abstraction: 256 buckets per street,
`bucketing = "potential"`, opens of 2, 3 and 4 bb, iso raises of 3 and 4.5 bb, 3-bets of 3 and 4 times, a 4-bet of
2.2 times, and postflop bets of 0.25, 0.66, 1, 1.5 and 2 pots with a pot-sized raise and min-raises. It needs its own
`--data` directory, because the bucket tables and the tree differ from `v1`.

```
P=presets/v2.toml
D=data/v2
mkdir -p $D
$T buckets --preset $P --out $D
$T tree --preset $P
caffeinate -dims $T train --preset $P --data $D --minutes 540
$T export --preset $P --data $D --checkpoint N --streets play --out $D/v2-N-play.mlcs
$T export --preset $P --data $D --checkpoint N --streets all --out $D/v2-N-all.bin
```

`buckets` writes `flop.bkt`, `turn.bkt`, `river.bkt` and `river_hs.f32` with the sizes in the table above, and
`centroids.bin` (59,575 bytes: 256 turn centroids of 50 histogram bins, 256 river centroids of 8 opponent clusters
and the 169-class cluster map). The flop and turn are clustered by earth mover's distance on equity histograms,
the river by Euclidean distance on equity against 8 opponent clusters. On an M3 Pro with 12 threads `v2` takes
about 16 minutes (931 s, most of it k-means on the turn) and peaks at about 1.7 GB; `tiny-potential` (8 buckets per
street, 2 threads) takes about 200 s.

The `v2` tree (`tree --preset presets/v2.toml`): 257,096 nodes, 23,802,790 infosets, 65,802,487 action slots, a
memory estimate of 0.790 GB, so a checkpoint is 789,629,910 bytes.

The play file is strategy format 3: the flop table, the turn and river centroids and the cluster map, checked by
`export` against the tables on every class. A turn decision costs one live bucket, about 1 ms in release WebAssembly
under Node, a river decision under 0.1 ms. `lbr` and `match` accept the play file, but `lbr` buckets every
opponent hand live on it (about 4 hands/s on `tiny-potential` with 2 threads), so measure with the `all` file.
