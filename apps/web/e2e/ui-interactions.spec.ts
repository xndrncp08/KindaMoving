import { test, expect } from './fixtures/ui-test';
import { activities, runId } from './fixtures/ui-data';
import { audit } from './mobile-audit';

test.use({
  viewport: { width: 390, height: 844 },
  reducedMotion: 'reduce',
  hasTouch: true,
  isMobile: true,
});

test('More contains secondary tools, closes with Back and restores focus', async ({
  page,
}) => {
  await page.goto('/app/activities');
  await page.getByRole('button', { name: 'More', exact: true }).tap();
  const dialog = page.getByRole('dialog');
  await expect(
    dialog.getByRole('link', { name: 'Ghost', exact: true }),
  ).toBeVisible();
  await expect(
    dialog.getByRole('link', { name: 'Home', exact: true }),
  ).toHaveCount(0);
  await page.goBack();
  await expect(dialog).toBeHidden();
  await expect(page).toHaveURL(/\/app\/activities$/);
  await expect(
    page.getByRole('button', { name: 'More', exact: true }),
  ).toBeFocused();
  await page.getByRole('button', { name: 'More', exact: true }).tap();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await page.getByRole('link', { name: 'KindaMoving home' }).click();
  await expect(page).toHaveURL(/\/app$/);
});

test('Import deep link opens the form and failed upload retains its file', async ({
  page,
}) => {
  await page.goto('/app/activities');
  await expect(page.getByLabel('Activity file')).toBeHidden();
  await page
    .locator('.mobile-header')
    .getByRole('link', { name: 'Import', exact: true })
    .click();
  await expect(page.getByLabel('Activity file')).toBeVisible();
  await page.getByLabel('Activity file').setInputFiles({
    name: 'synthetic.gpx',
    mimeType: 'application/gpx+xml',
    buffer: Buffer.from('<gpx/>'),
  });
  await page.route('**/api/uploads', (route) =>
    route.fulfill({
      status: 503,
      json: { error: 'Synthetic upload unavailable. Try again.' },
    }),
  );
  await page.getByRole('button', { name: 'Upload and Import' }).click();
  await expect(page.locator('main').getByRole('alert')).toContainText(
    'Try again',
  );
  await page.locator('#import > summary').click();
  await page.locator('#import > summary').click();
  expect(
    await page
      .getByLabel('Activity file')
      .evaluate((el) => (el as HTMLInputElement).files?.length),
  ).toBe(1);
});

