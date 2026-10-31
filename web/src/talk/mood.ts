export type Signal =
  'tease' | 'compliment' | 'claimStrength' | 'claimWeakness' | 'mockBluff' | 'friendly';

export const SIGNALS: readonly Signal[] = [
  'tease',
  'compliment',
  'claimStrength',
  'claimWeakness',
  'mockBluff',
  'friendly',
];

export interface Mood {
  cheer: number;
  confidence: number;
  tilt: number;
  caution: number;
  form: number;
}

export interface Outcome {
  netBb: number;
  luckBb: number | null;
  bluffCaught: boolean;
}

export const CALM: Mood = { cheer: 0, confidence: 0, tilt: 0, caution: 0, form: 0 };

const DECAY = 0.7;
const BIG_POT_BB = 10;
const FORM_KEEP = 0.95;
const FORM_GAIN = 0.05;
const FORM_SCALE_BB = 10;
const WORD_THRESHOLD = 0.25;
const MAX_WORDS = 3;

const SIGNAL_EFFECTS: Record<Signal, Partial<Mood>> = {
  tease: { tilt: 0.2 },
  compliment: { cheer: 0.1, tilt: -0.1 },
  claimStrength: { caution: 0.15 },
  claimWeakness: { caution: -0.1 },
  mockBluff: { tilt: 0.3 },
  friendly: { cheer: 0.1 },
};

const clamp = (value: number): number => Math.max(-1, Math.min(1, value));

function shifted(mood: Mood, delta: Partial<Mood>): Mood {
  return {
    cheer: clamp(mood.cheer + (delta.cheer ?? 0)),
    confidence: clamp(mood.confidence + (delta.confidence ?? 0)),
    tilt: clamp(mood.tilt + (delta.tilt ?? 0)),
    caution: clamp(mood.caution + (delta.caution ?? 0)),
    form: mood.form,
  };
}

function outcomeEffect(outcome: Outcome): Partial<Mood> {
  const sign = Math.abs(outcome.netBb) > BIG_POT_BB ? Math.sign(outcome.netBb) : 0;
  let confidence = 0.15 * sign;
  let cheer = 0.1 * sign;
  let tilt = 0;
  if (outcome.luckBb !== null && outcome.luckBb < -BIG_POT_BB) {
    tilt += 0.3;
    cheer -= 0.2;
  }
  if (outcome.bluffCaught) {
    tilt += 0.2;
    confidence -= 0.2;
  }
  return { cheer, confidence, tilt };
}

export function afterHand(mood: Mood, outcome: Outcome): Mood {
  const decayed: Mood = {
    cheer: mood.cheer * DECAY,
    confidence: mood.confidence * DECAY,
    tilt: mood.tilt * DECAY,
    caution: mood.caution * DECAY,
    form: mood.form,
  };
  const next = shifted(decayed, outcomeEffect(outcome));
  next.form = clamp(FORM_KEEP * mood.form + FORM_GAIN * (outcome.netBb / FORM_SCALE_BB));
  return next;
}

export function afterSignals(mood: Mood, signals: readonly Signal[]): Mood {
  return signals.reduce((current, signal) => shifted(current, SIGNAL_EFFECTS[signal]), mood);
}

export function speakFactor(mood: Mood): number {
  return 1 + 0.25 * clamp((mood.cheer + mood.tilt) / 2);
}

const WORDS: Array<[keyof Mood, string, string | null]> = [
  ['cheer', 'in a good mood', 'glum'],
  ['confidence', 'confident', 'unsure of herself'],
  ['tilt', 'annoyed', null],
  ['caution', 'cautious', null],
  ['form', 'on a winning streak', 'on a losing streak'],
];

export function moodWords(mood: Mood): string[] {
  const found: Array<{ strength: number; word: string }> = [];
  for (const [axis, positive, negative] of WORDS) {
    const value = mood[axis];
    const word = value > 0 ? positive : negative;
    if (Math.abs(value) >= WORD_THRESHOLD && word !== null) {
      found.push({ strength: Math.abs(value), word });
    }
  }
  found.sort((a, b) => b.strength - a.strength);
  return found.slice(0, MAX_WORDS).map((entry) => entry.word);
}
