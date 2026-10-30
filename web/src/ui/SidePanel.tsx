import { useState } from 'preact/hooks';
import type { LogEntry, SeatIndex } from '../game/index.ts';
import { Chat } from './Chat.tsx';
import type { ChatProps } from './Chat.tsx';
import { HandLog } from './HandLog.tsx';
import { t } from './i18n.ts';

export interface SidePanelProps {
  log: LogEntry[];
  names: [string, string];
  humanSeat: SeatIndex;
  chat: ChatProps | null;
}

type Tab = 'log' | 'chat';

function TabButton({
  tab,
  current,
  onSelect,
}: {
  tab: Tab;
  current: Tab;
  onSelect: (tab: Tab) => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      id={`side-tab-${tab}`}
      class="side-tab"
      data-testid={`tab-${tab}`}
      aria-selected={tab === current}
      aria-controls={`side-panel-${tab}`}
      tabIndex={tab === current ? 0 : -1}
      onClick={() => onSelect(tab)}
    >
      {t(tab === 'log' ? 'talk.log' : 'talk.tab')}
    </button>
  );
}

export function SidePanel({ log, names, humanSeat, chat }: SidePanelProps) {
  const [tab, setTab] = useState<Tab>('log');
  const handLog = <HandLog entries={log} names={names} humanSeat={humanSeat} />;
  if (chat === null) {
    return handLog;
  }
  return (
    <div class="side-panel glass" data-testid="side-panel">
      <div class="side-tabs" role="tablist" aria-label={t('talk.tabs')}>
        <TabButton tab="log" current={tab} onSelect={setTab} />
        <TabButton tab="chat" current={tab} onSelect={setTab} />
      </div>
      <div
        class="side-tabpanel"
        role="tabpanel"
        id="side-panel-log"
        aria-labelledby="side-tab-log"
        hidden={tab !== 'log'}
      >
        {handLog}
      </div>
      <div
        class="side-tabpanel"
        role="tabpanel"
        id="side-panel-chat"
        aria-labelledby="side-tab-chat"
        data-testid="chat-panel"
        hidden={tab !== 'chat'}
      >
        <Chat {...chat} />
      </div>
    </div>
  );
}
