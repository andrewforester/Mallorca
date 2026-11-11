import { appraise } from './appraisal.ts';
import type { Aggressor, Impulse, Prospect, TableEvent } from './appraisal.ts';
import { RELEASE_S, beliefOf, foldChanceOf, tensionTargets } from './tension.ts';
import { APPROACH, CERTAINTY, decay, noEmotions, queue, rise } from './emotions.ts';
import type { Pending } from './emotions.ts';
import type { Emotions, Pad } from './emotions.ts';
import { GAME_MOOD, octantOf, stepAxis, stepMood } from './mood.ts';
import type { MoodConfig } from './mood.ts';
import { traitsOf } from './personality.ts';
import type { Personality, Traits } from './personality.ts';
import type { PlayBias } from './biasKeys.ts';
import { affectOf, overloadOf, partsOf, playOf, strainOf } from './play.ts';
import type { Affect, LoadReading } from './play.ts';

export const PROSPECT_HALF_LIFE_S = 0.8;
export const PROSPECT_DROP_HALF_LIFE_S = 0.25;
export const PRESSURE_HALF_LIFE_S = 300;

export interface Snapshot {
  time: number;
  traits: Traits;
  emotions: Emotions;
  mood: Pad;
  approach: number;
  certainty: number;
  belief: number | null;
  octant: ReturnType<typeof octantOf>;
  prospect: Prospect | null;
  sessionNetBb: number;
  pressure: number;
  load: LoadReading;
  affect: Affect;
  bias: PlayBias;
}

export interface Engine {
  event(e: TableEvent): Impulse[];
  step(dt: number): void;
  snapshot(): Snapshot;
  ahead(dt: number): Snapshot;
  setPersonality(p: Personality): void;
  reset(): void;
}

const prospectOf = (e: Prospect): Prospect => ({
  equity: e.equity,
  potBb: e.potBb,
  investedBb: e.investedBb,
  stackBb: e.stackBb,
  streetsLeft: e.streetsLeft,
});

const lastEquityOf = (p: Prospect | null): number => p?.previousEquity ?? p?.equity ?? 0.5;

const tracked = (current: number, target: number, dt: number, worse: boolean): number => {
  const halfLife = worse ? PROSPECT_DROP_HALF_LIFE_S : PROSPECT_HALF_LIFE_S;
  return current + (target - current) * (1 - 0.5 ** (dt / halfLife));
};

class EmotionEngine implements Engine {
  private traits: Traits;
  private time = 0;
  private emotions: Emotions = noEmotions();
  private pending: Pending = {};
  private mood: Pad;
  private approach = 0;
  private certainty = 0;
  private foldChance = 0;
  private aggressor: Aggressor | undefined = undefined;
  private prospect: Prospect | null = null;
  private sessionNetBb = 0;
  private pressure = 0;
  private readonly config: MoodConfig;

  constructor(personality: Personality, config: MoodConfig) {
    this.traits = traitsOf(personality);
    this.mood = this.traits.defaultMood;
    this.config = config;
  }

  event(e: TableEvent): Impulse[] {
    if (e.kind === 'street' && !this.prospect) {
      return [];
    }
    const impulses = appraise(this.completed(e), this.emotions, {
      prospect: this.prospect,
      pressure: this.pressure,
      traits: this.traits,
    });
    for (const i of impulses) {
      this.pending = queue(this.pending, i.emotion, i.amount);
    }
    this.remember(e);
    return impulses;
  }

  private completed(e: TableEvent): TableEvent {
    const p = this.prospect;
    if (e.kind === 'street' && p) {
      return { ...e, previousEquity: e.previousEquity ?? p.equity };
    }
    if (e.kind === 'result') {
      return {
        ...e,
        lastEquity: e.lastEquity ?? beliefOf(lastEquityOf(p), this.foldChance),
        aggressor: e.aggressor ?? this.aggressor,
      };
    }
    return e;
  }

  private remember(e: TableEvent): void {
    if (e.kind === 'deal') {
      this.prospect = prospectOf(e);
    } else if (e.kind === 'street') {
      const p = this.prospect;
      const changed = !p || Math.abs(p.equity - e.equity) > 1e-9;
      this.prospect = { ...prospectOf(e), previousEquity: changed ? p?.equity : p?.previousEquity };
    } else if (e.kind === 'opponentBet' && e.raise) {
      this.pressure += 1;
    } else if (e.kind === 'result') {
      this.prospect = null;
      this.sessionNetBb += e.netBb;
    }
    this.foldChance =
      e.kind === 'ownMove' ? foldChanceOf(e.amountBb, e.potBb) : this.keptFoldChance(e);
    this.aggressor = this.aggressorAfter(e);
  }

