import type { Rng } from '../cards/index.ts';
import type { EngineEvent, SeatIndex, Table } from '../engine/index.ts';
import { EMPTY_SUMMARY, createConversation, endsHand, since } from '../conversation/index.ts';
import type { LineIntent, SessionSummary, Conversation } from '../conversation/index.ts';
import type { Moment, Persona, Signal } from '../persona/index.ts';
import type { Opponent } from './opponent.ts';
import {
  silentConversationClient,
  toLinePayload,
  toReplyPayload,
  toSummaryPayload,
} from './conversationClient.ts';
import type {
  ChatTurn,
  HandInput,
  ConversationClient,
  ConversationReply,
} from './conversationClient.ts';

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
  conversation: Conversation;
  her: Persona;
}

export function initialConversation(on: boolean): ConversationState {
  return { available: false, on, lines: [], bubbles: [null, null] };
}

class Wiring implements SessionConversation {
  private client: ConversationClient;
  private conversation: Conversation | null = null;
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
    this.conversation = createConversation({ seat: this.setup.botSeat, rng });
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
    if (this.conversation === null || her === null) {
      return false;
    }
    const ended = this.track(events);
    const intent = this.conversation.observe(moments, her, this.setup.now());
    if (intent !== null && this.speaking()) {
      this.requestLine(intent);
    }
    if (ended) {
      this.sendSummary();
    }
    return intent !== null;
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
    this.conversation?.heard(signals);
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

  private input(talker: Talker, intent: LineIntent, recent: ChatTurn[]): HandInput {
    const { conversation, her } = talker;
    const view = her.view(this.setup.now());
    return {
      sessionId: this.host.sessionId(),
      locale: this.setup.locale,
      seat: this.setup.botSeat,
      facts: conversation.facts(view),
      intent,
      mood: conversation.moodWords(view),
      feeling: conversation.feelingFor(intent, view),
      character: conversation.character(view),
      recent,
    };
  }

  private talker(): Talker | null {
    const her = this.host.her();
    const { conversation } = this;
    return conversation === null || her === null ? null : { conversation, her };
  }

  private recent(): ChatTurn[] {
    return this.host.read().lines.map(({ speaker, text }) => ({ speaker, text }));
  }

  private requestLine(intent: LineIntent): void {
    const { client } = this;
    const talker = this.talker();
    if (talker === null) {
      return;
    }
    const epoch = this.host.epoch();
    const payload = toLinePayload(this.input(talker, intent, this.recent()));
    void attempt(() => client.line(payload)).then((text) => {
      if (text !== null && this.speaking() && this.current(epoch, intent)) {
        this.append('mallorca', text, intent.handNumber);
      }
    });
  }

  private current(epoch: number, intent: LineIntent): boolean {
    if (epoch !== this.host.epoch()) {
      return false;
    }
    const table = this.host.table();
    if (endsHand(intent.situation)) {
      const next = table.handNumber === intent.handNumber + 1 && !this.acted;
      return table.handNumber === intent.handNumber || next;
    }
    return table.handNumber === intent.handNumber && table.hand?.street === intent.street;
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
    const intent = talker.conversation.replyIntent(talker.her, this.setup.now());
    const input = this.input(talker, intent, recent);
    const payload = toReplyPayload({ ...input, text, quick: !typed });
    void attempt(() => client.reply(payload)).then((reply) => {
      this.answered(epoch, line.id, reply, typed);
    });
  }

  private answered(
    epoch: number,
    lineId: number,
    reply: ConversationReply | null,
    hear: boolean,
  ): void {
    if (epoch !== this.host.epoch() || this.conversation === null || !this.speaking()) {
      return;
    }
    if (reply === null) {
      this.markUndelivered(lineId);
      return;
    }
    if (hear) {
      this.hear(reply.signals);
    }
    this.append('mallorca', reply.text, this.host.table().handNumber);
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
    const { conversation, client } = this;
    if (conversation === null || !this.speaking() || this.unsent === 0) {
      return;
    }
    this.unsent = 0;
    const summary = conversation.summary();
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
