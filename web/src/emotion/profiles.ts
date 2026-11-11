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
  ingrid: character([0.16, 0.62, -0.16, -0.37, -0.47], 0.85),
  mira: character([0.36, 0.12, 0.2, 0.53, 0.06], 0.3),
  nina: character([-0.23, 0.34, -0.32, 0.14, 0.41], 0.55),
  lola: character([0.25, -0.48, 0.65, 0.18, 0.55], 0.08),
  sol: character([0.36, -0.41, 0.53, 0.55, -0.16], 0.2),
  rita: character([0.41, -0.3, 0.36, -0.35, -0.27], 0.2),
  vera: character([-0.38, 0.61, 0.43, -0.56, 0.5], 0.5),
  greta: character([-0.38, 0.35, -0.43, 0.14, 0.13], 0.6),
  boldSchemer: character([0.43, -0.29, 0.34, -0.35, -0.34], 0.05),
  nervousCareerist: character([0.49, 0.67, 0.54, -0.63, 0.63], 0.35),
  lifeOfTheParty: character([0.4, -0.45, 0.45, 0.71, -0.54], 0.05),
  caringActivist: character([0.46, 0.5, 0.65, 0.43, 0.43], 0.35),
  toughBoss: character([-0.35, 0.72, 0.3, -0.65, -0.5], 0.35),
  hotheadBraggart: character([-0.72, -0.38, 0.59, -0.59, 0.55], 0.05),
  reliableCaptain: character([-0.38, 0.59, 0.41, 0.4, -0.7], 0.35),
  fussyChatterbox: character([-0.71, -0.55, 0.7, 0.47, 0.36], 0.05),
  coldSceptic: character([0.71, 0.55, -0.7, -0.47, -0.36], 0.83),
  gloomyRebel: character([0.38, -0.59, -0.41, -0.4, 0.7], 0.35),
  calmPhilosopher: character([0.72, 0.38, -0.59, 0.59, -0.55], 0.83),
  dreamyArtist: character([0.35, -0.72, -0.3, 0.65, 0.5], 0.35),
  unshakableLoner: character([-0.46, -0.5, -0.65, -0.43, -0.43], 0.35),
  suspiciousGrump: character([-0.4, 0.45, -0.45, -0.71, 0.54], 0.83),
  easygoingHomebody: character([-0.49, -0.67, -0.54, 0.63, -0.63], 0.35),
  timidStickler: character([-0.43, 0.29, -0.34, 0.35, 0.34], 0.83),
  nervousPragmatist: character([-0.52, -0.32, 0.24, -0.3, 0.52], 0.18),
  curiousOptimist: character([0.47, -0.07, 0.27, -0.22, -0.23], 0.24),
  noisyBully: character([0.36, -0.33, 0.45, -0.39, 0.1], 0.05),
  plainRealist: character([-0.25, -0.1, -0.07, 0.08, 0.04], 0.34),
  quietTidy: character([-0.22, 0.29, -0.48, 0.43, -0.2], 0.59),
  softMiddle: character([0.17, 0.21, -0.17, 0.16, -0.24], 0.46),
  calmCurious: character([0.58, 0.12, -0.03, 0.11, -0.45], 0.39),
  reservedConservative: character([-0.4, 0.25, -0.4, 0.32, 0.05], 0.54),
  neutral: character([0, 0, 0, 0, 0], 0.3),
} satisfies Record<string, Personality>;

export type PersonalityKey = keyof typeof PERSONALITIES;
