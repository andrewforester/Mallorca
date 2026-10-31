import { describe, expect, it } from 'vitest';
import type { Action, LegalActions } from '../../src/engine/index.ts';
import type { ArenaBot } from './arenaBot.ts';
import { createReader } from './reader.ts';

const handStarted = {
  type: 'handStarted' as const,
  handNumber: 1,
  heroOnButton: false,
  heroStack: 2000,
  villainStack: 2000,
  smallBlind: 10,
  bigBlind: 20,
};

function inner(action: Action): ArenaBot {
  return { observe: () => undefined, decide: () => action };
}

function facing(call: number): LegalActions {
  return { fold: true, check: false, call, raise: { min: 100, max: 2000 } };
}

function readerAfterBet(action: Action, bet: number) {
  const reader = createReader(inner(action));
  reader.observe(handStarted);
  reader.observe({
    type: 'acted',
    who: 'villain',
    action: { kind: 'raise', to: bet },
    amount: bet,
  });
  return reader;
}

describe('the reader', () => {
  it('equals the inner bot without heard', () => {
    expect(readerAfterBet({ kind: 'fold' }, 30).decide(facing(10))).toEqual({ kind: 'fold' });
    expect(readerAfterBet({ kind: 'call' }, 30).decide(facing(10))).toEqual({ kind: 'call' });
  });

  it('turns a fold into a call after speech when the call is at most half the pot', () => {
    const reader = readerAfterBet({ kind: 'fold' }, 60);
    reader.heard?.(true);
    expect(reader.decide(facing(40))).toEqual({ kind: 'call' });
  });

  it('keeps the fold after speech when the call is over half the pot', () => {
    const reader = readerAfterBet({ kind: 'fold' }, 400);
    reader.heard?.(true);
    expect(reader.decide(facing(380))).toEqual({ kind: 'fold' });
  });

  it('turns a call into a fold after silence', () => {
    const reader = readerAfterBet({ kind: 'call' }, 60);
    reader.heard?.(false);
    expect(reader.decide(facing(40))).toEqual({ kind: 'fold' });
  });

  it('keeps a raise whatever it heard', () => {
    const reader = readerAfterBet({ kind: 'raise', to: 200 }, 60);
    reader.heard?.(false);
    expect(reader.decide(facing(40))).toEqual({ kind: 'raise', to: 200 });
  });

  it('uses what it heard for the next decision only', () => {
    const reader = readerAfterBet({ kind: 'call' }, 60);
    reader.heard?.(false);
    expect(reader.decide(facing(40))).toEqual({ kind: 'fold' });
    expect(reader.decide(facing(40))).toEqual({ kind: 'call' });
  });

  it('counts blinds and every action in the pot', () => {
    const reader = createReader(inner({ kind: 'fold' }));
    reader.observe(handStarted);
    reader.observe({
      type: 'acted',
      who: 'villain',
      action: { kind: 'raise', to: 60 },
      amount: 50,
    });
    reader.observe({ type: 'acted', who: 'hero', action: { kind: 'call' }, amount: 40 });
    reader.observe({
      type: 'acted',
      who: 'villain',
      action: { kind: 'raise', to: 100 },
      amount: 100,
    });
    reader.heard?.(true);
    expect(reader.decide(facing(100))).toEqual({ kind: 'call' });
  });

  it('does nothing on a free decision', () => {
    const reader = createReader(inner({ kind: 'check' }));
    reader.heard?.(false);
    expect(reader.decide({ fold: false, check: true, call: null, raise: null })).toEqual({
      kind: 'check',
    });
  });
});
