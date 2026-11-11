import type { PersonalityKey } from '../../game/index.ts';

export const HAIRSTYLES = ['side-swept', 'curly-bob', 'updo-buns', 'straight-bangs'] as const;
export type HairKey = (typeof HAIRSTYLES)[number];

export const HAIR: Readonly<Record<PersonalityKey, HairKey>> = {
  mallorca: 'side-swept',
  ingrid: 'updo-buns',
  mira: 'side-swept',
  nina: 'straight-bangs',
  lola: 'curly-bob',
  sol: 'curly-bob',
  rita: 'straight-bangs',
  vera: 'updo-buns',
  greta: 'updo-buns',
  boldSchemer: 'side-swept',
  nervousCareerist: 'updo-buns',
  lifeOfTheParty: 'curly-bob',
  caringActivist: 'updo-buns',
  toughBoss: 'updo-buns',
  hotheadBraggart: 'curly-bob',
  reliableCaptain: 'straight-bangs',
  fussyChatterbox: 'curly-bob',
  coldSceptic: 'updo-buns',
  gloomyRebel: 'straight-bangs',
  calmPhilosopher: 'side-swept',
  dreamyArtist: 'curly-bob',
  unshakableLoner: 'straight-bangs',
  suspiciousGrump: 'updo-buns',
  easygoingHomebody: 'side-swept',
  timidStickler: 'straight-bangs',
  nervousPragmatist: 'straight-bangs',
  curiousOptimist: 'curly-bob',
  noisyBully: 'side-swept',
  plainRealist: 'side-swept',
  quietTidy: 'updo-buns',
  softMiddle: 'side-swept',
  calmCurious: 'curly-bob',
  reservedConservative: 'updo-buns',
  neutral: 'side-swept',
};

export const hairBase = (rig: string, key: HairKey): string => `${rig}hair/${key}/`;
export const portraitOf = (avatar: string, key: HairKey): string =>
  `${avatar}portraits/${key}.webp`;
