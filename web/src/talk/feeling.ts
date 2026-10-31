import type { Card, Rng } from '../cards/index.ts';
import { MALLORCA, createEngine } from '../emotion/index.ts';
import type {
  Emotion,
  Engine,
  Impulse,
  Money,
  Personality,
  Snapshot,
  TableEvent,
} from '../emotion/index.ts';
import type { EngineEvent, SeatIndex } from '../engine/index.ts';
import { equityVsHand, equityVsRange } from '../equity/index.ts';
import type { HandState } from './handTracker.ts';
import { netOf, playerCardsShown } from './handTracker.ts';
import type { Signal } from './signals.ts';
import { ALL_HANDS, strengthOf } from './strength.ts';
import type { Style } from './style.ts';

export interface FeelingOptions {
  seat: SeatIndex;
  rng: Rng;
  personality?: Personality;
}

export interface Feeling {
  advance(nowMs: number): void;
  see(event: EngineEvent, hand: HandState): void;
  hear(signals: readonly Signal[]): void;
  snapshot(): Snapshot;
  at(nowMs: number): Snapshot;
  drain(): Impulse[];
  style(): Style;
  words(): string[];
  speakFactor(): number;
}

const SAMPLES = 600;
const STREETS_LEFT: Readonly<Record<number, number>> = { 0: 3, 3: 2, 4: 1, 5: 0 };
const WORD_THRESHOLD = 0.25;
const MAX_WORDS = 3;
const OVERLOADED = 0.6;
const SPEAK_GAIN = 0.25;
const NO_SHOWDOWN_EQUITY = 0.5;
const MAX_PENDING = 64;

const WORDS: Readonly<Record<Emotion, string>> = {
  hope: 'hopeful',
  fear: 'nervous',
  joy: 'pleased',
  distress: 'upset',
  relief: 'relieved',
  disappointment: 'disappointed',
  pride: 'proud',
  shame: 'embarrassed',
  anger: 'annoyed',
  injustice: 'feeling robbed',
  surprise: 'surprised',
};

const clamp = (v: number, low: number, high: number): number => Math.max(low, Math.min(high, v));

class TableFeeling implements Feeling {
  private readonly seat: SeatIndex;
  private readonly rng: Rng;
  private readonly engine: Engine;
  private lastMs: number | null = null;
  private herAggressive = false;
  private readonly equities = new Map<string, number>();
  private pending: Impulse[] = [];

  constructor(options: FeelingOptions) {
    this.seat = options.seat;
    this.rng = options.rng;
    this.engine = createEngine(options.personality ?? MALLORCA);
  }

  advance(nowMs: number): void {
    if (this.lastMs !== null && nowMs > this.lastMs) {
      this.engine.step((nowMs - this.lastMs) / 1000);
    }
    this.lastMs = Math.max(nowMs, this.lastMs ?? nowMs);
  }

  see(event: EngineEvent, hand: HandState): void {
    switch (event.type) {
      case 'handStarted':
        this.herAggressive = false;
        this.equities.clear();
        return;
      case 'holeCards':
        if (event.seat === this.seat) this.dealt(hand);
        return;
      case 'streetDealt':
        this.herAggressive = false;
        this.moved(hand);
        return;
      case 'acted':
        this.acted(event, hand);
        return;
      case 'showdown':
        this.moved(hand);
        return;
      case 'handEnded':
        this.ended(hand);
        return;
      default:
        return;
    }
  }

  hear(signals: readonly Signal[]): void {
    for (const signal of signals) {
      this.feel({ kind: 'chat', signal });
    }
  }

  snapshot(): Snapshot {
    return this.engine.snapshot();
  }

  at(nowMs: number): Snapshot {
    const last = this.lastMs;
    return last === null || nowMs <= last
      ? this.engine.snapshot()
      : this.engine.ahead((nowMs - last) / 1000);
  }

  drain(): Impulse[] {
    const out = this.pending;
    this.pending = [];
    return out;
  }

