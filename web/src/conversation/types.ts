import type { Impulse } from '../emotion/index.ts';
import type { HandState, StrengthClass } from '../persona/index.ts';

export const ACTS = [
  'react',
  'claim',
  'press',
  'stall',
  'deflect',
  'concede',
  'complain',
  'enjoy',
  'tease',
  'answer',
] as const;

export type Act = (typeof ACTS)[number];

export type OccasionKind =
  'herBet' | 'herCall' | 'herFold' | 'playerRaise' | 'card' | 'handEnded' | 'playerSaid';

export type HandEnd = 'bluffCaught' | 'playerBluffShown' | 'won' | 'lost';

export interface Occasion {
  kind: OccasionKind;
  end: HandEnd | null;
  impulses: Impulse[];
  journalIds: number[];
  handNumber: number;
  street: string;
  actionStreet: string;
  strength: StrengthClass;
  endsHand: boolean;
  hand: HandState;
  text: string | null;
  previous: OccasionKind | null;
}
