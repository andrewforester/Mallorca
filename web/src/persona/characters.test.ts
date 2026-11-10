import { describe, expect, it } from 'vitest';
import { PERSONALITIES } from '../emotion/index.ts';
import { CHARACTER_SHEETS } from './characters.ts';

describe('CHARACTER_SHEETS', () => {
  it('has a sheet for every personality, in the same order', () => {
    expect(Object.keys(CHARACTER_SHEETS)).toEqual(Object.keys(PERSONALITIES));
  });

  it('gives every character a distinct name, a life, a person and a poker style', () => {
    const names = Object.values(CHARACTER_SHEETS).map((s) => s.name);
    expect(new Set(names).size).toBe(names.length);
    for (const sheet of Object.values(CHARACTER_SHEETS)) {
      for (const text of [sheet.name, sheet.short, sheet.about, sheet.poker]) {
        expect(text.trim().length).toBeGreaterThan(0);
        expect(text).not.toMatch(/[–—]/);
        expect(text).not.toMatch(/\b[A-Z]{2,}\b/);
      }
      expect(sheet.short[0]).toBe(sheet.short[0]?.toLowerCase());
      expect(sheet.about).toMatch(/\.$/);
      expect(sheet.poker).toMatch(/\.$/);
    }
  });

  it('keeps the names of the characters of the start screen', () => {
    expect(CHARACTER_SHEETS.mallorca.name).toBe('Mallorca');
    expect(CHARACTER_SHEETS.greta.name).toBe('Greta');
    expect(CHARACTER_SHEETS.fussyChatterbox.short).toBe('a chatty, good-natured retiree');
    expect(CHARACTER_SHEETS.caringActivist.short).toBe('a tired mum of three');
  });
});