  private feel(e: TableEvent): void {
    this.pending = [...this.pending, ...this.engine.event(e)].slice(-MAX_PENDING);
  }

  style(): Style {
    const s = this.engine.snapshot().style;
    return {
      aggression: s.aggression,
      bluff: s.bluff,
      tightness: 1 / s.looseness,
      sizing: s.sizing,
      stickiness: s.stickiness,
    };
  }

  words(): string[] {
    const s = this.engine.snapshot();
    const found = (Object.keys(WORDS) as Emotion[])
      .filter((e) => s.emotions[e] >= WORD_THRESHOLD)
      .sort((a, b) => s.emotions[b] - s.emotions[a])
      .map((e) => WORDS[e]);
    const words = s.load.overload >= OVERLOADED ? ['on tilt', ...found] : found;
    return words.slice(0, MAX_WORDS);
  }

  speakFactor(): number {
    const s = this.engine.snapshot();
    return (
      1 + SPEAK_GAIN * clamp((s.mood[1] - s.traits.defaultMood[1] + s.load.overload) / 2, -1, 1)
    );
  }

  private dealt(hand: HandState): void {
    this.feel({ kind: 'deal', equity: this.equity(hand), ...this.money(hand) });
  }

  private moved(hand: HandState): void {
    this.feel({ kind: 'street', equity: this.equity(hand), ...this.money(hand) });
  }

  private acted(event: Extract<EngineEvent, { type: 'acted' }>, hand: HandState): void {
    const raise = event.action.kind === 'raise';
    if (event.seat === this.seat) {
      this.herAggressive ||= raise;
    } else if (raise) {
      this.feel({
        kind: 'opponentBet',
        sizeBb: event.amount / hand.bigBlind,
        equity: this.equity(hand),
        raise: raise && this.herAggressive,
      });
    }
    this.moved(hand);
  }

  private ended(hand: HandState): void {
    const won = hand.awarded[this.seat] > 0;
    const netBb = netOf(hand, this.seat);
    this.feel({ kind: 'result', netBb, lastEquity: this.whenMoneyWentIn(hand) });
    const her = hand.her;
    if (her === null || !hand.herLateBet) return;
    const weak = strengthOf(her, hand.board, this.rng) === 'weak';
    if (!weak) return;
    const potBb = (hand.awarded[0] + hand.awarded[1]) / hand.bigBlind;
    if (!won && hand.showdown !== null) this.feel({ kind: 'bluff', succeeded: false, potBb });
    if (won && hand.showdown === null) this.feel({ kind: 'bluff', succeeded: true, potBb });
  }

  private whenMoneyWentIn(hand: HandState): number {
    const his = playerCardsShown(hand, this.seat);
    if (hand.her === null || his === null) return NO_SHOWDOWN_EQUITY;
    const range = [{ cards: his, weight: 1 }];
    return equityVsRange(hand.her, range, hand.actionBoard, { rng: this.rng, samples: SAMPLES });
  }

  private money(hand: HandState): Money {
    const bb = hand.bigBlind;
    const behind = hand.stacks[this.seat];
    return {
      potBb: hand.pot / bb,
      investedBb: (hand.startStack - behind) / bb,
      stackBb: behind / bb,
      streetsLeft: STREETS_LEFT[hand.board.length] ?? 0,
    };
  }

  private equity(hand: HandState): number {
    const her = hand.her;
    if (her === null) return 0.5;
    const his = playerCardsShown(hand, this.seat);
    const key = `${hand.board.length}:${his === null ? '' : 'shown'}`;
    const known = this.equities.get(key);
    if (known !== undefined) return known;
    const value =
      his === null ? this.vsRandom(her, hand.board) : equityVsHand(her, his, hand.board);
    this.equities.set(key, value);
    return value;
  }

  private vsRandom(her: readonly [Card, Card], board: readonly Card[]): number {
    return equityVsRange(her, ALL_HANDS, board, { rng: this.rng, samples: SAMPLES });
  }
}

export function createFeeling(options: FeelingOptions): Feeling {
  return new TableFeeling(options);
}
