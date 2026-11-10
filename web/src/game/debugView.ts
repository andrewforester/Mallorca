import { EMOTIONS, LOAD_SOURCES, BIAS_KEYS, styleOf } from '../persona/index.ts';
import type {
  BigFive,
  Emotion,
  LoadSource,
  Pad,
  Snapshot,
  Bias,
  BiasKey,
} from '../persona/index.ts';
import { personalityOf } from './debug.ts';
import type { ConversationTrace } from './conversationTrace.ts';
import type { DebugDecision, DebugEntry, DebugState, PersonalityChoice } from './debug.ts';

export interface DebugTraits {
  defaultMood: Pad;
  composure: number;
  discipline: number;
  gains: [Emotion, number][];
}

export interface DebugLoad {
  total: number;
  sources: [LoadSource, number][];
  overload: number;
  composure: number;
  leakage: number;
}

export interface DebugView {
  personality: PersonalityChoice;
  bigFive: BigFive;
  suppression: number;
  control: number;
  traits: DebugTraits | null;
  emotions: [Emotion, number][];
  mood: Pad | null;
  defaultMood: Pad | null;
  octant: Snapshot['octant'] | null;
  load: DebugLoad | null;
  sessionNetBb: number;
  pressure: number;
  engineBias: [BiasKey, number][];
  baseline: [BiasKey, number][];
  sentBias: Bias | null;
  decision: DebugDecision | null;
  journal: DebugEntry[];
  conversation: ConversationTrace;
}

function traitsOf(s: Snapshot): DebugTraits {
  const { defaultMood, composure, discipline, gains } = s.traits;
  return { defaultMood, composure, discipline, gains: EMOTIONS.map((e) => [e, gains[e]]) };
}

function loadOf(s: Snapshot): DebugLoad {
  const { load, overload, leakage, parts } = s.load;
  return {
    total: load,
    sources: LOAD_SOURCES.map((source) => [source, parts[source]]),
    overload,
    composure: s.traits.composure,
    leakage,
  };
}

type FeelingPart = Pick<
  DebugView,
  | 'traits'
  | 'emotions'
  | 'mood'
  | 'defaultMood'
  | 'octant'
  | 'load'
  | 'sessionNetBb'
  | 'pressure'
  | 'engineBias'
>;

const CALM: FeelingPart = {
  traits: null,
  emotions: EMOTIONS.map((e) => [e, 0]),
  mood: null,
  defaultMood: null,
  octant: null,
  load: null,
  sessionNetBb: 0,
  pressure: 0,
  engineBias: BIAS_KEYS.map((k) => [k, 1]),
};

function feelingOf(s: Snapshot): FeelingPart {
  return {
    traits: traitsOf(s),
    emotions: EMOTIONS.map((e) => [e, s.emotions[e]]),
    mood: s.mood,
    defaultMood: s.traits.defaultMood,
    octant: s.octant,
    load: loadOf(s),
    sessionNetBb: s.sessionNetBb,
    pressure: s.pressure,
    engineBias: BIAS_KEYS.map((k) => [k, s.bias[k]]),
  };
}

export function toDebugView(debug: DebugState): DebugView {
  const { snapshot, personality } = debug;
  const { bigFive, suppression, control } = personalityOf(personality);
  const style = styleOf(bigFive);
  return {
    personality,
    bigFive,
    suppression,
    control,
    baseline: BIAS_KEYS.map((k) => [k, style[k]]),
    ...(snapshot === null ? CALM : feelingOf(snapshot)),
    sentBias: debug.sentBias,
    decision: debug.decision,
    journal: debug.journal,
    conversation: debug.conversation,
  };
}
