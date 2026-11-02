import { assert, assertEquals } from "../_shared/testing.ts";
import { fixture } from "./fixtures/fixtures.ts";
import { parsePlanRequest } from "./planTypes.ts";
import { parseRequest } from "./types.ts";

type Json = Record<string, unknown>;

function withPath(body: Json, path: string, value: unknown): Json {
  const copy = structuredClone(body);
  const keys = path.split(".");
  let at: Json = copy;
  for (const key of keys.slice(0, -1)) at = at[key] as Json;
  at[keys[keys.length - 1]] = value;
  return copy;
}

Deno.test("parses a line of version 2 as it came", () => {
  const req = parsePlanRequest(fixture("planLine"));
  assert(req !== null && req.kind === "line");
  assertEquals(req as unknown, fixture("planLine"));
});

Deno.test("parses a reply of version 2 with its text", () => {
  const req = parsePlanRequest(fixture("planReply"));
  assert(req !== null && req.kind === "reply");
  assertEquals(req.text, "Ты блефуешь?");
  assertEquals(req.plan.claim, { about: "strong", honest: false });
});

Deno.test("sends a body of version 2 through parseRequest", () => {
  assertEquals(parseRequest(fixture("planLine")) as unknown, fixture("planLine"));
});

Deno.test("rejects another version and still serves a body without one", () => {
  assertEquals(parseRequest({ ...fixture("planLine"), version: 3 }), null);
  assert(parseRequest(fixture("line"))?.kind === "line");
});

const BAD: [string, unknown][] = [
  ["personality.openness", 1.5],
  ["personality.agreeableness", "warm"],
  ["plan.act", "joke"],
  ["plan.voice.emotion", "rage"],
  ["plan.voice.intensity", 1.2],
  ["plan.words.min", 0],
  ["plan.words.max", 21],
  ["plan.words.max", 1],
  ["plan.words.min", 2.5],
  ["plan.humour.style", "slapstick"],
  ["plan.humour.target", "him"],
  ["plan.humour.intensity", "loud"],
  ["plan.humour.softened", "yes"],
  ["plan.claim", { about: "huge", honest: true }],
  ["plan.occasion", ""],
  ["plan.occasion", "x".repeat(201)],
  ["plan.heard", ""],
  ["plan.facts.street", "fifth"],
  ["plan.facts.board", ["Kd", "7s", "2c", "9h", "Ah", "2d"]],
  ["plan.facts.board", ["Kx"]],
  ["plan.facts.potBb", -1],
  ["plan.facts.stacksBb.her", Number.NaN],
  ["plan.facts.actions", Array(31).fill("a")],
  ["plan.facts.actions", ["x".repeat(81)]],
  ["plan.facts.card", "1h"],
  ["plan.facts.result", { won: "no", potBb: 3 }],
  ["plan.facts.shown", { her: ["Kc"], player: ["Ac", "7d"] }],
  ["plan.session.hands", -1],
  [
    "plan.session.notable",
    Array(5).fill({ kind: "bigWin", handNumber: 1, potBb: 20, won: true, bets: 0 }),
  ],
  ["plan.session.notable", [{ kind: "epic", handNumber: 1, potBb: 20, won: true, bets: 0 }]],
  ["plan.street", "fifth"],
  ["plan.endsHand", "no"],
  ["plan.version", 1],
  ["recent", Array(9).fill({ speaker: "player", text: "hi" })],
  ["debug", "yes"],
  ["locale", "русский"],
];

Deno.test("rejects every value out of its limits", () => {
  for (const [path, value] of BAD) {
    assertEquals(parsePlanRequest(withPath(fixture("planLine"), path, value)), null, path);
  }
});

Deno.test("rejects a reply without text or with a quick that is not a boolean", () => {
  assertEquals(parsePlanRequest(withPath(fixture("planReply"), "text", "")), null);
  assertEquals(parsePlanRequest(withPath(fixture("planReply"), "quick", 1)), null);
});
