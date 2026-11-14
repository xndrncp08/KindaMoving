import { mkdirSync } from 'node:fs';
import { test, expect } from './fixtures/ui-test';
import { coordinates, runId } from './fixtures/ui-data';

test.use({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
const shots = '../../output/playwright/ui-refinement/states';
test.beforeEach(() => mkdirSync(shots, { recursive: true }));

test('the synthetic upstream rejects writes', async ({ request }) => {
  const response = await request.post(
    'http://127.0.0.1:54329/rest/v1/activities',
    { data: { title: 'Must not be stored' } },
  );
  expect(response.status()).toBe(405);
  expect(
    (await request.get('http://127.0.0.1:54329/rest/v1/activities')).ok(),
  ).toBe(true);
});

test('route candidates survive a failed save and retain their metrics', async ({
  page,
}) => {
  await page.route('**/api/routes/generate', (route) =>
    route.fulfill({
      json: {
        status: 'ok',
        routes: [0, 1].map((i) => ({
          geometry: { type: 'LineString', coordinates },
          metrics: {
            distance_m: 6000 + i * 200,
            climb_m: 42,
            elevation_coverage: 1,
            crossings: [],
          },
          tempo: null,
          score: i,
          score_parts: { distance: i },
          reasons: ['Synthetic route for interface testing.'],
        })),
      },
    }),
  );
  await page.route('**/api/routes/save', (route) =>
    route.fulfill({ status: 503, json: { error: 'Synthetic save outage.' } }),
  );
  await page.goto(
    '/app/routes/plan?lat=51.05320&lon=-114.07270&km=6&sheet=full',
  );
  await page.getByRole('button', { name: 'Find Routes', exact: true }).click();
  const candidates = page.getByRole('group', { name: 'Candidate routes' });
  await expect(candidates.getByRole('button')).toHaveCount(2);
  await candidates.getByRole('button').nth(1).click();
  await expect(candidates.getByRole('button').nth(1)).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByRole('button', { name: 'Save Route B', exact: true }).click();
  await expect(page.locator('main').getByRole('alert')).toContainText(
    'Your candidates are still here',
  );
  await expect(candidates.getByRole('button')).toHaveCount(2);
  await page.screenshot({
    path: `${shots}/route-save-error.png`,
    fullPage: true,
    caret: 'initial',
  });
});

test('COROS running and failed sync states retain recovery actions', async ({
  page,
}) => {
  await page.route('**/api/coros', (route) =>
    route.fulfill({
      json: {
        status: 'connected',
        last_sync_at: '2026-11-13T12:00:00Z',
        connected_at: '2026-11-01T12:00:00Z',
        issuer: 'https://synthetic.example.test',
        records: { imported: 12 },
        capabilities: ['activities'],
      },
    }),
  );
  await page.route('**/api/jobs', (route) =>
    route.fulfill({
      json: [
        {
          id: 'synthetic-running',
          kind: 'coros_sync',
          status: 'running',
          attempts: 1,
          max_attempts: 3,
          created_at: '2026-11-13T12:00:00Z',
          progress: { imported: 2 },
        },
        {
          id: 'synthetic-failed',
          kind: 'coros_sync',
          status: 'failed',
          attempts: 3,
          max_attempts: 3,
          created_at: '2026-11-12T12:00:00Z',
          error_message: 'Synthetic provider outage. Try syncing again.',
          progress: {},
        },
      ],
    }),
  );
  await page.goto('/app/settings#coros');
  await expect(
    page.getByRole('button', { name: 'Sync now', exact: true }),
  ).toBeVisible();
  await page.getByText('Sync history', { exact: true }).click();
  await expect(
    page.getByText('Synthetic provider outage. Try syncing again.', {
      exact: false,
    }),
  ).toBeVisible();
  await page.screenshot({
    path: `${shots}/coros-sync-states.png`,
    fullPage: true,
    caret: 'initial',
  });
});

test('conditions keep uncertainty and allow a location-permission recovery', async ({
  page,
  context,
}) => {
  await context.clearPermissions();
  await page.route('**/api/conditions?**', (route) =>
    route.fulfill({
      json: {
        note: 'Synthetic reports are not live observations.',
        assessments: [
          {
            kind: 'ice',
            lat: 51.0532,
            lon: -114.0727,
            report_ids: ['synthetic-report'],
            severity: 2,
            probability: 0.63,
            status: 'possible',
            conflicting: false,
            independent_sources: 1,
            last_observed_at: '2026-11-13T12:00:00Z',
            description: 'Synthetic: ice along the shaded pathway.',
            official: null,
            own: false,
            factors: [],
          },
        ],
      },
    }),
  );
  await page.goto('/app/conditions');
  await expect(
    page.getByText('Synthetic: ice along the shaded pathway.'),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Avoid', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Avoid', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await page.screenshot({
    path: `${shots}/conditions-observation.png`,
    fullPage: true,
    caret: 'initial',
  });
});

test('Form shows observed metrics, quality disclosure and failed analyses', async ({
  page,
}) => {
  await page.route('**/api/form', (route) =>
    route.fulfill({
      json: [
        {
          id: 'synthetic-complete',
          label: 'Synthetic treadmill clip',
          status: 'complete',
          created_at: '2026-11-13T12:00:00Z',
          annotated_path: null,
          result: {
            usable: true,
            metrics: {
              cadence: { steps_per_min: 172, confidence: 0.84 },
              trunk_lean: { median: 6, p10: 4, p90: 9, n: 120 },
            },
            quality: {
              duration_s: 15,
              fps: 60,
              resolution: [1920, 1080],
              view: 'side',
              detection_rate: 0.94,
              mean_visibility: 0.9,
            },
            warnings: [
              'Synthetic observation: compare clips filmed from the same angle.',
            ],
            disclaimer:
              'Approximate pose-based observations, not a clinical assessment.',
          },
        },
        {
          id: 'synthetic-failed',
          label: 'Synthetic incomplete clip',
          status: 'failed',
          created_at: '2026-11-12T12:00:00Z',
          error:
            'Runner was not visible. Keep your whole body in frame and try another clip.',
          result: null,
        },
      ],
    }),
  );
  await page.goto('/app/form');
  await expect(page.getByText('172 spm (confidence 0.84)')).toBeVisible();
  await expect(
    page.getByRole('alert').filter({ hasText: 'Keep your whole body' }),
  ).toBeVisible();
  await page.getByText('Recording quality', { exact: true }).click();
  await expect(
    page.getByText('runner detected in', { exact: false }),
  ).toBeVisible();
  await page.screenshot({
    path: `${shots}/form-results.png`,
    fullPage: true,
    caret: 'initial',
  });
});

test('slow and failed streams distinguish loading from absent sensor data', async ({
  page,
}) => {
  let release: () => void = () => {};
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/activity-streams/*', async (route) => {
    await pending;
    await route.fulfill({
      status: 403,
      json: { error: 'Synthetic permission error. Reload or sign in again.' },
    });
  });
  await page.goto('/app/activities/' + runId);
  await expect(
    page
      .locator('.run-panels')
      .getByRole('status', { name: 'Loading records' }),
  ).toBeAttached();
  release();
  await expect(
    page.getByRole('alert').filter({ hasText: 'permission error' }),
  ).toBeVisible();
  await expect(page.getByText('No time-series data in this file.')).toHaveCount(
    0,
  );
});
