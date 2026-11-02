import { assertEquals } from "../_shared/testing.ts";
import { characterText, qualifierOf } from "./character.ts";

const MALLORCA = {
  openness: 0.4,
  conscientiousness: 0.2,
  extraversion: 0.4,
  agreeableness: 0.5,
  neuroticism: 0.1,
};

Deno.test("grades a trait by its size", () => {
  assertEquals(qualifierOf(0.19), null);
  assertEquals(qualifierOf(0.2), "a bit");
  assertEquals(qualifierOf(0.44), "a bit");
  assertEquals(qualifierOf(0.45), "very");
  assertEquals(qualifierOf(0.75), "extremely");
  assertEquals(qualifierOf(-0.5), "very");
});

Deno.test("tells Mallorca in four sentences and leaves her nerves out", () => {
  assertEquals(
    characterText(MALLORCA),
    [
      "You are a bit outgoing: you speak up readily and warmly, though briefly.",
      "You are very warm: you are kind and glad when the player plays well.",
      "You are a bit imaginative: you pick a vivid word over a stock phrase.",
      "You are a bit composed: you put things carefully and precisely.",
    ].join(" "),
  );
});

Deno.test("takes the pole of a trait from its sign", () => {
  assertEquals(
    characterText({
      ...MALLORCA,
      extraversion: -0.5,
      agreeableness: 0,
      openness: 0,
      conscientiousness: 0,
    }),
    "You are very reserved: you say little and let the player talk first.",
  );
  assertEquals(
    characterText({
      openness: -0.8,
      conscientiousness: -0.3,
      extraversion: 0,
      agreeableness: -0.6,
      neuroticism: 0.9,
    }),
    [
      "You are very cool: you are blunt, and praise does not come easily.",
      "You are extremely sensitive: under pressure your words hedge and turn to yourself.",
      "You are extremely plain: you say things simply and literally.",
      "You are a bit loose: you speak on impulse and leave things half said.",
    ].join(" "),
  );
});
