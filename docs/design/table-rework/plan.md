# Table rework (#125) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the desktop table so the hand reads at a glance: a light green theme, one seat block for both
players, bets and dealer button in a fixed column, the pot beside the board, no top bar, and her face in the attic.

**Architecture:** Four pull requests, in order, each from a freshly fetched `origin/master` after the previous one
merged. Colours are tokens in `web/src/ui/styles/tokens.css`. The seat block is a rewrite of `Seat.tsx` with the
same props. The top bar keeps its React tree and moves by CSS on wide screens. The scene adds two image layers
around the existing face in `FaceFrame` (`Table.tsx`).

**Tech Stack:** Preact + TypeScript, plain CSS per layer, Vitest + Testing Library, Playwright (e2e and
`npm run contact`), three.js avatar.

**Spec:** `docs/design/table-rework/spec.md` (reference image `desktop-flop.jpg`).

## Global Constraints

- Node: `source ~/.nvm/nvm.sh && nvm use` in `web/` before npm.
- Before every commit: `npm run lint`, `npx tsc --noEmit`, `npm test`. Before each PR also `npm run test:golden`,
  `npm run build`, `npm run test:e2e`; free ports with `E2E_PORT=4810` and `CONTACT_PORT=4811` if needed.
- TDD: the failing test first. Never weaken a test; a test that pins the old design changes in its own commit,
  with the spec line it follows in the message.
- No comments in code or CSS. ESLint limits: 400 lines per file, 60 per function, depth 3, complexity 12,
  4 parameters, no import cycles.
- UI copy: no all-caps words, no dashes as sentence punctuation.
- The `data-testid` contract in `ARCHITECTURE.md` stays; ids move with their elements.
- After each UI change: `npm run contact`, look at `web/e2e/contact/desktop.png` and `phone.png` once each.
- Commits: conventional, scope = layer (`feat(ui): ...`), branch checked with `git branch --show-current`.
- Phones are not redesigned here: they get the new colours and the new seat block in the current phone layout.

## Review Focus

1. **Long numbers:** stacks like `123 456` and bets of 5 digits must not overflow the 136 px block or push the bet
   column; expect the block to grow and the bet to stay in its column.
2. **All-in and showdown:** her shown cards replace the backs in the same place; the strip shows `All-in`; the win
   chips still fly to the right seat.
3. **Thinking:** while she thinks, the strip shows the muted thinking text and never a stale action.
4. **Face off:** with Her face off in Settings the room photo with the empty chair shows, the layout does not jump.
5. **Phone width:** the new seat block and colours must not overflow 360 px wide screens.

---

### Task 1: Light colour tokens (PR 1, branch `feat/125-colours`)

The spec and this plan ride in this PR (cherry-pick the commits of `design/125-table-rework`).

**Files:**
- Modify: `web/src/ui/styles/tokens.css` (the `:root` block; delete the `@media (prefers-color-scheme: dark)` block)
- Modify: `web/src/ui/styles/actions.css` (Raise, Call, Fold buttons)
- Test: `web/src/ui/contrast.test.ts`

**Interfaces:**
- Produces tokens used by later tasks: `--color-bg #faf8f4`, `--color-surface #ffffff`, `--color-border #e4e2da`,
  `--color-text #1f2a24`, `--color-muted #646e68`, `--color-accent #2f7a52`, `--color-accent-text #ffffff`,
  `--color-action #3f7f5c`, `--color-action-text #ffffff`, `--color-action-edge #2a5c41`, `--color-paper #1f2a24`,
  `--color-paper-text #ffffff`, `--color-card-face #ffffff`.

- [ ] **Step 1: Write the failing tests** in `contrast.test.ts`: add `['color-action', 'color-action-text']` to
  `pairs`, and a test `it('has one theme')` asserting `css.includes('prefers-color-scheme')` is `false`.
- [ ] **Step 2:** `npx vitest run src/ui/contrast.test.ts`. Expected: FAIL (`color-action` missing, dark block present).
- [ ] **Step 3:** set the values above in `:root`, add the three `--color-action*` tokens, delete the dark block.
  Give the other checked tokens light values that pass 4.5:1: `--color-felt #2f7a52` with `--color-felt-text #ffffff`,
  `--color-danger #a8402e` with `--color-danger-text #ffffff`, `--color-her-surface #ffffff`,
  `--color-coach-surface #eef4f6` with `--color-coach #2d5f73` and `--color-coach-text #1f3a45`,
  `--color-surface-alt #f1efe9`, `--color-faint #8a918c` (captions only, not in `pairs`),
  `--color-hairline rgba(31, 42, 36, 0.08)`, `--color-outline rgba(31, 42, 36, 0.3)`,
  `--color-slot-border #e4e2da`, `--color-overlay rgba(31, 42, 36, 0.35)`, shadows at a third of their opacity.
