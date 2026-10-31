import i18next from 'i18next';
import { describe, expect, it } from 'vitest';
import { actionTag, handName, logKind, logLine } from './phrases.ts';

const names: [string, string] = ['You', 'Mallorca'];

describe('phrases', () => {
  it('words a log entry in the second person for the human seat', () => {
    const returned = { key: 'returned', params: { seat: 0, amount: 40 } };
    expect(logLine(returned, names, 0)).toBe('Uncalled bet of 40 returned to you');
    expect(logLine(returned, names, 1)).toBe('Uncalled bet of 40 returned to You');
    expect(logLine({ key: 'call', params: { seat: 0, amount: 40 } }, names, 0)).toBe('You call 40');
    expect(logLine({ key: 'call', params: { seat: 1, amount: 40 } }, names, 0)).toBe(
      'Mallorca calls 40',
    );
    expect(logLine({ key: 'allIn', params: { seat: 1 } }, names, 0)).toBe('Mallorca is all-in');
  });

  it('words a bet entry', () => {
    expect(logLine({ key: 'bet', params: { seat: 0, amount: 80 } }, names, 0)).toBe('You bet 80');
    expect(logLine({ key: 'bet', params: { seat: 1, amount: 80 } }, names, 0)).toBe(
      'Mallorca bets 80',
    );
  });

  it('words entries without a seat and names the hand category', () => {
    expect(
      logLine({ key: 'handStarted', params: { number: 3, small: 10, big: 20 } }, names, 0),
    ).toBe('Hand 3, blinds 10/20');
    expect(logLine({ key: 'flop', params: { cards: 'Qs Jh 7d' } }, names, 0)).toBe('Flop Qs Jh 7d');
    expect(
      logLine({ key: 'show', params: { seat: 1, cards: '7c 2d', category: 'two-pair' } }, names, 0),
    ).toBe('Mallorca shows 7c 2d (Two pair)');
    expect(handName('full-house')).toBe('Full house');
  });

  it('has a phrase for every key the engine and the session emit', () => {
    for (const key of ['handStarted', 'flop', 'turn', 'river']) {
      expect(i18next.exists(`log.${key}`), key).toBe(true);
    }
    const seated = [
      'post',
      'fold',
      'check',
      'call',
      'raise',
      'bet',
      'allIn',
      'show',
      'returned',
      'win',
      'winTournament',
    ];
    for (const person of ['you', 'other']) {
      for (const key of seated) {
        expect(i18next.exists(`log.${person}.${key}`), `${person}.${key}`).toBe(true);
      }
    }
    for (const key of ['fold', 'check', 'call', 'raiseTo', 'bet', 'allIn']) {
      expect(i18next.exists(`actions.${key}`), key).toBe(true);
    }
  });

  it('words an action tag from the actions keys', () => {
    expect(actionTag({ key: 'raiseTo', params: { amount: 100 } })).toBe('Raise to 100');
    expect(actionTag({ key: 'bet', params: { amount: 80 } })).toBe('Bet 80');
    expect(actionTag({ key: 'allIn', params: {} })).toBe('All-in');
  });

  it('marks raises, bets and all-ins as aggressive log entries', () => {
    expect(logKind({ key: 'raise', params: {} })).toBe('aggressive');
    expect(logKind({ key: 'bet', params: {} })).toBe('aggressive');
    expect(logKind({ key: 'allIn', params: {} })).toBe('aggressive');
    expect(logKind({ key: 'call', params: {} })).toBe('plain');
  });
});
