# Table rework (#125): spec

Agreed with the owner on 2026-11-09 from localhost mockups. It replaces the table part of
`docs/design/redesign/spec.md`. The start screen, end panels, menu, log and settings are not covered here; they
follow in their own steps and only pick up the new colour tokens.

The problem it solves: on the shipped table the owner could not tell who did what, how much was bet, or the pot.

Reference: `desktop-flop.jpg` (the agreed desktop screen, flop, she bet 60, you to act) and `scene-light-levels.jpg`
(the scene; the middle level is the chosen one).

## 1. Screen structure (wide screens)

Three columns as now: an empty left column, the centre column (680 px), the right column (316 px).

- **No top bar.** The status bar is removed from the layout. Its content moves to the top of the right column:
  the hand number and the blinds with the session result as two lines of small muted text on the left
  (`Hand 1`, `Blinds 10/20 · 0.0 bb`), the Log and Menu buttons on the right, as small outlined buttons.
  The test ids `hand-number`, `blinds`, `session-result`, `hand-log-toggle` stay on the moved elements.
- **Centre column, top to bottom:** the scene (§2), her seat (§3), the board row (§4), your seat (§3).
  The board row is centred vertically between the bottom of her seat block (with its action strip) and the top of
  your cards.
- **Right column:** the raise box (size presets, slider) stays as it is, only recoloured (§5). Below it Raise,
  Call, Fold in the same order, restyled: all three in one colour, a muted green fill (`--color-action`) with white
  text (`--color-action-text`), 64 px high, 19 px bold label on the left, the key hint (`R`, `C`, `F`) in a
  small outlined box on the right, and a 3 px step shadow under each button (`--color-action-edge`).
  They sit at the bottom of the column.

## 2. The scene

- The face frame keeps its place and size: 680 × 440 px, radius 26 px, at the top of the centre column (24 px from
  the top of the screen).
- Inside it: the attic photo that shipped before #101 (`web/src/ui/scene/attic-portrait.webp`, recovered from git,
  commit before `905e327`) as the room, and her live 3D face drawn on top of it. The renderer already clears to
  transparent (`web/src/ui/avatar/stage.ts`), so the photo shows through.
- She sits in the armchair opposite: the head over the chair back, the shoulders behind the table rail.
  The rail of the photo is drawn again over her (a second layer of the same photo, clipped to the part below the
  rail), so the table hides her below the chest.
- Camera: closer than the photo's own framing. The mockup scales the photo about 1.3 × around her face; the rail
  sits at the bottom edge of the frame, the window, the garland and the candles stay in view.
- Light on her: the middle level of `scene-light-levels.jpg`. A warm key light from the front, so her face is a bit
  brighter than the room and her expressions read, without looking cut out. Tuned in the avatar's own lighting,
  not with CSS filters.
- The photo is upscaled for this frame and looks soft. Acceptable for the first step; a larger render of the same
  room is a follow-up.
- When the face is off (Settings, Her face), the frame shows the same room photo with the empty chair.

## 3. Seat block (the same for her and for you)

One component for both seats, mirrored around the board:

- **Cards** centred on the column axis, 3 px apart. Their bottom edge tucks a few px under the block below them.
  - Her cards: card backs, 50 × 70 px, raised so they overlap the bottom edge of the scene by about 45 px, as if
    lying on her edge of the table. Back pattern: diagonal stripes in the accent colour with a white border.
  - Your cards: faces, 56 × 80 px.
- **Block** under the cards, centred: white surface, 1 px border, radius 12 px, min width 136 px, a soft shadow
  upwards over the cards. Two lines: the name (13 px, muted) and the stack under it (17 px, semibold).
- **Last action** as a strip at the bottom of the same block, full width, accent background, white text
  (`Bet 60`, `Raise to 180`, `Call 60`, `Check`, `Fold`, `All-in`). It shows only after a real action of this
  street; posting a blind shows nothing. `action-<i>` and its classes stay on the strip.
  Fold uses a neutral strip instead: border colour fill, main text colour.
- **Thinking** keeps its current text, shown in the strip in a muted style.

## 4. Bets, dealer button, pot, board

- **Bets** sit to the right of the cards, on the cards' vertical centre, in one column for both seats
  (x = column centre + 126 px). A flat chip (28 px circle, accent fill, white ring) and the amount (24 px semibold).
  No stacks of chips, no 3D. `bet-<i>` stays. Her bet stays below the scene edge.
- **Dealer button**: 36 px circle, dark fill, white `D`, left of the bet column (its centre at column centre + 92 px), next to
  the seat that has it. The slot is reserved for both seats, so bets never shift.
- **Pot**: a pill to the left of the board, vertically centred on it: muted `Pot` and the total (20 px semibold).
  `pot` with `data-amount` and `data-collected` stays.
- **Board**: five slots, 62 × 86 px, 14 px gap, centred on the axis; empty slots dashed.
- Collecting bets into the pot at the end of a street keeps its current animation, with the new positions.

## 5. Colours: one light theme

One light theme. The dark block in `tokens.css` is replaced by the same light values, so the system dark mode no
longer changes the screen.

