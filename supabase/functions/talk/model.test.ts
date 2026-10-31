import { assert, assertEquals } from "../_shared/testing.ts";
import { modelFrom, requestFor } from "./model.ts";
import { SIGNAL_TOOL } from "./signals.ts";

Deno.test("an unset or empty TALK_MODEL falls back to the default model", () => {
  assertEquals(modelFrom(undefined), "claude-haiku-5-5");
  assertEquals(modelFrom(""), "claude-haiku-5-5");
  assertEquals(modelFrom("other-model"), "other-model");
});

const system = [{ type: "text" as const, text: "You are Mallorca." }];
const messages = [{ role: "user" as const, content: "Hi" }];

Deno.test("a request sends no sampling parameters the model rejects", () => {
  const request = requestFor("claude-haiku-5-5", { purpose: "line", system, messages });
  assert(!("temperature" in request));
  assert(!("top_p" in request));
  assert(!("top_k" in request));
});

Deno.test("a short line keeps its tokens for the text, without thinking", () => {
  const request = requestFor("claude-haiku-5-5", { purpose: "line", system, messages });
  assertEquals(request.thinking, { type: "disabled" });
  assertEquals(request.max_tokens, 120);
  assertEquals(request.model, "claude-haiku-5-5");
  assert(!("tools" in request));
});

Deno.test("a tool request names the tool it needs", () => {
  const request = requestFor("claude-haiku-5-5", {
    purpose: "signals",
    system,
    messages,
    tool: SIGNAL_TOOL,
  });
  assertEquals(request.tools?.length, 1);
  assertEquals(request.tool_choice, { type: "tool", name: "signals" });
  assertEquals(request.thinking, { type: "disabled" });
});
