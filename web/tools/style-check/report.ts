import { formatCard } from '../../src/cards/index.ts';
import type { Action } from '../../src/engine/index.ts';
import { AXES } from './replay.ts';
import type { Decision } from './replay.ts';

const STREETS = ['preflop', 'flop', 'turn', 'river'];

const pct = (v: number | undefined): string => `${(100 * (v ?? 0)).toFixed(1)}%`;

function moveText(move: Action): string {
  if (move.kind === 'raise') return `raise to ${move.to}`;
  return move.kind;
}

function heading(d: Decision, number: number): string[] {
  const name = d.hand.names[d.her];
  const cards = d.hole.map(formatCard).join(' ');
  const board = d.board.length === 0 ? '' : `, board ${d.board.map(formatCard).join(' ')}`;
  const toCall = d.spot.legal.call === null ? 'nothing to call' : `${d.spot.legal.call} to call`;
  return [
    `### Decision ${number}: ${STREETS[d.street]}, ${name} holds ${cards}${board}, pot ${d.spot.pot}, ${toCall}`,
    '',
    `Style: ${AXES.map((axis) => `${axis} ${d.style[axis]}`).join(', ')}`,
    '',
  ];
}

function table(d: Decision): string[] {
  const axes = AXES.filter((axis) => d.style[axis] !== 1);
  const head = ['Move', 'Blueprint', 'Her style', ...axes.map((axis) => `${axis} alone`)];
  const rows = d.moves.map((move, i) => {
    const label = i === d.played ? `**${moveText(move)}** (played)` : moveText(move);
    return [label, pct(d.base[i]), pct(d.styled[i]), ...axes.map((axis) => pct(d.only[axis][i]))];
  });
  return [head, head.map(() => '---'), ...rows].map((r) => `| ${r.join(' | ')} |`);
}

export function report(decisions: Decision[]): string {
  const hands: string[] = [];
  let title = '';
  decisions.forEach((d, i) => {
    if (d.hand.title !== title) {
      title = d.hand.title;
      hands.push(`## ${title}`, '');
    }
    hands.push(...heading(d, i + 1), ...table(d), '');
  });
  const summary = `${decisions.length} decisions of her, each replayed with the blueprint, her style and every axis alone.`;
  return [`# Style check`, '', summary, '', ...hands].join('\n');
}
