import { describe, expect, it, vi } from 'vitest';
import { handleKey } from './keyboard.ts';

function handlers(enabled: boolean) {
  return {
    enabled,
    fold: vi.fn(),
    passive: vi.fn(),
    raise: vi.fn(),
    adjust: vi.fn(),
    preset: vi.fn(),
    confirm: vi.fn(() => true),
    back: vi.fn(() => true),
  };
}

describe('handleKey', () => {
  it('maps f, c and r to fold, passive and raise when enabled', () => {
    const h = handlers(true);
    expect(handleKey({ key: 'f' }, h)).toBe(true);
    expect(handleKey({ key: 'C' }, h)).toBe(true);
    expect(handleKey({ key: 'r' }, h)).toBe(true);
    expect(h.fold).toHaveBeenCalledTimes(1);
    expect(h.passive).toHaveBeenCalledTimes(1);
    expect(h.raise).toHaveBeenCalledTimes(1);
  });

  it('maps Enter to confirm and Escape to back', () => {
    const h = handlers(true);
    expect(handleKey({ key: 'Enter' }, h)).toBe(true);
    expect(handleKey({ key: 'Escape' }, h)).toBe(true);
    expect(h.confirm).toHaveBeenCalledTimes(1);
    expect(h.back).toHaveBeenCalledTimes(1);
  });

  it('maps arrows to slider steps', () => {
    const h = handlers(true);
    handleKey({ key: 'ArrowRight' }, h);
    handleKey({ key: 'ArrowDown' }, h);
    expect(h.adjust.mock.calls).toEqual([[1], [-1]]);
  });

  it('maps plus and minus to slider steps', () => {
    const h = handlers(true);
    for (const key of ['+', '=', '-', '_']) {
      expect(handleKey({ key }, h)).toBe(true);
    }
    expect(h.adjust.mock.calls).toEqual([[1], [1], [-1], [-1]]);
  });

  it('maps h, p and a to the half pot, pot and all-in presets', () => {
    const h = handlers(true);
    for (const key of ['h', 'P', 'a', 'H', 'p', 'A']) {
      expect(handleKey({ key }, h)).toBe(true);
    }
    expect(h.preset.mock.calls).toEqual([
      ['half'],
      ['pot'],
      ['allin'],
      ['half'],
      ['pot'],
      ['allin'],
    ]);
  });

  it('does nothing when disabled', () => {
    const h = handlers(false);
    expect(handleKey({ key: 'f' }, h)).toBe(false);
    expect(handleKey({ key: 'c' }, h)).toBe(false);
    expect(handleKey({ key: 'r' }, h)).toBe(false);
    expect(h.fold).not.toHaveBeenCalled();
    expect(h.passive).not.toHaveBeenCalled();
    expect(h.raise).not.toHaveBeenCalled();
  });

  it('ignores modified keys and unknown keys', () => {
    const h = handlers(true);
    expect(handleKey({ key: 'r', metaKey: true }, h)).toBe(false);
    expect(handleKey({ key: 'c', ctrlKey: true }, h)).toBe(false);
    expect(handleKey({ key: 'x' }, h)).toBe(false);
  });

  it('accepts both letter cases and every arrow', () => {
    const h = handlers(true);
    for (const key of ['F', 'c', 'R', 'ArrowUp', 'ArrowLeft']) {
      expect(handleKey({ key }, h)).toBe(true);
    }
    expect(h.fold).toHaveBeenCalledTimes(1);
    expect(h.passive).toHaveBeenCalledTimes(1);
    expect(h.raise).toHaveBeenCalledTimes(1);
    expect(h.adjust.mock.calls).toEqual([[1], [-1]]);
  });

  it('ignores alt-modified keys and key names inherited from Object', () => {
    const h = handlers(true);
    expect(handleKey({ key: 'f', altKey: true }, h)).toBe(false);
    expect(handleKey({ key: 'toString' }, h)).toBe(false);
    expect(handleKey({ key: 'constructor' }, h)).toBe(false);
    expect(h.fold).not.toHaveBeenCalled();
  });
});

describe('handleKey while typing', () => {
  it('leaves keys alone in a text field', () => {
    const h = handlers(true);
    const input = { tagName: 'INPUT', type: 'text' };
    const area = { tagName: 'TEXTAREA' };
    const editable = { tagName: 'DIV', isContentEditable: true };
    expect(handleKey({ key: 'f', target: input }, h)).toBe(false);
    expect(handleKey({ key: 'c', target: area }, h)).toBe(false);
    expect(handleKey({ key: 'ArrowLeft', target: input }, h)).toBe(false);
    expect(handleKey({ key: 'r', target: editable }, h)).toBe(false);
    expect(handleKey({ key: 'ArrowDown', target: { tagName: 'SELECT' } }, h)).toBe(false);
    expect(h.fold).not.toHaveBeenCalled();
    expect(h.passive).not.toHaveBeenCalled();
    expect(h.adjust).not.toHaveBeenCalled();
  });

  it('still acts from a button or the bet slider', () => {
    const h = handlers(true);
    const button = { tagName: 'BUTTON' };
    const slider = { tagName: 'INPUT', type: 'range' };
    expect(handleKey({ key: 'f', target: button }, h)).toBe(true);
    expect(handleKey({ key: 'r', target: slider }, h)).toBe(true);
  });
});
