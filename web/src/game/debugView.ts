import { EMOTIONS, LOAD_SOURCES, STYLE_KEYS } from '../talk/index.ts';
import type {
  BigFive,
  Emotion,
  JournalEntry,
  LoadSource,
  Pad,
  Snapshot,
  Style,
  StyleKey,
} from '../talk/index.ts';
import { personalityOf } from './debug.ts';
import type { DebugDecision, DebugState, PersonalityChoice } from './debug.ts';

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
  experience: number;
  traits: DebugTraits | null;
  emotions: [Emotion, number][];
  mood: Pad | null;
  defaultMood: Pad | null;
  octant: Snapshot['octant'] | null;
  load: DebugLoad | null;
  sessionNetBb: number;
  pressure: number;
  engineStyle: [StyleKey, number][];
  sentStyle: Style | null;
  decision: DebugDecision | null;
  journal: JournalEntry[];
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
  | 'engineStyle'
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
  engineStyle: STYLE_KEYS.map((k) => [k, 1]),
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
    engineStyle: STYLE_KEYS.map((k) => [k, s.style[k]]),
  };
}

export function toDebugView(debug: DebugState): DebugView {
  const { snapshot, personality } = debug;
  const { bigFive, suppression, experience } = personalityOf(personality);
  return {
    personality,
    bigFive,
    suppression,
    experience,
    ...(snapshot === null ? CALM : feelingOf(snapshot)),
    sentStyle: debug.sentStyle,
    decision: debug.decision,
    journal: debug.journal,
  };
}
