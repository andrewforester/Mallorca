import { describe, expect, it } from 'vitest';
import { opponentsFor, OPPONENTS } from './opponent.ts';

describe('opponents', () => {
  it('lists the math bot and both blueprints', () => {
    expect(OPPONENTS).toEqual(['math', 'cfr', 'cfr-v2']);
  });

  it('keeps the large v2 download off touch screens', () => {
    expect(opponentsFor(true)).toEqual(['math', 'cfr', 'cfr-v2']);
    expect(opponentsFor(false)).toEqual(['math', 'cfr']);
  });
});
