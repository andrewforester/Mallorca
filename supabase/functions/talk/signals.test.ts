import { assertEquals, assertIncludes } from "../_shared/testing.ts";
import { parseSignals, SIGNAL_GUIDE, SIGNAL_SCHEMA } from "./signals.ts";
import { SIGNALS } from "./types.ts";

Deno.test("drops unknown signals and duplicates", () => {
  assertEquals(parseSignals(["tease", "x", "tease"]), ["tease"]);
});

Deno.test("reads the signals field of the answer", () => {
  assertEquals(parseSignals({ signals: ["friendly", "mockBluff", "friendly"] }), [
    "friendly",
    "mockBluff",
  ]);
});

Deno.test("returns no signals for malformed input", () => {
  for (const input of [null, undefined, "tease", 4, {}, { signals: "tease" }, [1, null]]) {
    assertEquals(parseSignals(input), []);
  }
});

Deno.test("the signal schema and guide list every signal", () => {
  const schema = SIGNAL_SCHEMA as {
    type: string;
    properties: { signals: { type: string; items: { enum: string[] } } };
    required: string[];
  };
  assertEquals(schema.type, "object");
  assertEquals(schema.properties.signals.type, "array");
  assertEquals(schema.properties.signals.items.enum, [...SIGNALS]);
  assertEquals(schema.required, ["signals"]);
  for (const signal of SIGNALS) assertIncludes(SIGNAL_GUIDE, signal);
});
