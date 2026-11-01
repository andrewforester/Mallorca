import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';
import type { Browser, Page } from '@playwright/test';
import { byId, DEVICES, playToTheEnd, waitForWaypoint } from './shared.ts';
import { serveTalk } from './talkServer.ts';

const PORT = Number(process.env.CONTACT_PORT ?? 4174);
const BASE = `http://localhost:${PORT}/`;
const OUT_DIR = 'e2e/contact';
const SHEET_COLUMNS = 3;
const THINKING_DELAY_MS = 600_000;
const SETTLE_MS = 400;

const SHEETS = ['phone', 'desktop'] as const;
type Sheet = (typeof SHEETS)[number];

interface Shot {
  label: string;
  png: Buffer;
}

async function answers(): Promise<boolean> {
  try {
    await fetch(BASE);
    return true;
  } catch {
    return false;
  }
}

async function waitForServer(server: ChildProcess): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (server.exitCode !== null) {
      throw new Error(`preview server exited with code ${server.exitCode}`);
    }
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

if (await answers()) {
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
  await waitForServer(server);
  for (const sheet of SHEETS) {
    const shots = [...(await capture(browser, sheet)), ...(await captureTalk(browser, sheet))];
    await compose(browser, shots, `${OUT_DIR}/${sheet}.png`);
    console.log(`saved ${OUT_DIR}/${sheet}.png with ${shots.length} screenshots`);
  }
} finally {
  await browser.close();
  server.kill();
}
