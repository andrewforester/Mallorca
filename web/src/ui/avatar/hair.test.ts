import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CHARACTERS } from '../../game/index.ts';
import { HAIR, HAIRSTYLES, hairBase, portraitOf } from './hair.ts';

describe('HAIR', () => {
  it('gives every character one of her hairstyles', () => {
    for (const character of CHARACTERS) expect(HAIRSTYLES).toContain(HAIR[character]);
  });

  it('keeps the side-swept fringe for Mallorca', () => {
    expect(HAIR.mallorca).toBe('side-swept');
  });

  it('ships every file of every hairstyle', () => {
    const files = ['hair.json', 'hair.bin', 'hair_cards.webp', 'scalp.webp', 'portrait.webp'];
    for (const key of HAIRSTYLES) {
      for (const file of files)
        expect(existsSync(resolve('public/avatar/her/hair', key, file)), `${key}/${file}`).toBe(true);
    }
  });
});

describe('hairBase and portraitOf', () => {
  it('place a hairstyle in the folder of her rig', () => {
    expect(hairBase('/her/', 'curly-bob')).toBe('/her/hair/curly-bob/');
    expect(portraitOf('/her/', 'updo-buns')).toBe('/her/hair/updo-buns/portrait.webp');
  });
});
