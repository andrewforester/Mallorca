import { casesSection } from './cases.ts';
import { h } from './dom.ts';
import { characterSection, matricesSection, pairsSection, summarySection } from './sections.ts';
import type { Report } from './types.ts';
import { VARIANT_LABEL } from './types.ts';

function byId(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (el === null) throw new Error(`no #${id}`);
  return el;
}

function matrices(report: Report): HTMLElement {
  const holder = h('div', {});
  const names = Object.keys(report.variants).filter((v) => v !== 'baseline');
  const pick = h(
    'select',
    { 'aria-label': 'вариант матриц' },
    ...names.map((n) => h('option', { value: n }, VARIANT_LABEL[n] ?? n)),
  ) as HTMLSelectElement;
  const draw = () => holder.replaceChildren(matricesSection(report, pick.value));
  pick.addEventListener('change', draw);
  draw();
  return h('div', {}, h('div', { class: 'filters' }, pick), holder);
}

async function main(): Promise<void> {
  const response = await fetch(new URL('./report.json', import.meta.url));
  if (!response.ok) {
    byId('summary').append(
      h('p', { class: 'note' }, 'Отчёта нет: соберите его командой npm run lab:talk-eval-data.'),
    );
    return;
  }
  const report = (await response.json()) as Report;
  byId('meta').textContent = `Отчёт собран ${new Date(report.generatedAt).toLocaleString('ru-RU')}`;
  byId('summary').append(summarySection(report));
  byId('pairs').append(pairsSection(report));
  byId('character').append(characterSection(report));
  byId('matrices').append(matrices(report));
  byId('cases').append(casesSection(report));
}

void main();
