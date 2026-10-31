import { useEffect, useState } from 'preact/hooks';
import { toPokerStars } from '../../../src/game/records/pokerstars.ts';
import type { HandRecord } from '../../../src/game/records/record.ts';
import type { PairRow } from './analysis.ts';
import { signed } from './format.ts';

interface Props {
  row: PairRow;
  a: string;
  record: (line: number) => Promise<HandRecord>;
}

export function PairPanel({ row, a, record }: Props) {
  const [texts, setTexts] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    setTexts(null);
    setError(null);
    Promise.all(row.hands.map((h) => record(h.line))).then(
      (records) => live && setTexts(records.map((r) => toPokerStars([r]))),
      (reason: unknown) =>
        live && setError(reason instanceof Error ? reason.message : String(reason)),
    );
    return () => {
      live = false;
    };
  }, [row, record]);
  return (
    <section class="pair-panel">
      <h3>{`Pair ${row.pair + 1}: ${a} ${signed(row.net / row.hands[0].bigBlind)} bb`}</h3>
      {error !== null && <p class="warning">{`Could not read the hands of this pair: ${error}`}</p>}
      {error !== null ? null : texts === null ? (
        <p class="note">Reading the hands.</p>
      ) : (
        <div class="hands">
          {row.hands.map((h, i) => (
            <div key={h.handNumber}>
              <h4>{`${a} ${h.position === 'button' ? 'on the button' : 'in the big blind'}: ${signed(h.aNet / h.bigBlind)} bb`}</h4>
              <pre data-testid="hand-text">{texts[i]}</pre>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
