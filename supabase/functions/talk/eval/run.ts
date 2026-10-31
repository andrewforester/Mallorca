import Anthropic from "@anthropic-ai/sdk";
import { handle } from "../handler.ts";
import type { Deps } from "../handler.ts";
import { completeWith } from "../model.ts";
import type { Observed } from "../model.ts";
import { checks, JUDGE_SYSTEM, judgePrompt, kindOf, score, VERDICT_SCHEMA } from "./grade.ts";
import type { EvalCase, Verdict } from "./grade.ts";
import { summarize } from "./summary.ts";
import type { Row } from "./summary.ts";

const DEFAULTS: Record<string, string> = {
  model: "claude-haiku-5-5",
  judge: "claude-sonnet-5-5",
  concurrency: "4",
  out: "./out",
  variant: "scratch",
};

function parseFlags(list: string[]): Record<string, string> {
  const flags = { ...DEFAULTS };
  for (let i = 0; i < list.length; i++) {
    const name = list[i].replace(/^--/, "");
    flags[name] = list[i + 1] ?? "";
    i++;
  }
  return flags;
}

const args = parseFlags(Deno.args);
const variant = args.variant;
const out = new URL(`${args.out}/${variant}/`, new URL(".", import.meta.url));
const cases: EvalCase[] = JSON.parse(
  await Deno.readTextFile(new URL("./cases.json", import.meta.url)),
);
const wanted = args.only ? new Set(args.only.split(",")) : null;
const selected = cases.filter((c) => wanted === null || wanted.has(c.id) || wanted.has(c.tags[0]));

await Deno.mkdir(new URL("traces/", out), { recursive: true });
const resultsUrl = new URL("results.jsonl", out);
const errorsUrl = new URL("errors.jsonl", out);
const readLines = async (url: URL): Promise<string[]> =>
  (await Deno.readTextFile(url).catch(() => "")).split("\n").filter((l) => l.trim() !== "");
const done = new Set((await readLines(resultsUrl)).map((l) => JSON.parse(l).prompt_id));

const dry = args.dry as "oracle" | "null" | undefined;
const client = dry ? null : new Anthropic({ timeout: 30_000, maxRetries: 2 });

function fakeMessage(text: string): Anthropic.Message {
  return {
    model: args.model,
    stop_reason: "end_turn",
    usage: { input_tokens: 0, output_tokens: 0 },
    content: [{ type: "text", text }],
  } as unknown as Anthropic.Message;
}

function oracle(c: EvalCase): Verdict {
  const f = c.body.feeling!;
  const kind = kindOf(f);
  const base = { in_character: true, reveals_cards: false, reason: "oracle" };
  if (kind === "open") {
    return { ...base, emotion: f.emotions[0].name, intensity: "high", projects: "none" };
  }
  if (kind === "acting") {
    return { ...base, emotion: "pride", intensity: "medium", projects: f.shows.acting! };
  }
  return { ...base, emotion: "calm", intensity: "none", projects: "none" };
}

const NULL_VERDICT: Verdict = {
  emotion: "surprise",
  intensity: "high",
  projects: "none",
  in_character: false,
  reveals_cards: false,
  reason: "null",
};

function depsFor(calls: Observed[]): Deps {
  const create = client
    ? (request: Anthropic.MessageCreateParamsNonStreaming) => client.messages.create(request)
    : () => Promise.resolve(fakeMessage(dry === "oracle" ? "Well, there we go." : "Hmm."));
  return {
    userId: () => Promise.resolve("eval"),
    consume: () => Promise.resolve(true),
    memories: () => Promise.resolve([]),
    saveLines: () => Promise.resolve(),
    saveFacts: () => Promise.resolve(),
    complete: completeWith(create, args.model, (call) => calls.push(call)),
    background: () => {},
  };
}

interface Judged {
  verdict: Verdict;
  model: string;
  usage: Anthropic.Usage | null;
}

