import { EMOTIONS, LOAD_SOURCES, STYLE_KEYS, createEngine } from '../../src/emotion/index.ts';
import type { Pad, Personality, Snapshot } from '../../src/emotion/index.ts';
import { LAB_MOOD, LAB_SPEEDUP, clamp01 } from './lab.ts';
import { PROFILES } from './profiles.ts';
import type { Profile, ProfileId } from './profiles.ts';
import { OCTANT_LABEL, STYLE_LABEL } from './ui/labels.ts';
import { mulberry32 } from '../../src/cards/index.ts';
import { ANCHOR_LABEL, LOAD_LABEL } from './ui/labels.ts';
import {
  ANCHORS,
  PULSE_FACES,
  blendOf,
  faceOf,
  feltPadOf,
  leakOf,
  maskOf,
  prosodyOf,
  pulsesFor,
  shaped,
  shownPadOf,
  visemesOf,
} from '../../src/face/index.ts';
import type { Prosody } from '../../src/face/index.ts';
import { Avatar } from './face/avatar.ts';
import { loadBlueprint } from './scenes/blueprint.ts';
import { createRunner } from './scenes/runner.ts';
import type { RunnerHooks } from './scenes/runner.ts';
import { SCENES } from './scenes/scenes.ts';
import type { Scene } from './scenes/scenes.ts';
import { createVoice } from './voice/voice.ts';
import {
  EMOTION_LABEL,
  createBars,
  createMoodMap,
  createPersonalityEditor,
  el,
  logEntry,
  markPressed,
  miniCards,
  pickButton,
  renderHole,
  renderTraits,
} from './ui/panels.ts';
import { parseCards } from '../../src/cards/index.ts';

const params = new URLSearchParams(location.search);
const still = params.has('at');
const seed = Number(params.get('seed') ?? 1);
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const lab = {
  profile: PROFILES.mira as Profile,
  personality: PROFILES.mira.personality as Personality,
  effort: 0,
  acted: null as Pad | null,
  time: 0,
  sceneStart: 0,
  scene: null as Scene | null,
  speed: 1,
  prosody: { rate: 1, pitch: 1, volume: 0.8 } as Prosody,
  shown: [0, 0, 0] as Pad,
  felt: [0, 0, 0] as Pad,
  mask: 0,
  snapshot: null as Snapshot | null,
};

const engine = createEngine(lab.personality, LAB_MOOD);
const avatar = new Avatar(mulberry32(seed));
const voice = createVoice();
if (still) {
  voice.enabled = false;
}
const stage = $<HTMLDivElement>('stage');
stage.prepend(avatar.canvas);
new ResizeObserver(() => avatar.resize(stage.clientWidth, stage.clientHeight)).observe(stage);

const bubble = $<HTMLDivElement>('bubble');
function line(text: string, who: 'her' | 'player'): void {
  const node = el('div', who === 'player' ? 'line player' : 'line');
  node.append(
    el('span', 'who', who === 'player' ? 'Вы' : lab.profile.name),
    document.createTextNode(text),
  );
  bubble.append(node);
  while (bubble.children.length > 2) {
    bubble.firstElementChild?.remove();
  }
}

const sadness = (s: Snapshot) => clamp01(s.emotions.distress + s.emotions.disappointment);

const hooks: RunnerHooks = {
  table(view) {
    renderHole($('heroCards'), view.hero, lab.profile.name, false);
    renderHole($('villainCards'), view.villain, 'соперник', view.hero !== null);
    $('board').replaceChildren(...view.board.map((c) => cardEl(c)));
    $('pot').textContent =
      view.potBb > 0
        ? `банк ${view.potBb} бб${view.equity !== null ? `, эквити ${Math.round(view.equity * 100)}%` : ''}`
        : '';
  },
  log(label, impulses) {
    logEntry($('log'), lab.time - lab.sceneStart, label, impulses);
  },
  impulses(impulses) {
    const leak = leakOf(lab.personality.bigFive.neuroticism);
    for (const plan of pulsesFor(impulses, lab.mask, leak)) {
      avatar.pulse(
        shaped(PULSE_FACES[plan.face] ?? {}, lab.profile.face, 1),
        plan.amp,
        plan.attack,
        plan.hold,
        plan.release,
        plan.delay,
      );
      if (plan.face === 'control') {
        avatar.blinkBurst(2);
      }
    }
  },
  say(text) {
    line(text, 'her');
    const prosody = lab.snapshot
      ? prosodyOf(lab.shown, lab.snapshot.load.overload, sadness(lab.snapshot))
      : lab.prosody;
    lab.prosody = prosody;
    avatar.speak(visemesOf(text, lab.profile.face.lettersPerSecond * prosody.rate));
    voice.speak(text, prosody, (i) => avatar.syncSpeech(i));
  },
  player: (text) => line(text, 'player'),
  gaze: (t) => avatar.setGaze(t),
  effort(effort, acted) {
    lab.effort = effort;
    lab.acted = acted;
  },
  head: (kind, amp, dur) => avatar.headMove(kind, amp * lab.snapshot!.traits.expressiveness, dur),
  gesture: (face, amp) =>
    avatar.pulse(shaped(PULSE_FACES[face] ?? {}, lab.profile.face, 1), amp, 0.3, 0.6, 0.7),
};

