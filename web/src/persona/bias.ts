export interface Bias {
  aggression: number;
  bluff: number;
  tightness: number;
  sizing: number;
  stickiness: number;
}

export const NEUTRAL_BIAS: Bias = {
  aggression: 1,
  bluff: 1,
  tightness: 1,
  sizing: 1,
  stickiness: 1,
};
