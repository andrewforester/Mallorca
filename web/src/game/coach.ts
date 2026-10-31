import { toObservations } from '../brains/index.ts';
import type { CoachFacts } from '../coach/index.ts';
import type { EngineEvent, LegalActions, SeatIndex } from '../engine/index.ts';
import type { BotClient } from './botClient.ts';

export type CoachStatus = 'off' | 'idle' | 'waiting' | 'ready' | 'unavailable';

export interface CoachState {
  status: CoachStatus;
  facts: CoachFacts | null;
}

export const COACH_OFF: CoachState = { status: 'off', facts: null };
const IDLE: CoachState = { status: 'idle', facts: null };

export interface Coach {
  on: boolean;
  setOn(on: boolean): void;
  handStarted(): void;
  observe(events: EngineEvent[]): void;
  ask(legal: LegalActions, pot: number): void;
  acted(): void;
}

export function createCoach(
  bot: BotClient,
  humanSeat: SeatIndex,
  on: boolean,
  publish: (state: CoachState) => void,
): Coach {
  let events: EngineEvent[] = [];
  let ticket = 0;
  const coach: Coach = {
    on,
    setOn(next) {
      ticket += 1;
      coach.on = next;
      publish(next ? IDLE : COACH_OFF);
    },
    handStarted() {
      ticket += 1;
      events = [];
      if (coach.on) publish(IDLE);
    },
    observe(more) {
      events = [...events, ...more];
    },
    ask(legal, pot) {
      ticket += 1;
      if (!coach.on) return;
      const mine = ticket;
      const unavailable = () => {
        if (mine === ticket) publish({ status: 'unavailable', facts: null });
      };
      const asked = bot.coach?.(toObservations(events, humanSeat), legal, pot);
      if (asked === undefined) {
        unavailable();
        return;
      }
      publish({ status: 'waiting', facts: null });
      asked.then((facts) => {
        if (mine === ticket) publish({ status: 'ready', facts });
      }, unavailable);
    },
    acted() {
      ticket += 1;
      if (coach.on) publish(IDLE);
    },
  };
  return coach;
}
