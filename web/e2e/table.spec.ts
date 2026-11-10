import type { Page } from '@playwright/test';
import { byId, expect, FAST_URL, openHandLog, test, waitForWaypoint } from './fixtures.ts';

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
  await openHandLog(page);
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
    await openHandLog(page);
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
  await openHandLog(page);
  await expect(byId(page, 'hand-log')).toBeInViewport({ ratio: 1 });
  await expect(byId(page, 'face-frame')).toBeInViewport();
  await expect(byId(page, 'board')).toBeHidden();
  expect(await raiseIsClickable(page)).toBe(true);
});

test('bets of both seats share one column', async ({ page }) => {
  await page.goto(FAST_URL);
  await byId(page, 'start-tournament').click();
  await expect(byId(page, 'passive')).toBeEnabled();
  const [mine, hers] = await Promise.all([
    byId(page, 'bet-0').boundingBox(),
    byId(page, 'bet-1').boundingBox(),
  ]);
  expect(Math.abs((mine?.x ?? 0) - (hers?.x ?? 100))).toBeLessThanOrEqual(2);
});

test('a long stack stays in its block', async ({ page }) => {
  await page.goto(FAST_URL);
  await byId(page, 'start-tournament').click();
  await expect(byId(page, 'passive')).toBeEnabled();
  await byId(page, 'stack-0').evaluate((node) => {
    node.textContent = '123 456';
  });
  const stack = await byId(page, 'stack-0').boundingBox();
  const block = await page.locator('[data-testid="seat-0"] .seat-block').boundingBox();
  if (stack === null || block === null) {
    throw new Error('the stack or its block is not laid out');
  }
  expect(stack.x).toBeGreaterThanOrEqual(block.x);
  expect(stack.x + stack.width).toBeLessThanOrEqual(block.x + block.width);
});

test('wide screens have no top bar', async ({ page }) => {
  const viewport = page.viewportSize();
  test.skip(viewport === null || viewport.width < viewport.height || viewport.height < 561);
  await page.goto(FAST_URL);
  await byId(page, 'start-cash').click();
  await expect(byId(page, 'passive')).toBeEnabled();
  const bar = await page.locator('.status-bar').boundingBox();
  const right = await page.locator('.table-right').boundingBox();
  const face = await byId(page, 'face-frame').boundingBox();
  if (bar === null || right === null || face === null) {
    throw new Error('the table is not laid out');
  }
  expect(bar.x).toBeGreaterThanOrEqual(right.x - 1);
  expect(bar.x + bar.width).toBeLessThanOrEqual(right.x + right.width + 1);
  expect(face.y).toBeLessThanOrEqual(32);
  const border = await page
    .locator('.status-bar')
    .evaluate((node) => getComputedStyle(node).borderBottomWidth);
  expect(border).toBe('0px');
  const hand = await byId(page, 'hand-number').boundingBox();
  const blinds = await byId(page, 'blinds').boundingBox();
  expect((hand?.y ?? 0) < (blinds?.y ?? 0)).toBe(true);
});

test('a long pot stays inside the centre column', async ({ page }) => {
  const viewport = page.viewportSize();
  test.skip(viewport === null || viewport.width < viewport.height);
  for (const size of [viewport ?? { width: 1440, height: 900 }, { width: 1024, height: 768 }]) {
    await page.setViewportSize(size);
    await page.goto(FAST_URL);
    await byId(page, 'start-tournament').click();
    await expect(byId(page, 'passive')).toBeEnabled();
    await byId(page, 'pot').evaluate((node) => {
      node.innerHTML =
        '<span class="pot-amount">Pot 12345</span><span class="pot-total">Total 23456</span>';
    });
    const pot = await byId(page, 'pot').boundingBox();
    const centre = await page.locator('.table-centre').boundingBox();
    if (pot === null || centre === null) {
      throw new Error('the pot is not laid out');
    }
    expect(pot.x).toBeGreaterThanOrEqual(centre.x);
    expect(pot.x + pot.width).toBeLessThanOrEqual(centre.x + centre.width);
  }
});

test('her cards never cover her face on a short landscape screen', async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await page.goto(FAST_URL);
  await byId(page, 'start-tournament').click();
  await expect(byId(page, 'passive')).toBeEnabled();
  const frame = await byId(page, 'face-frame').boundingBox();
  const cards = await page.locator('[data-testid="seat-1"] .seat-cards').boundingBox();
  if (frame === null || cards === null) {
    throw new Error('the table is not laid out');
  }
  expect(cards.y).toBeGreaterThanOrEqual(frame.y + frame.height - 1);
});

