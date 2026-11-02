import { assert, assertEquals } from "../_shared/testing.ts";
import { rejections, wordCount } from "./check.ts";
import { fixture } from "./fixtures/fixtures.ts";
import { parsePlanRequest } from "./planTypes.ts";
import type { LineRequestV2, PlanBody, PlanFacts } from "./planTypes.ts";

const BASE = (parsePlanRequest(fixture("planLine")) as LineRequestV2).plan;

const LIVE: PlanFacts = {
  ...BASE.facts,
  street: "river",
  board: ["Kd", "7s", "2c", "9h", "Ah"],
  result: null,
  shown: null,
  card: null,
};

const plan = (patch: Partial<PlanBody> = {}, facts: Partial<PlanFacts> = {}): PlanBody => ({
  ...BASE,
  words: { min: 1, max: 12 },
  ...patch,
  facts: { ...LIVE, ...facts },
});

const reasons = (text: string, p: PlanBody = plan()) => rejections(text, p, []);

Deno.test("counts words as runs of letters or digits", () => {
  assertEquals(wordCount("Hm."), 1);
  assertEquals(wordCount("Hm, ok."), 2);
  assertEquals(wordCount("Ну — посмотрим..."), 2);
  assertEquals(wordCount("38 bb, wow"), 3);
});

Deno.test("rejects a line longer than the plan allows", () => {
  const one = plan({ words: { min: 1, max: 1 } });
  assertEquals(reasons("Hm.", one), []);
  assertEquals(reasons("Hm, ok.", one), ["longer than 1 words"]);
});

Deno.test("lets her name the board and nothing else", () => {
  assertEquals(reasons("That ace on the river."), []);
  assertEquals(reasons("Kd, really?"), []);
  assertEquals(reasons("Qs, really?"), ["named Qs"]);
  assert(reasons("Nice king of hearts.").includes("named king of hearts"));
  assertEquals(reasons("A queen would have helped."), ["named queen"]);
  assertEquals(reasons("Ah well, as I said."), []);
});

Deno.test("knows the ranks in Russian", () => {
  assertEquals(reasons("Туз пришёл.", plan({}, { board: ["Kd", "7s", "2c"] })), ["named туз"]);
  assertEquals(reasons("Туз пришёл."), []);
  assert(reasons("Король пик, надо же.").includes("named король пик"));
});

Deno.test("lets her name the cards that were shown", () => {
  const shown = { her: ["Qc", "Qd"] as [string, string], player: ["Ac", "7d"] as [string, string] };
  assertEquals(reasons("A queen would have helped.", plan({}, { shown })), []);
});

Deno.test("keeps her hand to herself until it is shown", () => {
  assertEquals(reasons("I had a flush."), ["told about her hand"]);
  const shown = { her: ["9c", "8c"] as [string, string], player: ["Ac", "7d"] as [string, string] };
  assertEquals(reasons("I had a flush.", plan({}, { shown })), []);
});

Deno.test("rejects a line she already said, not one the player said", () => {
  const recent = [
    { speaker: "mallorca" as const, text: "Ну, посмотрим." },
    { speaker: "player" as const, text: "Твой ход." },
  ];
  assertEquals(rejections("ну посмотрим", plan(), recent), ["repeated a line"]);
  assertEquals(rejections("Твой ход!", plan(), recent), []);
});

Deno.test("gives the reasons in order", () => {
  const short = plan({ words: { min: 1, max: 2 } });
  assertEquals(rejections("I had a set of Qs.", short, []), [
    "longer than 2 words",
    "named Qs",
    "told about her hand",
  ]);
});

Deno.test("reads the verb дам as a verb, not a queen", () => {
  const noQueen = plan({}, { board: ["Kd", "7s", "2c"] });
  assertEquals(reasons("Не дам тебе выиграть.", noQueen), []);
  assertEquals(reasons("Дама пришла.", noQueen), ["named дама"]);
  assertEquals(reasons("Дамы нет.", noQueen), ["named дамы"]);
});
