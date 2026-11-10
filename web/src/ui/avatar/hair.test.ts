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

  it('gives Nina the straight bangs she wore first', () => {
    expect(HAIR.nina).toBe('straight-bangs');
  });

  it('ships every file of every hairstyle', () => {
    const files = ['hair.json', 'hair.bin', 'hair_cards.webp', 'scalp.webp'];
    for (const key of HAIRSTYLES) {
      for (const file of files)
        expect(existsSync(resolve('public/avatar/her/hair', key, file)), `${key}/${file}`).toBe(
          true,
        );
      expect(existsSync(resolve('public/avatar/portraits', `${key}.webp`)), key).toBe(true);
    }
  });
});

describe('hairBase and portraitOf', () => {
  it('place a hairstyle in the folder of her rig and its still beside the models', () => {
    expect(hairBase('/her/', 'curly-bob')).toBe('/her/hair/curly-bob/');
    expect(portraitOf('/avatar/', 'updo-buns')).toBe('/avatar/portraits/updo-buns.webp');
  });
});
