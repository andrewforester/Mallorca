# Talk eval

Measures how her lines carry the feeling the game sends: whether a judge reads the intended emotion,
whether a masked or acted state shows the poker face, whether she stays in character and in length,
card leaks before the filter, the player's language, latency and cost.

- `cases.json`: 52 requests, the 12 sandbox scenes plus a calm table, each for Mallorca, Ingrid,
  Lola and Nina, built from the emotion engine by `npm run lab:talk-cases` in `web/`. `cases.md`
  lists them.
- `grade.ts`: the judge prompt and schema, the scoring per kind of feeling and the programmatic
  checks.
- `run.ts`: runs every case through the real `handle` with stubbed storage, then the judge, and
  writes `out/<variant>/results.jsonl`, `traces/` and `errors.jsonl`; it resumes where it stopped.

```
cd supabase/functions/talk/eval
deno run -A run.ts --variant dry --dry oracle
ANTHROPIC_API_KEY=... deno run -A run.ts --variant baseline --model claude-haiku-5-5 --judge claude-sonnet-5-5
```

`--dry oracle` and `--dry null` run without the network and must score about 1 and 0. Every other
run spends money: agree the budget with the owner first. `--only` takes case ids or scene names,
comma separated.
