---
name: style-check
description: Look with fresh eyes at how her playing style (the bias axes aggression, bluff, tightness, sizing, stickiness) shaped the solver's decisions in a hand history or a single hand, and judge whether the whole makes sense. Use when the owner pastes a history copied from the debug panel, shows a debug panel screenshot with "Sent to the bot" and "Last decision", or asks why a style led to a raise, a call or a fold.
---

# Style check

The tool replays each of her decisions through the same wasm bot the game uses and shows what the blueprint wanted,
what her style made of it, and what each axis does on its own. It does not judge. Judging is your job, and it should
be a fresh judgment of the whole hand, not a list of known rules.

## Input

1. **A copied history.** The debug panel's history copy is PokerStars text with her feelings. After each of her
   decisions it carries a line `  ~ style: aggression 0.78 bluff 0.66 tightness 0.74 sizing 0.83 stickiness 1.44`.
   Save the pasted text to a file in the scratchpad as it is.
2. **A single hand from a screenshot or a description.** Write the hand in the same format and give her style on the
   command line; the values of "Sent to the bot" in the debug panel are her style. Template (the button posts the
   small blind and acts first before the flop; `bets X` and `raises Y to X` give the street total in X):

   ```
   PokerStars Hand #1: Hold'em No Limit (10/20) - 2026/11/10 12:00:00 UTC
   Table 'Mallorca' 2-max Seat #2 is the button
   Seat 1: You (2000 in chips)
   Seat 2: Mallorca (2000 in chips)
   Mallorca: posts small blind 10
   You: posts big blind 20
   *** HOLE CARDS ***
   Dealt to You [Kh Qd]
   Dealt to Mallorca [5c As]
   Mallorca: raises 20 to 40
   You: calls 20
   *** FLOP *** [Ah 9h 4c]
   You: bets 30
   Mallorca: calls 30
   ```

   Her cards are required; the player's may be left out, the board only as far as it was dealt.

## Run

From `web/`, after `source ~/.nvm/nvm.sh && nvm use`:

```
npm run style-check -- <file>
npm run style-check -- <file> --her Mallorca --style aggression=0.78,bluff=0.66,tightness=0.74,sizing=0.83,stickiness=1.44
```

`--model v1` replays with the phone strategy, the default `v2` with the desktop one; use the one she played with
(ask if unsure). The command builds the wasm first, so the Rust toolchain of `solver/` is needed. The report has,
per decision, the moves with the blueprint, her style and every non-neutral axis alone, and the move she played in
bold.

## Judge it

Read the hand as a story before the numbers: who she is in this hand (her style, and her feelings in a copied
history), what she held, what the player did, how it ended. Then, decision by decision:

- What did the blueprint want, and how sure was it?
- What did her style change, and which axis did it? Compare the "alone" columns with the style column.
- Does the change fit her style as a person would read it? A cautious mood that raises more, a sticky mood that
  folds more, a bold one that suddenly checks a strong hand: say so.
- Do the axes act on the decisions they are meant for, or does one reach into another's (an axis of folding that
  changes the size of a bet, an axis of betting that changes how often she folds)?
- Is the move she played plausible under her style, or a rare draw? A move far below its share is worth naming.

Then the whole hand: does the line hang together across the streets, does it read like one character, would a
player across the table recognize her style from it? Note what surprised you even if you cannot call it wrong.

To explain why an axis did what it did, read the current code rather than relying on memory, since the mechanics
change: `solver/crates/core/src/bot/bias.rs` (fold, check and size shifts), `solver/crates/core/src/bot/bluff.rs`
(bluffing) and the "Biased and talking bots" part of `web/tools/arena/README.md`.

## Report to the owner

Answer in the owner's language. Start with a short verdict on the whole hand, then the decisions that matter with
their numbers (blueprint, her style, the axis that moved it), then anything that looks off and why. If something
looks like a bug, say what you would test to confirm it and propose it as its own task; do not change the code
from this skill.
