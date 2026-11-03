/** Component-only lab; no Supabase session, map, real-user data or field/INP claim. */
import puppeteer from 'puppeteer-core';
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync } from 'node:fs';
const base = new URL(process.env.KM_LAB_URL ?? 'http://127.0.0.1:3016');
assert(
  ['127.0.0.1', 'localhost'].includes(base.hostname),
  'Loopback fixture only',
);
const results = [];
for (let trial = 1; trial <= 5; trial++) {
  const browser = await puppeteer.launch({
    executablePath: chromium.executablePath(),
    headless: true,
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({
      width: 393,
      height: 852,
      deviceScaleFactor: 1,
      isMobile: true,
    });
    const session = await page.createCDPSession();
    await session.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    await page.goto(new URL('/chart-lab', base).href, {
      waitUntil: 'networkidle0',
    });
    assert(await page.$('button'), 'Fixture missing');
    await page.evaluate(() => {
      window.labTasks = [];
      new PerformanceObserver((list) =>
        window.labTasks.push(...list.getEntries().map((e) => e.duration)),
      ).observe({ type: 'longtask' });
      window.labStart = performance.now();
    });
    await page.click('main button');
    await page.waitForSelector('.streams .recharts-line-curve');
    results.push({
      trial,
      ...(await page.evaluate(async () => {
        await new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        );
        return {
          elapsedMs: performance.now() - window.labStart,
          longTasksMs: window.labTasks,
        };
      })),
    });
  } finally {
    await browser.close();
  }
}
mkdirSync('output/phase6', { recursive: true });
writeFileSync(
  'output/phase6/chart-lab.json',
  JSON.stringify(
    {
      scope:
        'synthetic 600-point component mount, CPU4x; not authenticated app or INP',
      results,
    },
    null,
    2,
  ),
);
console.log(JSON.stringify(results));
