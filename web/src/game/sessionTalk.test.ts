import { describe, expect, it, vi } from 'vitest';
import type { BotStyle } from '../brains/index.ts';
import { CASH, TOURNAMENT } from '../engine/index.ts';
import type { LegalActions } from '../engine/index.ts';
import type { Level } from '../talk/index.ts';
import { memoryStore } from './records/store.ts';
import type { RecordsOptions } from './records/recorder.ts';
import { createSession } from './session.ts';
import type { Session } from './session.ts';
import type {
  LinePayload,
  ReplyPayload,
  SummaryPayload,
  TalkClient,
  TalkReply,
} from './talkClient.ts';
import { silentTalkClient } from './talkClient.ts';
import { callingBot, scriptedBot, shovingBot } from './testBot.ts';
import type { ScriptedBot } from './testBot.ts';
import { toViewModel } from './viewModel.ts';

interface FakeClient extends TalkClient {
  lines: LinePayload[];
  replies: ReplyPayload[];
  summaries: SummaryPayload[];
  kept: boolean[];
}

interface Answers {
  line?: (request: LinePayload) => Promise<string | null>;
  reply?: (request: ReplyPayload) => Promise<TalkReply | null>;
  summary?: (request: SummaryPayload) => Promise<void>;
}

function fakeClient(answers: Answers = {}): FakeClient {
  const client: FakeClient = {
    enabled: true,
    lines: [],
    replies: [],
    summaries: [],
    kept: [],
    line: (request) => {
      client.lines.push(request);
      return answers.line?.(request) ?? Promise.resolve('Here we go');
    },
    reply: (request) => {
      client.replies.push(request);
      return answers.reply?.(request) ?? Promise.resolve({ text: 'Sure', signals: ['tease'] });
    },
    summary: (request, options) => {
      client.summaries.push(request);
      client.kept.push(options?.keepalive === true);
      return answers.summary?.(request) ?? Promise.resolve();
    },
  };
  return client;
}

interface StyledBot extends ScriptedBot {
  styles: (BotStyle | undefined)[];
}

function cfrBot(inner: ScriptedBot): StyledBot {
  const bot: StyledBot = {
    ...inner,
    styles: [],
    select: (opponent) => Promise.resolve(opponent),
    decide: (legal: LegalActions, style?: BotStyle) => {
      bot.styles.push(style);
      return inner.decide(legal);
    },
  };
  return bot;
}

interface Table {
  session: Session;
  bot: StyledBot;
  tick(ms?: number): void;
}

interface Extra {
  mode?: typeof CASH | typeof TOURNAMENT;
  talkOn?: boolean;
  tells?: Level;
  records?: RecordsOptions;
  connectTalk?: () => Promise<TalkClient>;
}

function open(client: TalkClient, extra: Extra = {}, base = shovingBot()): Table {
  let clock = 0;
  const bot = cfrBot(base);
  const session = createSession({
    bot,
    seed: 7,
    botDelayMs: 0,
    humanSeat: 1,
    names: ['Mallorca', 'You'],
    mode: CASH,
    talk: client,
    now: () => clock,
    ...extra,
  });
  return {
    session,
    bot,
    tick: (ms = 10_000) => {
      clock += ms;
    },
  };
}

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

async function foldHand(table: Table): Promise<void> {
  await table.session.getState().act({ kind: 'fold' });
  table.tick();
  await table.session.getState().nextHand();
}

async function untilHerBet(table: Table, client: FakeClient): Promise<void> {
  const asked = () => client.lines.some((p) => p.intent.situation === 'herBet');
  for (let i = 0; i < 40 && !asked(); i += 1) {
    await foldHand(table);
  }
  expect(asked()).toBe(true);
}

function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

type Pending = { situation: string; answer: ReturnType<typeof deferred<string | null>> };

const HAND_END = ['handWon', 'handLost', 'bluffCaught'];

function pendingLines(pending: Pending[]): Answers['line'] {
  return (request) => {
    const answer = deferred<string | null>();
    pending.push({ situation: request.intent.situation, answer });
    return answer.promise;
  };
}

