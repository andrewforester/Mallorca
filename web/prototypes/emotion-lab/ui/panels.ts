import type { BigFive, Impulse, Pad, Personality, Traits } from '../../../src/emotion/index.ts';
import { formatCard, rankOf, suitOf } from '../../../src/cards/index.ts';
import type { Card } from '../../../src/cards/index.ts';
import { EMOTION_LABEL } from './labels.ts';

export { EMOTION_LABEL };
import { ANCHORS } from '../../../src/face/index.ts';
import { ANCHOR_LABEL } from './labels.ts';

const SUIT = ['♣', '♦', '♥', '♠'];
const RANK: Readonly<Record<number, string>> = { 10: 'T', 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };

export const cardLabel = (c: Card): string =>
  `${RANK[rankOf(c)] ?? String(rankOf(c))}${SUIT[suitOf(c)]}`;
const isRed = (c: Card): boolean => suitOf(c) === 1 || suitOf(c) === 2;

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className = '',
  text = '',
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) {
    node.className = className;
  }
  if (text) {
    node.textContent = text;
  }
  return node;
}

export function cardNode(c: Card | null): HTMLElement {
  if (c === null) {
    return el('div', 'card back');
  }
  const node = el('div', isRed(c) ? 'card red' : 'card', cardLabel(c));
  node.title = formatCard(c);
  return node;
}

export function renderHole(
  container: HTMLElement,
  cards: Card[] | null,
  label: string,
  hidden: boolean,
): void {
  container.replaceChildren();
  if (!cards && !hidden) {
    return;
  }
  const row = el('div', 'cards-row');
  row.append(...(cards ? cards.map(cardNode) : [cardNode(null), cardNode(null)]));
  container.append(row, el('span', '', label));
}

export function miniCards(cards: readonly Card[]): HTMLElement {
  const span = el('span', 'mini');
  for (const c of cards) {
    const s = el('span', isRed(c) ? 'red' : '', `${cardLabel(c)} `);
    span.append(s);
  }
  return span;
}

export function pickButton(
  id: string,
  title: string,
  hint: string,
  onClick: () => void,
  extra?: HTMLElement,
): HTMLButtonElement {
  const b = el('button', 'pick');
  b.type = 'button';
  b.dataset.id = id;
  b.setAttribute('aria-pressed', 'false');
  b.append(el('b', '', title));
  if (extra) {
    b.append(extra);
  }
  b.append(el('span', '', hint));
  b.addEventListener('click', onClick);
  return b;
}

export function markPressed(container: HTMLElement, id: string): void {
  container
    .querySelectorAll<HTMLButtonElement>('.pick')
    .forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.id === id)));
}

export interface BarSpec {
  key: string;
  label: string;
  centered?: boolean;
  negative?: boolean;
}

export function createBars(
  container: HTMLElement,
  specs: readonly BarSpec[],
): (values: Record<string, number>, format?: (v: number) => string) => void {
  const refs = specs.map((spec) => {
    const row = el('div', 'bar-row');
    const track = el(
      'div',
      `bar-track${spec.centered ? ' centered' : ''}${spec.negative ? ' neg' : ''}`,
    );
    const fill = el('i');
    track.append(fill);
    const val = el('span', 'val');
    row.append(el('span', '', spec.label), track, val);
    container.append(row);
    return { spec, fill, val };
  });
  return (values, format = (v) => v.toFixed(2)) => {
    for (const { spec, fill, val } of refs) {
      const v = values[spec.key] ?? 0;
      val.textContent = format(v);
      if (spec.centered) {
        const d = Math.max(-1, Math.min(1, v - 1));
        fill.className = d >= 0 ? 'up' : 'down';
        fill.style.left = `${d >= 0 ? 50 : 50 + d * 50}%`;
        fill.style.width = `${Math.abs(d) * 50}%`;
      } else {
        fill.style.width = `${Math.max(0, Math.min(1, v)) * 100}%`;
      }
    }
  };
}

const SVG = 'http://www.w3.org/2000/svg';

export function createMoodMap(
  svg: SVGSVGElement,
): (dots: Record<'mood' | 'felt' | 'shown' | 'def', Pad>) => void {
  const mx = (v: number) => 150 + v * 128;
  const my = (a: number) => 150 - a * 128;
  const add = (tag: string, attrs: Record<string, string | number>, text = ''): SVGElement => {
    const node = document.createElementNS(SVG, tag);
    for (const [k, v] of Object.entries(attrs)) {
      node.setAttribute(k, String(v));
    }
    node.textContent = text;
    svg.append(node);
    return node;
  };
  add('line', { x1: 14, y1: 150, x2: 286, y2: 150, class: 'axis' });
  add('line', { x1: 150, y1: 14, x2: 150, y2: 286, class: 'axis' });
  add('text', { x: 286, y: 144, 'text-anchor': 'end' }, 'приятно');
  add('text', { x: 14, y: 144 }, 'неприятно');
  add('text', { x: 156, y: 22 }, 'взвинчено');
  add('text', { x: 156, y: 288 }, 'спокойно');
  for (const a of ANCHORS) {
    const x = mx(a.pad[0]);
    const y = my(a.pad[1]);
    add('circle', { cx: x, cy: y, r: 3, class: 'anchor' });
    const right = a.pad[2] >= 0;
    add(
      'text',
      { x: x + (right ? 6 : -6), y: y + 3.5, 'text-anchor': right ? 'start' : 'end' },
      ANCHOR_LABEL[a.id] ?? a.id,
    );
  }
  const def = add('circle', { r: 6, fill: 'none', stroke: 'var(--muted)', 'stroke-width': 1.5 });
  const mood = add('circle', { r: 6, fill: 'var(--mood)' });
  const felt = add('circle', { r: 5, fill: 'var(--accent)' });
  const shown = add('circle', { r: 4.5, fill: 'var(--shown)' });
  const place = (node: SVGElement, p: Pad) => {
    node.setAttribute('cx', String(mx(p[0])));
    node.setAttribute('cy', String(my(p[1])));
  };
  return (dots) => {
    place(def, dots.def);
    place(mood, dots.mood);
    place(felt, dots.felt);
    place(shown, dots.shown);
  };
}

