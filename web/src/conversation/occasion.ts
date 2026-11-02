import type { EngineEvent, SeatIndex } from '../engine/index.ts';
import type { HandState, Moment, StrengthClass } from '../persona/index.ts';
import type { HandEnd, Occasion, OccasionKind } from './types.ts';

export const CARD_IMPULSE = 0.2;

function actedKind(event: EngineEvent, seat: SeatIndex): OccasionKind | null {
  if (event.type !== 'acted') {
    return null;
  }
  const kind = event.action.kind;
  if (event.seat !== seat) {
    return kind === 'raise' ? 'playerRaise' : null;
  }
  if (kind === 'raise') {
    return 'herBet';
  }
  return kind === 'fold' ? 'herFold' : 'herCall';
}

function strongestImpulse(moment: Moment): number {
  return moment.impulses.reduce((most, i) => Math.max(most, i.amount), 0);
}

function kindOf(moment: Moment, seat: SeatIndex): OccasionKind | null {
  const { event } = moment;
  if (event.type === 'handEnded') {
    return 'handEnded';
  }
  if (event.type === 'streetDealt') {
    return strongestImpulse(moment) >= CARD_IMPULSE ? 'card' : null;
  }
  return actedKind(event, seat);
}

function endOf(moment: Moment, seat: SeatIndex): HandEnd {
  const hand = moment.after;
  const won = hand.awarded[seat] > 0;
  if (!won && hand.showdown !== null && moment.strength === 'weak' && hand.herLateBet) {
    return 'bluffCaught';
  }
  if (moment.playerBluffShown) {
    return 'playerBluffShown';
  }
  return won ? 'won' : 'lost';
}

export function occasionsOf(
  moments: readonly Moment[],
  seat: SeatIndex,
  strengthNow: () => StrengthClass,
): Occasion[] {
  const last = moments[moments.length - 1];
  if (last === undefined) {
    return [];
  }
  const hand = last.after;
  const result: Occasion[] = [];
  for (const moment of moments) {
    const kind = kindOf(moment, seat);
    if (kind === null) {
      continue;
    }
    const ended = kind === 'handEnded';
    result.push({
      kind,
      end: ended ? endOf(moment, seat) : null,
      impulses: moment.impulses,
      journalIds: moment.journalIds,
      handNumber: moment.after.handNumber,
      street: hand.street,
      actionStreet: kind === 'card' ? moment.after.street : moment.before.street,
      strength: moment.strength ?? strengthNow(),
      endsHand: ended,
      hand,
      text: null,
      previous: null,
    });
  }
  return result;
}

export function replyOccasion(
  text: string,
  hand: HandState,
  strength: StrengthClass,
  previous: OccasionKind | null,
): Occasion {
  return {
    kind: 'playerSaid',
    end: null,
    impulses: [],
    journalIds: [],
    handNumber: hand.handNumber,
    street: hand.street,
    actionStreet: hand.street,
    strength,
    endsHand: false,
    hand,
    text,
    previous,
  };
}
