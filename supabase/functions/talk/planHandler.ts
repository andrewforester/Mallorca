import { rejections } from "./check.ts";
import type { CompleteInput } from "./handler.ts";
import { buildPlanMessages, planState } from "./planPrompt.ts";
import type { Act, LineRequestV2, ReplyRequestV2 } from "./planTypes.ts";

type PlanRequest = LineRequestV2 | ReplyRequestV2;

export interface Attempt {
  text: string;
  rejected: string[];
}

export interface PromptEcho {
  system: string;
  state: string;
}

export interface Written {
  text: string | null;
  attempts: Attempt[];
  prompt: PromptEcho;
}

export interface Writer {
  complete(input: CompleteInput): Promise<{ text: string; data: unknown }>;
  allow(): Promise<boolean>;
}

export const MAX_ATTEMPTS = 2;

export const ACT_FALLBACK: Readonly<Record<"en" | "ru", Readonly<Record<Act, string>>>> = {
  en: {
    react: "Hm.",
    claim: "We'll see.",
    press: "Your move.",
    stall: "Hm, wait.",
    deflect: "Who knows.",
    concede: "Well played.",
    complain: "Of course.",
    enjoy: "Nice.",
    tease: "Really now?",
    answer: "Let's play.",
  },
  ru: {
    react: "Хм.",
    claim: "Посмотрим.",
    press: "Твой ход.",
    stall: "Хм, сейчас.",
    deflect: "Кто знает.",
    concede: "Хорошо сыграл.",
    complain: "Ну конечно.",
    enjoy: "Приятно.",
    tease: "Да неужели?",
    answer: "Давай играть.",
  },
};

export function fallbackFor(req: PlanRequest): string {
  const lang = req.locale.toLowerCase().startsWith("ru") ? "ru" : "en";
  return ACT_FALLBACK[lang][req.plan.act];
}

function lineOf(data: unknown, raw: string): string {
  if (typeof data === "object" && data !== null && "text" in data) {
    const { text } = data as { text: unknown };
    if (typeof text === "string") return text.trim();
  }
  return raw.trim();
}

export async function writePlanned(
  req: PlanRequest,
  memories: readonly string[],
  writer: Writer,
): Promise<Written> {
  const attempts: Attempt[] = [];
  let reasons: string[] = [];
  let prompt: PromptEcho = { system: "", state: "" };
  for (let k = 0; k < MAX_ATTEMPTS; k++) {
    if (k > 0 && !(await writer.allow())) break;
    const built = buildPlanMessages(req, memories, reasons);
    prompt = { system: built.system[0].text, state: planState(req, memories, reasons) };
    const { text, data } = await writer.complete({ purpose: "line", ...built });
    const line = lineOf(data, text);
    if (line === "") throw new Error("empty");
    const rejected = rejections(line, req.plan, req.recent);
    attempts.push({ text: line, rejected });
    if (rejected.length === 0) return { text: line, attempts, prompt };
    reasons = rejected;
  }
  return { text: null, attempts, prompt };
}

export function answerOf(written: Written, debug: boolean): Record<string, unknown> {
  const { text, attempts, prompt } = written;
  return debug ? { text, attempts, prompt } : { text, attempts };
}
