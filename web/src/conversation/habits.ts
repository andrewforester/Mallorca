import type { StrengthClass } from '../persona/index.ts';

export type Situation = 'herBet' | 'herCall' | 'playerBet' | 'handWon' | 'handLost' | 'bluffCaught';

export interface Habit {
  speak: number;
}

export type Habits = Record<Situation, Record<StrengthClass, Habit>>;

const CLASSES: readonly StrengthClass[] = ['strong', 'medium', 'weak'];
const SITUATIONS: readonly Situation[] = [
  'herBet',
  'herCall',
  'playerBet',
  'handWon',
  'handLost',
  'bluffCaught',
];

const same = (speak: number): Record<StrengthClass, Habit> => ({
  strong: { speak },
  medium: { speak },
  weak: { speak },
});

export const BASE_HABITS: Habits = {
  herBet: {
    strong: { speak: 0.2 },
    medium: { speak: 0.35 },
    weak: { speak: 0.6 },
  },
  herCall: same(0.2),
  playerBet: {
    strong: { speak: 0.4 },
    medium: { speak: 0.4 },
    weak: { speak: 0.3 },
  },
  handWon: same(0.5),
  handLost: same(0.4),
  bluffCaught: same(0.9),
};

export function habitsAt(habits: Habits, mask: number): Habits {
  const result = {} as Habits;
  for (const situation of SITUATIONS) {
    const row = habits[situation];
    const neutral = CLASSES.reduce((sum, c) => sum + row[c].speak, 0) / CLASSES.length;
    const moved = {} as Record<StrengthClass, Habit>;
    for (const c of CLASSES) {
      moved[c] = { speak: row[c].speak + mask * (neutral - row[c].speak) };
    }
    result[situation] = moved;
  }
  return result;
}
