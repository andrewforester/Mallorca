import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { SHIPPED_STRATEGIES } from '../../src/cfr/index.ts';
import { BOTS, botFactory, botLabel, isBotName, prepareBots, styleOfName } from './bots.ts';
import { playPair } from './match.ts';

const file = `cfr:${fileURLToPath(SHIPPED_STRATEGIES.cfr.url)}`;

describe('a style after the bot name', () => {
  it('reads the axes after @ on top of the neutral style', () => {
    expect(styleOfName('cfr@sizing=1.5,stickiness=1.4')).toEqual({
      aggression: 1,
      bluff: 1,
      tightness: 1,
      sizing: 1.5,
      stickiness: 1.4,
    });
    expect(styleOfName('cfr')).toBeNull();
  });

  it('accepts a style only on a cfr bot, with known axes and positive numbers', () => {
    expect(isBotName('cfr@sizing=1.5')).toBe(true);
    expect(isBotName(`${file}@aggression=1.2,bluff=1.3`)).toBe(true);
    expect(isBotName('math@sizing=1.5')).toBe(false);
    expect(isBotName('cfr@height=2')).toBe(false);
    expect(isBotName('cfr@sizing=0')).toBe(false);
    expect(isBotName('cfr@sizing=big')).toBe(false);
    expect(isBotName('cfr@')).toBe(false);
  });

  it('labels the run with the axes', () => {
    expect(botLabel('cfr@sizing=1.5,stickiness=1.4')).toBe('cfr-sizing1.5-stickiness1.4');
    expect(botLabel('cfr:v2.mlcs.gz@sizing=0.7')).toBe('cfr-v2-sizing0.7');
  });

  it('plays the neutral style exactly like the plain bot and a styled one differently', async () => {
    await prepareBots(['cfr', 'cfr@sizing=1', `${file}@sizing=2,stickiness=2`]);
    const plain = playPair(BOTS.cfr, BOTS.math, 5, 1);
    expect(playPair(botFactory('cfr@sizing=1'), BOTS.math, 5, 1)).toEqual(plain);
    const pairs = [1, 2, 3, 4, 5, 6].map((i) =>
      playPair(botFactory(`${file}@sizing=2,stickiness=2`), BOTS.math, 5, i),
    );
    const neutral = [1, 2, 3, 4, 5, 6].map((i) => playPair(BOTS.cfr, BOTS.math, 5, i));
    expect(pairs).not.toEqual(neutral);
  }, 60_000);
});
