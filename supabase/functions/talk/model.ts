import Anthropic from "@anthropic-ai/sdk";
import type { CompleteInput, Deps, Purpose } from "./handler.ts";

const DEFAULT_MODEL = "claude-haiku-5-5";

export const modelFrom = (value: string | undefined): string => value || DEFAULT_MODEL;

const MAX_TOKENS: Record<Purpose, number> = {
  line: 200,
  signals: 120,
  summary: 300,
};

export const FALLBACK_BETA = "server-side-fallback-2026-07-01";

type Request = Anthropic.MessageCreateParamsNonStreaming & Record<string, unknown>;

function thinkingFor(model: string): Record<string, unknown> {
  if (model.startsWith("claude-opus-5-5")) {
    return { betas: [FALLBACK_BETA], fallbacks: "default", effort: "low" };
  }
  if (model.startsWith("claude-sonnet-5-5")) {
    return {
      thinking: { type: "between_tools" },
      betas: [FALLBACK_BETA],
      fallbacks: "default",
      effort: "low",
    };
  }
  return { thinking: { type: "disabled" } };
}

export function requestFor(model: string, input: CompleteInput): Request {
  const { effort, ...rest } = thinkingFor(model);
  const format = { type: "json_schema", schema: input.schema };
  return {
    model,
    max_tokens: MAX_TOKENS[input.purpose],
    system: input.system,
    messages: input.messages,
    output_config: effort === undefined ? { format } : { format, effort },
    ...rest,
  } as Request;
}

export interface Observed {
  purpose: Purpose;
  model: string;
  usage: Anthropic.Usage;
  stop_reason: string | null;
  ms: number;
  request: Request;
  content: Anthropic.ContentBlock[];
}

type Create = (request: Request) => Promise<Anthropic.Message>;

export function parseData(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

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
    if (response.stop_reason === "refusal") throw new Error("refusal");
    let text = "";
    for (const block of response.content) {
      if (block.type === "text") text += block.text;
    }
    return { text, data: parseData(text) };
  };
}

export function createFrom(client: Anthropic): Create {
  return (request) =>
    "betas" in request
      ? client.beta.messages.create(request as never) as unknown as Promise<Anthropic.Message>
      : client.messages.create(request);
}

export function createComplete(apiKey: string | undefined): Deps["complete"] {
  const model = modelFrom(Deno.env.get("TALK_MODEL"));
  return completeWith(createFrom(new Anthropic({ apiKey })), model);
}
