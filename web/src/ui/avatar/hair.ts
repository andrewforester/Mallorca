import type { PersonalityKey } from '../../game/index.ts';

export const HAIRSTYLES = ['side-swept', 'curly-bob', 'updo-buns', 'straight-bangs'] as const;
export type HairKey = (typeof HAIRSTYLES)[number];

export const HAIR: Readonly<Record<PersonalityKey, HairKey>> = {
  mallorca: 'side-swept',
  mira: 'side-swept',
  ingrid: 'updo-buns',
  lola: 'curly-bob',
  nina: 'straight-bangs',
};

export const hairBase = (rig: string, key: HairKey): string => `${rig}hair/${key}/`;
export const portraitOf = (avatar: string, key: HairKey): string =>
  `${avatar}portraits/${key}.webp`;
