import { bar, f2, fold, h, pct, usd } from './dom.ts';
import { LOWER_IS_BETTER, METRIC_LABEL, VARIANT_LABEL } from './types.ts';
import type { Character, PairRun, Report, Variant } from './types.ts';

const ORDER = [
  'emotion',
  'act',
  'humour',
  'joke_without_humour',
  'in_character',
  'within_budget',
  'leak',
  'language_ok',
  'intensity_err',
  'poker_face',
  'length_ok',
];

function metricRow(key: string, value: number | null, n: number): HTMLElement[] {
  const label = METRIC_LABEL[key] ?? key;
  const shown = key === 'intensity_err' ? f2(value) : pct(value);
  const good = LOWER_IS_BETTER.has(key) ? 1 - (value ?? 0) : (value ?? 0);
  return [
    h(
      'div',
      { class: 'metric' },
      h('span', {}, label),
      h('span', { class: 'num' }, `${shown} (n ${n})`),
    ),
    bar(good, good < 0.6),
  ];
}

function variantCard(name: string, v: Variant): HTMLElement {
  const s = v.summary;
  const metrics = ORDER.filter((k) => s.metrics[k] !== undefined && s.metrics[k]!.n > 0);
  return h(
    'div',
    { class: 'card' },
    h('h3', {}, VARIANT_LABEL[name] ?? name),
    h('p', { class: 'note num' }, `${s.rows} реплик, модель ${s.model}, судья ${s.judgeModel}`),
    ...metrics.flatMap((k) => metricRow(k, s.metrics[k]!.mean, s.metrics[k]!.n)),
    h('p', { class: 'note num' }, `слов в среднем ${f2(s.words)}, повторов ${s.repeats}`),
    h(
      'p',
      { class: 'note num' },
      `задержка p50 ${s.latency.p50.toFixed(2)} с, p95 ${s.latency.p95.toFixed(2)} с`,
    ),
    h(
      'p',
      { class: 'note num' },
      `стоимость: реплики ${usd(s.cost.app)}, судья ${usd(s.cost.judge)}`,
    ),
  );
}

export function summarySection(report: Report): HTMLElement {
  const names = Object.keys(report.variants);
  return h(
    'div',
    {},
    h('h2', {}, 'Сводка по вариантам'),
    h(
      'p',
      { class: 'note' },
      'Судья не видит план: он слышит только реплику и то, что было за столом, и сам называет эмоцию, акт и стиль юмора. Совпадение с планом значит, что задуманное дошло до слушателя.',
    ),
    h('div', { class: 'cards' }, ...names.map((n) => variantCard(n, report.variants[n]!))),
  );
}

function pairBlock(run: PairRun): HTMLElement {
  const title = `${VARIANT_LABEL[run.b] ?? run.b} против ${VARIANT_LABEL[run.a] ?? run.a}`;
  const records = run.records.map((r) =>
    h(
      'div',
      { class: 'attempt' },
      h('div', { class: 'note' }, r.context),
      h('div', {}, `${VARIANT_LABEL[run.a] ?? run.a}: `, h('b', {}, r.a || '(молчание)')),
      h('div', {}, `${VARIANT_LABEL[run.b] ?? run.b}: `, h('b', {}, r.b || '(молчание)')),
      h(
        'div',
        { class: r.winner === run.b ? 'ok' : 'no' },
        `Лучше: ${VARIANT_LABEL[r.winner] ?? r.winner}. ${r.reason}`,
      ),
    ),
  );
  return h(
    'div',
    { class: 'card' },
    h('h3', {}, title),
    h(
      'div',
      { class: 'metric' },
      h('span', {}, 'доля побед второго'),
      h('span', { class: 'num' }, `${pct(run.share)} ± ${pct(run.half)} (${run.wins} из ${run.n})`),
    ),
    bar(run.share, run.share < 0.5),
    fold('Все пары с причиной судьи', ...records),
  );
}

export function pairsSection(report: Report): HTMLElement {
  return h(
    'div',
    {},
    h('h2', {}, 'Какая реплика живее'),
    h(
      'p',
      { class: 'note' },
      'Судья видит ситуацию и две реплики разных вариантов на одном и том же случае, в случайном порядке, и выбирает ту, что естественнее и уместнее. Больше 50% значит, что второй вариант лучше.',
    ),
    report.pairs.length === 0
      ? h('p', { class: 'note' }, 'Попарных прогонов ещё нет.')
      : h('div', { class: 'cards' }, ...report.pairs.map(pairBlock)),
  );
}