export const BIG_FIVE_LABEL: Readonly<Record<keyof BigFive, string>> = {
  openness: 'Открытость',
  conscientiousness: 'Добросовестность',
  extraversion: 'Экстраверсия',
  agreeableness: 'Доброжелательность',
  neuroticism: 'Нейротизм',
};

export function createPersonalityEditor(
  container: HTMLElement,
  onChange: (p: Personality) => void,
): (p: Personality) => void {
  let current: Personality | null = null;
  const inputs: Array<{ set: (p: Personality) => void }> = [];
  const slider = (
    label: string,
    min: number,
    get: (p: Personality) => number,
    put: (p: Personality, v: number) => Personality,
  ) => {
    const row = el('div', 'slider');
    const input = el('input');
    input.type = 'range';
    input.min = String(min);
    input.max = '1';
    input.step = '0.05';
    input.id = `pers-${label}`;
    const lab = el('label', '', label);
    lab.htmlFor = input.id;
    const val = el('span', 'val');
    row.append(lab, input, val);
    container.append(row);
    input.addEventListener('input', () => {
      if (current) {
        current = put(current, Number(input.value));
        val.textContent = Number(input.value).toFixed(2);
        onChange(current);
      }
    });
    inputs.push({
      set: (p) => {
        input.value = String(get(p));
        val.textContent = get(p).toFixed(2);
      },
    });
  };
  for (const key of Object.keys(BIG_FIVE_LABEL) as Array<keyof BigFive>) {
    slider(
      BIG_FIVE_LABEL[key],
      -1,
      (p) => p.bigFive[key],
      (p, v) => ({ ...p, bigFive: { ...p.bigFive, [key]: v } }),
    );
  }
  slider(
    'Привычка прятать эмоции',
    0,
    (p) => p.suppression,
    (p, v) => ({ ...p, suppression: v }),
  );
  slider(
    'Покерный опыт',
    0,
    (p) => p.experience,
    (p, v) => ({ ...p, experience: v }),
  );
  return (p) => {
    current = p;
    inputs.forEach((i) => i.set(p));
  };
}

const f2 = (v: number) => v.toFixed(2);
const padText = (p: Pad) => `P ${f2(p[0])}  A ${f2(p[1])}  D ${f2(p[2])}`;

export function renderTraits(table: HTMLTableElement, t: Traits): void {
  const rows: Array<[string, string, string]> = [
    ['Настроение по умолчанию', padText(t.defaultMood), 'Mehrabian 1996, через ALMA'],
    ['Самообладание', f2(t.composure), 'нагрузка, после которой контроль ломается'],
    ['Дисциплина', f2(t.discipline), 'доля эмоций, которая не доходит до игры даже при перегрузе'],
    ['Выразительность', f2(t.expressiveness), 'сила базового выражения лица'],
    ['Покерфейс по привычке', f2(t.mask), 'маска без усилия'],
    ['Разговорчивость', f2(t.talkativeness), 'для разговорного агента'],
    ['Усиление страха', f2(t.gains.fear), ''],
    ['Усиление злости', f2(t.gains.anger), ''],
    ['Усиление несправедливости', f2(t.gains.injustice), ''],
    ['Усиление стыда', f2(t.gains.shame), ''],
    ['Усиление радости', f2(t.gains.joy), ''],
    ['Негатив держится дольше в', `${f2(t.halfLifeFactor.distress)} раза`, ''],
  ];
  table.replaceChildren(
    ...rows.map((r) => {
      const tr = el('tr');
      r.forEach((c) => tr.append(el('td', '', c)));
      return tr;
    }),
  );
}

export function logEntry(
  list: HTMLOListElement,
  time: number,
  label: string,
  impulses: readonly Impulse[],
): void {
  const li = el('li', '', `${time.toFixed(1)} с  ${label}`);
  for (const i of impulses) {
    li.append(
      el('span', 'imp', `${EMOTION_LABEL[i.emotion]} +${i.amount.toFixed(2)}  ${i.reason}`),
    );
  }
  list.prepend(li);
}
