import type { BettingStreet, DealtStreet, EngineEvent, SeatIndex } from '../../engine/index.ts';
import type { HandCategory } from '../../equity/index.ts';
import { formatCard } from '../cards.ts';
import type { HandRecord } from './record.ts';

const CATEGORY_TEXT: Record<HandCategory, string> = {
  'high-card': 'high card',
  pair: 'a pair',
  'two-pair': 'two pair',
  trips: 'three of a kind',
  straight: 'a straight',
  flush: 'a flush',
  'full-house': 'a full house',
  quads: 'four of a kind',
  'straight-flush': 'a straight flush',
};

const STREET_TITLE: Record<DealtStreet, string> = { flop: 'Flop', turn: 'Turn', river: 'River' };

type Pair = [number, number];

function other(seat: SeatIndex): SeatIndex {
  return seat === 0 ? 1 : 0;
}

function cardsText(cards: readonly number[]): string {
  return cards.map(formatCard).join(' ');
}

function dateText(playedAt: string): string {
  return `${playedAt.slice(0, 10).replaceAll('-', '/')} ${playedAt.slice(11, 19)} UTC`;
}

function handNumberText(record: HandRecord): string {
  return String(Date.parse(record.playedAt) * 1000 + (record.handNumber % 1000));
}

function allInSuffix(allIn: boolean): string {
  return allIn ? ' and is all-in' : '';
}

type Started = Extract<EngineEvent, { type: 'handStarted' }>;

interface Writer {
  record: HandRecord;
  button: SeatIndex;
  stacks: Pair;
  lines: string[];
  bets: Pair;
  awards: Pair;
  foldedOn: (BettingStreet | undefined)[];
  showdownHands: { cards: string; category: HandCategory }[];
  street: BettingStreet;
  lastActedIndex: number;
  returnedFlushed: boolean;
}

function header(record: HandRecord, started: Started): string[] {
  const { names } = record;
  const { button, smallBlind, bigBlind, stacks } = started;
  return [
    `PokerStars Hand #${handNumberText(record)}: Hold'em No Limit (${smallBlind}/${bigBlind}) - ${dateText(record.playedAt)}`,
    `Table 'Mallorca' 2-max Seat #${button + 1} is the button`,
    `Seat 1: ${names[0]} (${stacks[0]} in chips)`,
    `Seat 2: ${names[1]} (${stacks[1]} in chips)`,
  ];
}

function lastActed(events: EngineEvent[]): number {
  let last = -1;
  events.forEach((event, index) => {
    if (event.type === 'acted') {
      last = index;
    }
  });
  return last;
}

function flushReturned(w: Writer): void {
  if (w.returnedFlushed) {
    return;
  }
  w.returnedFlushed = true;
  for (const event of w.record.events) {
    if (event.type === 'betReturned') {
      w.lines.push(`Uncalled bet (${event.amount}) returned to ${w.record.names[event.seat]}`);
    }
  }
}

function onBlind(w: Writer, event: Extract<EngineEvent, { type: 'blindPosted' }>): void {
  const { names, holeCards, humanSeat } = w.record;
  w.bets[event.seat] = event.amount;
  const kind = event.seat === w.button ? 'small' : 'big';
  const allIn = event.amount >= w.stacks[event.seat];
  w.lines.push(`${names[event.seat]}: posts ${kind} blind ${event.amount}${allInSuffix(allIn)}`);
  if (event.seat !== w.button) {
    const hero = humanSeat ?? 0;
    w.lines.push('*** HOLE CARDS ***', `Dealt to ${names[hero]} [${holeCards[hero].join(' ')}]`);
  }
}

function actionText(w: Writer, event: Extract<EngineEvent, { type: 'acted' }>): string {
  const { action } = event;
  switch (action.kind) {
    case 'fold':
      w.foldedOn[event.seat] = w.street;
      return 'folds';
    case 'check':
      return 'checks';
    case 'call':
      w.bets[event.seat] += event.amount;
      return `calls ${event.amount}${allInSuffix(event.allIn)}`;
    case 'raise': {
      const largest = Math.max(w.bets[0], w.bets[1]);
      const verb =
        largest > 0 ? `raises ${action.to - largest} to ${action.to}` : `bets ${action.to}`;
      w.bets[event.seat] = action.to;
      return `${verb}${allInSuffix(event.allIn)}`;
    }
  }
}

