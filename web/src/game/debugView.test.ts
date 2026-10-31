import { describe, expect, it } from 'vitest';
import { parseCards } from '../cards/index.ts';
import { EMOTIONS, LOAD_SOURCES, PERSONALITIES, STYLE_KEYS, createTalk } from '../talk/index.ts';
import { mulberry32 } from '../cards/index.ts';
import type { DebugState } from './debug.ts';
import { toDebugView } from './debugView.ts';

function state(extra: Partial<DebugState> = {}): DebugState {
  const talk = createTalk({ seat: 1, rng: mulberry32(1), level: 'subtle' });
  talk.hear(['mockBluff']);
  return {
    personality: { key: 'lola' },
    snapshot: talk.feeling(),
    sentStyle: { aggression: 1.2, bluff: 1, tightness: 0.8, sizing: 1, stickiness: 1 },
    decision: null,
    journal: talk.journal(),
    ...extra,
  };
}

describe('toDebugView', () => {
  it('shows the personality with its Big Five and derived traits', () => {
    const view = toDebugView(state());
    expect(view.personality).toEqual({ key: 'lola' });
    expect(view.bigFive).toEqual(PERSONALITIES.lola.bigFive);
    expect(view.suppression).toBe(PERSONALITIES.lola.suppression);
    expect(view.experience).toBe(PERSONALITIES.lola.experience);
    expect(view.traits?.gains.map(([e]) => e)).toEqual([...EMOTIONS]);
  });

  it('lists the emotions, the load sources and the style in their fixed order', () => {
    const view = toDebugView(state());
    expect(view.emotions.map(([e]) => e)).toEqual([...EMOTIONS]);
    expect(view.emotions.find(([e]) => e === 'anger')?.[1]).toBeGreaterThan(0);
    expect(view.load?.sources.map(([s]) => s)).toEqual([...LOAD_SOURCES]);
    expect(view.engineStyle.map(([k]) => k)).toEqual([...STYLE_KEYS]);
    expect(view.sentStyle).toEqual(state().sentStyle);
    expect(view.journal).toHaveLength(1);
  });

  it('is empty without a feeling', () => {
    const view = toDebugView(state({ snapshot: null, sentStyle: null, journal: [] }));
    expect(view.traits).toBeNull();
    expect(view.load).toBeNull();
    expect(view.mood).toBeNull();
    expect(view.emotions.every(([, v]) => v === 0)).toBe(true);
    expect(view.engineStyle.every(([, v]) => v === 1)).toBe(true);
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
          styled: 0.3,
          chosen: false,
        },
        {
          move: { label: 'call' as const, amount: 10, tone: 'passive' as const },
          base: 0.6,
          styled: 0.7,
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
