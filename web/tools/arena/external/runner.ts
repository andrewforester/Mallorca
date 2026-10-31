import { mulberry32 } from '../../../src/cards/index.ts';
import { legalActions } from '../../../src/engine/index.ts';
import { toObservations } from '../../../src/brains/index.ts';
import type { HandRecord } from '../../../src/game/records/index.ts';
import { handRecord } from '../../../src/game/records/record.ts';
import type { BotFactory } from '../bots.ts';
import type { ExternalLine } from './log.ts';
import { appendLine, openLog } from './log.ts';
import { MirrorError, mirrorHand, STACK } from './mirror.ts';
import { parseActions, toIncr } from './slumbot/actions.ts';
import type { SlumbotClient, SlumbotState } from './slumbot/client.ts';
import { AbandonedHand } from './slumbot/client.ts';

export class WinningsMismatch extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WinningsMismatch';
  }
}

export interface RunOptions {
  client: SlumbotClient;
  bot: BotFactory;
  botVersion: string;
  hands: number;
  seed: number;
  out: string;
  delayMs: number;
  sessionId: string;
  sleep?: (ms: number) => Promise<void>;
}

interface HandContext {
  options: RunOptions;
  handIndex: number;
}

const MAX_ABANDONED_IN_A_ROW = 10;

function mirrorOf(state: SlumbotState, handIndex: number, withOpponent: boolean) {
  return mirrorHand({
    clientIsBigBlind: state.client_pos === 0,
    holeCards: state.hole_cards,
    board: state.board,
    opponentCards: withOpponent ? (state.bot_hole_cards ?? null) : null,
    actions: parseActions(state.action),
    handNumber: handIndex + 1,
  });
}

function decide(context: HandContext, state: SlumbotState, decision: number): string {
  const { step, events } = mirrorOf(state, context.handIndex, false);
  if (step.hand.toAct !== 0) {
    throw new MirrorError(`Slumbot waits for us at "${state.action}", the engine does not`);
  }
  const seed = (Math.imul(context.options.seed, 0x9e3779b1) + context.handIndex * 64 + decision) >>> 0;
  const bot = context.options.bot(mulberry32(seed));
  try {
    for (const observation of toObservations(events, 0)) bot.observe(observation);
    return toIncr(bot.decide(legalActions(step.hand, step.seats)));
  } finally {
    bot.dispose?.();
  }
}

function lineOf(context: HandContext, state: SlumbotState, record: HandRecord | null): ExternalLine {
  return {
    record,
    external: {
      opponent: 'slumbot',
      clientPos: state.client_pos,
      action: state.action,
      holeCards: state.hole_cards,
      board: state.board,
      opponentCards: state.bot_hole_cards ?? null,
      winnings: state.winnings ?? null,
      baselineWinnings: state.baseline_winnings ?? null,
      seed: context.options.seed,
      handIndex: context.handIndex,
      abandoned: record === null,
      error: null,
    },
  };
}

function finish(context: HandContext, state: SlumbotState): ExternalLine {
  const { step, events } = mirrorOf(state, context.handIndex, true);
  const net = step.seats[0].stack - STACK;
  if (step.hand.street !== 'complete' || net !== state.winnings) {
    const line = lineOf(context, state, null);
    line.external.error = `winnings ${state.winnings} but the mirror nets ${net} on ${step.hand.street}`;
    appendLine(context.options.out, line);
    throw new WinningsMismatch(line.external.error);
  }
  const record = handRecord(events, [], {
    sessionId: context.options.sessionId,
    mode: { kind: 'cash', bigBlind: 100, buyIn: STACK },
    names: ['cfr', 'slumbot'],
    humanSeat: null,
    bot: { id: 'cfr-vs-slumbot', version: context.options.botVersion },
    playedAt: new Date().toISOString(),
  });
  return lineOf(context, state, record);
}

async function playHand(context: HandContext): Promise<ExternalLine> {
  let state = await context.options.client.newHand();
  try {
    for (let decision = 0; state.winnings === undefined; decision += 1) {
      state = await context.options.client.act(decide(context, state, decision));
    }
  } catch (error) {
    if (!(error instanceof AbandonedHand) && !(error instanceof MirrorError)) throw error;
    const line = lineOf(context, state, null);
    line.external.error = error.message;
    if (error instanceof MirrorError) {
      appendLine(context.options.out, line);
      throw error;
    }
    return line;
  }
  return finish(context, state);
}

export async function runExternal(
  options: RunOptions,
): Promise<{ played: number; abandoned: number }> {
  const sleep = options.sleep ?? ((ms) => new Promise<void>((done) => setTimeout(done, ms)));
  const start = openLog(options.out).length;
  let played = 0;
  let abandoned = 0;
  let inARow = 0;
  for (let handIndex = start; handIndex < start + options.hands; handIndex += 1) {
    const line = await playHand({ options, handIndex });
    appendLine(options.out, line);
    if (line.external.abandoned) {
      abandoned += 1;
      inARow += 1;
      if (inARow >= MAX_ABANDONED_IN_A_ROW) throw new Error('Slumbot failed ten hands in a row');
    } else {
      played += 1;
      inARow = 0;
    }
    if (options.delayMs > 0) await sleep(options.delayMs);
  }
  return { played, abandoned };
}
