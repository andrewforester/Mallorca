type Child = Node | string | null | undefined | false;

export function h(
  tag: string,
  attrs: Record<string, string> = {},
  ...children: (Child | Child[])[]
): HTMLElement {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    el.setAttribute(k, v);
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    el.append(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return el;
}

export const pct = (v: number | null | undefined): string =>
  v === null || v === undefined ? 'нет' : `${Math.round(v * 100)}%`;

export const f2 = (v: number | null | undefined): string =>
  v === null || v === undefined ? 'нет' : v.toFixed(2);

export const usd = (v: number): string => `$${v.toFixed(v < 0.01 ? 4 : 3)}`;

export function bar(value: number, bad = false): HTMLElement {
  const fill = h('i', { style: `width: ${Math.max(0, Math.min(1, value)) * 100}%` });
  if (bad) fill.classList.add('bad');
  return h('div', { class: 'bar' }, fill);
}

export function mark(ok: boolean): HTMLElement {
  return h('span', { class: ok ? 'ok' : 'no' }, ok ? 'да' : 'нет');
}

export function pre(text: string): HTMLElement {
  return h('pre', {}, text);
}

export function fold(title: string, ...body: Child[]): HTMLElement {
  return h('details', {}, h('summary', {}, title), ...body);
}

export function definitions(rows: [string, Child | Child[]][]): HTMLElement {
  return h(
    'dl',
    {},
    rows.flatMap(([k, v]) => [h('dt', {}, k), h('dd', {}, ...(Array.isArray(v) ? v : [v]))]),
  );
}
