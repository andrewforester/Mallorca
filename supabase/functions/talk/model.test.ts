import { assert, assertEquals } from "../_shared/testing.ts";
import type Anthropic from "@anthropic-ai/sdk";
import { completeWith, modelFrom, requestFor } from "./model.ts";
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

Deno.test("an observed call reports the served model, usage, stop reason and time", async () => {
  const seen: unknown[] = [];
  const complete = completeWith(
    () =>
      Promise.resolve({
        model: "claude-haiku-5-5",
        stop_reason: "end_turn",
        usage: { input_tokens: 10, output_tokens: 3 },
        content: [{ type: "text", text: "Hi there." }],
      } as unknown as Anthropic.Message),
    "claude-haiku-5-5",
    (call) => seen.push(call),
  );
  const result = await complete({ purpose: "line", system, messages });
  assertEquals(result.text, "Hi there.");
  const call = seen[0] as Record<string, unknown>;
  assertEquals(call.model, "claude-haiku-5-5");
  assertEquals(call.purpose, "line");
  assertEquals(call.stop_reason, "end_turn");
  assertEquals((call.usage as Record<string, number>).output_tokens, 3);
  assert(typeof call.ms === "number");
});
