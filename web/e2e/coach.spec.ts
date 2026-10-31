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
