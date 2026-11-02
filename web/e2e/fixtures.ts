import { expect, test as base } from '@playwright/test';
import type { Page } from '@playwright/test';
import { startingStack, TOURNAMENT } from '../src/engine/index.ts';
import { byId } from './shared.ts';
import { refuseConversation } from './conversationServer.ts';

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
      await refuseConversation(page);
      await use(problems);
      expect(problems).toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
export { byId, playToTheEnd, waitForWaypoint } from './shared.ts';
export type { Waypoint } from './shared.ts';

export const FAST_URL = '/?seed=42&botDelay=0&autoNext=off';
export const TOTAL_CHIPS = 2 * startingStack(TOURNAMENT);

export async function stackOf(page: Page, seat: 0 | 1): Promise<number> {
  const text = (await byId(page, `stack-${seat}`).innerText()).replace(/[^0-9]/g, '');
  return Number(text);
}
