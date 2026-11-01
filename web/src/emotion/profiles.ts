import type { Personality } from './personality.ts';

export const MALLORCA: Personality = {
  bigFive: {
    openness: 0.4,
    conscientiousness: 0.2,
    extraversion: 0.4,
    agreeableness: 0.5,
    neuroticism: 0.1,
  },
  suppression: 0.35,
  experience: 0.7,
};

export const PERSONALITIES = {
  mallorca: MALLORCA,
  mira: {
    bigFive: {
      openness: 0.3,
      conscientiousness: 0.2,
      extraversion: 0.2,
      agreeableness: 0.4,
      neuroticism: -0.1,
    },
    suppression: 0.3,
    experience: 0.5,
  },
  ingrid: {
    bigFive: {
      openness: -0.1,
      conscientiousness: 0.7,
      extraversion: -0.5,
      agreeableness: -0.3,
      neuroticism: -0.6,
    },
    suppression: 0.85,
    experience: 0.9,
  },
  lola: {
    bigFive: {
      openness: 0.6,
      conscientiousness: -0.4,
      extraversion: 0.9,
      agreeableness: 0.5,
      neuroticism: 0.5,
    },
    suppression: 0.08,
    experience: 0.2,
  },
  nina: {
    bigFive: {
      openness: 0.1,
      conscientiousness: 0.3,
      extraversion: -0.3,
      agreeableness: 0.4,
      neuroticism: 0.8,
    },
    suppression: 0.55,
    experience: 0,
  },
} satisfies Record<string, Personality>;

export type PersonalityKey = keyof typeof PERSONALITIES;
