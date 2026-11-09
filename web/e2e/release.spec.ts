import { byId, expect, test } from './fixtures.ts';

const SOLVER_TIMEOUT_MS = 120_000;

test('the release plays the solver with no choice, no coach and no talk', async ({ page }) => {
  test.setTimeout(SOLVER_TIMEOUT_MS + 30_000);
  await page.goto('/?seed=42&botDelay=0&autoNext=off');
  await expect(byId(page, 'start-cash')).toBeVisible();
  for (const id of ['opponent-math', 'opponent-cfr', 'opponent-cfr-v2', 'start-coach']) {
    await expect(byId(page, id)).toHaveCount(0);
  }
  await byId(page, 'start-cash').click();
  await expect(byId(page, 'passive')).toBeEnabled({ timeout: SOLVER_TIMEOUT_MS });
  for (const id of ['chat-open', 'coach-toggle', 'chat-panel', 'coach']) {
    await expect(byId(page, id)).toBeHidden();
  }
  await page.locator('summary.menu-summary').click();
  await expect(byId(page, 'sound')).toBeVisible();
  for (const id of ['coach-mode', 'table-conversation', 'voice']) {
    await expect(byId(page, id)).toHaveCount(0);
  }
});
