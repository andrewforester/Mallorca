import type { DebugView } from '../../game/index.ts';
import { COPY } from './copy.ts';
import { f2 } from './format.ts';
import { describeEvent } from './events.ts';

export function JournalSection({ view }: { view: DebugView }) {
  return (
    <section class="debug-section">
      <h3>{COPY.sections.journal}</h3>
      {view.journal.length === 0 && <p class="debug-note">{COPY.journal.empty}</p>}
      <ol class="debug-journal" data-testid="debug-journal">
        {view.journal.map((entry, k) => (
          <li key={k}>
            <span class="debug-entry-head">
              {`${COPY.journal.hand} ${entry.handNumber}: ${describeEvent(entry.event)}`}
            </span>
            {entry.impulses.map((i, n) => (
              <span class="debug-impulse" key={n}>
                {`${COPY.emotion[i.emotion]} +${f2(i.amount)} ${i.reason}`}
              </span>
            ))}
            <span class="debug-note">
              {`${COPY.journal.words}: ${entry.words.length === 0 ? COPY.journal.noWords : entry.words.join(', ')}`}
              {entry.spoke && `, ${COPY.journal.spoke}`}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
