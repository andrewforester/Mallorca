import type { ComponentChildren } from 'preact';
import type { LogEntry, SeatView } from '../game/index.ts';
import { ActionBubble } from './ActionBubble.tsx';
import { BetChips } from './BetChips.tsx';
import { Card } from './Card.tsx';
import { DealerButton } from './DealerButton.tsx';

export interface SeatProps {
  index: 0 | 1;
  view: SeatView;
  action: LogEntry | null;
  thinking: boolean;
  winner: boolean;
  position: 'top' | 'bottom';
  bet?: { amount: number; sweeping: boolean };
  children?: ComponentChildren;
}

function Cards({ view, winner }: { view: SeatView; winner: boolean }) {
  return (
    <div class="seat-cards">
      {view.cards.map((card, slot) => (
        <Card key={slot} card={card} highlight={winner && card !== 'back'} />
      ))}
    </div>
  );
}

function Block({ index, view, action, thinking }: SeatProps) {
  return (
    <div class="seat-block">
      <span class="seat-name">{view.name}</span>
      <span class="seat-stack" data-testid={`stack-${index}`} data-stack={view.stack}>
        {view.stack}
      </span>
      <ActionBubble seat={index} entry={action} thinking={thinking} />
    </div>
  );
}

function Side({ index, view, bet }: SeatProps) {
  return (
    <div class="seat-side">
      <span class="dealer-slot">{view.isButton && <DealerButton />}</span>
      {bet !== undefined && <BetChips seat={index} amount={bet.amount} sweeping={bet.sweeping} />}
    </div>
  );
}

export function Seat(props: SeatProps) {
  const { index, view, winner, position, children } = props;
  const shown = position === 'top' && view.cards.some((card) => card !== 'back');
  const className = [
    'seat',
    `seat-${position}`,
    shown ? 'seat-shown' : '',
    view.isToAct ? 'seat-active' : '',
    winner ? 'seat-winner' : '',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <section class={className} data-testid={`seat-${index}`} data-winner={winner}>
      <Cards view={view} winner={winner} />
      <Block {...props} />
      <Side {...props} />
      {children}
    </section>
  );
}
