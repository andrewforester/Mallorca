import { useState } from 'preact/hooks';
import {
  readAutoNext,
  readCoach,
  readFace,
  readSound,
  readTableStyle,
  readConversation,
  readVoice,
  writeAutoNext,
  writeCoach,
  writeFace,
  writeSound,
  writeTableStyle,
  writeConversation,
  writeVoice,
} from './preferences.ts';
import type { TableStyle } from './preferences.ts';

export interface Preferences {
  simple: boolean;
  autoNext: boolean;
  conversation: boolean;
  sound: boolean;
  coach: boolean;
  face: boolean;
  voice: boolean;
  toggleSimple: () => void;
  toggleAutoNext: () => void;
  setConversation: (on: boolean) => void;
  toggleSound: () => void;
  toggleCoach: () => void;
  toggleFace: () => void;
  toggleVoice: () => void;
}

export function usePreferences(): Preferences {
  const [tableStyle, setTableStyle] = useState<TableStyle>(readTableStyle);
  const [autoNext, setAutoNext] = useState(readAutoNext);
  const [conversation, setConversation] = useState(readConversation);
  const [sound, setSound] = useState(readSound);
  const [coach, setCoach] = useState(readCoach);
  const [face, setFace] = useState(readFace);
  const [voice, setVoice] = useState(readVoice);
  const simple = tableStyle === 'simple';
  return {
    simple,
    autoNext,
    conversation,
    sound,
    coach,
    face,
    voice,
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
    setConversation: (on) => {
      writeConversation(on);
      setConversation(on);
    },
    toggleCoach: () => {
      writeCoach(!coach);
      setCoach(!coach);
    },
    toggleFace: () => {
      writeFace(!face);
      setFace(!face);
    },
    toggleVoice: () => {
      writeVoice(!voice);
      setVoice(!voice);
    },
  };
}
