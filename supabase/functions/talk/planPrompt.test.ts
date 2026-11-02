import { assert, assertEquals, assertExcludes, assertIncludes } from "../_shared/testing.ts";
import { EMOTIONS } from "./feeling.ts";
import { fixture } from "./fixtures/fixtures.ts";
import { buildPlanMessages, planState, planSystem, TEXT_SCHEMA } from "./planPrompt.ts";
import { parsePlanRequest } from "./planTypes.ts";
import type { LineRequestV2, ReplyRequestV2 } from "./planTypes.ts";

const LINE = parsePlanRequest(fixture("planLine")) as LineRequestV2;
const REPLY = parsePlanRequest(fixture("planReply")) as ReplyRequestV2;
const MEMORIES = ["Bluffs a lot on the river."];

Deno.test("caches one system block with her character", () => {
  const system = planSystem(LINE.personality);
  assertEquals(system.length, 1);
  assertEquals(system[0].cache_control, { type: "ephemeral" });
  assertIncludes(system[0].text, "You are a bit outgoing");
});

Deno.test("keeps the setting out of how she treats the player", () => {
  const corner = {
    openness: -1,
    conscientiousness: 1,
    extraversion: -1,
    agreeableness: -1,
    neuroticism: 1,
  };
  for (const personality of [LINE.personality, corner]) {
    const text = planSystem(personality)[0].text.toLowerCase();
    for (const word of ["attic", "tea", "winter", "witty", "playful wit", "warmly tease"]) {
      assert(!new RegExp(`\\b${word}\\b`).test(text), word);
    }
  }
});

Deno.test("names the four humour styles and the rule of wit", () => {
  const text = planSystem(LINE.personality)[0].text;
  for (const style of ["affiliative", "selfEnhancing", "aggressive", "selfDefeating"]) {
    assertIncludes(text, style);
  }
  assertIncludes(text, "No puns");
});

Deno.test("writes the plan as labelled fields", () => {
  const state = planState(LINE, MEMORIES, []);
  assertIncludes(state, "Act: complain");
  assertIncludes(state, "Words: 2 to 7");
  assertIncludes(state, "Your voice: injustice, 0.55");
  assertIncludes(state, "Humour: selfEnhancing");
  assertIncludes(state, "Bluffs a lot on the river.");
  assertIncludes(state, "Locale: ru-RU");
  assertIncludes(state, "Tonight:");
  assertExcludes(state, "rejected");
});

Deno.test("names no emotion but the one in her voice", () => {
  const state = planState(LINE, [], []).toLowerCase();
  for (const emotion of EMOTIONS.filter((e) => e !== "injustice")) {
    assert(!new RegExp(`\\b${emotion}\\b`).test(state), emotion);
  }
});

Deno.test("says no humour when the plan has none, and the claim of an answer", () => {
  const state = planState(REPLY, [], []);
  assertIncludes(state, "Humour: none");
  assertIncludes(state, "About your hand:");
  assertIncludes(state, "The player said: Ты блефуешь?");
});

Deno.test("names the reasons of a rejected try", () => {
  const state = planState(LINE, [], ["longer than 7 words", "named Qs"]);
  assertIncludes(state, "Your last try was rejected: longer than 7 words; named Qs. Try again.");
});

Deno.test("ends the messages with the state and asks for the text only", () => {
  const prompt = buildPlanMessages(LINE, MEMORIES, []);
  assertEquals(prompt.schema, TEXT_SCHEMA);
  assertEquals(prompt.messages[0], { role: "user", content: "Твой ход." });
  assertEquals(prompt.messages[1], { role: "assistant", content: "Посмотрим." });
  const last = prompt.messages[prompt.messages.length - 1];
  assertEquals(last.role, "user");
  assertEquals(last.content, planState(LINE, MEMORIES, []));
});
