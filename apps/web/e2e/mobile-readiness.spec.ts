import { test, expect, devices } from '@playwright/test';
import { mkdirSync } from 'node:fs';
const state = process.env.KM_E2E_STATE;
test.use({
  ...devices['Pixel 7'],
  defaultBrowserType: 'chromium',
  storageState: state,
  locale: 'en-CA',
  timezoneId: 'America/Edmonton',
});
test.skip(!state, 'A private synthetic-account state is required');
test.beforeEach(async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop');
  // Deterministic map fixture for interaction/visual tests, never performance/hosted evidence.
  await page.route('https://tiles.openfreemap.org/styles/*', (route) =>
    route.fulfill({ json: { version: 8, sources: {}, layers: [] } }),
  );
});
async function run(page: import('@playwright/test').Page) {
  await page.goto('/app');
  const records = await page.evaluate(() =>
    fetch('/api/activities').then((r) => r.json()),
  );
  return records.find((r: { source: string }) => r.source !== 'manual').id;
}
test('first authenticated visit and a remembered-date visit hydrate without errors', async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await context.clearCookies({ name: /^km-(tz|locale)$/ });
  await page.goto('/app');
  await expect(page.locator('.week')).toBeVisible();
  expect(
    (await context.cookies()).some((cookie) => cookie.name === 'km-tz'),
  ).toBe(true);
  await page.reload();
  await expect(page.locator('.week')).toBeVisible();
  expect(errors).toEqual([]);
});
test('secondary map initializes on visibility and chart tracing works by keyboard', async ({
  page,
}) => {
  const id = await run(page);
  await page.goto('/app/activities/' + id);
  const slider = page.getByRole('slider', { name: 'Trace run sample' });
  await expect(slider).toBeVisible();
  await slider.focus();
  await page.keyboard.press('ArrowRight');
  await expect(slider).toHaveValue('1');
  await expect(page.locator('.cursor-readout')).not.toContainText(
    'use the sample slider',
  );
  const map = page.locator('.run-map');
  await map.scrollIntoViewIfNeeded();
  await expect(map.locator('.maplibregl-canvas')).toBeVisible();
  await expect(
    map.locator('.maplibregl-cooperative-gesture-screen'),
  ).toBeAttached();
  mkdirSync('test-results/phase5', { recursive: true });
  await page.screenshot({
    path: 'test-results/phase5/analyze-keyboard.png',
    caret: 'initial',
  });
});
test('planner sheet URL restores its stop through reload and orientation changes', async ({
  page,
}) => {
  await page.goto('/app/routes/plan?lat=51.05320&lon=-114.07270&km=6');
  const handle = page.locator('.panel-handle');
  await handle.focus();
  await page.keyboard.press('ArrowUp');
  await expect(page.locator('.workspace-panel')).toHaveAttribute(
    'data-snap',
    'full',
  );
  await expect(page).toHaveURL(/sheet=full/);
  await page.reload();
  await expect(page.locator('.workspace-panel')).toHaveAttribute(
    'data-snap',
    'full',
  );
  await page.setViewportSize({ width: 852, height: 393 });
  await page.setViewportSize({ width: 393, height: 852 });
  await expect(page.locator('.workspace-panel')).toHaveAttribute(
    'data-snap',
    'full',
  );
});
test('failed uploads retain the file and permit a successful retry without a hosted mutation', async ({
  page,
}) => {
  await page.goto('/app/activities');
  let attempts = 0;
  await page.route('**/api/uploads', (route) => {
    attempts++;
    return route.fulfill({
      status: attempts === 1 ? 503 : 202,
      json:
        attempts === 1
          ? { error: 'Temporary test outage' }
          : { message: 'Synthetic response: retry accepted' },
    });
  });
  await page.getByLabel('Activity file').setInputFiles({
    name: 'synthetic.gpx',
    mimeType: 'application/gpx+xml',
    buffer: Buffer.from('<gpx></gpx>'),
  });
  await page.getByRole('button', { name: 'Upload and Import' }).click();
  await expect(
    page.getByRole('alert').filter({ hasText: 'Temporary test outage' }),
  ).toBeVisible();
  expect(
    await page
      .getByLabel('Activity file')
      .evaluate((el) => (el as HTMLInputElement).files?.length),
  ).toBe(1);
  await page.getByRole('button', { name: 'Upload and Import' }).click();
  await expect(
    page.getByText('Synthetic response: retry accepted'),
  ).toBeVisible();
  expect(attempts).toBe(2);
});
test('offline report survives a lost response and synchronizes once reconnected (intercepted)', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: 51.0532, longitude: -114.0727 });
  await page.goto('/app/conditions');
  await page.getByRole('button', { name: 'Use My Location' }).click();
  await expect(page.getByText(/At 51\.05320/)).toBeVisible();
  const bodies: Record<string, unknown>[] = [];
  await page.route('**/api/conditions', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    bodies.push(route.request().postDataJSON());
    if (bodies.length === 1) return route.abort('internetdisconnected');
    return route.fulfill({ json: { ok: true } });
  });
  await page
    .getByLabel('Details (optional)')
    .fill('Synthetic offline recovery test. Intercepted; never public.');
  await page.getByRole('button', { name: 'Share Report' }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'waiting to send' }),
  ).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect.poll(() => bodies.length).toBe(2);
  expect(bodies[0].client_id).toBe(bodies[1].client_id);
  await expect(
    page.getByRole('status').filter({ hasText: 'waiting to send' }),
  ).toHaveCount(0);
});