test('planner keeps its action reachable at half/full stops and keeps errors with inputs', async ({
  page,
}) => {
  await page.goto('/app/routes/plan?lat=51.05320&lon=-114.07270&km=6');
  const button = page.getByRole('button', { name: 'Find Routes', exact: true });
  await expect(button).toBeInViewport();
  const handle = page.locator('.panel-handle');
  await expect(page.locator('.maplibregl-canvas')).toBeVisible();
  for (const control of await page
    .locator('.maplibregl-ctrl-group button, .maplibregl-ctrl-attrib-button')
    .all()) {
    const box = (await control.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
  }
  await handle.focus();
  await page.keyboard.press('ArrowUp');
  await expect(page.locator('.workspace-panel')).toHaveAttribute(
    'data-snap',
    'full',
  );
  await expect(button).toBeInViewport();
  await page.getByRole('button', { name: '10 km', exact: true }).click();
  await page.route('**/api/routes/generate', (route) =>
    route.fulfill({
      status: 503,
      json: { error: 'Synthetic routing outage.' },
    }),
  );
  await button.click();
  await expect(page.locator('main').getByRole('alert')).toContainText(
    'Your settings are kept',
  );
  await expect(page.getByLabel('Distance (km)')).toHaveValue('10');
  await handle.focus();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await expect(button).toBeHidden();
  await expect(page.locator('#planner-body')).toBeHidden();
  await handle.click();
  await expect(button).toBeInViewport();
});

test('analysis preserves keyboard tracing, section jumps and edits through disclosure', async ({
  page,
}) => {
  await page.goto('/app/activities/' + runId);
  await expect(
    page.getByRole('textbox', { name: 'Name', exact: true }),
  ).toBeHidden();
  await page.locator('#streams-title').scrollIntoViewIfNeeded();
  const slider = page.getByRole('slider', { name: 'Trace run sample' });
  await expect(slider).toBeVisible();
  await slider.focus();
  await page.keyboard.press('ArrowRight');
  await expect(slider).toHaveValue('1');
  await expect(page.locator('.cursor-readout')).not.toContainText(
    'use the sample slider',
  );
  await page
    .getByRole('navigation', { name: 'Run sections' })
    .getByRole('link', { name: 'Splits', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Splits', exact: true }),
  ).toBeInViewport();
  await page.getByText('Edit details', { exact: true }).click();
  await page
    .getByRole('textbox', { name: 'Name', exact: true })
    .fill('Unsaved synthetic label');
  await page.getByText('Edit details', { exact: true }).click();
  await page.getByText('Edit details', { exact: true }).click();
  await expect(
    page.getByRole('textbox', { name: 'Name', exact: true }),
  ).toHaveValue('Unsaved synthetic label');
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('permanently');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();
});

test('Gear renders one shoe, a visible dark-mode meter, and contextual management', async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/app/gear');
  await expect(
    page.getByRole('heading', { name: 'Daily trainers', exact: true }),
  ).toHaveCount(1);
  const meter = page.getByRole('meter', { name: 'Daily trainers wear' });
  await expect(meter).toBeVisible();
  expect(
    await meter
      .locator('div')
      .evaluate((el) => getComputedStyle(el).backgroundColor),
  ).not.toBe('rgb(22, 24, 22)');
  await expect(
    page.getByRole('button', { name: 'Delete', exact: true }),
  ).toBeHidden();
  await page.getByText('Manage shoe', { exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Edit', exact: true }),
  ).toBeVisible();
});

test('Training keeps a compact agenda and discloses paces and the full library', async ({
  page,
}) => {
  await page.goto('/app/training');
  await expect(page.locator('.calendar .day')).toHaveCount(7);
  for (const day of await page.locator('.calendar .day:not(:has(a))').all())
    expect((await day.boundingBox())!.height).toBeLessThan(65);
  await expect(
    page.getByText('Estimates, not prescriptions.', { exact: false }),
  ).toBeHidden();
  await page.getByText('Your training paces', { exact: false }).click();
  await expect(
    page.getByText('Estimates, not prescriptions.', { exact: false }),
  ).toBeVisible();
  await page.getByText('All workouts (1)', { exact: true }).click();
  await page.getByText('Manage workout', { exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Edit', exact: true }),
  ).toBeVisible();
});

test('Home status distinguishes reconnect and failed queries', async ({
  page,
}) => {
  await page.route('**/api/coros', (route) =>
    route.fulfill({ json: { status: 'reauth_required' } }),
  );
  await page.goto('/app');
  await expect(
    page.getByText('Reconnect required', { exact: true }),
  ).toBeVisible();
  await page.route('**/api/coros', (route) =>
    route.fulfill({ status: 503, json: { error: 'Synthetic outage' } }),
  );
  await page.reload();
  await expect(
    page.getByText('Status unavailable', { exact: true }),
  ).toBeVisible({ timeout: 15000 });
});

test('empty and filtered Runs give different recovery guidance', async ({
  page,
}) => {
  await page.route('**/api/activities', (route) => route.fulfill({ json: [] }));
  await page.goto('/app/activities');
  await expect(
    page.getByRole('heading', { name: 'No runs yet' }),
  ).toBeVisible();
  await page.getByRole('searchbox').fill('missing run');
  await expect(page.getByRole('heading', { name: 'No matches' })).toBeVisible();
  await expect(
    page.getByText('Try another search or change the filter.'),
  ).toBeVisible();
});

test('large run history with long labels remains usable at 320px', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.route('**/api/activities', (route) =>
    route.fulfill({
      json: Array.from({ length: 500 }, (_, i) => ({
        ...activities[0],
        id: `synthetic-${i}`,
        title: 'Long synthetic activity label '.repeat(4),
      })),
    }),
  );
  await page.goto('/app/activities');
  await expect(
    page.getByText(
      'Showing the 500 most recent records. Totals include all activities.',
    ),
  ).toBeVisible();
  expect(await audit(page)).toEqual([]);
  await page.getByRole('searchbox').fill('nothing matches');
  await expect(page.getByRole('heading', { name: 'No matches' })).toBeVisible();
});

test('settings connection and data controls remain reachable at 200 percent text', async ({
  page,
}) => {
  await page.goto('/app/settings');
  await page.addStyleTag({ content: 'html { font-size: 200%; }' });
  await expect(
    page.getByRole('button', { name: 'Connect COROS', exact: true }),
  ).toBeVisible();
  await page.getByText('Your data & account', { exact: true }).click();
  await expect(
    page.getByRole('link', { name: 'Export my data', exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => {
      if (document.documentElement.scrollWidth <= innerWidth + 1) return [];
      return [...document.querySelectorAll('body *')]
        .filter((el) => el.getBoundingClientRect().right > innerWidth + 1)
        .map((el) => ({
          tag: el.tagName,
          class: el.className,
          text: el.textContent?.slice(0, 40),
          width: el.getBoundingClientRect().width,
        }))
        .slice(-12);
    }),
  ).toEqual([]);
});
