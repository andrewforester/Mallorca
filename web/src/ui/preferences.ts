export type TableStyle = 'room' | 'simple';

const KEY = 'mallorca.tableStyle';
const AUTO_NEXT_KEY = 'mallorca.autoNext';

export function readAutoNext(): boolean {
  try {
    return localStorage.getItem(AUTO_NEXT_KEY) !== 'off';
  } catch {
    return true;
  }
}

export function writeAutoNext(on: boolean): void {
  try {
    localStorage.setItem(AUTO_NEXT_KEY, on ? 'on' : 'off');
  } catch {
    return;
  }
}

const SOUND_KEY = 'mallorca.sound';

export function readSound(): boolean {
  try {
    return localStorage.getItem(SOUND_KEY) !== 'off';
  } catch {
    return true;
  }
}

export function writeSound(on: boolean): void {
  try {
    localStorage.setItem(SOUND_KEY, on ? 'on' : 'off');
  } catch {
    return;
  }
}

export function readTableStyle(): TableStyle {
  try {
    return localStorage.getItem(KEY) === 'simple' ? 'simple' : 'room';
  } catch {
    return 'room';
  }
}

export function writeTableStyle(style: TableStyle): void {
  try {
    localStorage.setItem(KEY, style);
  } catch {
    return;
  }
}

const CONVERSATION_KEY = 'mallorca.talk';

export function readConversation(): boolean {
  try {
    return localStorage.getItem(CONVERSATION_KEY) !== 'off';
  } catch {
    return true;
  }
}

export function writeConversation(on: boolean): void {
  try {
    localStorage.setItem(CONVERSATION_KEY, on ? 'on' : 'off');
  } catch {
    return;
  }
}

const COACH_KEY = 'mallorca.coach';

export function readCoach(): boolean {
  try {
    return localStorage.getItem(COACH_KEY) === 'on';
  } catch {
    return false;
  }
}

export function writeCoach(on: boolean): void {
  try {
    localStorage.setItem(COACH_KEY, on ? 'on' : 'off');
  } catch {
    return;
  }
}

const FACE_KEY = 'mallorca.face';
const VOICE_KEY = 'mallorca.voice';

export function readFace(): boolean {
  try {
    return localStorage.getItem(FACE_KEY) !== 'off';
  } catch {
    return true;
  }
}

export function writeFace(on: boolean): void {
  try {
    localStorage.setItem(FACE_KEY, on ? 'on' : 'off');
  } catch {
    return;
  }
}

export function readVoice(): boolean {
  try {
    return localStorage.getItem(VOICE_KEY) === 'on';
  } catch {
    return false;
  }
}

export function writeVoice(on: boolean): void {
  try {
    localStorage.setItem(VOICE_KEY, on ? 'on' : 'off');
  } catch {
    return;
  }
}
