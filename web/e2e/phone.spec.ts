import type { Page } from '@playwright/test';
import { byId, expect, FAST_URL, test } from './fixtures.ts';

const MARGIN = 16;

async function startOnPhone(page: Page) {
  const viewport = page.viewportSize();
  test.skip(viewport === null || viewport.width >= viewport.height, 'phones only');
  await page.goto(FAST_URL);
  await byId(page, 'start-tournament').click();
  await expect(byId(page, 'passive')).toBeEnabled();
  return viewport ?? { width: 390, height: 844 };
}

async function box(page: Page, selector: string) {
  const found = await page.locator(selector).first().boundingBox();
  if (found === null) {
    throw new Error(`${selector} is not laid out`);
  }
  return found;
}

test('the scene spans the full width without a frame', async ({ page }) => {
  const viewport = await startOnPhone(page);
  const frame = await box(page, '[data-testid="face-frame"]');
  expect(frame.x).toBeLessThanOrEqual(0.5);
  expect(frame.width).toBeGreaterThanOrEqual(viewport.width - 1);
  const radius = await byId(page, 'face-frame').evaluate(
    (node) => getComputedStyle(node).borderTopLeftRadius,
  );
  expect(radius).toBe('0px');
});

test('raise sizing and actions share the 16 px side margins', async ({ page }) => {
  const viewport = await startOnPhone(page);
  for (const selector of ['.bet-presets', '.bet-slider', '.action-buttons']) {
    const found = await box(page, selector);
    expect(Math.round(found.x)).toBe(MARGIN);
    expect(Math.round(viewport.width - found.x - found.width)).toBe(MARGIN);
  }
});

test('touch targets follow the platform minimums', async ({ page }) => {
  await startOnPhone(page);
  for (const id of ['fold', 'passive', 'raise']) {
    expect((await box(page, `[data-testid="${id}"]`)).height).toBeGreaterThanOrEqual(56);
  }
  for (const id of ['preset-half', 'preset-pot', 'preset-allin', 'raise-less', 'raise-more']) {
    const found = await box(page, `[data-testid="${id}"]`);
    expect(found.height).toBeGreaterThanOrEqual(44);
    expect(found.width).toBeGreaterThanOrEqual(44);
  }
});

test('the size shows on the Raise button, not above the presets', async ({ page }) => {
  await startOnPhone(page);
  await expect(byId(page, 'raise-size')).toBeHidden();
  await expect(byId(page, 'raise')).toContainText(/\d/);
});

test('the pot sits at the left margin beside your cards', async ({ page }) => {
  await startOnPhone(page);
  const pot = await box(page, '[data-testid="pot"]');
  const cards = await box(page, '[data-testid="seat-0"] .seat-cards');
  expect(Math.round(pot.x)).toBe(MARGIN);
  const middle = pot.y + pot.height / 2;
  expect(middle).toBeGreaterThan(cards.y);
  expect(middle).toBeLessThan(cards.y + cards.height);
});

test('your bet stands above the dealer slot, which sits by your block', async ({ page }) => {
  await startOnPhone(page);
  const slot = await box(page, '[data-testid="seat-0"] .dealer-slot');
  const block = await box(page, '[data-testid="seat-0"] .seat-block');
  const middle = slot.y + slot.height / 2;
  expect(middle).toBeGreaterThan(block.y);
  expect(middle).toBeLessThan(block.y + block.height);
  const bet = page.locator('[data-testid="bet-0"]');
  if ((await bet.count()) > 0) {
    const chips = await box(page, '[data-testid="bet-0"]');
    expect(chips.y + chips.height).toBeLessThan(slot.y);
  }
});

test('the hand log opens from the menu and has no button of its own', async ({ page }) => {
  await startOnPhone(page);
  await expect(byId(page, 'hand-log-toggle')).toBeHidden();
  await page.locator('.menu-summary').click();
  await byId(page, 'menu-log').click();
  await expect(byId(page, 'hand-log')).toBeVisible();
});

test('the whole table fits one screen without scrolling', async ({ page }) => {
  const viewport = await startOnPhone(page);
  for (const id of ['face-frame', 'board', 'pot', 'fold', 'passive', 'raise', 'raise-amount']) {
    await expect(byId(page, id)).toBeInViewport({ ratio: 1 });
  }
  expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(
    viewport.height,
  );
});

test('the table stays put while she acts and when a hand ends', async ({ page }) => {
  const viewport = page.viewportSize();
  test.skip(viewport === null || viewport.width >= viewport.height, 'phones only');
  await page.goto(FAST_URL.replace('botDelay=0', 'botDelay=400'));
  await byId(page, 'start-tournament').click();
  await expect(byId(page, 'passive')).toBeEnabled();
  const top = async () => (await box(page, '[data-testid="board"]')).y;
  const resting = await top();
  for (let step = 0; step < 6; step += 1) {
    const next = byId(page, 'next-hand');
    await ((await next.isVisible()) ? next : byId(page, 'passive')).click();
    for (let sample = 0; sample < 6; sample += 1) {
      expect(Math.abs((await top()) - resting)).toBeLessThan(1);
      await page.waitForTimeout(120);
    }
    await expect(byId(page, 'passive').and(page.locator(':enabled')).or(next)).toBeVisible();
  }
});

test('the pot stacks its word over the number beside your cards', async ({ page }) => {
  await startOnPhone(page);
  const word = await box(page, '[data-testid="pot"] .pot-word');
  const number = await box(page, '[data-testid="pot"] .pot-number');
  expect(number.y).toBeGreaterThanOrEqual(word.y + word.height - 1);
  const pot = await box(page, '[data-testid="pot"]');
  const cards = await box(page, '[data-testid="seat-0"] .seat-cards');
  expect(pot.x + pot.width).toBeLessThanOrEqual(cards.x - 8);
});

test('your action strip stays in full view above the raise sizing', async ({ page }) => {
  await startOnPhone(page);
  await byId(page, 'passive').click();
  const strip = byId(page, 'action-0');
  await expect(strip).toBeVisible();
  const found = await box(page, '[data-testid="action-0"]');
  const presets = await box(page, '.action-panel');
  expect(found.y + found.height).toBeLessThanOrEqual(presets.y);
  await expect(strip).toBeInViewport({ ratio: 1 });
});
