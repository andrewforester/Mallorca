import { useState } from 'preact/hooks';
import {
  readAutoNext,
  readCoach,
  readSound,
  readTableStyle,
  writeAutoNext,
  writeCoach,
  writeSound,
  writeTableStyle,
} from './preferences.ts';
import type { TableStyle } from './preferences.ts';

export interface Preferences {
  simple: boolean;
  autoNext: boolean;
  sound: boolean;
  coach: boolean;
  toggleSimple: () => void;
  toggleAutoNext: () => void;
  toggleSound: () => void;
  toggleCoach: () => void;
}

export function usePreferences(): Preferences {
  const [tableStyle, setTableStyle] = useState<TableStyle>(readTableStyle);
  const [autoNext, setAutoNext] = useState(readAutoNext);
  const [sound, setSound] = useState(readSound);
  const [coach, setCoach] = useState(readCoach);
  const simple = tableStyle === 'simple';
  return {
    simple,
    autoNext,
    sound,
    coach,
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
    toggleCoach: () => {
      writeCoach(!coach);
      setCoach(!coach);
    },
  };
}
