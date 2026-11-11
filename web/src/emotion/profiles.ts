import type { BigFive, Personality } from './personality.ts';

type Traits = readonly [number, number, number, number, number];

const character = ([o, c, e, a, n]: Traits, suppression: number): Personality => ({
  bigFive: {
    openness: o,
    conscientiousness: c,
    extraversion: e,
    agreeableness: a,
    neuroticism: n,
  } satisfies BigFive,
  suppression,
});

export const MALLORCA: Personality = character([0.4, 0.2, 0.4, 0.5, 0.1], 0.35);

export const PERSONALITIES = {
  mallorca: MALLORCA,
  ingrid: character([0.2, 0.8, -0.2, -0.4, -0.8], 0.85),
  mira: character([0.3, 0.2, 0.2, 0.9, 0.1], 0.3),
  nina: character([-0.3, 0.8, -0.4, 0.3, 0.8], 0.55),
  lola: character([0.5, -0.6, 0.7, 0.2, 0.8], 0.08),
  sol: character([0.8, -0.5, 0.9, 0.5, -0.2], 0.2),
  rita: character([0.8, -0.7, 0.9, -0.6, -0.4], 0.2),
  vera: character([-0.4, 0.8, 0.4, -0.5, 0.6], 0.5),
  greta: character([-0.6, 0.5, -0.8, 0.2, 0.2], 0.6),
  boldSchemer: character([0.8, -0.8, 0.8, -0.8, -0.8], 0.05),
  nervousCareerist: character([0.8, 0.8, 0.8, -0.8, 0.8], 0.35),
  lifeOfTheParty: character([0.8, -0.8, 0.8, 0.8, -0.8], 0.05),
  caringActivist: character([0.8, 0.8, 0.8, 0.8, 0.8], 0.35),
  toughBoss: character([-0.8, 0.8, 0.8, -0.8, -0.8], 0.35),
  hotheadBraggart: character([-0.8, -0.8, 0.8, -0.8, 0.8], 0.05),
  reliableCaptain: character([-0.8, 0.8, 0.8, 0.8, -0.8], 0.35),
  fussyChatterbox: character([-0.8, -0.8, 0.8, 0.8, 0.8], 0.05),
  coldSceptic: character([0.8, 0.8, -0.8, -0.8, -0.8], 0.83),
  gloomyRebel: character([0.8, -0.8, -0.8, -0.8, 0.8], 0.35),
  calmPhilosopher: character([0.8, 0.8, -0.8, 0.8, -0.8], 0.83),
  dreamyArtist: character([0.8, -0.8, -0.8, 0.8, 0.8], 0.35),
  unshakableLoner: character([-0.8, -0.8, -0.8, -0.8, -0.8], 0.35),
  suspiciousGrump: character([-0.8, 0.8, -0.8, -0.8, 0.8], 0.83),
  easygoingHomebody: character([-0.8, -0.8, -0.8, 0.8, -0.8], 0.35),
  timidStickler: character([-0.8, 0.8, -0.8, 0.8, 0.8], 0.83),
  nervousPragmatist: character([-0.52, -0.32, 0.24, -0.3, 0.52], 0.18),
  curiousOptimist: character([0.57, -0.08, 0.28, -0.22, -0.23], 0.24),
  noisyBully: character([0.47, -0.43, 0.6, -0.52, 0.06], 0.05),
  plainRealist: character([-0.25, -0.1, -0.07, 0.08, 0.04], 0.34),
  quietTidy: character([-0.22, 0.29, -0.5, 0.44, -0.2], 0.59),
  softMiddle: character([0.17, 0.21, -0.17, 0.16, -0.24], 0.46),
  calmCurious: character([0.7, 0.1, -0.02, 0.1, -0.53], 0.39),
  reservedConservative: character([-0.42, 0.25, -0.4, 0.32, 0.05], 0.54),
  neutral: character([0, 0, 0, 0, 0], 0.3),
} satisfies Record<string, Personality>;

export type PersonalityKey = keyof typeof PERSONALITIES;
