import { describe, expect, it } from 'vitest';
import { parseCard, parseCards } from '../cards/index.ts';
import { CELLS, PAIRS, cellName, cellOf, foldGrid, pairCards, pairIndex } from './grid.ts';

describe('pairs and cells', () => {
  it('round-trips every pair index', () => {
    for (let i = 0; i < PAIRS; i++) {
      const [a, b] = pairCards(i);
      expect(a).toBeLessThan(b);
      expect(pairIndex(a, b)).toBe(i);
      expect(pairIndex(b, a)).toBe(i);
    }
  });

  it('puts suited hands above the diagonal and offsuit below', () => {
    const [as, ks, kd, ad] = [parseCard('As'), parseCard('Ks'), parseCard('Kd'), parseCard('Ad')];
    expect(cellName(cellOf(as, ks))).toBe('AKs');
    expect(cellName(cellOf(as, kd))).toBe('AKo');
    expect(cellName(cellOf(as, ad))).toBe('AA');
    expect(cellOf(as, ks)).toBe(1);
    expect(cellOf(as, kd)).toBe(13);
    expect(cellName(cellOf(parseCard('2c'), parseCard('2d')))).toBe('22');
    expect(cellOf(parseCard('2c'), parseCard('2d'))).toBe(CELLS - 1);
  });

  it('holds 6 combos per pair, 4 per suited and 12 per offsuit hand', () => {
    const counts = new Array<number>(CELLS).fill(0);
    for (let i = 0; i < PAIRS; i++) {
      const [a, b] = pairCards(i);
      counts[cellOf(a, b)] = (counts[cellOf(a, b)] ?? 0) + 1;
    }
    for (let cell = 0; cell < CELLS; cell++) {
      const row = Math.floor(cell / 13);
      const col = cell % 13;
      expect(counts[cell]).toBe(row === col ? 6 : row < col ? 4 : 12);
    }
  });
});

describe('foldGrid', () => {
  it('averages each column over the live pairs of a cell', () => {
    const values = new Float32Array(PAIRS * 2);
    const [as, ks, ah, kh] = [parseCard('As'), parseCard('Ks'), parseCard('Ah'), parseCard('Kh')];
    values[pairIndex(as, ks) * 2] = 1;
    values[pairIndex(ah, kh) * 2 + 1] = 1;
    const grid = foldGrid(values, 2, []);
    expect(grid[cellOf(as, ks)]).toEqual([0.25, 0.25]);
    expect(grid).toHaveLength(CELLS);
  });

  it('leaves out dead pairs and gives null to a cell with none alive', () => {
    const values = new Float32Array(PAIRS).fill(1);
    const [as, ks, ah, kh] = [parseCard('As'), parseCard('Ks'), parseCard('Ah'), parseCard('Kh')];
    values[pairIndex(as, ks)] = 0;
    const grid = foldGrid(values, 1, [ah, kh]);
    expect(grid[cellOf(as, ks)]?.[0]).toBeCloseTo(2 / 3, 10);
    const dead = foldGrid(values, 1, parseCards('Ac Ad Ah As'));
    expect(dead[cellOf(as, ah)]).toBeNull();
  });
});
