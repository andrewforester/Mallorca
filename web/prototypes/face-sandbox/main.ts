import { EMOTIONS, PERSONALITIES, createEngine } from '../../src/emotion/index.ts';
import type { Emotion, Emotions, Pad, PersonalityKey, Snapshot } from '../../src/emotion/index.ts';
import { ANCHORS, MALLORCA_LOOK, blendOf, faceFrame, pulsesOf } from '../../src/face/index.ts';
import type { FaceFrame } from '../../src/face/index.ts';
import { HAIR } from '../../src/ui/avatar/hair.ts';
import { mountFace, rigRenderer } from '../../src/ui/avatar/live.ts';
import type { LiveFace } from '../../src/ui/avatar/live.ts';

const RIG_BASE = `${import.meta.env.BASE_URL}avatar/her/`;

const NAMES: Readonly<Record<Emotion, string>> = {
  anger: 'Злость',
  injustice: 'Обида',
  fear: 'Тревога',
  joy: 'Радость',
  surprise: 'Удивление',
  pride: 'Гордость',
  hope: 'Надежда',
  relief: 'Облегчение',
  distress: 'Огорчение',
  disappointment: 'Разочарование',
  shame: 'Стыд',
};
const MAIN: readonly Emotion[] = ['anger', 'fear', 'joy', 'surprise'];
const ORDER: readonly Emotion[] = [...MAIN, ...EMOTIONS.filter((e) => !MAIN.includes(e))].filter(
  (e) => e !== 'surprise',
);

interface Preset {
  name: string;
  emotions: Partial<Record<Emotion, number>>;
  mood: Pad;
  pulse?: Emotion;
}

const PRESETS: readonly Preset[] = [
  { name: 'Спокойствие', emotions: {}, mood: [0, 0, 0] },
  { name: 'Злость, отыграться', emotions: { anger: 0.8, injustice: 0.5 }, mood: [-0.3, 0.5, 0.5] },
  { name: 'Тревога', emotions: { fear: 0.7 }, mood: [-0.3, 0.4, -0.4] },
  { name: 'Радость', emotions: { joy: 0.8, pride: 0.3 }, mood: [0.5, 0.3, 0.2] },
  { name: 'Удивление', emotions: { surprise: 0.9 }, mood: [0, 0.2, 0], pulse: 'surprise' },
];

const zero = (): Record<Emotion, number> =>
  Object.fromEntries(EMOTIONS.map((e) => [e, 0])) as Record<Emotion, number>;

const state = {
  character: 'mallorca' as PersonalityKey,
  emotions: zero(),
  mood: [0, 0, 0] as [number, number, number],
  ownMask: false,
  mask: 0,
};

let live: LiveFace | null = null;
let cueId = 0;
let base: Snapshot = createEngine(PERSONALITIES.mallorca).snapshot();

const $ = (id: string): HTMLElement => document.getElementById(id) as HTMLElement;

function snapshot(): Snapshot {
  return { ...base, emotions: { ...state.emotions } as Emotions, mood: [...state.mood] };
}

function frame(): FaceFrame {
  const s = snapshot();
  return state.ownMask
    ? faceFrame(s, null, MALLORCA_LOOK)
    : faceFrame(s, null, MALLORCA_LOOK, state.mask);
}

function slider(
  host: HTMLElement,
  label: string,
  value: number,
  range: [number, number],
  set: (v: number) => void,
  main = false,
): HTMLInputElement {
  const row = document.createElement('label');
  row.className = main ? 'main' : '';
  const input = Object.assign(document.createElement('input'), {
    type: 'range',
    min: String(range[0]),
    max: String(range[1]),
    step: '0.01',
    value: String(value),
  });
  const out = document.createElement('output');
  out.textContent = value.toFixed(2);
  input.addEventListener('input', () => {
    out.textContent = Number(input.value).toFixed(2);
    set(Number(input.value));
    render();
  });
  row.append(label, input, out);
  host.append(row);
  return input;
}

function pulse(emotion: Emotion, amount = 0.9): void {
  const f = frame();
  for (const p of pulsesOf([{ emotion, amount, reason: 'sandbox' }], f.mask, MALLORCA_LOOK)) {
    live?.cue({ id: (cueId += 1), kind: 'pulse', pulse: p });
  }
}

function buildSliders(): void {
  const emotions = $('emotions');
  const mood = $('mood');
  const maskBox = $('maskBox');
  emotions.replaceChildren();
  mood.replaceChildren();
  maskBox.replaceChildren();
  for (const e of ORDER) {
    slider(
      emotions,
      NAMES[e],
      state.emotions[e],
      [0, 1],
      (v) => (state.emotions[e] = v),
      MAIN.includes(e),
    );
  }
  ['Удовольствие', 'Возбуждение', 'Доминантность'].forEach((name, i) => {
    slider(mood, name, state.mood[i] ?? 0, [-1, 1], (v) => (state.mood[i] = v));
  });
  slider(maskBox, 'Маска вручную', state.mask, [0, 1], (v) => (state.mask = v));
}

function applyPreset(p: Preset): void {
  state.emotions = { ...zero(), ...p.emotions };
  state.mood = [...p.mood];
  buildSliders();
  render();
  if (p.pulse) pulse(p.pulse);
}

const fmt = (p: Pad): string => p.map((v) => v.toFixed(2).padStart(5)).join(' ');

function render(): void {
  const f = frame();
  const mix = blendOf(f.shown)
    .map((w, i) => [ANCHORS[i]?.id ?? '?', w] as const)
    .filter(([, w]) => w > 0.02)
    .sort((a, b) => b[1] - a[1])
    .map(([id, w]) => `  ${id.padEnd(10)} ${(w * 100).toFixed(0)}%`);
  const top = Object.entries(f.weights)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([n, v]) => `  ${n.padEnd(18)} ${v.toFixed(2)}`);
  $('readout').textContent = [
    `чувствует PAD ${fmt(f.felt)}`,
    `показывает PAD ${fmt(f.shown)}`,
    `маска ${f.mask.toFixed(2)}`,
    '',
    'смесь якорей:',
    ...mix,
    '',
    'сильнейшие мышцы:',
    ...top,
    '',
    'удивление бывает только вспышкой, как в игре',
  ].join('\n');
}

async function mount(): Promise<void> {
  live?.dispose();
  live = null;
  $('loading').style.display = '';
  live = await mountFace($('stage'), {
    create: rigRenderer(RIG_BASE, HAIR[state.character]),
    frame,
    calm: false,
    onLost: () => void mount(),
  });
  $('loading').style.display = 'none';
}

function setup(): void {
  const select = $('character') as HTMLSelectElement;
  for (const key of Object.keys(PERSONALITIES)) select.append(new Option(key, key));
  select.addEventListener('change', () => {
    state.character = select.value as PersonalityKey;
    base = createEngine(PERSONALITIES[state.character]).snapshot();
    render();
    void mount();
  });
  for (const p of PRESETS) {
    const b = Object.assign(document.createElement('button'), { textContent: p.name });
    b.addEventListener('click', () => applyPreset(p));
    $('presets').append(b);
  }
  for (const e of [...MAIN, ...ORDER.filter((x) => !MAIN.includes(x))]) {
    const b = Object.assign(document.createElement('button'), { textContent: NAMES[e] });
    b.addEventListener('click', () => pulse(e));
    $('pulses').append(b);
  }
  ($('ownMask') as HTMLInputElement).addEventListener('change', (ev) => {
    state.ownMask = (ev.target as HTMLInputElement).checked;
    render();
  });
  buildSliders();
  render();
  void mount();
}

setup();
