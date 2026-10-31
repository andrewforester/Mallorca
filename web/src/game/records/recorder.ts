import type { BotStyle, Decision } from '../../brains/index.ts';
import type { EngineEvent, SeatIndex, TableMode } from '../../engine/index.ts';
import { handRecord, MATH_BOT, recordDecision } from './record.ts';
import type { RecordedDecision, RecordMeta } from './record.ts';
import type { HandStore } from './store.ts';

export interface RecordsOptions {
  store: HandStore;
  sessionId: string;
  now: () => string;
}

export interface Seating {
  names: [string, string];
  humanSeat: SeatIndex;
}

export interface HandRecorder {
  begin(): void;
  observe(events: EngineEvent[]): void;
  decided(decision: Decision, events: EngineEvent[], style?: BotStyle): void;
  save(mode: TableMode, bot?: RecordMeta['bot']): void;
}

function store(records: RecordsOptions, saved: () => ReturnType<typeof handRecord>): void {
  try {
    records.store.add(saved()).catch(() => {});
  } catch {
    return;
  }
}

export function handRecorder(records: RecordsOptions | undefined, seating: Seating): HandRecorder {
  let events: EngineEvent[] = [];
  let decisions: RecordedDecision[] = [];
  return {
    begin() {
      events = [];
      decisions = [];
    },
    observe(next) {
      events = [...events, ...next];
    },
    decided(decision, next, style) {
      const index = next.findIndex((event) => event.type === 'acted');
      if (index >= 0) {
        decisions = [...decisions, recordDecision(decision, events.length + index, style)];
      }
    },
    save(mode, bot = MATH_BOT) {
      if (records === undefined) {
        return;
      }
      store(records, () =>
        handRecord(events, decisions, {
          sessionId: records.sessionId,
          mode,
          names: seating.names,
          humanSeat: seating.humanSeat,
          bot,
          playedAt: records.now(),
        }),
      );
    },
  };
}
