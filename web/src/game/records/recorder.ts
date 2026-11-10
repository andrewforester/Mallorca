import type { BotBias, Decision } from '../../brains/index.ts';
import type { CoachDecision } from '../../coach/index.ts';
import type { EngineEvent, SeatIndex, TableMode } from '../../engine/index.ts';
import type { Moment, PersonaReader } from '../../persona/index.ts';
import { feelingCollector } from './feelings.ts';
import type { RecordedFeeling } from './feelings.ts';
import { handRecord, MATH_BOT, recordDecision } from './record.ts';
import type { RecordedCoach, RecordedDecision, RecordMeta } from './record.ts';
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
  decided(decision: Decision, events: EngineEvent[], bias?: BotBias): void;
  coached(decision: CoachDecision, events: EngineEvent[]): void;
  felt(her: PersonaReader | null, moments: readonly Moment[]): void;
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
  let coach: RecordedCoach[] = [];
  let feelings: RecordedFeeling[] = [];
  const collect = feelingCollector();
  const actedAt = (next: EngineEvent[]) => {
    const index = next.findIndex((event) => event.type === 'acted');
    return index < 0 ? null : events.length + index;
  };
  return {
    begin() {
      events = [];
      decisions = [];
      coach = [];
      feelings = [];
    },
    observe(next) {
      events = [...events, ...next];
    },
    decided(decision, next, bias) {
      const eventIndex = actedAt(next);
      if (eventIndex !== null) {
        decisions = [...decisions, recordDecision(decision, eventIndex, bias)];
      }
    },
    coached(decision, next) {
      const eventIndex = actedAt(next);
      if (eventIndex !== null) {
        coach = [...coach, { ...decision, eventIndex }];
      }
    },
    felt(her, moments) {
      if (her !== null) {
        feelings = [...feelings, ...collect(her, moments, events.length - moments.length)];
      }
    },
    save(mode, bot = MATH_BOT) {
      if (records === undefined) {
        return;
      }
      store(records, () =>
        handRecord(
          events,
          decisions,
          {
            sessionId: records.sessionId,
            mode,
            names: seating.names,
            humanSeat: seating.humanSeat,
            bot,
            playedAt: records.now(),
          },
          { coach, feelings },
        ),
      );
    },
  };
}
