import Anthropic from "@anthropic-ai/sdk";
import type { CompleteInput, Deps, Purpose } from "./handler.ts";

const DEFAULT_MODEL = "claude-haiku-5-5";

export const modelFrom = (value: string | undefined): string => value || DEFAULT_MODEL;

const MAX_TOKENS: Record<Purpose, number> = {
  line: 120,
  signals: 120,
  summary: 200,
};

export function requestFor(
  model: string,
  input: CompleteInput,
): Anthropic.MessageCreateParamsNonStreaming {
  return {
    model,
    max_tokens: MAX_TOKENS[input.purpose],
    thinking: { type: "disabled" },
    system: input.system,
    messages: input.messages,
    ...(input.tool
      ? {
        tools: [input.tool as Anthropic.Tool],
        tool_choice: { type: "tool" as const, name: input.tool.name },
      }
      : {}),
  };
}

export function createComplete(apiKey: string | undefined): Deps["complete"] {
  const client = new Anthropic({ apiKey });
  const model = modelFrom(Deno.env.get("TALK_MODEL"));
  return async (input: CompleteInput) => {
    const response = await client.messages.create(requestFor(model, input));
    let text = "";
    let toolInput: unknown = undefined;
    for (const block of response.content) {
      if (block.type === "text") text += block.text;
      else if (block.type === "tool_use" && toolInput === undefined) toolInput = block.input;
    }
    return { text, toolInput };
  };
}
