import { devices } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

export const DEVICES = {
  phone: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 } },
  'small-phone': { ...devices['Pixel 7'], viewport: { width: 360, height: 740 } },
  desktop: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
};

export function byId(page: Page, id: string): Locator {
  return page.getByTestId(id);
}

export type Waypoint = 'act' | 'next-hand' | 'tournament-over';

export async function waitForWaypoint(page: Page): Promise<Waypoint> {
  const act = byId(page, 'passive').and(page.locator(':enabled'));
  const next = byId(page, 'next-hand');
  const over = byId(page, 'tournament-over');
  const any = act.or(next).or(over);
  await any.first().waitFor({ state: 'visible' });
  if (await over.isVisible()) {
    return 'tournament-over';
  }
  if (await next.isVisible()) {
    return 'next-hand';
  }
  return 'act';
}

export async function openMenu(page: Page): Promise<void> {
  if ((await page.locator('details.menu[open]').count()) === 0) {
    await page.locator('summary.menu-summary').click();
  }
}

export async function leaveTable(page: Page): Promise<void> {
  await openMenu(page);
  await byId(page, 'leave').click();
}

export const HOLD_FOR_ALL_IN_MS = 800;

export async function goAllIn(page: Page): Promise<void> {
  await byId(page, 'preset-allin').click();
  await byId(page, 'raise').click({ delay: HOLD_FOR_ALL_IN_MS });
}

export async function playToTheEnd(page: Page): Promise<void> {
  for (;;) {
    const waypoint = await waitForWaypoint(page);
    if (waypoint === 'tournament-over') {
      return;
    }
    if (waypoint === 'next-hand') {
      await byId(page, 'next-hand').click();
      continue;
    }
    if (await byId(page, 'raise').isEnabled()) {
      await goAllIn(page);
    } else {
      await byId(page, 'passive').click();
    }
  }
}
