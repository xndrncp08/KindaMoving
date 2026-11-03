import { test, expect, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { VIEWPORTS, audit } from './mobile-audit';

/**
 * Mobile-first layout audit across the viewport matrix. Public pages always
 * run; signed-in pages run when KM_E2E_EMAIL/KM_E2E_PASSWORD name a dedicated
 * test account (never a real user). Screenshots land in test-results/mobile.
 */
const SHOTS = process.env.KM_SHOTS_DIR ?? 'test-results/mobile';
const privateState = process.env.KM_E2E_STATE;
const signedIn =
  !!privateState ||
  (!!process.env.KM_E2E_EMAIL && !!process.env.KM_E2E_PASSWORD);
const only = process.env.KM_PAGES?.split(',');

const publicPages = { landing: '/', login: '/login', privacy: '/privacy' };
const appPages = {
  home: '/app',
  runs: '/app/activities',
  run: '/app/activities/:run',
  trends: '/app/analytics',
  routes: '/app/routes',
  planner: '/app/routes/plan?lat=51.05320&lon=-114.07270&km=6',
  training: '/app/training',
  ghost: '/app/ghost?a=:a&b=:b',
  conditions: '/app/conditions',
  gear: '/app/gear',
  form: '/app/form',
  settings: '/app/settings',
};

async function check(page: Page, name: string, vp: string, path: string) {
  const errors: string[] = [];
  page.on('console', (m) => {
    // Map tiles are third-party network fetches; everything else is ours.
    if (m.type() === 'error' && !/tiles\.openfreemap/.test(m.text()))
      errors.push(m.text());
  });
  // Hydration mismatches surface as page errors, not console messages.
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(path, { waitUntil: 'load' });
  await page.waitForTimeout(2500);
  mkdirSync(SHOTS, { recursive: true });
  // caret: 'initial' — Playwright's caret hiding injects an inline style that
  // React reports as a hydration attribute mismatch if hydration is still running.
  await page.screenshot({
    path: `${SHOTS}/${name}-${vp}.png`,
    fullPage: true,
    caret: 'initial',
  });
  const findings = await audit(page);
  writeFileSync(
    `${SHOTS}/${name}-${vp}.json`,
    JSON.stringify({ findings, errors }, null, 2),
  );
  expect.soft(findings, `${name} @ ${vp}`).toEqual([]);
  expect.soft(errors, `${name} @ ${vp} console`).toEqual([]);
}

test.describe('mobile audit', () => {
  // The matrix sets its own viewports, so it runs once (desktop project).
  test.beforeEach(({}, info) => test.skip(info.project.name !== 'desktop'));

  for (const [vp, width, height] of VIEWPORTS)
    for (const [name, path] of Object.entries(publicPages)) {
      if (only && !only.includes(name)) continue;
      test(`${name} @ ${vp}`, async ({ browser }) => {
        const page = await browser.newPage({
          viewport: { width, height },
          hasTouch: width < 1024,
          isMobile: width < 768,
        });
        await check(page, name, vp, path);
        await page.close();
      });
    }

  test.describe('signed in', () => {
    test.skip(!signedIn, 'set KM_E2E_EMAIL and KM_E2E_PASSWORD (test account)');
    let state: string;
    let ids: Record<string, string> = {};
    test.beforeAll(async ({ browser }) => {
      const page = await browser.newPage({ storageState: privateState });
      if (privateState) await page.goto('/app');
      else {
        await page.goto('/login');
        await page.getByLabel('Email').fill(process.env.KM_E2E_EMAIL!);
        await page.getByLabel('Password').fill(process.env.KM_E2E_PASSWORD!);
        await page.getByRole('button', { name: /log in/i }).click();
        await page.waitForURL(/\/app/);
      }
      const runs: { id: string; distance_m: number }[] = await page.evaluate(
        async () => (await fetch('/api/activities')).json(),
      );
      // Two runs of the same loop make a valid ghost pair.
      const same = runs.filter(
        (r) => Math.abs(r.distance_m - runs[0].distance_m) < 100,
      );
      ids = { run: runs[0]?.id, a: same[0]?.id, b: same[1]?.id ?? runs[1]?.id };
      state = test.info().outputPath('state.json');
      await page.context().storageState({ path: state });
      await page.close();
    });
    for (const [vp, width, height] of VIEWPORTS)
      for (const [name, raw] of Object.entries(appPages)) {
        if (only && !only.includes(name)) continue;
        test(`${name} @ ${vp}`, async ({ browser }) => {
          const ctx = await browser.newContext({
            storageState: state,
            viewport: { width, height },
            hasTouch: width < 1024,
            isMobile: width < 768,
          });
          const page = await ctx.newPage();
          const path = raw.replace(/:(run|a|b)\b/g, (_, k) => ids[k]);
          await check(page, name, vp, path);
          await ctx.close();
        });
      }
  });
});
