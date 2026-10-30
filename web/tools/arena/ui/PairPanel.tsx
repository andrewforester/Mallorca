import { useEffect, useState } from 'preact/hooks';
import { toPokerStars } from '../../../src/game/records/pokerstars.ts';
import type { HandRecord } from '../../../src/game/records/record.ts';
import type { PairRow } from './analysis.ts';
import { BIG_BLIND, signed } from './format.ts';

interface Props {
  row: PairRow;
  a: string;
  record: (line: number) => Promise<HandRecord>;
}

export function PairPanel({ row, a, record }: Props) {
  const [texts, setTexts] = useState<string[] | null>(null);
  useEffect(() => {
    let live = true;
    setTexts(null);
    void Promise.all(row.hands.map((h) => record(h.line))).then((records) => {
      if (live) setTexts(records.map((r) => toPokerStars([r])));
    });
    return () => {
      live = false;
    };
  }, [row, record]);
  return (
    <section class="pair-panel">
      <h3>{`Pair ${row.pair + 1}: ${a} ${signed(row.net / BIG_BLIND)} bb`}</h3>
      {texts === null ? (
        <p class="note">Reading the hands.</p>
      ) : (
        <div class="hands">
          {row.hands.map((h, i) => (
            <div key={h.handNumber}>
              <h4>{`${a} ${h.position === 'button' ? 'on the button' : 'in the big blind'}: ${signed(h.aNet / BIG_BLIND)} bb`}</h4>
              <pre data-testid="hand-text">{texts[i]}</pre>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