const cardEl = (c: number) => {
  const wrap = el('div');
  renderHole(wrap, [c], '', false);
  return wrap.querySelector('.card') as HTMLElement;
};

const ranges = await loadBlueprint(
  async (url) => new Uint8Array(await (await fetch(url)).arrayBuffer()),
);
const runner = createRunner(engine, hooks, () => mulberry32(seed + 1), ranges ?? undefined);

function resetAll(): void {
  engine.reset();
  avatar.clearTransient();
  avatar.setGaze('player');
  voice.stop();
  bubble.replaceChildren();
  $('log').replaceChildren();
  lab.effort = 0;
  lab.acted = null;
}

function startScene(scene: Scene): void {
  resetAll();
  lab.scene = scene;
  lab.sceneStart = lab.time;
  runner.start(scene);
  $('watchText').textContent = scene.watch;
  markPressed($('scenes'), scene.id);
}

function selectProfile(profile: Profile): void {
  lab.profile = profile;
  lab.personality = profile.personality;
  engine.setPersonality(profile.personality);
  engine.reset();
  $('profileDesc').textContent = profile.description;
  $('whoChip').textContent = profile.name;
  setEditor(profile.personality);
  renderTraits($('traits'), engine.snapshot().traits);
  markPressed($('profiles'), profile.id);
}

const setEditor = createPersonalityEditor($('bigFive'), (p) => {
  lab.personality = p;
  engine.setPersonality(p);
  renderTraits($('traits'), engine.snapshot().traits);
});

for (const p of Object.values(PROFILES)) {
  $('profiles').append(pickButton(p.id, p.name, p.hint, () => selectProfile(p)));
}
for (const s of SCENES) {
  $('scenes').append(
    pickButton(s.id, s.title, s.hint, () => startScene(s), miniCards(parseCards(s.hands[0]!.hero))),
  );
}

const emotionBars = createBars(
  $('emotions'),
  EMOTIONS.map((e) => ({
    key: e,
    label: EMOTION_LABEL[e],
    negative: ['fear', 'distress', 'disappointment', 'shame', 'anger', 'injustice'].includes(e),
  })),
);
const loadBars = createBars(
  $('tiltParts'),
  LOAD_SOURCES.map((k) => ({ key: k, label: LOAD_LABEL[k], negative: true })),
);
const styleBars = createBars(
  $('style'),
  STYLE_KEYS.map((k) => ({ key: k, label: STYLE_LABEL[k], centered: true })),
);
const moodMap = createMoodMap($('map') as unknown as SVGSVGElement);

const f2 = (v: number) => (v >= 0 ? '+' : '') + v.toFixed(2);
const padText = (p: Pad) => `P ${f2(p[0])}  A ${f2(p[1])}  D ${f2(p[2])}`;
const STRENGTH = { slightly: 'слегка', moderately: 'умеренно', fully: 'сильно' };

function renderPanels(s: Snapshot, mix: number[]): void {
  emotionBars(s.emotions);
  $('octant').textContent = `${OCTANT_LABEL[s.octant.octant]} (${STRENGTH[s.octant.strength]})`;
  $('moodPad').textContent =
    `настроение  ${padText(s.mood)}\nиспытывает  ${padText(lab.felt)}\nпоказывает  ${padText(lab.shown)}\nвремя настроения ускорено в ${LAB_SPEEDUP} раз`;
  moodMap({ mood: s.mood, felt: lab.felt, shown: lab.shown, def: s.traits.defaultMood });
  const top = mix
    .map((w, i) => ({ w, a: ANCHORS[i]! }))
    .sort((x, y) => y.w - x.w)
    .slice(0, 3);
  $('mix').textContent =
    `лицо: ${top.map(({ w, a }) => `${ANCHOR_LABEL[a.id] ?? a.id} ${Math.round(w * 100)}%`).join(', ')}`;
  ($('tiltBar') as HTMLElement).style.width = `${s.load.overload * 100}%`;
  const dominant =
    s.load.dominant && s.load.overload > 0.05 ? `, в основном ${LOAD_LABEL[s.load.dominant]}` : '';
  $('tiltText').textContent =
    `перегрузка ${s.load.overload.toFixed(2)}${dominant}\nнагрузка ${s.load.load.toFixed(2)} при самообладании ${s.traits.composure.toFixed(2)}\nдо игры доходит ${Math.round(s.load.leakage * 100)}% эмоций (дисциплина ${s.traits.discipline.toFixed(2)}), давление рейзами ${s.pressure.toFixed(1)}, сессия ${s.sessionNetBb} бб`;
  loadBars(s.load.parts);
  styleBars(s.style, (v) => `×${v.toFixed(2)}`);
  $('faceText').textContent =
    `покерфейс ${lab.mask.toFixed(2)} (привычка ${s.traits.mask.toFixed(2)}, усилие ${lab.effort.toFixed(2)}, перегрузка снимает ${(0.6 * s.load.overload).toFixed(2)})\nвыразительность ${s.traits.expressiveness.toFixed(2)}\nголос ${voice.name()}: темп ${lab.prosody.rate.toFixed(2)}, высота ${lab.prosody.pitch.toFixed(2)}, громкость ${lab.prosody.volume.toFixed(2)}`;
  const clock = $('clock');
  if (lab.scene) {
    const t = Math.min(lab.time - lab.sceneStart, lab.scene.length);
    clock.textContent = `${t.toFixed(1)} с${lab.speed !== 1 ? ' ×0.25' : ''}`;
    ($('progress') as HTMLElement).style.width = `${(t / lab.scene.length) * 100}%`;
  } else {
    clock.textContent = 'покой';
  }
}