function onStreet(
  w: Writer,
  event: Extract<EngineEvent, { type: 'streetDealt' }>,
  index: number,
): void {
  if (index > w.lastActedIndex) {
    flushReturned(w);
  }
  w.street = event.street;
  w.bets[0] = 0;
  w.bets[1] = 0;
  const dealt = cardsText(event.cards);
  const before = event.board.slice(0, event.board.length - event.cards.length);
  w.lines.push(
    event.street === 'flop'
      ? `*** FLOP *** [${dealt}]`
      : `*** ${event.street.toUpperCase()} *** [${cardsText(before)}] [${dealt}]`,
  );
}

function onShowdown(w: Writer, event: Extract<EngineEvent, { type: 'showdown' }>): void {
  flushReturned(w);
  w.lines.push('*** SHOW DOWN ***');
  for (const seat of [other(w.button), w.button]) {
    const hand = event.hands[seat];
    const cards = hand.cards.map(formatCard).join(' ');
    w.showdownHands[seat] = { cards: `[${cards}]`, category: hand.category };
    w.lines.push(`${w.record.names[seat]}: shows [${cards}] (${CATEGORY_TEXT[hand.category]})`);
  }
}

function onEvent(w: Writer, event: EngineEvent, index: number): void {
  switch (event.type) {
    case 'blindPosted':
      onBlind(w, event);
      break;
    case 'acted':
      w.lines.push(`${w.record.names[event.seat]}: ${actionText(w, event)}`);
      break;
    case 'streetDealt':
      onStreet(w, event, index);
      break;
    case 'showdown':
      onShowdown(w, event);
      break;
    case 'potAwarded':
      flushReturned(w);
      w.awards[event.seat] += event.amount;
      w.lines.push(`${w.record.names[event.seat]} collected ${event.amount} from pot`);
      break;
    default:
      break;
  }
}

function seatResult(w: Writer, seat: SeatIndex): string {
  const shown = w.showdownHands[seat];
  const folded = w.foldedOn[seat];
  if (shown !== undefined) {
    return w.awards[seat] > 0
      ? ` showed ${shown.cards} and won (${w.awards[seat]}) with ${CATEGORY_TEXT[shown.category]}`
      : ` showed ${shown.cards} and lost with ${CATEGORY_TEXT[shown.category]}`;
  }
  if (folded !== undefined) {
    return folded === 'preflop' ? ' folded before Flop' : ` folded on the ${STREET_TITLE[folded]}`;
  }
  return ` collected (${w.awards[seat]})`;
}

function summary(w: Writer): string[] {
  const lines = ['*** SUMMARY ***', `Total pot ${w.awards[0] + w.awards[1]} | Rake 0`];
  if (w.record.board.length > 0) {
    lines.push(`Board [${w.record.board.join(' ')}]`);
  }
  for (const seat of [0, 1] as const) {
    const position = seat === w.button ? ' (button) (small blind)' : ' (big blind)';
    lines.push(`Seat ${seat + 1}: ${w.record.names[seat]}${position}${seatResult(w, seat)}`);
  }
  return lines;
}

function formatHand(record: HandRecord): string {
  const { events } = record;
  const started = events.find((event) => event.type === 'handStarted');
  if (started === undefined) {
    return '';
  }
  const w: Writer = {
    record,
    button: started.button,
    stacks: started.stacks,
    lines: header(record, started),
    bets: [0, 0],
    awards: [0, 0],
    foldedOn: [undefined, undefined],
    showdownHands: [],
    street: 'preflop',
    lastActedIndex: lastActed(events),
    returnedFlushed: false,
  };
  events.forEach((event, index) => onEvent(w, event, index));
  return [...w.lines, ...summary(w)].join('\n');
}

export function toPokerStars(records: HandRecord[]): string {
  return records.map(formatHand).join('\n\n\n');
}
