import type { Page } from '@playwright/test';
import { byId, expect, FAST_URL, test, waitForWaypoint } from './fixtures.ts';

const COACH_TIMEOUT_MS = 120_000;

async function openCoach(page: Page, opponent: string): Promise<void> {
  await page.goto(FAST_URL);
  await byId(page, 'start-coach').check();
  await byId(page, `opponent-${opponent}`).click();
  await byId(page, 'start-cash').click();
  while ((await waitForWaypoint(page)) === 'next-hand') {
    await byId(page, 'next-hand').click();
  }
  const toggle = byId(page, 'coach-toggle');
  if (await toggle.isVisible()) {
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  }
  await expect(byId(page, 'coach-hint')).toBeVisible({ timeout: COACH_TIMEOUT_MS });
}

test('the coach shows the hint, both grids and the numbers against the cfr bot', async ({
  page,
}) => {
  test.setTimeout(COACH_TIMEOUT_MS);
  await openCoach(page, 'cfr');
  await expect(byId(page, 'coach-hint')).toContainText('%');
  await expect(byId(page, 'coach-strategy')).toBeVisible();
  await byId(page, 'coach-tab-range').click();
  await expect(byId(page, 'coach-range')).toBeVisible();
  await byId(page, 'coach-tab-numbers').click();
  await expect(byId(page, 'coach-numbers')).toContainText('%');
});

test('against the math bot the coach hints but shows no range', async ({ page }) => {
  test.setTimeout(COACH_TIMEOUT_MS);
  await openCoach(page, 'math');
  await expect(byId(page, 'coach-strategy')).toBeVisible();
  await byId(page, 'coach-tab-range').click();
  await expect(page.getByRole('tabpanel')).toContainText('math bot');
});

test('on a phone the coach sheet closes with Escape and the player can act', async ({ page }) => {
  test.setTimeout(COACH_TIMEOUT_MS);
  await openCoach(page, 'cfr');
  const toggle = byId(page, 'coach-toggle');
  test.skip(!(await toggle.isVisible()), 'the side panel stays open on wide screens');
  await page.keyboard.press('Escape');
  await expect(byId(page, 'coach-hint')).toBeHidden();
  await byId(page, 'passive').click();
});

test('on the flop the range tab shows what the bot range is made of', async ({ page }) => {
  test.setTimeout(COACH_TIMEOUT_MS);
  await page.goto(FAST_URL);
  await byId(page, 'start-coach').check();
  await byId(page, 'opponent-cfr').click();
  await byId(page, 'start-cash').click();
  const flopCards = byId(page, 'board').getByTestId('card');
  for (;;) {
    const waypoint = await waitForWaypoint(page);
    if (waypoint === 'next-hand') {
      await byId(page, 'next-hand').click();
    } else if ((await flopCards.count()) >= 3) {
      break;
    } else {
      await byId(page, 'passive').click();
    }
  }
  const toggle = byId(page, 'coach-toggle');
  if (await toggle.isVisible()) await toggle.click();
  await byId(page, 'coach-tab-range').click();
  await expect(byId(page, 'coach-composition')).toContainText('%', { timeout: COACH_TIMEOUT_MS });
  await byId(page, 'coach-tab-numbers').click();
  await expect(byId(page, 'coach-numbers')).toBeVisible();
});

test('after a coached hand the coach reviews it', async ({ page }) => {
  test.setTimeout(COACH_TIMEOUT_MS);
  await page.goto(FAST_URL);
  await byId(page, 'start-coach').check();
  await byId(page, 'opponent-cfr').click();
  await byId(page, 'start-cash').click();
  const toggle = byId(page, 'coach-toggle');
  while ((await waitForWaypoint(page)) === 'act') {
    if (await toggle.isVisible()) await toggle.click();
    await expect(byId(page, 'coach-hint')).toBeVisible({ timeout: COACH_TIMEOUT_MS });
    if (await toggle.isVisible()) await page.keyboard.press('Escape');
    await byId(page, 'passive').click();
  }
  if (await toggle.isVisible()) await toggle.click();
  await expect(byId(page, 'coach-review')).toBeVisible();
  await expect(byId(page, 'coach-review')).toContainText('Preflop');
});
