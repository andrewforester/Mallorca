import { appraise, prospectTargets } from './appraisal.ts';
import type { Impulse, Prospect, TableEvent } from './appraisal.ts';
import { addImpulse, decay, noEmotions } from './emotions.ts';
import type { Emotions, Pad } from './emotions.ts';
import { GAME_MOOD, octantOf, stepMood } from './mood.ts';
import type { MoodConfig } from './mood.ts';
import { traitsOf } from './personality.ts';
import type { Personality, Traits } from './personality.ts';
import { biasOf, driversOf } from './bias.ts';
import type { Drivers, PlayBias } from './bias.ts';
import { loadOf } from './load.ts';
import type { LoadReading } from './load.ts';

export const PROSPECT_HALF_LIFE_S = 0.8;
export const PROSPECT_DROP_HALF_LIFE_S = 0.25;
export const OUTCOME_DAMPING = 0.3;
export const PRESSURE_HALF_LIFE_S = 300;

export function settle(e: Emotions, netBb: number): Emotions {
  const won = netBb >= 0;
  return {
    ...e,
    hope: 0,
    fear: 0,
    joy: won ? e.joy : e.joy * OUTCOME_DAMPING,
    pride: won ? e.pride : e.pride * OUTCOME_DAMPING,
    distress: won ? e.distress * OUTCOME_DAMPING : e.distress,
    disappointment: won ? e.disappointment * OUTCOME_DAMPING : e.disappointment,
  };
}

export interface Snapshot {
  time: number;
  traits: Traits;
  emotions: Emotions;
  mood: Pad;
  octant: ReturnType<typeof octantOf>;
  prospect: Prospect | null;
  sessionNetBb: number;
  pressure: number;
  load: LoadReading;
  drivers: Drivers;
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
  private mood: Pad;
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
    const impulses = appraise(this.completed(e), this.emotions, this.traits);
    for (const i of impulses) {
      this.emotions = addImpulse(this.emotions, i.emotion, i.amount);
    }
    this.remember(e);
    return impulses;
  }

  private completed(e: TableEvent): TableEvent {
    const p = this.prospect;
    if (e.kind === 'street' && p) {
      return { ...e, previousEquity: e.previousEquity ?? p.equity };
    }
    if (e.kind === 'opponentBet' && e.raise) {
      return { ...e, pressure: e.pressure ?? this.pressure };
    }
    if (e.kind === 'result') {
      return { ...e, lastEquity: e.lastEquity ?? lastEquityOf(p) };
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
      this.emotions = settle(this.emotions, e.netBb);
    }
  }

  step(dt: number): void {
    this.time += dt;
    this.emotions = decay(this.emotions, dt, (name) => this.traits.halfLifeFactor[name]);
    this.trackProspect(dt);
    this.mood = stepMood(this.mood, this.emotions, dt, {
      ...this.config,
      defaultMood: this.traits.defaultMood,
    });
    this.pressure *= 0.5 ** (dt / PRESSURE_HALF_LIFE_S);
  }

  private trackProspect(dt: number): void {
    if (!this.prospect) {
      return;
    }
    const target = prospectTargets(this.prospect, this.traits);
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
    const load = loadOf(this.emotions, shift, this.sessionNetBb, this.traits);
    const drivers = driversOf(this.emotions, shift, this.sessionNetBb);
    return {
      time: this.time,
      traits: this.traits,
      emotions: this.emotions,
      mood: this.mood,
      octant: octantOf(this.mood),
      prospect: this.prospect,
      sessionNetBb: this.sessionNetBb,
      pressure: this.pressure,
      load,
      drivers,
      bias: biasOf(drivers, load.leakage, this.traits.baseline),
    };
  }

  ahead(dt: number): Snapshot {
    const { time, emotions, mood, prospect, pressure } = this;
    this.step(dt);
    const later = this.snapshot();
    Object.assign(this, { time, emotions, mood, prospect, pressure });
    return later;
  }

  setPersonality(p: Personality): void {
    this.traits = traitsOf(p);
  }

  reset(): void {
    this.time = 0;
    this.emotions = noEmotions();
    this.mood = this.traits.defaultMood;
    this.prospect = null;
    this.sessionNetBb = 0;
    this.pressure = 0;
  }
}

export function createEngine(personality: Personality, config: MoodConfig = GAME_MOOD): Engine {
  return new EmotionEngine(personality, config);
}
