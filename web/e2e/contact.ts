import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { chromium } from '@playwright/test';
import type { Browser, Page } from '@playwright/test';
import { byId, DEVICES, playToTheEnd, waitForWaypoint } from './shared.ts';
import { answers, compose, snap, waitForServer } from './sheet.ts';
import type { Shot } from './sheet.ts';
import { serveTalk } from './talkServer.ts';

const PORT = Number(process.env.CONTACT_PORT ?? 4174);
const BASE = `http://localhost:${PORT}/`;
const OUT_DIR = 'e2e/contact';
const THINKING_DELAY_MS = 600_000;

const SHEETS = ['phone', 'desktop'] as const;
type Sheet = (typeof SHEETS)[number];

async function boardCards(page: Page): Promise<number> {
  return byId(page, 'board').getByTestId('card').count();
}

async function capture(browser: Browser, sheet: Sheet): Promise<Shot[]> {
  const shots: Shot[] = [];
  const { viewport, isMobile, hasTouch } = DEVICES[sheet];
  const open = async (query: string) => {
    const context = await browser.newContext({ viewport, isMobile, hasTouch });
    const page = await context.newPage();
    await page.goto(`${BASE}?${query}`);
    return page;
  };

  const page = await open('seed=42&botDelay=0&autoNext=off');
  await snap(page, 'start', shots);
  await byId(page, 'start-tournament').click();
  await waitForWaypoint(page);
  await snap(page, 'human to act', shots);

  for (;;) {
    if ((await waitForWaypoint(page)) !== 'act' || (await boardCards(page)) >= 3) {
      break;
    }
    await byId(page, 'passive').click();
  }
  await waitForWaypoint(page);
  await snap(page, 'after flop', shots);

  for (;;) {
    const waypoint = await waitForWaypoint(page);
    if (waypoint !== 'act') {
      break;
    }
    await byId(page, 'passive').click();
  }
  await snap(page, 'showdown', shots);
  await byId(page, 'hand-log-toggle').click();
  await byId(page, 'hand-log').waitFor();
  await snap(page, 'hand log', shots);
  await byId(page, 'hand-log-close').click();

  const slow = await open(`seed=42&botDelay=${THINKING_DELAY_MS}&autoNext=off`);
  await byId(slow, 'start-tournament').click();
  await byId(slow, 'passive').and(slow.locator(':enabled')).waitFor();
  await byId(slow, 'passive').click();
  await byId(slow, 'thinking-1').waitFor();
  await snap(slow, 'bot thinking', shots);

  const cash = await open('seed=3&botDelay=0');
  await byId(cash, 'start-cash').click();
  await byId(cash, 'passive').and(cash.locator(':enabled')).waitFor();
  await byId(cash, 'fold').click();
  await byId(cash, 'next-hand').waitFor();
  await snap(cash, 'cash hand over', shots);
  await cash.locator('summary.menu-summary').click();
  await snap(cash, 'menu open', shots);
  await cash.locator('summary.menu-summary').click();
  await byId(cash, 'leave').click();
  await byId(cash, 'session-over').waitFor();
  await snap(cash, 'session over', shots);

  await playToTheEnd(page);
  await snap(page, 'tournament over', shots);
  return shots;
}

const HER_LINE = 'Careful now, I have been waiting all evening for a hand like this.';
const HER_ANSWER = 'Kind of you. Pour yourself another one.';

async function captureTalk(browser: Browser, sheet: Sheet): Promise<Shot[]> {
  const shots: Shot[] = [];
  const { viewport, isMobile, hasTouch } = DEVICES[sheet];
  const context = await browser.newContext({ viewport, isMobile, hasTouch });
  await serveTalk(context, (request) => ({
    status: 200,
    body:
      request.kind === 'line'
        ? { text: HER_LINE }
        : request.kind === 'reply'
          ? { text: HER_ANSWER, signals: [] }
          : {},
  }));
  const page = await context.newPage();
  await page.goto(`${BASE}?seed=42&botDelay=0&autoNext=off`);
  await byId(page, 'opponent-cfr').click();
  await byId(page, 'start-cash').click();
  const bubble = byId(page, 'bubble-mallorca');
  for (let action = 0; action < 60 && !(await bubble.isVisible()); action += 1) {
    if ((await waitForWaypoint(page)) === 'next-hand') {
      await byId(page, 'next-hand').click();
    } else if (!(await bubble.isVisible())) {
      await bubble.waitFor({ timeout: 800 }).catch(() => undefined);
      if (!(await bubble.isVisible())) {
        await byId(page, 'passive').click();
      }
    }
  }
  await page.waitForTimeout(2500);
  await snap(page, 'her bubble', shots);
  await waitForWaypoint(page);
  if (isMobile) {
    await byId(page, 'chat-open').click();
    await byId(page, 'chat-sheet').getByTestId('quick-niceHand').click();
  } else {
    const input = byId(page, 'chat-panel').getByTestId('chat-input');
    await input.fill('Nice table you keep');
    await input.press('Enter');
  }
  await page.getByText(HER_ANSWER).first().waitFor();
  await snap(page, 'chat open', shots);
  await context.close();
  return shots;
}

if (await answers(BASE)) {
  throw new Error(`${BASE} is already in use; free it or set CONTACT_PORT`);
}
mkdirSync(OUT_DIR, { recursive: true });
const server = spawn('npm', ['run', 'preview', '--', '--port', String(PORT), '--strictPort'], {
  stdio: 'ignore',
});
const browser = await chromium.launch({
  args: process.platform === 'darwin' ? ['--use-angle=metal'] : [],
});
try {
  await waitForServer(server, BASE);
  for (const sheet of SHEETS) {
    const shots = [...(await capture(browser, sheet)), ...(await captureTalk(browser, sheet))];
    await compose(browser, shots, `${OUT_DIR}/${sheet}.png`);
    console.log(`saved ${OUT_DIR}/${sheet}.png with ${shots.length} screenshots`);
  }
} finally {
  await browser.close();
  server.kill();
}
