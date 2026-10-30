import type { Page } from '@playwright/test';
import { byId, expect, FAST_URL, test, waitForWaypoint } from './fixtures.ts';
import { serveTalk } from './talkServer.ts';
import type { TalkRequest } from './talkServer.ts';

const HER_BET = 'That bet is a question, darling.';
const HER_ANSWER = 'Glad you came tonight.';
const SOLVER_TIMEOUT_MS = 180_000;
const MAX_ACTIONS = 80;

function answers(request: TalkRequest) {
  if (request.kind === 'line') {
    return { status: 200, body: request.intent?.situation === 'herBet' ? { text: HER_BET } : {} };
  }
  if (request.kind === 'reply') {
    return { status: 200, body: { text: HER_ANSWER, signals: [] } };
  }
  return { status: 200, body: {} };
}

async function sitWithSolver(page: Page): Promise<void> {
  await page.goto(FAST_URL);
  await byId(page, 'opponent-cfr').click();
  await byId(page, 'start-cash').click();
  await expect(byId(page, 'passive')).toBeEnabled({ timeout: SOLVER_TIMEOUT_MS });
}

async function step(page: Page): Promise<void> {
  if ((await waitForWaypoint(page)) === 'next-hand') {
    await byId(page, 'next-hand').click();
  } else {
    await byId(page, 'passive').click();
  }
}

async function playUntil(page: Page, done: () => Promise<boolean>): Promise<void> {
  for (let action = 0; action < MAX_ACTIONS && !(await done()); action += 1) {
    await step(page);
  }
  expect(await done()).toBe(true);
}

async function myTurn(page: Page): Promise<void> {
  await playUntil(page, async () => {
    const waypoint = await waitForWaypoint(page);
    return waypoint === 'act';
  });
}

test.describe('desktop', () => {
  test.skip(({ isMobile }) => isMobile, 'the side panel is a desktop layout');

  test('a bubble with her line appears after her bet', async ({ page }) => {
    test.setTimeout(SOLVER_TIMEOUT_MS);
    const requests = await serveTalk(page, answers);
    await sitWithSolver(page);
    const bubble = byId(page, 'seat-1').getByTestId('bubble-mallorca');
    const herBet = () => requests.some((request) => request.intent?.situation === 'herBet');
    await playUntil(page, async () => herBet());
    await expect(bubble).toContainText(HER_BET);
    await expect(bubble).toBeVisible();
    for (const id of ['board', 'pot', 'fold', 'passive', 'raise']) {
      const box = await byId(page, id).boundingBox();
      const over = await bubble.boundingBox();
      if (box !== null && over !== null) {
        const apart =
          over.x + over.width <= box.x ||
          box.x + box.width <= over.x ||
          over.y + over.height <= box.y ||
          box.y + box.height <= over.y;
        expect(apart, `the bubble covers ${id}`).toBe(true);
      }
    }
  });

  test('the chat tab sends a message and shows her answer without acting', async ({ page }) => {
    test.setTimeout(SOLVER_TIMEOUT_MS);
    const requests = await serveTalk(page, answers);
    await sitWithSolver(page);
    await myTurn(page);
    await expect(byId(page, 'hand-log')).toBeVisible();
    await byId(page, 'tab-chat').click();
    await expect(byId(page, 'hand-log')).toBeHidden();
    const panel = byId(page, 'chat-panel');
    const input = panel.getByTestId('chat-input');
    await input.pressSequentially('Coffee first, cards later');
    await expect(byId(page, 'passive')).toBeEnabled();
    await expect(byId(page, 'next-hand')).toBeHidden();
    await input.press('Enter');
    await expect(input).toHaveValue('');
    const lines = panel.getByTestId('chat-line');
    await expect(lines.filter({ hasText: 'Coffee first, cards later' })).toHaveCount(1);
    await expect(lines.filter({ hasText: HER_ANSWER })).toHaveCount(1);
    await expect(byId(page, 'seat-0').getByTestId('bubble-player')).toContainText('Coffee first');
    const reply = requests.find((request) => request.kind === 'reply');
    expect(reply?.text).toBe('Coffee first, cards later');
    await byId(page, 'tab-log').click();
    await expect(byId(page, 'hand-log')).toBeVisible();
  });

  test('switching talk off sends no requests to her', async ({ page }) => {
    test.setTimeout(SOLVER_TIMEOUT_MS);
    await page.addInitScript(() => localStorage.setItem('mallorca.talk', 'off'));
    const requests = await serveTalk(page, answers);
    await sitWithSolver(page);
    let hands = 0;
    await playUntil(page, async () => {
      if (await byId(page, 'next-hand').isVisible()) {
        hands += 1;
      }
      return hands >= 3;
    });
    await page.locator('summary.menu-summary').click();
    await expect(byId(page, 'table-talk')).not.toBeChecked();
    await expect(byId(page, 'tab-chat')).toHaveCount(0);
    await expect(byId(page, 'chat-open')).toHaveCount(0);
    expect(requests).toEqual([]);
  });

  test('a failing talk server keeps the hand going', async ({ page, problems }) => {
    test.setTimeout(SOLVER_TIMEOUT_MS);
    const requests = await serveTalk(page, () => ({ status: 500, body: { error: 'down' } }));
    await sitWithSolver(page);
    await myTurn(page);
    await byId(page, 'tab-chat').click();
    const input = byId(page, 'chat-panel').getByTestId('chat-input');
    await input.fill('Anyone there?');
    await input.press('Enter');
    await expect(byId(page, 'chat-panel').getByTestId('chat-line')).toContainText('Not delivered');
    let hands = 0;
    await playUntil(page, async () => {
      if (await byId(page, 'next-hand').isVisible()) {
        hands += 1;
      }
      return hands >= 2;
    });
    expect(requests.length).toBeGreaterThan(0);
    const failed =
      'console.error: Failed to load resource: the server responded with a status of 500';
    expect(problems.length).toBeGreaterThan(0);
    expect(problems.every((problem) => problem.startsWith(failed))).toBe(true);
    problems.splice(0, problems.length);
  });
});

test.describe('phone', () => {
  test.use({ viewport: { width: 360, height: 740 } });
  test.skip(({ isMobile }) => !isMobile, 'the chat sheet is the phone layout');

  test('the chat sheet opens from her plaque and closes back to the table', async ({ page }) => {
    test.setTimeout(SOLVER_TIMEOUT_MS);
    const requests = await serveTalk(page, answers);
    await sitWithSolver(page);
    await myTurn(page);
    const open = byId(page, 'seat-1').getByTestId('chat-open');
    await expect(open).toHaveAccessibleName('Chat with Mallorca');
    await open.click();
    const sheet = byId(page, 'chat-sheet');
    await expect(sheet).toBeVisible();
    await expect(byId(page, 'passive')).toBeInViewport();
    await sheet.getByTestId('quick-niceHand').click();
    await expect(sheet.getByTestId('chat-line').filter({ hasText: HER_ANSWER })).toHaveCount(1);
    expect(
      requests.some((request) => request.kind === 'reply' && request.text === 'Nice hand'),
    ).toBe(true);
    await sheet.getByTestId('chat-close').click();
    await expect(sheet).toHaveCount(0);
    await expect(open).toBeFocused();
    for (const id of ['fold', 'passive', 'raise']) {
      await expect(byId(page, id)).toBeInViewport({ ratio: 1 });
    }
  });
});
