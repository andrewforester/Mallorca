import type { ComponentChildren } from 'preact';
import type { Intent, Phase, QuickPhrase, SeatIndex, ViewModel } from '../game/index.ts';
import { ActionBar } from './ActionBar.tsx';
import { BoardRow } from './BoardRow.tsx';
import { Bubble } from './Bubble.tsx';
import { Chat } from './Chat.tsx';
import type { ChatProps } from './Chat.tsx';
import { ChatSheet } from './ChatSheet.tsx';
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
  onWait?: () => void;
  coach?: ComponentChildren;
  onSay?: (text: string) => void;
  onQuick?: (id: QuickPhrase, text: string) => void;
  face?: (thinking: boolean) => ComponentChildren;
}

const ignore = () => undefined;

function chatOf(props: TableProps): ChatProps | null {
  const { conversation } = props.vm;
  if (!conversation.available || !conversation.on) {
    return null;
  }
  return {
    lines: conversation.lines,
    onSay: props.onSay ?? ignore,
    onQuick: props.onQuick ?? ignore,
  };
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

function ResultChips({ vm, humanSeat }: { vm: ViewModel; humanSeat: SeatIndex }) {
  if (vm.result === null) {
    return null;
  }
  return (
    <span
      class={`result-chips result-chips-${chipsDirection(vm.result.winner, humanSeat)}`}
      aria-hidden="true"
    >
      <span class="chip-dot" />
    </span>
  );
}

function TableBoard({
  vm,
  humanSeat,
  text,
}: {
  vm: ViewModel;
  humanSeat: SeatIndex;
  text: string | null;
}) {
  return (
    <div class="table-board" data-testid="table-board">
      <BoardRow pot={text === null ? vm.pot : null} board={vm.board} />
      {text !== null && (
        <p class="result-text" data-testid="result">
          {text}
        </p>
      )}
      <ResultChips vm={vm} humanSeat={humanSeat} />
    </div>
  );
}

interface FaceFrameProps {
  name: string;
  face: ComponentChildren;
  children?: ComponentChildren;
}

function FaceFrame({ name, face, children }: FaceFrameProps) {
  const off = face === undefined || face === null;
  return (
    <div class={off ? 'face-frame face-frame-off' : 'face-frame'} data-testid="face-frame">
      {off ? <span class="face-frame-name">{name}</span> : face}
      {children}
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

interface NextHandProps {
  autoNextMs: number | null;
  onNextHand: () => void;
  onWait?: () => void;
}

function NextHand({ autoNextMs, onNextHand, onWait }: NextHandProps) {
  const auto = autoNextMs !== null;
  return (
    <div class={auto ? 'result-actions result-actions-auto' : 'result-actions'}>
      {auto && <p class="result-soon">{t('result.soon')}</p>}
      {auto && onWait !== undefined && (
        <button type="button" class="button" data-testid="next-hand-wait" onClick={onWait}>
          {t('result.wait')}
        </button>
      )}
      <button
        type="button"
        class={`button button-passive${auto ? ' next-hand-auto' : ''}`}
        style={auto ? { '--auto-next-ms': `${autoNextMs}ms` } : undefined}
        data-testid="next-hand"
        onClick={onNextHand}
      >
        {t('result.next')}
      </button>
    </div>
  );
}

function Announcements({ text, her }: { text: string; her: string }) {
  return (
    <>
      <div class="visually-hidden" role="status" aria-live="polite" data-testid="live-region">
        {text}
      </div>
      <div class="visually-hidden" aria-live="polite" data-testid="conversation-region">
        {her}
      </div>
    </>
  );
}

function herLine(vm: ViewModel, chat: ChatProps | null): string {
  return chat === null ? '' : (vm.conversation.herBubble?.text ?? '');
}

function TableLeft({ chat }: { chat: ChatProps | null }) {
  return (
    <div class="table-left">
      {chat !== null && (
        <section
          class="side-panel glass"
          data-testid="chat-panel"
          aria-label={t('conversation.tab')}
        >
          <Chat {...chat} />
        </section>
      )}
    </div>
  );
}

function TableRight({
  coach,
  children,
}: {
  coach: ComponentChildren;
  children: ComponentChildren;
}) {
  return (
    <div class="table-right">
      <aside class="coach" data-testid="coach" aria-label={t('coach.label')}>
        {coach}
      </aside>
      <div class="action-panel" data-testid="action-panel">
        {children}
      </div>
    </div>
  );
}

interface SeatsProps {
  vm: ViewModel;
  humanSeat: SeatIndex;
  held: HeldActions;
  thinking: boolean;
  chat: ChatProps | null;
  bets: [number, number];
}

function seatBet(vm: ViewModel, seat: SeatIndex, bets: [number, number]) {
  return { amount: bets[seat], sweeping: bets[seat] !== vm.seats[seat].bet };
}

function HerSeat({ vm, humanSeat, held, thinking, chat, bets }: SeatsProps) {
  const botSeat: SeatIndex = humanSeat === 0 ? 1 : 0;
  return (
    <Seat
      index={botSeat}
      view={vm.seats[botSeat]}
      action={held.actions[botSeat]}
      thinking={thinking}
      winner={(vm.result?.winner ?? null) === botSeat}
      position="top"
      bet={seatBet(vm, botSeat, bets)}
    >
      {chat !== null && <Bubble line={vm.conversation.herBubble} />}
    </Seat>
  );
}

function YourSeat({ vm, humanSeat, held, chat, bets }: SeatsProps) {
  return (
    <Seat
      index={humanSeat}
      view={vm.seats[humanSeat]}
      action={held.actions[humanSeat]}
      thinking={false}
      winner={(vm.result?.winner ?? null) === humanSeat}
      position="bottom"
      bet={seatBet(vm, humanSeat, bets)}
    >
      {chat !== null && <Bubble line={vm.conversation.playerBubble} />}
    </Seat>
  );
}

function layoutClass(vm: ViewModel, humanSeat: SeatIndex, text: string | null): string {
  const botSeat: SeatIndex = humanSeat === 0 ? 1 : 0;
  const shown = vm.seats[botSeat].cards.some((card) => card !== 'back');
  return [
    'table-layout',
    text === null ? '' : 'table-result',
    text !== null && shown ? 'table-showdown' : '',
  ]
    .filter(Boolean)
    .join(' ');
}

function Actions({ props, over }: { props: TableProps; over: boolean }) {
  if (over) {
    return (
      <NextHand
        autoNextMs={props.autoNextMs ?? null}
        onNextHand={props.onNextHand}
        onWait={props.onWait ?? ignore}
      />
    );
  }
  const raise = props.vm.controls.raise;
  const barKey = raise === null ? 'none' : `${raise.min}:${raise.max}`;
  return <ActionBar key={barKey} controls={props.vm.controls} onAct={props.onAct} />;
}

export function Table(props: TableProps) {
  const { vm, phase, humanSeat } = props;
  const chat = chatOf(props);
  const botSeat: SeatIndex = humanSeat === 0 ? 1 : 0;
  const botWaiting = phase === 'botThinking' || phase === 'animating';
  const text = resultText(vm, humanSeat);
  const held = useSeatActions(vm);
  const bets = useSweep([vm.seats[0].bet, vm.seats[1].bet], vm.pot.collected);
  const thinking = botWaiting && vm.seats[botSeat].isToAct && !held.holding;
  const announcement = text ?? (thinking ? t('seat.thinking') : '');
  const seats = { vm, humanSeat, held, thinking, chat, bets };
  return (
    <div class={layoutClass(vm, humanSeat, text)}>
      <Announcements text={announcement} her={herLine(vm, chat)} />
      <TableLeft chat={chat} />
      <div class="table-centre">
        <FaceFrame name={vm.seats[botSeat].name} face={props.face?.(thinking)}>
          {chat !== null && <ChatSheet {...chat} />}
        </FaceFrame>
        <HerSeat {...seats} />
        <TableBoard vm={vm} humanSeat={humanSeat} text={text} />
        <YourSeat {...seats} />
      </div>
      <TableRight coach={props.coach}>
        <Actions props={props} over={text !== null && phase === 'handOver'} />
      </TableRight>
    </div>
  );
}
