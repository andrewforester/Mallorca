import { assert, assertEquals } from "../_shared/testing.ts";
import type Anthropic from "@anthropic-ai/sdk";
import { completeWith, FALLBACK_BETA, modelFrom, requestFor } from "./model.ts";

Deno.test("an unset or empty TALK_MODEL falls back to the default model", () => {
  assertEquals(modelFrom(undefined), "claude-haiku-5-5");
  assertEquals(modelFrom(""), "claude-haiku-5-5");
  assertEquals(modelFrom("other-model"), "other-model");
});

const system = [{ type: "text" as const, text: "You are Mallorca." }];
const messages = [{ role: "user" as const, content: "Hi" }];

const schema = { type: "object" };
const input = { purpose: "line" as const, system, messages, schema };

Deno.test("a request sends no sampling parameters the model rejects", () => {
  for (const model of ["claude-haiku-5-5", "claude-sonnet-5-5", "claude-opus-5-5"]) {
    const request = requestFor(model, input);
    assert(!("temperature" in request));
    assert(!("top_p" in request));
    assert(!("top_k" in request));
  }
});

Deno.test("every request asks for its schema through structured output, never a forced tool", () => {
  for (const model of ["claude-haiku-5-5", "claude-sonnet-5-5", "claude-opus-5-5"]) {
    const request = requestFor(model, input);
    assertEquals((request.output_config as { format: unknown }).format, {
      type: "json_schema",
      schema,
    });
    assert(!("tools" in request));
    assert(!("tool_choice" in request));
  }
});

Deno.test("Haiku writes a short line without thinking", () => {
  const request = requestFor("claude-haiku-5-5", input);
  assertEquals(request.thinking, { type: "disabled" });
  assertEquals(request.max_tokens, 200);
  assertEquals(request.model, "claude-haiku-5-5");
  assert(!("fallbacks" in request));
});

Deno.test("Sonnet 5.5 thinks only between tools, at low effort, with server fallbacks", () => {
  const request = requestFor("claude-sonnet-5-5", input);
  assertEquals(request.thinking as unknown, { type: "between_tools" });
  assertEquals((request.output_config as { effort: string }).effort, "low");
  assertEquals(request.fallbacks, "default");
  assertEquals(request.betas, [FALLBACK_BETA]);
});

Deno.test("Opus 5.5 sends no thinking setting, low effort and server fallbacks", () => {
  const request = requestFor("claude-opus-5-5", input);
  assert(!("thinking" in request));
  assertEquals((request.output_config as { effort: string }).effort, "low");
  assertEquals(request.fallbacks, "default");
});

Deno.test("a refusal is an error before the content is read", async () => {
  const complete = completeWith(
    () =>
      Promise.resolve({
        model: "claude-sonnet-5-5",
        stop_reason: "refusal",
        usage: { input_tokens: 1, output_tokens: 0 },
        content: [{ type: "text", text: "{}" }],
      } as unknown as Anthropic.Message),
    "claude-sonnet-5-5",
  );
  let failed = false;
  await complete(input).catch(() => (failed = true));
  assert(failed);
});

Deno.test("an observed call reports the served model, usage, stop reason and time", async () => {
  const seen: unknown[] = [];
  const complete = completeWith(
    () =>
      Promise.resolve({
        model: "claude-haiku-5-5",
        stop_reason: "end_turn",
        usage: { input_tokens: 10, output_tokens: 3 },
        content: [{ type: "text", text: '{"text":"Hi there."}' }],
      } as unknown as Anthropic.Message),
    "claude-haiku-5-5",
    (call) => seen.push(call),
  );
  const result = await complete(input);
  assertEquals(result.data, { text: "Hi there." });
  const call = seen[0] as Record<string, unknown>;
  assertEquals(call.model, "claude-haiku-5-5");
  assertEquals(call.purpose, "line");
  assertEquals(call.stop_reason, "end_turn");
  assertEquals((call.usage as Record<string, number>).output_tokens, 3);
  assert(typeof call.ms === "number");
});
