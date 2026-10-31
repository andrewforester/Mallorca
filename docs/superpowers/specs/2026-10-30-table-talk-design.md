# Table talk

Mallorca talks with the player during the game (#23). She knows her own cards and speaks like a person at a home
game: sometimes she hints at her hand honestly, sometimes she lies, and she has habits a player can learn to
read. The player can write to her, and the words move her mood, which shifts her style a little. A future
coach (#5) will be a second role on the same foundation; it is not part of this design.

## Goal and success

- With the Solver opponent, Mallorca comments on the game by herself and answers what the player writes, in
  character, in one or two sentences, without naming her cards.
- Whether she speaks and whether a hint is honest are decided by code with known frequencies, not by the model.
  A "Tells" setting (Obvious, Subtle, Hidden) sets how much her habits depend on the strength of her hand.
- Her mood follows the session (streaks, bad beats, caught bluffs) and the player's words, and it shifts the CFR
  bot's style within a fixed bound. Her words never decide a move.
- The arena measures what this costs and that it works:
  - the most tilted style loses at most 5 bb/100 against the plain `cfr` bot;
  - a "reader" bot that uses her talk wins against `cfr-talk-obvious` by more than the 95% interval above what it
    wins against `cfr-talk-hidden`.
- The game never waits for the talk. Without the server, or with talk switched off, the game plays as today.
- She remembers the player across sessions through a few facts stored per user.

## Decisions

1. **Code decides, the model words.** The pure layer `web/src/talk` decides when she speaks, the intent of a line
   and her mood, deterministically through `Rng`. The server only turns facts and an intent into words, and turns
   the player's words into signals. The arena can therefore measure the mechanics without a model.
2. **Strength class from equity, not from the blueprint.** `talk` classifies her hand as `strong`, `medium` or
   `weak` by its equity against a random hand, computed with `equity` (exact on the river, seeded Monte Carlo
   with 400 samples earlier). Preflop: strong at 0.62 and above, weak below 0.45. Postflop: strong at 0.75 and
   above, weak below 0.45. This keeps `talk` independent of the WASM module and works when the bot leaves the
   tree.
3. **Habits.** A habit table gives, for a situation and a strength class, `speak` (the chance she says something)
   and `honest` (the chance a hint tells the truth when she speaks). Situations: `herBet` (she bets or raises),
   `herCall` (she checks or calls), `playerBet` (the player bets or raises into her), `handWon`, `handLost`.
   The base profile:
   - after her own bet: strong 0.2 speak and 0.3 honest, medium 0.35 and 0.5, weak 0.6 and 0.2 (she chatters and
     fakes confidence when she bluffs, and goes quiet with a monster);
   - facing a bet: strong 0.4 and 0.2 (she acts doubtful), medium 0.4 and 0.7, weak 0.3 and 0.6;
   - after her check or call: 0.2 and 0.5 for every class;
   - hand won: 0.5; hand lost: 0.4; a caught bluff (she lost a showdown with a weak hand after betting) 0.9.
   A line that is not a hint is `neutral`. A dishonest hint shows the opposite class (`strong` and `weak` swap,
   `medium` shows either with equal chance).
4. **Tells levels.** `obvious` uses the profile as it is. `subtle` moves every `speak` and `honest` halfway to the
   neutral value, and `hidden` 90% of the way. The neutral `speak` of a situation is the mean over its classes,
   and the neutral `honest` is 0.5, so on `hidden` her words say almost nothing about her hand. The level is a
   preference, `subtle` by default.
5. **Pace.** At most one unprompted line per street and none in the 1.5 s after a previous line. Her mood raises
   or lowers `speak` by up to a quarter (`cheer` and `tilt` make her talk more, low `cheer` less), the same for
   every class so the tells keep their shape. A reply to the player is always produced.
6. **Mood.** Four axes in [-1, 1]: `cheer`, `confidence`, `tilt`, `caution`, plus `form`, an exponential mean of
   her net result per hand in big blinds over about 20 hands (`form = 0.95 form + 0.05 net / 10`, clamped).
   - After each hand the fast axes decay by 0.7, then the outcome applies: a won pot of more than 10 bb adds
     `confidence` 0.15 and `cheer` 0.1; a lost one subtracts them. Luck, the chips won minus her all-in equity
     times the pot, counts separately: a bad beat of more than 10 bb adds `tilt` 0.3 and subtracts `cheer` 0.2.
     A caught bluff adds `tilt` 0.2 and subtracts `confidence` 0.2.
   - Signals from the player's words: `tease` `tilt` +0.2; `compliment` `cheer` +0.1, `tilt` −0.1;
     `claimStrength` `caution` +0.15; `claimWeakness` `caution` −0.1; `mockBluff` `tilt` +0.3; `friendly`
     `cheer` +0.1.
   - `form` is not added to the axes: the style reads it (decision 7) and the prompt describes it as a streak.
7. **Style from mood.** `aggression = 1 + 0.5 tilt + 0.1 (confidence + form)`, `bluff = 1 + 0.8 tilt`,
   `tightness = 1 + 0.2 caution − 0.1 cheer`, each clamped: aggression to [0.8, 1.6], bluff to [0.8, 1.8],
   tightness to [0.85, 1.2]. The first clamps, aggression to 1.25 and bluff to 1.3, lost -0.2 ± 2.6 bb/100 to the
   fixed `cfr` blueprint but moved her bet and raise frequencies after the flop by less than 3 percentage points, so
   tilt was not visible in her play (arena README, "Is tilt noticeable"). The clamps were widened to aggression 1.6
   and bluff 1.8, and the tilt coefficients with them (0.25 to 0.5, 0.3 to 0.8) so that a fully tilted mood reaches
   the corner. The steeper coefficients also make a mild negative tilt reach the floor of 0.8 sooner (bluff at tilt
   −0.25, aggression at tilt −0.4 with neutral confidence and form). The arena checks their cost (goal above); if
   the most tilted style costs more than 5 bb/100 against `cfr`, the clamps narrow before the game uses them.
8. **Style in the CFR bot.** `mallorca-core::bot` gets `Style { aggression, bluff, tightness }`, neutral by
   default. In `decide`, between `probabilities` and `sample`, the weights of the node are reweighted in `f64`:
   bets, raises and all-ins times `aggression`, checks and calls divided by it, fold times `tightness`, and on the
   turn and river bets and raises from buckets in the lowest 35% also times `bluff`. A neutral style takes the
   existing path, so the blueprint is unchanged byte for byte. WASM: `bot_style(bot, aggression, bluff, tightness)`.
   TS: `CfrBot.setStyle`, and the worker's `decide` request carries an optional `style`, because the worker builds
   a new brain every hand. The math bot ignores it. The subgame solver branch (#16) will apply the same reweighting
   to its own distribution when it lands; that is not in this design.
9. **Arena.**
   - Styled bots: `cfr-tilted` (aggression 1.6, bluff 1.8, tightness 0.85), `cfr-confident` (1.15, 1, 0.95) and
     `cfr-cautious` (0.9, 0.9, 1.2), the corners of the clamps.
   - Talking bots `cfr-talk-obvious`, `cfr-talk-subtle` and `cfr-talk-hidden`: the plain `cfr` bot plus the habits
     of their level. They emit `spoke` after their own bet or raise. Mood needs a session, which the arena does not
     have (each hand builds fresh bots), so these bots use a neutral mood; the mood dynamics are covered by unit
     tests.
   - `ArenaBot` gains an optional `heard(spoke: boolean)`. The match loop passes what one bot said to the other.
   - `reader`: the math bot, except when it faces a bet. If the opponent spoke after betting, it turns a math fold
     into a call when the call is at most half the pot; if the opponent was silent, it turns a math call into a
     fold. It exploits the base profile's habit of chatter when bluffing.
   - `tilt-exploiter`: the math bot, except that facing a bet or raise it turns a math fold into a call when the call
     is at most half the pot (the pot including the bet), and it turns a math bet or raise with a weak strength class
     into a check or call. It does not know her mood; the cost of tilt is its result against `cfr-tilted` minus its
     result against `cfr` with the same seed (arena README, "Is tilt noticeable").
10. **Server on Supabase.** A `supabase/` directory at the root: `config.toml`, migrations and the Edge Function
    `talk` in Deno. The player signs in anonymously with supabase-js on first load, invisibly; a real sign-in screen
    is a later project, and an anonymous user can be linked to an account later without losing data.
11. **Edge Function `talk`.** `POST` with the user's JWT and a JSON body of one of three kinds:
    - `line`: facts of the hand (street, board, pot, stacks, the actions so far, her hole cards marked as secret),
      the intent (`situation`, `hint` or `neutral`, honest or not), the mood in words and the last eight lines.
      Answers `{ text }`.
    - `reply`: the same facts and the player's text. The function runs two model calls in parallel: one returns
      the signals as strict JSON, one writes her answer. Answers `{ text, signals }`.
    - `summary`: the session summary (hands, net, notable player moves, the signals heard). The model compresses
      it into at most three short facts, stored in `memories`. Answers `{ facts }`.
    The answer is not streamed: a line is one or two sentences, the card filter needs the whole text, and the
    client shows it with a typewriter effect.
12. **Model and prompt.** `claude-haiku-5-5` by default, `TALK_MODEL` overrides it. The fixed part of the prompt
    (character, rules, habits of speech) is a cached system block; the facts, memories and recent lines follow.
    Her character: warm, wry, competitive, a friend at a kitchen-table game, not a casino dealer. Rules in the
    prompt: one or two sentences; never name or describe her exact cards; play the hint she is given; take her tone
    from the mood; no all-caps words and no dashes as punctuation; answer in the language of the player's last
    message, or the interface language when the player has not written.
13. **Card filter.** A pure function rejects text that names a card or her exact holding: rank and suit tokens
    (`Ks`, `K♠`, `king of spades`), "I have" or "I've got" with a rank or a hand category. A rejected text is
    regenerated once with a stricter instruction; if it fails again, a fixed neutral line from a short list takes
    its place.
14. **Memory.** Table `memories (id, user_id, fact, created_at)`. The ten newest facts of the user go into every
    prompt. The client sends a `summary` when the player leaves the table or every 50 hands.
15. **Limits.** `consume_call(user_limit, global_limit)` is a security-definer function that counts calls per user
    and day and in total per day, in one transaction, and returns false over a limit. Defaults: 200 calls per user
    and 5000 in total per day, from `TALK_DAILY_LIMIT` and `TALK_GLOBAL_DAILY_LIMIT`. Over a limit she stays
    silent. Quick phrases do not call the model for signals (decision 17), but her answer to them does.
16. **Storage and RLS.** `talk_lines (id, user_id, session_id, speaker, text, created_at)` keeps the conversation;
    `memories` as above; `usage (user_id, day, calls)` and `usage_total (day, calls)`. RLS lets a user read their
    own lines and memories only; inserts go through the function with the service role. The model key lives in
    the function's secrets.
17. **Game integration.** `game` holds the talk state in the session store: the chat lines, the current bubble per
    seat, the mood and the tells level. Engine events go to `talk` after they reach the bot. When `talk` returns a
    line request, `game` calls the talk client without waiting; a line that arrives after its street has ended is
    dropped. `say(text)` and `quick(id)` send the player's words; quick phrases (`niceHand` → compliment,
    `bluffing` → mockBluff when said after her bet, otherwise tease, `notThisTime` → claimStrength) carry their
    signals. Before each bot decision `game` sends the current style with the `decide` request.
18. **Talk client.** `game/talkClient.ts` defines `TalkClient` with `line`, `reply` and `summary`. `remoteTalkClient`
    uses supabase-js with `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`; without them, or when anonymous sign-in
    fails, `game` uses `silentTalkClient` and the UI hides the chat. Every call has a 5 s timeout and turns errors
    into `null`.
19. **UI.**
    - A bubble above Mallorca's plaque shows her line with a typewriter effect and fades after 7 s, or when a new
      line replaces it. The player's message shows as a small bubble at the player's plaque. No animation under
      `prefers-reduced-motion`.
    - Desktop: the side panel gets two tabs, Log and Chat. Chat holds the conversation, three quick phrases and an
      input that sends on Enter (at most 200 characters).
    - Phone and short screens: a chat button at Mallorca's plaque opens a bottom sheet with the same chat. Closed,
      only the bubbles show.
    - Settings: "Table talk" on or off and "Tells" (Obvious, Subtle, Hidden), both kept in `localStorage`. Talk
      off: she is silent and the player's words cannot reach her, so only hand outcomes move her mood.
    - Talk exists only with the Solver opponent, since only the CFR bot has style knobs.
    - The empty `coach` slot stays for #5.
20. **Records.** `RecordedDecision` gains an optional `style`, so a hand history shows how tilted she was. The
    record version stays 1; old records have no field.
21. **Deployment.** The owner creates the Supabase project, enables anonymous sign-ins, sets the secrets
    (`ANTHROPIC_API_KEY`, limits) and deploys the function with the CLI; `supabase/README.md` lists the steps.
    The two deploy workflows pass `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` from repository variables; when
    they are empty the build has no talk.

## Out of scope

Voice, a sign-in screen, hand history on the server, the coach (#5), the style profiles and checkpoints of #11
(this design only adds the knobs), talk with the math bot, mood in arena sessions, and the subgame solver's use of
the style.

## Testing

- `talk`: Vitest and fast-check. Intent frequencies converge to the profile; on `hidden` they do not depend on the
  class within 0.05; mood stays in [-1, 1] and decays; the style stays inside the clamps for any sequence of
  signals and outcomes; the pace rules hold.
- `solver`: each knob moves its probabilities in its direction; a neutral style returns the same move as before
  for every draw on random spots (property test); the WASM build exports `bot_style`.
- Edge Function: Deno tests with a fake model and a fake database: prompt assembly, the card filter on a table of
  phrases in English and Russian, the retry and fallback, limits, and malformed requests. `supabase/tests` holds
  pgTAP tests for RLS and `consume_call`, run in CI with the local Supabase stack.
- `game`: session tests with a fake talk client: lines are requested at the right moments, stale lines are
  dropped, style reaches `decide`, errors keep the game going.
- e2e: Playwright with the Supabase endpoints routed to fakes: the bubble, the chat tab, the bottom sheet on a
  phone, quick phrases, talk off, and a failing server.
- Arena: the runs named in the goal, recorded in the PR.
- Contact sheets for phone and desktop with a bubble and the open chat.

## Files

- `solver/crates/core/src/bot/style.rs`, `bot/mod.rs`, `solver/crates/wasm/src/lib.rs`
- `web/src/cfr/model.ts`, `brain.ts`
- `web/src/talk/`: `strength.ts`, `habits.ts`, `intent.ts`, `mood.ts`, `style.ts`, `talk.ts`, `summary.ts`,
  `index.ts`
- `web/src/game/`: `talkClient.ts`, `session.ts` and its helpers, `workerProtocol.ts`, `workerHandler.ts`,
  `botClient.ts`, `records/record.ts`, `viewModel.ts`
- `web/src/ui/`: `Bubble.tsx`, `Chat.tsx`, `ChatSheet.tsx`, `SidePanel.tsx`, `Settings.tsx`, `preferences.ts`,
  `locales/en.json`
- `web/tools/arena/`: `bots.ts`, `match.ts`, `reader.ts`
- `supabase/`: `config.toml`, `migrations/`, `functions/talk/`, `tests/`, `README.md`
- `.github/workflows/`: `talk-ci.yml`, and the variables in `web-deploy.yml` and `web-vercel.yml`
- `ARCHITECTURE.md`: the `talk` layer and the server
