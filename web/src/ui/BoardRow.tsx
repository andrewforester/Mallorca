import type { Card as CardValue, ViewModel } from '../game/index.ts';
import { Board } from './Board.tsx';
import { Pot } from './Pot.tsx';

export interface BoardRowProps {
  pot: ViewModel['pot'] | null;
  board: CardValue[];
}

export function BoardRow({ pot, board }: BoardRowProps) {
  return (
    <div class="board-row">
      <div class="pot-block">{pot !== null && <Pot {...pot} />}</div>
      <Board cards={board} />
    </div>
  );
}
