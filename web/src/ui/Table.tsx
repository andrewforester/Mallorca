import type { ComponentChildren } from 'preact';
import type { Intent, Phase, SeatIndex, ViewModel } from '../game/index.ts';
import { ActionBar } from './ActionBar.tsx';
import { BetChips } from './BetChips.tsx';
import { BoardRow } from './BoardRow.tsx';
import { DealerButton } from './DealerButton.tsx';
import { t } from './i18n.ts';
import { handName } from './phrases.ts';
import { Seat } from './Seat.tsx';
import { useHeldActions } from './useHeldActions.ts';
import type { HeldActions } from './useHeldActions.ts';
import { useSweep } from './useSweep.ts';

export interface TableProps {
  vm: ViewModel;
  phase: Phase;
  humanSeat: SeatIndex;
  autoNextMs?: number | null;
  onAct: (intent: Intent) => void;
  onNextHand: () => void;
  coach?: ComponentChildren;
}

function resultText(vm: ViewModel, humanSeat: SeatIndex): string | null {
  const { result } = vm;
  if (result === null) {
    return null;
  }
  if (result.winner === null) {
    return t('result.split', { amount: result.amount });
  }
  if (result.winner === humanSeat) {
    return result.category === null
      ? t('result.youWin', { amount: result.amount })
      : t('result.youWinWith', { amount: result.amount, hand: handName(result.category) });
  }
  const name = vm.seats[result.winner].name;
  return result.category === null
    ? t('result.wins', { name, amount: result.amount })
    : t('result.winsWith', { name, amount: result.amount, hand: handName(result.category) });
}

function chipsDirection(winner: SeatIndex | null, humanSeat: SeatIndex): string {
  if (winner === null) {
    return 'split';
  }
  return winner === humanSeat ? 'to-bottom' : 'to-top';
}

interface FeltSpotProps {
  vm: ViewModel;
  seat: SeatIndex;
  side: 'top' | 'bottom';
  bets: [number, number];
}

function FeltSpot({ vm, seat, side, bets }: FeltSpotProps) {
  const view = vm.seats[seat];
  const amount = bets[seat];
  return (
    <div class={`felt-spot felt-spot-${side}`}>
      <span class="felt-spot-dealer">{view.isButton && <DealerButton />}</span>
      <BetChips seat={seat} amount={amount} sweeping={amount !== view.bet} />
    </div>
  );
}

function Felt({
  vm,
  humanSeat,
  showPot,
}: {
  vm: ViewModel;
  humanSeat: SeatIndex;
  showPot: boolean;
}) {
  const botSeat: SeatIndex = humanSeat === 0 ? 1 : 0;
  const bets = useSweep([vm.seats[0].bet, vm.seats[1].bet], vm.pot.collected);
  return (
    <div class="table-felt">
      <FeltSpot vm={vm} seat={botSeat} side="top" bets={bets} />
      <div class="felt-plane">
        <BoardRow pot={showPot ? vm.pot : null} board={vm.board} />
      </div>
      <FeltSpot vm={vm} seat={humanSeat} side="bottom" bets={bets} />
      {vm.result !== null && (
        <span
          class={`result-chips result-chips-${chipsDirection(vm.result.winner, humanSeat)}`}
          aria-hidden="true"
        >
          <span class="chip chip-terracotta" />
          <span class="chip chip-honey" />
        </span>
      )}
    </div>
  );
}

function useSeatActions(vm: ViewModel): HeldActions {
  const [first, second] = vm.seats;
  return useHeldActions(
    [first.lastAction, second.lastAction],
    [first.closingAction, second.closingAction],
    vm.board.length,
  );
}

interface ResultProps {
  text: string;
  canContinue: boolean;
  autoNextMs: number | null;
  onNextHand: () => void;
}

function Result({ text, canContinue, autoNextMs, onNextHand }: ResultProps) {
  const auto = autoNextMs !== null;
  return (
    <div class="result glass" data-testid="result">
      <span class="result-text">{text}</span>
      {canContinue && (
        <button
          type="button"
          class={`button button-primary${auto ? ' next-hand-auto' : ''}`}
          style={auto ? { '--auto-next-ms': `${autoNextMs}ms` } : undefined}
          data-testid="next-hand"
          onClick={onNextHand}
        >
          {t('result.next')}
        </button>
      )}
    </div>
  );
}

export function Table({
  vm,
  phase,
  humanSeat,
  autoNextMs = null,
  onAct,
  onNextHand,
  coach,
}: TableProps) {
  const botSeat: SeatIndex = humanSeat === 0 ? 1 : 0;
  const botWaiting = phase === 'botThinking' || phase === 'animating';
  const text = resultText(vm, humanSeat);
  const raise = vm.controls.raise;
  const barKey = raise === null ? 'none' : `${raise.min}:${raise.max}`;
  const [bot, human] = [vm.seats[botSeat], vm.seats[humanSeat]];
  const held = useSeatActions(vm);
  const thinking = botWaiting && bot.isToAct && !held.holding;
  const announcement = text ?? (thinking ? t('seat.thinking') : '');
  const winner = vm.result?.winner ?? null;
  return (
    <div class="table-layout">
      <div class="visually-hidden" role="status" aria-live="polite" data-testid="live-region">
        {announcement}
      </div>
      <Felt vm={vm} humanSeat={humanSeat} showPot={text === null} />
      {text !== null && (
        <Result
          text={text}
          canContinue={phase === 'handOver'}
          autoNextMs={autoNextMs}
          onNextHand={onNextHand}
        />
      )}
      <Seat
        index={botSeat}
        view={bot}
        action={held.actions[botSeat]}
        thinking={thinking}
        winner={winner === botSeat}
        position="top"
      />
      <Seat
        index={humanSeat}
        view={human}
        action={held.actions[humanSeat]}
        thinking={false}
        winner={winner === humanSeat}
        position="bottom"
      />
      <ActionBar key={barKey} controls={vm.controls} onAct={onAct} />
      <div class="table-side">
        <aside class="coach" data-testid="coach" aria-label={t('coach.label')}>
          {coach}
        </aside>
      </div>
    </div>
  );
}
