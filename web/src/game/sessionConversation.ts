import type { Rng } from '../cards/index.ts';
import type { EngineEvent, SeatIndex, Table } from '../engine/index.ts';
import { EMPTY_SUMMARY, createPlanner, since } from '../conversation/index.ts';
import type { Planned, Planner, SessionSummary, UtterancePlan } from '../conversation/index.ts';
import type { Moment, Persona, Signal } from '../persona/index.ts';
import type { Opponent } from './opponent.ts';
import {
  silentConversationClient,
  toPlanLinePayload,
  toPlanReplyPayload,
  toSummaryPayload,
} from './conversationClient.ts';
import type {
  ChatTurn,
  ConversationClient,
  LineAnswer,
  PlanInput,
  ReplyAnswer,
} from './conversationClient.ts';
import type { Fate, TraceSink } from './conversationTrace.ts';

export interface ChatLine {
  id: number;
  speaker: 'mallorca' | 'player';
  text: string;
  handNumber: number;
  undelivered?: boolean;
}

export type QuickPhrase = 'niceHand' | 'bluffing' | 'notThisTime';

export interface ConversationState {
  available: boolean;
  on: boolean;
  lines: ChatLine[];
  bubbles: [ChatLine | null, ChatLine | null];
}

export interface ConversationHost {
  read(): ConversationState;
  write(conversation: ConversationState): void;
  table(): Table;
  epoch(): number;
  sessionId(): string;
  her(): Persona | null;
  hear(signals: readonly Signal[]): void;
}

export interface ConversationSetup {
  client: ConversationClient;
  now: () => number;
  locale: string;
  botSeat: SeatIndex;
  connect?: () => Promise<ConversationClient>;
  trace?: TraceSink;
}

export interface SessionConversation {
  begin(opponent: Opponent, rng: Rng): void;
  observe(events: readonly EngineEvent[], moments: readonly Moment[]): boolean;
  say(text: string): void;
  quick(id: QuickPhrase, text: string): void;
  setOn(on: boolean): void;
  attach(client: ConversationClient): void;
  handDone(hands: number): void;
  leave(): void;
  pageHidden(): void;
}

const MAX_LINES = 100;
const MAX_TEXT = 200;
const SUMMARY_EVERY = 50;

function attempt<T>(call: () => Promise<T>): Promise<T | null> {
  try {
    return call().catch(() => null);
  } catch {
    return Promise.resolve(null);
  }
}

interface Talker {
  planner: Planner;
  her: Persona;
}

export function initialConversation(on: boolean): ConversationState {
  return { available: false, on, lines: [], bubbles: [null, null] };
}

class Wiring implements SessionConversation {
  private client: ConversationClient;
  private planner: Planner | null = null;
  private solver = false;
  private herRaised = false;
  private acted = false;
  private link: 'none' | 'pending' | 'done' = 'none';
  private sent: SessionSummary = EMPTY_SUMMARY;
  private unsent = 0;
  private nextId = 0;
  private readonly setup: ConversationSetup;
  private readonly host: ConversationHost;

  constructor(setup: ConversationSetup, host: ConversationHost) {
    this.setup = setup;
    this.host = host;
    this.client = setup.client;
  }

  begin(opponent: Opponent, rng: Rng): void {
    this.sendSummary();
    this.planner = createPlanner({ seat: this.setup.botSeat, rng });
    this.solver = opponent !== 'math';
    this.herRaised = false;
    this.acted = false;
    this.sent = EMPTY_SUMMARY;
    this.unsent = 0;
    this.update({ available: this.available(), lines: [], bubbles: [null, null] });
    this.connect();
  }

  observe(events: readonly EngineEvent[], moments: readonly Moment[]): boolean {
    const her = this.host.her();
    if (this.planner === null || her === null) {
      return false;
    }
    const ended = this.track(events);
    const planned = this.planner.observe(moments, her, this.setup.now());
    const [id] = this.setup.trace?.add(planned, this.setup.now()) ?? [];
    if (planned.plan !== null) {
      this.requestLine(planned.plan, id);
    }
    if (ended) {
      this.sendSummary();
    }
    return planned.plan !== null;
  }

