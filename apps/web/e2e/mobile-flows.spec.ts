import { test, expect, devices, type Page } from '@playwright/test';

/**
 * Touch interactions on a phone profile against a dedicated test account
 * (KM_E2E_EMAIL / KM_E2E_PASSWORD). Emulated Chromium, not a physical device.
 */
const privateState = process.env.KM_E2E_STATE;
const signedIn =
  !!privateState ||
  (!!process.env.KM_E2E_EMAIL && !!process.env.KM_E2E_PASSWORD);
test.use({ ...devices['Pixel 7'], defaultBrowserType: 'chromium' });
test.use({ storageState: privateState });
test.skip(!signedIn, 'set KM_E2E_EMAIL and KM_E2E_PASSWORD (test account)');
test.beforeEach(({}, info) => test.skip(info.project.name !== 'desktop'));

async function login(page: Page, next = '/app') {
  if (privateState) {
    await page.goto(next);
    return;
  }
  await page.goto('/login');
  await page.getByLabel('Email').fill(process.env.KM_E2E_EMAIL!);
  await page.getByLabel('Password').fill(process.env.KM_E2E_PASSWORD!);
  await page.getByRole('button', { name: /log in/i }).click();
  await page.waitForURL(/\/app/);
  if (next !== '/app') await page.goto(next);
}

test('Back closes the More sheet without leaving the page', async ({
  page,
}) => {
  await login(page, '/app/activities');
  await page.getByRole('button', { name: 'More' }).click();
  const sheet = page.getByRole('dialog');
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole('link', { name: 'Ghost' })).toBeVisible();
  await page.goBack();
  await expect(sheet).toBeHidden();
  await expect(page).toHaveURL(/\/app\/activities$/);
  // Escape also closes it and leaves no stray history entry behind.
  await page.getByRole('button', { name: 'More' }).click();
  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();
  await page.goBack();
  await expect(page).not.toHaveURL(/\/app\/activities$/);
});

test('route sheet drags between snaps and works by keyboard', async ({
  page,
}) => {
  await login(page, '/app/routes/plan?lat=51.05320&lon=-114.07270&km=6');
  const handle = page.locator('.panel-handle');
  const panel = page.locator('.workspace-panel');
  await expect(panel).toHaveAttribute('data-snap', 'half');
  // The brand header gives the map the whole screen on this page.
  await expect(page.locator('.mobile-header')).toBeHidden();

  const box = (await handle.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + 20);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y - 300, { steps: 12 });
  await page.mouse.up();
  await expect(panel).toHaveAttribute('data-snap', 'full');

  await handle.focus();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await expect(panel).toHaveAttribute('data-snap', 'peek');
  await expect(handle).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('#planner-body')).toBeHidden();

  await handle.click(); // tap toggles back to the working height
  await expect(panel).toHaveAttribute('data-snap', 'half');
  await page.getByRole('button', { name: '10 km' }).click();
  await expect(page.getByLabel('Distance (km)')).toHaveValue('10');
});

test('the keyboard hides the tab bar instead of covering the field', async ({
  page,
}) => {
  await login(page, '/app/activities');
  const tabs = page.getByRole('navigation', { name: 'Primary' });
  await expect(tabs).toBeVisible();
  await page.getByRole('searchbox').focus();
  await expect(tabs).toBeHidden();
  await page.getByRole('searchbox').blur();
  await expect(tabs).toBeVisible();
});

test('Home leads with the next workout on phones', async ({ page }) => {
  await login(page);
  const next = (await page.locator('.next-up').boundingBox())!;
  const week = (await page.locator('.week').boundingBox())!;
  expect(next.y).toBeLessThan(week.y);
  await expect(
    page.getByRole('region', { name: 'Device and conditions' }),
  ).toBeVisible();
});

test('condition reports are one-tap with the map first', async ({ page }) => {
  await login(page, '/app/conditions');
  const map = (await page
    .locator('.conditions-layout .map-container')
    .boundingBox())!;
  const form = (await page
    .getByRole('heading', { name: 'Report a condition' })
    .boundingBox())!;
  expect(map.y).toBeLessThan(form.y);
  const avoid = page.getByRole('button', { name: 'Avoid', exact: true });
  await avoid.click();
  await expect(avoid).toHaveAttribute('aria-pressed', 'true');
  await expect(
    page.getByRole('button', { name: 'Use My Location' }),
  ).toBeVisible();
  // Not submitted: reports are public, and this is a shared test database.
});

test('the training week reads as a vertical agenda', async ({ page }) => {
  await login(page, '/app/training');
  const days = page.locator('.calendar .day');
  await expect(days).toHaveCount(7);
  const [a, b] = [
    await days.nth(0).boundingBox(),
    await days.nth(1).boundingBox(),
  ];
  expect(b!.y).toBeGreaterThan(a!.y);
  expect(Math.abs(b!.x - a!.x)).toBeLessThan(2);
});

test('run analysis fits a phone and jumps between sections', async ({
  page,
}) => {
  await login(page);
  const runs: { id: string }[] = await page.evaluate(async () =>
    (await fetch('/api/activities')).json(),
  );
  await page.goto('/app/activities/' + runs[0].id);
  await expect(page.getByRole('heading', { name: 'Splits' })).toBeAttached();
  await page
    .getByRole('navigation', { name: 'Run sections' })
    .getByRole('link', { name: 'Splits' })
    .click();
  await expect(page.getByRole('heading', { name: 'Splits' })).toBeInViewport();
  const table = page
    .locator('section[aria-labelledby="splits-title"] .table-scroll')
    .first();
  // All split columns fit without scrolling sideways.
  expect(
    await table.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
  ).toBe(true);
});
