import { cleanup, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fixtureResult, viewModel } from './fixtures.ts';
import { Table } from './Table.tsx';

afterEach(cleanup);

function table(vm = viewModel(), phase: 'humanToAct' | 'botThinking' | 'handOver' = 'humanToAct') {
  return render(
    <Table vm={vm} phase={phase} humanSeat={0} log={[]} onAct={vi.fn()} onNextHand={vi.fn()} />,
  );
}

describe('Table result and announcements', () => {
  it('shows the won amount and hides the pot while a result is shown', () => {
    table(fixtureResult(), 'handOver');
    expect(screen.getByTestId('result').textContent).toContain('Mallorca wins 120 with Two pair');
    expect(screen.queryByTestId('pot')).toBeNull();
  });

  it('shows the pot while a hand is in progress', () => {
    table();
    expect(screen.getByTestId('pot')).not.toBeNull();
  });

  it('words a split with each share', () => {
    const vm = fixtureResult();
    vm.result = { winner: null, category: null, amount: 60 };
    table(vm, 'handOver');
    expect(screen.getByTestId('result').textContent).toContain('Split pot 60 each');
  });

  it('announces the result in a polite live region', () => {
    table(fixtureResult(), 'handOver');
    const region = screen.getByTestId('live-region');
    expect(region.getAttribute('role')).toBe('status');
    expect(region.getAttribute('aria-live')).toBe('polite');
    expect(region.textContent).toBe('Mallorca wins 120 with Two pair');
  });

  it('keeps both seats and the felt layer in order', () => {
    const { container } = table();
    const felt = container.querySelector('.table-felt');
    expect(felt).not.toBeNull();
    expect(felt?.querySelector('[data-testid="board"]')).not.toBeNull();
    expect(felt?.querySelector('[data-testid="pot"]')).not.toBeNull();
    expect(screen.getByTestId('seat-1').querySelectorAll('[data-testid="card-back"]').length).toBe(
      2,
    );
  });

  it('marks the player seat active on their turn', () => {
    table();
    expect(screen.getByTestId('seat-0').classList.contains('seat-active')).toBe(true);
  });

  it('sends the pot chips toward the winner', () => {
    const { container } = table(fixtureResult(), 'handOver');
    const chips = container.querySelector('.result-chips');
    expect(chips?.classList.contains('result-chips-to-top')).toBe(true);
    expect(chips?.getAttribute('aria-hidden')).toBe('true');
    cleanup();
    const split = fixtureResult();
    split.result = { winner: null, category: null, amount: 60 };
    const view = table(split, 'handOver');
    expect(view.container.querySelector('.result-chips-split')).not.toBeNull();
  });

  it('shows the countdown on Next hand while auto next hand is on', () => {
    render(
      <Table
        vm={fixtureResult()}
        phase="handOver"
        humanSeat={0}
        log={[]}
        autoNextMs={2000}
        onAct={vi.fn()}
        onNextHand={vi.fn()}
      />,
    );
    const button = screen.getByTestId('next-hand');
    expect(button.classList.contains('next-hand-auto')).toBe(true);
    expect(button.getAttribute('style')).toContain('--auto-next-ms: 2000ms');
  });

  it('shows a plain Next hand when auto next hand is off', () => {
    table(fixtureResult(), 'handOver');
    expect(screen.getByTestId('next-hand').classList.contains('next-hand-auto')).toBe(false);
  });

  it('announces the bot thinking state', () => {
    const vm = viewModel({ enabled: false });
    vm.seats[1].isToAct = true;
    table(vm, 'botThinking');
    expect(screen.getByTestId('live-region').textContent).toBe('Thinking…');
  });
});

function talking(on = true) {
  const vm = viewModel();
  const her = { id: 1, speaker: 'mallorca' as const, text: 'Brave call.', handNumber: 1 };
  const mine = { id: 2, speaker: 'player' as const, text: 'Thanks', handNumber: 1 };
  vm.talk = {
    available: true,
    on,
    level: 'subtle',
    lines: [her, mine],
    herBubble: her,
    playerBubble: mine,
  };
  return vm;
}

describe('Table talk', () => {
  it('renders no chat, bubbles or tabs when talk is not available', () => {
    const vm = viewModel();
    vm.talk.herBubble = { id: 1, speaker: 'mallorca', text: 'Hidden', handNumber: 1 };
    table(vm);
    expect(screen.queryByTestId('bubble-mallorca')).toBeNull();
    expect(screen.queryByTestId('chat-open')).toBeNull();
    expect(screen.queryByRole('tab')).toBeNull();
    expect(screen.getByTestId('hand-log')).not.toBeNull();
    expect(screen.getByTestId('coach')).not.toBeNull();
  });

  it('shows her bubble at her seat, mine at mine, and the chat entry points', () => {
    table(talking());
    expect(
      screen.getByTestId('seat-1').querySelector('[data-testid="bubble-mallorca"]'),
    ).not.toBeNull();
    expect(
      screen.getByTestId('seat-0').querySelector('[data-testid="bubble-player"]'),
    ).not.toBeNull();
    expect(screen.getByTestId('seat-1').querySelector('[data-testid="chat-open"]')).not.toBeNull();
    expect(screen.getAllByRole('tab').length).toBe(2);
    expect(screen.getByTestId('coach')).not.toBeNull();
  });

  it('hides the chat while talk is off', () => {
    table(talking(false));
    expect(screen.queryByTestId('bubble-mallorca')).toBeNull();
    expect(screen.queryByTestId('chat-open')).toBeNull();
    expect(screen.queryByRole('tab')).toBeNull();
  });
});

describe('Table talk announcements', () => {
  it('announces her line in a polite live region that stays mounted', () => {
    const vm = talking();
    const view = render(
      <Table
        vm={vm}
        phase="humanToAct"
        humanSeat={0}
        log={[]}
        onAct={vi.fn()}
        onNextHand={vi.fn()}
      />,
    );
    const region = screen.getByTestId('talk-region');
    expect(region.getAttribute('aria-live')).toBe('polite');
    expect(region.textContent).toBe('Brave call.');
    const next = talking();
    next.talk.herBubble = { id: 3, speaker: 'mallorca', text: 'Your turn, love.', handNumber: 1 };
    view.rerender(
      <Table
        vm={next}
        phase="humanToAct"
        humanSeat={0}
        log={[]}
        onAct={vi.fn()}
        onNextHand={vi.fn()}
      />,
    );
    expect(screen.getByTestId('talk-region')).toBe(region);
    expect(region.textContent).toBe('Your turn, love.');
  });

  it('keeps the region empty without talk', () => {
    table();
    expect(screen.getByTestId('talk-region').textContent).toBe('');
  });
});
