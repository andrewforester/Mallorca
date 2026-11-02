import type { ConversationTrace } from '../../game/index.ts';
import { TALK } from './conversationCopy.ts';
import { TraceItem } from './TraceItem.tsx';

const listOf = (counts: Partial<Record<string, number>>): string => {
  const parts = Object.entries(counts).map(([k, n]) => `${k} ${n ?? 0}`);
  return parts.length === 0 ? TALK.totals.none : parts.join(', ');
};

function Totals({ trace }: { trace: ConversationTrace }) {
  const { totals } = trace;
  return (
    <p class="debug-note" data-testid="conversation-totals">
      {`${TALK.totals.occasions} ${totals.occasions}. ${TALK.totals.lines} ${totals.lines}. `}
      {`${TALK.totals.silences}: ${listOf(totals.silences)}. `}
      {`${TALK.totals.meanWords} ${totals.meanWords.toFixed(1)}. `}
      {`${TALK.totals.rejections}: ${listOf(totals.rejections)}.`}
    </p>
  );
}

function copy(trace: ConversationTrace): void {
  void navigator.clipboard?.writeText(JSON.stringify(trace, null, 2)).catch(() => undefined);
}

export function ConversationDebug({ trace }: { trace: ConversationTrace }) {
  return (
    <section class="debug-section" data-testid="conversation-debug">
      <h3>{TALK.title}</h3>
      <Totals trace={trace} />
      <button type="button" class="debug-reset" onClick={() => copy(trace)}>
        {TALK.copy}
      </button>
      {trace.entries.length === 0 && <p class="debug-note">{TALK.empty}</p>}
      <ol class="debug-journal debug-trace">
        {trace.entries.map((entry) => (
          <TraceItem entry={entry} key={entry.id} />
        ))}
      </ol>
    </section>
  );
}
