# Her own moves as emotion events, stage 3

Stages 1 and 2 made her persona the one source of her feeling, her face, her words and her bias. What she felt
came from the cards, the money, the player's bets, the result and the chat, but not from what she did herself. A
real player feels her own moves: the risk of a bluff, the confidence of taking the lead, the frustration of being
pushed off a hand, the relief of escaping with junk, the shame of paying off with a weak hand.

## The event

`emotion` gains `TableEvent` `ownMove`: `{ move: 'bet' | 'fold', amountBb, equity, facingBb }`, appraised with small
weights (all labelled design), since what she feels returns into her bias and large weights would rock the loop
"feeling, move, feeling":

| Move                                            | Impulses                                                                                                                                 |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| bet or raise, equity under 0.45 (`WEAK_EQUITY`) | fear `0.5 · sat(bet / 20) · (1 − equity)`                                                                                                |
| bet or raise, otherwise                         | pride `0.2 · sat(bet / 20) · smoothstep(0.7, 0.9, equity)`                                                                               |
| fold facing a bet                               | anger `0.35 · smoothstep(0.35, 0.75, equity) · sat(facing / 20)`; relief `0.35 · (1 − smoothstep(0.2, 0.45, equity)) · sat(facing / 20)` |

A river call with a weak class that loses at showdown is the existing `mistake` event with the call as its cost
(shame `sat(cost / 20)`).

## Where it comes from

`persona/perception.ts` feeds them: her raise as `bet` with the chips it added, her fold as `fold` with the last
bet of the player on that street, both with her perceived equity (the number her hope and fear follow); her river
call is remembered with its class, and a lost showdown after a weak one is a `mistake`. Her own calls and checks
add no event: the money they commit already moves her hope and fear.

The debug journal names them (`She bets 2.0 bb, equity 20%`, `She folds to 2.0 bb, equity 85%`).

## Testing

Appraisal tests per move in `emotion.test.ts`; persona tests for a weak bet (fear), a strong fold (anger) and a
lost weak river call (mistake); the journal description; the payload fixture is recorded again, since her feeling
and so her lines change on purpose.
