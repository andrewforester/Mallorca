import { clamp01 } from './emotions.ts';
import type { Emotion, Emotions } from './emotions.ts';
import type { Traits } from './personality.ts';

export interface Impulse {
  emotion: Emotion;
  amount: number;
  reason: string;
}

export interface Appraisal {
  value: number;
  realized: boolean;
  spared: number;
  self: number;
  opponent: number;
  luck: number;
  expected: number;
  unexpected: number;
  control: number;
  reason: string;
}

const FELT = 0.005;

type Amounts = Partial<Record<Emotion, number>>;

function badRealized(a: Appraisal, m: number, now: Emotions): Amounts {
  const { opponent, luck, expected, control, self } = a;
  return {
    distress: m * (1 - (opponent + luck * expected) * control),
    injustice: m * luck * expected,
    anger: m * opponent * control,
    shame: m * self,
    disappointment: m * expected * (1 - control),
    relief: now.fear * a.spared,
  };
}

function badProspective(a: Appraisal, m: number, now: Emotions): Amounts {
  return {
    fear: m * (1 - a.opponent * a.control),
    anger: m * a.opponent * a.control,
    disappointment: m * now.hope,
  };
}

function goodRealized(a: Appraisal, m: number, now: Emotions): Amounts {
  return { joy: m, pride: m * a.self, relief: now.fear * a.spared };
}

function amountsOf(a: Appraisal, now: Emotions): Amounts {
  const m = Math.abs(a.value);
  const bad = a.value < 0;
  if (a.realized) {
    return bad ? badRealized(a, m, now) : goodRealized(a, m, now);
  }
  return bad ? badProspective(a, m, now) : { hope: m, relief: now.fear * a.spared };
}

export function impulsesOf(a: Appraisal, now: Emotions, traits: Traits): Impulse[] {
  const amounts: Amounts = { ...amountsOf(a, now), surprise: a.unexpected };
  const list: Impulse[] = [];
  for (const [emotion, raw] of Object.entries(amounts) as [Emotion, number][]) {
    const amount = clamp01(raw * traits.gains[emotion]);
    if (amount > FELT) {
      list.push({ emotion, amount, reason: a.reason });
    }
  }
  return list;
}
