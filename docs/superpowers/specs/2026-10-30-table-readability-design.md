# Table readability, compact hand log and sound effects

Date: 2026-10-30. Prototype: https://claude.ai/artifact/VEEB6BPvVtg29hK4gUYydn (phone and desktop, seven steps of one
hand).

## Goal

At a glance the player sees who has the button, what each seat has put in on this street, what each seat did last
and whose turn it is. The hand log stops taking space on the table. The game gets short sound effects. The cozy
home game atmosphere of issue #2 stays: no casino chrome.

## What is wrong today

- The street bet is a text pill ("Bet 20") under the name, in the same row as the last action pill, so "Call 10"
  and "Bet 20" sit side by side and read as one thing.
- `Pot` shows `hand.pot`, which already includes the bets of the current street: preflop shows "Pot 30" next to
  "Bet 10" and "Bet 20", the same chips counted twice.
- The dealer button is a small "D" inside the name pill, hard to find on the bot's side.
- `lastActions` resets only when a hand starts, so a preflop "Raise to 40" is still shown on the flop.
- On desktop the hand log is a permanent column that grows to half the screen; on the phone it makes the menu long.

## Decisions

| Question                     | Decision                                                                    |
| ---------------------------- | --------------------------------------------------------------------------- |
| Sound                        | Effects only, no voice                                                      |
| Hand log                     | Behind an icon, a drawer with the current hand grouped by street            |
| How long an action stays     | Until the same seat acts again or a new street starts                       |
| Where the pot sits           | In the centre of the felt, to the left of the board, on the same row         |
| Raise control                | The existing slider and presets, shown above the buttons on the human's turn |

## Part 1: the table

Layout, top to bottom, on both devices (positions as in the prototype):

1. Bot: action bubble, name plaque (name and stack only), hidden cards.
2. Bot street bet: chips with the amount on the felt, between the bot and the board row.
3. Board row in the centre of the felt: the pot block on the left, five board slots on the right. Empty slots are
   faint dashed outlines so the row does not shift when cards arrive.
4. Human street bet: chips with the amount, between the board row and the human's cards.
5. Human: cards, action bubble above the name plaque, name plaque.
6. Raise slider and presets (Half pot, Pot, All-in), only when the human can raise; then Fold, Check or Call,
   Raise or Bet.

Elements:

- **Pot block**: a small chip stack, "Pot N" where N is the chips collected from earlier streets (hidden while N is
  0), and under it "Total M", the pot plus the bets on the felt (shown only while there are bets).
- **Bet chips**: one to three chips and the amount in a dark pill. When a street closes they move into the pot
  (about 300 ms); with `prefers-reduced-motion` they just disappear and the pot updates.
- **Dealer button**: an ivory disc with "D", about 28 px, on the felt next to the button seat's bet spot. It moves
  between hands. It leaves the name plaque.
- **Action bubble**: a pill with a small tail above the name plaque. Passive actions (check, call) are ivory,
  aggressive (bet, raise, all-in) are honey, fold is muted. "Thinking…" uses the same spot in a muted style. The
  bubble stays until that seat acts again and clears when a street is dealt.
- **Turn highlight**: a warm ring with a soft glow around the plaque of the seat to act.
- **Bet versus raise**: an action that opens the betting on a street reads "Bet N", a later one "Raise to N". This
  applies to the bubble, the log and the raise button.

The simple table style (`readTableStyle() === 'simple'`) gets the same elements on its flat felt.

### Data changes in `game`

- `ViewModel.pot` becomes `{ collected, total }`: `collected` is `hand.pot` minus the bets of the current street,
  `total` is `hand.pot`.
- `lastActions` is cleared on every `streetDealt` event, not only when a hand starts.
- `actedLabel` returns a `bet` key when the street had no bet before the action (the blinds count as a bet
  preflop), `raise` otherwise. `handHistory` does the same so the log and the bubble agree. New copy keys:
  `actions.bet`, `log.you.bet`, `log.other.bet`.
- `SeatView` keeps `bet`, `isButton`, `isToAct` and `lastAction`; `ui` only places them differently.

### `ui` changes

- `Seat` renders the plaque and the bubble; new small components `BetChips` and `DealerButton` render on the felt.
- `Pot` takes `{ collected, total }`; `Board` renders five slots. They share one row component on the felt.
- `ActionBar` and `BetSlider` keep their behaviour; the slider row is placed above the buttons on both layouts.
- The `data-testid` contract keeps `bet-<i>` (now on the chips), `action-<i>` (on the bubble), `pot`
  (`data-amount` becomes the total, plus `data-collected`) and adds `dealer-button`.

## Part 2: the hand log

- A log icon button in the status bar, next to Menu, opens the log; the side column on desktop and the log inside
  the menu go away.
- Phone: a drawer from the right over a dim scrim, about 310 px wide. Desktop: a floating panel under the status bar,
  about 380 px wide. Both close with the close button, the scrim (phone), Escape and the icon again.
- Content: the current hand only. A heading per street (Preflop, Flop, Turn, River, Showdown) with the street's
  board cards as small cards and the pot at the start of that street; under it the street's actions as one wrapping
  line of tokens ("Mallorca checks", "You bet 80"), aggressive actions tinted honey. The hand result is the last
  line.
- Lines come from the existing `LogEntry` list, grouped by the `handStarted`, `flop`, `turn`, `river` and `show`
  entries. Grouping is a pure function in `ui` with unit tests.
- Earlier hands stay in the history export; a replayer is a separate task.
- `data-testid`: `hand-log-toggle`, `hand-log` (the drawer). The `coach` slot stays in the layout.

## Part 3: sound effects

- Sounds: card dealt (hole cards and each board card), check (a knock), chips (call, bet, raise, blinds), fold (a
  soft card slide), the human's turn (a short chime), pot won (chips sweep), all-in (a heavier chip push).
- Source: synthesized with the Web Audio API in a `ui/sound/` module (noise bursts and short tones), no audio files
  and no licences. A `SoundPlayer` interface hides it, so recorded samples can replace it later.
- Triggers: `ui` watches the new `LogEntry` items and phase changes after each store update and maps them to sounds;
  `game` does not know about sound. The turn chime plays when the phase becomes `humanToAct`.
- The `AudioContext` is created on the first user gesture (the start buttons), as browsers require.
- A sound toggle in the status bar (speaker icon) and in the menu, stored in `localStorage` as `mallorca.sound`,
  on by default. Volume is fixed and low.
- Tests: the trigger mapping (log entries and phases to sound names) is a pure function with unit tests; the
  player is replaced by a recording fake in component tests.

## Out of scope

Voice, a timer per turn, a hand replayer, chip denominations by amount, avatars.

## Testing

- Unit: `toViewModel` (`collected` and `total`, cleared actions on a new street), `actedLabel` and `handHistory`
  (bet versus raise), the log grouping, the sound trigger mapping.
- Component: `Seat` bubble and plaque, `BetChips`, `Pot`, the log drawer open and close, the sound toggle.
- e2e: the existing specs with the updated test ids; `layout.spec.ts` checks the drawer and the slider fit on all
  three projects without horizontal scroll.
- Contact sheets on phone and desktop looked at before each commit that changes the UI.

## Delivery

Three branches and three pull requests in order: the table (part 1), the log (part 2), the sound (part 3), each
branch created from `origin/master` after the previous one is merged. This spec goes in with the first. Each passes
the full pre-PR checks of `CLAUDE.md`.