const TRAITS = ['openness', 'conscientiousness', 'extraversion', 'agreeableness', 'neuroticism'];
const TRAIT_LABEL: Record<string, string> = {
  openness: 'O',
  conscientiousness: 'C',
  extraversion: 'E',
  agreeableness: 'A',
  neuroticism: 'N',
};

function characterTable(c: Character): HTMLElement {
  const head = h(
    'tr',
    {},
    h('th', {}, 'Пресет'),
    ...TRAITS.map((t) => h('th', {}, `${TRAIT_LABEL[t]} задано / прочитано`)),
  );
  const rows = Object.entries(c.report).map(([name, r]) =>
    h(
      'tr',
      {},
      h('td', {}, name),
      ...TRAITS.map((t) => h('td', { class: 'cell' }, `${f2(r.given[t])} / ${f2(r.judged[t])}`)),
    ),
  );
  return h('div', { class: 'scroll' }, h('table', {}, head, ...rows));
}

export function characterSection(report: Report): HTMLElement {
  const c = report.character;
  if (c === null) {
    return h(
      'div',
      {},
      h('h2', {}, 'Характер'),
      h('p', { class: 'note' }, 'Прогона характера ещё нет.'),
    );
  }
  const lines = Object.entries(c.report).map(([name, r]) =>
    fold(`${name}: 20 реплик`, ...r.lines.map((l) => h('div', { class: 'attempt' }, l))),
  );
  return h(
    'div',
    {},
    h('h2', {}, 'Слышен ли характер'),
    h(
      'p',
      { class: 'note' },
      `Каждый пресет сказал 20 реплик в одних и тех же ситуациях. Судья по одним репликам оценил его Big Five от −1 до 1. Корреляция заданных и прочитанных черт r = ${f2(c.r)}.`,
    ),
    characterTable(c),
    ...lines,
  );
}

function matrix(rows: [string, string][], title: string): HTMLElement {
  const expected = [...new Set(rows.map((r) => r[0]))].sort();
  const read = [...new Set(rows.map((r) => r[1]))].sort();
  const count = (e: string, a: string) => rows.filter((r) => r[0] === e && r[1] === a).length;
  const most = Math.max(1, ...expected.flatMap((e) => read.map((a) => count(e, a))));
  const head = h('tr', {}, h('th', {}, 'план \\ судья'), ...read.map((a) => h('th', {}, a)));
  const body = expected.map((e) =>
    h(
      'tr',
      {},
      h('th', {}, e),
      ...read.map((a) => {
        const n = count(e, a);
        const tone = e === a ? '143,195,204' : '233,164,143';
        const style = n === 0 ? '' : `background: rgba(${tone}, ${0.15 + 0.6 * (n / most)})`;
        return h('td', { class: 'cell', style }, n === 0 ? '' : String(n));
      }),
    ),
  );
  return h(
    'div',
    { class: 'card' },
    h('h3', {}, title),
    h('div', { class: 'scroll' }, h('table', {}, head, ...body)),
  );
}

export function matricesSection(report: Report, variant: string): HTMLElement {
  const v = report.variants[variant];
  if (v === undefined) return h('div', {});
  const planned = v.rows.filter((r) => r.expected !== null);
  const pairs = (k: string): [string, string][] =>
    planned.map((r) => [r.expected![k] ?? '', String(r.verdict[k] ?? '')]);
  return h(
    'div',
    {},
    h('h2', {}, `Что задумано и что услышано: ${VARIANT_LABEL[variant] ?? variant}`),
    h(
      'p',
      { class: 'note' },
      'Строки: что заложено в плане. Столбцы: что назвал судья по одному тексту. Голубое на диагонали значит, что совпало.',
    ),
    h(
      'div',
      { class: 'cards' },
      matrix(pairs('emotion'), 'Эмоция'),
      matrix(pairs('act'), 'Акт'),
      matrix(pairs('humour'), 'Юмор'),
    ),
  );
}
