import type { Rng } from '../cards/index.ts';
import type { SeatIndex } from '../engine/index.ts';
import type { Moment, PersonaReader, PersonaView, Signal } from '../persona/index.ts';
import { COOL_LINES, drawHumour } from './humour.ts';
import type { HumourDraw } from './humour.ts';
import { occasionsOf, replyOccasion } from './occasion.ts';
import { planOf } from './plan.ts';
import type { UtterancePlan } from './plan.ts';
import { RULES } from './rules.ts';
import type { Rule } from './rules.ts';
import { EMPTY_SUMMARY, withHand, withSignals } from './summary.ts';
import type { SessionSummary } from './summary.ts';
import type { Occasion, OccasionKind } from './types.ts';
import { judge, streetKey } from './verdict.ts';
import type { Verdict } from './verdict.ts';

export interface Planned {
  verdicts: Verdict[];
  plan: UtterancePlan | null;
  humour: HumourDraw | null;
}

export interface Planner {
  observe(moments: readonly Moment[], persona: PersonaReader, nowMs: number): Planned;
  reply(text: string, persona: PersonaReader, nowMs: number): Planned;
  heard(signals: readonly Signal[]): void;
  summary(): SessionSummary;
}

export interface PlannerOptions {
  seat: SeatIndex;
  rng: Rng;
  rules?: readonly Rule[];
}

class TablePlanner implements Planner {
  private readonly seat: SeatIndex;
  private readonly rng: Rng;
  private readonly rules: readonly Rule[];
  private session: SessionSummary = EMPTY_SUMMARY;
  private lastLineAt = Number.NEGATIVE_INFINITY;
  private readonly usedStreets = new Set<string>();
  private previous: OccasionKind | null = null;
  private linesSinceJoke = COOL_LINES;
  private bets = 0;
  private readonly streetRaises = new Map<string, number>();

  constructor(options: PlannerOptions) {
    this.seat = options.seat;
    this.rng = options.rng;
    this.rules = options.rules ?? RULES;
  }

  observe(moments: readonly Moment[], persona: PersonaReader, nowMs: number): Planned {
    moments.forEach((m) => this.track(m));
    const occasions = occasionsOf(moments, this.seat, () => persona.strength());
    for (const occasion of occasions) {
      this.previous = occasion.kind === 'card' ? this.previous : occasion.kind;
      if (occasion.kind === 'handEnded') {
        this.endHand(occasion, moments);
      }
    }
    return this.decide(occasions, persona.view(nowMs), nowMs);
  }

  reply(text: string, persona: PersonaReader, nowMs: number): Planned {
    const view = persona.view(nowMs);
    const occasion = replyOccasion(text, view.hand, persona.strength(), this.previous);
    return this.decide([occasion], view, nowMs);
  }

  heard(signals: readonly Signal[]): void {
    this.session = withSignals(this.session, signals);
  }

  summary(): SessionSummary {
    return this.session;
  }

  private track(moment: Moment): void {
    const { event } = moment;
    if (event.type === 'handStarted') {
      this.usedStreets.clear();
      this.streetRaises.clear();
      this.previous = null;
      this.bets = 0;
    } else if (event.type === 'acted' && event.action.kind === 'raise') {
      this.bets += 1;
      const street = moment.before.street;
      this.streetRaises.set(street, (this.streetRaises.get(street) ?? 0) + 1);
    }
  }

  private endHand(occasion: Occasion, moments: readonly Moment[]): void {
    const { hand } = occasion;
    const ended = moments.find((m) => m.event.type === 'handEnded');
    this.session = withHand(this.session, {
      handNumber: hand.handNumber,
      netBb: (hand.stacks[this.seat] - hand.startStack) / hand.bigBlind,
      potBb: hand.pot / hand.bigBlind,
      won: hand.awarded[this.seat] > 0,
      bluffCaught: occasion.end === 'bluffCaught',
      bets: this.bets,
      reraised: [...this.streetRaises.values()].some((n) => n >= 2),
      playerBluffShown: ended?.playerBluffShown ?? false,
      playerAllIn: hand.playerAllIn,
    });
  }

  private decide(occasions: readonly Occasion[], view: PersonaView, nowMs: number): Planned {
    const pace = { lastLineAt: this.lastLineAt, usedStreets: this.usedStreets };
    const verdicts = judge({ occasions, view, pace, nowMs, rules: this.rules }, this.rng);
    const spoken = verdicts.find((v) => v.speak);
    if (spoken === undefined || spoken.act === null) {
      return { verdicts, plan: null, humour: null };
    }
    const { occasion } = spoken;
    const { draw, humour } = drawHumour(
      {
        act: spoken.act,
        occasion,
        bigFive: view.personality.bigFive,
        snapshot: view.snapshot,
        linesSinceJoke: this.linesSinceJoke,
      },
      this.rng,
    );
    this.linesSinceJoke = humour === null ? this.linesSinceJoke + 1 : 0;
    if (occasion.kind !== 'playerSaid') {
      this.lastLineAt = nowMs;
      this.usedStreets.add(streetKey(occasion.handNumber, occasion.actionStreet));
      this.usedStreets.add(streetKey(view.hand.handNumber, view.hand.street));
    }
    const session = this.session;
    const plan = planOf({ verdict: spoken, view, humour, session, seat: this.seat });
    return { verdicts, plan, humour: draw };
  }
}

export function createPlanner(options: PlannerOptions): Planner {
  return new TablePlanner(options);
}
