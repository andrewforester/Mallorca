import type { Page } from '@playwright/test';
import { byId, expect, FAST_URL, test, waitForWaypoint } from './fixtures.ts';

const ABORTED_PLATE = 'console.error: Failed to load resource: net::ERR_FAILED';

test('the table stays playable when the plate fails to load', async ({ page, problems }) => {
  let aborted = 0;
  await page.route('**/*.webp', (route) => {
    aborted += 1;
    return route.abort();
  });
  await page.goto(FAST_URL);
  await byId(page, 'start-tournament').click();
  await expect(byId(page, 'passive')).toBeEnabled();
  await expect(byId(page, 'passive')).toBeInViewport({ ratio: 1 });
  const felt = await byId(page, 'scene').evaluate((node) => getComputedStyle(node).backgroundColor);
  expect(felt).toBe('rgb(31, 74, 82)');
  const plateErrors = problems.filter((problem) => problem === ABORTED_PLATE).length;
  expect(plateErrors).toBeLessThanOrEqual(aborted);
  problems.splice(0, problems.length, ...problems.filter((problem) => problem !== ABORTED_PLATE));
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

test('the simple table is flat, skips the photo and is remembered', async ({ page }) => {
  const plates: string[] = [];
  page.on('request', (request) => {
    if (/\/attic-[^/]*\.webp$/.test(request.url())) {
      plates.push(request.url());
    }
  });
  await page.goto(FAST_URL);
  await byId(page, 'start-tournament').click();
  await expect(byId(page, 'passive')).toBeEnabled();
  await page.locator('.menu-summary').click();
  await byId(page, 'simple-table').check();
  plates.length = 0;
  await page.reload();
  await expect(byId(page, 'scene')).toHaveClass(/scene-simple/);
  await byId(page, 'start-tournament').click();
  await expect(byId(page, 'passive')).toBeEnabled();
  const transforms = await page.evaluate(() =>
    ['.felt-plane', '.seat-top .card', '.seat-bottom .card'].map(
      (selector) => getComputedStyle(document.querySelector(selector) as Element).transform,
    ),
  );
  expect(transforms).toEqual(['none', 'none', 'none']);
  expect(plates).toEqual([]);
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
