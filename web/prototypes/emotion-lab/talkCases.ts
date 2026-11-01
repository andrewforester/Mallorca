import { writeFileSync } from 'node:fs';
import { formatCard, mulberry32 } from '../../src/cards/index.ts';
import type { Card } from '../../src/cards/index.ts';
import { MALLORCA, createEngine } from '../../src/emotion/index.ts';
import type { Personality, Snapshot } from '../../src/emotion/index.ts';
import { characterOf, feelingState, wordsOf } from '../../src/talk/index.ts';
import type { StrengthClass } from '../../src/talk/index.ts';
import { LAB_MOOD } from './lab.ts';
import { PROFILES } from './profiles.ts';
import { createRunner } from './scenes/runner.ts';
import type { RunnerHooks, TableView } from './scenes/runner.ts';
import { SCENES } from './scenes/scenes.ts';
import type { Scene } from './scenes/scenes.ts';

const OUT = new URL('../../../supabase/functions/talk/eval/cases.json', import.meta.url);
const BIG_BLIND = 2;
const STACK_BB = 100;
const MAX_RECENT = 4;

type Situation = 'herBet' | 'herCall' | 'playerBet' | 'handWon' | 'handLost' | 'bluffCaught';

interface Spot {
  situation?: Situation;
  hint: StrengthClass | null;
  honest: boolean;
  en: string;
  ru: string;
}

const SPOTS: Readonly<Record<string, Spot>> = {
  badbeat: {
    hint: null,
    honest: true,
    en: 'Sorry, the river was kind to me.',
    ru: 'Извини, ривер был ко мне добр.',
  },
  calm: {
    situation: 'herCall',
    hint: null,
    honest: true,
    en: 'More tea? It is snowing again.',
    ru: 'Ещё чаю? Опять снег пошёл.',
  },
  cooler: {
    situation: 'herBet',
    hint: null,
    honest: true,
    en: 'Set over set, what can you do.',
    ru: 'Сет на сет, что тут поделаешь.',
  },
  bigpot: { hint: null, honest: true, en: 'Big one, huh?', ru: 'Крупный банк, а?' },
  suckout: {
    hint: null,
    honest: true,
    en: 'Unbelievable. You got lucky.',
    ru: 'Невероятно. Тебе просто повезло.',
  },
  flopstraight: {
    situation: 'herBet',
    hint: 'strong',
    honest: true,
    en: 'What are you holding? Just tell me.',
    ru: 'Что у тебя? Просто скажи.',
  },
  raisetoppair: {
    situation: 'playerBet',
    hint: 'medium',
    honest: true,
    en: 'I raise. Your move.',
    ru: 'Рейз. Твой ход.',
  },
  bluffwin: {
    situation: 'herBet',
    hint: 'strong',
    honest: false,
    en: 'Hmm. Let me think about this one.',
    ru: 'Хм. Дай подумать.',
  },
  bluffcaught: {
    situation: 'bluffCaught',
    hint: null,
    honest: true,
    en: 'Nice bluff. Do it again.',
    ru: 'Классный блеф. Давай ещё.',
  },
  mistake: {
    hint: null,
    honest: true,
    en: 'Had nothing, by the way.',
    ru: 'У меня ничего не было, кстати.',
  },
  tell: {
    situation: 'herBet',
    hint: 'weak',
    honest: false,
    en: 'You look nervous. Big hand?',
    ru: 'Ты как будто нервничаешь. Сильная рука?',
  },
  revenge: { hint: null, honest: true, en: 'Thought so.', ru: 'Так и думал.' },
  streak: {
    hint: null,
    honest: true,
    en: 'Rough night for you, huh?',
    ru: 'Тяжёлый вечер у тебя, да?',
  },
};

const PEOPLE: ReadonlyArray<{ id: string; personality: Personality }> = [
  { id: 'mallorca', personality: MALLORCA },
  { id: 'ingrid', personality: PROFILES.ingrid.personality },
  { id: 'lola', personality: PROFILES.lola.personality },
  { id: 'nina', personality: PROFILES.nina.personality },
];

