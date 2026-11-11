import type { Card, Rng } from '../cards/index.ts';
import { MALLORCA, createEngine } from '../emotion/index.ts';
import type { Cause, Engine, Money, Personality, Snapshot, TableEvent } from '../emotion/index.ts';
import type { EngineEvent, SeatIndex } from '../engine/index.ts';
import { equityVsHand, equityVsRange } from '../equity/index.ts';
import type { WeightedHands } from '../equity/index.ts';
import type { HandState } from './hand.ts';
import type { Felt } from './journal.ts';
import { netOf, playerCardsShown } from './hand.ts';
import { liveRange } from './range.ts';
import type { Signal } from './signals.ts';
import { ALL_HANDS } from './strength.ts';
import { wordsOf } from './view.ts';

export interface FeelingOptions {
  seat: SeatIndex;
  rng: Rng;
  personality?: Personality;
}

export interface Feeling {
  advance(nowMs: number): void;
  see(event: EngineEvent, hand: HandState): void;
  narrow(weights: ArrayLike<number>, hand: HandState): void;
  hear(signals: readonly Signal[]): void;
  snapshot(): Snapshot;
  at(nowMs: number): Snapshot;
  takeFelt(): Felt[];
  setPersonality(p: Personality): void;
  reset(): void;
  words(): string[];
  perceived(): number;
}

const SAMPLES = 600;
const STREETS_LEFT: Readonly<Record<number, number>> = { 0: 3, 3: 2, 4: 1, 5: 0 };
const NO_SHOWDOWN_EQUITY = 0.5;

class TableFeeling implements Feeling {
  private readonly seat: SeatIndex;
  private readonly rng: Rng;
  private readonly engine: Engine;
  private lastMs: number | null = null;
  private herAggressive = false;
  private readonly equities = new Map<string, number>();
  private range: WeightedHands = ALL_HANDS;
  private lastPerceived = NO_SHOWDOWN_EQUITY;
  private streetChips: [number, number] = [0, 0];
  private handNumber = 0;
  private felt: Felt[] = [];

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
    this.handNumber = hand.handNumber;
    switch (event.type) {
      case 'handStarted':
        this.herAggressive = false;
        this.equities.clear();
        this.range = ALL_HANDS;
        this.lastPerceived = NO_SHOWDOWN_EQUITY;
        this.streetChips = [0, 0];
        return;
      case 'blindPosted':
        this.streetChips[event.seat] += event.amount;
        return;
      case 'holeCards':
        if (event.seat === this.seat) this.dealt(hand);
        return;
      case 'streetDealt':
        this.herAggressive = false;
        this.streetChips = [0, 0];
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

  narrow(weights: ArrayLike<number>, hand: HandState): void {
    const her = hand.her;
    if (her === null || hand.ended || playerCardsShown(hand, this.seat) !== null) return;
    const range = liveRange(weights, [...her, ...hand.board]);
    if (range.length === 0) return;
    this.range = range;
    this.equities.clear();
    this.moved(hand, 'opponent');
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

  takeFelt(): Felt[] {
    const out = this.felt;
    this.felt = [];
    return out;
  }

  setPersonality(p: Personality): void {
    this.engine.setPersonality(p);
  }

  reset(): void {
    this.engine.reset();
    this.felt = [];
  }

  private feel(e: TableEvent): void {
    const impulses = this.engine.event(e);
    this.felt.push({ handNumber: this.handNumber, event: e, impulses });
  }

  words(): string[] {
    return wordsOf(this.engine.snapshot());
  }

  perceived(): number {
    return this.lastPerceived;
  }

  private dealt(hand: HandState): void {
    this.feel({ kind: 'deal', equity: this.equity(hand), ...this.money(hand) });
  }

  private moved(hand: HandState, cause: Cause = 'cards'): void {
    this.feel({ kind: 'street', equity: this.equity(hand), cause, ...this.money(hand) });
  }

  private acted(event: Extract<EngineEvent, { type: 'acted' }>, hand: HandState): void {
    const raise = event.action.kind === 'raise';
    if (event.seat === this.seat) {
      this.herAggressive ||= raise;
      this.own(event, hand);
    } else if (event.action.kind === 'call') {
      this.feel({ kind: 'opponentCall' });
    } else if (raise) {
      this.feel({
        kind: 'opponentBet',
        sizeBb: event.amount / hand.bigBlind,
        equity: this.equity(hand),
        raise: raise && this.herAggressive,
      });
    }
    this.streetChips[event.seat] += event.amount;
    this.moved(hand);
  }

  private own(event: Extract<EngineEvent, { type: 'acted' }>, hand: HandState): void {
    if (event.action.kind !== 'raise') return;
    const bb = hand.bigBlind;
    this.feel({
      kind: 'ownMove',
      move: 'bet',
      amountBb: event.amount / bb,
      potBb: (hand.pot - event.amount) / bb,
      equity: this.equity(hand),
    });
  }

  private ended(hand: HandState): void {
    const netBb = netOf(hand, this.seat);
    if (hand.showdown !== null) {
      this.feel({
        kind: 'result',
        netBb,
        decided: 'showdown',
        lastEquity: this.whenMoneyWentIn(hand),
      });
      return;
    }
    const won = hand.awarded[this.seat] > 0;
    this.feel({
      kind: 'result',
      netBb,
      decided: won ? 'heFolded' : 'sheFolded',
      toCallBb: this.toCall(hand),
    });
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
      toCallBb: this.toCall(hand),
    };
  }

  private toCall(hand: HandState): number {
    const his = this.streetChips[this.seat === 0 ? 1 : 0];
    return Math.max(0, his - this.streetChips[this.seat]) / hand.bigBlind;
  }

  private equity(hand: HandState): number {
    const her = hand.her;
    if (her === null) return 0.5;
    const his = playerCardsShown(hand, this.seat);
    const key = `${hand.board.length}:${his === null ? '' : 'shown'}`;
    const value =
      this.equities.get(key) ??
      (his === null ? this.vsRange(her, hand.board) : equityVsHand(her, his, hand.board));
    this.equities.set(key, value);
    if (his === null) this.lastPerceived = value;
    return value;
  }

  private vsRange(her: readonly [Card, Card], board: readonly Card[]): number {
    return equityVsRange(her, this.range, board, { rng: this.rng, samples: SAMPLES });
  }
}

export function createFeeling(options: FeelingOptions): Feeling {
  return new TableFeeling(options);
}
