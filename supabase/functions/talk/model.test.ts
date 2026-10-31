import { assertEquals } from "../_shared/testing.ts";
import { modelFrom } from "./model.ts";

Deno.test("an unset or empty TALK_MODEL falls back to the default model", () => {
  assertEquals(modelFrom(undefined), "claude-haiku-5-5");
  assertEquals(modelFrom(""), "claude-haiku-5-5");
  assertEquals(modelFrom("other-model"), "other-model");
});
