import { readFile } from 'node:fs/promises';
import type { Page } from '@playwright/test';
import {
  byId,
  expect,
  FAST_URL,
  playToTheEnd,
  stackOf,
  test,
  TOTAL_CHIPS,
  waitForWaypoint,
} from './fixtures.ts';

const ALL_IN_TIMEOUT_MS = 600_000;

test('the production build has no emotion debug panel', async ({ page }) => {
  await page.goto(FAST_URL);
  await byId(page, 'start-cash').click();
  await expect(byId(page, 'fold')).toBeVisible();
  await expect(byId(page, 'emotion-debug-toggle')).toHaveCount(0);
  await expect(byId(page, 'emotion-debug')).toHaveCount(0);
});

test('a passive hand ends with the chips conserved', async ({ page }) => {
  await page.goto(FAST_URL);
  await byId(page, 'start-tournament').click();
  for (;;) {
    const waypoint = await waitForWaypoint(page);
    if (waypoint === 'next-hand') {
      break;
    }
    expect(waypoint).toBe('act');
    await byId(page, 'passive').click();
  }
  await expect(byId(page, 'result')).toBeVisible();
  expect((await stackOf(page, 0)) + (await stackOf(page, 1))).toBe(TOTAL_CHIPS);
  const replies = await page.evaluate(() => window.__workerReplies);
  const created = await page.evaluate(() => window.__workerCreated);
  expect(created).toBeGreaterThan(0);
  expect(replies).toBeGreaterThan(0);
});

test('all in on every hand ends the tournament and play again returns to a fresh table', async ({
  page,
}) => {
  test.setTimeout(ALL_IN_TIMEOUT_MS);
  await page.goto(FAST_URL);
  await byId(page, 'start-tournament').click();
  for (;;) {
    const waypoint = await waitForWaypoint(page);
    if (waypoint === 'tournament-over') {
      break;
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
  await expect(byId(page, 'tournament-over')).toBeVisible();
  const total = (await stackOf(page, 0)) + (await stackOf(page, 1));
  expect(total).toBe(TOTAL_CHIPS);
  expect(Math.min(await stackOf(page, 0), await stackOf(page, 1))).toBe(0);
  await byId(page, 'play-again').click();
  await expect(byId(page, 'tournament-over')).toHaveCount(0);
  await expect(byId(page, 'start-tournament')).toBeVisible();
  await byId(page, 'start-tournament').click();
  await expect(byId(page, 'hand-number')).toContainText('1');
  for (const seat of [0, 1] as const) {
    const stack = await stackOf(page, seat);
    expect(stack).toBeGreaterThan(1900);
    expect(stack).toBeLessThanOrEqual(2000);
  }
});

test('leaving for tonight returns to a farewell start screen', async ({ page }) => {
  test.setTimeout(ALL_IN_TIMEOUT_MS);
  await page.goto(FAST_URL);
  await byId(page, 'start-tournament').click();
  await playToTheEnd(page);
  await byId(page, 'leave-tonight').click();
  await expect(byId(page, 'tournament-over')).toHaveCount(0);
  await expect(byId(page, 'farewell')).toHaveText('Sleep well. The table will be here.');
  await byId(page, 'start-tournament').click();
  await expect(byId(page, 'hand-number')).toContainText('1');
  await page.reload();
  await expect(byId(page, 'start-tournament')).toBeVisible();
  await expect(byId(page, 'farewell')).toHaveCount(0);
});

test('the next hand starts by itself after a fold', async ({ page }) => {
  await page.goto('/?seed=42&botDelay=0');
  await byId(page, 'start-tournament').click();
  await expect(byId(page, 'fold')).toBeEnabled();
  await byId(page, 'fold').click();
  await expect(byId(page, 'next-hand')).toBeVisible();
  await expect(byId(page, 'hand-number')).toHaveText('Hand 2', { timeout: 3000 });
  await expect(byId(page, 'next-hand')).toHaveCount(0);
});

test('reloading in the middle of a hand shows the start screen', async ({ page }) => {
  await page.goto(FAST_URL);
  await byId(page, 'start-tournament').click();
  await expect(byId(page, 'passive')).toBeEnabled();
  await page.reload();
  await expect(byId(page, 'start-tournament')).toBeVisible();
  await expect(byId(page, 'passive')).toHaveCount(0);
});

test('a cash game is played for a hand, left, and the session summary shows one hand', async ({
  page,
}) => {
  await page.goto('/?seed=3&botDelay=0');
  await byId(page, 'start-cash').click();
  await expect(byId(page, 'session-result')).toBeVisible();
  await expect(byId(page, 'leave')).toBeDisabled();
  for (;;) {
    const waypoint = await waitForWaypoint(page);
    if (waypoint === 'next-hand') {
      break;
    }
    expect(waypoint).toBe('act');
    await byId(page, 'passive').click();
  }
  await expect(byId(page, 'leave')).toBeEnabled();
  await byId(page, 'leave').click();
  await expect(byId(page, 'session-over')).toBeVisible();
  await expect(byId(page, 'session-summary')).toContainText('over 1 hand');
  await byId(page, 'play-again').click();
  await expect(byId(page, 'start-cash')).toBeVisible();
});

async function playHandToEnd(page: Page): Promise<void> {
  for (;;) {
    const waypoint = await waitForWaypoint(page);
    if (waypoint === 'next-hand') {
      return;
    }
    expect(waypoint).toBe('act');
    await byId(page, 'passive').click();
  }
}

async function downloadJson(page: Page, id: string): Promise<unknown[]> {
  const pending = page.waitForEvent('download');
  await byId(page, id).click();
  const download = await pending;
  const path = await download.path();
  return JSON.parse(await readFile(path, 'utf8')) as unknown[];
}

test('hand history is exported, persists across a reload and is cleared', async ({ page }) => {
  await page.goto('/?seed=3&botDelay=0');
  await byId(page, 'start-cash').click();
  await playHandToEnd(page);
  await byId(page, 'next-hand').click();
  await playHandToEnd(page);
  await byId(page, 'leave').click();
  await expect(byId(page, 'session-over')).toBeVisible();
  expect(await downloadJson(page, 'export-json')).toHaveLength(2);
  await page.reload();
  await byId(page, 'start-cash').click();
  await page.locator('summary.menu-summary').click();
  expect((await downloadJson(page, 'export-all-json')).length).toBeGreaterThanOrEqual(2);
  await byId(page, 'clear-history').click();
  await expect(byId(page, 'clear-history')).toHaveText('Tap again to clear');
  expect((await downloadJson(page, 'export-all-json')).length).toBeGreaterThanOrEqual(2);
  await byId(page, 'clear-history').click();
  expect(await downloadJson(page, 'export-all-json')).toEqual([]);
});
