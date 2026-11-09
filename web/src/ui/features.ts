import { opponentsFor } from '../game/index.ts';
import type { Opponent } from '../game/index.ts';

export interface Features {
  coach: boolean;
  talk: boolean;
  opponents: boolean;
}

export const ALL_FEATURES: Features = { coach: true, talk: true, opponents: true };

export function readFeatures(search: string): Features {
  const named = new URLSearchParams(search).get('features')?.split(',') ?? [];
  return {
    coach: named.includes('coach'),
    talk: named.includes('talk'),
    opponents: named.includes('opponents'),
  };
}

export function releaseOpponent(search: string, finePointer: boolean): Opponent {
  const named = new URLSearchParams(search).get('opponent');
  const known = opponentsFor(true).find((opponent) => opponent === named);
  return known ?? (finePointer ? 'cfr-v2' : 'cfr');
}
