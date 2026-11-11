import type { DebugView, HandStore, Session } from '../../game/index.ts';
import { COPY } from './copy.ts';
import { signed } from './format.ts';
import { describeEvent } from './events.ts';
import { TALK } from './conversationCopy.ts';
import { copyHistory } from './history.ts';

function lineOf(view: DebugView, id: number): number | null {
  const fed = view.conversation.entries.find(
    (e) => e.plan !== null && e.verdict.occasion.journalIds.includes(id),
  );
  return fed?.id ?? null;
}

interface JournalProps {
  view: DebugView;
  store: HandStore;
  session: Session;
}

export function JournalSection({ view, store, session }: JournalProps) {
  return (
    <section class="debug-section">
      <h3>{COPY.sections.journal}</h3>
      <button type="button" class="debug-reset" onClick={() => void copyHistory(store, session)}>
        {COPY.journal.copy}
      </button>
      {view.journal.length === 0 && <p class="debug-note">{COPY.journal.empty}</p>}
      <ol class="debug-journal" data-testid="debug-journal">
        {view.journal.map((entry, k) => (
          <li key={k} id={`journal-${entry.id}`}>
            <span class="debug-entry-head">
              {`${COPY.journal.hand} ${entry.handNumber}: ${describeEvent(entry.event)}`}
            </span>
            {entry.impulses.map((i, n) => (
              <span class="debug-impulse" key={n}>
                {`${COPY.emotion[i.emotion]} ${signed(i.amount)} ${i.reason}`}
              </span>
            ))}
            <span class="debug-note">
              {`${COPY.journal.words}: ${entry.words.length === 0 ? COPY.journal.noWords : entry.words.join(', ')}`}
              {entry.spoke && `, ${COPY.journal.spoke}`}
            </span>
            {lineOf(view, entry.id) !== null && (
              <a class="debug-note" href={`#trace-${lineOf(view, entry.id)}`}>
                {TALK.line}
              </a>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
