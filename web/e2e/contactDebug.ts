import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { chromium } from '@playwright/test';
import type { Browser, Page } from '@playwright/test';
import { byId, DEVICES, waitForWaypoint } from './shared.ts';
import { answers, compose, snap, waitForServer } from './sheet.ts';
import type { Shot } from './sheet.ts';

const PORT = Number(process.env.CONTACT_PORT ?? 4174);
const BASE = `http://localhost:${PORT}/`;
const OUT_DIR = 'e2e/contact';
const BIG_LOSS_BB = -40;
const MAX_HANDS = 60;

const VIEWS = {
  phone: [
    { label: 'portrait', ...DEVICES.phone },
    { label: 'landscape', ...DEVICES.phone, viewport: { width: 844, height: 390 } },
  ],
  desktop: [{ label: 'desktop', ...DEVICES.desktop }],
};
type Sheet = keyof typeof VIEWS;
type View = (typeof VIEWS)[Sheet][number];

async function panel(page: Page, open: boolean): Promise<void> {
  const toggle = byId(page, 'emotion-debug-toggle');
  if ((await toggle.getAttribute('aria-expanded')) !== String(open)) {
    await toggle.click();
  }
}

async function show(page: Page, id: string): Promise<void> {
  await panel(page, true);
  await byId(page, id).scrollIntoViewIfNeeded();
}

async function herResult(page: Page): Promise<number> {
  await panel(page, true);
  const text = (await byId(page, 'debug-load').textContent()) ?? '';
  const found = /Session result: ([+-][\d.]+) bb/.exec(text);
  return found === null ? 0 : Number(found[1]);
}

async function decisionText(page: Page): Promise<string> {
  await panel(page, true);
  return (await byId(page, 'debug-decision').textContent()) ?? '';
}

async function untilNewDecision(page: Page): Promise<void> {
  const before = await decisionText(page);
  for (let step = 0; step < 40; step += 1) {
    const now = await decisionText(page);
    if (now !== before && (await byId(page, 'debug-decision').locator('table').count()) > 0) {
      return;
    }
    await panel(page, false);
    if ((await waitForWaypoint(page)) === 'next-hand') {
      await byId(page, 'next-hand').click();
    } else {
      await byId(page, 'passive').click();
    }
  }
}

async function shove(page: Page): Promise<void> {
  if (await byId(page, 'raise').isEnabled()) {
    await byId(page, 'preset-allin').click();
    await byId(page, 'raise').click();
  } else {
    await byId(page, 'passive').click();
  }
}

async function untilBigLoss(page: Page): Promise<void> {
  for (let hand = 0; hand < MAX_HANDS && (await herResult(page)) > BIG_LOSS_BB;) {
    await panel(page, false);
    if ((await waitForWaypoint(page)) === 'next-hand') {
      hand += 1;
      await byId(page, 'next-hand').click();
    } else {
      await shove(page);
    }
  }
}

async function captureView(browser: Browser, view: View): Promise<Shot[]> {
  const shots: Shot[] = [];
  const { viewport, isMobile, hasTouch, label } = view;
  const context = await browser.newContext({ viewport, isMobile, hasTouch });
  const page = await context.newPage();
  await page.goto(`${BASE}?seed=42&botDelay=0&autoNext=off`);
  await byId(page, 'opponent-cfr').click();
  await byId(page, 'start-cash').click();
  await waitForWaypoint(page);
  await snap(page, `${label}: panel closed`, shots);
  await byId(page, 'emotion-debug-toggle').click();
  await snap(page, `${label}: Mallorca, first hand`, shots);
  await untilNewDecision(page);
  await show(page, 'debug-decision');
  await snap(page, `${label}: her last decision`, shots);
  await byId(page, 'debug-personality-lola').click();
  await untilBigLoss(page);
  await waitForWaypoint(page);
  const result = await herResult(page);
  await show(page, 'debug-load');
  await snap(
    page,
    `${label}: Lola after shoves, her session ${result >= 0 ? '+' : ''}${result} bb`,
    shots,
  );
  await show(page, 'debug-style');
  await snap(page, `${label}: Lola's style`, shots);
  await untilNewDecision(page);
  await show(page, 'debug-decision');
  await snap(page, `${label}: Lola's decision`, shots);
  await show(page, 'debug-journal');
  await snap(page, `${label}: journal`, shots);
  await context.close();
  return shots;
}

if (await answers(BASE)) {
  throw new Error(`${BASE} is already in use; free it or set CONTACT_PORT`);
}
mkdirSync(OUT_DIR, { recursive: true });
const server = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
const browser = await chromium.launch();
try {
  await waitForServer(server, BASE);
  for (const sheet of Object.keys(VIEWS) as Sheet[]) {
    const shots: Shot[] = [];
    for (const view of VIEWS[sheet]) {
      shots.push(...(await captureView(browser, view)));
    }
    await compose(browser, shots, `${OUT_DIR}/${sheet}-debug.png`);
    console.log(`saved ${OUT_DIR}/${sheet}-debug.png with ${shots.length} screenshots`);
  }
} finally {
  await browser.close();
  server.kill();
}
