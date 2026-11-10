---
name: style-check
description: Check how her playing style (the bias axes aggression, bluff, tightness, sizing, stickiness) changed the solver's decisions in a hand history or a single hand. Use when the owner pastes a history copied from the debug panel, shows a debug panel screenshot with "Sent to the bot" and "Last decision", or asks why a style led to a raise, a call or a fold.
---

# Style check

Replays each of her decisions through the same wasm bot the game uses and shows, per decision, the blueprint, her
style, and each axis alone, then checks the rules the axes must keep.

## Input

1. **A copied history.** The debug panel's history copy is PokerStars text with feelings. After each of her
   decisions it carries a line `  ~ style: aggression 0.78 bluff 0.66 tightness 0.74 sizing 0.83 stickiness 1.44`.
   Save the pasted text to a file in the scratchpad as it is.
2. **A single hand from a screenshot or a description.** Write the hand in the same format and give the style on the
   command line. Template (the button posts the small blind and acts first before the flop; `bets X` and
   `raises Y to X` take the total of the street in X):

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

   Her cards are required; the player's may be left out (`Dealt to` only for her), the board only as far as it was
   dealt. The values of "Sent to the bot" in the debug panel are her style.

## Run

From `web/`, after `source ~/.nvm/nvm.sh && nvm use`:

```
npm run style-check -- <file>
npm run style-check -- <file> --her Mallorca --style aggression=0.78,bluff=0.66,tightness=0.74,sizing=0.83,stickiness=1.44
```

`--model v1` replays with the phone strategy, the default `v2` with the desktop one; pick the one she played with
(the hand record's `bot.version`, or ask). The command builds the wasm first, so the Rust toolchain of `solver/` is
needed. It prints a Markdown report: per decision the moves with blueprint, her style and every non-neutral axis
alone, the move she played in bold, and the flags.

## The rules

Each axis acts on one decision. A flag `Error` is a broken rule and a bug in `solver/crates/core/src/bot/bias.rs`
(or `bluff.rs`); a flag `Note` is worth explaining, not fixing.

| Rule | Meaning |
| --- | --- |
| `fold-direction` | Facing a bet, tightness (before the flop) and stickiness (after it) move only the fold: tightness below 1 and stickiness above 1 fold less, the other side folds more. |
| `fold-kept` | Aggression, bluff and sizing never change the fold share: the fold with the whole style equals the fold with the two fold axes alone. |
| `aggression-direction` | Where she can check, aggression below 1 bets less and above 1 bets more. Facing a bet it only splits the call from the raises. |
| `sizing-total` | Sizing only moves mass between the bet sizes of the tree (and scales the chips by its fourth root); fold, check, call, all-in and the total of the raises stay. |
| `bluff-facing` | Bluff acts only where she is checked to after the flop, on weak hands; never facing a bet. |
| `unlikely-choice` (note) | The move she played had under 5% with her style: a rare draw, or the record and the replay disagree (another strategy, another style). |
| `large-move` (note) | A move changed by 25 points or more; the note names the axis that moved it most. Large moves are expected near a fold or check boundary and at the edges 0.5 and 2. |

Background for explaining a result:

- The fold axes move the log odds of continuing in the spot (`widened`), so a balanced spot moves most and a spot
  where she almost always folds or continues moves little; hands are ordered by the blueprint's own fold (or check)
  share at that node, so the hands nearest the spot's boundary move first.
- A loose shift moves the freed folds into the call; a tight one scales the call and raises down together.
- Fold or check shares within 10% of pure are training noise; the axis purifies them gradually, fully from about
  tightness 1.07 or stickiness and aggression 1.13.
- The columns "axis alone" show what that axis does with the others at 1; the style column is all of them together.
  Facing a bet the fold of the style column equals the fold-axes column; the split of the rest comes from
  aggression and sizing.

## Report to the owner

Answer in the owner's language. Start with the verdict (rules kept or which one broke), then for the decisions that
matter: what the blueprint wanted, what her style made of it, and which axis did it, with the numbers. For a broken
rule, give the decision, the numbers, and propose a fix as its own task: a failing test in
`solver/crates/core/src/bot/tests.rs` on the shipped strategy first, then the fix.
