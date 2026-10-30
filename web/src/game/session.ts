import { createStore } from 'zustand/vanilla';
import type { StoreApi } from 'zustand/vanilla';
import { mulberry32 } from '../cards/index.ts';
import type { Rng } from '../cards/index.ts';
import type { Decision } from '../brains/index.ts';
import { toObservations } from '../brains/index.ts';
import {
  apply,
  createTable,
  handHistory,
  legalActionsOf,
  startHand,
  toAct,
  TOURNAMENT_STACK,
} from '../engine/index.ts';
import type {
  Action,
  EngineEvent,
  LegalActions,
  LogEntry,
  SeatIndex,
  Table,
  TableMode,
} from '../engine/index.ts';
import { withFallback } from './botClient.ts';
import type { BotClient } from './botClient.ts';
import { resolveIntent, toIntent } from './intent.ts';
import type { Intent } from './intent.ts';
import { actedLabel, awardedTo, potCollected, resultOf } from './outcome.ts';
import type { HandResult } from './outcome.ts';
import { handRecorder } from './records/recorder.ts';
import type { HandRecorder, RecordsOptions } from './records/recorder.ts';
import { CFR_BOT, MATH_BOT } from './records/record.ts';
import type { Opponent } from './opponent.ts';
import { initialTalk, sessionTalk } from './sessionTalk.ts';
import type { QuickPhrase, SessionTalk, TalkState } from './sessionTalk.ts';
import { silentTalkClient } from './talkClient.ts';
import type { TalkClient } from './talkClient.ts';
import type { Level, Style } from '../talk/index.ts';

const BOT_RECORDS = { math: MATH_BOT, cfr: CFR_BOT } as const;

export { resolveIntent, toIntent } from './intent.ts';
export type { Intent } from './intent.ts';
export { potCollected, resultOf } from './outcome.ts';
export type { HandResult } from './outcome.ts';
export type { ChatLine, QuickPhrase, TalkState } from './sessionTalk.ts';

export type Phase =
  | 'idle'
  | 'humanToAct'
  | 'botThinking'
  | 'animating'
  | 'handOver'
  | 'tournamentOver'
  | 'sessionOver';

export interface SessionResult {
  hands: number;
  net: number;
}

export interface SessionState {
  table: Table;
  phase: Phase;
  log: LogEntry[];
  lastActions: [LogEntry | null, LogEntry | null];
  lastDecision: Decision | null;
  seed: number;
  result: HandResult | null;
  session: SessionResult;
  sessionId: string | null;
  opponent: Opponent;
  talk: TalkState;
}

export interface SessionActions {
  start(mode?: TableMode, opponent?: Opponent): Promise<void>;
  leave(): void;
  nextHand(): Promise<void>;
  act(intent: Intent): Promise<void>;
  dispose(): void;
  say(text: string): void;
  quick(id: QuickPhrase): void;
  setTalk(on: boolean): void;
  setTells(level: Level): void;
  attachTalk(client: TalkClient): void;
}

export type Session = StoreApi<SessionState & SessionActions>;

export interface SessionOptions {
  bot: BotClient;
  seed: number;
  botDelayMs: number;
  humanSeat: SeatIndex;
  names: [string, string];
  startingStacks?: [number, number];
  mode: TableMode;
  records?: RecordsOptions;
  talk?: TalkClient;
  now?: () => number;
  locale?: string;
  talkOn?: boolean;
  tells?: Level;
}

type Store = SessionState & SessionActions;
type Step = { state: Table; events: EngineEvent[] };

interface Timers {
  sleep(ms: number): Promise<void>;
  cancel(): void;
}

interface Runtime {
  set: StoreApi<Store>['setState'];
  get: StoreApi<Store>['getState'];
  bot: BotClient;
  rng: Rng;
  timers: Timers;
  recorder: HandRecorder;
  humanSeat: SeatIndex;
  botSeat: SeatIndex;
  botDelayMs: number;
  epoch: number;
  mode: TableMode;
  startStacks: [number, number];
  hands: number;
  topUps: number;
  opponent: Opponent;
  seed: number;
  talk: SessionTalk;
}

function createTimers(): Timers {
  const pending = new Map<ReturnType<typeof setTimeout>, () => void>();
  return {
    sleep: (ms) =>
      new Promise((resolve) => {
        const timer = setTimeout(() => {
          pending.delete(timer);
          resolve();
        }, ms);
        pending.set(timer, resolve);
      }),
    cancel: () => {
      for (const [timer, resolve] of pending) {
        clearTimeout(timer);
        resolve();
      }
      pending.clear();
    },
  };
}

