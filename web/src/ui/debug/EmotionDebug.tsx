import { useEffect, useState } from 'preact/hooks';
import { toDebugView } from '../../game/index.ts';
import type { DebugState, Session } from '../../game/index.ts';
import { COPY } from './copy.ts';
import { DecisionSection } from './DecisionSection.tsx';
import { JournalSection } from './JournalSection.tsx';
import { PersonalitySection } from './PersonalitySection.tsx';
import { StateSection } from './StateSection.tsx';
import { BiasSection } from './BiasSection.tsx';
import { ConversationDebug } from './ConversationDebug.tsx';
import { TALK } from './conversationCopy.ts';
import './debug.css';

const KEY = 'mallorca.debugPanel';
const TAB_KEY = 'mallorca.debugTab';

type Tab = 'feelings' | 'conversation';

function readTab(): Tab {
  try {
    return localStorage.getItem(TAB_KEY) === 'conversation' ? 'conversation' : 'feelings';
  } catch {
    return 'feelings';
  }
}

function writeTab(tab: Tab): void {
  try {
    localStorage.setItem(TAB_KEY, tab);
  } catch {
    return;
  }
}

function Tabs({ tab, choose }: { tab: Tab; choose: (tab: Tab) => void }) {
  const tabs: Tab[] = ['feelings', 'conversation'];
  return (
    <div class="debug-tabs" role="tablist">
      {tabs.map((t) => (
        <button
          key={t}
          type="button"
          role="tab"
          class="debug-tab"
          aria-selected={tab === t}
          onClick={() => choose(t)}
        >
          {TALK.tabs[t]}
        </button>
      ))}
    </div>
  );
}

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
  const [tab, setTab] = useState(readTab);
  if (debug === null) {
    return null;
  }
  const view = toDebugView(debug);
  const flip = () => {
    writeOpen(!open);
    setOpen(!open);
  };
  const choose = (next: Tab) => {
    writeTab(next);
    setTab(next);
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
          <Tabs tab={tab} choose={choose} />
          {tab === 'conversation' ? (
            <ConversationDebug trace={view.conversation} />
          ) : (
            <>
              <PersonalitySection view={view} session={session} />
              <StateSection view={view} />
              <BiasSection view={view} />
              <DecisionSection view={view} />
              <JournalSection view={view} />
            </>
          )}
        </aside>
      )}
    </>
  );
}
