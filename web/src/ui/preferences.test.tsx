import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  readAutoNext,
  readSound,
  readTableStyle,
  readTalk,
  readTells,
  writeAutoNext,
  writeSound,
  writeTableStyle,
  writeTalk,
  writeTells,
} from './preferences.ts';

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe('table style preference', () => {
  it('defaults to the room', () => {
    expect(readTableStyle()).toBe('room');
  });

  it('remembers the simple table', () => {
    writeTableStyle('simple');
    expect(readTableStyle()).toBe('simple');
    writeTableStyle('room');
    expect(readTableStyle()).toBe('room');
  });

  it('ignores an unknown stored value', () => {
    localStorage.setItem('mallorca.tableStyle', 'neon');
    expect(readTableStyle()).toBe('room');
  });

  it('survives storage that throws', () => {
    const blocked = () => {
      throw new Error('blocked');
    };
    vi.stubGlobal('localStorage', { getItem: blocked, setItem: blocked });
    expect(() => writeTableStyle('simple')).not.toThrow();
    expect(readTableStyle()).toBe('room');
  });
});

describe('auto next hand preference', () => {
  it('is on by default', () => {
    expect(readAutoNext()).toBe(true);
  });

  it('remembers turning it off and on', () => {
    writeAutoNext(false);
    expect(readAutoNext()).toBe(false);
    writeAutoNext(true);
    expect(readAutoNext()).toBe(true);
  });

  it('stays on when storage throws', () => {
    const blocked = () => {
      throw new Error('blocked');
    };
    vi.stubGlobal('localStorage', { getItem: blocked, setItem: blocked });
    expect(() => writeAutoNext(false)).not.toThrow();
    expect(readAutoNext()).toBe(true);
  });
});

describe('sound preference', () => {
  it('is on by default', () => {
    expect(readSound()).toBe(true);
  });

  it('remembers turning it off and on', () => {
    writeSound(false);
    expect(localStorage.getItem('mallorca.sound')).toBe('off');
    expect(readSound()).toBe(false);
    writeSound(true);
    expect(readSound()).toBe(true);
  });

  it('stays on when storage throws', () => {
    const blocked = () => {
      throw new Error('blocked');
    };
    vi.stubGlobal('localStorage', { getItem: blocked, setItem: blocked });
    expect(() => writeSound(false)).not.toThrow();
    expect(readSound()).toBe(true);
  });
});

describe('table talk preference', () => {
  it('is on by default and remembers turning it off', () => {
    expect(readTalk()).toBe(true);
    writeTalk(false);
    expect(localStorage.getItem('mallorca.talk')).toBe('off');
    expect(readTalk()).toBe(false);
    writeTalk(true);
    expect(readTalk()).toBe(true);
  });

  it('stays on when storage throws', () => {
    const blocked = () => {
      throw new Error('blocked');
    };
    vi.stubGlobal('localStorage', { getItem: blocked, setItem: blocked });
    expect(() => writeTalk(false)).not.toThrow();
    expect(readTalk()).toBe(true);
  });
});

describe('tells preference', () => {
  it('defaults to subtle and remembers each level', () => {
    expect(readTells()).toBe('subtle');
    for (const level of ['obvious', 'hidden', 'subtle'] as const) {
      writeTells(level);
      expect(localStorage.getItem('mallorca.tells')).toBe(level);
      expect(readTells()).toBe(level);
    }
  });

  it('ignores an unknown stored value', () => {
    localStorage.setItem('mallorca.tells', 'loud');
    expect(readTells()).toBe('subtle');
  });

  it('stays subtle when storage throws', () => {
    const blocked = () => {
      throw new Error('blocked');
    };
    vi.stubGlobal('localStorage', { getItem: blocked, setItem: blocked });
    expect(() => writeTells('hidden')).not.toThrow();
    expect(readTells()).toBe('subtle');
  });
});

describe('coach preference', () => {
  it('is off unless stored on', async () => {
    const { readCoach, writeCoach } = await import('./preferences.ts');
    expect(readCoach()).toBe(false);
    writeCoach(true);
    expect(readCoach()).toBe(true);
    writeCoach(false);
    expect(readCoach()).toBe(false);
  });
});
