import { beforeAll, describe, expect, it } from 'vitest';
import { PERSONALITIES, styleOf, toBotBias } from '../../src/persona/index.ts';
import { botFactory, botLabel, isBotName, prepareBots } from './bots.ts';
import { playPair } from './match.ts';
import { profileOfName, styleBiasOf } from './profileBots.ts';

describe('profileOfName', () => {
  it('reads a profile bot with its overrides', () => {
    expect(profileOfName('style:lola')).toEqual({
      kind: 'style',
      personality: PERSONALITIES.lola,
      label: 'style-lola',
    });
    expect(profileOfName('persona:nina@experience=0.9,control=0.1')).toEqual({
      kind: 'persona',
      personality: { ...PERSONALITIES.nina, experience: 0.9, control: 0.1 },
      label: 'persona-nina-experience0.9-control0.1',
    });
    expect(profileOfName('persona:ingrid@neuroticism=-0.5')?.personality.bigFive).toEqual({
      ...PERSONALITIES.ingrid.bigFive,
      neuroticism: -0.5,
    });
  });

  it.each([
    'style:nobody',
    'persona:lola@luck=1',
    'persona:lola@experience=1.5',
    'persona:lola@control=-0.1',
    'persona:lola@neuroticism=2',
    'persona:lola@experience=',
    'persona:',
    'cfr',
  ])('does not read %s', (name) => {
    expect(profileOfName(name)).toBeNull();
  });

  it('makes the bot names known to the arena', () => {
    expect(isBotName('persona:lola@experience=0.9,control=0.1')).toBe(true);
    expect(isBotName('style:mallorca')).toBe(true);
    expect(isBotName('persona:lola@experience=2')).toBe(false);
    expect(botLabel('persona:lola@experience=0.9,control=0.1')).toBe(
      'persona-lola-experience0.9-control0.1',
    );
  });
});

describe('styleBiasOf', () => {
  it('keeps an extreme style inside the range of the bias, as her persona does at rest', () => {
    const wild = profileOfName(
      'style:lola@openness=1,extraversion=1,conscientiousness=-1,agreeableness=-1,neuroticism=-1,experience=0',
    );
    const bias = styleBiasOf(wild!.personality);
    expect(bias.aggression).toBe(2);
    expect(bias.bluff).toBeLessThanOrEqual(2);
    expect(bias.tightness).toBeGreaterThanOrEqual(0.5);
    const lola = PERSONALITIES.lola;
    expect(styleBiasOf(lola)).toEqual(toBotBias(styleOf(lola.bigFive, lola.experience)));
  });
});

describe('profile bots', () => {
  beforeAll(() => prepareBots(['style:lola', 'persona:nina']));

  it('a style bot plays its natural style as a constant bias', () => {
    const lola = PERSONALITIES.lola;
    const bias = toBotBias(styleOf(lola.bigFive, lola.experience));
    const styled = playPair(botFactory('style:lola'), botFactory('cfr'), 3, 0, 20);
    const fixed = playPair(botFactory(`cfr@${axes(bias)}`), botFactory('cfr'), 3, 0, 20);
    expect(styled).toEqual(fixed);
  });

  it('a persona bot plays differently from its constant style', () => {
    const nina = PERSONALITIES.nina;
    const bias = toBotBias(styleOf(nina.bigFive, nina.experience));
    const felt = playPair(botFactory('persona:nina'), botFactory('always-raise'), 2, 0, 40);
    const fixed = playPair(botFactory(`cfr@${axes(bias)}`), botFactory('always-raise'), 2, 0, 40);
    expect(felt.hands).toHaveLength(80);
    expect(felt.hands).not.toEqual(fixed.hands);
  }, 60_000);
});

function axes(bias: ReturnType<typeof toBotBias>): string {
  return Object.entries(bias)
    .map(([k, v]) => `${k}=${v}`)
    .join(',');
}
