import { toFeelingsText } from '../../game/index.ts';
import type { ConversationTrace, HandStore, Session } from '../../game/index.ts';

function saidIn(trace: ConversationTrace | undefined): (journalId: number) => string | null {
  return (journalId) => {
    const line = trace?.entries.find(
      (e) => e.fate === 'shown' && e.verdict.occasion.journalIds.includes(journalId),
    );
    return line?.answer?.text ?? null;
  };
}

export async function copyHistory(store: HandStore, session: Session): Promise<void> {
  const { sessionId, debug } = session.getState();
  if (sessionId === null) {
    return;
  }
  try {
    const records = await store.list(sessionId);
    await navigator.clipboard?.writeText(toFeelingsText(records, saidIn(debug?.conversation)));
  } catch {
    return;
  }
}
