import type { Locator, Page } from '@playwright/test';
import { byId, expect, FAST_URL, LAB_URL, test } from './fixtures.ts';
import { serveConversation } from './conversationServer.ts';

const MARGIN = 16;
const SOLVER_TIMEOUT_MS = 180_000;
const COACH_TIMEOUT_MS = 120_000;

function phoneOnly(page: Page) {
  const viewport = page.viewportSize();
  test.skip(viewport === null || viewport.width >= viewport.height, 'phones only');
  return viewport ?? { width: 390, height: 844 };
}

async function box(locator: Locator) {
  const found = await locator.first().boundingBox();
  if (found === null) {
    throw new Error('not laid out');
  }
  return found;
}

async function expectApart(a: Locator, b: Locator) {
  const [x, y] = [await box(a), await box(b)];
  const apart =
    x.x + x.width <= y.x || y.x + y.width <= x.x || x.y + x.height <= y.y || y.y + y.height <= x.y;
  expect(apart).toBe(true);
}

async function expectNewFrame(page: Page, viewport: { width: number }) {
  const frame = await box(byId(page, 'face-frame'));
  expect(frame.x).toBeLessThanOrEqual(0.5);
  expect(frame.x + frame.width).toBeLessThanOrEqual(viewport.width + 0.5);
  expect(frame.width).toBeGreaterThanOrEqual(viewport.width - 1);
  const radius = await byId(page, 'face-frame').evaluate(
    (node) => getComputedStyle(node).borderTopLeftRadius,
  );
  expect(radius).toBe('0px');
  const hand = await box(byId(page, 'hand-number'));
  const menu = await box(page.locator('summary.menu-summary'));
  expect(Math.abs(hand.y + hand.height / 2 - (menu.y + menu.height / 2))).toBeLessThan(8);
  await expect(byId(page, 'seat-0').locator('.seat-cards')).toBeInViewport({ ratio: 1 });
  await expect(byId(page, 'board')).toBeInViewport({ ratio: 1 });
}

async function expectSheet(page: Page, sheet: Locator, viewport: { width: number }) {
  const found = await box(sheet);
  expect(Math.round(found.x)).toBe(MARGIN);
  expect(Math.round(viewport.width - found.x - found.width)).toBe(MARGIN);
  await expectApart(sheet, byId(page, 'seat-0').locator('.seat-cards'));
  await expectApart(sheet, page.locator('.action-buttons'));
}

test('the hand line reads Hand 1 · 10/20', async ({ page }) => {
  phoneOnly(page);
  await page.goto(FAST_URL);
  await byId(page, 'start-tournament').click();
  await expect(byId(page, 'passive')).toBeEnabled();
  const hand = await box(byId(page, 'hand-number'));
  const blinds = await box(byId(page, 'blinds'));
  expect(hand.x + hand.width).toBeLessThan(blinds.x);
  expect(Math.abs(hand.y - blinds.y)).toBeLessThan(2);
  await expect(byId(page, 'hand-number')).toHaveText('Hand 1');
  expect(await byId(page, 'blinds').evaluate((node) => (node as HTMLElement).innerText)).toBe(
    '10/20',
  );
});

test('the coach layer keeps the new scene, your cards and the board', async ({ page }) => {
  test.setTimeout(COACH_TIMEOUT_MS);
  const viewport = phoneOnly(page);
  await page.goto(LAB_URL);
  await byId(page, 'start-coach').check();
  await byId(page, 'start-cash').click();
  await expect(byId(page, 'passive')).toBeEnabled();
  await byId(page, 'coach-toggle').click();
  await expect(byId(page, 'coach-hint')).toBeVisible({ timeout: COACH_TIMEOUT_MS });
  await expectNewFrame(page, viewport);
  await expectSheet(page, page.locator('.coach-sheet'), viewport);
  const surface = await page
    .locator('.coach-sheet')
    .evaluate((node) => getComputedStyle(node).backgroundColor);
  expect(surface).toBe('rgb(255, 255, 255)');
});

test('the talk layer keeps the new scene and an input clear of the actions', async ({ page }) => {
  test.setTimeout(SOLVER_TIMEOUT_MS);
  const viewport = phoneOnly(page);
  await serveConversation(page, () => ({ status: 200, body: {} }));
  await page.goto(LAB_URL);
  await byId(page, 'opponent-cfr').click();
  await byId(page, 'start-cash').click();
  await expect(byId(page, 'passive')).toBeEnabled({ timeout: SOLVER_TIMEOUT_MS });
  await page.locator('.status-bar').getByTestId('chat-open').click();
  const sheet = byId(page, 'chat-sheet');
  await expect(sheet).toBeVisible();
  await expectNewFrame(page, viewport);
  await expectSheet(page, sheet, viewport);
  const input = sheet.locator('.chat-input');
  await expect(input).toBeInViewport({ ratio: 1 });
  await expectApart(input, page.locator('.action-buttons'));
});
