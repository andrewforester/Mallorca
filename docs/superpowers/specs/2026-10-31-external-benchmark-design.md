# External benchmark: the CFR bot against Slumbot (issue #15)

## Goal

Measure the CFR bot against a strong bot we did not write, in bb/100 with a 95% interval, and record the figure
with the strategy version in `solver/RESULTS.md`. The first and only opponent of this task is Slumbot; the code is
laid out so that another opponent (an ACPC dealer bot, for example) is one more adapter.

Done when (from the issue):

- a Slumbot result over enough hands for a 95% interval of about ±10 bb/100 or better is recorded in
  `solver/RESULTS.md` with the strategy version;
- a rerun of the report from the saved hand log reproduces the figure exactly;
- the adapter is tested on recorded responses, and CI never calls the service.

## Decisions

- **Opponent.** Slumbot only. ACPC is out of scope.
- **Depth.** Slumbot plays 200 bb (blinds 50/100, stacks 20000, reset every hand). We play the honest 200 bb with
  the current 100 bb blueprint through its off-tree translation, and record the result as its own row marked 200 bb.
  That row is the input for lever 7 (deeper blueprints).
- **Strategy.** `v2` checkpoint 10, the play file `solver/data/v2/v2-10-play.mlcs` of the main checkout, through
  `cfr:<play file>` as in the arena. The version string in reports is the file name.
- **Variance reduction.** Two estimates besides the raw one. All-in EV (ours). And the baseline that Slumbot
  itself returns: `baseline_winnings` is what Slumbot would have won in our seat with the same cards against
  itself, so `winnings - baseline_winnings` is a duplicate-style estimate. It is unbiased when both positions are
  played equally often, because Slumbot against itself nets zero over a pair of positions; Slumbot alternates
  `client_pos` every hand, and the report shows the count per position. The headline figure for the ±10 target is
  the one with the lowest variance on the live data (all-in EV after 2058 hands, not the baseline); the raw and all-in EV figures are always reported next to it. After about 2000 hands
  we measure the standard deviations and project the hands needed for ±10. If the projection is more than three
  nights, AIVAT becomes a separate issue; it is not part of this task.
- **Credentials.** Optional `SLUMBOT_USERNAME` and `SLUMBOT_PASSWORD` in the environment; without them the runner
  plays anonymously. Credentials and tokens are never written to disk or logs.
- **Politeness.** One request at a time, never in parallel, with a pause between hands (`--delay-ms`, default 200).

## Slumbot API

`POST https://slumbot.com/slumbot/api/<endpoint>`, JSON in and out.

- `login` `{ username, password }` returns `{ token }`.
- `new_hand` `{ token? }` starts a hand. If Slumbot acts first, its action is already in the response.
- `act` `{ token, incr }` sends one action.
- Responses carry `old_action`, `action`, `client_pos` (0 is the big blind, 1 is the small blind and the button),
  `hole_cards`, `board`, `token`. At the end of the hand they add `bot_hole_cards` (always, also after a fold),
  `winnings` (chips of the client), `won_pot`, `baseline_winnings`, `session_num_hands`, `session_total` and
  `session_baseline_total`. `error_msg` means the request was rejected. The client always uses the newest token
  it received.
- Action string: `k` check, `c` call, `f` fold, `b<n>` bet or raise to `n` chips put in on the current street
  (preflop includes the blind), `/` between streets. After an all-in the remaining streets may be empty.

These fields were checked on six live hands (2026-10-31); an action string may end in `/` when a street has just
been dealt (`b200c/kk/kk/`). The recorded hands, token removed, become the test fixtures.

## Architecture

New directory `web/tools/arena/external/`, a Node tool like the arena. It imports `engine`, `brains`, `cards`,
`equity`, `cfr` and `game/records/record.ts`, never `ui`. It reuses `ArenaBot` and the `cfr:<play file>` loading of
`tools/arena/bots.ts`.

### Mirror, rebuilt on every response

