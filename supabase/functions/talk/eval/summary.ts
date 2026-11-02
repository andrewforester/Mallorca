import type Anthropic from "@anthropic-ai/sdk";
import type { Kind, Verdict } from "./grade.ts";
import { confusion, repeatsOf } from "./gradePlan.ts";
import type { PlanVerdict } from "./gradePlan.ts";

export interface Call {
  purpose: string;
  model: string;
  usage: Anthropic.Usage;
  ms: number;
}

export interface Row {
  prompt_id: string;
  prompt: string;
  tags: string[];
  kind: Kind | "plan";
  rep?: number;
  expected?: { emotion: string; act: string; humour: string };
  status: "ok" | "truncated";
  stop_reason: string | null;
  grade: Record<string, number | null>;
  words: number;
  text: string;
  delivered: string;
  delivery?: { emotion: string; intensity: number };
  verdict: Verdict | PlanVerdict;
  model: string;
  calls: Call[];
  latency_s: number;
  case_s: number;
  judge_model: string;
  judge_usage: Anthropic.Usage | null;
}

export const PRICES: Record<string, { in: number; out: number }> = {
  "claude-haiku-5-5": { in: 0.1, out: 0.5 },
  "claude-sonnet-5-5": { in: 2, out: 10 },
  "claude-opus-5-5": { in: 4, out: 20 },
};

export const USER_DAILY_CALLS = 200;
export const GLOBAL_DAILY_CALLS = 5000;

export function costOf(model: string, usage: Anthropic.Usage | null): number {
  const price = PRICES[model];
  if (price === undefined || usage === null) return 0;
  const read = usage.cache_read_input_tokens ?? 0;
  const write = usage.cache_creation_input_tokens ?? 0;
  const input = usage.input_tokens * price.in + read * price.in * 0.1 + write * price.in * 1.25;
  return (input + usage.output_tokens * price.out) / 1e6;
}

const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;

export function quantile(xs: number[], q: number): number {
  const sorted = [...xs].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
}

function metricLine(rows: Row[], id: string): string {
  const values = rows.map((r) => r.grade[id]).filter((v): v is number => typeof v === "number");
  if (values.length === 0) return `${id.padEnd(14)} n/a`;
  const m = mean(values);
  const half = 1.96 * Math.sqrt(Math.max(m * (1 - m), 0) / values.length);
  const ci = id === "intensity_err" ? "" : ` ±${half.toFixed(2)}`;
  return `${id.padEnd(14)} ${m.toFixed(2)}${ci} (n ${values.length})`;
}

const METRICS = [
  "emotion",
  "poker_face",
  "intensity_err",
  "act",
  "humour",
  "joke_without_humour",
  "in_character",
  "leak",
  "filter_leak",
  "length_ok",
  "within_budget",
  "language_ok",
];

const KEYS = ["emotion", "act", "humour"] as const;

function matrixLines(rows: Row[]): string[] {
  const planned = rows.filter((r) => r.expected !== undefined);
  if (planned.length === 0) return [];
  const read = (r: Row, k: (typeof KEYS)[number]): string =>
    String((r.verdict as unknown as Record<string, unknown>)[k]);
  const matrices = KEYS.map((k) => {
    const pairs = planned.map((r) => [r.expected![k], read(r, k)] as [string, string]);
    return `confusion ${k.padEnd(8)} ${JSON.stringify(confusion(pairs))}`;
  });
  const texts = new Map<string, string[]>();
  for (const r of planned) texts.set(r.prompt_id, [...(texts.get(r.prompt_id) ?? []), r.text]);
  const repeats = [...texts.values()].reduce((s, t) => s + repeatsOf(t), 0);
  return [...matrices, `repeats        ${repeats} over ${planned.length} lines`];
}

export function summarize(variant: string, rows: Row[]): string {
  if (rows.length === 0) return `variant ${variant}: no results`;
  const ok = rows.filter((r) => r.status === "ok");
  const lineCalls = rows.flatMap((r) => r.calls);
  const appCost = lineCalls.reduce((s, c) => s + costOf(c.model, c.usage), 0);
  const judgeCost = rows.reduce((s, r) => s + costOf(r.judge_model, r.judge_usage), 0);
  const perCall = lineCalls.length > 0 ? appCost / lineCalls.length : 0;
  const latency = rows.map((r) => r.latency_s);
  const cached = lineCalls.reduce((s, c) => s + (c.usage.cache_read_input_tokens ?? 0), 0);
  return [
    `variant ${variant}: ${rows.length} cases, ${rows.length - ok.length} truncated`,
    ...METRICS.map((id) => metricLine(ok, id)),
    ...matrixLines(ok),
    `words          ${mean(rows.map((r) => r.words)).toFixed(1)} mean`,
    `latency        p50 ${quantile(latency, 0.5).toFixed(2)} s, p95 ${
      quantile(latency, 0.95).toFixed(2)
    } s`,
    `cache read     ${cached} tokens over ${lineCalls.length} calls`,
    `cost           app $${appCost.toFixed(4)}, judge $${judgeCost.toFixed(4)}, total $${
      (appCost + judgeCost).toFixed(4)
    }`,
    `per call       $${perCall.toFixed(6)}, per user-day at ${USER_DAILY_CALLS} calls $${
      (perCall * USER_DAILY_CALLS).toFixed(4)
    }, per day at ${GLOBAL_DAILY_CALLS} calls $${(perCall * GLOBAL_DAILY_CALLS).toFixed(2)}`,
  ].join("\n");
}
