import type { Emotion, LoadSource, Octant, StyleKey } from '../../../src/emotion/index.ts';

export const EMOTION_LABEL: Readonly<Record<Emotion, string>> = {
  hope: 'надежда',
  fear: 'страх',
  joy: 'радость',
  distress: 'огорчение',
  relief: 'облегчение',
  disappointment: 'разочарование',
  pride: 'гордость',
  shame: 'стыд',
  anger: 'злость',
  injustice: 'несправедливость',
  surprise: 'удивление',
};

export const LOAD_LABEL: Readonly<Record<LoadSource, string>> = {
  anger: 'злость',
  injustice: 'несправедливость',
  shame: 'стыд',
  distress: 'огорчение',
  disappointment: 'разочарование',
  fear: 'страх',
  mood: 'плохое настроение',
  desperation: 'минус по сессии',
};

export const OCTANT_LABEL: Readonly<Record<Octant, string>> = {
  exuberant: 'воодушевление',
  bored: 'апатия',
  dependent: 'зависимость',
  disdainful: 'пренебрежение',
  relaxed: 'расслабленность',
  anxious: 'тревожность',
  docile: 'покорность',
  hostile: 'враждебность',
};

export const STYLE_LABEL: Readonly<Record<StyleKey, string>> = {
  aggression: 'Агрессия',
  looseness: 'Широта диапазона',
  bluff: 'Блеф',
  sizing: 'Размер ставок',
  stickiness: 'Коллы до конца',
};

export const ANCHOR_LABEL: Readonly<Record<string, string>> = {
  neutral: 'покой',
  content: 'тепло',
  joy: 'радость',
  smug: 'самодовольство',
  calm: 'расслабленность',
  sad: 'грусть',
  sulk: 'обида',
  irritated: 'раздражение',
  anger: 'злость',
  worry: 'сомнение',
  fear: 'тревога',
};
