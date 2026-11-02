import { assert, assertEquals } from "../_shared/testing.ts";
import { fixture } from "./fixtures/fixtures.ts";
import { parseRequest } from "./types.ts";

const without = (body: Record<string, unknown>, key: string): Record<string, unknown> => {
  const copy = { ...body };
  delete copy[key];
  return copy;
};

Deno.test("accepts the line fixture", () => {
  const req = parseRequest(fixture("line"));
  assert(req !== null);
  assertEquals(req.kind, "line");
  assertEquals(req, fixture("line") as unknown as typeof req);
});

Deno.test("accepts the reply fixture and trims its text", () => {
  const req = parseRequest(fixture("reply"));
  assert(req !== null && req.kind === "reply");
  assertEquals(req.text, "Ты блефуешь, я вижу по глазам.");
  assertEquals(req.facts.her, ["7c", "6c"]);
});

Deno.test("accepts the summary fixture", () => {
  const req = parseRequest(fixture("summary"));
  assert(req !== null && req.kind === "summary");
  assertEquals(req.summary.signals, { tease: 4, compliment: 1, mockBluff: 2 });
});

Deno.test("rejects bodies that are not objects", () => {
  for (const body of [null, undefined, "line", 3, [], true]) {
    assertEquals(parseRequest(body), null);
  }
});

Deno.test("rejects a missing or unknown kind", () => {
  assertEquals(parseRequest(without(fixture("line"), "kind")), null);
  assertEquals(parseRequest({ ...fixture("line"), kind: "shout" }), null);
});

Deno.test("rejects an empty, blank or 201 character reply text", () => {
  const reply = fixture("reply");
  assertEquals(parseRequest({ ...reply, text: "" }), null);
  assertEquals(parseRequest({ ...reply, text: "   " }), null);
  assertEquals(parseRequest({ ...reply, text: "a".repeat(201) }), null);
  assertEquals(parseRequest(without(reply, "text")), null);
  assert(parseRequest({ ...reply, text: "a".repeat(200) }) !== null);
});

Deno.test("rejects more than 8 recent lines", () => {
  const line = fixture("line");
  const recent = Array.from({ length: 9 }, (_, i) => ({
    speaker: i % 2 === 0 ? "player" : "mallorca",
    text: `line ${i}`,
  }));
  assertEquals(parseRequest({ ...line, recent }), null);
  assert(parseRequest({ ...line, recent: recent.slice(0, 8) }) !== null);
});

Deno.test("rejects a bad recent line", () => {
  const line = fixture("line");
  assertEquals(parseRequest({ ...line, recent: [{ speaker: "dealer", text: "hi" }] }), null);
  assertEquals(
    parseRequest({ ...line, recent: [{ speaker: "player", text: "a".repeat(401) }] }),
    null,
  );
});

Deno.test("rejects bad session ids and locales", () => {
  const line = fixture("line");
  assertEquals(parseRequest({ ...line, sessionId: "" }), null);
  assertEquals(parseRequest({ ...line, sessionId: "x".repeat(65) }), null);
  assertEquals(parseRequest({ ...line, locale: "e" }), null);
  assertEquals(parseRequest({ ...line, locale: "x".repeat(11) }), null);
});

Deno.test("rejects bad facts", () => {
  const line = fixture("line");
  const facts = line.facts as Record<string, unknown>;
  const bad: Record<string, unknown>[] = [
    { ...facts, street: "fourth" },
    { ...facts, board: ["Kd", "7s", "2c", "Th", "4h", "5h"] },
    { ...facts, board: ["Kx"] },
    { ...facts, board: ["kd"] },
    { ...facts, pot: -1 },
    { ...facts, pot: Number.NaN },
    { ...facts, stacks: [88] },
    { ...facts, her: ["Ks"] },
    { ...facts, her: ["Ks", "Q"] },
    { ...facts, actions: Array.from({ length: 31 }, () => "checks") },
    { ...facts, actions: ["x".repeat(81)] },
    { ...facts, bigBlind: 0 },
    without(facts, "bigBlind"),
  ];
  for (const f of bad) assertEquals(parseRequest({ ...line, facts: f }), null);
  assert(parseRequest({ ...line, facts: { ...facts, her: null, board: [] } }) !== null);
});

Deno.test("rejects bad intents and moods", () => {
  const line = fixture("line");
  const intent = line.intent as Record<string, unknown>;
  assertEquals(parseRequest({ ...line, intent: { ...intent, situation: "sing" } }), null);
  assertEquals(parseRequest({ ...line, intent: { ...intent, hint: "huge" } }), null);
  assertEquals(parseRequest({ ...line, intent: { ...intent, honest: "yes" } }), null);
  assert(parseRequest({ ...line, intent: { ...intent, hint: null } }) !== null);
  assertEquals(parseRequest({ ...line, mood: ["a", "b", "c", "d"] }), null);
  assertEquals(parseRequest({ ...line, mood: ["x".repeat(41)] }), null);
  assertEquals(parseRequest({ ...line, mood: [3] }), null);
});

