import { useState } from 'preact/hooks';
import {
  readAutoNext,
  readSound,
  readTableStyle,
  writeAutoNext,
  writeSound,
  writeTableStyle,
} from './preferences.ts';
import type { TableStyle } from './preferences.ts';

export interface Preferences {
  simple: boolean;
  autoNext: boolean;
  sound: boolean;
  toggleSimple: () => void;
  toggleAutoNext: () => void;
  toggleSound: () => void;
}

export function usePreferences(): Preferences {
  const [tableStyle, setTableStyle] = useState<TableStyle>(readTableStyle);
  const [autoNext, setAutoNext] = useState(readAutoNext);
  const [sound, setSound] = useState(readSound);
  const simple = tableStyle === 'simple';
  return {
    simple,
    autoNext,
    sound,
    toggleSimple: () => {
      const next: TableStyle = simple ? 'room' : 'simple';
      writeTableStyle(next);
      setTableStyle(next);
    },
    toggleAutoNext: () => {
      writeAutoNext(!autoNext);
      setAutoNext(!autoNext);
    },
    toggleSound: () => {
      writeSound(!sound);
      setSound(!sound);
    },
  };
}
