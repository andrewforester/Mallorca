# Golden harness

Runs the original Java bot and equilator and writes the fixtures the TypeScript port must match.

```bash
bash web/tools/golden/run.sh
```

The script works from any directory. It compiles `src/golden/*.java` with `javac --release 8` from `JAVA_HOME`
(default: the Android Studio JBR) into `build/`, pulling the Java modules `Tools`, `MallorcaCore`,
`MallorcaEquilator` and `MallorcaBrains` from the source path, runs `golden.GoldenMain`, then formats the output
with Prettier. Two runs produce byte-identical files.

## Outputs

| File                                             | Content                                                 |
| ------------------------------------------------ | ------------------------------------------------------- |
| `src/brains/fixtures/decisions.json`             | Decisions of the Java math bot, at least 40 per street  |
| `src/brains/fixtures/preflop-strength-java.json` | The 169 by 169 preflop strength table the Java bot uses |

### `decisions.json`

`{ id, observations, legal, evByAction: { fold, passive, aggressive }, chosen, java }`.

- The bot is built by `NLMathBotFactory(new UniformRandomAdvisor()).createBot(...)`, so the same villain model
  feeds the profit calculator and the villain spectrum observer. `UniformRandomAdvisor` answers fold, passive,
  aggressive with 1/3 each when the player faces a bet, otherwise 0, 1/2, 1/2.
- Games run through `GameEngine.playGame()` against `ScriptedOpponent`, which picks among the actions legal in the
  TypeScript engine with a seeded `Random`: facing a bet it folds, calls or raises with 1/3 each, otherwise it
  checks or bets with 1/2 each; sizes are a min raise, half pot, three quarters pot, pot or all in.
- `observations` are the bot's view of the current hand up to the decision, in the `Observation` shape of the
  brains layer. The Java bot keeps no state across hands.
- `legal` is computed from the Java game state with the TypeScript engine rules.
- `evByAction` holds the mean of each `RandomVariable` in the `ActionDistribution` the `EVAdvisor` computed;
  a class the solver did not consider is `null`.
- `chosen` is the action after `NLActionPreprocessor`; a raise is `{ kind: 'raise', to }`, the bot's street total.
- `java` carries the Java engine's street, pot, amount to call, bankroll at risk, big blind, the bet size the solver
  evaluated for the aggressive class and the raw Java action, for debugging only.
- A hand is left out when the Java engine and the TypeScript rules disagree on stacks, bets or pot, or when the
  bot's action is not legal under the TypeScript rules. `GoldenMain` prints the counts and the reasons.
- The current fixtures leave out two hands. In both, the bot faces a bet while the villain's remaining stack is
  smaller than a min raise; `Action.createRaiseAction` then goes all in for the effective stack, so the raise ends
  below the TypeScript `raise.min`.

### `preflop-strength-java.json`

`PreflopEquilatorImpl` reads `PreflopStrengthTable.array` (`PREFLOP_STRENGTH_TABLE_PATH`, `preflop.eql`, is only read
by `createFromFile()`, which the bot never calls). The array is 170 by 170; row and column 169 hold only `-1`, so
the fixture keeps indices 0 to 168.

- Ranks map to `2 → 0, 3 → 1, … , A → 12`. A hand of ranks `hi ≥ lo` has index `hi * 13 + lo`. Suits are ignored:
  `AKs` and `AKo` share index 167, `22` is 0, `32` is 13, `AA` is 168.
- 91 indices are used. Cells where the row or the column is not of the form `hi * 13 + lo` are `-1`.
- `table[hero][villain]` is the share of showdowns hero wins, ties counting half, over all 5-card boards, with hero
  holding clubs and diamonds and villain hearts and spades (`PreflopTableGenerator`). The lower triangle is
  `1 - strength` of the mirrored cell.
- The values in the code are the values of `preflop.eql` truncated to two decimals (`Math.floor(x * 100) / 100`),
  so `table[i][j] + table[j][i]` can be 0.99.

## Changes to the Java path

- `src/mallorcatour/equilator/SpectrumEquilatorImpl.java` shadows the original. The one change: the dead-card
  checks of `strengthVsSpectrum` test a `deadCards` array holding only the hero and board cards, instead of the
  reused `allHeroCards` array whose turn and river slots keep stale cards from earlier villain combos; a river still
  skips the current enumerated turn. Flop and turn strengths now equal exact enumeration.
- `src/mallorcatour/bot/math/StrengthManager.java` shadows the original. The one change: on the flop and turn each
  hole-card combo gets its own `StreetEquity` (`withStrength`) holding the cached potentials and draw of its rank
  pair and its own strength, instead of writing its strength into the cached object shared by every combo of that
  rank pair. The rank-pair potential cache stays.
- Randomness: `GameEngine` and `Advice` draw from the static `Random` in `UniformRandomizer`, seeded with
  `System.nanoTime()`. `DecisionHarness` replaces that field by reflection with `new Random(seed)` before each game.
  The villain model is never sampled: `UniformRandomAdvisor`'s advice throws if `getAction()` is called.
- `DecisionHarness` wraps the `EVAdvisor`'s `IProfitCalculator` by reflection to read each `ActionDistribution`
  without changing it.
