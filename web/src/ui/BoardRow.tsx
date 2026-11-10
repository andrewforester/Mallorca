import type { ComponentChildren } from 'preact';
import type { Card as CardValue, ViewModel } from '../game/index.ts';
import { Board } from './Board.tsx';
import { Pot } from './Pot.tsx';

export interface BoardRowProps {
  pot: ViewModel['pot'] | null;
  board: CardValue[];
  result?: ComponentChildren;
  played?: readonly CardValue[] | null;
}

export function BoardRow({ pot, board, result, played = null }: BoardRowProps) {
  return (
    <div class="board-row">
      <div class="pot-block">
        {pot !== null && <Pot {...pot} />}
        {result}
      </div>
      <Board cards={board} played={played} />
    </div>
  );
}
