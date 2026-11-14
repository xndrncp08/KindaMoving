import { mkdirSync, writeFileSync } from 'node:fs';
import { test, expect } from './fixtures/ui-test';
import { runId } from './fixtures/ui-data';

// Opt-in production lab; fixture APIs/tiles are identical before and after.
if (process.env.KM_UI_PERF === '1') {
  for (const [name, path] of [
    ['home', '/app'],
    ['analyze', '/app/activities/' + runId],
  ])
    for (let run = 1; run <= 3; run++)
      test(`rendering lab ${name} ${run}`, async ({ page, context }) => {
        await page.setViewportSize({ width: 393, height: 852 });
        const session = await context.newCDPSession(page);
        await session.send('Network.enable');
        await session.send('Network.setCacheDisabled', { cacheDisabled: true });
        await session.send('Emulation.setCPUThrottlingRate', { rate: 4 });
        await session.send('Network.emulateNetworkConditions', {
          offline: false,
          latency: 150,
          downloadThroughput: 209715,
          uploadThroughput: 86400,
        });
        await page.addInitScript(() => {
          const readings = { lcp_ms: 0, cls: 0, long_task_blocking_ms: 0 };
          (window as unknown as { kmReadings: typeof readings }).kmReadings =
            readings;
          new PerformanceObserver((list) => {
            for (const entry of list.getEntries())
              readings.lcp_ms = entry.startTime;
          }).observe({ type: 'largest-contentful-paint', buffered: true });
          new PerformanceObserver((list) => {
            for (const entry of list.getEntries() as (PerformanceEntry & {
              hadRecentInput: boolean;
              value: number;
            })[])
              if (!entry.hadRecentInput) readings.cls += entry.value;
          }).observe({ type: 'layout-shift', buffered: true });
          new PerformanceObserver((list) => {
            for (const entry of list.getEntries())
              readings.long_task_blocking_ms += Math.max(
                0,
                entry.duration - 50,
              );
          }).observe({ type: 'longtask', buffered: true });
        });
        const response = await page.goto(path);
        expect(response?.headers()['content-security-policy']).not.toContain(
          'unsafe-eval',
        );
        await expect(page.locator('main h1')).toBeVisible();
        await page.waitForTimeout(3000);
        const metrics = await page.evaluate(() => ({
          ...(
            window as unknown as {
              kmReadings: {
                lcp_ms: number;
                cls: number;
                long_task_blocking_ms: number;
              };
            }
          ).kmReadings,
          transfer_bytes: performance
            .getEntriesByType('resource')
            .reduce(
              (sum, entry) =>
                sum + (entry as PerformanceResourceTiming).transferSize,
              0,
            ),
        }));
        expect(metrics.lcp_ms).toBeGreaterThan(0);
        const dir = `../../output/playwright/ui-refinement/performance-${process.env.KM_UI_PHASE ?? 'after'}`;
        mkdirSync(dir, { recursive: true });
        writeFileSync(
          `${dir}/${name}-${run}.json`,
          JSON.stringify(
            {
              metrics,
              cpu: 4,
              latency_ms: 150,
              synthetic: true,
              mode: 'production',
            },
            null,
            2,
          ),
        );
      });
}
