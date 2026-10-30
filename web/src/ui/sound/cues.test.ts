import { describe, expect, it } from 'vitest';
import type { LogEntry } from '../../game/index.ts';
import { cuesFor, turnCue } from './cues.ts';

function entries(...keys: string[]): LogEntry[] {
  return keys.map((key) => ({ key, params: {} }));
}

describe('cuesFor', () => {
  it('maps blinds and the deal and drops repeats', () => {
    expect(cuesFor(entries('handStarted', 'post', 'post'))).toEqual(['deal', 'chips']);
  });

  it('keeps the order of first occurrences', () => {
    expect(cuesFor(entries('call', 'flop'))).toEqual(['chips', 'deal']);
  });

  it('drops chips when an all-in is present', () => {
    expect(cuesFor(entries('raise', 'allIn'))).toEqual(['allIn']);
  });

  it('maps fold and win and ignores other entries', () => {
    expect(cuesFor(entries('fold', 'returned', 'win'))).toEqual(['fold', 'win']);
    expect(cuesFor(entries('show'))).toEqual([]);
  });

  it('maps checks, bets, turn and river', () => {
    expect(cuesFor(entries('check', 'bet', 'turn', 'river'))).toEqual(['check', 'chips', 'deal']);
  });
});

describe('turnCue', () => {
  it('fires when the human starts to act', () => {
    expect(turnCue('botThinking', 'humanToAct')).toBe('turn');
  });

  it('does not repeat while the human is still to act', () => {
    expect(turnCue('humanToAct', 'humanToAct')).toBeNull();
    expect(turnCue('humanToAct', 'botThinking')).toBeNull();
  });
});
