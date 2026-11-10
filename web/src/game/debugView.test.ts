import { describe, expect, it } from 'vitest';
import { parseCards } from '../cards/index.ts';
import { BIAS_KEYS, EMOTIONS, PERSONALITIES, createPersona, styleOf } from '../persona/index.ts';
import { mulberry32 } from '../cards/index.ts';
import type { DebugState } from './debug.ts';
import { EMPTY_TRACE } from './conversationTrace.ts';
import { toDebugView } from './debugView.ts';

function state(extra: Partial<DebugState> = {}): DebugState {
  const persona = createPersona({ seat: 1, rng: mulberry32(1) });
  persona.observe([], 0);
  persona.hear(['mockBluff']);
  return {
    personality: { key: 'lola' },
    snapshot: persona.view(2000).snapshot,
    sentBias: { aggression: 1.2, bluff: 1, tightness: 0.8, sizing: 1, stickiness: 1 },
    decision: null,
    journal: persona.journal().map((e) => ({ ...e, spoke: false })),
    conversation: EMPTY_TRACE,
    ...extra,
  };
}

describe('toDebugView', () => {
  it('shows the personality with its Big Five and derived traits', () => {
    const view = toDebugView(state());
    expect(view.personality).toEqual({ key: 'lola' });
    expect(view.bigFive).toEqual(PERSONALITIES.lola.bigFive);
    expect(view.suppression).toBe(PERSONALITIES.lola.suppression);
    expect('experience' in view).toBe(false);
    expect(view.control).toBe(PERSONALITIES.lola.control);
    expect(view.traits?.gains.map(([e]) => e)).toEqual([...EMOTIONS]);
    const traits = state().snapshot?.traits;
    expect(view.traits?.selfBlame).toBe(traits?.selfBlame);
    expect(view.traits?.coping).toBe(traits?.coping);
    expect(view.traits?.urgency).toBe(traits?.urgency);
  });

  it('lists the emotions, the parts of the strain and the bias in their fixed order', () => {
    const view = toDebugView(state());
    expect(view.emotions.map(([e]) => e)).toEqual([...EMOTIONS]);
    expect(view.emotions.find(([e]) => e === 'anger')?.[1]).toBeGreaterThan(0);
    expect(view.load?.parts.map(([s]) => s)).toEqual([...EMOTIONS, 'mood']);
    const load = state().snapshot?.load;
    expect(view.load?.intensity).toBe(load?.intensity);
    expect(view.load?.reach).toBe(load?.reach);
    expect(view.load?.overload).toBe(load?.overload);
    expect(view.load?.composure).toBe(load?.composure);
    expect(view.approach).toBe(state().snapshot?.approach);
    expect(view.push.map(([k]) => k)).toEqual([...BIAS_KEYS]);
    expect(view.engineBias.map(([k]) => k)).toEqual([...BIAS_KEYS]);
    expect(view.baseline).toEqual(
      BIAS_KEYS.map((k) => [k, styleOf(PERSONALITIES.lola.bigFive)[k]]),
    );
    expect(view.sentBias).toEqual(state().sentBias);
    expect(view.journal).toHaveLength(1);
  });

  it('is empty without a feeling', () => {
    const view = toDebugView(state({ snapshot: null, sentBias: null, journal: [] }));
    expect(view.traits).toBeNull();
    expect(view.load).toBeNull();
    expect(view.mood).toBeNull();
    expect(view.approach).toBeNull();
    expect(view.push.every(([, v]) => v === 0)).toBe(true);
    expect(view.emotions.every(([, v]) => v === 0)).toBe(true);
    expect(view.engineBias.every(([, v]) => v === 1)).toBe(true);
    expect(view.baseline.map(([k]) => k)).toEqual([...BIAS_KEYS]);
  });

  it('keeps the rows of the last decision', () => {
    const [a, b] = parseCards('Kc Qc');
    const decision = {
      hand: [a ?? 0, b ?? 0] as [number, number],
      board: [],
      rows: [
        {
          move: { label: 'fold' as const, amount: 0, tone: 'fold' as const },
          base: 0.4,
          biased: 0.3,
          chosen: false,
        },
        {
          move: { label: 'call' as const, amount: 10, tone: 'passive' as const },
          base: 0.6,
          biased: 0.7,
          chosen: true,
        },
      ],
      action: { label: 'call' as const, amount: 10, tone: 'passive' as const },
    };
    const view = toDebugView(state({ decision }));
    expect(view.decision).toEqual(decision);
  });

  it('shows a custom personality', () => {
    const custom = { ...PERSONALITIES.nina, suppression: 1 };
    const view = toDebugView(state({ personality: { key: 'custom', personality: custom } }));
    expect(view.suppression).toBe(1);
  });
});

describe('the push of her state', () => {
  it('is the exponent that moves her nature to the bias she plays now', () => {
    const view = toDebugView(state());
    const s = state().snapshot;
    for (const [k, push] of view.push) {
      const nature = s?.traits.nature[k] ?? 0;
      expect(2 ** Math.tanh(Math.atanh(0.8) * nature + push)).toBeCloseTo(s?.bias[k] ?? 0, 9);
    }
  });
});