The Slumbot server owns the hand. Our engine mirrors it: after every response the hand is rebuilt from scratch.

1. Build a deck in the layout of `startHandWith` (big blind hole, button hole interleaved, then the board, no burn
   cards): our hole cards, the board known so far, the cards of Slumbot when known, and every unknown slot filled
   with the lowest remaining cards in `fullDeck` order.
2. Start the hand at 20000 each, blinds 50/100, our seat 0, button on seat 1 when `client_pos` is 0 and on seat 0
   when it is 1.
3. Apply the Slumbot action string with `applyAction`. An illegal action or a mismatch between the string and the
   engine (street, actor, amount) throws: the adapter is wrong.
4. If the hand is not over and seat 0 is to act: a fresh bot from the strategy, seeded by
   `mulberry32(hash(runSeed, handIndex, decisionIndex))`, receives `toObservations` of every event for seat 0, then
   `decide(legalActions(...))`.

Filler cards are never visible to the bot: a street is dealt in the mirror only once Slumbot has shown it, and the
cards of the opponent appear only at showdown, when they are known. Rebuilding avoids any drift between the two
states and makes a retried request trivially safe.

### Modules

- `slumbot/actions.ts`: pure conversion. `parseAction(text)` gives the streets of `{ kind, to? }` with street-level
  amounts; `toEngineActions` replays them on a `Step` and returns engine `Action`s (a street-level `b<n>` becomes
  `raise` to `n` in our terms, a `c` that puts the player all in is `call`); `toIncr(action, step)` turns our
  `Action` back into `k`, `c`, `f` or `b<n>`.
- `slumbot/client.ts`: `createSlumbotClient({ fetch, baseUrl, credentials? })` with `newHand()` and `act(incr)`.
  It keeps the newest token. The API has no way to read the state of a hand, and `act` is not idempotent: if our
  call was applied and Slumbot answered, a resent `incr` can be legal again and play a second action. So a request
  is retried (pauses 1, 2, 4, 8, 16 s) only when it certainly never reached the server: a connection refused or a
  DNS failure. `new_hand` is also retried on 5xx. An `act` that fails in any other way (timeout, reset after
  sending, 5xx) is never resent: the hand is abandoned, logged as abandoned with no result, and the runner starts a
  new hand. Network failures do not depend on the cards, so dropping those hands does not bias the estimate.
  `error_msg` is not retried; it stops the run with the message.
- `mirror.ts`: `mirrorHand({ clientSeatIsBigBlind, holeCards, board, opponentCards?, actions })` returns the
  `Step` and the `EngineEvent`s. Shared by future adapters.
- `runner.ts`: `runExternal({ opponent, hands, strategy, seed, out, resume, delayMs })` plays hand after hand.
  When a hand ends it rebuilds the mirror with every known card, checks that seat 0 won exactly `winnings` chips
  (a mismatch stops the run and keeps the raw response in the log for diagnosis), and appends one line to the
  JSONL file before starting the next hand. `--resume` reads the file, continues the hand numbering and the seed
  sequence, and appends.
- `estimate.ts`: `estimate(lines)` from the JSONL alone: hands, bb/100 and `ci95` with `summarize`-style
  statistics per hand (`v = net / bigBlind * 100`), the same with the all-in EV adjustment, the standard deviation
  per hand, and the projected number of hands for ±10 bb/100.
- `cli.ts`: `npm run arena:external -- --opponent slumbot --hands 2000 --strategy <play file> [--seed 1]
  [--out <file>] [--resume <file>] [--delay-ms 200]` plays; `npm run arena:external -- --report <file.jsonl>`
  only estimates. The default output directory is `resultsDir` of the arena (`web/arena-out` of the main
  checkout), the run name `<strategy>-slumbot-<YYYYMMDD-HHMMSS>`.

### Log line

One JSON object per hand:

