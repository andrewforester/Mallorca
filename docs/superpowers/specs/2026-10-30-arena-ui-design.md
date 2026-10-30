# Arena viewer

A local web page that shows the arena runs already played: the list of reports, the cumulative result of a run,
where the result comes from and the hands themselves. Matches are still started from the command line.

## Goal and success

- Every `npm run arena` saves its report and its hands without extra flags, in one place shared by all worktrees.
- `npm run arena:ui` opens a page that lists every saved run with bots, bb/100, the 95% interval, hands, seed,
  commit and date.
- For a run with hands: the cumulative result of bot A over the pairs, the result split by position, by the street
  of the last action and by showdown, and a sortable list of hands where each pair of the duplicate opens side by
  side as PokerStars text.
- Nothing of it reaches the game bundle. Runs published with `npm run arena:publish` are shown at
  `<site>/arena/`.

## Decisions

1. **Shared results directory.** The default directory is `web/arena-out` of the main checkout, found from
   `git rev-parse --git-common-dir` (its parent is the main checkout). Worktrees come and go, so a directory inside
   the worktree would lose the history. When git is not available the default is `arena-out` under `web/` of the
   current checkout. `--dir <path>` on the CLI and `ARENA_DIR` on the viewer override it. The directory stays
   gitignored.
2. **Saving by default.** Without `--out` the report goes to `<dir>/<a>-<b>-<pairs>-s<seed>-<stamp>.json`, where
   `stamp` is the UTC start time as `YYYYMMDD-HHMMSS`, so a run never overwrites another. Without
   `--save-hands` the hands go next to it with the extension `.jsonl`. `--no-hands` skips the hands. `--out` and
   `--save-hands` keep their meaning and override each path.
3. **Report fields.** The report gains `finishedAt` (ISO time) and `handsFile`, the hands path relative to the
   report's directory, or `null`. Reports written before this change have neither; the viewer takes the file's
   modification time and a `.jsonl` with the same base name.
4. **Viewer as a second Vite app.** `web/tools/arena/ui/` holds its own `index.html`, a Preact entry and
   `vite.config.ts` with a plugin that adds two routes to the dev server:
   - `GET /api/runs`: every `*.json` report in the directory, newest first, with its hands file and its size;
   - `GET /api/hands?file=<name>`: streams one `.jsonl` file of the directory. Names with a path separator or
     `..` and files outside the directory answer 404.
   The plugin's file logic lives in a plain module tested in Node. The game's `vite.config.ts` and its build are
   untouched.
5. **Parsing in a Web Worker.** The worker fetches the hands file, parses it line by line and keeps the raw lines.
   For every hand it derives a summary: pair index, A's seat, A's position (button or big blind), A's net in
   chips, the street of the last action (an all-in preflop that runs out the board counts as preflop), showdown or
   not, final pot. It answers the summaries once and a raw
   record on request. A 47 MB file of 40 000 hands parses in a few seconds without blocking the page.
6. **Who is A.** In `match.ts` hand `k` of pair `i` has `handNumber = 2i + k + 1`, the button on seat 0, A on seat 0
   when `k = 0` and on seat 1 when `k = 1`. The viewer uses the hand number, not the names, so `math` against
   `math` works too.
7. **Analysis as pure functions** (`analysis.ts`), tested with Vitest:
   - `pairNets`: A's net per pair; their mean as bb/100 must equal the report's `bbPer100`, otherwise the page
     shows a mismatch warning (a hands file from another run);
   - `cumulative`: the cumulative A net in big blinds over pairs, reduced to at most 600 points by taking every
     n-th pair and the last;
   - `slices`: hands, total big blinds and bb/100 per hand for A in each group: position, street of the last
     action (preflop, flop, turn, river) and showdown or not. Slices carry no interval: the duplicate pairing that
     narrows the run's interval does not hold inside a slice, and the page says so;
   - `sortHands`: by A's absolute net or by final pot, filtered by position, street and showdown.
8. **Hand view.** A row of the list is a pair. Opening it shows both hands of the pair as `toPokerStars` text, A's
   net in each and the pair's net. The viewer imports `src/game/records/pokerstars.ts` and `record.ts` directly,
   like the arena does, and nothing from `ui`.
9. **Page.** One screen, built for a desktop browser and readable on a phone: a run list on top, the selected run
   below with the chart (inline SVG), the slice tables, the hand list paged by 50 and the pair panel. Plain system
   fonts, light and dark from `prefers-color-scheme`. English copy inside the components, no all-caps words, no
   dashes as punctuation. It is a developer tool, so it does not use the game's i18n.

## Public viewer

10. **Publishing chosen runs.** `npm run arena:publish -- <run>` takes a report by file name in the results directory
    or by path, and writes `web/arena-results/<name>.json` and `<name>.jsonl.gz` (gzip level 9) next to it, then
    rewrites `web/arena-results/index.json`, the `RunEntry` list of that directory. The published report carries
    `finishedAt` (taken from the file time for older reports) and `handsFile` (`<name>.jsonl.gz`, or `null`). With
    no argument the command only rewrites the index, which is how a run is unpublished after deleting its files. It
    prints the bytes added. The directory is committed; a 20 000 pair run is about 2.2 MB.
11. **Static build.** `npm run build` also builds the viewer into `dist/arena/` with base `<BASE_PATH>arena/` and
    `web/arena-results` as its public directory, so the page is `<site>/arena/` on Vercel and on GitHub Pages. The
    game's config and bundle do not change.
12. **Data source.** In development the page reads `/api/runs` and `/api/hands?file=`; in the build it reads
    `index.json` and the published files under its base. The worker fetches bytes and gunzips them with
    `DecompressionStream` when they start with the gzip magic bytes, so a host that already decoded the file with
    `Content-Encoding: gzip` works too.
13. **First publication.** The runs already played are published in the same pull request; they become public only
    when it is merged.

## Out of scope

Starting matches from the page, a graphical table replay, comparing two runs on one chart, uploading runs anywhere
but the repository.

## Testing

- CLI (`cli.test.ts`): the default paths under `--dir`, `--no-hands`, the new report fields, the existing tests
  pointed at a temporary `--dir` so they no longer write into the repository.
- `resultsDir` in Node: main checkout from a worktree, fallback without git, override.
- Server module: listing with old and new reports, rejected names, missing hands file.
- `analysis.ts`: A's seat and net from records of a real `playPair`, pair nets against `summarize`, slices,
  cumulative reduction, sorting and filters.
- Components with Testing Library under happy-dom: the run list, the mismatch warning, the pair panel.
- A manual check in a browser on the existing `cfr-math-20000` run.

## Files

```
web/tools/arena/
  paths.ts                 resultsDir, default file names
  cli.ts, run.ts           new flags and report fields
  publish.ts, publishCli.ts
                           arena:publish
  ui/
    index.html, main.tsx, vite.config.ts
    server.ts              list runs, resolve hands files (Node)
    analysis.ts            pure analysis
    hands.worker.ts, worker client
    source.ts              dev server API or published files
    App.tsx and components
```

`web/arena-results/` holds the published runs and `e2e/arena.spec.ts` opens one at `/arena/`. `package.json` gains
`arena:ui` and `arena:publish`, and `build` also builds the viewer; `vitest.config.ts` runs `tools/**/*.test.tsx`
in the happy-dom project; `ARCHITECTURE.md`, `CLAUDE.md` and `tools/arena/README.md` describe the viewer, the
publishing and the new defaults.