- [ ] **Step 4:** in `actions.css` restyle `.action-raise`, `.action-passive`, `.action-fold` (the classes of the
  three buttons; check the exact names in `ActionBar.tsx`): background `var(--color-action)`, colour
  `var(--color-action-text)`, `min-height: 64px`, `font-size: 19px`, `font-weight: 700`, label left and key hint
  right, the key hint in a 1 px `currentColor` box with radius 4 px, `box-shadow: 0 3px 0 var(--color-action-edge)`.
- [ ] **Step 5:** `npx vitest run src/ui/contrast.test.ts` and `npm test`. Expected: PASS.
- [ ] **Step 6:** `npm run contact`; look at both sheets. Every screen is light, nothing light-on-light.
- [ ] **Step 7: Commit** `feat(ui): one light theme with green accents (#125)`, open PR 1.

### Task 2: Seat block, bet column, pot beside the board (PR 2, branch `feat/125-seat-block`)

**Files:**
- Modify: `web/src/ui/Seat.tsx` (rewrite the markup, same `SeatProps`)
- Modify: `web/src/ui/ActionBubble.tsx` (only the root class: `seat-strip` added next to `bubble-<kind>`)
- Modify: `web/src/ui/styles/table.css`, `web/src/ui/styles/table-wide.css`
- Test: `web/src/ui/Seat.test.tsx` (create), `web/src/ui/Table.test.tsx`

**Interfaces:**
- Consumes: Task 1 tokens.
- Produces the markup later tasks and e2e rely on:
  `section.seat[data-testid=seat-<i>] > .seat-cards + .seat-block + .seat-side`;
  `.seat-block > .seat-name + .seat-stack[data-testid=stack-<i>] + (ActionBubble as .seat-strip)`;
  `.seat-side > .dealer-slot (DealerButton or empty) + BetChips`.

- [ ] **Step 1: Write the failing tests** in `Seat.test.tsx` (render `Seat` with a `SeatView` fixture from
  `Table.test.tsx` helpers):
  - `keeps a dealer slot when the seat is not on the button`: `.dealer-slot` exists, `dealer-button` absent.
  - `puts the dealer button in the slot when on the button`: `.dealer-slot [data-testid=dealer-button]` exists.
  - `shows the stack under the name`: `.seat-block` children in order `.seat-name`, `.seat-stack`.
  - `shows the last action as the strip of the block`: with an action entry `{ key: 'bet', params: { amount: 60 } }`,
    `.seat-block [data-testid=action-0]` has class `seat-strip` and text `Bet 60`.
  - `shows no strip without an action`: `action: null`, `thinking: false` gives no `.seat-strip`.
  - `shows thinking in the strip`: `thinking: true` gives `.seat-block [data-testid=thinking-1]`.
  - `keeps long stacks inside the block`: stack `123456` renders in `.seat-stack` (layout covered by e2e below).
- [ ] **Step 2: Write the failing test** in `Table.test.tsx`: `shows no action strip after the blinds`: a fresh
  hand's view model gives no `action-0` and no `action-1`, and `bet-0`, `bet-1` show the blinds.
- [ ] **Step 3:** `npx vitest run src/ui/Seat.test.tsx src/ui/Table.test.tsx`. Expected: FAIL on the new structure.
- [ ] **Step 4:** rewrite `Seat` as above. Her backs and your faces both use `Cards`; for `position="top"` cards come
  first and are 50 × 70 px, for `"bottom"` 56 × 80 px; cards 3 px apart. Fold strip: class `bubble-fold` styled with
  `--color-border` fill and `--color-text`; other strips `--color-accent` fill and `--color-accent-text`; thinking
  strip `--color-muted` text on `--color-surface-alt`.
- [ ] **Step 5:** CSS in `table.css` / `table-wide.css` (wide screens):
  - `.seat` is a three-column grid `1fr auto 1fr` with `.seat-cards` and `.seat-block` in the middle column,
    `.seat-side` in the right one, its left edge at the column centre + 74 px (dealer slot 36 px, gap 16 px, bet).
  - `.seat-block`: `--color-surface`, 1 px `--color-border`, radius 12 px, `min-width: 136px`, centred text, name
    13 px muted, stack 17 px semibold, `box-shadow: 0 -3px 10px rgba(60, 40, 20, 0.18)`, `margin-top: -4px` over
    the cards, strip `margin: 6px -12px -6px`.
  - Her cards: `margin-top: -45px` so they overlap the face frame; `z-index` above the frame.
  - `.dealer-button`: 36 px, `--color-paper` fill, `--color-paper-text`, 16 px bold. Chip: 28 px circle,
    `--color-accent` fill, 4 px `--color-surface` ring; amount 24 px semibold.
  - `.board-row`: pot pill left of the board, vertically centred; board slots 62 × 86 px, gap 14 px; the row centred
    between her block and your cards (equal margins).
