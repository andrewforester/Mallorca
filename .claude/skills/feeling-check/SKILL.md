---
name: feeling-check
description: Read a hand history copied from the debug panel as an emotionally intelligent person would, and judge whether her feelings fit what happened at the table and her character, and whether her playing style moved the way such feelings would move a real person's play. Use when the owner pastes a history with "~ she feels" and "~ style" lines, or asks whether her emotions or her tilt look believable.
---

# Feeling check

This is not a check of numbers against rules. Read the history as someone with high emotional intelligence would:
a person who has sat at many tables, knows how people take a bad beat, a lucky river, a caught bluff or a long quiet
spell, and can tell a believable reaction from a mechanical one. Then say, as that person, whether she reads like a
real someone with her character, and where she does not.

## Input

A history copied from the debug panel: PokerStars text, one block per hand, with her lines interleaved.

- `~ she feels (<event>): <emotion> +<amount> <reason>, ... | mood: <words> | says "<line>"` after an event she
  reacted to. The amounts are impulses: how much that moment added to an emotion, from 0 to 1. They are not the
  level of the emotion, which also carries what is left of earlier moments and fades with time.
- `~ style: aggression .. bluff .. tightness .. sizing .. stickiness ..` after each of her decisions: the style the
  bot played with, each from 0.5 to 2, 1 being her blueprint. Tightness is the inverse of looseness: above 1 she plays
  fewer hands.
- The hand headers carry the time, so the gaps between hands tell how long a feeling had to fade.

Save the pasted text to a file in the scratchpad as it is, and read it whole before judging.

What the history does not carry, ask the owner for or say you are missing:

- **Who she is.** The character (Mallorca, Ingrid, Lola and so on) and, if known, her traits. Her character is the
  measure of everything else: the same bad beat should feel different to a calm professional and to an anxious
  perfectionist. If the owner does not say, infer it from her reactions and say that you did.
- **Her state between impulses**: the level of each emotion, her mood, how much of it reaches the play. Judge from
  the impulses, the mood words and the style, and say where the missing state leaves you unsure.

## Know the model, but do not judge by it

Read the current model so you know what she can feel and what moves her style, but read it as background, not as the
answer key: `docs/emotion/README.md` and the newest design in `docs/superpowers/specs/` about emotions and play. The
model changes; read the files, do not rely on memory. The question is never "did the code do what the code says",
it is "would a person do this".

## Read it

First as a story, hand by hand, before any number: what happened to her, how much was at stake for her, whose fault
it would feel like, what she said. Put yourself in her place with her character, and ask what you would feel at each
moment and how strongly.

Then compare, with care and without a checklist. Things worth noticing, as examples of the questions to ask:

- **Fit to the moment.** Is the feeling the kind a person feels here (anger at a raise, injustice at a river that
  beat 91%, shame at a caught bluff, relief at a lucky escape), and is its size in proportion: a big pot shakes more
  than a small one, a minor swing barely registers?
- **Fit to her character.** Does she react the way someone like her would: the anxious one more afraid and slower to
  let go, the brash one angry rather than ashamed, the calm one hardly moved? Would her friends recognise her?
- **Feelings that are missing.** A moment that should have stirred her and left nothing, or a reaction that never
  fades, or one that vanishes too fast.
- **Time.** Do feelings fade at a human pace between hands and over quiet spells, does a run of losses build up,
  does a good streak lift her? Is she herself again after a calm while?
- **From feeling to play.** Does the style move the way such feelings move a real player: anger pushing harder and
  calling more, fear and shame pulling back and folding more, a heater making her bolder, sadness wanting to win it
  back? Does it move smoothly, sharply only when something sharp happened? Does a feeling show in the axes it should
  and not in unrelated ones?
- **The whole evening.** Read across hands: does she read as one consistent person with moods, or as a set of
  disconnected reactions? Is anything uncanny, even if you cannot say it is wrong?

Notice what rings true as well as what does not; the owner needs both.

## Report to the owner

Answer in the owner's language. Start with a short verdict in plain words: does she read as a believable person of
her character over this session, and how she felt to you. Then the moments that matter, each with what happened, what
she felt (the impulse lines), what her style did (the style lines), and what a person like her would have felt and
done instead if it differs. End with the few things that look off, ordered by how much they break the feeling of a
real person.

When something looks off, describe it as a general tendency of the model (for example "her fear does not fade between
hands", "anger never reaches her stickiness"), not as a fix for one hand: the owner wants general mechanisms, not
special cases. Say what you would look at to confirm it, and propose it as its own task. Do not change the code from
this skill.

If a hand's decisions themselves look odd for her style (a bold style that folds, a sticky one that raises), that is
the subject of the `style-check` skill; mention it and leave the replay to that skill.
