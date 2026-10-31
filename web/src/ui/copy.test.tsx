import { cleanup, render } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { memoryStore } from '../game/index.ts';
import type { LogEntry } from '../game/index.ts';
import en from '../locales/en.json';
import { ActionBar } from './ActionBar.tsx';
import { fixtureResult } from './fixtures.ts';
import { StartScreen } from './StartScreen.tsx';
import { HandLogDrawer } from './HandLogDrawer.tsx';
import { Table } from './Table.tsx';
import { SessionOver } from './SessionOver.tsx';
import { TournamentOver } from './TournamentOver.tsx';
import { viewModel } from './fixtures.ts';

afterEach(cleanup);

function templates(node: unknown): string[] {
  if (typeof node === 'string') {
    return [node];
  }
  return Object.values(node as Record<string, unknown>).flatMap(templates);
}

const patterns = templates(en).map(
  (value) =>
    new RegExp(
      `^${value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\{\\\{\w+\\\}\\\}/g, '.+')}$`,
    ),
);

const glyph = /^(\d+|10|[JQKA]|[♣♦♥♠])$/;

function visibleStrings(container: Element): string[] {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  const found: string[] = [];
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    const text = (node.textContent ?? '').trim();
    if (text !== '') {
      found.push(text);
    }
  }
  return found;
}

function fromLocale(text: string): boolean {
  return glyph.test(text) || patterns.some((pattern) => pattern.test(text));
}

function expectFromLocale(container: Element) {
  const strings = visibleStrings(container);
  expect(strings.length).toBeGreaterThan(0);
  for (const text of strings) {
    expect(fromLocale(text), `"${text}" is not in en.json`).toBe(true);
  }
}

const log: LogEntry[] = [
  { key: 'handStarted', params: { number: 1, small: 10, big: 20 } },
  { key: 'post', params: { seat: 0, amount: 10 } },
  { key: 'post', params: { seat: 1, amount: 20 } },
  { key: 'raise', params: { seat: 1, amount: 60 } },
  { key: 'call', params: { seat: 0, amount: 40 } },
  { key: 'flop', params: { cards: 'Qs Jh 7d' } },
  { key: 'allIn', params: { seat: 0 } },
  { key: 'show', params: { seat: 1, cards: '7c 2d', category: 'pair' } },
  { key: 'returned', params: { seat: 1, amount: 40 } },
  { key: 'win', params: { seat: 1, amount: 120 } },
  { key: 'winTournament', params: { seat: 0 } },
];

describe('copy', () => {
  it('start screen strings come from en.json', () => {
    const { container } = render(<StartScreen seed={42} onStart={vi.fn()} />);
    expectFromLocale(container);
  });

  it('farewell start screen strings come from en.json', () => {
    const { container } = render(<StartScreen seed={42} onStart={vi.fn()} farewell />);
    expectFromLocale(container);
  });

  it('table strings come from en.json', () => {
    const vm = viewModel();
    vm.board = [48, 41, 25];
    const { container } = render(
      <Table vm={vm} phase="humanToAct" humanSeat={0} onAct={vi.fn()} onNextHand={vi.fn()} />,
    );
    expectFromLocale(container);
  });

  it('result and thinking strings come from en.json', () => {
    const vm = fixtureResult();
    const { container } = render(
      <Table vm={vm} phase="handOver" humanSeat={0} onAct={vi.fn()} onNextHand={vi.fn()} />,
    );
    expectFromLocale(container);
    expect(container.querySelector('[data-testid="result"]')?.textContent).toContain(
      'Mallorca wins 120 with Two pair',
    );
    cleanup();
    const youWin = fixtureResult();
    youWin.result = { winner: 0, category: 'flush', amount: 120 };
    const won = render(
      <Table vm={youWin} phase="handOver" humanSeat={0} onAct={vi.fn()} onNextHand={vi.fn()} />,
    );
    expectFromLocale(won.container);
    expect(won.container.querySelector('[data-testid="result"]')?.textContent).toContain(
      'You win 120 with Flush',
    );
    cleanup();
    const thinking = viewModel({ enabled: false });
    thinking.seats[1].isToAct = true;
    thinking.seats[1].lastAction = null;
    const view = render(
      <Table
        vm={thinking}
        phase="botThinking"
        humanSeat={0}
        onAct={vi.fn()}
        onNextHand={vi.fn()}
      />,
    );
    expectFromLocale(view.container);
    expect(view.container.textContent).toContain('Thinking…');
  });

  it('action bar and end screen strings come from en.json', () => {
    expectFromLocale(
      render(<ActionBar controls={viewModel().controls} onAct={vi.fn()} />).container,
    );
    cleanup();
    expectFromLocale(
      render(<TournamentOver won onPlayAgain={vi.fn()} onLeave={vi.fn()} />).container,
    );
    cleanup();
    expectFromLocale(
      render(<TournamentOver won={false} onPlayAgain={vi.fn()} onLeave={vi.fn()} />).container,
    );
    cleanup();
    expectFromLocale(
      render(
        <SessionOver
          session={{ hands: 3, netBb: 4.5, bbPer100: 150 }}
          store={memoryStore()}
          sessionId="x"
          onPlayAgain={vi.fn()}
        />,
      ).container,
    );
  });

  it('the hand log is checked and text outside en.json fails the check', () => {
    const { container } = render(
      <HandLogDrawer entries={log} names={['You', 'Mallorca']} humanSeat={0} onClose={vi.fn()} />,
    );
    const lines = [...container.querySelectorAll('.log-token')].map((token) => token.textContent);
    expect(lines).toContain('Uncalled bet of 40 returned to Mallorca');
    expect(lines).toContain('You are all-in');
    expect(visibleStrings(container)).toEqual(expect.arrayContaining(lines));
    expect(fromLocale('Bot shoves')).toBe(false);
    expect(fromLocale('log.other.shove')).toBe(false);
  });

  it('copy has no all-caps words and no em or en dashes', () => {
    for (const value of templates(en)) {
      expect(value).not.toMatch(/[—–]/);
      const words = value.replace(/\{\{\w+\}\}/g, '').match(/[A-Za-z]+/g) ?? [];
      for (const word of words) {
        expect(word.length > 1 && word === word.toUpperCase(), word).toBe(false);
      }
    }
  });
});