- [ ] **Step 6:** `npx vitest run` for both files. Expected: PASS. Then `npm test`.
- [ ] **Step 7: e2e** in `web/e2e/table.spec.ts`: `bets of both seats share one column` (wide viewport: the
  `bet-0` and `bet-1` boxes have the same `x` within 2 px after both post blinds) and `a long stack stays in its
  block` (set `stack-0` text to `123 456` via `evaluate`; the `.seat-block` box contains the `stack-0` box).
  Run `E2E_PORT=4810 npm run test:e2e -- table.spec.ts --trace off`. Expected: PASS.
- [ ] **Step 8:** `npm run contact`; check showdown and all-in frames in the sheet (Review Focus 2) and phone width
  (Review Focus 5).
- [ ] **Step 9: Commit** `feat(ui): one seat block for both players with a fixed bet column (#125)`, open PR 2.

### Task 3: No top bar on wide screens (PR 3, branch `feat/125-no-top-bar`)

**Files:**
- Modify: `web/src/ui/styles/status.css`, `web/src/ui/styles/table-wide.css`
- Test: `web/e2e/layout.spec.ts`

**Interfaces:**
- Consumes: `.status-bar`, `.status-info`, `.status-actions` from `StatusBar.tsx` (unchanged).

- [ ] **Step 1: Write the failing e2e** `wide screens have no top bar`: at 1440 × 900 the `.status-bar` box is
  inside the `.table-right` box horizontally, has no visible bottom border, and the `face-frame` top is within
  32 px of the viewport top.
- [ ] **Step 2:** run it. Expected: FAIL.
- [ ] **Step 3:** in the wide-screen media query of `status.css`: `.status-bar` positioned over the top of the right
  column (same left edge and width as `.table-right`, 28 px from the top), no border, transparent background;
  `.status-info` as two lines (`hand-number` first, then blinds and result), 13 px muted; Log and Menu as outlined
  buttons on `--color-surface`. In `table-wide.css` the table no longer reserves the 64 px header row; the face frame
  starts 24 px from the top and keeps 680 × 440 px.
- [ ] **Step 4:** run `layout.spec.ts`. The existing `.status-bar` overflow test still passes unchanged; if a test
  asserts the old full-width bar on wide screens, change it in its own commit quoting spec §1.
- [ ] **Step 5:** `npm test`, `npm run contact`. Menu and Log open their layers correctly on both sheets.
- [ ] **Step 6: Commit** `feat(ui): hand line, Log and Menu in the right column on wide screens (#125)`, open PR 3.

### Task 4: Her face in the attic (PR 4, branch `feat/125-attic-scene`)

**Files:**
- Create: `web/src/ui/scene/attic-portrait.webp` (`git show 905e327^:web/src/ui/scene/attic-portrait.webp`)
- Modify: `web/src/ui/Table.tsx` (`FaceFrame`)
- Modify: `web/src/ui/styles/face.css`
- Modify: `web/src/ui/avatar/stage.ts` (`frameHead`, `addLights`), only if the framing needs it
- Test: `web/src/ui/Table.test.tsx`, `web/e2e/face.spec.ts`

**Interfaces:**
- Produces: `FaceFrame` renders `img.face-room` (the photo), then the face, then `img.face-rail` (the same photo,
  `clip-path: inset(48.4% 0 0 0)`), all inside `[data-testid=face-frame]`.

- [ ] **Step 1: Write the failing tests** in `Table.test.tsx`: `puts her in the attic` (with a face, the frame holds
  `.face-room`, the face node, `.face-rail` in that order) and `shows the empty room with the face off` (without a
  face, `.face-room` is present, no `.face-rail` hiding nothing, `face-frame-off` class kept).
- [ ] **Step 2:** run. Expected: FAIL.
- [ ] **Step 3:** restore the photo and render the layers. Both images `alt=""`, `aria-hidden`, `object-fit: cover`;
  the room layer and the rail layer use the same transform so the rail lines up: scale 1.3 about `50% 33%`,
  positioned so the rail is at the bottom edge of the 680 × 440 frame.
- [ ] **Step 4:** align her with the chair: adjust `frameHead` distance and height (or a CSS offset of the face
  canvas) until, on the contact sheet, her head sits over the chair back and the rail hides her below the chest,
  matching `desktop-flop.jpg`. Raise the warm key light in `addLights` (or `toneMappingExposure`) to the middle level
  of `scene-light-levels.jpg`. No CSS filters on the canvas.
- [ ] **Step 5:** `npx vitest run src/ui/Table.test.tsx`, `npm test`. Expected: PASS.
- [ ] **Step 6: e2e** in `face.spec.ts`: `the rail is drawn over her face` (the `.face-rail` box is inside the
  `face-frame` box and its computed `z-index` is above the canvas). Run it. Expected: PASS.
- [ ] **Step 7:** `npm run contact`; show the desktop sheet to the owner before the PR (Review Focus 4: face off).
- [ ] **Step 8: Commit** `feat(ui): her face in the attic, behind the table rail (#125)`, open PR 4.

### After the four PRs

A short design step for phones (spec §6), then its own plan.
