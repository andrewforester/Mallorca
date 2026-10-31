import type { Card } from '../../../src/cards/index.ts';
import { fullDeck, parseCard } from '../../../src/cards/index.ts';
import type { EngineEvent, Seat, Step, Street } from '../../../src/engine/index.ts';
import { applyAction, IllegalActionError, startHandWith } from '../../../src/engine/index.ts';
import type { SlumbotAction } from './slumbot/actions.ts';
import { toEngineAction } from './slumbot/actions.ts';

export const STACK = 20000;
export const BLINDS = { small: 50, big: 100 };

const STREETS: Street[] = ['preflop', 'flop', 'turn', 'river'];

export interface MirrorInput {
  clientIsBigBlind: boolean;
  holeCards: [string, string];
  board: string[];
  opponentCards: [string, string] | null;
  actions: SlumbotAction[][];
  handNumber: number;
}

export class MirrorError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MirrorError';
  }
}

function deckOf(input: MirrorInput): Card[] {
  const client = input.holeCards.map(parseCard);
  const opponent = input.opponentCards?.map(parseCard) ?? [null, null];
  const [bigBlind, button] = input.clientIsBigBlind ? [client, opponent] : [opponent, client];
  const slots: (Card | null)[] = [
    bigBlind[0] ?? null,
    button[0] ?? null,
    bigBlind[1] ?? null,
    button[1] ?? null,
    ...input.board.map(parseCard),
  ];
  while (slots.length < 9) slots.push(null);
  const used = new Set(slots.filter((card): card is Card => card !== null));
  const spare = fullDeck().filter((card) => !used.has(card));
  const head = slots.map((card) => card ?? (spare.shift() as Card));
  return [...head, ...spare];
}

function apply(step: Step, action: SlumbotAction, street: number): Step {
  if (step.hand.street !== STREETS[street] || step.hand.toAct === null) {
    throw new MirrorError(
      `Action on ${STREETS[street]} while the engine is on ${step.hand.street}`,
    );
  }
  try {
    return applyAction(step.hand, step.seats, toEngineAction(action));
  } catch (error) {
    if (error instanceof IllegalActionError) throw new MirrorError(error.message);
    throw error;
  }
}

function checkEnd(step: Step, input: MirrorInput): void {
  const last = STREETS[input.actions.length - 1];
  if (step.hand.street !== 'complete' && step.hand.street !== last) {
    throw new MirrorError(`The string ends on ${last}, the engine is on ${step.hand.street}`);
  }
  if (step.hand.board.length > input.board.length) {
    throw new MirrorError('The engine dealt cards that Slumbot has not shown');
  }
}

export function mirrorHand(input: MirrorInput): { step: Step; events: EngineEvent[] } {
  const seats: [Seat, Seat] = [
    { name: 'client', stack: STACK },
    { name: 'slumbot', stack: STACK },
  ];
  let step = startHandWith(
    seats,
    { button: input.clientIsBigBlind ? 1 : 0, blinds: BLINDS, handNumber: input.handNumber },
    deckOf(input),
  );
  const events = [...step.events];
  input.actions.forEach((street, index) => {
    for (const action of street) {
      step = apply(step, action, index);
      events.push(...step.events);
    }
  });
  checkEnd(step, input);
  return { step, events };
}
