# One perception of her hand and one decision of what she acts, stage 2

Stage 1 (`2026-11-01-persona-core-design.md`) moved her live state into `persona`. Two pieces of her are still
decided twice, apart from her feeling:

- **How strong her hand is.** Her emotions read her equity against the player's range, narrowed by the blueprint.
  The speech habits, the face's stance and the bluff appraisal read a second class, `strengthOf`, from equity
  against a random hand. After a raise narrows him to strength she fears for her top pair, yet her face keeps
  hiding a strong hand and her words hint at one.
- **What she acts.** The face acts from a stance (`bluff`, `hide`) with its own efforts; the words lie from a table
  of honesty rates drawn at random; the prompt's mask uses a third effort. The tells setting (`obvious`, `subtle`,
  `hidden`) then moves the words, and only the words, toward unreadable, so a cold player with a stone face can
  still give her hand away in chat.

This stage makes both one decision of the persona, read by the face, the words and the voice alike. How readable
she is comes from her personality and her state (her mask), not from a setting.

## Her strength class

`persona.strength()` and the `strength` of a `Moment` become the class of her perceived equity: her equity against
the player's range while his cards are hidden, the same number the engine's hope and fear follow. The thresholds stay
those of `strengthOf`: strong at 0.62 and more preflop and 0.75 and more after the flop, weak under 0.45, medium
between. At `handEnded` it is the class on the last board before his cards were shown, so a showdown does not turn
her into a certain winner or loser after the fact.

The bluff appraisal at the hand end (`bluff` caught or through) and `bluffCaught` read this class. `strengthOf`
against a random hand stays only where a hand other than hers is judged: the player's shown bluff
(`playerBluffShown`) and the arena's bots. Her class draws no samples of its own any more, so her generator's
sequence changes and a seeded session plays the same hands but sends other lines.

## What she presents

The persona decides `Presenting`, or null when she acts nothing:

| Stance  | When                                                                 | She shows | Effort |
| ------- | -------------------------------------------------------------------- | --------- | ------ |
| `bluff` | she bet or raised on this street with a weak class, until the street or the hand changes | `strong`  | 0.6    |
| `hide`  | otherwise, while her class is strong in a live hand                   | `weak`    | 0.5    |

`PersonaView` gains `presenting` (`{ stance, shows, effort }` or null) and `mask`,
`maskOf(traits.mask, effort or 0, overload)`: the share of her feeling she hides right now. The stance of stage 1
is `presenting?.stance`.

- **Face.** `faceFrame(snapshot, presenting, look)` takes the effort from `presenting` and the acted face from its
  stance (`bluff` acts confident, `PAD (0.2, 0, 0.6)`; `hide` keeps a neutral face). Its mask is the view's `mask`.
  `STANCES` keeps only the acted faces.
- **Words.** A hint is still drawn with the chance 0.7 on her bets, calls and the player's bets and never at a hand
  end. A drawn hint is the truth with the chance `1 - mask` (what leaks through), otherwise what she presents, or no
  hint when she presents nothing: she lies in words only while she acts. The chance to speak is the habit of the
  situation and her class moved toward the class-blind mean by `mask`, times her speak factor, so a masked player
  speaks alike with any hand. The habits keep only the chance to speak.
- **Prompt.** `feelingState` sends the view's `mask` as `shows.mask`, the same number the face uses, and
  `acting` as before (the hint of a false line).
- **Voice.** The prosody already reads the face's shown point, so it follows.

The player's range arrives from the worker after the bot's next decision. A line drawn at the player's raise
therefore reads her class, what she presents and her mask from before his raise narrows him, and her face changes a
moment later, when the range arrives. Holding the line until the range answers would let the bot's next action
overtake it, so this stage accepts the lag: the line is her first reaction to the raise, the face her second
thought.

## The tells setting goes

The select in the settings, the preference `mallorca.tells` (no longer read or written), `SessionOptions.tells`,
`setTells`, `ConversationState.level` and the view model's level go, with their locale keys. The arena keeps its
bots `cfr-talk-obvious`, `cfr-talk-subtle` and `cfr-talk-hidden`; their readability becomes a number, 0, 0.5 and
0.9, the values the levels had, passed to `habitsAt(habits, readability)`.

## Testing

- Persona: her class follows a narrowed range (a raise that narrows him to sets moves her top pair from strong to
  weak); `bluff` after her weak bet until the street changes; `hide` on a strong class and not after a narrowing that
  makes it weak; `mask` equals `maskOf` with the effort; the class at `handEnded` ignores his shown cards.
- Face: `faceFrame` with `presenting` gives the same mask as the view; `bluff` acts confident, `hide` neutral.
- Words: with mask 1 every drawn hint of an acting persona is what she presents and no hint of a non-acting one is
  given; with mask 0 every drawn hint is the truth; the speak chance with mask 1 is the same for every class.
- Prompt: `shows.mask` equals the face's mask for the same moment.
- Session: no `tells` in options, state or view model; the payload fixture of stage 1 is recorded again, since the
  lines change on purpose, and the commit says so.
- UI and e2e: the settings have no tells select.
- Arena: the three talking bots still play.

## Documentation

`ARCHITECTURE.md` (persona, face, conversation, game, ui, arena) and `docs/emotion/README.md` (face and voice: one
decision of what she presents, her mask in words).
