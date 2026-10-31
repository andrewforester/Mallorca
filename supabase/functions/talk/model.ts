import Anthropic from "@anthropic-ai/sdk";
import type { CompleteInput, Deps, Purpose } from "./handler.ts";

const DEFAULT_MODEL = "claude-haiku-5-5";

export const modelFrom = (value: string | undefined): string => value || DEFAULT_MODEL;

const SETTINGS: Record<Purpose, { maxTokens: number; temperature: number }> = {
  line: { maxTokens: 120, temperature: 0.9 },
  signals: { maxTokens: 120, temperature: 0.3 },
  summary: { maxTokens: 200, temperature: 0.3 },
};

export function createComplete(apiKey: string | undefined): Deps["complete"] {
  const client = new Anthropic({ apiKey });
  const model = modelFrom(Deno.env.get("TALK_MODEL"));
  return async (input: CompleteInput) => {
    const { maxTokens, temperature } = SETTINGS[input.purpose];
    const response = await client.messages.create({
      model,
      max_tokens: maxTokens,
      temperature,
      system: input.system,
      messages: input.messages,
      ...(input.tool
        ? {
          tools: [input.tool as Anthropic.Tool],
          tool_choice: { type: "tool" as const, name: input.tool.name },
        }
        : {}),
    });
    let text = "";
    let toolInput: unknown = undefined;
    for (const block of response.content) {
      if (block.type === "text") text += block.text;
      else if (block.type === "tool_use" && toolInput === undefined) toolInput = block.input;
    }
    return { text, toolInput };
  };
}
