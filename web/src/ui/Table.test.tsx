import { act, cleanup, render, screen, within } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fixtureResult, viewModel } from './fixtures.ts';
import { Table } from './Table.tsx';

afterEach(cleanup);

function table(vm = viewModel(), phase: 'humanToAct' | 'botThinking' | 'handOver' = 'humanToAct') {
  return render(<Table vm={vm} phase={phase} humanSeat={0} onAct={vi.fn()} onNextHand={vi.fn()} />);
}

describe('Table layout', () => {
  it('keeps the coach slot and holds no hand log', () => {
    table();
    expect(screen.getByTestId('coach')).not.toBeNull();
    expect(screen.queryByTestId('hand-log')).toBeNull();
  });
});

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

  it('stacks her face frame, her plate, the board and your row in the centre column', () => {
    const { container } = table();
    const centre = container.querySelector('.table-centre');
    const order = [...(centre?.children ?? [])].map(
      (node) => node.getAttribute('data-testid') ?? node.className,
    );
    expect(order).toEqual(['face-frame', 'seat-1', 'table-board', 'seat-0']);
    const board = screen.getByTestId('table-board');
    expect(board.contains(screen.getByTestId('board'))).toBe(true);
    expect(board.contains(screen.getByTestId('pot'))).toBe(true);
    expect(within(screen.getByTestId('seat-1')).getAllByTestId('card-back').length).toBe(2);
  });

  it('frames her name when her face is off and her face when it is on', () => {
    table();
    const frame = screen.getByTestId('face-frame');
    expect(frame.classList.contains('face-frame-off')).toBe(true);
    expect(frame.querySelector('.face-frame-name')?.textContent).toBe('Mallorca');
    cleanup();
    render(
      <Table
        vm={viewModel()}
        phase="humanToAct"
        humanSeat={0}
        onAct={vi.fn()}
        onNextHand={vi.fn()}
        face={() => <span data-testid="face-stub" />}
      />,
    );
    const live = screen.getByTestId('face-frame');
    expect(live.classList.contains('face-frame-off')).toBe(false);
    expect(live.contains(screen.getByTestId('face-stub'))).toBe(true);
  });

  it('puts the dealer button once on the button seat beside its bet', () => {
    table();
    const dealers = screen.getAllByTestId('dealer-button');
    expect(dealers.length).toBe(1);
    const dealer = screen.getByTestId('dealer-button');
    expect(dealer.getAttribute('role')).toBe('img');
    expect(dealer.getAttribute('aria-label')).toBe('Dealer button');
    expect(screen.getByTestId('seat-0').contains(dealer)).toBe(true);
    expect(screen.getByTestId('seat-1').contains(dealer)).toBe(false);
  });

  it('puts each bet and action tag on its own seat', () => {
    table();
    expect(screen.getByTestId('seat-0').contains(screen.getByTestId('bet-0'))).toBe(true);
    expect(screen.getByTestId('seat-1').contains(screen.getByTestId('bet-1'))).toBe(true);
    expect(screen.getByTestId('seat-1').contains(screen.getByTestId('action-1'))).toBe(true);
  });

  it('pushes in on her face when her cards are shown at the end of a hand', () => {
    const { container } = table(fixtureResult(), 'handOver');
    expect(container.querySelector('.table-layout')?.classList.contains('table-showdown')).toBe(
      true,
    );
    cleanup();
    const quiet = table();
    expect(
      quiet.container.querySelector('.table-layout')?.classList.contains('table-showdown'),
    ).toBe(false);
  });

  it('writes the result under the board and offers Next hand in the action panel', () => {
    table(fixtureResult(), 'handOver');
    const board = screen.getByTestId('table-board');
    expect(board.contains(screen.getByTestId('result'))).toBe(true);
    const panel = screen.getByTestId('action-panel');
    expect(panel.contains(screen.getByTestId('next-hand'))).toBe(true);
    expect(screen.queryByTestId('fold')).toBeNull();
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
        autoNextMs={2000}
        onAct={vi.fn()}
        onNextHand={vi.fn()}
      />,
    );
    const button = screen.getByTestId('next-hand');
    expect(button.classList.contains('next-hand-auto')).toBe(true);
    expect(button.getAttribute('style')).toContain('--auto-next-ms: 2000ms');
    expect(screen.getByTestId('action-panel').textContent).toContain('Next hand in a moment');
    expect(screen.getByTestId('next-hand-wait').textContent).toBe('Wait');
  });

  it('shows a plain Next hand when auto next hand is off', () => {
    table(fixtureResult(), 'handOver');
    expect(screen.getByTestId('next-hand').classList.contains('next-hand-auto')).toBe(false);
    expect(screen.queryByTestId('next-hand-wait')).toBeNull();
  });

  it('announces the bot thinking state', () => {
    const vm = viewModel({ enabled: false });
    vm.seats[1].isToAct = true;
    table(vm, 'botThinking');
    expect(screen.getByTestId('live-region').textContent).toBe('Thinking…');
  });

  it('keeps the closing call on the bot seat for a moment after the next card', () => {
    vi.useFakeTimers();
    const flop = viewModel({ enabled: false });
    flop.board = [48, 41, 25];
    flop.seats[0].lastAction = { key: 'bet', params: { amount: 80 } };
    flop.seats[1].lastAction = null;
    const view = render(
      <Table vm={flop} phase="botThinking" humanSeat={0} onAct={vi.fn()} onNextHand={vi.fn()} />,
    );
    const turn = viewModel({ enabled: false });
    turn.board = [48, 41, 25, 10];
    turn.seats[0].isToAct = false;
    turn.seats[1].isToAct = true;
    turn.seats[0].lastAction = null;
    turn.seats[1].lastAction = null;
    turn.seats[0].closingAction = { key: 'bet', params: { amount: 80 } };
    turn.seats[1].closingAction = { key: 'call', params: { amount: 80 } };
    view.rerender(
      <Table vm={turn} phase="botThinking" humanSeat={0} onAct={vi.fn()} onNextHand={vi.fn()} />,
    );
    expect(screen.getByTestId('action-1').textContent).toBe('Call 80');
    expect(screen.getByTestId('action-0').textContent).toBe('Bet 80');
    expect(screen.queryByTestId('thinking-1')).toBeNull();
    act(() => {
      vi.advanceTimersByTime(900);
    });
    expect(screen.queryByTestId('action-1')).toBeNull();
    expect(screen.queryByTestId('action-0')).toBeNull();
    expect(screen.getByTestId('thinking-1')).not.toBeNull();
    vi.useRealTimers();
  });
});