  say(text: string): void {
    const trimmed = text.trim().slice(0, MAX_TEXT);
    if (trimmed === '' || !this.speaking()) {
      return;
    }
    this.send(trimmed, true);
  }

  quick(id: QuickPhrase, text: string): void {
    const trimmed = text.trim().slice(0, MAX_TEXT);
    if (trimmed === '' || !this.speaking()) {
      return;
    }
    this.hear(this.quickSignals(id));
    this.send(trimmed, false);
  }

  setOn(on: boolean): void {
    this.update({ on });
    this.connect();
  }

  attach(client: ConversationClient): void {
    this.client = client;
    this.link = 'done';
    this.update({ available: this.available() });
  }

  handDone(hands: number): void {
    if (hands % SUMMARY_EVERY === 0) {
      this.sendSummary();
    }
  }

  leave(): void {
    this.sendSummary();
  }

  pageHidden(): void {
    this.sendSummary(true);
  }

  private hear(signals: readonly Signal[]): void {
    this.host.hear(signals);
    this.planner?.heard(signals);
  }

  private connect(): void {
    const { connect } = this.setup;
    if (connect === undefined || this.link !== 'none' || !this.solver) {
      return;
    }
    if (!this.host.read().on) {
      return;
    }
    this.link = 'pending';
    void attempt(connect).then((client) => this.attach(client ?? silentConversationClient));
  }

  private available(): boolean {
    const connectable = this.setup.connect !== undefined && this.link !== 'done';
    return this.solver && (this.client.enabled || connectable);
  }

  private speaking(): boolean {
    return this.client.enabled && this.solver && this.host.read().on;
  }

  private update(patch: Partial<ConversationState>): void {
    this.host.write({ ...this.host.read(), ...patch });
  }

  private track(events: readonly EngineEvent[]): boolean {
    let ended = false;
    for (const event of events) {
      if (event.type === 'handStarted') {
        this.herRaised = false;
        this.acted = false;
      } else if (event.type === 'acted') {
        this.acted = true;
        this.herRaised ||= event.seat === this.setup.botSeat && event.action.kind === 'raise';
      } else if (event.type === 'handEnded') {
        this.unsent += 1;
      }
      ended ||= event.type === 'tournamentEnded';
    }
    return ended;
  }

  private quickSignals(id: QuickPhrase): Signal[] {
    if (id === 'niceHand') {
      return ['compliment'];
    }
    if (id === 'notThisTime') {
      return ['claimStrength'];
    }
    return this.herRaised ? ['mockBluff'] : ['tease'];
  }

  private input(talker: Talker, plan: UtterancePlan, recent: ChatTurn[]): PlanInput {
    const view = talker.her.view(this.setup.now());
    return {
      sessionId: this.host.sessionId(),
      locale: this.setup.locale,
      personality: view.personality.bigFive,
      plan,
      recent,
      debug: this.setup.trace !== undefined,
    };
  }

  private talker(): Talker | null {
    const her = this.host.her();
    const { planner } = this;
    return planner === null || her === null ? null : { planner, her };
  }

  private recent(): ChatTurn[] {
    return this.host.read().lines.map(({ speaker, text }) => ({ speaker, text }));
  }

  private fateOf(): Fate {
    if (!this.client.enabled || !this.solver) {
      return 'noClient';
    }
    return this.host.read().on ? 'pending' : 'off';
  }

  private requestLine(plan: UtterancePlan, id: number | undefined): void {
    const { client } = this;
    const talker = this.talker();
    const trace = this.setup.trace;
    const fate = this.fateOf();
    if (talker === null || fate !== 'pending') {
      if (id !== undefined) trace?.fate(id, fate);
      return;
    }
    const epoch = this.host.epoch();
    const payload = toPlanLinePayload(this.input(talker, plan, this.recent()));
    if (id !== undefined) trace?.sent(id, this.setup.now(), null);
    void attempt(() => client.planLine(payload)).then((answer) => {
      const placed = this.place(epoch, plan, answer);
      if (id !== undefined) trace?.answered(id, answer, this.setup.now(), placed);
    });
  }