Deno.test("rejects a bad summary", () => {
  const body = fixture("summary");
  const summary = body.summary as Record<string, unknown>;
  assertEquals(parseRequest({ ...body, summary: { ...summary, hands: -1 } }), null);
  assertEquals(parseRequest({ ...body, summary: { ...summary, hands: 1.5 } }), null);
  assertEquals(parseRequest({ ...body, summary: { ...summary, netBb: "lots" } }), null);
  assertEquals(parseRequest({ ...body, summary: { ...summary, signals: { shout: 1 } } }), null);
  assertEquals(parseRequest({ ...body, summary: { ...summary, signals: { tease: -1 } } }), null);
  assertEquals(parseRequest(without(body, "summary")), null);
});

Deno.test("drops unknown fields", () => {
  const req = parseRequest({ ...fixture("line"), extra: "ignored" });
  assert(req !== null);
  assertEquals("extra" in req, false);
});

Deno.test("rejects an empty or blank recent line", () => {
  const line = fixture("line");
  assertEquals(parseRequest({ ...line, recent: [{ speaker: "player", text: "" }] }), null);
  assertEquals(parseRequest({ ...line, recent: [{ speaker: "mallorca", text: " \n " }] }), null);
});

Deno.test("rejects a locale with spaces or punctuation", () => {
  const line = fixture("line");
  for (const locale of ["e n", "en!", "en_US", "ru;drop", "en-", "12", "en-US-x"]) {
    assertEquals(parseRequest({ ...line, locale }), null, locale);
  }
  for (const locale of ["en", "ru", "pt-BR", "zh-Hant", "fil"]) {
    assert(parseRequest({ ...line, locale }) !== null, locale);
  }
});

Deno.test("an intent needs the street of the action", () => {
  const line = fixture("line");
  const intent = line.intent as Record<string, unknown>;
  assertEquals(parseRequest({ ...line, intent: without(intent, "street") }), null);
  assertEquals(parseRequest({ ...line, intent: { ...intent, street: "fifth" } }), null);
  const req = parseRequest({ ...line, intent: { ...intent, street: "flop" } });
  assert(req !== null && req.kind === "line");
  assertEquals(req.intent.street, "flop");
});

Deno.test("a reply may be marked quick, and is not quick by default", () => {
  const reply = fixture("reply");
  const quick = parseRequest({ ...reply, quick: true });
  assert(quick !== null && quick.kind === "reply");
  assertEquals(quick.quick, true);
  const plain = parseRequest(without(reply, "quick"));
  assert(plain !== null && plain.kind === "reply");
  assertEquals(plain.quick, false);
  assertEquals(parseRequest({ ...reply, quick: "yes" }), null);
});

Deno.test("an old game without a feeling or a character still parses", () => {
  const req = parseRequest(without(without(fixture("line"), "feeling"), "character"));
  assert(req !== null && req.kind === "line");
  assertEquals(req.feeling, null);
  assertEquals(req.character, null);
});

Deno.test("a feeling or character of an unknown version is ignored, not rejected", () => {
  const line = fixture("line");
  const req = parseRequest({ ...line, feeling: { version: 2 }, character: { version: 9 } });
  assert(req !== null && req.kind === "line");
  assertEquals(req.feeling, null);
  assertEquals(req.character, null);
});

Deno.test("rejects a malformed feeling of version 1", () => {
  const line = fixture("line");
  const feeling = line.feeling as Record<string, unknown>;
  const bad = [
    { ...feeling, emotions: [{ name: "boredom", intensity: 0.5 }] },
    { ...feeling, emotions: [{ name: "joy", intensity: 1.5 }] },
    { ...feeling, emotions: new Array(4).fill({ name: "joy", intensity: 0.5 }) },
    { ...feeling, mood: { octant: "sleepy", strength: "slightly" } },
    { ...feeling, mood: { octant: "relaxed", strength: "very" } },
    { ...feeling, overload: { level: -0.1, source: null } },
    { ...feeling, overload: { level: 0.5, source: "boredom" } },
    { ...feeling, shows: { mask: 2, acting: null } },
    { ...feeling, shows: { mask: 0.5, acting: "huge" } },
  ];
  for (const value of bad) assertEquals(parseRequest({ ...line, feeling: value }), null);
});

Deno.test("rejects a malformed character of version 1", () => {
  const line = fixture("line");
  const character = line.character as Record<string, unknown>;
  for (const key of ["talkativeness", "warmth", "nerves", "wit"]) {
    assertEquals(parseRequest({ ...line, character: { ...character, [key]: 1.2 } }), null);
    assertEquals(parseRequest({ ...line, character: { ...character, [key]: "high" } }), null);
  }
});

Deno.test("a reply carries the feeling and character too", () => {
  const req = parseRequest(fixture("reply"));
  assert(req !== null && req.kind === "reply");
  assertEquals(req.feeling?.emotions[0]?.name, "pride");
  assertEquals(req.character?.warmth, 0.75);
});
