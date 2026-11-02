export const BIAS_KEYS = ['aggression', 'looseness', 'bluff', 'sizing', 'stickiness'] as const;
export type BiasKey = (typeof BIAS_KEYS)[number];
export type PlayBias = Readonly<Record<BiasKey, number>>;

export const NEUTRAL_PLAY_BIAS: PlayBias = {
  aggression: 1,
  looseness: 1,
  bluff: 1,
  sizing: 1,
  stickiness: 1,
};
