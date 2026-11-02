import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { BotBias } from '../brains/index.ts';
import { CASH } from '../engine/index.ts';
import type { LegalActions } from '../engine/index.ts';
import type {
  ConversationClient,
  LinePayload,
  ReplyPayload,
  SummaryPayload,
} from './conversationClient.ts';
import { createSession } from './session.ts';
import { scriptedBot } from './testBot.ts';

interface Sent {
  lines: LinePayload[];
  replies: ReplyPayload[];
  summaries: SummaryPayload[];
  biases: (BotBias | undefined)[];
}

const HANDS = 40;
const DIGITS = 9;

const rounded = (bias: BotBias): BotBias => ({
  aggression: Number(bias.aggression.toFixed(DIGITS)),
  bluff: Number(bias.bluff.toFixed(DIGITS)),
  tightness: Number(bias.tightness.toFixed(DIGITS)),
  sizing: Number(bias.sizing.toFixed(DIGITS)),
  stickiness: Number(bias.stickiness.toFixed(DIGITS)),
});

function capture(sent: Sent): ConversationClient {
  return {
    enabled: true,
    line: (request) => {
      sent.lines.push(request);
      return Promise.resolve('Here we go');
    },
    reply: (request) => {
      sent.replies.push(request);
      return Promise.resolve({ text: 'Sure', signals: ['tease'] });
    },
    summary: (request) => {
      sent.summaries.push(request);
      return Promise.resolve();
    },
  };
}

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe('the bodies a seeded session sends', () => {
  it('stay the same for the same game', async () => {
    const sent: Sent = { lines: [], replies: [], summaries: [], biases: [] };
    let clock = 0;
    let turn = 0;
    const inner = scriptedBot((legal: LegalActions) => {
      turn += 1;
      if (legal.raise !== null && turn % 3 === 0) return { kind: 'raise', to: legal.raise.min };
      return legal.check ? { kind: 'check' } : { kind: 'call' };
    });
    const bot = {
      ...inner,
      select: (opponent: 'math' | 'cfr' | 'cfr-v2') => Promise.resolve(opponent),
      decide: (legal: LegalActions, bias?: BotBias) => {
        sent.biases.push(bias === undefined ? undefined : rounded(bias));
        return inner.decide(legal);
      },
    };
    const session = createSession({
      bot,
      seed: 11,
      botDelayMs: 0,
      humanSeat: 1,
      names: ['Mallorca', 'You'],
      mode: CASH,
      conversation: capture(sent),
      now: () => clock,
    });
    await session.getState().start(CASH, 'cfr');
    for (let hand = 1; hand <= HANDS; hand += 1) {
      for (let step = 0; step < 12 && session.getState().phase === 'humanToAct'; step += 1) {
        clock += 700;
        const kind = (hand + step) % 4 === 0 ? 'raise' : 'passive';
        const legal = session.getState().table.hand;
        const to = (legal?.pot ?? 0) + 40;
        await session.getState().act(kind === 'raise' ? { kind, to } : { kind });
      }
      if (hand % 7 === 0) session.getState().say('Nice hand');
      if (hand % 11 === 0) session.getState().quick('bluffing', 'Bluffing?');
      await flush();
      clock += 5000;
      await session.getState().nextHand();
    }
    session.getState().dispose();
    await flush();
    const recorded: unknown = JSON.parse(
      readFileSync(new URL('./fixtures/sessionPayloads.json', import.meta.url), 'utf8'),
    );
    expect(JSON.parse(JSON.stringify(sent))).toEqual(recorded);
  }, 60_000);
});