function freshTable(options: SessionOptions, mode: TableMode): Table {
  const { names, startingStacks } = options;
  const table = createTable(names, mode, 0);
  if (startingStacks === undefined) {
    return table;
  }
  return {
    ...table,
    seats: [
      { name: names[0], stack: startingStacks[0] },
      { name: names[1], stack: startingStacks[1] },
    ],
  };
}

function tally(rt: Runtime, table: Table): SessionResult {
  const buyIn = table.mode.kind === 'cash' ? table.mode.buyIn : TOURNAMENT_STACK;
  const live = table.hand !== null && table.hand.street !== 'complete';
  const stack = live ? rt.startStacks[rt.humanSeat] : table.seats[rt.humanSeat].stack;
  return { hands: rt.hands, net: stack - buyIn - rt.topUps };
}

function record(rt: Runtime, events: EngineEvent[]): void {
  rt.recorder.observe(events);
  rt.bot.observe(toObservations(events, rt.botSeat));
  rt.talk.observe(events);
  const lastActions: [LogEntry | null, LogEntry | null] = [...rt.get().lastActions];
  for (const event of events) {
    if (event.type === 'acted') {
      lastActions[event.seat] = actedLabel(event);
    } else if (event.type === 'toppedUp' && event.seat === rt.humanSeat) {
      rt.topUps += event.amount;
    }
  }
  rt.set({
    log: [...rt.get().log, ...handHistory(events)],
    lastActions,
    session: tally(rt, rt.get().table),
  });
}

function conclude(rt: Runtime, step: Step): void {
  if (step.state.hand?.street !== 'complete') {
    return;
  }
  const { seats } = step.state;
  rt.hands += 1;
  rt.recorder.save(step.state.mode, BOT_RECORDS[rt.opponent]);
  rt.talk.handDone(rt.hands);
  const paid = (seat: SeatIndex) =>
    rt.startStacks[seat] - seats[seat].stack + awardedTo(step.events, seat);
  rt.set({
    result: {
      ...resultOf(step.events),
      amount: potCollected([paid(0), paid(1)], resultOf(step.events).winner),
    },
    phase: step.state.winner === null ? 'handOver' : 'tournamentOver',
    session: tally(rt, step.state),
  });
}

function play(rt: Runtime, action: Action, decision: Decision | null = null, style?: Style): void {
  const step = apply(rt.get().table, action);
  if (decision !== null) {
    rt.recorder.decided(decision, step.events, style);
  }
  rt.set({ table: step.state });
  record(rt, step.events);
  conclude(rt, step);
}

async function decide(rt: Runtime, legal: LegalActions, style?: Style): Promise<Decision | null> {
  try {
    return await rt.bot.decide(legal, style);
  } catch {
    return null;
  }
}

async function botTurn(rt: Runtime, myEpoch: number): Promise<boolean> {
  rt.set({ phase: 'botThinking' });
  const legal = legalActionsOf(rt.get().table);
  const style = rt.talk.style();
  const decision = await decide(rt, legal, style);
  if (myEpoch !== rt.epoch) {
    return false;
  }
  if (decision !== null) {
    rt.set({ lastDecision: decision });
  }
  if (rt.botDelayMs > 0) {
    rt.set({ phase: 'animating' });
    await rt.timers.sleep(rt.botDelayMs);
    if (myEpoch !== rt.epoch) {
      return false;
    }
  }
  const intent: Intent = decision === null ? { kind: 'passive' } : toIntent(decision.action);
  play(rt, resolveIntent(intent, legal), decision, style);
  return true;
}

async function drive(rt: Runtime, myEpoch: number): Promise<void> {
  for (;;) {
    const { table } = rt.get();
    if (table.hand === null || table.hand.street === 'complete') {
      return;
    }
    if (toAct(table) === rt.humanSeat) {
      rt.set({ phase: 'humanToAct' });
      return;
    }
    if (!(await botTurn(rt, myEpoch))) {
      return;
    }
  }
}

