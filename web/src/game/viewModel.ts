import type { Card } from '../cards/index.ts';
import { legalActionsOf, rulesOf, toAct } from '../engine/index.ts';
import type { Hand, LegalActions, LogEntry, SeatIndex } from '../engine/index.ts';
import type { HandCategory } from '../equity/index.ts';
import type { Level } from '../talk/index.ts';
import type { ChatLine, SessionState } from './session.ts';

export interface SeatView {
  name: string;
  stack: number;
  bet: number;
  isButton: boolean;
  isToAct: boolean;
  cards: (Card | 'back')[];
  lastAction: LogEntry | null;
  closingAction: LogEntry | null;
}

export interface RaiseControl {
  kind: 'bet' | 'raise';
  min: number;
  max: number;
  presets: { halfPot: number; pot: number; allIn: number };
}

export interface TalkView {
  available: boolean;
  on: boolean;
  level: Level;
  lines: ChatLine[];
  herBubble: ChatLine | null;
  playerBubble: ChatLine | null;
}

export interface ViewModel {
  seats: [SeatView, SeatView];
  board: Card[];
  pot: { collected: number; total: number };
  controls: {
    fold: boolean;
    passive: { kind: 'check' | 'call'; amount: number };
    raise: RaiseControl | null;
    enabled: boolean;
  };
  mode: 'cash' | 'tournament';
  session: { hands: number; netBb: number; bbPer100: number | null };
  blinds: { small: number; big: number };
  handNumber: number;
  result: { winner: SeatIndex | null; category: HandCategory | null; amount: number } | null;
  tournamentWinner: SeatIndex | null;
  talk: TalkView;
}

function roundTenth(value: number): number {
  return Math.round(value * 10) / 10;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(Math.round(value), min), max);
}

function seatView(state: SessionState, seat: SeatIndex, humanSeat: SeatIndex): SeatView {
  const { table, result } = state;
  const { hand } = table;
  const hole = hand?.holeCards[seat];
  const revealed = seat === humanSeat || result?.showdown === true;
  const cards: (Card | 'back')[] =
    hole === undefined ? [] : revealed ? [hole[0], hole[1]] : ['back', 'back'];
  return {
    name: table.seats[seat].name,
    stack: table.seats[seat].stack,
    bet: hand?.bets[seat] ?? 0,
    isButton: hand !== null && table.button === seat,
    isToAct: hand?.toAct === seat,
    cards,
    lastAction: state.lastActions[seat],
    closingAction: state.closingActions[seat],
  };
}

function raiseControl(
  hand: Hand,
  raise: LegalActions['raise'],
  call: number | null,
): RaiseControl | null {
  if (raise === null) {
    return null;
  }
  const { min, max } = raise;
  const currentBet = Math.max(hand.bets[0], hand.bets[1]);
  const potAfterCall = hand.pot + (call ?? 0);
  return {
    kind: hand.bets[0] === 0 && hand.bets[1] === 0 ? 'bet' : 'raise',
    min,
    max,
    presets: {
      halfPot: clamp(currentBet + potAfterCall / 2, min, max),
      pot: clamp(currentBet + potAfterCall, min, max),
      allIn: max,
    },
  };
}

function potView(hand: Hand | null): ViewModel['pot'] {
  if (hand === null) {
    return { collected: 0, total: 0 };
  }
  return { collected: hand.pot - hand.bets[0] - hand.bets[1], total: hand.pot };
}

function resultView(result: SessionState['result']): ViewModel['result'] {
  if (result === null) {
    return null;
  }
  return { winner: result.winner, category: result.category, amount: result.amount };
}

function sessionView(session: SessionState['session'], bigBlind: number): ViewModel['session'] {
  const { hands, net } = session;
  const netBb = net / bigBlind;
  return {
    hands,
    netBb: roundTenth(netBb),
    bbPer100: hands === 0 ? null : roundTenth((netBb / hands) * 100),
  };
}

function talkView(talk: SessionState['talk'], humanSeat: SeatIndex): TalkView {
  const { available, on, level, lines, bubbles } = talk;
  const botSeat = humanSeat === 0 ? 1 : 0;
  return {
    available,
    on,
    level,
    lines,
    herBubble: bubbles[botSeat],
    playerBubble: bubbles[humanSeat],
  };
}

export function toViewModel(state: SessionState, humanSeat: SeatIndex): ViewModel {
  const { table, phase } = state;
  const { hand } = table;
  const enabled = phase === 'humanToAct' && toAct(table) === humanSeat;
  const legal = legalActionsOf(table);
  const call = enabled ? legal.call : null;
  const raise = enabled && hand !== null ? raiseControl(hand, legal.raise, call) : null;
  const blinds = rulesOf(table.mode).blinds(Math.max(table.handNumber, 1));
  return {
    seats: [seatView(state, 0, humanSeat), seatView(state, 1, humanSeat)],
    board: hand === null ? [] : [...hand.board],
    pot: potView(hand),
    controls: {
      fold: enabled && legal.fold,
      passive: call === null ? { kind: 'check', amount: 0 } : { kind: 'call', amount: call },
      raise,
      enabled,
    },
    mode: table.mode.kind,
    session: sessionView(state.session, blinds.big),
    blinds,
    handNumber: table.handNumber,
    result: resultView(state.result),
    tournamentWinner: table.winner,
    talk: talkView(state.talk, humanSeat),
  };
}
