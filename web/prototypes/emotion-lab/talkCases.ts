import { writeFileSync } from 'node:fs';
import { formatCard, mulberry32 } from '../../src/cards/index.ts';
import type { Card } from '../../src/cards/index.ts';
import { MALLORCA, PERSONALITIES, createEngine, maskOf } from '../../src/emotion/index.ts';
import type { Personality, Snapshot } from '../../src/emotion/index.ts';
import {
  COOL_LINES,
  RULES,
  chosen,
  drawHumour,
  matching,
  occasionText,
  voiceOf,
  wordsFor,
} from '../../src/conversation/index.ts';
import type {
  Act,
  HandEnd,
  Occasion,
  OccasionKind,
  PublicFacts,
} from '../../src/conversation/index.ts';
import { PRESENTING_EFFORT } from '../../src/persona/index.ts';
import type { HandState, PersonaView, Presenting, StrengthClass } from '../../src/persona/index.ts';
import { LAB_MOOD } from './lab.ts';
import { PROFILES } from './profiles.ts';
import { createRunner } from './scenes/runner.ts';
import type { RunnerHooks, TableView } from './scenes/runner.ts';
import { SCENES } from './scenes/scenes.ts';
import type { Scene } from './scenes/scenes.ts';

const EVAL = new URL('../../../supabase/functions/talk/eval/', import.meta.url);
const OUT = new URL('cases.json', EVAL);
const LIST = new URL('cases.md', EVAL);
const PRESETS = new URL('presets.json', EVAL);
const STACK_BB = 100;
const MAX_RECENT = 8;
const SESSION_HANDS = 10;

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

const KINDS: Readonly<Record<Situation, [OccasionKind, HandEnd | null]>> = {
  herBet: ['herBet', null],
  herCall: ['herCall', null],
  playerBet: ['playerRaise', null],
  handWon: ['handEnded', 'won'],
  handLost: ['handEnded', 'lost'],
  bluffCaught: ['handEnded', 'bluffCaught'],
};

function situationOf(spot: Spot, m: Moment): Situation {
  if (spot.situation !== undefined) {
    return spot.situation;
  }
  return (m.netBb ?? 0) >= 0 ? 'handWon' : 'handLost';
}

function occasionOf(spot: Spot, m: Moment, street: string): Occasion {
  const [kind, end] = KINDS[situationOf(spot, m)];
  return {
    kind,
    end,
    impulses: [],
    journalIds: [],
    handNumber: SESSION_HANDS,
    street,
    actionStreet: street === 'complete' ? 'river' : street,
    strength: spot.hint ?? 'medium',
    endsHand: kind === 'handEnded',
    hand: {} as HandState,
    text: null,
    previous: null,
  };
}

function factsOf(m: Moment, street: string, occasion: Occasion): PublicFacts {
  const potBb = m.view?.potBb ?? 3;
  return {
    street,
    board: [...(m.view?.board ?? [])],
    potBb,
    stacksBb: { her: STACK_BB, player: STACK_BB },
    actions: [],
    card: null,
    result: occasion.endsHand ? { won: (m.netBb ?? 0) >= 0, potBb } : null,
    shown: null,
  };
}

function actOf(occasion: Occasion, m: Moment, presenting: Presenting | null): Act {
  const context = { occasion, snapshot: m.snapshot, presenting: presenting?.stance ?? null };
  return chosen(matching(RULES, context))?.act ?? 'react';
}

function planOf(
  scene: Scene,
  spot: Spot,
  m: Moment,
  person: (typeof PEOPLE)[number],
  reply: boolean,
) {
  const street = streetOf(m.view?.board.length ?? 0, m.netBb !== null);
  const occasion = occasionOf(spot, m, street);
  const acting = spot.honest ? null : spot.hint;
  const presenting: Presenting | null =
    acting === null ? null : { stance: 'bluff', shows: acting, effort: PRESENTING_EFFORT.bluff };
  const effort = presenting?.effort ?? 0;
  const mask = maskOf(m.snapshot.traits.mask, effort, m.snapshot.load.overload);
  const view = { snapshot: m.snapshot, mask, presenting } as PersonaView;
  const claim = spot.hint === null ? null : { about: spot.hint, honest: spot.honest };
  const act: Act = claim !== null ? 'claim' : reply ? 'answer' : actOf(occasion, m, presenting);
  const { bigFive } = person.personality;
  const { humour } = drawHumour(
    { act, occasion, bigFive, snapshot: m.snapshot, linesSinceJoke: COOL_LINES },
    mulberry32(scene.id.length * 31 + person.id.length),
  );
  const facts = factsOf(m, street, occasion);
  return {
    version: 2 as const,
    act,
    occasion: occasionText(occasion, facts),
    voice: voiceOf(view, occasion),
    words: wordsFor(act, bigFive.extraversion, m.snapshot.load.overload),
    humour,
    claim,
    facts: { ...facts, board: cards(facts.board) },
    heard: reply ? spot.en : null,
    session: {
      hands: SESSION_HANDS,
      netBb: m.netBb ?? 0,
      playerBluffsShown: 0,
      playerAllIns: 0,
      notable: [],
    },
    handNumber: SESSION_HANDS,
    street,
    actionStreet: occasion.actionStreet,
    endsHand: occasion.endsHand,
  };
}

function caseOf(scene: Scene, si: number, person: (typeof PEOPLE)[number], pi: number) {
  const spot = SPOTS[scene.id]!;
  const m = momentOf(scene, person.personality);
  const reply = (si + pi) % 2 === 0;
  const russian = reply && (si + pi) % 4 === 0;
  const plan = planOf(scene, spot, m, person, reply);
  const text = russian ? spot.ru : spot.en;
  const body = {
    kind: reply ? 'reply' : 'line',
    version: 2,
    sessionId: `eval-${scene.id}-${person.id}`,
    locale: russian ? 'ru' : 'en',
    personality: person.personality.bigFive,
    plan: { ...plan, heard: reply ? text : null },
    recent: m.lines.slice(-MAX_RECENT),
    debug: false,
    ...(reply ? { text, quick: false } : {}),
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
const rows = cases.map((c) => {
  const { act, voice, words, humour } = c.body.plan;
  const joke = humour === null ? 'none' : humour.style;
  return `| ${c.id} | ${c.body.kind} | ${act} | ${voice.emotion} ${voice.intensity} | ${words.min} to ${words.max} | ${joke} |`;
});
writeFileSync(
  LIST,
  [
    '# Talk eval cases, version 2',
    '',
    '| Case | Kind | Act | Voice | Words | Humour |',
    '| --- | --- | --- | --- | --- | --- |',
    ...rows,
    '',
  ].join('\n'),
);
const presets = Object.fromEntries(
  Object.entries(PERSONALITIES).map(([key, p]) => [key, p.bigFive]),
);
writeFileSync(PRESETS, `${JSON.stringify(presets, null, 2)}\n`);
console.log(`written ${cases.length} cases to ${OUT.pathname}`);
