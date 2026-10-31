import type { BrowserContext, Page } from '@playwright/test';
import { byId, expect, FAST_URL, test, waitForWaypoint } from './fixtures.ts';

const SOLVER_TIMEOUT_MS = 120_000;

declare global {
  interface Window {
    __botTurns: { board: number; ms: number }[];
  }
}

const BOT_TURN_TRACKER = `
  window.__botTurns = [];
  let started = null;
  let board = 0;
  new MutationObserver(() => {
    const thinking = document.querySelector('.seat-top [data-testid^="thinking-"]') !== null;
    if (thinking && started === null) {
      started = performance.now();
    }
    if (thinking) {
      board = document.querySelectorAll('[data-testid="board"] [data-testid="card"]').length;
    }
    if (!thinking && started !== null) {
      window.__botTurns.push({ board, ms: performance.now() - started });
      started = null;
    }
  }).observe(document, { childList: true, subtree: true });
`;

const DECISION_BUDGET_MS = 5000;
const TURN_BOARD = 4;

interface Played {
  loaded: string[];
  bots: { id: string; version: string }[];
}

async function playAgainst(page: Page, context: BrowserContext, opponent: string): Promise<Played> {
  const loaded: string[] = [];
  context.on('response', (response) => {
    const path = new URL(response.url()).pathname;
    if (response.ok() && /\.(wasm|gz)$/.test(path)) {
      loaded.push(path.endsWith('.wasm') ? 'wasm' : (path.split('/').pop() ?? path));
    }
  });
  await page.goto(FAST_URL);
  await byId(page, `opponent-${opponent}`).click();
  await expect(byId(page, `opponent-${opponent}`)).toHaveAttribute('aria-pressed', 'true');
  await byId(page, 'start-cash').click();
  let hands = 0;
  while (hands < 3) {
    const waypoint = await waitForWaypoint(page);
    if (waypoint === 'next-hand') {
      hands += 1;
      await byId(page, 'next-hand').click();
    } else {
      await byId(page, 'passive').click();
    }
  }
  const bots = await page.evaluate(
    () =>
      new Promise<{ id: string; version: string }[]>((resolve, reject) => {
        const open = indexedDB.open('mallorca');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const all = open.result.transaction('hands').objectStore('hands').getAll();
          all.onerror = () => reject(all.error);
          all.onsuccess = () =>
            resolve(all.result.map((r: { bot: { id: string; version: string } }) => r.bot));
        };
      }),
  );
  return { loaded, bots };
}

test('the solver loads in the worker and plays cash hands', async ({ page, context }) => {
  test.setTimeout(SOLVER_TIMEOUT_MS);
  const { loaded, bots } = await playAgainst(page, context, 'cfr');
  expect(loaded.map((l) => (l === 'wasm' ? l : 'strategy')).sort()).toEqual(['strategy', 'wasm']);
  expect(bots.length).toBeGreaterThanOrEqual(3);
  expect(new Set(bots.map((b) => b.id))).toEqual(new Set(['cfr']));
});

test('the v2 solver loads its own file and plays cash hands on desktop', async ({
  page,
  context,
  isMobile,
}) => {
  test.skip(isMobile, 'the v2 solver is offered on desktop only');
  test.setTimeout(SOLVER_TIMEOUT_MS);
  const { loaded, bots } = await playAgainst(page, context, 'cfr-v2');
  expect(loaded.filter((l) => l !== 'wasm').every((l) => l.startsWith('v2'))).toBe(true);
  expect(loaded).toContain('wasm');
  expect(bots.length).toBeGreaterThanOrEqual(3);
  expect(new Set(bots.map((b) => b.version))).toEqual(new Set(['v2-10']));
});

test('a phone is not offered the v2 solver', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'a phone check');
  await page.goto(FAST_URL);
  await expect(byId(page, 'opponent-cfr')).toBeVisible();
  await expect(byId(page, 'opponent-cfr-v2')).toHaveCount(0);
});

test('the solver decides every turn and river within the 5 s fallback budget', async ({ page }) => {
  test.setTimeout(SOLVER_TIMEOUT_MS * 2);
  await page.addInitScript(BOT_TURN_TRACKER);
  await page.goto(FAST_URL);
  await byId(page, 'opponent-cfr').click();
  await byId(page, 'start-cash').click();
  let hands = 0;
  while (hands < 3) {
    const waypoint = await waitForWaypoint(page);
    if (waypoint === 'next-hand') {
      hands += 1;
      await byId(page, 'next-hand').click();
    } else {
      await byId(page, 'passive').click();
    }
  }
  const turns = await page.evaluate(() => window.__botTurns);
  test.info().annotations.push({ type: 'bot decisions', description: JSON.stringify(turns) });
  expect(turns.length).toBeGreaterThan(0);
  expect(turns.filter((turn) => turn.board >= TURN_BOARD).length).toBeGreaterThan(0);
  expect(turns.filter((turn) => turn.ms >= DECISION_BUDGET_MS)).toEqual([]);
});