async function judge(c: EvalCase, line: string): Promise<Judged> {
  if (!client) {
    return { verdict: dry === "oracle" ? oracle(c) : NULL_VERDICT, model: args.judge, usage: null };
  }
  const request = {
    model: args.judge,
    max_tokens: 400,
    thinking: { type: "between_tools" },
    output_config: { effort: "low", format: { type: "json_schema", schema: VERDICT_SCHEMA } },
    system: JUDGE_SYSTEM,
    messages: [{ role: "user", content: judgePrompt(c, line) }],
  } as unknown as Anthropic.MessageCreateParamsNonStreaming;
  const response = await client.messages.create(request);
  if (response.stop_reason === "refusal") throw new Error("judge refused");
  const text = response.content.map((b) => (b.type === "text" ? b.text : "")).join("");
  return { verdict: JSON.parse(text) as Verdict, model: response.model, usage: response.usage };
}

async function runCase(c: EvalCase): Promise<void> {
  const calls: Observed[] = [];
  const started = performance.now();
  const request = new Request("http://eval/talk", { method: "POST", body: JSON.stringify(c.body) });
  const response = await handle(request, depsFor(calls));
  const answer = await response.json();
  const lines = calls.filter((call) => call.purpose === "line");
  if (response.status !== 200 || lines.length === 0) {
    throw new Error(`status ${response.status}: ${JSON.stringify(answer)}`);
  }
  const first = lines[0];
  const raw = first.content.map((b) => (b.type === "text" ? b.text : "")).join("").trim();
  const judged = await judge(c, raw);
  const scores = score(c.body.feeling!, judged.verdict);
  const check = checks(c, raw);
  const row: Row = {
    prompt_id: c.id,
    prompt: c.body.kind === "reply" ? c.body.text : `[${c.body.intent.situation}]`,
    tags: c.tags,
    kind: kindOf(c.body.feeling!),
    status: first.stop_reason === "max_tokens" ? "truncated" : "ok",
    stop_reason: first.stop_reason,
    grade: {
      ...scores,
      leak: check.leak === 1 || judged.verdict.reveals_cards ? 1 : 0,
      filter_leak: check.leak,
      length_ok: check.length_ok,
      language_ok: check.language_ok,
    },
    words: check.words,
    text: raw,
    delivered: answer.text,
    verdict: judged.verdict,
    model: first.model,
    calls: calls.map((call) => ({
      purpose: call.purpose,
      model: call.model,
      usage: call.usage,
      ms: call.ms,
    })),
    latency_s: first.ms / 1000,
    case_s: (performance.now() - started) / 1000,
    judge_model: judged.model,
    judge_usage: judged.usage,
  };
  if (!dry && first.model !== args.model) {
    throw new Error(`served ${first.model}, wanted ${args.model}`);
  }
  const trace = [
    ...(first.request.system as Anthropic.TextBlockParam[]).map((b) => ({
      role: "system",
      content: b.text,
    })),
    ...first.request.messages.map((m) => ({ role: m.role, content: String(m.content) })),
    { role: "assistant", content: raw },
    { role: "user", content: `[judge]\n${judgePrompt(c, raw)}` },
    { role: "assistant", content: JSON.stringify(judged.verdict, null, 2) },
  ];
  await Deno.writeTextFile(
    new URL(`traces/${c.id}_rep0.json`, out),
    JSON.stringify(trace, null, 2),
  );
  await Deno.writeTextFile(resultsUrl, `${JSON.stringify(row)}\n`, { append: true });
}

async function attempt(c: EvalCase): Promise<void> {
  try {
    await runCase(c);
    console.log(`ok ${c.id}`);
  } catch (error) {
    console.error(`error ${c.id}: ${error}`);
    const line = { prompt_id: c.id, rep: 0, error: String(error), class: "harness" };
    await Deno.writeTextFile(errorsUrl, `${JSON.stringify(line)}\n`, { append: true });
  }
}

const queue = selected.filter((c) => !done.has(c.id));
const workers = Array.from({ length: Number(args.concurrency) }, async () => {
  for (let c = queue.shift(); c !== undefined; c = queue.shift()) await attempt(c);
});
await Promise.all(workers);

const rows: Row[] = (await readLines(resultsUrl)).map((l) => JSON.parse(l));
console.log(summarize(variant, rows));
