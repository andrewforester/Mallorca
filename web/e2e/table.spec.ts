import { byId, expect, FAST_URL, test } from './fixtures.ts';

test('the table marks stay inside the viewport on the first turn', async ({ page }) => {
  const viewport = page.viewportSize();
  if (viewport === null) {
    throw new Error('viewport is not set');
  }
  await page.goto(FAST_URL);
  await byId(page, 'start-tournament').click();
  await expect(byId(page, 'passive')).toBeEnabled();
  for (const id of ['dealer-button', 'bet-0', 'bet-1', 'pot', 'board']) {
    await expect(byId(page, id)).toBeVisible();
    await expect(byId(page, id)).toBeInViewport({ ratio: 1 });
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    viewport.width,
  );
});

test('the hand log drawer opens inside the viewport and closes on Escape', async ({ page }) => {
  const viewport = page.viewportSize();
  if (viewport === null) {
    throw new Error('viewport is not set');
  }
  await page.goto(FAST_URL);
  await byId(page, 'start-tournament').click();
  await expect(byId(page, 'passive')).toBeEnabled();
  await byId(page, 'passive').click();
  await byId(page, 'hand-log-toggle').click();
  await expect(byId(page, 'hand-log')).toBeVisible();
  await expect(byId(page, 'hand-log')).toBeInViewport({ ratio: 1 });
  await expect(byId(page, 'hand-log-close')).toBeInViewport({ ratio: 1 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    viewport.width,
  );
  await page.keyboard.press('Escape');
  await expect(byId(page, 'hand-log')).toBeHidden();
});
