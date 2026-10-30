import { byId, expect, FAST_URL, test } from './fixtures.ts';

const CONTROLS = ['fold', 'passive', 'raise'];

test('the start screen and the table fit the viewport without horizontal scroll', async ({
  page,
}) => {
  const viewport = page.viewportSize();
  if (viewport === null) {
    throw new Error('viewport is not set');
  }
  const scrollWidth = () => page.evaluate(() => document.documentElement.scrollWidth);
  await page.goto(FAST_URL);
  expect(await scrollWidth()).toBeLessThanOrEqual(viewport.width);
  await byId(page, 'start-tournament').click();
  await expect(byId(page, 'passive')).toBeEnabled();
  expect(await scrollWidth()).toBeLessThanOrEqual(viewport.width);
  for (const id of CONTROLS) {
    await expect(byId(page, id)).toBeInViewport({ ratio: 1 });
  }
  for (const id of ['preset-half', 'preset-pot', 'preset-allin', 'raise-amount']) {
    await expect(byId(page, id)).toBeInViewport({ ratio: 1 });
  }
});

test('the cash table and the session summary fit the viewport', async ({ page }) => {
  const viewport = page.viewportSize();
  if (viewport === null) {
    throw new Error('viewport is not set');
  }
  const scrollWidth = () => page.evaluate(() => document.documentElement.scrollWidth);
  await page.goto(FAST_URL);
  await byId(page, 'start-cash').click();
  await expect(byId(page, 'passive')).toBeEnabled();
  expect(await scrollWidth()).toBeLessThanOrEqual(viewport.width);
  for (const id of [...CONTROLS, 'session-result', 'leave']) {
    await expect(byId(page, id)).toBeInViewport({ ratio: 1 });
  }
  await byId(page, 'fold').click();
  await expect(byId(page, 'leave')).toBeEnabled();
  await byId(page, 'leave').click();
  await expect(byId(page, 'session-over')).toBeInViewport({ ratio: 1 });
  expect(await scrollWidth()).toBeLessThanOrEqual(viewport.width);
});

test('the cash status bar keeps long values inside the viewport', async ({ page }) => {
  const viewport = page.viewportSize();
  if (viewport === null) {
    throw new Error('viewport is not set');
  }
  await page.goto(FAST_URL);
  await byId(page, 'start-cash').click();
  await expect(byId(page, 'passive')).toBeEnabled();
  await page.evaluate(() => {
    const set = (id: string, text: string) => {
      const node = document.querySelector(`[data-testid="${id}"]`);
      if (node !== null) {
        node.textContent = text;
      }
    };
    set('session-result', '-123456789012.5 bb');
    set('hand-number', 'Hand 1000');
    set('blinds', 'Blinds 10/20');
  });
  const bar = page.locator('.status-bar');
  const overflow = await bar.evaluate((node) => node.scrollWidth - node.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    viewport.width,
  );
  for (const id of ['session-result', 'hand-number', 'leave']) {
    await expect(byId(page, id)).toBeInViewport({ ratio: 1 });
  }
  await page.locator('summary.menu-summary').click();
  await expect(byId(page, 'clear-history')).toBeInViewport({ ratio: 1 });
});

for (const viewport of [
  { width: 360, height: 740 },
  { width: 390, height: 844 },
]) {
  test(`the cash status values are readable in full at ${viewport.width}x${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto(FAST_URL);
    await byId(page, 'start-cash').click();
    await expect(byId(page, 'passive')).toBeEnabled();
    const clipped = await page.evaluate(() =>
      ['blinds', 'session-result', 'hand-number'].filter((id) => {
        const node = document.querySelector(`[data-testid="${id}"]`);
        return node === null || node.scrollWidth > node.clientWidth;
      }),
    );
    expect(clipped).toEqual([]);
  });
}

test('the cash status bar shows every value without clipping when the text runs wider', async ({
  page,
}) => {
  await page.goto(FAST_URL);
  await byId(page, 'start-cash').click();
  await expect(byId(page, 'passive')).toBeEnabled();
  await page.addStyleTag({ content: '.status-bar { letter-spacing: 0.12em; }' });
  const leave = await byId(page, 'leave').boundingBox();
  const bar = await page.locator('.status-bar').boundingBox();
  const info = await page.locator('.status-info').boundingBox();
  const values = await Promise.all(
    ['blinds', 'session-result', 'hand-number'].map((id) => byId(page, id).boundingBox()),
  );
  if (leave === null || bar === null || info === null || values.includes(null)) {
    throw new Error('status bar is not rendered');
  }
  const tops = values.map((box) => box?.y ?? 0);
  expect(Math.max(...tops) - Math.min(...tops)).toBeLessThan(2);
  expect(bar.height).toBeLessThan(leave.height * 2);
  expect(info.height).toBeLessThan(leave.height);
  const clipped = await page.evaluate(() =>
    ['blinds', 'session-result', 'hand-number'].filter((id) => {
      const node = document.querySelector(`[data-testid="${id}"]`);
      return node === null || node.scrollWidth > node.clientWidth;
    }),
  );
  expect(clipped).toEqual([]);
  for (const id of [...CONTROLS, 'session-result', 'leave']) {
    await expect(byId(page, id)).toBeInViewport({ ratio: 1 });
  }
});

test('long amounts stay inside the small phone', async ({ page }) => {
  const viewport = page.viewportSize();
  if (viewport === null) {
    throw new Error('viewport is not set');
  }
  await page.goto(FAST_URL);
  await byId(page, 'start-tournament').click();
  await expect(byId(page, 'passive')).toBeEnabled();
  await byId(page, 'preset-allin').click();
  await expect(byId(page, 'raise')).toContainText('2000');
  for (const id of CONTROLS) {
    await expect(byId(page, id)).toBeInViewport({ ratio: 1 });
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    viewport.width,
  );
  const overflowing = await page.evaluate(() =>
    ['fold', 'passive', 'raise'].filter((id) => {
      const node = document.querySelector(`[data-testid="${id}"]`);
      return node !== null && node.scrollWidth > node.clientWidth;
    }),
  );
  expect(overflowing).toEqual([]);
});

for (const viewport of [
  { width: 360, height: 740 },
  { width: 1440, height: 900 },
]) {
  test(`the simple table keeps every control visible at ${viewport.width}x${viewport.height}`, async ({
    page,
  }) => {
    await page.addInitScript(() => localStorage.setItem('mallorca.tableStyle', 'simple'));
    await page.setViewportSize(viewport);
    await page.goto(FAST_URL);
    await expect(byId(page, 'scene')).toHaveClass(/scene-simple/);
    await byId(page, 'start-tournament').click();
    await expect(byId(page, 'passive')).toBeEnabled();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      viewport.width,
    );
    for (const id of [...CONTROLS, 'preset-half', 'preset-pot', 'preset-allin', 'raise-amount']) {
      await expect(byId(page, id)).toBeInViewport({ ratio: 1 });
    }
  });
}

for (const viewport of [
  { width: 844, height: 390 },
  { width: 1280, height: 600 },
]) {
  test(`a short landscape screen keeps every control visible at ${viewport.width}x${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    const scrollWidth = () => page.evaluate(() => document.documentElement.scrollWidth);
    await page.goto(FAST_URL);
    await byId(page, 'start-tournament').click();
    await expect(byId(page, 'passive')).toBeEnabled();
    expect(await scrollWidth()).toBeLessThanOrEqual(viewport.width);
    for (const id of [...CONTROLS, 'preset-half', 'preset-pot', 'preset-allin', 'raise-amount']) {
      await expect(byId(page, id)).toBeInViewport({ ratio: 1 });
    }
  });
}
