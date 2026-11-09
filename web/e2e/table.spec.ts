import type { Page } from '@playwright/test';
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

async function raiseIsClickable(page: Page): Promise<boolean> {
  const box = await byId(page, 'raise').boundingBox();
  if (box === null) {
    throw new Error('raise has no box');
  }
  return page.evaluate(
    ([x, y]) =>
      document.elementFromPoint(x as number, y as number)?.closest('[data-testid="raise"]') !==
      null,
    [box.x + box.width / 2, box.y + box.height / 2],
  );
}

for (const viewport of [
  { width: 1280, height: 720 },
  { width: 900, height: 500 },
]) {
  test(`the hand log takes the left column and leaves the actions in play at ${viewport.width}x${viewport.height}`, async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'the three column layout');
    await page.setViewportSize(viewport);
    await page.goto(FAST_URL);
    await byId(page, 'start-tournament').click();
    await expect(byId(page, 'raise')).toBeEnabled();
    await byId(page, 'hand-log-toggle').click();
    await expect(byId(page, 'hand-log')).toBeInViewport({ ratio: 1 });
    const log = await byId(page, 'hand-log').boundingBox();
    const frame = await byId(page, 'face-frame').boundingBox();
    expect((log?.x ?? 0) + (log?.width ?? 0)).toBeLessThanOrEqual(frame?.x ?? 0);
    expect(await raiseIsClickable(page)).toBe(true);
  });
}

test('on a phone the hand log replaces the board under her face and the actions stay', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name === 'desktop', 'the phone layout');
  await page.goto(FAST_URL);
  await byId(page, 'start-tournament').click();
  await expect(byId(page, 'raise')).toBeEnabled();
  await byId(page, 'hand-log-toggle').click();
  await expect(byId(page, 'hand-log')).toBeInViewport({ ratio: 1 });
  await expect(byId(page, 'face-frame')).toBeInViewport();
  await expect(byId(page, 'board')).toBeHidden();
  expect(await raiseIsClickable(page)).toBe(true);
});