function talking(on = true) {
  const vm = viewModel();
  const her = { id: 1, speaker: 'mallorca' as const, text: 'Brave call.', handNumber: 1 };
  const mine = { id: 2, speaker: 'player' as const, text: 'Thanks', handNumber: 1 };
  vm.conversation = {
    available: true,
    on,
    lines: [her, mine],
    herBubble: her,
    playerBubble: mine,
  };
  return vm;
}

describe('Table talk', () => {
  it('renders no chat or bubbles when conversation is not available', () => {
    const vm = viewModel();
    vm.conversation.herBubble = { id: 1, speaker: 'mallorca', text: 'Hidden', handNumber: 1 };
    table(vm);
    expect(screen.queryByTestId('bubble-mallorca')).toBeNull();
    expect(screen.queryByTestId('chat-open')).toBeNull();
    expect(screen.queryByTestId('chat-panel')).toBeNull();
    expect(screen.getByTestId('coach')).not.toBeNull();
  });

  it('shows her bubble at her seat, mine at mine, and the chat panel, with the Talk button left to the header', () => {
    table(talking());
    expect(within(screen.getByTestId('seat-1')).getByTestId('bubble-mallorca')).not.toBeNull();
    expect(within(screen.getByTestId('seat-0')).getByTestId('bubble-player')).not.toBeNull();
    expect(screen.queryByTestId('chat-open')).toBeNull();
    expect(within(screen.getByTestId('chat-panel')).getByTestId('chat-input')).not.toBeNull();
    expect(screen.getByTestId('coach')).not.toBeNull();
  });

  it('hides the chat while conversation is off', () => {
    table(talking(false));
    expect(screen.queryByTestId('bubble-mallorca')).toBeNull();
    expect(screen.queryByTestId('chat-open')).toBeNull();
    expect(screen.queryByTestId('chat-panel')).toBeNull();
  });
});

describe('Table talk announcements', () => {
  it('announces her line in a polite live region that stays mounted', () => {
    const vm = talking();
    const view = render(
      <Table vm={vm} phase="humanToAct" humanSeat={0} onAct={vi.fn()} onNextHand={vi.fn()} />,
    );
    const region = screen.getByTestId('conversation-region');
    expect(region.getAttribute('aria-live')).toBe('polite');
    expect(region.textContent).toBe('Brave call.');
    const next = talking();
    next.conversation.herBubble = {
      id: 3,
      speaker: 'mallorca',
      text: 'Your turn, love.',
      handNumber: 1,
    };
    view.rerender(
      <Table vm={next} phase="humanToAct" humanSeat={0} onAct={vi.fn()} onNextHand={vi.fn()} />,
    );
    expect(screen.getByTestId('conversation-region')).toBe(region);
    expect(region.textContent).toBe('Your turn, love.');
  });

  it('keeps the region empty without conversation', () => {
    table();
    expect(screen.getByTestId('conversation-region').textContent).toBe('');
  });
});
