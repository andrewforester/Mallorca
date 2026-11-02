import type { Prosody } from '../../../src/face/index.ts';

const PREFERRED = [
  'Samantha',
  'Google US English',
  'Karen',
  'Moira',
  'Tessa',
  'Serena',
  'Victoria',
];

export interface Voice {
  available: boolean;
  enabled: boolean;
  speak(text: string, prosody: Prosody, onWord: (charIndex: number) => void): void;
  stop(): void;
  name(): string;
}

function pickVoice(): SpeechSynthesisVoice | null {
  const voices = speechSynthesis.getVoices().filter((v) => v.lang.startsWith('en'));
  for (const name of PREFERRED) {
    const hit = voices.find((v) => v.name.includes(name));
    if (hit) {
      return hit;
    }
  }
  return voices[0] ?? null;
}

export function createVoice(): Voice {
  const available = typeof speechSynthesis !== 'undefined';
  let chosen: SpeechSynthesisVoice | null = null;
  if (available) {
    chosen = pickVoice();
    speechSynthesis.addEventListener('voiceschanged', () => {
      chosen = pickVoice();
    });
  }
  const voice: Voice = {
    available,
    enabled: available,
    speak(text, prosody, onWord) {
      if (!available || !voice.enabled) {
        return;
      }
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      if (chosen) {
        u.voice = chosen;
      }
      u.lang = chosen?.lang ?? 'en-US';
      u.rate = prosody.rate;
      u.pitch = prosody.pitch;
      u.volume = prosody.volume;
      u.addEventListener('boundary', (e) => onWord(e.charIndex));
      speechSynthesis.speak(u);
    },
    stop() {
      if (available) {
        speechSynthesis.cancel();
      }
    },
    name: () => chosen?.name ?? 'нет голоса',
  };
  return voice;
}
