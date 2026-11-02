import { EMOTIONS } from '../emotion/index.ts';
import type { Emotion } from '../emotion/index.ts';
import type { SeatIndex } from '../engine/index.ts';
import type { PersonaView } from '../persona/index.ts';
import { occasionText, publicFacts } from './facts.ts';
import type { PublicFacts } from './facts.ts';
import type { Humour } from './humour.ts';
import type { Notable } from './summary.ts';
import type { Act, Occasion } from './types.ts';
import type { Claim, Verdict } from './verdict.ts';

export const HEARD_MIN = 0.15;
export const OVERLOAD_CUT = 0.6;
export const CUT_WORDS = 4;
export const BLUFF_PRIDE = 0.5;

export const ACT_WORDS: Readonly<Record<Act, { min: number; max: number }>> = {
  react: { min: 1, max: 3 },
  stall: { min: 1, max: 4 },
  deflect: { min: 1, max: 5 },
  concede: { min: 2, max: 5 },
  press: { min: 2, max: 6 },
  claim: { min: 2, max: 6 },
  complain: { min: 2, max: 7 },
  enjoy: { min: 2, max: 7 },
  tease: { min: 3, max: 8 },
  answer: { min: 3, max: 12 },
};

export interface Voice {
  emotion: Emotion | 'calm';
  intensity: number;
}

export interface SessionLine {
  hands: number;
  netBb: number;
  playerBluffsShown: number;
  playerAllIns: number;
  notable: Notable[];
}

export interface UtterancePlan {
  version: 2;
  act: Act;
  occasion: string;
  voice: Voice;
  words: { min: number; max: number };
  humour: Humour | null;
  claim: Claim | null;
  facts: PublicFacts;
  heard: string | null;
  session: SessionLine;
  handNumber: number;
  street: string;
  actionStreet: string;
  endsHand: boolean;
}

export interface PlanInput {
  verdict: Verdict;
  view: PersonaView;
  humour: Humour | null;
  session: SessionLine;
  seat: SeatIndex;
}

const round2 = (v: number): number => Math.round(v * 100) / 100;

function heardOf(view: PersonaView): Record<Emotion, number> {
  const open = 1 - view.mask;
  const acted = view.presenting?.stance === 'bluff' ? BLUFF_PRIDE * view.mask : 0;
  const heard = {} as Record<Emotion, number>;
  for (const e of EMOTIONS) {
    heard[e] = view.snapshot.emotions[e] * open;
  }
  heard.pride = Math.max(heard.pride, acted);
  return heard;
}

function occasionEmotion(occasion: Occasion): Emotion | null {
  let best: { emotion: Emotion; amount: number } | null = null;
  for (const i of occasion.impulses) {
    if (best === null || i.amount > best.amount) {
      best = i;
    }
  }
  return best?.emotion ?? null;
}

export function voiceOf(view: PersonaView, occasion: Occasion): Voice {
  const heard = heardOf(view);
  const own = occasionEmotion(occasion);
  if (own !== null && heard[own] >= HEARD_MIN) {
    return { emotion: own, intensity: round2(heard[own]) };
  }
  const strongest = EMOTIONS.reduce((a, b) => (heard[b] > heard[a] ? b : a));
  return heard[strongest] >= HEARD_MIN
    ? { emotion: strongest, intensity: round2(heard[strongest]) }
    : { emotion: 'calm', intensity: 0 };
}

export function wordsFor(
  act: Act,
  extraversion: number,
  overload: number,
): { min: number; max: number } {
  const { min, max: base } = ACT_WORDS[act];
  const t = (1 + extraversion) / 2;
  const max = Math.max(min, Math.round(base * (0.75 + 0.5 * t)));
  return { min, max: overload >= OVERLOAD_CUT ? Math.max(min, Math.min(max, CUT_WORDS)) : max };
}

export function planOf(input: PlanInput): UtterancePlan {
  const { verdict, view } = input;
  const { occasion } = verdict;
  const act = verdict.act ?? 'react';
  const facts = publicFacts(occasion, input.seat);
  return {
    version: 2,
    act,
    occasion: occasionText(occasion, facts),
    voice: voiceOf(view, occasion),
    words: wordsFor(act, view.personality.bigFive.extraversion, view.snapshot.load.overload),
    humour: input.humour,
    claim: verdict.claim?.claim ?? null,
    facts,
    heard: occasion.kind === 'playerSaid' ? occasion.text : null,
    session: input.session,
    handNumber: occasion.handNumber,
    street: occasion.street,
    actionStreet: occasion.actionStreet,
    endsHand: occasion.endsHand,
  };
}
