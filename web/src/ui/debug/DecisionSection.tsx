import { formatCard } from '../../game/index.ts';
import type { Card, DebugView } from '../../game/index.ts';
import { COPY } from './copy.ts';
import { pct } from './format.ts';

type Move = { label: keyof typeof COPY.move; amount: number };

const moveText = (m: Move): string =>
  m.amount > 0 ? `${COPY.move[m.label]} ${m.amount}` : COPY.move[m.label];

const cards = (list: readonly Card[]): string => list.map(formatCard).join(' ');

export function DecisionSection({ view }: { view: DebugView }) {
  const d = view.decision;
  return (
    <section class="debug-section" data-testid="debug-decision">
      <h3>{COPY.sections.decision}</h3>
      {d === null ? (
        <p class="debug-note">{COPY.decision.none}</p>
      ) : (
        <>
          <p class="debug-note">{`${COPY.decision.hand}: ${d.hand === null ? '' : cards(d.hand)}`}</p>
          {d.board.length > 0 && (
            <p class="debug-note">{`${COPY.decision.board}: ${cards(d.board)}`}</p>
          )}
          <table class="debug-table debug-decision">
            <thead>
              <tr>
                <th>{COPY.decision.move}</th>
                <th>{COPY.decision.blueprint}</th>
                <th>{COPY.decision.styled}</th>
              </tr>
            </thead>
            <tbody>
              {d.rows.map((row, k) => (
                <tr key={k} aria-current={row.chosen} class={row.chosen ? 'debug-chosen' : ''}>
                  <td>{moveText(row.move)}</td>
                  <td>{pct(row.base)}</td>
                  <td>{pct(row.styled)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p class="debug-note">{`${COPY.decision.played}: ${moveText(d.action)}`}</p>
        </>
      )}
    </section>
  );
}
