import type { Emotion, Octant, BiasKey, LoadReading, Part } from '../../../src/emotion/index.ts';

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

export const PART_LABEL: Readonly<Record<Part, string>> = {
  ...EMOTION_LABEL,
  mood: 'настроение',
};

export function strainText(load: LoadReading): string {
  const [top] = [...load.parts].sort((a, b) => b[1] - a[1]);
  const dominant =
    top !== undefined && load.overload > 0.05 ? `, в основном ${PART_LABEL[top[0]]}` : '';
  return `перегрузка ${load.overload.toFixed(2)}${dominant}, интенсивность ${load.intensity.toFixed(2)} при самообладании ${load.composure.toFixed(2)}, до игры доходит ${Math.round(load.reach * 100)}% (дисциплина ${load.discipline.toFixed(2)})`;
}

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

export const BIAS_LABEL: Readonly<Record<BiasKey, string>> = {
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
