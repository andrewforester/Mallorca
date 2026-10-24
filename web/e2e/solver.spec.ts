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

const CPU_THROTTLE = 4;
const DECISION_BUDGET_MS = 5000;
const TURN_BOARD = 4;

test('the solver loads in the worker and plays cash hands', async ({ page, context }) => {
  test.setTimeout(SOLVER_TIMEOUT_MS);
  const loaded: string[] = [];
  context.on('response', (response) => {
    const path = new URL(response.url()).pathname;
    if (response.ok() && /\.(wasm|gz)$/.test(path)) {
      loaded.push(path.endsWith('.wasm') ? 'wasm' : 'strategy');
    }
  });
  await page.goto(FAST_URL);
  await byId(page, 'opponent-cfr').click();
  await expect(byId(page, 'opponent-cfr')).toHaveAttribute('aria-pressed', 'true');
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
  expect(loaded.sort()).toEqual(['strategy', 'wasm']);
  const bots = await page.evaluate(
    () =>
      new Promise<string[]>((resolve, reject) => {
        const open = indexedDB.open('mallorca');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const all = open.result.transaction('hands').objectStore('hands').getAll();
          all.onerror = () => reject(all.error);
          all.onsuccess = () => resolve(all.result.map((r: { bot: { id: string } }) => r.bot.id));
        };
      }),
  );
  expect(bots.length).toBeGreaterThanOrEqual(3);
  expect(new Set(bots)).toEqual(new Set(['cfr']));
});

test('the solver decides within the budget under a 4x CPU throttle', async ({ page }) => {
  test.setTimeout(SOLVER_TIMEOUT_MS * 2);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU_THROTTLE });
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
