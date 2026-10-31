import { describe, expect, it } from 'vitest';
import { legalActions } from '../../../src/engine/index.ts';
import { parseActions } from './slumbot/actions.ts';
import type { MirrorInput } from './mirror.ts';
import { MirrorError, mirrorHand } from './mirror.ts';

function input(partial: Partial<MirrorInput> & { action: string }): MirrorInput {
  return {
    clientIsBigBlind: true,
    holeCards: ['Td', '4s'],
    board: [],
    opponentCards: null,
    handNumber: 1,
    ...partial,
    actions: parseActions(partial.action),
  };
}

describe('mirrorHand', () => {
  it('replays a live showdown and lands on the Slumbot winnings', () => {
    const { step, events } = mirrorHand(
      input({
        action: 'b200c/kk/kb200c/kb400c',
        board: ['Ah', '8d', '2s', 'Qd', '9s'],
        opponentCards: ['Ac', '3s'],
      }),
    );
    expect(step.hand.street).toBe('complete');
    expect(step.seats[0].stack).toBe(19200);
    expect(events.at(-1)?.type).toBe('handEnded');
  });

  it('replays a fold of the button preflop', () => {
    const { step } = mirrorHand(
      input({ action: 'f', holeCards: ['Qh', '8c'], opponentCards: ['9h', '3d'] }),
    );
    expect(step.seats[0].stack).toBe(20050);
  });

  it('puts the client on the button when it is not the big blind', () => {
    const { step } = mirrorHand(
      input({
        action: 'ck/kk/kk/kk',
        clientIsBigBlind: false,
        holeCards: ['Ac', 'Js'],
        board: ['7s', '6h', '5s', 'Kc', '3s'],
        opponentCards: ['5h', '2s'],
      }),
    );
    expect(step.hand.button).toBe(0);
    expect(step.seats[0].stack).toBe(19900);
  });

  it('stops mid-hand with the client to act against a flop bet', () => {
    const { step } = mirrorHand(input({ action: 'b200c/kb300', board: ['Ah', '8d', '2s'] }));
    expect(step.hand.street).toBe('flop');
    expect(step.hand.toAct).toBe(0);
    expect(legalActions(step.hand, step.seats).call).toBe(300);
  });

  it('waits on a street that was just dealt', () => {
    const { step } = mirrorHand(
      input({ action: 'b200c/kk/kk/', board: ['9s', '9h', '2s', 'Ad', '8h'] }),
    );
    expect(step.hand.street).toBe('river');
    expect(step.hand.toAct).toBe(0);
  });

  it('runs out an all-in with empty streets', () => {
    const { step } = mirrorHand(
      input({
        action: 'b20000c///',
        holeCards: ['Ah', 'Ad'],
        board: ['2c', '7d', '9h', 'Js', '3c'],
        opponentCards: ['Kh', 'Kd'],
      }),
    );
    expect(step.hand.street).toBe('complete');
    expect(step.seats[0].stack).toBe(40000);
  });

  it('accepts a short all-in call', () => {
    const { step } = mirrorHand(
      input({
        action: 'b200c/kb19800c//',
        board: ['2c', '7d', '9h', 'Js', '3c'],
        opponentCards: ['Kh', 'Kd'],
      }),
    );
    expect(step.hand.street).toBe('complete');
  });

  it('throws on an illegal action', () => {
    expect(() => mirrorHand(input({ action: 'b50' }))).toThrow(MirrorError);
  });

  it('throws when the string runs past the end of the hand', () => {
    expect(() => mirrorHand(input({ action: 'fk' }))).toThrow(MirrorError);
  });

  it('throws when a street is dealt that Slumbot has not shown', () => {
    expect(() => mirrorHand(input({ action: 'b200c/' }))).toThrow(MirrorError);
  });
});