test('the board stays put when her cards are shown on wide screens', async ({ page }) => {
  const viewport = page.viewportSize();
  test.skip(viewport === null || viewport.width < viewport.height || viewport.height < 561);
  await page.goto(FAST_URL);
  await byId(page, 'start-tournament').click();
  let before: number | null = null;
  for (let step = 0; step < 30; step += 1) {
    const waypoint = await waitForWaypoint(page);
    if (waypoint === 'next-hand') break;
    before = (await byId(page, 'board').boundingBox())?.y ?? null;
    if (waypoint === 'act') await byId(page, 'passive').click();
  }
  const shown = await page.locator('[data-testid="seat-1"] [data-testid="card"]').count();
  test.skip(shown === 0 || before === null, 'the hand ended without a showdown');
  const after = (await byId(page, 'board').boundingBox())?.y ?? 0;
  expect(Math.abs(after - (before ?? 0))).toBeLessThanOrEqual(1);
});

test('bet chips sweep toward the pot on wide screens', async ({ page }) => {
  const viewport = page.viewportSize();
  test.skip(viewport === null || viewport.width < viewport.height || viewport.height < 561);
  await page.goto(FAST_URL);
  await byId(page, 'start-tournament').click();
  await expect(byId(page, 'passive')).toBeEnabled();
  const shift = async (seat: string) =>
    byId(page, seat).evaluate((node) => {
      node.style.transition = 'none';
      node.classList.add('bet-sweep');
      const matrix = new DOMMatrix(getComputedStyle(node).transform);
      return { x: matrix.m41, y: matrix.m42 };
    });
  const top = await shift('bet-1');
  const bottom = await shift('bet-0');
  expect(top.x).toBeLessThan(-150);
  expect(bottom.x).toBeLessThan(-150);
  expect(top.y).toBeGreaterThan(0);
  expect(bottom.y).toBeLessThan(0);
});

test('the board cards sit close together on wide screens', async ({ page }) => {
  const viewport = page.viewportSize();
  test.skip(viewport === null || viewport.width < viewport.height || viewport.height < 561);
  await page.goto(FAST_URL);
  await byId(page, 'start-tournament').click();
  await expect(byId(page, 'passive')).toBeEnabled();
  const gap = await byId(page, 'board').evaluate((node) => getComputedStyle(node).columnGap);
  expect(parseFloat(gap)).toBeLessThanOrEqual(10);
});

test('her action strip stays above the board', async ({ page }) => {
  await page.goto(FAST_URL);
  await byId(page, 'start-tournament').click();
  const strip = byId(page, 'action-1');
  const cards = byId(page, 'board').getByTestId('card');
  for (let step = 0; step < 60; step += 1) {
    const waypoint = await waitForWaypoint(page);
    if (waypoint === 'tournament-over') break;
    if ((await strip.isVisible()) && (await cards.count()) >= 3) break;
    await byId(page, waypoint === 'act' ? 'passive' : 'next-hand').click();
  }
  const [action, board] = await Promise.all([strip.boundingBox(), cards.first().boundingBox()]);
  if (action === null || board === null) {
    throw new Error('she never acted on a dealt board');
  }
  expect(action.y + action.height).toBeLessThanOrEqual(board.y);
});

test('the result pill at a showdown overlaps no card, block, chip or dealer button', async ({
  page,
}) => {
  await page.goto(FAST_URL);
  await byId(page, 'start-tournament').click();
  const shown = byId(page, 'seat-1').getByTestId('card');
  for (let step = 0; step < 60; step += 1) {
    const waypoint = await waitForWaypoint(page);
    if (waypoint === 'next-hand' && (await shown.count()) === 2) {
      break;
    }
    await byId(page, waypoint === 'next-hand' ? 'next-hand' : 'passive').click();
  }
  await expect(shown).toHaveCount(2);
  await expect(page.locator('.card-dim').first()).toBeAttached();
  const pill = await byId(page, 'result').boundingBox();
  if (pill === null) {
    throw new Error('the result is not laid out');
  }
  expect(pill.width).toBeGreaterThanOrEqual(64);
  expect(pill.height).toBeLessThanOrEqual(72);
  const amount = byId(page, 'result').locator('.result-amount');
  expect(await amount.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
  const others = page.locator(
    '[data-testid="card"], [data-testid="card-back"], .seat-block, .dealer-slot > *, .bet-chips',
  );
  for (const other of await others.all()) {
    const box = await other.boundingBox();
    if (box === null) {
      continue;
    }
    const apart =
      pill.x + pill.width <= box.x ||
      box.x + box.width <= pill.x ||
      pill.y + pill.height <= box.y ||
      box.y + box.height <= pill.y;
    expect(apart).toBe(true);
  }
});
