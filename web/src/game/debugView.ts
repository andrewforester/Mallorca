import { EMOTIONS, BIAS_KEYS, pushOf, styleOf } from '../persona/index.ts';
import type { BigFive, Emotion, Pad, Part, Snapshot, Bias, BiasKey } from '../persona/index.ts';
import { personalityOf } from './debug.ts';
import type { ConversationTrace } from './conversationTrace.ts';
import type { DebugDecision, DebugEntry, DebugState, PersonalityChoice } from './debug.ts';

export interface DebugTraits {
  defaultMood: Pad;
  composure: number;
  discipline: number;
  selfBlame: number;
  coping: number;
  urgency: number;
  gains: [Emotion, number][];
}

export interface DebugLoad {
  intensity: number;
  composure: number;
  strain: number;
  overload: number;
  reach: number;
  parts: [Part, number][];
}

export interface DebugView {
  personality: PersonalityChoice;
  bigFive: BigFive;
  suppression: number;
  traits: DebugTraits | null;
  emotions: [Emotion, number][];
  mood: Pad | null;
  approach: number | null;
  certainty: number | null;
  defaultMood: Pad | null;
  octant: Snapshot['octant'] | null;
  load: DebugLoad | null;
  sessionNetBb: number;
  pressure: number;
  engineBias: [BiasKey, number][];
  push: [BiasKey, number][];
  baseline: [BiasKey, number][];
  sentBias: Bias | null;
  decision: DebugDecision | null;
  journal: DebugEntry[];
  conversation: ConversationTrace;
}

function traitsOf(s: Snapshot): DebugTraits {
  const { defaultMood, composure, discipline, selfBlame, coping, urgency, gains } = s.traits;
  return {
    defaultMood,
    composure,
    discipline,
    selfBlame,
    coping,
    urgency,
    gains: EMOTIONS.map((e) => [e, gains[e]]),
  };
}

function loadOf(s: Snapshot): DebugLoad {
  const { intensity, composure, strain, overload, reach, parts } = s.load;
  return { intensity, composure, strain, overload, reach, parts };
}

function pushRows(s: Snapshot): [BiasKey, number][] {
  const push = pushOf(s.affect, s.load.reach, s.load.intensity);
  return BIAS_KEYS.map((k) => [k, push[k]]);
}

type FeelingPart = Pick<
  DebugView,
  | 'traits'
  | 'emotions'
  | 'mood'
  | 'approach'
  | 'certainty'
  | 'defaultMood'
  | 'octant'
  | 'load'
  | 'sessionNetBb'
  | 'pressure'
  | 'engineBias'
  | 'push'
>;

const CALM: FeelingPart = {
  traits: null,
  emotions: EMOTIONS.map((e) => [e, 0]),
  mood: null,
  approach: null,
  certainty: null,
  defaultMood: null,
  octant: null,
  load: null,
  sessionNetBb: 0,
  pressure: 0,
  engineBias: BIAS_KEYS.map((k) => [k, 1]),
  push: BIAS_KEYS.map((k) => [k, 0]),
};

function feelingOf(s: Snapshot): FeelingPart {
  return {
    traits: traitsOf(s),
    emotions: EMOTIONS.map((e) => [e, s.emotions[e]]),
    mood: s.mood,
    approach: s.approach,
    certainty: s.certainty,
    defaultMood: s.traits.defaultMood,
    octant: s.octant,
    load: loadOf(s),
    sessionNetBb: s.sessionNetBb,
    pressure: s.pressure,
    engineBias: BIAS_KEYS.map((k) => [k, s.bias[k]]),
    push: pushRows(s),
  };
}

export function toDebugView(debug: DebugState): DebugView {
  const { snapshot, personality } = debug;
  const { bigFive, suppression } = personalityOf(personality);
  const style = styleOf(bigFive);
  return {
    personality,
    bigFive,
    suppression,
    baseline: BIAS_KEYS.map((k) => [k, style[k]]),
    ...(snapshot === null ? CALM : feelingOf(snapshot)),
    sentBias: debug.sentBias,
    decision: debug.decision,
    journal: debug.journal,
    conversation: debug.conversation,
  };
}
