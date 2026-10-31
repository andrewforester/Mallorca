import { byId, expect, FAST_URL, test } from './fixtures.ts';

const NO_WEBGL = `
  const original = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (kind, ...rest) {
    return String(kind).startsWith('webgl') ? null : original.call(this, kind, ...rest);
  };
`;

test('a software renderer gets the still portrait and never loads the model', async ({ page }) => {
  const models: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('mallorca.glb')) models.push(request.url());
  });
  await page.goto(FAST_URL);
  await byId(page, 'start-cash').click();
  const seat = byId(page, 'face-seat');
  await expect(seat).toHaveAttribute('data-face', 'portrait');
  await expect(seat.locator('img')).toBeVisible();
  const box = await seat.boundingBox();
  const viewport = page.viewportSize();
  expect(box && viewport && box.y >= 0 && box.x + box.width <= viewport.width).toBe(true);
  await byId(page, 'passive').click();
  await expect(seat).toHaveAttribute('data-face', 'portrait');
  expect(models).toEqual([]);
});

test('falls back to the still portrait without WebGL', async ({ page }) => {
  const models: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('mallorca.glb')) models.push(request.url());
  });
  await page.addInitScript(NO_WEBGL);
  await page.goto(FAST_URL);
  await byId(page, 'start-cash').click();
  await expect(byId(page, 'face-seat')).toHaveAttribute('data-face', 'portrait');
  await expect(byId(page, 'face-seat').locator('img')).toBeVisible();
  await byId(page, 'passive').click();
  await expect(byId(page, 'face-seat')).toHaveAttribute('data-face', 'portrait');
  expect(models).toEqual([]);
});

test('can be turned off and stays off across a reload', async ({ page }) => {
  await page.goto(FAST_URL);
  await byId(page, 'start-cash').click();
  await expect(byId(page, 'face-seat')).toBeVisible();
  await page.locator('.menu-summary').click();
  await byId(page, 'face').click();
  await expect(byId(page, 'face-seat')).toHaveCount(0);
  await page.reload();
  await byId(page, 'start-cash').click();
  await expect(byId(page, 'passive')).toBeVisible();
  await expect(byId(page, 'face-seat')).toHaveCount(0);
});
