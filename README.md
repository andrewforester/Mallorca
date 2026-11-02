# Mallorca

Heads-up No-Limit Texas Hold'em in the browser, against Mallorca, a poker bot that weighs every action by its
expected profit.

## The game

You and the bot start a tournament with 2000 chips each. Blinds start at 10/20 and rise every 10 hands. The last
player with chips wins.

- Press "Start tournament". You sit at the bottom of the table, the bot at the top.
- On your turn, fold, check or call, or raise. The raise slider runs from the minimum raise to all-in, with
  presets for half the pot, the pot and all-in.
- The bot keeps its cards face down until a showdown. A short tag next to each seat shows the last action, and
  the hand log lists every action, street and result.
- Keyboard: `F` folds, `C` checks or calls, `R` raises, the arrow keys move the raise amount.
- It plays on a phone in portrait and on a desktop in landscape, with the hand log at the side.

## The bot

The bot is a TypeScript port of the Mallorca math bot. It tracks a range of hands for its opponent from the
actions it sees, computes the equity of its own hand against that range, and solves the remaining game tree for
the expected profit of folding, calling and raising. On recorded situations the port makes the same decisions as
the Java original in this repository.

## Table talk

Against the CFR bot, Mallorca can talk: she comments on the hand and answers what you write, in character, and her
mood follows the session and shifts her style a little. It needs a small Supabase backend; without it the game plays
as before and the chat stays hidden. The setup is in `supabase/README.md`.

## Build

The game lives in `web/` and needs Node 24.

```bash
cd web
npm ci
npm run dev        # local server
npm test           # unit tests
npm run build      # static site in web/dist
```

The Java modules at the root are the original bot, kept as an archive and as the reference for the golden tests.
`CLAUDE.md` describes how to work in the repository, `ARCHITECTURE.md` the layers and their contracts.