  private place(epoch: number, plan: UtterancePlan, answer: LineAnswer | null): Fate {
    if (answer === null) {
      return 'error';
    }
    if (answer.text === null) {
      return 'filtered';
    }
    if (!this.speaking() || !this.current(epoch, plan)) {
      return 'stale';
    }
    this.append('mallorca', answer.text, plan.handNumber);
    return 'shown';
  }

  private current(epoch: number, plan: UtterancePlan): boolean {
    if (epoch !== this.host.epoch()) {
      return false;
    }
    const table = this.host.table();
    if (plan.endsHand) {
      const next = table.handNumber === plan.handNumber + 1 && !this.acted;
      return table.handNumber === plan.handNumber || next;
    }
    return table.handNumber === plan.handNumber && table.hand?.street === plan.street;
  }

  private send(text: string, typed: boolean): void {
    const { client } = this;
    const talker = this.talker();
    if (talker === null) {
      return;
    }
    const recent = this.recent();
    const line = this.append('player', text, this.host.table().handNumber);
    const epoch = this.host.epoch();
    const planned: Planned = talker.planner.reply(text, talker.her, this.setup.now());
    const [id] = this.setup.trace?.add(planned, this.setup.now()) ?? [];
    const plan = planned.plan;
    if (plan === null) {
      return;
    }
    const payload = toPlanReplyPayload({
      ...this.input(talker, plan, recent),
      text,
      quick: !typed,
    });
    if (id !== undefined) this.setup.trace?.sent(id, this.setup.now(), null);
    void attempt(() => client.planReply(payload)).then((reply) => {
      const fate = this.answered(epoch, line.id, reply, typed);
      if (id !== undefined) this.setup.trace?.answered(id, reply, this.setup.now(), fate);
    });
  }

  private answered(epoch: number, lineId: number, reply: ReplyAnswer | null, hear: boolean): Fate {
    if (epoch !== this.host.epoch() || this.planner === null || !this.speaking()) {
      return 'stale';
    }
    if (reply === null) {
      this.markUndelivered(lineId);
      return 'error';
    }
    if (hear) {
      this.hear(reply.signals);
    }
    this.append('mallorca', reply.text ?? '', this.host.table().handNumber);
    return 'shown';
  }

  private markUndelivered(lineId: number): void {
    const { lines } = this.host.read();
    this.update({
      lines: lines.map((line) => (line.id === lineId ? { ...line, undelivered: true } : line)),
    });
  }

  private append(speaker: ChatLine['speaker'], text: string, handNumber: number): ChatLine {
    this.nextId += 1;
    const line: ChatLine = { id: this.nextId, speaker, text, handNumber };
    const { lines, bubbles } = this.host.read();
    const next: [ChatLine | null, ChatLine | null] = [bubbles[0], bubbles[1]];
    const herSeat = this.setup.botSeat;
    next[speaker === 'mallorca' ? herSeat : herSeat === 0 ? 1 : 0] = line;
    this.update({ lines: [...lines, line].slice(-MAX_LINES), bubbles: next });
    return line;
  }

  private sendSummary(keepalive = false): void {
    const { planner, client } = this;
    if (planner === null || !this.speaking() || this.unsent === 0) {
      return;
    }
    this.unsent = 0;
    const summary = planner.summary();
    const payload = toSummaryPayload({
      sessionId: this.host.sessionId(),
      locale: this.setup.locale,
      summary: since(summary, this.sent),
    });
    this.sent = summary;
    void attempt(() => client.summary(payload, { keepalive }));
  }
}

export function sessionConversation(
  setup: ConversationSetup,
  host: ConversationHost,
): SessionConversation {
  return new Wiring(setup, host);
}