  private aggressorAfter(e: TableEvent): Aggressor | undefined {
    if (e.kind === 'ownMove') {
      return 'her';
    }
    if (e.kind === 'opponentBet') {
      return 'him';
    }
    return e.kind === 'deal' || e.kind === 'result' ? undefined : this.aggressor;
  }

  private keptFoldChance(e: TableEvent): number {
    const resets = ['deal', 'opponentBet', 'opponentCall', 'result'];
    return resets.includes(e.kind) ? 0 : this.foldChance;
  }

  private believed(): Prospect | null {
    const p = this.prospect;
    return p === null ? null : { ...p, equity: beliefOf(p.equity, this.foldChance) };
  }

  step(dt: number): void {
    this.time += dt;
    const risen = rise(this.emotions, this.pending, dt);
    this.pending = risen.pending;
    this.emotions = decay(risen.emotions, dt, (name) => this.traits.halfLifeFactor[name]);
    this.trackProspect(dt);
    this.mood = stepMood(this.mood, this.emotions, dt, {
      ...this.config,
      defaultMood: this.traits.defaultMood,
    });
    this.approach = stepAxis(this.approach, this.emotions, dt, {
      ...this.config,
      weights: APPROACH,
    });
    this.certainty = stepAxis(this.certainty, this.emotions, dt, {
      ...this.config,
      weights: CERTAINTY,
    });
    this.pressure *= 0.5 ** (dt / PRESSURE_HALF_LIFE_S);
  }

  private trackProspect(dt: number): void {
    if (!this.prospect) {
      const fade = 0.5 ** (dt / RELEASE_S);
      this.emotions = {
        ...this.emotions,
        hope: this.emotions.hope * fade,
        fear: this.emotions.fear * fade,
      };
      return;
    }
    const target = tensionTargets(this.believed() ?? this.prospect, this.traits);
    const { hope, fear } = this.emotions;
    this.emotions = {
      ...this.emotions,
      hope: tracked(hope, target.hope, dt, target.hope < hope),
      fear: tracked(fear, target.fear, dt, target.fear > fear),
    };
  }

  snapshot(): Snapshot {
    const base = this.traits.defaultMood;
    const shift: Pad = [this.mood[0] - base[0], this.mood[1] - base[1], this.mood[2] - base[2]];
    const { traits, emotions, approach, certainty } = this;
    const moodShift = { shift, approach, certainty };
    const affect = affectOf(emotions, moodShift, traits.urgency);
    const play = playOf(affect, traits);
    const strain = strainOf(emotions, moodShift);
    return {
      time: this.time,
      traits: this.traits,
      emotions: this.emotions,
      mood: this.mood,
      approach: this.approach,
      certainty: this.certainty,
      belief: this.believed()?.equity ?? null,
      octant: octantOf(this.mood),
      prospect: this.prospect,
      sessionNetBb: this.sessionNetBb,
      pressure: this.pressure,
      load: {
        intensity: play.intensity,
        strain,
        overload: overloadOf(strain, traits.composure),
        reach: play.reach,
        composure: traits.composure,
        discipline: traits.discipline,
        parts: partsOf(emotions, moodShift),
      },
      affect,
      bias: play.bias,
    };
  }

  ahead(dt: number): Snapshot {
    const { time, emotions, pending, mood, approach, certainty, prospect, pressure, foldChance } =
      this;
    this.step(dt);
    const later = this.snapshot();
    Object.assign(this, {
      time,
      emotions,
      pending,
      mood,
      approach,
      certainty,
      prospect,
      pressure,
      foldChance,
    });
    return later;
  }

  setPersonality(p: Personality): void {
    this.traits = traitsOf(p);
  }

  reset(): void {
    this.time = 0;
    this.emotions = noEmotions();
    this.pending = {};
    this.mood = this.traits.defaultMood;
    this.approach = 0;
    this.certainty = 0;
    this.foldChance = 0;
    this.aggressor = undefined;
    this.prospect = null;
    this.sessionNetBb = 0;
    this.pressure = 0;
  }
}

export function createEngine(personality: Personality, config: MoodConfig = GAME_MOOD): Engine {
  return new EmotionEngine(personality, config);
}
