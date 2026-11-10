import type { Page } from '@playwright/test';
import { byId, expect, FAST_URL, test, waitForWaypoint } from './fixtures.ts';

test('the table is a light room that loads no photo of a room', async ({ page }) => {
  const rooms: string[] = [];
  page.on('request', (request) => {
    if (/\/attic-[^/]*\.webp$/.test(request.url())) {
      rooms.push(request.url());
    }
  });
  await page.goto(FAST_URL);
  await byId(page, 'start-tournament').click();
  await expect(byId(page, 'passive')).toBeEnabled();
  await expect(byId(page, 'passive')).toBeInViewport({ ratio: 1 });
  await expect(byId(page, 'face-frame')).toBeInViewport();
  const room = await byId(page, 'scene').evaluate((node) => getComputedStyle(node).backgroundColor);
  expect(room).toBe('rgb(250, 248, 244)');
  expect(rooms).toEqual([]);
});

async function playToTheFlop(page: Page) {
  const boardCard = page.locator('[data-testid="board"] [data-testid="card"]').first();
  for (let step = 0; step < 30 && (await boardCard.count()) === 0; step += 1) {
    const waypoint = await waitForWaypoint(page);
    if (waypoint === 'next-hand') {
      await byId(page, 'next-hand').click();
    } else if (waypoint === 'act') {
      await byId(page, 'passive').click();
    }
  }
  await expect(boardCard).toBeVisible();
  return boardCard;
}

test('the showdown result leaves both shown hands and the board visible', async ({ page }) => {
  await page.goto(FAST_URL);
  await byId(page, 'start-tournament').click();
  for (;;) {
    const waypoint = await waitForWaypoint(page);
    if (waypoint === 'next-hand') {
      break;
    }
    await byId(page, 'passive').click();
  }
  const opponentCards = byId(page, 'seat-1').getByTestId('card');
  await expect(opponentCards).toHaveCount(2);
  const result = await byId(page, 'result').boundingBox();
  const covered = [];
  for (const locator of [
    opponentCards.first(),
    opponentCards.last(),
    byId(page, 'board'),
    byId(page, 'seat-0').getByTestId('card').first(),
  ]) {
    const box = await locator.boundingBox();
    if (
      result !== null &&
      box !== null &&
      result.x < box.x + box.width &&
      box.x < result.x + result.width &&
      result.y < box.y + box.height &&
      box.y < result.y + result.height
    ) {
      covered.push(await locator.getAttribute('data-testid'));
    }
  }
  expect(covered).toEqual([]);
});

test('the simple table flattens her frame and is remembered', async ({ page }) => {
  await page.goto(FAST_URL);
  await byId(page, 'start-tournament').click();
  await expect(byId(page, 'passive')).toBeEnabled();
  await page.locator('.menu-summary').click();
  await byId(page, 'simple-table').check();
  await page.reload();
  await expect(byId(page, 'scene')).toHaveClass(/scene-simple/);
  await byId(page, 'start-tournament').click();
  await expect(byId(page, 'passive')).toBeEnabled();
  const frame = await byId(page, 'face-frame').evaluate(
    (node) => getComputedStyle(node).backgroundImage,
  );
  expect(frame).toBe('none');
  for (const id of ['fold', 'passive', 'raise']) {
    await expect(byId(page, id)).toBeInViewport({ ratio: 1 });
  }
});

test('reduced motion turns off the deal animation', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(FAST_URL);
  await byId(page, 'start-tournament').click();
  const boardCard = await playToTheFlop(page);
  expect(await boardCard.evaluate((node) => node.getAnimations().length)).toBe(0);
});

test('without reduced motion a dealt card plays the deal animation', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto(FAST_URL);
  await byId(page, 'start-tournament').click();
  const boardCard = await playToTheFlop(page);
  const names = await boardCard.evaluate((node) =>
    node.getAnimations().map((animation) => (animation as CSSAnimation).animationName),
  );
  expect(names).toContain('deal-in');
});
