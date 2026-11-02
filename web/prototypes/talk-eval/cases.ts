import { definitions, f2, fold, h, mark, pre, usd } from './dom.ts';
import { VARIANT_LABEL } from './types.ts';
import type { PlanCase, Report, ReportRow } from './types.ts';

interface Filters {
  variant: string;
  act: string;
  person: string;
  outcome: string;
  search: string;
}

const OUTCOMES: Record<string, string> = {
  all: 'все',
  emotionMiss: 'эмоция не совпала',
  actMiss: 'акт не совпал',
  humourMiss: 'юмор не совпал',
  rejected: 'были отказы проверок',
  silent: 'промолчала после двух попыток',
  overBudget: 'первая попытка длиннее бюджета',
};

const missed = (r: ReportRow, k: string) => r.expected !== null && r.verdict[k] !== r.expected[k];

function attemptsOf(r: ReportRow): { text: string; rejected: string[] }[] {
  try {
    const parsed = JSON.parse(r.trace?.answer ?? '[]') as unknown;
    return Array.isArray(parsed) ? (parsed as { text: string; rejected: string[] }[]) : [];
  } catch {
    return [];
  }
}

function matches(r: ReportRow, c: PlanCase | undefined, f: Filters): boolean {
  const plan = c?.body.plan;
  if (f.act !== 'all' && plan?.act !== f.act) return false;
  if (f.person !== 'all' && c?.tags[1] !== f.person) return false;
  if (f.search !== '' && !`${r.text} ${r.delivered} ${r.id}`.toLowerCase().includes(f.search))
    return false;
  const tests: Record<string, () => boolean> = {
    all: () => true,
    emotionMiss: () => missed(r, 'emotion'),
    actMiss: () => missed(r, 'act'),
    humourMiss: () => missed(r, 'humour'),
    rejected: () => attemptsOf(r).some((a) => a.rejected.length > 0),
    silent: () => r.delivered === '' && r.kind === 'plan',
    overBudget: () => r.grade.within_budget === 0,
  };
  return (tests[f.outcome] ?? tests.all!)();
}

function planBlock(c: PlanCase): HTMLElement {
  const p = c.body.plan as Record<string, unknown>;
  const facts = p.facts as Record<string, unknown>;
  const voice = p.voice as { emotion: string; intensity: number };
  const words = p.words as { min: number; max: number };
  return h(
    'div',
    { class: 'block' },
    h('h3', {}, 'План, который отправил код'),
    definitions([
      ['акт', String(p.act)],
      ['что случилось', String(p.occasion)],
      ['в голосе', `${voice.emotion} ${f2(voice.intensity)}`],
      ['слов', `${words.min} до ${words.max}`],
      ['юмор', p.humour === null ? 'нет' : JSON.stringify(p.humour)],
      ['о руке', p.claim === null ? 'ничего' : JSON.stringify(p.claim)],
      ['игрок сказал', p.heard === null ? 'ничего' : String(p.heard)],
      [
        'улица',
        `${String(facts.street)}, доска ${(facts.board as string[]).join(' ') || 'пусто'}, банк ${String(facts.potBb)} бб`,
      ],
      ['итог', facts.result === null ? 'раздача идёт' : JSON.stringify(facts.result)],
      ['характер', JSON.stringify(c.body.personality)],
      ['язык', c.body.locale],
    ]),
    fold('Весь план JSON', pre(JSON.stringify(p, null, 2))),
  );
}

function judgeBlock(r: ReportRow): HTMLElement {
  const keys = r.expected === null ? ['emotion'] : ['emotion', 'act', 'humour'];
  return h(
    'div',
    { class: 'block' },
    h('h3', {}, 'Что услышал судья'),
    definitions([
      ...keys.map((k): [string, (HTMLElement | string)[]] => [
        k,
        [
          `${String(r.verdict[k])} при плане ${r.expected?.[k] ?? 'нет'} `,
          mark(r.verdict[k] === r.expected?.[k]),
        ],
      ]),
      ['сила', String(r.verdict.intensity)],
      ['в образе', mark(r.verdict.in_character === true)],
      ['карты скрыты', mark(r.verdict.reveals_cards !== true)],
      ['почему', String(r.verdict.reason ?? '')],
    ]),
    r.trace?.judge ? fold('Что видел судья', pre(r.trace.judge)) : null,
  );
}

function attemptsBlock(r: ReportRow): HTMLElement {
  const attempts = attemptsOf(r);
  const list = attempts.map((a, i) =>
    h(
      'div',
      { class: `attempt ${a.rejected.length === 0 ? 'ok' : 'no'}` },
      h('div', {}, `${i + 1}. «${a.text}»`),
      h(
        'div',
        { class: 'note' },
        a.rejected.length === 0 ? 'прошла проверки' : `отказ: ${a.rejected.join(', ')}`,
      ),
    ),
  );
  return h(
    'div',
    { class: 'block' },
    h('h3', {}, 'Ответ модели и проверки'),
    ...(list.length > 0 ? list : [h('div', {}, `«${r.text}»`)]),
    h(
      'div',
      {},
      'За столом прозвучало: ',
      h('b', {}, r.delivered === '' ? '(молчание)' : r.delivered),
    ),
  );
}

function promptBlock(r: ReportRow, report: Report): HTMLElement {
  const t = r.trace;
  if (t === null) return h('div', { class: 'block' }, 'Трассы нет.');
  const state = t.messages.at(-1)?.content ?? '';
  const dialog = t.messages
    .slice(0, -1)
    .map((m) => `${m.role}: ${m.content}`)
    .join('\n');
  return h(
    'div',
    { class: 'block' },
    h('h3', {}, 'Промпт'),
    h('div', { class: 'note' }, 'Блок состояния, последнее сообщение:'),
    pre(state),
    dialog === '' ? null : fold('Реплики перед ним', pre(dialog)),
    ...t.system.map((key, i) =>
      fold(`Системный блок ${i + 1} (кэшируется)`, pre(report.systems[key] ?? '')),
    ),
  );
}

