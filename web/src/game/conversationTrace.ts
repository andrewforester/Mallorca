import type {
  HumourDraw,
  Planned,
  Silence,
  UtterancePlan,
  Verdict,
} from '../conversation/index.ts';
import type { Attempt, LineAnswer, PromptEcho } from './conversationClient.ts';

export const TRACE_SIZE = 50;

export type Fate =
  'shown' | 'stale' | 'filtered' | 'error' | 'noClient' | 'off' | 'silent' | 'pending';

export interface TraceEntry {
  id: number;
  atMs: number;
  verdict: Verdict;
  plan: UtterancePlan | null;
  humour: HumourDraw | null;
  request: { sentAtMs: number; prompt: PromptEcho | null } | null;
  answer: { atMs: number; attempts: Attempt[]; text: string | null } | null;
  fate: Fate;
}

export interface TraceTotals {
  occasions: number;
  lines: number;
  silences: Partial<Record<Silence, number>>;
  meanWords: number;
  rejections: Record<string, number>;
}

export interface ConversationTrace {
  entries: TraceEntry[];
  totals: TraceTotals;
}

export interface TraceSink {
  add(planned: Planned, nowMs: number): number[];
  sent(id: number, atMs: number, prompt: PromptEcho | null): void;
  answered(id: number, answer: LineAnswer | null, atMs: number, fate: Fate): void;
  fate(id: number, fate: Fate): void;
  read(): ConversationTrace;
}

const WORD = /[\p{L}\p{N}]+/gu;

const wordsIn = (text: string): number => text.match(WORD)?.length ?? 0;

function totalsOf(entries: readonly TraceEntry[]): TraceTotals {
  const silences: Partial<Record<Silence, number>> = {};
  const rejections: Record<string, number> = {};
  const shown: string[] = [];
  for (const entry of entries) {
    const { reason } = entry.verdict;
    if (reason !== null) silences[reason] = (silences[reason] ?? 0) + 1;
    for (const attempt of entry.answer?.attempts ?? []) {
      attempt.rejected.forEach((r) => (rejections[r] = (rejections[r] ?? 0) + 1));
    }
    if (entry.fate === 'shown' && entry.answer?.text) shown.push(entry.answer.text);
  }
  const words = shown.reduce((sum, text) => sum + wordsIn(text), 0);
  return {
    occasions: entries.length,
    lines: shown.length,
    silences,
    meanWords: shown.length === 0 ? 0 : words / shown.length,
    rejections,
  };
}

export const EMPTY_TRACE: ConversationTrace = {
  entries: [],
  totals: { occasions: 0, lines: 0, silences: {}, meanWords: 0, rejections: {} },
};

export function createTrace(onChange: () => void = () => undefined): TraceSink {
  let entries: TraceEntry[] = [];
  let nextId = 0;
  const update = (id: number, patch: Partial<TraceEntry>) => {
    entries = entries.map((e) => (e.id === id ? { ...e, ...patch } : e));
    onChange();
  };
  return {
    add(planned, nowMs) {
      const fresh = planned.verdicts.map((verdict): TraceEntry => {
        nextId += 1;
        return {
          id: nextId,
          atMs: nowMs,
          verdict,
          plan: verdict.speak ? planned.plan : null,
          humour: verdict.speak ? planned.humour : null,
          request: null,
          answer: null,
          fate: verdict.speak ? 'pending' : 'silent',
        };
      });
      entries = [...fresh, ...entries].slice(0, TRACE_SIZE);
      onChange();
      return fresh.filter((e) => e.fate === 'pending').map((e) => e.id);
    },
    sent: (id, atMs, prompt) => update(id, { request: { sentAtMs: atMs, prompt } }),
    answered(id, answer, atMs, fate) {
      const entry = entries.find((e) => e.id === id);
      const request =
        entry?.request && answer?.prompt
          ? { ...entry.request, prompt: answer.prompt }
          : entry?.request;
      update(id, {
        request: request ?? null,
        answer: answer === null ? null : { atMs, attempts: answer.attempts, text: answer.text },
        fate,
      });
    },
    fate: (id, fate) => update(id, { fate }),
    read: () => ({ entries, totals: totalsOf(entries) }),
  };
}
