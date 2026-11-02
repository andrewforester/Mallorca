import Anthropic from "@anthropic-ai/sdk";
import { handle, parseSpoken } from "../handler.ts";
import type { Deps } from "../handler.ts";
import { completeWith, createFrom, parseData } from "../model.ts";
import type { Observed } from "../model.ts";
import {
  checks,
  JUDGE_SYSTEM,
  judgePrompt,
  kindOf,
  LEVEL_VALUE,
  LEVELS,
  score,
  VERDICT_SCHEMA,
} from "./grade.ts";
import type { EvalCase, Level, Verdict } from "./grade.ts";
import {
  PLAN_JUDGE_SYSTEM,
  PLAN_VERDICT_SCHEMA,
  planChecks,
  planJudgePrompt,
  planScore,
} from "./gradePlan.ts";
import type { PlanCase, PlanVerdict } from "./gradePlan.ts";
import { examplesBlock } from "./examples.ts";
import { costOf, summarize } from "./summary.ts";
import type { Row } from "./summary.ts";

const DEFAULTS: Record<string, string> = {
  model: "claude-haiku-5-5",
  judge: "claude-sonnet-5-5",
  concurrency: "4",
  out: "./out",
  variant: "scratch",
  budget: "0.25",
  cases: "v2",
  repeat: "1",
  examples: "off",
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
const casesFile = args.cases === "v1" ? "./cases.v1.json" : "./cases.json";
const cases: (EvalCase | PlanCase)[] = JSON.parse(
  await Deno.readTextFile(new URL(casesFile, import.meta.url)),
);
const isPlan = (c: EvalCase | PlanCase): c is PlanCase => "version" in c.body;
const repeat = Number(args.repeat);
const wanted = args.only ? new Set(args.only.split(",")) : null;
const selected = cases.filter((c) => wanted === null || wanted.has(c.id) || wanted.has(c.tags[0]));

await Deno.mkdir(new URL("traces/", out), { recursive: true });
const resultsUrl = new URL("results.jsonl", out);
const errorsUrl = new URL("errors.jsonl", out);
const readLines = async (url: URL): Promise<string[]> =>
  (await Deno.readTextFile(url).catch(() => "")).split("\n").filter((l) => l.trim() !== "");
const earlier: Row[] = (await readLines(resultsUrl)).map((l) => JSON.parse(l));
const keyOf = (id: string, rep: number): string => `${id}#${rep}`;
const done = new Set(earlier.map((r) => keyOf(r.prompt_id, r.rep ?? 0)));
const rowCost = (r: Row): number =>
  r.calls.reduce((s, c) => s + costOf(c.model, c.usage), 0) + costOf(r.judge_model, r.judge_usage);
let spent = earlier.reduce((s, r) => s + rowCost(r), 0);
const budget = Number(args.budget);

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

function nearest(value: number): Level {
  return LEVELS.reduce((a, b) =>
    Math.abs(LEVEL_VALUE[b] - value) < Math.abs(LEVEL_VALUE[a] - value) ? b : a
  );
}

function planOracle(c: PlanCase): PlanVerdict {
  const { plan } = c.body;
  return {
    reason: "oracle",
    emotion: plan.voice.emotion,
    intensity: nearest(plan.voice.intensity),
    act: plan.act,
    humour: plan.humour?.style ?? "none",
    in_character: true,
    reveals_cards: false,
  };
}

const NULL_PLAN_VERDICT: PlanVerdict = {
  reason: "null",
  emotion: "surprise",
  intensity: "high",
  act: "stall",
  humour: "aggressive",
  in_character: false,
  reveals_cards: false,
};

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
  const create = client ? createFrom(client) : () => Promise.resolve(fakeMessage("Hm."));
  const complete = completeWith(create, args.model, (call) => calls.push(call));
  return {
    userId: () => Promise.resolve("eval"),
    consume: () => Promise.resolve(true),
    memories: () => Promise.resolve([]),
    saveLines: () => Promise.resolve(),
    saveFacts: () => Promise.resolve(),
    complete: args.examples === "on" ? withExamples(complete) : complete,
    background: () => {},
  };
}

function withExamples(complete: Deps["complete"]): Deps["complete"] {
  return (input) => {
    if (input.purpose !== "line") return complete(input);
    const [first, ...rest] = input.system;
    const system = [{ ...first, text: `${first.text}\n${examplesBlock()}` }, ...rest];
    return complete({ ...input, system });
  };
}

interface Judged<V> {
  verdict: V;
  model: string;
  usage: Anthropic.Usage | null;
}

async function askJudge<V>(system: string, schema: unknown, content: string): Promise<Judged<V>> {
  const request = {
    model: args.judge,
    max_tokens: 400,
    thinking: { type: "between_tools" },
    output_config: { effort: "low", format: { type: "json_schema", schema } },
    system,
    messages: [{ role: "user", content }],
  } as unknown as Anthropic.MessageCreateParamsNonStreaming;
  const response = await client!.messages.create(request);
  if (response.stop_reason === "refusal") throw new Error("judge refused");
  const text = response.content.map((b) => (b.type === "text" ? b.text : "")).join("");
  return { verdict: JSON.parse(text) as V, model: response.model, usage: response.usage };
}

