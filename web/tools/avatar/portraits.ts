import { writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';
import type { Page } from '@playwright/test';
import { HAIR, HAIRSTYLES } from '../../src/ui/avatar/hair.ts';
import type { HairKey } from '../../src/ui/avatar/hair.ts';

const BASE = process.argv[2] ?? 'http://localhost:5173/';
const WIDTH = 700;
const HEIGHT = 600;
const SETTLE_MS = 4000;
const GPU = ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'];

const characterOf = (key: HairKey) =>
  (Object.keys(HAIR) as (keyof typeof HAIR)[]).find((c) => HAIR[c] === key)!;

async function still(page: Page): Promise<string> {
  return page.evaluate(
    ([width, height]) =>
      new Promise<string>((done) =>
        requestAnimationFrame(() => {
          const source = document.querySelector<HTMLCanvasElement>('.face-stage canvas')!;
          const out = document.createElement('canvas');
          out.width = width;
          out.height = height;
          const scale = Math.min(source.width / width, source.height / height);
          const w = width * scale;
          const h = height * scale;
          const x = (source.width - w) / 2;
          out.getContext('2d')!.drawImage(source, x, 0, w, h, 0, 0, width, height);
          done(out.toDataURL('image/webp', 0.9));
        }),
      ),
    [WIDTH, HEIGHT] as const,
  );
}

async function portrait(page: Page, key: HairKey): Promise<void> {
  await page.goto(BASE);
  await page.evaluate((c) => localStorage.setItem('mallorca.character', c), characterOf(key));
  await page.goto(`${BASE}?opponent=math`);
  await page.getByTestId('start-tournament').click();
  await page.waitForSelector('[data-face="live"]', { timeout: 120_000 });
  await page.waitForTimeout(SETTLE_MS);
  const url = await still(page);
  const file = `public/avatar/portraits/${key}.webp`;
  writeFileSync(file, Buffer.from(url.split(',')[1]!, 'base64'));
  console.log(file);
}

const browser = await chromium.launch({ args: GPU });
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
for (const key of HAIRSTYLES) await portrait(page, key);
await browser.close();
