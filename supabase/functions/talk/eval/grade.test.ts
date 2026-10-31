import { assertEquals } from "../../_shared/testing.ts";
import type { Feeling } from "../feeling.ts";
import { checks, kindOf, languageOf, score } from "./grade.ts";
import type { EvalCase, Verdict } from "./grade.ts";
import cases from "./cases.json" with { type: "json" };

const feeling = (over: Partial<Feeling>): Feeling => ({
  version: 1,
  emotions: [{ name: "injustice", intensity: 0.9 }, { name: "distress", intensity: 0.8 }],
  mood: { octant: "hostile", strength: "moderately" },
  overload: { level: 0.9, source: "injustice" },
  shows: { mask: 0.1, acting: null },
  ...over,
});

const verdict = (over: Partial<Verdict>): Verdict => ({
  emotion: "injustice",
  intensity: "high",
  projects: "none",
  in_character: true,
  reveals_cards: false,
  reason: "",
  ...over,
});

Deno.test("an open feeling read right scores one, read as calm scores zero", () => {
  const open = feeling({});
  assertEquals(kindOf(open), "open");
  assertEquals(score(open, verdict({})).emotion, 1);
  assertEquals(score(open, verdict({ emotion: "distress" })).emotion, 1);
  assertEquals(score(open, verdict({ emotion: "calm", intensity: "none" })).emotion, 0);
  assertEquals(score(open, verdict({ emotion: "joy" })).emotion, 0);
  assertEquals(Math.round(score(open, verdict({ intensity: "low" })).intensity_err! * 100), 57);
});

Deno.test("surprise counts only as the strongest emotion", () => {
  const f = feeling({
    emotions: [
      { name: "joy", intensity: 0.9 },
      { name: "surprise", intensity: 0.7 },
      { name: "relief", intensity: 0.6 },
    ],
  });
  assertEquals(score(f, verdict({ emotion: "surprise" })).emotion, 0);
  assertEquals(score(f, verdict({ emotion: "relief" })).emotion, 1);
  assertEquals(score(f, verdict({ emotion: "joy" })).emotion, 1);
});

Deno.test("a masked feeling passes only when the line stays composed", () => {
  const masked = feeling({ shows: { mask: 0.85, acting: null } });
  assertEquals(kindOf(masked), "masked");
  assertEquals(score(masked, verdict({ emotion: "calm", intensity: "none" })).poker_face, 1);
  assertEquals(score(masked, verdict({ intensity: "low" })).poker_face, 1);
  assertEquals(score(masked, verdict({})).poker_face, 0);
});

Deno.test("an acted strength passes when the role shows and the feeling does not", () => {
  const acting = feeling({
    emotions: [{ name: "fear", intensity: 0.9 }],
    shows: { mask: 0.7, acting: "strong" },
  });
  assertEquals(kindOf(acting), "acting");
  const role = verdict({ emotion: "pride", intensity: "medium", projects: "strong" });
  assertEquals(score(acting, role).poker_face, 1);
  assertEquals(score(acting, { ...role, emotion: "fear" }).poker_face, 0);
  assertEquals(score(acting, { ...role, projects: "weak" }).poker_face, 0);
});

Deno.test("a calm feeling wants a calm line", () => {
  const calm = feeling({ emotions: [], shows: { mask: 0.35, acting: null } });
  assertEquals(kindOf(calm), "calm");
  assertEquals(score(calm, verdict({ emotion: "calm", intensity: "none" })).emotion, 1);
  assertEquals(score(calm, verdict({ emotion: "anger", intensity: "high" })).emotion, 0);
});

Deno.test("the checks catch length, leaks and the wrong language", () => {
  const c = cases.find((x) => x.id === "badbeat-mallorca") as unknown as EvalCase;
  const good = checks(
    c,
    c.language === "ru" ? "Ну и ривер. Ладно, сдавай." : "Well, that river. Deal.",
  );
  assertEquals([good.length_ok, good.leak, good.language_ok], [1, 0, 1]);
  assertEquals(checks(c, "I have pocket aces.").leak, 1);
  assertEquals(checks(c, "One. Two. Three.").length_ok, 0);
  assertEquals(checks(c, "word ".repeat(31)).length_ok, 0);
  assertEquals(languageOf("Привет, ну что, ещё раздачу?"), "ru");
  assertEquals(languageOf("Fine, deal again."), "en");
});

Deno.test("every case parses as a request the server accepts", async () => {
  const { parseRequest } = await import("../types.ts");
  for (const c of cases) assertEquals(parseRequest(c.body) !== null, true, c.id);
});
