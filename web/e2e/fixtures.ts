import { expect, test as base } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { refuseTalk } from './talkServer.ts';

declare global {
  interface Window {
    __workerCreated: number;
    __workerReplies: number;
  }
}

const WORKER_TRACKER = `
  window.__workerCreated = 0;
  window.__workerReplies = 0;
  const NativeWorker = window.Worker;
  window.Worker = class extends NativeWorker {
    constructor(url, options) {
      super(url, options);
      window.__workerCreated += 1;
      this.addEventListener('message', () => {
        window.__workerReplies += 1;
      });
    }
  };
`;

export const test = base.extend<{ problems: string[] }>({
  problems: [
    async ({ page }, use) => {
      const problems: string[] = [];
      page.on('console', (message) => {
        if (message.type() === 'error' || message.type() === 'warning') {
          problems.push(`console.${message.type()}: ${message.text()}`);
        }
      });
      page.on('pageerror', (error) => {
        problems.push(`pageerror: ${error.message}`);
      });
      await page.addInitScript(WORKER_TRACKER);
      await refuseTalk(page);
      await use(problems);
      expect(problems).toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

export const FAST_URL = '/?seed=42&botDelay=0&autoNext=off';
export const TOTAL_CHIPS = 4000;

export function byId(page: Page, id: string): Locator {
  return page.getByTestId(id);
}

export async function stackOf(page: Page, seat: 0 | 1): Promise<number> {
  const text = (await byId(page, `stack-${seat}`).innerText()).replace(/[^0-9]/g, '');
  return Number(text);
}

export type Waypoint = 'act' | 'next-hand' | 'tournament-over';

export async function waitForWaypoint(page: Page): Promise<Waypoint> {
  const act = byId(page, 'passive').and(page.locator(':enabled'));
  const next = byId(page, 'next-hand');
  const over = byId(page, 'tournament-over');
  const any = act.or(next).or(over);
  await any.first().waitFor({ state: 'visible' });
  if (await over.isVisible()) {
    return 'tournament-over';
  }
  if (await next.isVisible()) {
    return 'next-hand';
  }
  return 'act';
}

export async function playToTheEnd(page: Page): Promise<void> {
  for (;;) {
    const waypoint = await waitForWaypoint(page);
    if (waypoint === 'tournament-over') {
      return;
    }
    if (waypoint === 'next-hand') {
      await byId(page, 'next-hand').click();
      continue;
    }
    if (await byId(page, 'raise').isEnabled()) {
      await byId(page, 'preset-allin').click();
      await byId(page, 'raise').click();
    } else {
      await byId(page, 'passive').click();
    }
  }
}
