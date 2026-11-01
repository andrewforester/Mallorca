import type { ChildProcess } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import type { Browser, Page } from '@playwright/test';

const SHEET_COLUMNS = 3;
const SETTLE_MS = 400;

export interface Shot {
  label: string;
  png: Buffer;
}

export async function answers(base: string): Promise<boolean> {
  try {
    await fetch(base);
    return true;
  } catch {
    return false;
  }
}

export async function waitForServer(server: ChildProcess, base: string): Promise<void> {
  for (let attempt = 0; attempt < 150; attempt += 1) {
    if (server.exitCode !== null) {
      throw new Error(`server exited with code ${server.exitCode}`);
    }
    try {
      const response = await fetch(base);
      if (response.ok) {
        return;
      }
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }
  throw new Error('server did not start');
}

export async function snap(page: Page, label: string, shots: Shot[]): Promise<void> {
  await page.waitForTimeout(SETTLE_MS);
  shots.push({ label, png: await page.screenshot() });
}

export async function compose(browser: Browser, shots: Shot[], out: string): Promise<void> {
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
