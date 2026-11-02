import { useMemo, useState } from 'preact/hooks';
import { STREETS, pairRows } from './analysis.ts';
import type { HandFilter, HandSummary, PairRow } from './analysis.ts';
import { LABELS, signed } from './format.ts';

const PAGE = 50;

interface Props {
  hands: HandSummary[];
  open: PairRow | null;
  onOpen: (row: PairRow) => void;
}

function bb(chips: number, bigBlind: number): string {
  return signed(chips / bigBlind);
}

function Choice({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <label>
      {label}
      <select value={value} onChange={(e) => onChange((e.target as HTMLSelectElement).value)}>
        <option value="">Any</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {LABELS[o] ?? o}
          </option>
        ))}
      </select>
    </label>
  );
}

function toFilter(position: string, street: string, showdown: string): HandFilter {
  return {
    position: position === '' ? undefined : (position as HandFilter['position']),
    street: street === '' ? undefined : (street as HandFilter['street']),
    showdown: showdown === '' ? undefined : showdown === 'showdown',
  };
}

function Row({ row, open, onOpen }: { row: PairRow; open: boolean; onOpen: () => void }) {
  const { bigBlind } = row.hands[0];
  return (
    <tr class={open ? 'selected' : ''} onClick={onOpen} data-testid="pair-row">
      <td class="num">
        <button type="button" class="link">
          {row.pair + 1}
        </button>
      </td>
      {row.hands.map((h, i) => (
        <td
          key={h.handNumber}
          class={`num ${h.aNet < 0 ? 'loss' : 'win'}${row.matches[i] ? '' : ' dim'}`}
        >
          {`${bb(h.aNet, h.bigBlind)} ${LABELS[h.street]?.toLowerCase()}${h.showdown ? ', showdown' : ''}`}
        </td>
      ))}
      <td class={`num ${row.net < 0 ? 'loss' : 'win'}`}>{bb(row.net, bigBlind)}</td>
      <td class="num">{row.pot / bigBlind}</td>
    </tr>
  );
}

export function HandList({ hands, open, onOpen }: Props) {
  const [position, setPosition] = useState('');
  const [street, setStreet] = useState('');
  const [showdown, setShowdown] = useState('');
  const [sort, setSort] = useState<'net' | 'pot'>('net');
  const [page, setPage] = useState(0);
  const rows = useMemo(
    () => pairRows(hands, toFilter(position, street, showdown), sort),
    [hands, position, street, showdown, sort],
  );
  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  const current = Math.min(page, pages - 1);
  const reset = (set: (v: string) => void) => (v: string) => {
    set(v);
    setPage(0);
  };
  return (
    <section>
      <h3>Pairs</h3>
      <div class="controls">
        <Choice
          label="Position"
          value={position}
          options={['button', 'bigBlind']}
          onChange={reset(setPosition)}
        />
        <Choice label="Last action" value={street} options={STREETS} onChange={reset(setStreet)} />
        <Choice
          label="Showdown"
          value={showdown}
          options={['showdown', 'no-showdown']}
          onChange={reset(setShowdown)}
        />
        <label>
          Sort by
          <select
            value={sort}
            onChange={(e) => setSort((e.target as HTMLSelectElement).value as 'net' | 'pot')}
          >
            <option value="net">Largest pair result</option>
            <option value="pot">Largest pot</option>
          </select>
        </label>
      </div>
      <p class="note">{`${rows.length} pairs where either hand matches, sorted by the matching hands. Faded hands do not match. Amounts in big blinds for A.`}</p>
      <div class="scroll">
        <table class="pairs">
          <thead>
            <tr>
              <th class="num">Pair</th>
              <th class="num">A on the button</th>
              <th class="num">A in the big blind</th>
              <th class="num">Pair</th>
              <th class="num">Largest pot</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(current * PAGE, (current + 1) * PAGE).map((row) => (
              <Row
                key={row.pair}
                row={row}
                open={open?.pair === row.pair}
                onOpen={() => onOpen(row)}
              />
            ))}
          </tbody>
        </table>
      </div>
      <div class="pager">
        <button type="button" disabled={current === 0} onClick={() => setPage(current - 1)}>
          Previous
        </button>
        <span>{`Page ${current + 1} of ${pages}`}</span>
        <button type="button" disabled={current >= pages - 1} onClick={() => setPage(current + 1)}>
          Next
        </button>
      </div>
    </section>
  );
}
