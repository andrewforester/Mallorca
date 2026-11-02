import { toObservations } from '../brains/index.ts';
import { reviewDecision, spotOf } from '../coach/index.ts';
import type { CoachDecision, CoachFacts } from '../coach/index.ts';
import type {
  Action,
  BettingStreet,
  EngineEvent,
  LegalActions,
  SeatIndex,
} from '../engine/index.ts';
import type { BotClient } from './botClient.ts';

export type CoachStatus = 'off' | 'idle' | 'waiting' | 'ready' | 'unavailable';

export interface CoachState {
  status: CoachStatus;
  facts: CoachFacts | null;
  review: CoachDecision[];
  log: CoachDecision[];
}

export const COACH_OFF: CoachState = { status: 'off', facts: null, review: [], log: [] };

export interface Coach {
  on: boolean;
  setOn(on: boolean): void;
  handStarted(): void;
  observe(events: EngineEvent[]): void;
  ask(legal: LegalActions, pot: number): void;
  played(action: Action): CoachDecision | null;
  acted(): void;
}

function streetOf(events: readonly EngineEvent[]): BettingStreet {
  let street: BettingStreet = 'preflop';
  for (const event of events) {
    if (event.type === 'streetDealt') street = event.street;
  }
  return street;
}

export function createCoach(
  bot: BotClient,
  humanSeat: SeatIndex,
  on: boolean,
  publish: (state: CoachState) => void,
): Coach {
  let events: EngineEvent[] = [];
  let ticket = 0;
  let state: CoachState = COACH_OFF;
  const emit = (next: Partial<CoachState>) => {
    state = { ...state, ...next };
    publish(state);
  };
  const idle = () => emit({ status: coach.on ? 'idle' : 'off', facts: null });
  const coach: Coach = {
    on,
    setOn(next) {
      ticket += 1;
      coach.on = next;
      idle();
    },
    handStarted() {
      ticket += 1;
      events = [];
      emit({ status: coach.on ? 'idle' : 'off', facts: null, review: [] });
    },
    observe(more) {
      events = [...events, ...more];
    },
    ask(legal, pot) {
      ticket += 1;
      if (!coach.on) return;
      const mine = ticket;
      const unavailable = () => {
        if (mine === ticket) emit({ status: 'unavailable', facts: null });
      };
      const asked = bot.coach?.(toObservations(events, humanSeat), legal, pot);
      if (asked === undefined) {
        unavailable();
        return;
      }
      emit({ status: 'waiting', facts: null });
      asked.then((facts) => {
        if (mine === ticket) emit({ status: 'ready', facts });
      }, unavailable);
    },
    played(action) {
      const hint = state.status === 'ready' && coach.on ? state.facts?.hint : null;
      if (hint === null || hint === undefined) return null;
      const decision = reviewDecision(hint, action, streetOf(events), spotOf(events, humanSeat));
      emit({ review: [...state.review, decision], log: [...state.log, decision] });
      return decision;
    },
    acted() {
      ticket += 1;
      if (coach.on) idle();
    },
  };
  return coach;
}
