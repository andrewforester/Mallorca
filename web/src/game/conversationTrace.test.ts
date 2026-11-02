import { describe, expect, it } from 'vitest';
import { NO_HAND } from '../persona/hand.ts';
import type { Planned, UtterancePlan, Verdict } from '../conversation/index.ts';
import { TRACE_SIZE, createTrace } from './conversationTrace.ts';

function verdict(speak: boolean, reason: Verdict['reason'] = null): Verdict {
  return {
    occasion: {
      kind: 'herCall',
      end: null,
      impulses: [],
      journalIds: [7],
      handNumber: 1,
      street: 'flop',
      actionStreet: 'flop',
      strength: 'medium',
      endsHand: false,
      hand: NO_HAND,
      text: null,
      previous: null,
    },
    matched: [],
    rule: 'herCall',
    act: 'react',
    chance: null,
    roll: 0.5,
    sinceLastMs: null,
    speak,
    reason,
    claim: null,
  };
}

const plan = { act: 'react', words: { min: 1, max: 3 } } as unknown as UtterancePlan;

const silent = (reason: Verdict['reason']): Planned => ({
  verdicts: [verdict(false, reason)],
  plan: null,
  humour: null,
});

const speaking: Planned = { verdicts: [verdict(true)], plan, humour: null };

describe('the trace', () => {
  it(`keeps the newest ${TRACE_SIZE} entries, newest first`, () => {
    const trace = createTrace();
    for (let i = 0; i < TRACE_SIZE + 1; i++) trace.add(silent('roll'), i);
    const { entries } = trace.read();
    expect(entries).toHaveLength(TRACE_SIZE);
    expect(entries[0]?.atMs).toBe(TRACE_SIZE);
    expect(entries.at(-1)?.atMs).toBe(1);
  });

  it('gives each verdict an entry and marks a silent one at once', () => {
    const trace = createTrace();
    const both: Planned = {
      verdicts: [verdict(true), verdict(false, 'superseded')],
      plan,
      humour: null,
    };
    const ids = trace.add(both, 5);
    expect(ids).toHaveLength(1);
    const [newest, oldest] = trace.read().entries;
    expect(newest?.fate).toBe('pending');
    expect(newest?.plan).toBe(plan);
    expect(oldest?.fate).toBe('silent');
    expect(oldest?.plan).toBeNull();
  });

  it('records the request, the answer and the fate of a line', () => {
    const trace = createTrace();
    const [id] = trace.add(speaking, 10);
    trace.sent(id as number, 11, null);
    const attempts = [
      { text: 'Hm, well, all right.', rejected: ['longer than 3 words'] },
      { text: 'Hm.', rejected: [] },
    ];
    const prompt = { system: 'S', state: 'T' };
    trace.answered(id as number, { text: 'Hm.', attempts, prompt }, 900, 'shown');
    expect(trace.read().entries[0]).toMatchObject({
      request: { sentAtMs: 11, prompt },
      answer: { atMs: 900, attempts, text: 'Hm.' },
      fate: 'shown',
    });
  });

  it('counts the occasions, lines, silences, words and rejections', () => {
    const trace = createTrace();
    trace.add(silent('roll'), 1);
    trace.add(silent('roll'), 2);
    trace.add(silent('pace'), 3);
    const [a] = trace.add(speaking, 4);
    const [b] = trace.add(speaking, 5);
    trace.answered(
      a as number,
      {
        text: 'Ну конечно.',
        attempts: [
          { text: 'x y z w', rejected: ['longer than 3 words', 'named Qs'] },
          { text: 'Ну конечно.', rejected: [] },
        ],
        prompt: null,
      },
      6,
      'shown',
    );
    trace.answered(
      b as number,
      { text: 'Хм.', attempts: [{ text: 'Хм.', rejected: [] }], prompt: null },
      7,
      'stale',
    );
    expect(trace.read().totals).toEqual({
      occasions: 5,
      lines: 1,
      silences: { roll: 2, pace: 1 },
      meanWords: 2,
      rejections: { 'longer than 3 words': 1, 'named Qs': 1 },
    });
  });

  it('sets a fate without an answer', () => {
    const trace = createTrace();
    const [id] = trace.add(speaking, 1);
    trace.fate(id as number, 'noClient');
    expect(trace.read().entries[0]?.fate).toBe('noClient');
  });

  it('tells its owner after every change', () => {
    let changes = 0;
    const trace = createTrace(() => (changes += 1));
    const [id] = trace.add(speaking, 1);
    trace.sent(id as number, 2, null);
    trace.answered(id as number, null, 3, 'error');
    trace.fate(id as number, 'stale');
    expect(changes).toBe(4);
  });
});
