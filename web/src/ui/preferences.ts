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
