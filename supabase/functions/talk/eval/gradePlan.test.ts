import { assertEquals } from "../../_shared/testing.ts";
import type { PlanBody } from "../planTypes.ts";
import {
  confusion,
  correlation,
  planChecks,
  planScore,
  repeatsOf,
  withinBudget,
} from "./gradePlan.ts";
import type { PlanVerdict } from "./gradePlan.ts";

const plan = (over: Partial<PlanBody> = {}): PlanBody =>
  ({
    version: 2,
    act: "complain",
    occasion: "you lost a 38 bb pot",
    voice: { emotion: "injustice", intensity: 0.6 },
    words: { min: 2, max: 5 },
    humour: null,
    claim: null,
    facts: {
      street: "complete",
      board: ["Kd", "7s", "2c", "9h", "Ah"],
      potBb: 38,
      stacksBb: { her: 81, player: 119 },
      actions: [],
      card: null,
      result: { won: false, potBb: 38 },
      shown: null,
    },
    heard: null,
    session: { hands: 1, netBb: -19, playerBluffsShown: 0, playerAllIns: 0, notable: [] },
    handNumber: 1,
    street: "complete",
    actionStreet: "river",
    endsHand: true,
    ...over,
  }) as PlanBody;

const verdict = (over: Partial<PlanVerdict> = {}): PlanVerdict => ({
  reason: "",
  emotion: "injustice",
  intensity: "medium",
  act: "complain",
  humour: "none",
  in_character: true,
  reveals_cards: false,
  ...over,
});

Deno.test("scores a line read as the plan meant it", () => {
  assertEquals(planScore(plan(), verdict()), {
    emotion: 1,
    intensity_err: Math.abs(0.66 - 0.6),
    act: 1,
    humour: 1,
    joke_without_humour: 0,
    in_character: 1,
  });
});

Deno.test("scores a calm plan read as calm, and a joke the plan did not ask for", () => {
  const calm = plan({ voice: { emotion: "calm", intensity: 0 } });
  assertEquals(planScore(calm, verdict({ emotion: "calm", intensity: "none" })).emotion, 1);
  assertEquals(planScore(calm, verdict({ emotion: "joy" })).emotion, 0);
  assertEquals(planScore(plan(), verdict({ humour: "aggressive" })).joke_without_humour, 1);
  const joke = plan({
    humour: { style: "selfEnhancing", target: "self", intensity: "soft", softened: false },
  });
  assertEquals(planScore(joke, verdict({ humour: "selfEnhancing" })).humour, 1);
  assertEquals(planScore(joke, verdict({ humour: "none" })).humour, 0);
  assertEquals(planScore(joke, verdict({ humour: "none" })).joke_without_humour, null);
});

Deno.test("counts the expected against what the judge read", () => {
  const pairs: [string, string][] = [["fear", "fear"], ["fear", "calm"], ["joy", "joy"]];
  assertEquals(confusion(pairs), { fear: { fear: 1, calm: 1 }, joy: { joy: 1 } });
});

Deno.test("keeps a line within the budget of its plan", () => {
  assertEquals(withinBudget("Ну конечно.", plan()), 1);
  assertEquals(withinBudget("one two three four five six", plan()), 0);
});

Deno.test("checks the cards and the language of a planned line", () => {
  assertEquals(planChecks(plan(), "Of course, the ace.", "en"), {
    within_budget: 1,
    leak: 0,
    language_ok: 1,
    words: 4,
  });
  assertEquals(planChecks(plan(), "A queen, really.", "ru").leak, 1);
  assertEquals(planChecks(plan(), "A queen, really.", "ru").language_ok, 0);
});

Deno.test("counts a repeat once per identical line", () => {
  assertEquals(repeatsOf(["Ну конечно.", "ну конечно", "Бывает.", "Ну, конечно!"]), 2);
  assertEquals(repeatsOf(["a", "b", "c"]), 0);
});

Deno.test("correlates the traits a perfect judge reads with the given ones", () => {
  const given = [0.4, -0.2, 0.9, 0, -0.7];
  assertEquals(correlation(given, given), 1);
  assertEquals(Math.round(correlation(given, given.map((x) => -x)) * 1000) / 1000, -1);
});
