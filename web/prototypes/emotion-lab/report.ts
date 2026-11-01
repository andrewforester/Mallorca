import { EMOTIONS, STYLE_KEYS, createEngine } from '../../src/emotion/index.ts';
import { LAB_MOOD } from './lab.ts';
import { PROFILES } from './profiles.ts';
import type { ProfileId } from './profiles.ts';
import { writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { mulberry32 } from '../../src/cards/index.ts';
import { LOAD_LABEL } from './ui/labels.ts';
import { loadBlueprint } from './scenes/blueprint.ts';
import { createRunner } from './scenes/runner.ts';
import type { RunnerHooks } from './scenes/runner.ts';
import { SCENES } from './scenes/scenes.ts';
import { EMOTION_LABEL } from './ui/labels.ts';

const OUT = new URL('../../../docs/emotion/generated.md', import.meta.url);
const f2 = (v: number) => v.toFixed(2);
const pad = (p: readonly number[]) => p.map(f2).join(', ');

function traitsTable(): string[] {
  const ids = Object.keys(PROFILES) as ProfileId[];
  const traits = ids.map((id) => createEngine(PROFILES[id].personality).snapshot().traits);
  const head = `| | ${ids.map((id) => PROFILES[id].name).join(' | ')} |`;
  const line = `|---|${ids.map(() => '---').join('|')}|`;
  const row = (label: string, values: string[]) => `| ${label} | ${values.join(' | ')} |`;
  const b5 = (k: keyof (typeof PROFILES)['mira']['personality']['bigFive']) =>
    ids.map((id) => f2(PROFILES[id].personality.bigFive[k]));
  return [
    head,
    line,
    row('Открытость O', b5('openness')),
    row('Добросовестность C', b5('conscientiousness')),
    row('Экстраверсия E', b5('extraversion')),
    row('Доброжелательность A', b5('agreeableness')),
    row('Нейротизм N', b5('neuroticism')),
    row(
      'Привычка прятать эмоции',
      ids.map((id) => f2(PROFILES[id].personality.suppression)),
    ),
    row(
      'Покерный опыт',
      ids.map((id) => f2(PROFILES[id].personality.experience)),
    ),
    row(
      '**Настроение по умолчанию (P, A, D)**',
      traits.map((t) => pad(t.defaultMood)),
    ),
    row(
      '**Самообладание**',
      traits.map((t) => f2(t.composure)),
    ),
    row(
      '**Дисциплина**',
      traits.map((t) => f2(t.discipline)),
    ),
    row(
      '**Выразительность**',
      traits.map((t) => f2(t.expressiveness)),
    ),
    ...EMOTIONS.map((e) =>
      row(
        `Усиление: ${EMOTION_LABEL[e]}`,
        traits.map((t) => f2(t.gains[e])),
      ),
    ),
  ];
}

const silentHooks = (log: string[], start: () => number): RunnerHooks => ({
  table: () => {},
  log: (label, impulses) => {
    log.push(`- ${start().toFixed(1)} с: ${label}`);
    for (const i of impulses) {
      log.push(`  - ${EMOTION_LABEL[i.emotion]} +${f2(i.amount)}: ${i.reason}`);
    }
  },
  impulses: () => {},
  say: (text) => log.push(`- ${start().toFixed(1)} с: она говорит «${text}»`),
  player: (text) => log.push(`- ${start().toFixed(1)} с: игрок говорит «${text}»`),
  gaze: () => {},
  effort: (effort) => log.push(`- ${start().toFixed(1)} с: усилие покерфейса ${f2(effort)}`),
  head: () => {},
  gesture: () => {},
});

const ranges = await loadBlueprint(async (url) => new Uint8Array(await readFile(url)));

function sceneLog(sceneId: string, profileId: ProfileId): string[] {
  const scene = SCENES.find((s) => s.id === sceneId)!;
  const engine = createEngine(PROFILES[profileId].personality, LAB_MOOD);
  let t = 0;
  const log: string[] = [];
  const runner = createRunner(
    engine,
    silentHooks(log, () => t),
    () => mulberry32(2),
    ranges ?? undefined,
  );
  runner.start(scene);
  const step = 1 / 30;
  for (; t <= scene.length; t += step) {
    runner.update(t);
    engine.step(step);
    if (Math.abs(t - scene.moment) < step / 2) {
      const s = engine.snapshot();
      const top = EMOTIONS.filter((e) => s.emotions[e] > 0.05).map(
        (e) => `${EMOTION_LABEL[e]} ${f2(s.emotions[e])}`,
      );
      log.push(
        `- **${scene.moment} с, ключевой момент**: ${top.join(', ')}; настроение ${pad(s.mood)}; перегрузка ${f2(s.load.overload)}${s.load.dominant && s.load.overload > 0.05 ? ` (в основном ${LOAD_LABEL[s.load.dominant]})` : ''}, до игры доходит ${Math.round(s.load.leakage * 100)}%; стиль ${STYLE_KEYS.map((k) => `${k} ×${f2(s.style[k])}`).join(', ')}`,
      );
    }
  }
  return log;
}

const lines = [
  '# Сгенерированные таблицы и журналы',
  '',
  'Файл создаёт `npm run lab:report` из кода модели. Не правьте его руками.',
  '',
  '## Профили',
  '',
  ...traitsTable(),
  '',
  '## Журналы сцен',
  '',
];
for (const scene of SCENES) {
  for (const profile of ['mira', 'ingrid', 'lola', 'nina'] as ProfileId[]) {
    lines.push(
      `### ${scene.title}, ${PROFILES[profile].name}`,
      '',
      ...sceneLog(scene.id, profile),
      '',
    );
  }
}
writeFileSync(OUT, lines.join('\n'));
console.log(`written ${OUT.pathname}`);
