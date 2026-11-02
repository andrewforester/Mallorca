import { describe, expect, it } from 'vitest';
import { PRESENTING_EFFORT } from '../../src/persona/index.ts';
import { actingEffort } from './acting.ts';

describe('actingEffort', () => {
  it('takes the effort of what she presents', () => {
    expect(actingEffort(null)).toBe(0);
    expect(actingEffort('strong')).toBe(PRESENTING_EFFORT.bluff);
    expect(actingEffort('weak')).toBe(PRESENTING_EFFORT.hide);
  });
});
