import { useEffect, useState } from 'preact/hooks';
import { toDebugView } from '../../game/index.ts';
import type { DebugState, Session } from '../../game/index.ts';
import { COPY } from './copy.ts';
import { DecisionSection } from './DecisionSection.tsx';
import { JournalSection } from './JournalSection.tsx';
import { PersonalitySection } from './PersonalitySection.tsx';
import { StateSection } from './StateSection.tsx';
import { StyleSection } from './StyleSection.tsx';
import './debug.css';

const KEY = 'mallorca.debugPanel';

function readOpen(): boolean {
  try {
    return localStorage.getItem(KEY) === 'open';
  } catch {
    return false;
  }
}

function writeOpen(open: boolean): void {
  try {
    localStorage.setItem(KEY, open ? 'open' : 'closed');
  } catch {
    return;
  }
}

function useDebug(session: Session): DebugState | null {
  const [debug, setDebug] = useState(session.getState().debug);
  useEffect(() => {
    setDebug(session.getState().debug);
    return session.subscribe((state) => setDebug(state.debug));
  }, [session]);
  return debug;
}

export function EmotionDebug({ session }: { session: Session }) {
  const debug = useDebug(session);
  const [open, setOpen] = useState(readOpen);
  if (debug === null) {
    return null;
  }
  const view = toDebugView(debug);
  const flip = () => {
    writeOpen(!open);
    setOpen(!open);
  };
  return (
    <>
      <button
        type="button"
        class="debug-toggle"
        data-testid="emotion-debug-toggle"
        aria-expanded={open}
        aria-controls="emotion-debug"
        onClick={flip}
      >
        {COPY.toggle}
      </button>
      {open && (
        <aside
          id="emotion-debug"
          class="debug-panel"
          data-testid="emotion-debug"
          aria-label={COPY.title}
        >
          <PersonalitySection view={view} session={session} />
          <StateSection view={view} />
          <StyleSection view={view} />
          <DecisionSection view={view} />
          <JournalSection view={view} />
        </aside>
      )}
    </>
  );
}