| Token | Value | Use |
|---|---|---|
| `--color-bg` | `#faf8f4` | page background |
| `--color-surface` | `#ffffff` | seat blocks, pot pill, raise box, Log and Menu buttons |
| `--color-border` | `#e4e2da` | borders, empty board slots, slider track |
| `--color-text` | `#1f2a24` | main text |
| `--color-muted` | `#646e68` | names, captions, `Pot`, hand and blinds line |
| `--color-accent` | `#2f7a52` | action strip, chips, card backs, selected size preset |
| `--color-accent-text` | `#ffffff` | text on the accent |
| `--color-action` | `#3f7f5c` | Raise, Call and Fold buttons |
| `--color-action-text` | `#ffffff` | their labels and key hints |
| `--color-action-edge` | `#2a5c41` | the step shadow under them |
| `--color-paper` | `#1f2a24` | dealer button (dark filled) |
| `--color-paper-text` | `#ffffff` | text on it |
| `--color-card-face` | `#ffffff` | card faces, with a hairline edge and a soft shadow |

Checked contrast: text on bg 14.0:1, accent text on accent 5.2:1, button text on button 4.8:1, muted on surface 5.3:1 and on bg 5.0:1.
`contrast.test.ts` keeps its pairs; tokens it checks that this table does not use (felt, coach, her surface,
danger) get light values that pass it.

Suit colours stay four-colour and unchanged. Clubs (`#2f7a4a`) are close to the accent; they stay as they are
unless the owner asks otherwise after the colour step.

## 6. Phones

Agreed on 2026-11-10 from localhost mockups at 390 × 844 (`phone.jpg`). Portrait screens narrower than they are
tall. Everything stays on one screen: no sheet, no scroll.

### 6.1 Layout, top to bottom

1. **Scene** without a frame: the attic with her live model across the full width, 316 px high, fading into the
   page background over its last quarter. Her head sits in the upper third of the screen.
2. **Hand line** over the scene, under the system status bar: `Hand 1 · 10/20` on the left, Log and Menu on the
   right, light text with a soft shadow.
3. **Her seat**: card backs overlapping the bottom of the scene, her block, the action strip; her bet to the
   right of the block.
4. **Board**: five slots centred.
5. **Your seat**: your cards centred, your block tucked under them; the pot pill on the left at the height of your
   cards. On the right of your cards, in one column: your bet on top (level with the top third of your cards), the
   dealer button 16 px below it. The bet slot is kept when you have no bet, so the dealer button never moves.
6. **Raise sizing**, always visible: three presets (`½ pot`, `Pot`, `All-in`, each with its amount), then the
   slider with − and + buttons.
7. **Actions**: Fold, Call, Raise in one row; Raise shows the chosen size (`Raise` / `to 180`).

### 6.2 Spacing (8 pt grid)

| Where | px |
|---|---|
| Side margins (presets, slider, actions, pot) | 16 |
| Her block with strip → board → your cards | 24 each |
| Your block → presets | 16 |
| Presets → slider | 8 |
| Slider → actions | 16 |
| Between buttons in a row | 8 |
| Actions → bottom edge (home indicator) | 34 (`env(safe-area-inset-bottom)` when larger) |
| Your cards tuck under your block | 6 |

### 6.3 Touch targets (Apple 44 pt, Material 48 dp)

| Control | Size |
|---|---|
| Fold, Call, Raise | 56 high, equal widths |
| Presets | 44 high, equal widths |
| − and + | 44 × 44 |
| Slider thumb | 20 visible, 44 hit area |
| Log, Menu | 44 hit area |

### 6.4 Type scale: 12 · 14 · 16 · 18 · 20 · 24

| Text | px |
|---|---|
| Names, captions, preset amounts, `Pot` label | 12 |
| Hand line, action strip, preset labels | 14 |
| Stacks, pot amount, Log, Menu | 16 |
| Action buttons (size line under Raise 12) | 18 |
| Bet amount by the chip | 20 |
| Board cards / your cards | 24 / 28 |

### 6.5 Sizes and radii

- Board cards 52 × 73, your cards 62 × 87, her backs 40 × 56, gaps 8 (board) and 4 (hole cards).
- Seat block 128 × 52, strip 24 high. Chip 24, dealer button 32, pot pill 32 high.
- Radii: 12 for blocks, presets and ±; 14 for action buttons; the pot pill is fully round.

### 6.6 Shorter phones

Below 844 px of height only the scene shrinks (down to 200 px); the table, raise sizing and actions keep their
sizes and spacing.

## 7. Order of work

Each step is a branch from `origin/master` and a pull request, with `npm run contact` sheets checked before commit.

1. **Colours:** new light tokens, `contrast.test.ts` green, every screen recoloured as is.
2. **Seat block and bets:** the new seat component, bet column, dealer slot, pot left of the board, board centring.
   Unit tests for the strip (no strip on blinds, strip text per action) and for the reserved dealer slot.
3. **No top bar on wide screens:** hand line, Log and Menu in the right column; e2e ids unchanged.
4. **Scene:** restore the attic photo, transparent face over it, rail overlay, camera and light on her.
5. **Phone layout:** §6.

## 8. Constraints that stay

- The release scope of #119: solver only, the five characters, no coach or talk by default.
- The `data-testid` contract in `ARCHITECTURE.md`; ids move with their elements, none is dropped.
- UI copy: no all-caps words, no dashes as sentence punctuation.
- Her face is never covered by layers or panels.
