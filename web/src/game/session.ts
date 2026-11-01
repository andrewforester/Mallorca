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
  startingStack,
  toAct,
} from '../engine/index.ts';
import type {
  Action,
  EngineEvent,
  LegalActions,
  SeatIndex,
  Table,
  TableMode,
} from '../engine/index.ts';
import { withFallback } from './botClient.ts';
import type { BotClient } from './botClient.ts';
import { resolveIntent, toIntent } from './intent.ts';
import type { Intent } from './intent.ts';
import {
  awardedTo,
  isOpeningBet,
  openingEntries,
  potCollected,
  resultOf,
  streetActions,
} from './outcome.ts';
import { handRecorder } from './records/recorder.ts';
import type { HandRecorder } from './records/recorder.ts';
import { botRecord } from './records/record.ts';
import type { Opponent } from './opponent.ts';
import { initialFace } from './sessionFace.ts';
import type { SessionFace } from './sessionFace.ts';
import { initialConversation } from './sessionConversation.ts';
import { wireFace, wireConversation } from './sessionWiring.ts';
import type { WiringHost } from './sessionWiring.ts';
import { createTimers } from './timers.ts';
import type { Timers } from './timers.ts';
import type { SessionConversation } from './sessionConversation.ts';
import type { Bias } from '../conversation/index.ts';
import { COACH_OFF, createCoach } from './coach.ts';
import type { Coach } from './coach.ts';
import type { CoachDecision } from '../coach/index.ts';
import { createProbe } from './debug.ts';
import type { DebugProbe } from './debug.ts';

export { resolveIntent, toIntent } from './intent.ts';
export type { Intent } from './intent.ts';
export { potCollected, resultOf } from './outcome.ts';
export type { HandResult } from './outcome.ts';
export type { ChatLine, QuickPhrase, ConversationState } from './sessionConversation.ts';
export type { CoachState, CoachStatus } from './coach.ts';

export type {
  Phase,
  Session,
  SessionActions,
  SessionOptions,
  SessionResult,
  SessionState,
} from './sessionTypes.ts';
import type {
  Session,
  SessionActions,
  SessionOptions,
  SessionResult,
  SessionState,
} from './sessionTypes.ts';

type Store = SessionState & SessionActions;
type Step = { state: Table; events: EngineEvent[] };

interface Runtime {
  set: StoreApi<Store>['setState'];
  get: StoreApi<Store>['getState'];
  bot: BotClient;
  coach: Coach;
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
  conversation: SessionConversation;
  face: SessionFace;
  probe: DebugProbe | null;
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
  const buyIn = startingStack(table.mode);
  const live = table.hand !== null && table.hand.street !== 'complete';
  const stack = live ? rt.startStacks[rt.humanSeat] : table.seats[rt.humanSeat].stack;
  return { hands: rt.hands, net: stack - buyIn - rt.topUps };
}

function record(rt: Runtime, events: EngineEvent[], opens = false): void {
  rt.recorder.observe(events);
  rt.coach.observe(events);
  rt.bot.observe(toObservations(events, rt.botSeat));
  rt.conversation.observe(events);
  rt.face.observe(events);
  for (const event of events) {
    if (event.type === 'toppedUp' && event.seat === rt.humanSeat) {
      rt.topUps += event.amount;
    }
  }
  const { lastActions, closingActions } = rt.get();
  const actions = streetActions({ last: lastActions, closing: closingActions }, events, opens);
  rt.set({
    log: [...rt.get().log, ...openingEntries(handHistory(events), opens)],
    lastActions: actions.last,
    closingActions: actions.closing,
    session: tally(rt, rt.get().table),
  });
}

