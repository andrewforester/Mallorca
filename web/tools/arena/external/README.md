# External matches

Our bot against bots we did not write, over their APIs. The only opponent so far is
[Slumbot](https://www.slumbot.com), heads-up no-limit at 200 bb (blinds 50/100, stacks 20000, reset every hand).

```
npm run arena:external -- --strategy cfr:<play file> --hands 2000
npm run arena:external -- --resume <file.jsonl> --strategy cfr:<play file> --hands 5000
npm run arena:external -- --report <file.jsonl>
```

Flags: `--strategy` (any arena bot name, `cfr` by default), `--hands` (1000), `--seed` (1), `--out <file.jsonl>`,
`--resume <file.jsonl>` (appends to a log and continues its numbering; it refuses a log of another strategy),
`--delay-ms` (200, the pause between hands), `--opponent` (`slumbot`), `--report <file.jsonl>` (only the
estimate). The log goes to `--resume`, else `--out`, else `web/arena-out/<strategy>-slumbot-<hands>-s<seed>-<time>.jsonl`
of the main checkout. Optional `SLUMBOT_USERNAME` and `SLUMBOT_PASSWORD` log in; otherwise the run is anonymous.

Every run ends with the report: `<log without .jsonl>.json` and one line:

```
cfr-v2-10-play vs slumbot (200 bb): baseline +12.3 ± 6.1, all-in EV +10.1 ± 14.9, raw +11.0 ± 17.0 bb/100 over 41000 hands
```

- `raw`: the chips won, per hand.
- `all-in EV`: a hand where both players were all in before the river counts its expectation over the remaining
  board (exact enumeration) instead of the real runout.
- `baseline`: `winnings - baseline_winnings`, where `baseline_winnings` is what Slumbot reports it would have won
  in our seat with the same cards against itself. Unbiased while both positions are played equally often (Slumbot
  alternates them; the report counts each). Its mean, `baselineMean` in the report, must be near 0. It is not:
  over 110,047 hands it was -17.7 ± 11.3 bb/100, so the baseline figure is biased and only all-in EV and raw are
  used in `solver/RESULTS.md`.

The report is a function of the log only, so `--report` on the same log always gives the same numbers.

## How it plays

Slumbot owns the hand. After every response the hand is rebuilt in our engine from the action string, our hole
cards and the board shown so far (unknown cards are filled in but never reach the bot), and a fresh bot seeded by
the hand and the decision chooses the action. At the end of the hand the engine result must equal Slumbot's
`winnings`; a mismatch, or an action string the engine cannot follow, stops the run and logs the raw hand.

An `act` request is resent only when it certainly never left the machine (connection refused, DNS failure): the
API has no way to read a hand back, and a second `act` could play twice. Any other failure abandons the hand; the
log keeps it as abandoned, the estimate skips it, and ten in a row stop the run.

## Log

One JSON line per hand: `record` (a `HandRecord`, null when abandoned) and `external` (`opponent`, `clientPos`,
`action`, `holeCards`, `board`, `opponentCards`, `winnings`, `baselineWinnings`, `seed`, `handIndex`, `abandoned`,
`error`). A last line cut by a crash is dropped on `--resume`.

The tests replay six live hands recorded on 2026-10-31 (`fixtures/slumbot-probe.json`, tokens removed); they never
call the service.
