import { PROFILES } from './profiles.ts';
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';
import type { Page } from '@playwright/test';
import { createServer } from 'vite';
import { ANCHORS } from '../../src/face/index.ts';
import { SCENES } from './scenes/scenes.ts';

const OUT = new URL('../../../docs/emotion/img/', import.meta.url);
const PANEL_SCENES = [
  'badbeat',
  'cooler',
  'flopstraight',
  'raisetoppair',
  'bluffwin',
  'mistake',
  'revenge',
  'streak',
];
const PANEL_PROFILE = 'lola';

async function still(page: Page, base: string, query: string): Promise<void> {
  await page.goto(`${base}prototypes/emotion-lab/?${query}`);
  await page.waitForFunction(() => document.body.dataset.ready === '1', null, { timeout: 120_000 });
}

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  const server = await createServer({
    server: { port: 5181, strictPort: true, hmr: false, watch: null },
    logLevel: 'error',
  });
  await server.listen();
  const base = 'http://localhost:5181/';
  const browser = await chromium.launch({
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  const save = async (name: string, selector: string) => {
    writeFileSync(
      new URL(name, OUT),
      await page.locator(selector).screenshot({ type: 'jpeg', quality: 82 }),
    );
    console.log(name);
  };
  try {
    for (const anchor of ANCHORS) {
      await still(page, base, `profile=mira&anchor=${anchor.id}&at=2&seed=1`);
      await save(`anchor-${anchor.id}.jpg`, '#stage');
    }
    for (const scene of SCENES) {
      for (const profile of Object.keys(PROFILES)) {
        await still(page, base, `scene=${scene.id}&profile=${profile}&at=${scene.moment}&seed=1`);
        await save(`${scene.id}-${profile}.jpg`, '#stage');
        if (profile === PANEL_PROFILE && PANEL_SCENES.includes(scene.id)) {
          await save(`${scene.id}-${profile}-panel.jpg`, '.panel');
        }
      }
    }
  } finally {
    await browser.close();
    await server.close();
  }
}

await main();
