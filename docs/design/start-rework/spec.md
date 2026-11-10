# Start screen rework (#152): spec

Agreed with the owner on 2026-11-10 from localhost mockups (variant B1, the scene at the table scale). It replaces
the start screen part of `docs/design/redesign/spec.md` and uses the system of `docs/design/table-rework/spec.md`:
its colour tokens (§5) and, on phones, its grid, margins, touch targets and type scale (§6).

The problem it solves: the start screen was only recoloured. It had a large empty band on wide screens, a plain dark
backdrop instead of the room, a black and an outlined button that did not match the table, and on phones it did not
fit one screen.

Out of scope: choosing her personality (#127) and the loading of the solver and her face (#126). The character cards
keep their content; this screen gives them a frame for up to ten characters.

## 1. Wide screens

One column, 1200 px wide at most, centred, 24 px from the top.

- **No heading.** The `Tonight` title is removed.
- **Scene**: 1200 × 440 px, radius 26 px. The attic and her live face exactly as at the table (same scale, same
  rail at the bottom edge, so starting a game does not change her size). The room photo is narrower than the frame:
  at the sides the same photo continues as a soft layer, scaled up, blurred and darker, and the sharp room fades into
  it over its outer edges. When the face is off, the frame shows the same room with the empty chair and her name.
- **Her line** in the speech bubble at the bottom left of the scene: her greeting, or `Sleep well.` after leaving.
- **Under the scene**, 32 px below it, two columns with a 40 px gap, aligned at the bottom:
  - left: `Who's at the table tonight?` (13 px, muted) and the character cards in rows of five;
  - right, 320 px: the line `Heads-up hold'em, just the two of you. No money, no account needed.` (14 px, muted),
    then the main button and the second button.
- **Character card**, compact: the name (18 px, display font) and how hard she is (12 px, muted, accent when chosen)
  on one line, the description under them (12.5 px, muted). White surface, radius 12 px, the chosen one with an accent
  border and the her-surface fill. Five per row, so ten characters take two rows.
- **Main button**: `Sit down` (19 px bold) with `Cash game, 100 big blinds` under it (13 px), styled as the table
  actions: `--color-action` fill, white text, 64 px high, 3 px step shadow `--color-action-edge`.
- **Second button**: `Play a tournament`, 48 px, white surface, 1 px border, main text colour.
- The seed line is removed from this screen (it stays in the menu).
- Debug only choices (opponent, coach) and the solver loading line sit in the right column above the buttons.
- After leaving: the line becomes `The table will be here.` under `Sleep well.`.

## 2. Phones

Portrait screens. Everything on one screen, no page scroll.

1. **Scene** without a frame, full width, 316 px high, fading into the page over its last quarter, as at the table.
2. **Her line** in the bubble, overlapping the bottom of the scene, 16 px from the left.
3. `Who's at the table tonight?`, then the character cards in one row that scrolls sideways (snap, 16 px side
   padding, cards 150 px wide); the next card shows partly, so the row reads as scrollable.
4. The heads-up line (13 px, muted).
5. At the bottom: `Sit down` (56 px) and `Play a tournament` (44 px), 8 px apart, 16 px margins, 34 px from the
   bottom edge (`env(safe-area-inset-bottom)` when larger).
