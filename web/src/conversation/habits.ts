import type { StrengthClass } from '../persona/index.ts';

export type Situation = 'herBet' | 'herCall' | 'playerBet' | 'handWon' | 'handLost' | 'bluffCaught';
export type Level = 'obvious' | 'subtle' | 'hidden';

export interface Habit {
  speak: number;
  honest: number;
}

export type Habits = Record<Situation, Record<StrengthClass, Habit>>;

const NEUTRAL_HONEST = 0.5;
const CLASSES: readonly StrengthClass[] = ['strong', 'medium', 'weak'];
const SITUATIONS: readonly Situation[] = [
  'herBet',
  'herCall',
  'playerBet',
  'handWon',
  'handLost',
  'bluffCaught',
];
const TOWARD_NEUTRAL: Record<Level, number> = { obvious: 0, subtle: 0.5, hidden: 0.9 };

const same = (speak: number, honest = NEUTRAL_HONEST): Record<StrengthClass, Habit> => ({
  strong: { speak, honest },
  medium: { speak, honest },
  weak: { speak, honest },
});

export const BASE_HABITS: Habits = {
  herBet: {
    strong: { speak: 0.2, honest: 0.3 },
    medium: { speak: 0.35, honest: 0.5 },
    weak: { speak: 0.6, honest: 0.2 },
  },
  herCall: same(0.2),
  playerBet: {
    strong: { speak: 0.4, honest: 0.2 },
    medium: { speak: 0.4, honest: 0.7 },
    weak: { speak: 0.3, honest: 0.6 },
  },
  handWon: same(0.5),
  handLost: same(0.4),
  bluffCaught: same(0.9),
};

export function habitsAt(habits: Habits, level: Level): Habits {
  const t = TOWARD_NEUTRAL[level];
  const result = {} as Habits;
  for (const situation of SITUATIONS) {
    const row = habits[situation];
    const neutralSpeak = CLASSES.reduce((sum, c) => sum + row[c].speak, 0) / CLASSES.length;
    const moved = {} as Record<StrengthClass, Habit>;
    for (const c of CLASSES) {
      moved[c] = {
        speak: row[c].speak + t * (neutralSpeak - row[c].speak),
        honest: row[c].honest + t * (NEUTRAL_HONEST - row[c].honest),
      };
    }
    result[situation] = moved;
  }
  return result;
}
