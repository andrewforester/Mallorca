export interface Usage {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
}

export interface Trace {
  system: string[];
  messages: { role: string; content: string }[];
  answer: string | null;
  judge: string | null;
}

export interface ReportRow {
  id: string;
  rep: number;
  kind: string;
  text: string;
  delivered: string;
  words: number;
  grade: Record<string, number | null>;
  expected: Record<string, string> | null;
  verdict: Record<string, unknown>;
  latency: number;
  cost: number;
  calls: { purpose: string; model: string; ms: number; usage: Usage }[];
  trace: Trace | null;
}

export interface Summary {
  rows: number;
  metrics: Record<string, { mean: number | null; n: number }>;
  repeats: number;
  words: number | null;
  latency: { p50: number; p95: number };
  cost: { app: number; judge: number };
  model: string;
  judgeModel: string;
}

export interface Variant {
  summary: Summary;
  rows: ReportRow[];
}

export interface PairRun {
  a: string;
  b: string;
  wins: number;
  n: number;
  share: number;
  half: number;
  records: { id: string; context: string; a: string; b: string; winner: string; reason: string }[];
}

export type BigFive = Record<string, number>;

export interface Character {
  r: number;
  report: Record<string, { given: BigFive; judged: BigFive; lines: string[] }>;
}

export interface PlanCase {
  id: string;
  tags: string[];
  language: string;
  body: {
    kind: string;
    locale: string;
    text?: string;
    personality: BigFive;
    recent: { speaker: string; text: string }[];
    plan: Record<string, unknown>;
  };
}

export interface Report {
  generatedAt: string;
  variants: Record<string, Variant>;
  systems: Record<string, string>;
  pairs: PairRun[];
  character: Character | null;
  cases: Record<string, PlanCase>;
  casesV1: Record<string, { body: Record<string, unknown> }>;
}

export const VARIANT_LABEL: Record<string, string> = {
  v2: 'Версия 2, Haiku 5.5',
  'v2-examples': 'Версия 2 с примерами реплик',
  'v2-sonnet': 'Версия 2, Sonnet 5.5',
  baseline: 'Версия 1, как было',
};

export const METRIC_LABEL: Record<string, string> = {
  emotion: 'судья услышал ту же эмоцию',
  act: 'судья узнал акт',
  humour: 'юмор совпал с планом',
  joke_without_humour: 'шутка без плана',
  in_character: 'живая речь, без ремарок',
  within_budget: 'в бюджете слов',
  leak: 'судья считает, что она выдала руку',
  language_ok: 'язык игрока',
  intensity_err: 'ошибка силы эмоции',
  poker_face: 'покерфейс (v1)',
  length_ok: 'длина до 2 фраз (v1)',
  filter_leak: 'утечка по фильтру',
};

export const LOWER_IS_BETTER = new Set([
  'joke_without_humour',
  'leak',
  'intensity_err',
  'filter_leak',
]);
