import { describe, expect, it } from 'vitest';
import { readFeatures, releaseOpponent } from './features.ts';

describe('readFeatures', () => {
  it('keeps the coach, talk and the opponent choice hidden in the release', () => {
    expect(readFeatures('')).toEqual({ coach: false, talk: false, opponents: false });
  });

  it('turns on the features named in the link', () => {
    expect(readFeatures('?seed=1&features=coach,talk')).toEqual({
      coach: true,
      talk: true,
      opponents: false,
    });
    expect(readFeatures('?features=opponents').opponents).toBe(true);
  });
});

describe('releaseOpponent', () => {
  it('plays the v2 solver on a computer and the v1 solver on a phone', () => {
    expect(releaseOpponent('', true)).toBe('cfr-v2');
    expect(releaseOpponent('', false)).toBe('cfr');
  });

  it('takes an opponent named in the link and ignores an unknown one', () => {
    expect(releaseOpponent('?opponent=math', true)).toBe('math');
    expect(releaseOpponent('?opponent=cfr', true)).toBe('cfr');
    expect(releaseOpponent('?opponent=nobody', false)).toBe('cfr');
  });
});
