import { chromium } from '@playwright/test';
import type { Browser } from '@playwright/test';

const BASE = process.argv[2] ?? 'http://localhost:5173/';
const SECONDS = Number(process.env.FPS_SECONDS ?? 15);

interface Profile {
  label: string;
  viewport: { width: number; height: number };
  scale: number;
  throttle: number;
}

const PROFILES: Profile[] = [
  { label: 'desktop', viewport: { width: 1280, height: 860 }, scale: 2, throttle: 1 },
  { label: 'phone, CPU 4x slower', viewport: { width: 390, height: 844 }, scale: 3, throttle: 4 },
];

async function measure(browser: Browser, profile: Profile): Promise<string> {
  const context = await browser.newContext({
    viewport: profile.viewport,
    deviceScaleFactor: profile.scale,
  });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: profile.throttle });
  await page.goto(BASE);
  await page.getByTestId('start-cash').click();
  const seat = page.getByTestId('face-seat');
  await seat.waitFor();
  await page.waitForFunction(() => document.querySelector('[data-face="live"]') !== null, null, {
    timeout: 120_000,
  });
  const fps = await page.evaluate(
    (seconds) =>
      new Promise<number>((resolve) => {
        let frames = 0;
        const start = performance.now();
        const tick = (now: number) => {
          frames += 1;
          if (now - start < seconds * 1000) requestAnimationFrame(tick);
          else resolve((frames * 1000) / (now - start));
        };
        requestAnimationFrame(tick);
      }),
    SECONDS,
  );
  await context.close();
  return `${profile.label}: ${fps.toFixed(1)} fps`;
}

const browser = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu'] });
for (const profile of PROFILES) console.log(await measure(browser, profile));
await browser.close();
