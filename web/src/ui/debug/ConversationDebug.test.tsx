import { cleanup, fireEvent, render, screen, within } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ConversationTrace, TraceEntry } from '../../game/index.ts';
import { ConversationDebug } from './ConversationDebug.tsx';

afterEach(() => cleanup());

type Occasion = TraceEntry['verdict']['occasion'];
type Plan = NonNullable<TraceEntry['plan']>;

const occasion = (patch: Partial<Occasion> = {}): Occasion => ({
  kind: 'playerRaise',
  end: null,
  impulses: [{ emotion: 'fear', amount: 0.34, reason: 'his raise' }],
  journalIds: [12],
  handNumber: 12,
  street: 'turn',
  actionStreet: 'turn',
  strength: 'medium',
  endsHand: false,
  hand: {} as Occasion['hand'],
  text: null,
  previous: null,
  ...patch,
});

const silent: TraceEntry = {
  id: 1,
  atMs: 1000,
  verdict: {
    occasion: occasion(),
    matched: [
      { id: 'playerRaise.fear', act: 'stall', chance: 0.35 },
      { id: 'playerRaise', act: 'react', chance: 0.35 },
    ],
    rule: 'playerRaise.fear',
    act: 'stall',
    chance: { base: 0.35, masked: 0.29, speakFactor: 1.08, final: 0.31 },
    roll: 0.47,
    sinceLastMs: 4100,
    speak: false,
    reason: 'roll',
    claim: null,
  },
  plan: null,
  humour: null,
  request: null,
  answer: null,
  fate: 'silent',
};

const plan = {
  version: 2,
  act: 'deflect',
  occasion: 'the player raised on the turn',
  voice: { emotion: 'fear', intensity: 0.21 },
  words: { min: 1, max: 4 },
  humour: null,
  claim: null,
  facts: {
    street: 'turn',
    board: [],
    potBb: 14,
    stacksBb: { her: 90, player: 96 },
    actions: [],
    card: null,
    result: null,
    shown: null,
  },
  heard: null,
  session: { hands: 3, netBb: 0, playerBluffsShown: 0, playerAllIns: 0, notable: [] },
  handNumber: 12,
  street: 'turn',
  actionStreet: 'turn',
  endsHand: false,
} as Plan;

const spoken: TraceEntry = {
  ...silent,
  id: 2,
  atMs: 2000,
  verdict: { ...silent.verdict, speak: true, reason: null, roll: 0.12, act: 'deflect' },
  plan,
  request: { sentAtMs: 2000, prompt: { system: 'You are Mallorca.', state: 'Act: deflect' } },
  answer: {
    atMs: 2840,
    attempts: [
      { text: 'Well, let us see what you have there', rejected: ['longer than 4 words'] },
      { text: 'We will see.', rejected: [] },
    ],
    text: 'We will see.',
  },
  fate: 'shown',
};

const trace: ConversationTrace = {
  entries: [spoken, silent],
  totals: {
    occasions: 2,
    lines: 1,
    silences: { roll: 1 },
    meanWords: 3,
    rejections: { 'longer than 4 words': 1 },
  },
};

describe('ConversationDebug', () => {
  it('sums up the session', () => {
    render(<ConversationDebug trace={trace} />);
    const totals = screen.getByTestId('conversation-totals');
    expect(totals.textContent).toContain('Occasions 2');
    expect(totals.textContent).toContain('Lines 1');
    expect(totals.textContent).toContain('roll 1');
    expect(totals.textContent).toContain('longer than 4 words 1');
  });

  it('tells why she stayed silent', () => {
    render(<ConversationDebug trace={trace} />);
    const entry = screen.getByTestId('trace-1');
    expect(entry.textContent).toContain('Silent: roll 0.47 over 0.31');
    expect(entry.textContent).toContain('playerRaise.fear');
    expect(entry.textContent).toContain('fear +0.34');
  });

  it('shows the plan, the attempts and the fate of a line', () => {
    render(<ConversationDebug trace={trace} />);
    const entry = within(screen.getByTestId('trace-2'));
    expect(entry.getByText(/deflect/, { selector: '.debug-plan' })).toBeTruthy();
    const text = screen.getByTestId('trace-2').textContent ?? '';
    expect(text).toContain('fear 0.21');
    expect(text).toContain('1 to 4 words');
    expect(text).toContain('longer than 4 words');
    expect(text).toContain('We will see.');
    expect(text).toContain('840 ms');
    expect(text).toContain('shown');
    expect(text).toContain('Act: deflect');
  });

  it('links an entry to the journal entries it came from', () => {
    render(<ConversationDebug trace={trace} />);
    const link = within(screen.getByTestId('trace-2')).getByRole('link', { name: /12/ });
    expect(link.getAttribute('href')).toBe('#journal-12');
  });

  it('copies the trace as JSON', () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    render(<ConversationDebug trace={trace} />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy trace' }));
    expect(writeText).toHaveBeenCalledWith(JSON.stringify(trace, null, 2));
  });

  it('tells the time of an occasion as a clock time', () => {
    const at = new Date(2026, 10, 2, 14, 2, 31, 200).getTime();
    render(<ConversationDebug trace={{ ...trace, entries: [{ ...silent, atMs: at }] }} />);
    expect(screen.getByTestId('trace-1').textContent).toContain('14:02:31.2');
  });

  it('shows the facts of a plan and the numbers of its humour draw', () => {
    const humour = {
      tendency: { affiliative: 0.62, selfEnhancing: 0.58, aggressive: 0.4, selfDefeating: 0.47 },
      state: { affiliative: 1.2, selfEnhancing: 1, aggressive: 0.8, selfDefeating: 1 },
      p: 0.18,
      roll: 0.05,
      styleRoll: 0.3,
      style: 'affiliative' as const,
    };
    render(<ConversationDebug trace={{ ...trace, entries: [{ ...spoken, humour }] }} />);
    const text = screen.getByTestId('trace-2').textContent ?? '';
    expect(text).toContain('Facts: turn, pot 14 bb, stacks 90 and 96 bb');
    expect(text).toContain('tendency affiliative 0.62');
    expect(text).toContain('state affiliative 1.20');
    expect(text).toContain('style roll 0.30');
  });
});