async function judge(c: EvalCase, line: string): Promise<Judged<Verdict>> {
  if (!client) {
    return { verdict: dry === "oracle" ? oracle(c) : NULL_VERDICT, model: args.judge, usage: null };
  }
  return await askJudge<Verdict>(JUDGE_SYSTEM, VERDICT_SCHEMA, judgePrompt(c, line));
}

async function judgePlan(c: PlanCase, line: string): Promise<Judged<PlanVerdict>> {
  if (!client) {
    const verdict = dry === "oracle" ? planOracle(c) : NULL_PLAN_VERDICT;
    return { verdict, model: args.judge, usage: null };
  }
  return await askJudge<PlanVerdict>(
    PLAN_JUDGE_SYSTEM,
    PLAN_VERDICT_SCHEMA,
    planJudgePrompt(c, line),
  );
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
  const output = first.content.map((b) => (b.type === "text" ? b.text : "")).join("");
  const spoken = parseSpoken(parseData(output), output);
  const raw = spoken.text;
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
    delivery: spoken.delivery,
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
  spent += rowCost(row);
  await Deno.writeTextFile(resultsUrl, `${JSON.stringify(row)}\n`, { append: true });
}

async function writeTrace(name: string, request: Observed["request"], tail: unknown[]) {
  const trace = [
    ...(request.system as Anthropic.TextBlockParam[]).map((b) => ({
      role: "system",
      content: b.text,
    })),
    ...request.messages.map((m) => ({ role: m.role, content: String(m.content) })),
    ...tail,
  ];
  await Deno.writeTextFile(new URL(`traces/${name}.json`, out), JSON.stringify(trace, null, 2));
}

async function runPlanCase(c: PlanCase, rep: number): Promise<void> {
  const calls: Observed[] = [];
  const started = performance.now();
  const request = new Request("http://eval/talk", { method: "POST", body: JSON.stringify(c.body) });
  const response = await handle(request, depsFor(calls));
  const answer = await response.json();
  const lines = calls.filter((call) => call.purpose === "line");
  const raw: string | undefined = answer.attempts?.[0]?.text;
  if (response.status !== 200 || lines.length === 0 || raw === undefined) {
    throw new Error(`status ${response.status}: ${JSON.stringify(answer)}`);
  }
  const first = lines[0];
  const { plan } = c.body;
  const judged = await judgePlan(c, raw);
  const scores = planScore(plan, judged.verdict);
  const check = planChecks(plan, raw, c.language);
  const row: Row = {
    prompt_id: c.id,
    rep,
    prompt: c.body.kind === "reply" ? c.body.text : `[${plan.act}] ${plan.occasion}`,
    tags: c.tags,
    kind: "plan",
    status: first.stop_reason === "max_tokens" ? "truncated" : "ok",
    stop_reason: first.stop_reason,
    grade: {
      ...scores,
      within_budget: check.within_budget,
      language_ok: check.language_ok,
      filter_leak: check.leak,
      leak: check.leak === 1 || judged.verdict.reveals_cards ? 1 : 0,
    },
    words: check.words,
    text: raw,
    delivered: answer.text ?? "",
    expected: { emotion: plan.voice.emotion, act: plan.act, humour: plan.humour?.style ?? "none" },
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
  await writeTrace(`${c.id}_rep${rep}`, first.request, [
    { role: "assistant", content: JSON.stringify(answer.attempts) },
    { role: "user", content: `[judge]\n${planJudgePrompt(c, raw)}` },
    { role: "assistant", content: JSON.stringify(judged.verdict, null, 2) },
  ]);
  spent += rowCost(row);
  await Deno.writeTextFile(resultsUrl, `${JSON.stringify(row)}\n`, { append: true });
}

interface Job {
  c: EvalCase | PlanCase;
  rep: number;
}

async function attempt({ c, rep }: Job): Promise<void> {
  try {
    if (isPlan(c)) await runPlanCase(c, rep);
    else await runCase(c);
    console.log(`ok ${c.id}#${rep}`);
  } catch (error) {
    console.error(`error ${c.id}#${rep}: ${error}`);
    const line = { prompt_id: c.id, rep, error: String(error), class: "harness" };
    await Deno.writeTextFile(errorsUrl, `${JSON.stringify(line)}\n`, { append: true });
  }
}

const queue: Job[] = selected
  .flatMap((c) => Array.from({ length: isPlan(c) ? repeat : 1 }, (_, rep) => ({ c, rep })))
  .filter((job) => !done.has(keyOf(job.c.id, job.rep)));
const workers = Array.from({ length: Number(args.concurrency) }, async () => {
  for (let job = queue.shift(); job !== undefined; job = queue.shift()) {
    if (spent >= budget) {
      console.error(`budget $${budget} reached at $${spent.toFixed(4)}, skipping ${job.c.id}`);
      continue;
    }
    await attempt(job);
  }
});
await Promise.all(workers);

const rows: Row[] = (await readLines(resultsUrl)).map((l) => JSON.parse(l));
console.log(summarize(variant, rows));
