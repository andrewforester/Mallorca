export interface Prosody {
  rate: number;
  pitch: number;
  volume: number;
}

export interface Voice {
  speak(text: string, prosody: Prosody, onWord: (charIndex: number) => void): void;
  stop(): void;
}

const PREFERRED = [
  'Samantha',
  'Google US English',
  'Karen',
  'Moira',
  'Tessa',
  'Serena',
  'Victoria',
];

export const voiceAvailable = (): boolean =>
  typeof window !== 'undefined' && 'speechSynthesis' in window;

function pick(synth: SpeechSynthesis): SpeechSynthesisVoice | null {
  const voices = synth.getVoices().filter((v) => v.lang.startsWith('en'));
  for (const name of PREFERRED) {
    const hit = voices.find((v) => v.name.includes(name));
    if (hit) return hit;
  }
  return voices[0] ?? null;
}

export function createVoice(): Voice | null {
  if (!voiceAvailable()) return null;
  const synth = window.speechSynthesis;
  let chosen = pick(synth);
  synth.addEventListener('voiceschanged', () => {
    chosen = pick(synth);
  });
  return {
    speak(text, prosody, onWord) {
      synth.cancel();
      const u = new SpeechSynthesisUtterance(text);
      if (chosen) u.voice = chosen;
      u.lang = chosen?.lang ?? 'en-US';
      u.rate = prosody.rate;
      u.pitch = prosody.pitch;
      u.volume = prosody.volume;
      u.addEventListener('boundary', (e) => onWord(e.charIndex));
      synth.speak(u);
    },
    stop: () => synth.cancel(),
  };
}
