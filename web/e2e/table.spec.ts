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

test('the floating hand log stops above the action bar on a laptop screen', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'the floating panel is a landscape layout');
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto(FAST_URL);
  await byId(page, 'start-tournament').click();
  await expect(byId(page, 'raise')).toBeEnabled();
  await byId(page, 'hand-log-toggle').click();
  await expect(byId(page, 'hand-log')).toBeVisible();
  const gap = await page.evaluate(() => {
    const drawer = document.querySelector('[data-testid="hand-log"]') as HTMLElement;
    const bar = document.querySelector('.action-bar') as HTMLElement;
    const top = drawer.getBoundingClientRect().top;
    return bar.getBoundingClientRect().top - (top + parseFloat(getComputedStyle(drawer).maxHeight));
  });
  expect(gap).toBeGreaterThanOrEqual(0);
  const box = await byId(page, 'raise').boundingBox();
  if (box === null) {
    throw new Error('raise has no box');
  }
  const hit = await page.evaluate(
    ([x, y]) =>
      document.elementFromPoint(x as number, y as number)?.closest('[data-testid="raise"]') !==
      null,
    [box.x + box.width / 2, box.y + box.height / 2],
  );
  expect(hit).toBe(true);
});

test('the hand log is a full height sheet on a short landscape screen', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'the short landscape layout');
  await page.setViewportSize({ width: 900, height: 500 });
  await page.goto(FAST_URL);
  await byId(page, 'start-tournament').click();
  await expect(byId(page, 'passive')).toBeEnabled();
  await byId(page, 'hand-log-toggle').click();
  await expect(byId(page, 'hand-log')).toBeVisible();
  const box = await byId(page, 'hand-log').boundingBox();
  expect(box?.y).toBe(0);
  expect(box?.height).toBe(500);
  await expect(byId(page, 'hand-log-scrim')).toBeVisible();
});