function conclude(rt: Runtime, step: Step): void {
  if (step.state.hand?.street !== 'complete') {
    return;
  }
  const { seats } = step.state;
  rt.hands += 1;
  rt.recorder.save(step.state.mode, botRecord(rt.opponent));
  rt.conversation.handDone(rt.hands);
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

interface Played {
  decision?: Decision | null;
  bias?: Bias;
  coached?: CoachDecision | null;
}

function play(rt: Runtime, action: Action, played: Played = {}): void {
  const { decision = null, bias, coached = null } = played;
  const { hand } = rt.get().table;
  const opens = hand !== null && isOpeningBet(hand, action);
  const step = apply(rt.get().table, action);
  if (decision !== null) {
    rt.recorder.decided(decision, step.events, bias);
  }
  if (coached !== null) {
    rt.recorder.coached(coached, step.events);
  }
  rt.set({ table: step.state });
  record(rt, step.events, opens);
  conclude(rt, step);
}

async function decide(rt: Runtime, legal: LegalActions, bias?: Bias): Promise<Decision | null> {
  try {
    return await rt.bot.decide(legal, bias, rt.probe !== null);
  } catch {
    return null;
  }
}

async function botTurn(rt: Runtime, myEpoch: number): Promise<boolean> {
  rt.set({ phase: 'botThinking' });
  const legal = legalActionsOf(rt.get().table);
  const bias = rt.conversation.bias();
  const decision = await decide(rt, legal, bias);
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
  const action = resolveIntent(intent, legal);
  rt.probe?.decided({ decision, bias, action, legal, table: rt.get().table, seat: rt.botSeat });
  play(rt, action, { decision, bias });
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
      rt.coach.ask(legalActionsOf(table), table.hand.pot);
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
  rt.coach.handStarted();
  rt.recorder.begin();
  rt.set({
    table: step.state,
    lastActions: [null, null],
    closingActions: [null, null],
    result: null,
  });
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
  rt.conversation.begin(rt.opponent, rt.seed);
  return beginHand(rt);
}

function switchCoach(rt: Runtime, on: boolean): void {
  rt.coach.setOn(on);
  const { phase, table } = rt.get();
  if (on && phase === 'humanToAct' && table.hand !== null) {
    rt.coach.ask(legalActionsOf(table), table.hand.pot);
  }
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
        rt.conversation.leave();
      }
    },
    dispose() {
      rt.conversation.leave();
      rt.epoch += 1;
      rt.timers.cancel();
      rt.coach.acted();
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
      const action = resolveIntent(intent, legalActionsOf(table));
      const coached = rt.coach.played(action);
      rt.coach.acted();
      play(rt, action, { coached });
      return drive(rt, rt.epoch);
    },
    say: (text) => rt.conversation.say(text),
    quick: (id, text) => rt.conversation.quick(id, text),
    setConversation: (on) => rt.conversation.setOn(on),
    setTells: (level) => rt.conversation.setLevel(level),
    attachConversation: (client) => rt.conversation.attach(client),
    pageHidden: () => rt.conversation.pageHidden(),
    setCoach: (on) => switchCoach(rt, on),
    setFace: (on) => rt.face.setOn(on),
    faceNow: () => rt.face.now(),
    setPersonality: (choice) => rt.probe?.choose(choice),
    resetFeeling: () => rt.probe?.reset(),
  };
}

function hostOf(runtime: () => Runtime): WiringHost {
  return {
    bot: () => runtime().bot,
    get: () => runtime().get(),
    set: (patch) => runtime().set(patch),
    epoch: () => runtime().epoch,
    seed: () => runtime().seed,
    felt: () => runtime().probe?.refresh(),
  };
}

export function createSession(options: SessionOptions): Session {
  const { seed, botDelayMs, humanSeat, names } = options;
  const bot = withFallback(options.bot);
  const rng = mulberry32(seed);
  const timers = createTimers();
  const recorder = handRecorder(options.records, { names, humanSeat });
  const botSeat: SeatIndex = humanSeat === 0 ? 1 : 0;
  return createStore<Store>((set, get) => {
    const coach = createCoach(bot, humanSeat, options.coach ?? false, (state) =>
      set({ coach: state }),
    );
    const host = hostOf(() => rt);
    const conversation = wireConversation(host, options, botSeat);
    const rt: Runtime = {
      set,
      get,
      bot,
      coach,
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
      conversation,
      face: wireFace(host, conversation, options, botSeat),
      probe: null,
    };
    if (import.meta.env.DEV && options.debug === true) {
      rt.probe = createProbe(rt.conversation, (debug) => set({ debug }));
    }
    const initial = freshTable(options, rt.mode);
    return {
      table: initial,
      phase: 'idle',
      log: [],
      lastActions: [null, null],
      closingActions: [null, null],
      lastDecision: null,
      seed,
      result: null,
      session: tally(rt, initial),
      sessionId: options.records?.sessionId ?? null,
      opponent: rt.opponent,
      conversation: initialConversation(options.conversationOn ?? true, options.tells ?? 'subtle'),
      coach: COACH_OFF,
      face: initialFace(options.faceOn ?? true),
      debug: rt.probe?.initial() ?? null,
      ...sessionActions(rt, options),
    };
  });
}
