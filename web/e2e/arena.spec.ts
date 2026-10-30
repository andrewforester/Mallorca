import { expect, test } from '@playwright/test';

test('the arena page lists the published runs and opens the hands of one', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  await page.goto('arena/');
  const withHands = page.getByTestId('run-row').filter({ hasText: 'MB' }).first();
  await withHands.click();
  await expect(page.getByText('Where the result comes from')).toBeVisible();
  await expect(page.getByText(/do not match this report/)).toHaveCount(0);
  await page.getByTestId('pair-row').first().click();
  await expect(page.getByTestId('hand-text')).toHaveCount(2);
  await expect(page.getByTestId('hand-text').first()).toContainText('PokerStars Hand');
  expect(errors).toEqual([]);
});
