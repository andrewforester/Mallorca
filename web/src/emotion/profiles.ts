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
};

export const PERSONALITIES = {
  mallorca: MALLORCA,
  ingrid: {
    bigFive: {
      openness: 0.2,
      conscientiousness: 0.8,
      extraversion: -0.2,
      agreeableness: -0.4,
      neuroticism: -0.8,
    },
    suppression: 0.85,
  },
  mira: {
    bigFive: {
      openness: 0.3,
      conscientiousness: 0.2,
      extraversion: 0.2,
      agreeableness: 0.9,
      neuroticism: 0.1,
    },
    suppression: 0.3,
  },
  nina: {
    bigFive: {
      openness: -0.3,
      conscientiousness: 0.8,
      extraversion: -0.4,
      agreeableness: 0.3,
      neuroticism: 0.8,
    },
    suppression: 0.55,
  },
  lola: {
    bigFive: {
      openness: 0.5,
      conscientiousness: -0.6,
      extraversion: 0.7,
      agreeableness: 0.2,
      neuroticism: 0.8,
    },
    suppression: 0.08,
  },
  sol: {
    bigFive: {
      openness: 0.8,
      conscientiousness: -0.5,
      extraversion: 0.9,
      agreeableness: 0.5,
      neuroticism: -0.2,
    },
    suppression: 0.2,
  },
  rita: {
    bigFive: {
      openness: 0.8,
      conscientiousness: -0.7,
      extraversion: 0.9,
      agreeableness: -0.6,
      neuroticism: -0.4,
    },
    suppression: 0.2,
  },
  vera: {
    bigFive: {
      openness: -0.4,
      conscientiousness: 0.8,
      extraversion: 0.4,
      agreeableness: -0.5,
      neuroticism: 0.6,
    },
    suppression: 0.5,
  },
  greta: {
    bigFive: {
      openness: -0.6,
      conscientiousness: 0.5,
      extraversion: -0.8,
      agreeableness: 0.2,
      neuroticism: 0.2,
    },
    suppression: 0.6,
  },
  neutral: {
    bigFive: {
      openness: 0,
      conscientiousness: 0,
      extraversion: 0,
      agreeableness: 0,
      neuroticism: 0,
    },
    suppression: 0.3,
  },
} satisfies Record<string, Personality>;

export type PersonalityKey = keyof typeof PERSONALITIES;
