import type { Intent, LogEntry, Phase, QuickPhrase, SeatIndex, ViewModel } from '../game/index.ts';
import { ActionBar } from './ActionBar.tsx';
import { Board } from './Board.tsx';
import { Bubble } from './Bubble.tsx';
import type { ChatProps } from './Chat.tsx';
import { ChatSheet } from './ChatSheet.tsx';
import { t } from './i18n.ts';
import { handName } from './phrases.ts';
import { Pot } from './Pot.tsx';
import { Seat } from './Seat.tsx';
import { SidePanel } from './SidePanel.tsx';

export interface TableProps {
  vm: ViewModel;
  phase: Phase;
  humanSeat: SeatIndex;
  log: LogEntry[];
  autoNextMs?: number | null;
  onAct: (intent: Intent) => void;
  onNextHand: () => void;
  onSay?: (text: string) => void;
  onQuick?: (id: QuickPhrase, text: string) => void;
}

const ignore = () => undefined;

function chatOf(props: TableProps): ChatProps | null {
  const { talk } = props.vm;
  if (!talk.available || !talk.on) {
    return null;
  }
  return { lines: talk.lines, onSay: props.onSay ?? ignore, onQuick: props.onQuick ?? ignore };
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

function Felt({
  vm,
  humanSeat,
  showPot,
}: {
  vm: ViewModel;
  humanSeat: SeatIndex;
  showPot: boolean;
}) {
  return (
    <div class="table-felt">
      <div class="felt-plane">
        {showPot && <Pot amount={vm.pot} />}
        <Board cards={vm.board} />
      </div>
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

function herText(vm: ViewModel): string {
  return vm.talk.herBubble?.text ?? '';
}

function Announcements({ text, her }: { text: string; her: string }) {
  return (
    <>
      <div class="visually-hidden" role="status" aria-live="polite" data-testid="live-region">
        {text}
      </div>
      <div class="visually-hidden" aria-live="polite" data-testid="talk-region">
        {her}
      </div>
    </>
  );
}

interface SeatsProps {
  vm: ViewModel;
  humanSeat: SeatIndex;
  thinking: boolean;
  chat: ChatProps | null;
}

function Seats({ vm, humanSeat, thinking, chat }: SeatsProps) {
  const botSeat: SeatIndex = humanSeat === 0 ? 1 : 0;
  const winner = vm.result?.winner ?? null;
  return (
    <>
      <Seat
        index={botSeat}
        view={vm.seats[botSeat]}
        thinking={thinking}
        winner={winner === botSeat}
        position="top"
      >
        {chat !== null && <Bubble line={vm.talk.herBubble} />}
        {chat !== null && <ChatSheet {...chat} />}
      </Seat>
      <Seat
        index={humanSeat}
        view={vm.seats[humanSeat]}
        thinking={false}
        winner={winner === humanSeat}
        position="bottom"
      >
        {chat !== null && <Bubble line={vm.talk.playerBubble} />}
      </Seat>
    </>
  );
}

export function Table(props: TableProps) {
  const { vm, phase, humanSeat, log, autoNextMs = null, onAct, onNextHand } = props;
  const chat = chatOf(props);
  const botSeat: SeatIndex = humanSeat === 0 ? 1 : 0;
  const botWaiting = phase === 'botThinking' || phase === 'animating';
  const text = resultText(vm, humanSeat);
  const raise = vm.controls.raise;
  const barKey = raise === null ? 'none' : `${raise.min}:${raise.max}`;
  const thinking = botWaiting && vm.seats[botSeat].isToAct;
  const announcement = text ?? (thinking ? t('seat.thinking') : '');
  return (
    <div class={`table-layout${text === null ? '' : ' table-result'}`}>
      <Announcements text={announcement} her={chat === null ? '' : herText(vm)} />
      <Felt vm={vm} humanSeat={humanSeat} showPot={text === null} />
      {text !== null && (
        <Result
          text={text}
          canContinue={phase === 'handOver'}
          autoNextMs={autoNextMs}
          onNextHand={onNextHand}
        />
      )}
      <Seats vm={vm} humanSeat={humanSeat} thinking={thinking} chat={chat} />
      <ActionBar key={barKey} controls={vm.controls} onAct={onAct} />
      <div class="table-side">
        <SidePanel
          log={log}
          names={[vm.seats[0].name, vm.seats[1].name]}
          humanSeat={humanSeat}
          chat={chat}
        />
        <aside class="coach" data-testid="coach" aria-label={t('coach.label')} />
      </div>
    </div>
  );
}
