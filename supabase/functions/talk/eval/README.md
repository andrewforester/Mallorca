# Talk eval

Measures her planned lines (version 2): whether a blind judge reads the emotion, the act and the
humour style the plan asked for, whether a line keeps to its word budget, card leaks, repeats, the
player's language, her character over many lines, latency and cost. Version 1 cases stay for the
baseline of the pairwise comparison.

- `cases.json`: 52 version 2 requests, the 12 sandbox scenes plus a calm table, each for Mallorca,
  Ingrid, Lola and Nina, built by `npm run lab:talk-cases` in `web/` with the planner's own
  functions (rules, voice, word budget, humour draw). `cases.md` lists the act, voice, budget and
  humour of each. `presets.json` holds the Big Five of the five presets for the character run.
- `cases.v1.json`, `cases.v1.md`: the version 1 requests of the same scenes, for the baseline.
- `gradePlan.ts`: the blind judge of a planned line (emotion, intensity, act, humour), its scores,
  the confusion matrices, the word budget, the leak and language checks, repeats, the trait judge
  and the pairwise judge. `grade.ts` grades version 1.
- `run.ts`: runs every case through the real `handle` with stubbed storage, then the judge, and
  writes `out/<variant>/results.jsonl`, `traces/` and `errors.jsonl`; it resumes where it stopped.
- `character.ts`: 20 lines for each of the five presets, a judge rates each trait in [-1, 1] from
  the lines alone, and the run prints the correlation with the given traits (after InCharacter).
- `pair.ts`: a judge picks the more natural and fitting line of two variants for each case, with the
  order alternated, and prints the share the second variant wins.
- `examples.ts`: five example lines per act, added to the system block by `--examples on` only.

```
cd supabase/functions/talk/eval
deno run -A run.ts --variant dry --dry oracle
ANTHROPIC_API_KEY=... deno run -A run.ts --variant v2 --repeat 5 --budget 2
ANTHROPIC_API_KEY=... deno run -A run.ts --variant baseline --cases v1 --budget 0.5
ANTHROPIC_API_KEY=... deno run -A run.ts --variant v2-examples --examples on --budget 0.5
ANTHROPIC_API_KEY=... deno run -A run.ts --variant v2-sonnet --model claude-sonnet-5-5 --budget 1
ANTHROPIC_API_KEY=... deno run -A character.ts --variant v2
ANTHROPIC_API_KEY=... deno run -A pair.ts --a baseline --b v2
ANTHROPIC_API_KEY=... deno run -A pair.ts --a v2 --b v2-examples
ANTHROPIC_API_KEY=... deno run -A pair.ts --a v2 --b v2-sonnet
```

`--dry oracle` and `--dry null` run without the network and must score about 1 and 0, for `run.ts`,
`character.ts` and `pair.ts` alike. Every other run spends money: agree the budget with the owner
first. `--only` takes case ids or scene names, comma separated.

`npm run lab:talk-eval-data` in `web/` gathers the runs of `out/` (v2, v2-examples, v2-sonnet,
baseline, the pairs and the character run) into `web/prototypes/talk-eval/report.json`, and
`npm run lab:talk-eval` opens the report page: the summary of each variant, the pairwise picks with
the judge's reasons, the traits read back, the confusion matrices and every line with its plan,
prompt, attempts, checks, verdict and calls.

The whole set above costs about $2 at today's prices: about 580 judge calls on Sonnet 5.5 (about
$0.003 each), 78 line calls on Sonnet 5.5 and about 650 calls on Haiku 5.5 (about $0.0001 each, a
system block of about 650 tokens and a state of about 120).

The humour matrix is thin on these cases: a joke is drawn with a chance of about 0.15, so 2 of the
52 plans carry humour. A set built to cover the four styles is the next step once the first run
shows the rest of the grid.