let mix: number[] = blendOf([0, 0, 0]);

function frame(dt: number): void {
  lab.time += dt;
  if (lab.scene) {
    runner.update(lab.time - lab.sceneStart);
  }
  engine.step(dt);
  const s = engine.snapshot();
  lab.snapshot = s;
  lab.mask = maskOf(s.traits.mask, lab.effort, s.load.overload);
  lab.felt = feltPadOf(s);
  lab.shown = shownPadOf(lab.felt, lab.mask, lab.acted);
  mix = blendOf(lab.shown);
  const nervous = clamp01(
    0.7 * s.emotions.fear + 0.4 * s.emotions.shame + 0.3 * Math.max(0, -s.mood[2]),
  );
  avatar.setFace(faceOf(mix, lab.profile.face, s.traits.expressiveness), lab.shown, {
    nervous,
    arousal: lab.felt[1],
    blinkRate: lab.profile.face.blink,
  });
  avatar.tick(dt);
}

$('replay').addEventListener('click', () => startScene(lab.scene ?? SCENES[0]!));
$('slow').addEventListener('click', () => {
  lab.speed = lab.speed === 1 ? 0.25 : 1;
  $('slow').setAttribute('aria-pressed', String(lab.speed !== 1));
});
$('sound').addEventListener('click', () => {
  voice.enabled = !voice.enabled;
  if (!voice.enabled) {
    voice.stop();
  }
  $('sound').setAttribute('aria-pressed', String(voice.enabled));
});
$('sound').setAttribute('aria-pressed', String(voice.enabled));
$('reset').addEventListener('click', () => {
  resetAll();
  lab.scene = null;
  markPressed($('scenes'), '');
});

const initialProfile = PROFILES[(params.get('profile') ?? 'mira') as ProfileId] ?? PROFILES.mira;
selectProfile(initialProfile);
const initialScene = SCENES.find((s) => s.id === params.get('scene'));
const forcedAnchor = ANCHORS.find((a) => a.id === params.get('anchor'));
if (forcedAnchor) {
  lab.effort = 1;
  lab.acted = forcedAnchor.pad;
  engine.setPersonality({ ...lab.personality, suppression: 1 });
}

function runLive(): void {
  let last = performance.now();
  let panelTick = 0;
  const loop = (now: number) => {
    const real = Math.min((now - last) / 1000, 0.05);
    last = now;
    frame(real * lab.speed);
    avatar.render();
    panelTick += real;
    if (panelTick > 0.08 && lab.snapshot) {
      renderPanels(lab.snapshot, mix);
      panelTick = 0;
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

function runStill(at: number): void {
  if (initialScene) {
    startScene(initialScene);
  }
  const step = 1 / 60;
  for (let t = 0; t < at; t += step) {
    frame(step);
  }
  avatar.quiet();
  frame(1 / 60);
  avatar.render();
  renderPanels(lab.snapshot!, mix);
  document.body.dataset.ready = '1';
}

avatar
  .load()
  .then(() => {
    avatar.resize(stage.clientWidth, stage.clientHeight);
    $('loading').hidden = true;
    if (still) {
      runStill(Number(params.get('at')));
      return;
    }
    if (initialScene) {
      startScene(initialScene);
    }
    runLive();
  })
  .catch(() => {
    $('loading').textContent = 'Модель не загрузилась: нет файла web/public/avatar/mallorca.glb.';
  });

Object.assign(window, { lab, engine, avatar, startScene, selectProfile });