```
{
  "record": HandRecord,
  "external": {
    "opponent": "slumbot",
    "clientPos": 0 | 1,
    "action": "b200c/kb400f",
    "holeCards": ["Ah", "Kd"],
    "board": ["Qs", "7h", "2c"],
    "opponentCards": ["9c", "9d"],
    "winnings": -400,
    "baselineWinnings": 200,
    "seed": 1,
    "handIndex": 17
  }
}
```

`record` is a `HandRecord` with `sessionId` `external-<run name>`, `names` `['cfr', 'slumbot']`, `humanSeat` null,
`bot` `{ id: 'cfr-vs-slumbot', version: <strategy file name> }`. The viewer of the arena can show
these records; it is not changed in this task.

### Report

`estimate` prints one line in the arena format and writes a JSON report next to the log:

```
cfr-v2-10 vs slumbot (200 bb): baseline +12.3 ± 6.1, all-in EV +10.1 ± 14.9, raw +11.0 ± 17.0 bb/100 over 41000 hands
```

The report holds `opponent`, `strategy`, `stackBb` (200), `hands`, `abandoned`, `handsByPosition`
(`{ bigBlind, button }`), and for each of `raw`, `allInEv` and `baseline` an object `{ bbPer100, ci95, sdPerHand,
handsFor10 }`, plus `commit` and `handsFile`. The report is a pure function of the log, so a
rerun with `--report` gives the same numbers.

### All-in EV

When both players are all in before the river, the net of the hand is replaced
by its expectation over the remaining board: `pot share * equity - committed`, with the equity of seat 0 enumerated
exactly over every runout with `pheEvaluator` (at most 1,712,304 boards preflop, 990 on the flop, 44 on the turn),
ties split. Exact enumeration keeps the report deterministic. Hands without such an all-in keep their real net.
Returned uncalled chips are already settled by the engine before the all-in point and do not enter the pot.

## Error handling

- Network errors and 5xx: retries as above, or the hand is abandoned; ten abandoned hands in a row stop the run,
  and `--resume` continues from the log. Abandoned hands are lines with `"abandoned": true` and are skipped by
  `estimate`, which prints how many there were.
- `error_msg`: stop with the message; no retry.
- Mirror mismatch or `winnings` mismatch: stop, the raw response is logged. These are adapter bugs.
- An interrupted process loses at most the hand in progress; that hand is not in the log and not in the result.
  Slumbot counts it on its side; that is fine, we never report its numbers.

## Testing

TDD, no network in tests: the client takes `fetch` as a parameter.

- `actions.test.ts`: parsing and the round trip `Action` to `incr` on hand-written strings: limp, 3-bet, 4-bet
  all-in preflop with empty streets, bet and raise on later streets, a short all-in call, check-back river.
- `mirror.test.ts`: the mirror reproduces street, actor, pot and stacks for those strings, and throws on an
  illegal string.
- `client.test.ts`: token rotation, retry only on failures before sending, no retry on `error_msg`, an `act` that
  timed out is never sent twice and abandons the hand.
- `runner.test.ts`: a full run against a fake Slumbot that replays recorded responses
  (`external/fixtures/slumbot/*.json`, recorded once by hand from the live service with the token removed), with
  `always-call` as our bot; the log lines and the `winnings` checks pass; `--resume` appends correctly.
- `estimate.test.ts`: bb/100 and interval on a small known log; the all-in EV on known spots (AA vs KK preflop,
  a flush draw on the turn); the same log gives the same report twice.

## Running

1. A smoke run: `--hands 200` with logging, to record fixtures and check the `winnings` checks pass.
2. A 2000-hand run, then `--report` for the standard deviation and the projected hands.
3. Long runs overnight by the rules of the machine (`nohup` and `caffeinate`), resumed with `--resume` until the
   interval is about ±10 bb/100.
4. The result goes into `solver/RESULTS.md` as a new section with the strategy version, the depth and the commit,
   and into the arena README.

## Out of scope

ACPC and other opponents, AIVAT, a deeper blueprint, changes to the arena viewer, publishing external runs to
`arena-results`.
