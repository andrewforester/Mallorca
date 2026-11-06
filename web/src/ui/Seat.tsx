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

function Cards({ view, winner, shown }: { view: SeatView; winner: boolean; shown: boolean }) {
  return (
    <div class={shown ? 'seat-cards seat-cards-shown' : 'seat-cards'}>
      {view.cards.map((card, slot) => (
        <Card key={slot} card={card} highlight={winner && card !== 'back'} />
      ))}
    </div>
  );
}

function Plate({ props, backs }: { props: SeatProps; backs: ComponentChildren }) {
  const { index, view, action, thinking, bet } = props;
  return (
    <div class="seat-plate">
      <div class="seat-who">
        <span class="seat-name">{view.name}</span>
        {view.isButton && <DealerButton />}
        <span class="seat-stack" data-testid={`stack-${index}`} data-stack={view.stack}>
          {view.stack}
        </span>
        {backs}
      </div>
      <div class="seat-act">
        {bet !== undefined && <BetChips seat={index} amount={bet.amount} sweeping={bet.sweeping} />}
        <div class="seat-bubble">
          <ActionBubble seat={index} entry={action} thinking={thinking} />
        </div>
      </div>
    </div>
  );
}

export function Seat(props: SeatProps) {
  const { index, view, winner, position, children } = props;
  const className = [
    'seat',
    `seat-${position}`,
    view.isToAct ? 'seat-active' : '',
    winner ? 'seat-winner' : '',
  ]
    .filter(Boolean)
    .join(' ');
  const top = position === 'top';
  const shown = top && view.cards.some((card) => card !== 'back');
  const cards = <Cards view={view} winner={winner} shown={shown} />;
  return (
    <section class={className} data-testid={`seat-${index}`} data-winner={winner}>
      {(!top || shown) && cards}
      <Plate props={props} backs={top && !shown ? cards : null} />
      {children}
    </section>
  );
}
