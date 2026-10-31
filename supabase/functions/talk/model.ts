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

export interface Observed {
  purpose: Purpose;
  model: string;
  usage: Anthropic.Usage;
  stop_reason: string | null;
  ms: number;
  request: Anthropic.MessageCreateParamsNonStreaming;
  content: Anthropic.ContentBlock[];
}

type Create = (request: Anthropic.MessageCreateParamsNonStreaming) => Promise<Anthropic.Message>;

export function completeWith(
  create: Create,
  model: string,
  observe?: (call: Observed) => void,
): Deps["complete"] {
  return async (input: CompleteInput) => {
    const request = requestFor(model, input);
    const start = performance.now();
    const response = await create(request);
    observe?.({
      purpose: input.purpose,
      model: response.model,
      usage: response.usage,
      stop_reason: response.stop_reason,
      ms: performance.now() - start,
      request,
      content: response.content,
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

export function createComplete(apiKey: string | undefined): Deps["complete"] {
  const client = new Anthropic({ apiKey });
  const model = modelFrom(Deno.env.get("TALK_MODEL"));
  return completeWith((request) => client.messages.create(request), model);
}