function callsBlock(r: ReportRow): HTMLElement {
  const rows = r.calls.map((c) =>
    h(
      'tr',
      {},
      h('td', {}, c.purpose),
      h('td', {}, c.model),
      h('td', { class: 'cell' }, `${Math.round(c.ms)} мс`),
      h(
        'td',
        { class: 'cell' },
        `${c.usage.input_tokens} / ${c.usage.cache_creation_input_tokens ?? 0} / ${c.usage.cache_read_input_tokens ?? 0} / ${c.usage.output_tokens}`,
      ),
    ),
  );
  const head = h(
    'tr',
    {},
    h('th', {}, 'вызов'),
    h('th', {}, 'модель'),
    h('th', {}, 'время'),
    h('th', {}, 'токены вход / в кэш / из кэша / выход'),
  );
  return h(
    'div',
    { class: 'block wide' },
    h('h3', {}, `Вызовы модели, стоимость реплики ${usd(r.cost)}`),
    h('div', { class: 'scroll' }, h('table', {}, head, ...rows)),
  );
}

function caseBody(r: ReportRow, report: Report): HTMLElement[] {
  const c = report.cases[r.id];
  const plan = r.kind === 'plan' && c !== undefined;
  const v1 = report.casesV1[r.id];
  return [
    plan
      ? planBlock(c)
      : h(
          'div',
          { class: 'block' },
          h('h3', {}, 'Запрос версии 1'),
          pre(JSON.stringify(v1?.body ?? {}, null, 2)),
        ),
    judgeBlock(r),
    attemptsBlock(r),
    promptBlock(r, report),
    callsBlock(r),
  ];
}

function caseItem(r: ReportRow, report: Report): HTMLElement {
  const c = report.cases[r.id];
  const act = String(c?.body.plan.act ?? '');
  const chips = [
    h('span', { class: 'chip' }, act),
    h('span', { class: 'chip' }, String(r.verdict.emotion)),
    r.grade.within_budget === 0 ? h('span', { class: 'chip no' }, 'длиннее бюджета') : null,
  ];
  const line = r.delivered === '' ? '(молчание)' : `«${r.delivered}»`;
  const item = h(
    'details',
    { class: 'case' },
    h(
      'summary',
      {},
      h('span', { class: 'line' }, line),
      h('span', { class: 'num' }, `${r.latency.toFixed(2)} с`),
      h(
        'span',
        { class: 'tags' },
        `${r.id}, повтор ${r.rep + 1}, ${c?.tags.slice(2).join(', ') ?? ''}`,
      ),
      h('span', {}, ...chips),
    ),
  ) as HTMLDetailsElement;
  item.addEventListener('toggle', () => {
    if (item.open && item.querySelector('.body') === null) {
      item.append(h('div', { class: 'body' }, ...caseBody(r, report)));
    }
  });
  return item;
}

function select(
  name: string,
  options: Record<string, string>,
  onChange: (v: string) => void,
): HTMLElement {
  const el = h(
    'select',
    { 'aria-label': name },
    ...Object.entries(options).map(([v, l]) => h('option', { value: v }, l)),
  ) as HTMLSelectElement;
  el.addEventListener('change', () => onChange(el.value));
  return el;
}

export function casesSection(report: Report): HTMLElement {
  const variants = Object.keys(report.variants);
  const f: Filters = {
    variant: variants[0] ?? 'v2',
    act: 'all',
    person: 'all',
    outcome: 'all',
    search: '',
  };
  const acts = [...new Set(Object.values(report.cases).map((c) => String(c.body.plan.act)))].sort();
  const people = [...new Set(Object.values(report.cases).map((c) => c.tags[1] ?? ''))];
  const list = h('div', {});
  const count = h('p', { class: 'note' });
  const draw = () => {
    const rows = (report.variants[f.variant]?.rows ?? []).filter((r) =>
      matches(r, report.cases[r.id], f),
    );
    count.textContent = `${rows.length} реплик`;
    list.replaceChildren(...rows.map((r) => caseItem(r, report)));
  };
  const set = (k: keyof Filters) => (v: string) => {
    f[k] = v;
    draw();
  };
  const search = h('input', {
    type: 'search',
    placeholder: 'поиск по тексту',
    'aria-label': 'поиск',
  }) as HTMLInputElement;
  search.addEventListener('input', () => set('search')(search.value.toLowerCase()));
  const filters = h(
    'div',
    { class: 'filters' },
    select(
      'вариант',
      Object.fromEntries(variants.map((v) => [v, VARIANT_LABEL[v] ?? v])),
      set('variant'),
    ),
    select('акт', { all: 'любой акт', ...Object.fromEntries(acts.map((a) => [a, a])) }, set('act')),
    select(
      'персона',
      { all: 'любая персона', ...Object.fromEntries(people.map((p) => [p, p])) },
      set('person'),
    ),
    select('исход', OUTCOMES, set('outcome')),
    search,
  );
  draw();
  return h(
    'div',
    {},
    h('h2', {}, 'Каждая реплика подробно'),
    h(
      'p',
      { class: 'note' },
      'Откройте реплику: план от кода, промпт, ответ модели с проверками, вердикт судьи и вызовы с токенами.',
    ),
    filters,
    count,
    list,
  );
}
