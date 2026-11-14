import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test, expect } from './fixtures/ui-test';
import {
  activities,
  runId,
  routeId,
  shoeId,
  workoutId,
} from './fixtures/ui-data';
import { VIEWPORTS, audit } from './mobile-audit';

const screens = {
  landing: '/',
  login: '/login',
  onboarding: '/onboarding',
  home: '/app',
  runs: '/app/activities',
  analyze: '/app/activities/' + runId,
  trends: '/app/analytics',
  routes: '/app/routes',
  planner: '/app/routes/plan?lat=51.05320&lon=-114.07270&km=6',
  route: '/app/routes/' + routeId,
  conditions: '/app/conditions',
  training: '/app/training',
  plan: '/app/training/plan',
  workout: '/app/training/' + workoutId,
  ghost: `/app/ghost?a=${runId}&b=${activities[1].id}`,
  gear: '/app/gear',
  shoe: '/app/gear/' + shoeId,
  form: '/app/form',
  settings: '/app/settings',
};
const phase = process.env.KM_UI_PHASE ?? 'after';
const axeSource = readFileSync(
  createRequire(import.meta.url).resolve('axe-core/axe.min.js'),
  'utf8',
);
const only = process.env.KM_PAGES?.split(',');
const matrix =
  process.env.KM_UI_MATRIX === '1'
    ? VIEWPORTS
    : VIEWPORTS.filter(([n]) => n === 'modern-iphone' || n === 'desktop');
for (const theme of ['light', 'dark'] as const)
  for (const [vp, width, height] of matrix)
    for (const [name, path] of Object.entries(screens)) {
      if (only && !only.includes(name)) continue;
      test(`${name} ${theme} ${vp}`, async ({ page }) => {
        const errors: string[] = [];
        page.on('pageerror', (e) => errors.push(e.message));
        page.on('console', (m) => {
          if (m.type() === 'error') errors.push(m.text());
        });
        await page.setViewportSize({ width, height });
        await page.emulateMedia({
          colorScheme: theme,
          reducedMotion: 'reduce',
        });
        await page.addInitScript(
          (t) => localStorage.setItem('theme', t),
          theme,
        );
        await page.goto(path);
        await expect(page.locator('main h1')).toBeAttached();
        await page.waitForTimeout(1200);
        for (const section of await page
          .locator('.run-panels > section')
          .all()) {
          await section.scrollIntoViewIfNeeded();
          await page.waitForTimeout(300);
        }
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.waitForTimeout(500);
        const dir = `../../output/playwright/ui-refinement/${phase}`;
        mkdirSync(dir, { recursive: true });
        await page.screenshot({
          path: `${dir}/${name}-${theme}-${vp}.png`,
          fullPage: true,
          caret: 'initial',
        });
        const findings = await audit(page);
        const accessibility = [];
        if (vp === 'modern-iphone' || vp === 'desktop') {
          await page.evaluate(axeSource);
          accessibility.push(
            ...(await page.evaluate(async () => {
              const axe = (
                window as unknown as {
                  axe: {
                    run: (
                      root: Document,
                      options: unknown,
                    ) => Promise<{
                      violations: {
                        id: string;
                        impact: string;
                        nodes: { target: string[]; failureSummary: string }[];
                      }[];
                    }>;
                  };
                }
              ).axe;
              const results = await axe.run(document, {
                runOnly: {
                  type: 'tag',
                  values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'],
                },
              });
              return results.violations.map(({ id, impact, nodes }) => ({
                id,
                impact,
                nodes: nodes.map(({ target, failureSummary }) => ({
                  target,
                  failureSummary,
                })),
              }));
            })),
          );
        }
        writeFileSync(
          `${dir}/${name}-${theme}-${vp}.json`,
          JSON.stringify({ findings, errors, accessibility }, null, 2),
        );
        if (phase !== 'before') {
          expect.soft(findings).toEqual([]);
          expect.soft(errors).toEqual([]);
          expect.soft(accessibility).toEqual([]);
        }
      });
    }
