import { useState } from 'preact/hooks';
import type { Level } from '../game/index.ts';
import {
  readAutoNext,
  readTableStyle,
  readTalk,
  readTells,
  writeAutoNext,
  writeTableStyle,
  writeTalk,
  writeTells,
} from './preferences.ts';
import type { TableStyle } from './preferences.ts';

export interface Preferences {
  simple: boolean;
  autoNext: boolean;
  talk: boolean;
  tells: Level;
  toggleSimple: () => void;
  toggleAutoNext: () => void;
  setTalk: (on: boolean) => void;
  setTells: (level: Level) => void;
}

export function usePreferences(): Preferences {
  const [tableStyle, setTableStyle] = useState<TableStyle>(readTableStyle);
  const [autoNext, setAutoNext] = useState(readAutoNext);
  const [talk, setTalk] = useState(readTalk);
  const [tells, setTells] = useState<Level>(readTells);
  const simple = tableStyle === 'simple';
  return {
    simple,
    autoNext,
    talk,
    tells,
    toggleSimple: () => {
      const next: TableStyle = simple ? 'room' : 'simple';
      writeTableStyle(next);
      setTableStyle(next);
    },
    toggleAutoNext: () => {
      writeAutoNext(!autoNext);
      setAutoNext(!autoNext);
    },
    setTalk: (on) => {
      writeTalk(on);
      setTalk(on);
    },
    setTells: (level) => {
      writeTells(level);
      setTells(level);
    },
  };
}