function beginHand(rt: Runtime): Promise<void> {
  const step = startHand(rt.get().table, rt.rng);
  const { seats, hand } = step.state;
  rt.startStacks = [
    seats[0].stack + (hand?.committed[0] ?? 0),
    seats[1].stack + (hand?.committed[1] ?? 0),
  ];
  rt.bot.reset();
  rt.recorder.begin();
  rt.set({ table: step.state, lastActions: [null, null], result: null });
  record(rt, step.events);
  conclude(rt, step);
  return drive(rt, rt.epoch);
}

async function choose(rt: Runtime, target: Opponent): Promise<void> {
  rt.opponent = (await rt.bot.select?.(target, rt.seed)) ?? 'math';
}

function restart(rt: Runtime, options: SessionOptions): Promise<void> {
  rt.hands = 0;
  rt.topUps = 0;
  const table = freshTable(options, rt.mode);
  rt.set({
    table,
    log: [],
    lastDecision: null,
    result: null,
    opponent: rt.opponent,
    session: tally(rt, table),
  });
  rt.talk.begin(rt.opponent, rt.seed);
  return beginHand(rt);
}

function sessionActions(rt: Runtime, options: SessionOptions): SessionActions {
  return {
    start(next, opponent) {
      rt.epoch += 1;
      const mine = rt.epoch;
      rt.timers.cancel();
      if (next !== undefined) {
        rt.mode = next;
      }
      const target = opponent ?? rt.opponent;
      if (target === rt.opponent) {
        return restart(rt, options);
      }
      return choose(rt, target).then(() => (mine === rt.epoch ? restart(rt, options) : undefined));
    },
    leave() {
      const { phase, table } = rt.get();
      if (table.mode.kind === 'cash' && phase === 'handOver') {
        rt.set({ phase: 'sessionOver' });
        rt.talk.leave();
      }
    },
    dispose() {
      rt.epoch += 1;
      rt.timers.cancel();
      rt.bot.dispose?.();
    },
    nextHand() {
      if (rt.get().phase !== 'handOver') {
        return Promise.resolve();
      }
      return beginHand(rt);
    },
    act(intent) {
      const { phase, table } = rt.get();
      if (phase !== 'humanToAct' || toAct(table) !== rt.humanSeat) {
        return Promise.resolve();
      }
      play(rt, resolveIntent(intent, legalActionsOf(table)));
      return drive(rt, rt.epoch);
    },
    say: (text) => rt.talk.say(text),
    quick: (id) => rt.talk.quick(id),
    setTalk: (on) => rt.talk.setOn(on),
    setTells: (level) => rt.talk.setLevel(level),
    attachTalk: (client) => rt.talk.attach(client),
  };
}

function wireTalk(
  runtime: () => Runtime,
  options: SessionOptions,
  botSeat: SeatIndex,
): SessionTalk {
  return sessionTalk(
    {
      client: options.talk ?? silentTalkClient,
      now: options.now ?? Date.now,
      locale: options.locale ?? 'en',
      botSeat,
    },
    {
      read: () => runtime().get().talk,
      write: (talk) => runtime().set({ talk }),
      table: () => runtime().get().table,
      epoch: () => runtime().epoch,
      sessionId: () => runtime().get().sessionId ?? `seed-${runtime().seed}`,
    },
  );
}

export function createSession(options: SessionOptions): Session {
  const { seed, botDelayMs, humanSeat, names } = options;
  const bot = withFallback(options.bot);
  const rng = mulberry32(seed);
  const timers = createTimers();
  const recorder = handRecorder(options.records, { names, humanSeat });
  const botSeat: SeatIndex = humanSeat === 0 ? 1 : 0;
  return createStore<Store>((set, get) => {
    const rt: Runtime = {
      set,
      get,
      bot,
      rng,
      timers,
      recorder,
      humanSeat,
      botSeat,
      botDelayMs,
      epoch: 0,
      mode: options.mode,
      startStacks: [0, 0],
      hands: 0,
      topUps: 0,
      seed,
      opponent: 'math',
      talk: wireTalk(() => rt, options, botSeat),
    };
    const initial = freshTable(options, rt.mode);
    return {
      table: initial,
      phase: 'idle',
      log: [],
      lastActions: [null, null],
      lastDecision: null,
      seed,
      result: null,
      session: tally(rt, initial),
      sessionId: options.records?.sessionId ?? null,
      opponent: rt.opponent,
      talk: initialTalk(options.talkOn ?? true, options.tells ?? 'subtle'),
      ...sessionActions(rt, options),
    };
  });
}