interface Moment {
  snapshot: Snapshot;
  view: TableView | null;
  netBb: number | null;
  lines: Array<{ speaker: 'mallorca' | 'player'; text: string }>;
}

const CALM: Scene = {
  id: 'calm',
  title: '',
  hint: '',
  watch: '',
  length: 1,
  moment: 0,
  hands: [],
  beats: [],
};

function momentOf(scene: Scene, personality: Personality): Moment {
  const engine = createEngine(personality, LAB_MOOD);
  if (scene.id === CALM.id) {
    return { snapshot: engine.snapshot(), view: null, netBb: null, lines: [] };
  }
  let view: TableView | null = null;
  const lines: Moment['lines'] = [];
  const hooks: RunnerHooks = {
    table: (v) => (view = v),
    log: () => {},
    impulses: () => {},
    say: (text) => lines.push({ speaker: 'mallorca', text }),
    player: (text) => lines.push({ speaker: 'player', text }),
    gaze: () => {},
    effort: () => {},
    head: () => {},
    gesture: () => {},
  };
  const runner = createRunner(engine, hooks, () => mulberry32(2));
  runner.start(scene);
  const step = 1 / 30;
  for (let t = 0; t < scene.moment; t += step) {
    runner.update(t);
    engine.step(step);
  }
  const results = scene.beats.filter((b) => b.do === 'result' && b.at <= scene.moment);
  const last = results[results.length - 1];
  const netBb = last !== undefined && last.do === 'result' ? last.netBb : null;
  return { snapshot: engine.snapshot(), view, netBb, lines };
}

const cards = (list: readonly Card[] | null): string[] => (list ?? []).map(formatCard);

function streetOf(board: number, over: boolean): string {
  if (over) {
    return 'complete';
  }
  return board === 0 ? 'preflop' : board === 3 ? 'flop' : board === 4 ? 'turn' : 'river';
}

function factsOf(m: Moment) {
  const board = cards(m.view?.board ?? []);
  const her = cards(m.view?.hero ?? null);
  const pot = Math.round((m.view?.potBb ?? 3) * BIG_BLIND);
  const street = streetOf(board.length, m.netBb !== null);
  return {
    street,
    board,
    pot,
    stacks: [STACK_BB * BIG_BLIND, STACK_BB * BIG_BLIND],
    her: her.length === 2 ? her : null,
    actions: [],
    bigBlind: BIG_BLIND,
  };
}

function situationOf(spot: Spot, m: Moment): Situation {
  if (spot.situation !== undefined) {
    return spot.situation;
  }
  return (m.netBb ?? 0) >= 0 ? 'handWon' : 'handLost';
}

function caseOf(scene: Scene, si: number, person: (typeof PEOPLE)[number], pi: number) {
  const spot = SPOTS[scene.id]!;
  const m = momentOf(scene, person.personality);
  const reply = (si + pi) % 2 === 0;
  const russian = reply && (si + pi) % 4 === 0;
  const facts = factsOf(m);
  const intent = {
    situation: situationOf(spot, m),
    hint: spot.hint,
    honest: spot.honest,
    street: facts.street,
  };
  const acting = spot.honest ? null : spot.hint;
  const body = {
    kind: reply ? 'reply' : 'line',
    sessionId: `eval-${scene.id}-${person.id}`,
    locale: russian ? 'ru' : 'en',
    facts,
    intent,
    mood: wordsOf(m.snapshot),
    feeling: feelingState(m.snapshot, acting),
    character: characterOf(person.personality),
    recent: m.lines.slice(-MAX_RECENT),
    ...(reply ? { text: russian ? spot.ru : spot.en, quick: false } : {}),
  };
  return {
    id: `${scene.id}-${person.id}`,
    tags: [scene.id, person.id, reply ? 'reply' : 'line', russian ? 'ru' : 'en'],
    language: russian ? 'ru' : 'en',
    body,
  };
}

const cases = [CALM, ...SCENES].flatMap((scene, si) =>
  PEOPLE.map((person, pi) => caseOf(scene, si, person, pi)),
);
writeFileSync(OUT, `${JSON.stringify(cases, null, 2)}\n`);
console.log(`written ${cases.length} cases to ${OUT.pathname}`);
