import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';
import type { Browser, Page } from '@playwright/test';
import { serveTalk } from './talkServer.ts';

const PORT = 4174;
const BASE = `http://localhost:${PORT}/`;
const OUT_DIR = 'e2e/contact';
const SHEET_COLUMNS = 3;
const THINKING_DELAY_MS = 600_000;
const SETTLE_MS = 400;

const DEVICES = [
  { name: 'phone', viewport: { width: 390, height: 844 }, isMobile: true },
  { name: 'desktop', viewport: { width: 1440, height: 900 }, isMobile: false },
];

interface Shot {
  label: string;
  png: Buffer;
}

async function waitForServer(): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      const response = await fetch(BASE);
      if (response.ok) {
        return;
      }
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }
  throw new Error('preview server did not start');
}

async function snap(page: Page, label: string, shots: Shot[]): Promise<void> {
  await page.waitForTimeout(SETTLE_MS);
  shots.push({ label, png: await page.screenshot() });
}

function id(page: Page, testId: string) {
  return page.getByTestId(testId);
}

async function nextWaypoint(page: Page): Promise<'act' | 'next-hand' | 'tournament-over'> {
  const act = id(page, 'passive').and(page.locator(':enabled'));
  await act.or(id(page, 'next-hand')).or(id(page, 'tournament-over')).first().waitFor();
  if (await id(page, 'tournament-over').isVisible()) {
    return 'tournament-over';
  }
  return (await id(page, 'next-hand').isVisible()) ? 'next-hand' : 'act';
}

async function boardCards(page: Page): Promise<number> {
  return id(page, 'board').getByTestId('card').count();
}

async function capture(browser: Browser, device: (typeof DEVICES)[number]): Promise<Shot[]> {
  const shots: Shot[] = [];
  const open = async (query: string) => {
    const context = await browser.newContext({
      viewport: device.viewport,
      isMobile: device.isMobile,
      hasTouch: device.isMobile,
    });
    const page = await context.newPage();
    await page.goto(`${BASE}?${query}`);
    return page;
  };

  const page = await open('seed=42&botDelay=0&autoNext=off');
  await snap(page, 'start', shots);
  await id(page, 'start-tournament').click();
  await nextWaypoint(page);
  await snap(page, 'human to act', shots);

  for (;;) {
    if ((await nextWaypoint(page)) !== 'act' || (await boardCards(page)) >= 3) {
      break;
    }
    await id(page, 'passive').click();
  }
  await nextWaypoint(page);
  await snap(page, 'after flop', shots);

  for (;;) {
    const waypoint = await nextWaypoint(page);
    if (waypoint !== 'act') {
      break;
    }
    await id(page, 'passive').click();
  }
  await snap(page, 'showdown', shots);
  await id(page, 'hand-log-toggle').click();
  await id(page, 'hand-log').waitFor();
  await snap(page, 'hand log', shots);
  await id(page, 'hand-log-close').click();

  const slow = await open(`seed=42&botDelay=${THINKING_DELAY_MS}&autoNext=off`);
  await id(slow, 'start-tournament').click();
  await id(slow, 'passive').and(slow.locator(':enabled')).waitFor();
  await id(slow, 'passive').click();
  await id(slow, 'thinking-1').waitFor();
  await snap(slow, 'bot thinking', shots);

  const cash = await open('seed=3&botDelay=0');
  await id(cash, 'start-cash').click();
  await id(cash, 'passive').and(cash.locator(':enabled')).waitFor();
  await id(cash, 'fold').click();
  await id(cash, 'next-hand').waitFor();
  await snap(cash, 'cash hand over', shots);
  await cash.locator('summary.menu-summary').click();
  await snap(cash, 'menu open', shots);
  await cash.locator('summary.menu-summary').click();
  await id(cash, 'leave').click();
  await id(cash, 'session-over').waitFor();
  await snap(cash, 'session over', shots);

  for (;;) {
    const waypoint = await nextWaypoint(page);
    if (waypoint === 'tournament-over') {
      break;
    }
    if (waypoint === 'next-hand') {
      await id(page, 'next-hand').click();
    } else if (await id(page, 'raise').isEnabled()) {
      await id(page, 'preset-allin').click();
      await id(page, 'raise').click();
    } else {
      await id(page, 'passive').click();
    }
  }
  await snap(page, 'tournament over', shots);
  return shots;
}

const HER_LINE = 'Careful now, I have been waiting all evening for a hand like this.';
const HER_ANSWER = 'Kind of you. Pour yourself another one.';

async function captureTalk(browser: Browser, device: (typeof DEVICES)[number]): Promise<Shot[]> {
  const shots: Shot[] = [];
  const context = await browser.newContext({
    viewport: device.viewport,
    isMobile: device.isMobile,
    hasTouch: device.isMobile,
  });
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
  await id(page, 'opponent-cfr').click();
  await id(page, 'start-cash').click();
  const bubble = id(page, 'bubble-mallorca');
  for (let action = 0; action < 60 && !(await bubble.isVisible()); action += 1) {
    if ((await nextWaypoint(page)) === 'next-hand') {
      await id(page, 'next-hand').click();
    } else if (!(await bubble.isVisible())) {
      await bubble.waitFor({ timeout: 800 }).catch(() => undefined);
      if (!(await bubble.isVisible())) {
        await id(page, 'passive').click();
      }
    }
  }
  await page.waitForTimeout(2500);
  await snap(page, 'her bubble', shots);
  await nextWaypoint(page);
  if (device.isMobile) {
    await id(page, 'chat-open').click();
    await id(page, 'chat-sheet').getByTestId('quick-niceHand').click();
  } else {
    const input = id(page, 'chat-panel').getByTestId('chat-input');
    await input.fill('Nice table you keep');
    await input.press('Enter');
  }
  await page.getByText(HER_ANSWER).first().waitFor();
  await snap(page, 'chat open', shots);
  await context.close();
  return shots;
}

async function compose(browser: Browser, shots: Shot[], out: string): Promise<void> {
  const cells = shots
    .map(
      ({ label, png }) =>
        `<figure><img src="data:image/png;base64,${png.toString('base64')}"><figcaption>${label}</figcaption></figure>`,
    )
    .join('');
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
body { margin: 0; background: #111; color: #ddd; font: 14px system-ui }
main { display: grid; grid-template-columns: repeat(${SHEET_COLUMNS}, 1fr); gap: 8px; padding: 8px; align-items: start }
figure { margin: 0 }
img { width: 100%; display: block; border: 1px solid #333 }
figcaption { padding: 4px 0 }
</style></head><body><main>${cells}</main></body></html>`;
  const page = await browser.newPage({ viewport: { width: 1800, height: 1000 } });
  await page.setContent(html, { waitUntil: 'load' });
  writeFileSync(out, await page.screenshot({ fullPage: true }));
  await page.close();
}

mkdirSync(OUT_DIR, { recursive: true });
const server = spawn('npm', ['run', 'preview', '--', '--port', String(PORT), '--strictPort'], {
  stdio: 'ignore',
});
const browser = await chromium.launch();
try {
  await waitForServer();
  for (const device of DEVICES) {
    const shots = [...(await capture(browser, device)), ...(await captureTalk(browser, device))];
    await compose(browser, shots, `${OUT_DIR}/${device.name}.png`);
    console.log(`saved ${OUT_DIR}/${device.name}.png with ${shots.length} screenshots`);
  }
} finally {
  await browser.close();
  server.kill();
}
