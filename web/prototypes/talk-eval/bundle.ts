import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';

const EVAL = new URL('../../../supabase/functions/talk/eval/', import.meta.url);
const OUT = new URL('out/', EVAL);
const REPORT = new URL('report.json', import.meta.url);
const VARIANTS = ['v2', 'v2-examples', 'v2-sonnet', 'baseline'];

const PRICES: Record<string, { in: number; out: number }> = {
  'claude-haiku-5-5': { in: 0.1, out: 0.5 },
  'claude-sonnet-5-5': { in: 2, out: 10 },
  'claude-opus-5-5': { in: 4, out: 20 },
};

interface Usage {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
}

interface Call {
  purpose: string;
  model: string;
  usage: Usage;
  ms: number;
}

interface Row {
  prompt_id: string;
  rep?: number;
  tags: string[];
  kind: string;
  grade: Record<string, number | null>;
  words: number;
  text: string;
  delivered: string;
  expected?: Record<string, string>;
  verdict: Record<string, unknown>;
  model: string;
  calls: Call[];
  latency_s: number;
  judge_model: string;
  judge_usage: Usage | null;
}

interface Turn {
  role: string;
  content: string;
}

const json = (url: URL): unknown => JSON.parse(readFileSync(url, 'utf8'));

function costOf(model: string, usage: Usage | null): number {
  const price = PRICES[model];
  if (price === undefined || usage === null) return 0;
  const read = usage.cache_read_input_tokens ?? 0;
  const write = usage.cache_creation_input_tokens ?? 0;
  const input = usage.input_tokens * price.in + read * price.in * 0.1 + write * price.in * 1.25;
  return (input + usage.output_tokens * price.out) / 1e6;
}

const systems: Record<string, string> = {};

function keep(text: string): string {
  const key = createHash('sha1').update(text).digest('hex').slice(0, 10);
  systems[key] = text;
  return key;
}

function traceOf(dir: URL, row: Row) {
  const file = new URL(`traces/${row.prompt_id}_rep${row.rep ?? 0}.json`, dir);
  if (!existsSync(file)) return null;
  const turns = json(file) as Turn[];
  const system = turns.filter((t) => t.role === 'system').map((t) => keep(t.content));
  const rest = turns.filter((t) => t.role !== 'system');
  const judgeAt = rest.findIndex((t) => t.role === 'user' && t.content.startsWith('[judge]'));
  const head = judgeAt < 0 ? rest : rest.slice(0, judgeAt - 1);
  const answer = judgeAt < 0 ? null : (rest[judgeAt - 1]?.content ?? null);
  const judge = judgeAt < 0 ? null : rest[judgeAt]!.content.replace(/^\[judge\]\n/, '');
  return { system, messages: head, answer, judge };
}

const mean = (xs: number[]): number | null =>
  xs.length === 0 ? null : xs.reduce((a, b) => a + b, 0) / xs.length;

function quantile(xs: number[], q: number): number {
  const sorted = [...xs].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? 0;
}

const flat = (t: string): string =>
  t
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

function summaryOf(rows: Row[]) {
  const keys = new Set(rows.flatMap((r) => Object.keys(r.grade)));
  const metrics: Record<string, { mean: number | null; n: number }> = {};
  for (const k of keys) {
    const values = rows.map((r) => r.grade[k]).filter((v): v is number => typeof v === 'number');
    metrics[k] = { mean: mean(values), n: values.length };
  }
  const groups = new Map<string, string[]>();
  rows.forEach((r) => groups.set(r.prompt_id, [...(groups.get(r.prompt_id) ?? []), flat(r.text)]));
  const repeats = [...groups.values()].reduce((s, t) => s + t.length - new Set(t).size, 0);
  const app = rows.flatMap((r) => r.calls).reduce((s, c) => s + costOf(c.model, c.usage), 0);
  const judge = rows.reduce((s, r) => s + costOf(r.judge_model, r.judge_usage), 0);
  const latency = rows.map((r) => r.latency_s);
  return {
    rows: rows.length,
    metrics,
    repeats,
    words: mean(rows.map((r) => r.words)),
    latency: { p50: quantile(latency, 0.5), p95: quantile(latency, 0.95) },
    cost: { app, judge },
    model: rows[0]?.model ?? '',
    judgeModel: rows[0]?.judge_model ?? '',
  };
}

function variantOf(name: string) {
  const dir = new URL(`${name}/`, OUT);
  const file = new URL('results.jsonl', dir);
  if (!existsSync(file)) return null;
  const rows = readFileSync(file, 'utf8')
    .split('\n')
    .filter((l) => l.trim() !== '')
    .map((l) => JSON.parse(l) as Row);
  return {
    summary: summaryOf(rows),
    rows: rows.map((r) => ({
      id: r.prompt_id,
      rep: r.rep ?? 0,
      kind: r.kind,
      text: r.text,
      delivered: r.delivered,
      words: r.words,
      grade: r.grade,
      expected: r.expected ?? null,
      verdict: r.verdict,
      latency: r.latency_s,
      cost: r.calls.reduce((s, c) => s + costOf(c.model, c.usage), 0),
      calls: r.calls.map((c) => ({ purpose: c.purpose, model: c.model, ms: c.ms, usage: c.usage })),
      trace: traceOf(dir, r),
    })),
  };
}

const variants = Object.fromEntries(
  VARIANTS.map((v) => [v, variantOf(v)]).filter(([, v]) => v !== null),
);
const pairsDir = new URL('pairs/', OUT);
const pairs = existsSync(pairsDir)
  ? readdirSync(pairsDir)
      .filter((f) => f.endsWith('.json') && !f.startsWith('dry'))
      .map((f) => json(new URL(f, pairsDir)))
  : [];
const characterFile = new URL('character/v2.json', OUT);
const character = existsSync(characterFile) ? json(characterFile) : null;
const cases = json(new URL('cases.json', EVAL)) as { id: string }[];
const casesV1 = json(new URL('cases.v1.json', EVAL)) as { id: string }[];

writeFileSync(
  REPORT,
  `${JSON.stringify({
    generatedAt: new Date().toISOString(),
    variants,
    systems,
    pairs,
    character,
    cases: Object.fromEntries(cases.map((c) => [c.id, c])),
    casesV1: Object.fromEntries(casesV1.map((c) => [c.id, c])),
  })}\n`,
);
console.log(`report: ${Object.keys(variants).join(', ')}; ${pairs.length} pair runs`);
