# Working in this repository

- The Java modules at the root are an archive and the reference for the golden tests; they are not modified.
  Development happens in `web/`, a TypeScript browser game, and in `solver/`, a Rust CFR trainer with its own
  rules in `solver/CLAUDE.md`. The npm rules below apply to `web/`.
- Node: `source ~/.nvm/nvm.sh && nvm use` before any npm command; the version comes from `web/.nvmrc` (24).
  Run npm commands from `web/`. `npm test`, `build`, `dev` and `arena` first build `solver/crates/wasm` with cargo,
  so the Rust toolchain of `solver/` must be installed.
- Read `ARCHITECTURE.md` before adding a module, crossing a layer or changing a contract; it is the contract.
- Before every commit: `npm run lint`, `npx tsc --noEmit`, `npm test`. When `src/brains` or `src/equity` changes,
  also `npm run test:golden` (674 decisions of the Java bot, about 40 s).
- Before a PR: `npm run lint`, `npx tsc --noEmit`, `npm test`, `npm run test:golden`, `npm run build`,
  `npm run test:e2e`. CI runs the same checks on every pull request that touches `web/`.
- `npm run bench` is the timing check of the hand evaluator; it is not part of `npm test` and runs on demand.
- Ports: `npm run test:e2e` previews on 4173 and `npm run contact` on 4174. When several worktrees run them at once,
  choose free ports with `E2E_PORT=4810 npm run test:e2e` and `CONTACT_PORT=4811 npm run contact`.
- TDD: the failing test comes first, then the code.
- Fix the code, not the rule: never weaken a test, delete an assertion, loosen a tolerance or add an
  `eslint-disable`, an ignore, a suppression or a baseline. A rule changes only in its own commit.
- No comments in code or config, in any language.
- Code size and shape, enforced by ESLint on every non-test file in `src`: at most 400 lines per file (blank lines
  and comments not counted), 60 lines per function, nesting depth 3, cyclomatic complexity 12, 4 parameters, and
  no import cycles (`import-x/no-cycle`). Over a limit, split the code: a helper, a module, an options object.
- UI copy: no all-caps words, no em or en dashes as sentence punctuation.
- Arena: `npm run arena -- --a math --b always-call --pairs 2000` plays duplicate pairs between two bots over worker
  threads and prints bb/100 with a 95% interval (`web/tools/arena/README.md`).
  Every run is saved to `web/arena-out` of the main checkout (shared by all worktrees). `npm run arena:ui` browses
  them locally; `npm run arena:publish -- <run>` copies a run into the committed `web/arena-results/`, served at
  `<site>/arena/`.
- Screenshots: `npm run contact` builds, plays a seeded game and writes one contact sheet per device,
  `web/e2e/contact/phone.png` and `web/e2e/contact/desktop.png` (gitignored). After a UI change, look at each
  sheet once, as one image, before committing.
- Visual design: the brief is GitHub issue #2 (https://github.com/andrewforester/mallorca/issues/2).
- Git: one branch and one worktree per task, created from a freshly fetched `origin/master`. Atomic conventional
  commits with the layer as scope (`feat(engine): ...`, `refactor(brains): ...`, `docs: ...`). Run
  `git branch --show-current` before committing. Never push to `master`. Each task ends with a pull request; PRs
  are squash-merged, and only on the owner's confirmation.
- Deploy: `.github/workflows/web-deploy.yml` builds `web/` with `BASE_PATH=/mallorca/` and publishes `web/dist`
  to GitHub Pages on every push to `master` that touches `web/`. GitHub Pages is not enabled for the repository;
  the owner enables it (source "GitHub Actions"), and from then on the game is served at
  https://andrewforester.github.io/mallorca/.
- Vercel: `.github/workflows/web-vercel.yml` builds `web/` and deploys `web/dist` to production on every push to
  `master` that touches `web/`, and on a manual run from `master`. A preview is never automatic: run the workflow by
  hand from another branch (Actions, "Deploy web to Vercel", Run workflow, or
  `gh workflow run web-vercel.yml --ref <branch>`). The Vercel project is not connected to Git; the workflow needs the
  repository secrets `VERCEL_TOKEN`, `VERCEL_ORG_ID` and `VERCEL_PROJECT_ID`.