async function nextHandWithEndLine(table: Table, pending: Pending[]): Promise<Pending> {
  for (let i = 0; i < 80; i += 1) {
    await table.session.getState().act({ kind: 'fold' });
    const end = pending.find((p) => HAND_END.includes(p.situation));
    pending.splice(0, pending.length);
    table.tick();
    await table.session.getState().nextHand();
    if (end !== undefined && table.session.getState().lastActions[0] === null) {
      return end;
    }
  }
  throw new Error('no hand-end line before a hand the player opens');
}

describe('session talk', () => {
  it('requests a line on her bet', async () => {
    const client = fakeClient({ line: () => new Promise(() => undefined) });
    const table = open(client);
    await table.session.getState().start(CASH, 'cfr');
    expect(table.session.getState().talk.available).toBe(true);
    await untilHerBet(table, client);
    expect(table.session.getState().phase).toBe('humanToAct');
    const request = client.lines.find((p) => p.intent.situation === 'herBet');
    expect(request?.kind).toBe('line');
    expect(request?.locale).toBe('en');
    expect(request?.facts.her).toHaveLength(2);
  });

  it('shows a line that arrives on its street', async () => {
    const client = fakeClient({ line: () => Promise.resolve('Your move') });
    const table = open(client);
    await table.session.getState().start(CASH, 'cfr');
    await untilHerBet(table, client);
    await flush();
    const { talk, table: state } = table.session.getState();
    const last = talk.lines[talk.lines.length - 1];
    expect(last).toMatchObject({ speaker: 'mallorca', text: 'Your move' });
    expect(last?.handNumber).toBe(state.handNumber);
    expect(talk.bubbles[0]).toEqual(last);
    expect(talk.bubbles[1]).toBeNull();
    const vm = toViewModel(table.session.getState(), 1);
    expect(vm.talk.herBubble).toEqual(last);
    expect(vm.talk.playerBubble).toBeNull();
  });

  it('drops a stale line', async () => {
    const pending: { situation: string; answer: ReturnType<typeof deferred<string | null>> }[] = [];
    const client = fakeClient({
      line: (request) => {
        const answer = deferred<string | null>();
        pending.push({ situation: request.intent.situation, answer });
        return answer.promise;
      },
    });
    const table = open(client);
    await table.session.getState().start(CASH, 'cfr');
    await untilHerBet(table, client);
    const bet = pending.find((p) => p.situation === 'herBet');
    await table.session.getState().act({ kind: 'fold' });
    bet?.answer.resolve('Too late');
    await flush();
    expect(table.session.getState().talk.lines.map((l) => l.text)).not.toContain('Too late');
    expect(table.session.getState().talk.bubbles[0]).toBeNull();
  });

  it('keeps a hand-end line until the first action of the next hand', async () => {
    const pending: Pending[] = [];
    const table = open(fakeClient({ line: pendingLines(pending) }));
    await table.session.getState().start(CASH, 'cfr');
    const end = await nextHandWithEndLine(table, pending);
    end.answer.resolve('Well played');
    await flush();
    expect(table.session.getState().talk.lines.at(-1)).toMatchObject({
      speaker: 'mallorca',
      text: 'Well played',
    });
  });

  it('drops a hand-end line once the next hand has an action', async () => {
    const pending: Pending[] = [];
    const table = open(fakeClient({ line: pendingLines(pending) }));
    await table.session.getState().start(CASH, 'cfr');
    const end = await nextHandWithEndLine(table, pending);
    await table.session.getState().act({ kind: 'passive' });
    end.answer.resolve('Too late now');
    await flush();
    expect(table.session.getState().talk.lines.map((l) => l.text)).not.toContain('Too late now');
  });

  it('signs in only when the Solver opponent starts with talk on, and once', async () => {
    const client = fakeClient();
    const connectTalk = vi.fn(() => Promise.resolve<TalkClient>(client));
    const table = open(silentTalkClient, { connectTalk });
    await table.session.getState().start(CASH);
    expect(connectTalk).not.toHaveBeenCalled();
    expect(table.session.getState().talk.available).toBe(false);
    await table.session.getState().start(CASH, 'cfr');
    expect(connectTalk).toHaveBeenCalledTimes(1);
    await flush();
    expect(table.session.getState().talk.available).toBe(true);
    table.session.getState().say('Hello');
    expect(client.replies).toHaveLength(1);
    await table.session.getState().start();
    expect(connectTalk).toHaveBeenCalledTimes(1);
  });

  it('with talk off, signs in only when talk is switched on', async () => {
    const client = fakeClient();
    const connectTalk = vi.fn(() => Promise.resolve<TalkClient>(client));
    const table = open(silentTalkClient, { connectTalk, talkOn: false });
    await table.session.getState().start(CASH, 'cfr');
    expect(connectTalk).not.toHaveBeenCalled();
    expect(table.session.getState().talk).toMatchObject({ available: true, on: false });
    table.session.getState().setTalk(true);
    expect(connectTalk).toHaveBeenCalledTimes(1);
    await flush();
    table.session.getState().say('Hello');
    expect(client.replies).toHaveLength(1);
  });

  it('a failed sign-in hides the talk', async () => {
    const connectTalk = vi.fn(() => Promise.resolve(silentTalkClient));
    const table = open(silentTalkClient, { connectTalk });
    await table.session.getState().start(CASH, 'cfr');
    await flush();
    expect(table.session.getState().talk.available).toBe(false);
    expect(table.bot.styles.every((style) => style !== undefined)).toBe(true);
  });

  it('drops a line after the session restarts', async () => {
    const answer = deferred<string | null>();
    const client = fakeClient({ line: () => answer.promise });
    const table = open(client);
    await table.session.getState().start(CASH, 'cfr');
    await untilHerBet(table, client);
    await table.session.getState().start();
    answer.resolve('From before');
    await flush();
    expect(table.session.getState().talk.lines).toEqual([]);
  });

  it('say sends a reply and applies signals', async () => {
    const client = fakeClient({
      reply: () => Promise.resolve({ text: 'Thank you', signals: ['compliment'] }),
    });
    const table = open(client);
    await table.session.getState().start(CASH, 'cfr');
    const before = table.session.getState().talk.lines.map(({ speaker, text }) => ({
      speaker,
      text,
    }));
    table.session.getState().say('  Well played  ');
    const said = table.session.getState().talk;
    expect(said.lines[said.lines.length - 1]).toMatchObject({
      speaker: 'player',
      text: 'Well played',
      handNumber: 1,
    });
    expect(said.bubbles[1]?.text).toBe('Well played');
    expect(client.replies).toHaveLength(1);
    expect(client.replies[0]?.text).toBe('Well played');
    expect(client.replies[0]?.recent).toEqual(before);
    await flush();
    const answered = table.session.getState().talk;
    expect(answered.lines[answered.lines.length - 1]).toMatchObject({
      speaker: 'mallorca',
      text: 'Thank you',
    });
    expect(answered.bubbles[0]?.text).toBe('Thank you');
    const ids = answered.lines.map((l) => l.id);
    expect([...ids].sort((a, b) => a - b)).toEqual(ids);
    expect(new Set(ids).size).toBe(ids.length);
    await table.session.getState().act({ kind: 'fold' });
    table.session.getState().leave();
    expect(client.summaries).toHaveLength(1);
    expect(client.summaries[0]?.summary.signals).toEqual({ compliment: 1 });
  });

  it('say ignores blank text and caps length', async () => {
    const client = fakeClient();
    const table = open(client);
    await table.session.getState().start(CASH, 'cfr');
    const count = table.session.getState().talk.lines.length;
    table.session.getState().say('   ');
    table.session.getState().say('');
    expect(client.replies).toHaveLength(0);
    expect(table.session.getState().talk.lines).toHaveLength(count);
    table.session.getState().say(`  ${'a'.repeat(300)}  `);
    const { lines } = table.session.getState().talk;
    expect(lines[lines.length - 1]?.text).toBe('a'.repeat(200));
    expect(client.replies[0]?.text).toBe('a'.repeat(200));
  });

  it('marks a player line that got no answer', async () => {
    const client = fakeClient({ reply: () => Promise.resolve(null) });
    const table = open(client);
    await table.session.getState().start(CASH, 'cfr');
    table.session.getState().say('Hello');
    await flush();
    const { lines } = table.session.getState().talk;
    expect(lines[lines.length - 1]).toMatchObject({
      speaker: 'player',
      text: 'Hello',
      undelivered: true,
    });
  });

  it('quick phrases carry their signals and ignore the reply signals', async () => {
    const client = fakeClient({
      reply: () => Promise.resolve({ text: 'Maybe', signals: ['friendly'] }),
    });
    const table = open(client);
    await table.session.getState().start(CASH, 'cfr');
    table.session.getState().quick('bluffing', "You're bluffing");
    expect(table.session.getState().talk.lines.at(-1)).toMatchObject({
      speaker: 'player',
      text: "You're bluffing",
    });
    expect(client.replies).toHaveLength(1);
    await flush();
    expect(table.session.getState().talk.lines.at(-1)).toMatchObject({
      speaker: 'mallorca',
      text: 'Maybe',
    });
    table.session.getState().quick('niceHand', 'Nice hand');
    table.session.getState().quick('notThisTime', 'Not this time');
    expect(table.session.getState().talk.lines.at(-1)?.text).toBe('Not this time');
    await flush();
    await table.session.getState().act({ kind: 'fold' });
    table.session.getState().leave();
    expect(client.summaries[0]?.summary.signals).toEqual({
      mockBluff: 1,
      compliment: 1,
      claimStrength: 1,
    });
  });

  it('calling a bluff without her bet is a tease', async () => {
    const client = fakeClient();
    const table = open(client, {}, callingBot());
    await table.session.getState().start(CASH, 'cfr');
    table.session.getState().quick('bluffing', "You're bluffing");
    await flush();
    while (table.session.getState().phase === 'humanToAct') {
      await table.session.getState().act({ kind: 'passive' });
    }
    table.session.getState().leave();
    expect(client.summaries[0]?.summary.signals).toEqual({ tease: 1 });
  });

  it('talk off sends nothing', async () => {
    const client = fakeClient();
    const table = open(client, { talkOn: false });
    await table.session.getState().start(CASH, 'cfr');
    expect(table.session.getState().talk).toMatchObject({ available: true, on: false });
    for (let i = 0; i < 10; i += 1) {
      await foldHand(table);
    }
    table.session.getState().say('Hello');
    table.session.getState().quick('niceHand', 'Nice hand');
    await table.session.getState().act({ kind: 'fold' });
    table.session.getState().leave();
    expect(client.lines).toEqual([]);
    expect(client.replies).toEqual([]);
    expect(client.summaries).toEqual([]);
    expect(table.session.getState().talk.lines).toEqual([]);
  });

  it('switches talk and tells', async () => {
    const client = fakeClient();
    const table = open(client, { tells: 'hidden' });
    await table.session.getState().start(CASH, 'cfr');
    expect(table.session.getState().talk).toMatchObject({ on: true, level: 'hidden' });
    table.session.getState().setTalk(false);
    table.session.getState().setTells('obvious');
    expect(table.session.getState().talk).toMatchObject({ on: false, level: 'obvious' });
    table.session.getState().say('Hello');
    expect(client.replies).toEqual([]);
    table.session.getState().setTalk(true);
    table.session.getState().say('Hello');
    expect(client.replies).toHaveLength(1);
    const vm = toViewModel(table.session.getState(), 1);
    expect(vm.talk).toMatchObject({ available: true, on: true, level: 'obvious' });
  });

  it('style reaches decide and the records', async () => {
    const client = fakeClient();
    const store = memoryStore();
    const table = open(client, {
      records: { store, sessionId: 's1', now: () => '2026-10-30T18:00:00.000Z' },
    });
    await table.session.getState().start(CASH, 'cfr');
    await foldHand(table);
    expect(table.bot.styles.length).toBeGreaterThan(0);
    for (const style of table.bot.styles) {
      expect(style).toEqual({
        aggression: expect.any(Number) as number,
        bluff: expect.any(Number) as number,
        tightness: expect.any(Number) as number,
        sizing: expect.any(Number) as number,
        stickiness: expect.any(Number) as number,
      });
    }
    const records = await store.list();
    expect(records[0]?.decisions[0]?.style).toEqual(table.bot.styles[0]);
  });

  it('talk off still passes the style', async () => {
    const table = open(fakeClient(), { talkOn: false });
    await table.session.getState().start(CASH, 'cfr');
    expect(table.session.getState().talk).toMatchObject({ available: true, on: false });
    expect(table.bot.styles[0]).toBeDefined();
  });

  it('without a client her feeling still sets the style', async () => {
    const table = open(silentTalkClient);
    await table.session.getState().start(CASH, 'cfr');
    await foldHand(table);
    expect(table.session.getState().talk.available).toBe(false);
    expect(table.bot.styles.length).toBeGreaterThan(0);
    expect(table.bot.styles.every((style) => style !== undefined)).toBe(true);
  });

  it('quick phrases are marked quick and typed words are not', async () => {
    const client = fakeClient();
    const table = open(client);
    await table.session.getState().start(CASH, 'cfr');
    table.session.getState().quick('niceHand', 'Nice hand');
    table.session.getState().say('Hello');
    expect(client.replies.map((reply) => reply.quick)).toEqual([true, false]);
  });

  it("sends her stack first and the player's net", async () => {
    const client = fakeClient();
    const table = open(client);
    await table.session.getState().start(CASH, 'cfr');
    table.session.getState().say('Hello');
    const { seats } = table.session.getState().table;
    expect(client.replies[0]?.facts.stacks).toEqual([seats[0].stack, seats[1].stack]);
    await table.session.getState().act({ kind: 'fold' });
    table.session.getState().leave();
    expect(client.summaries[0]?.summary.netBb).toBeLessThan(0);
  });

  it('sends what changed since the last summary', async () => {
    const client = fakeClient();
    const table = open(client);
    await table.session.getState().start(CASH, 'cfr');
    table.session.getState().quick('niceHand', 'Nice hand');
    for (let i = 0; i < 50; i += 1) {
      await foldHand(table);
    }
    expect(client.summaries).toHaveLength(1);
    expect(client.summaries[0]?.summary).toMatchObject({ hands: 50, signals: { compliment: 1 } });
    table.session.getState().quick('notThisTime', 'Not this time');
    await table.session.getState().act({ kind: 'fold' });
    table.session.getState().leave();
    expect(client.summaries).toHaveLength(2);
    const second = client.summaries[1]?.summary;
    expect(second).toMatchObject({ hands: 1, signals: { claimStrength: 1 } });
    expect(Math.abs(second?.netBb ?? 0)).toBeLessThan(
      Math.abs(client.summaries[0]?.summary.netBb ?? 0),
    );
  });

  it('sends the summary with keepalive when the page hides, once', async () => {
    const client = fakeClient();
    const table = open(client);
    await table.session.getState().start(CASH, 'cfr');
    await table.session.getState().act({ kind: 'fold' });
    table.session.getState().pageHidden();
    table.session.getState().pageHidden();
    table.session.getState().dispose();
    expect(client.summaries).toHaveLength(1);
    expect(client.kept).toEqual([true]);
    expect(client.summaries[0]?.summary.hands).toBe(1);
  });

  it('client errors keep the game going', async () => {
    const client = fakeClient({
      line: () => Promise.reject(new Error('down')),
      reply: () => {
        throw new Error('down');
      },
      summary: () => Promise.reject(new Error('down')),
    });
    const table = open(client);
    await table.session.getState().start(CASH, 'cfr');
    for (let i = 0; i < 10; i += 1) {
      await foldHand(table);
    }
    expect(client.lines.length).toBeGreaterThan(0);
    table.session.getState().say('Hello');
    await flush();
    expect(table.session.getState().talk.lines.at(-1)).toMatchObject({
      text: 'Hello',
      undelivered: true,
    });
    await table.session.getState().act({ kind: 'fold' });
    table.session.getState().leave();
    await flush();
    expect(table.session.getState().phase).toBe('sessionOver');
  });

  it('summary on leave and every 50 hands', async () => {
    const client = fakeClient();
    const table = open(client);
    await table.session.getState().start(CASH, 'cfr');
    for (let i = 0; i < 49; i += 1) {
      await foldHand(table);
    }
    expect(client.summaries).toHaveLength(0);
    await table.session.getState().act({ kind: 'fold' });
    expect(client.summaries).toHaveLength(1);
    expect(client.summaries[0]?.summary.hands).toBe(50);
    expect(client.summaries[0]?.kind).toBe('summary');
    table.session.getState().leave();
    expect(client.summaries).toHaveLength(1);
    table.tick();
    await table.session.getState().start();
    await table.session.getState().act({ kind: 'fold' });
    table.session.getState().leave();
    expect(client.summaries).toHaveLength(2);
    expect(client.summaries[1]?.summary.hands).toBe(1);
  });

  it('the v2 solver opponent talks too', async () => {
    const client = fakeClient({ line: () => new Promise(() => undefined) });
    const table = open(client);
    await table.session.getState().start(CASH, 'cfr-v2');
    expect(table.session.getState().talk.available).toBe(true);
    await untilHerBet(table, client);
    expect(client.lines.some((p) => p.intent.situation === 'herBet')).toBe(true);
  });

  it('math opponent has no talk', async () => {
    const client = fakeClient();
    const table = open(client);
    await table.session.getState().start(CASH);
    expect(table.session.getState().talk.available).toBe(false);
    for (let i = 0; i < 10; i += 1) {
      await foldHand(table);
    }
    table.session.getState().say('Hello');
    table.session.getState().quick('niceHand', 'Nice hand');
    expect(client.lines).toEqual([]);
    expect(client.replies).toEqual([]);
    expect(table.bot.styles.every((style) => style === undefined)).toBe(true);
  });

  it('attaches a client after the start', async () => {
    const table = open(silentTalkClient);
    await table.session.getState().start(CASH, 'cfr');
    expect(table.session.getState().talk.available).toBe(false);
    const client = fakeClient();
    table.session.getState().attachTalk(client);
    expect(table.session.getState().talk.available).toBe(true);
    table.session.getState().say('Hello');
    expect(client.replies).toHaveLength(1);
  });

  it('keeps the last 100 lines', async () => {
    const client = fakeClient({ reply: () => Promise.resolve(null) });
    const table = open(client);
    await table.session.getState().start(CASH, 'cfr');
    for (let i = 0; i < 130; i += 1) {
      table.session.getState().say(`line ${i}`);
    }
    const { lines } = table.session.getState().talk;
    expect(lines).toHaveLength(100);
    expect(lines.at(-1)?.text).toBe('line 129');
  });

  it('takes the quick phrase text from the caller', async () => {
    const client = fakeClient();
    const table = open(client);
    await table.session.getState().start(CASH, 'cfr');
    table.session.getState().quick('niceHand', '  Bien jugado  ');
    expect(table.session.getState().talk.lines.at(-1)).toMatchObject({
      speaker: 'player',
      text: 'Bien jugado',
    });
    expect(client.replies[0]?.text).toBe('Bien jugado');
  });

  it('remembers her raise for the whole hand', async () => {
    let decisions = 0;
    const raiseOnce = scriptedBot((legal) => {
      decisions += 1;
      if (decisions === 1 && legal.raise !== null) {
        return { kind: 'raise', to: legal.raise.min };
      }
      return legal.check ? { kind: 'check' } : { kind: 'call' };
    });
    const client = fakeClient();
    const table = open(client, {}, raiseOnce);
    await table.session.getState().start(CASH, 'cfr');
    await table.session.getState().act({ kind: 'passive' });
    await table.session.getState().act({ kind: 'passive' });
    expect(table.session.getState().table.hand?.street).toBe('turn');
    table.session.getState().quick('bluffing', "You're bluffing");
    await flush();
    while (table.session.getState().phase === 'humanToAct') {
      await table.session.getState().act({ kind: 'passive' });
    }
    table.session.getState().leave();
    expect(client.summaries[0]?.summary.signals).toEqual({ mockBluff: 1 });
  });

  it('sends a final summary on dispose', async () => {
    const client = fakeClient();
    const table = open(client);
    await table.session.getState().start(CASH, 'cfr');
    table.session.getState().dispose();
    expect(client.summaries).toHaveLength(0);
    const played = open(client);
    await played.session.getState().start(CASH, 'cfr');
    await played.session.getState().act({ kind: 'fold' });
    played.session.getState().dispose();
    expect(client.summaries).toHaveLength(1);
    expect(client.summaries[0]?.summary.hands).toBe(1);
  });

  it('sends the summary of the previous game when a new one starts', async () => {
    const client = fakeClient();
    const table = open(client);
    await table.session.getState().start(CASH, 'cfr');
    await table.session.getState().act({ kind: 'fold' });
    await table.session.getState().start();
    expect(client.summaries).toHaveLength(1);
    expect(client.summaries[0]?.summary.hands).toBe(1);
  });

  it('sends one summary for leave then dispose', async () => {
    const client = fakeClient();
    const table = open(client);
    await table.session.getState().start(CASH, 'cfr');
    await table.session.getState().act({ kind: 'fold' });
    table.session.getState().leave();
    table.session.getState().dispose();
    expect(client.summaries).toHaveLength(1);
  });

  it('sends one summary when the tournament ends', async () => {
    const client = fakeClient();
    const table = open(client, { mode: TOURNAMENT });
    await table.session.getState().start(TOURNAMENT, 'cfr');
    for (let i = 0; i < 100 && table.session.getState().phase === 'humanToAct'; i += 1) {
      await table.session.getState().act({ kind: 'passive' });
      if (table.session.getState().phase === 'handOver') {
        table.tick();
        await table.session.getState().nextHand();
      }
    }
    expect(table.session.getState().phase).toBe('tournamentOver');
    expect(client.summaries).toHaveLength(1);
    table.session.getState().dispose();
    expect(client.summaries).toHaveLength(1);
  });

  it('sends no final summary with talk off', async () => {
    const client = fakeClient();
    const table = open(client, { talkOn: false });
    await table.session.getState().start(CASH, 'cfr');
    await table.session.getState().act({ kind: 'fold' });
    table.session.getState().dispose();
    expect(client.summaries).toEqual([]);
  });

  it('drops a line that arrives after talk was switched off', async () => {
    const answer = deferred<string | null>();
    const client = fakeClient({ line: () => answer.promise });
    const table = open(client);
    await table.session.getState().start(CASH, 'cfr');
    await untilHerBet(table, client);
    table.session.getState().setTalk(false);
    answer.resolve('Still here');
    await flush();
    expect(table.session.getState().talk.lines.map((l) => l.text)).not.toContain('Still here');
  });

  it('drops a reply that arrives after talk was switched off', async () => {
    const answer = deferred<TalkReply | null>();
    const client = fakeClient({ reply: () => answer.promise });
    const table = open(client);
    await table.session.getState().start(CASH, 'cfr');
    table.session.getState().say('Hello');
    table.session.getState().setTalk(false);
    answer.resolve({ text: 'Hi', signals: ['tease'] });
    await flush();
    expect(table.session.getState().talk.lines.map((l) => l.text)).toEqual(['Hello']);
    expect(table.session.getState().talk.lines[0]?.undelivered).toBeUndefined();
    table.session.getState().setTalk(true);
    await table.session.getState().act({ kind: 'fold' });
    table.session.getState().leave();
    expect(client.summaries[0]?.summary.signals).toEqual({});
  });
});
