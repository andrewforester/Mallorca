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
