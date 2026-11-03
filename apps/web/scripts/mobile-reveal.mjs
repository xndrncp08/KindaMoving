/** Separate mobile reveal profile: Lighthouse/axe can scroll and initialize off-screen widgets. */
import puppeteer from 'puppeteer-core';
import { chromium, devices } from '@playwright/test';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
const base = process.env.KM_LAB_URL ?? 'http://127.0.0.1:3015';
const state = JSON.parse(readFileSync(process.env.KM_E2E_STATE, 'utf8'));
assert(
  process.env.KM_LAB_RUN && state.cookies.length,
  'Synthetic run/state required',
);
const out = resolve(process.env.KM_LAB_OUT ?? 'output/phase5/reveal');
mkdirSync(out, { recursive: true, mode: 0o700 });
const browser = await puppeteer.launch({
  executablePath: chromium.executablePath(),
  headless: true,
  args: ['--no-sandbox', '--enable-unsafe-swiftshader'],
});
try {
  await browser.defaultBrowserContext().setCookie(...state.cookies);
  const page = await browser.newPage();
  await page.setViewport({
    width: 393,
    height: 852,
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
  });
  await page.setUserAgent(devices['Pixel 7'].userAgent);
  const profile = await page.goto(base + '/api/profile');
  assert(
    !profile.headers()['content-security-policy']?.includes("'unsafe-eval'"),
    'Production build required',
  );
  const identity = await page.evaluate(
    () => JSON.parse(document.body.innerText).id,
  );
  assert(identity, 'Authenticated synthetic identity required');
  const session = await page.createCDPSession();
  await session.send('Network.enable');
  await session.send('Network.clearBrowserCache');
  await session.send('Network.setCacheDisabled', { cacheDisabled: true });
  const commands = [
    ['Emulation.setCPUThrottlingRate', { rate: 4 }],
    [
      'Network.emulateNetworkConditions',
      {
        offline: false,
        latency: 150,
        downloadThroughput: (1638.4 * 1024) / 8,
        uploadThroughput: (675 * 1024) / 8,
      },
    ],
  ];
  for (const [method, params] of commands) await session.send(method, params);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  // A real streams response plus the Load control signals client hydration, without a sleep.
  const streams = page.waitForResponse(
    (r) => r.url().includes('/api/activity-streams/') && r.status() === 200,
  );
  await page.goto(base + '/app/activities/' + process.env.KM_LAB_RUN);
  await streams;
  await page.waitForSelector('.run-map button');
  const viewport = await page.evaluate(() => ({
    width: innerWidth,
    height: innerHeight,
    dpr: devicePixelRatio,
  }));
  assert.equal(viewport.width, 393);
  assert(Math.abs(viewport.height - 852) <= 1, 'Unexpected mobile viewport');
  await page.evaluate(() => {
    window.kmRevealTasks = [];
    new PerformanceObserver((list) =>
      window.kmRevealTasks.push(
        ...list.getEntries().map((e) => ({ duration: e.duration })),
      ),
    ).observe({ type: 'longtask' });
  });
  const observations = {};
  for (const [name, target, ready, block] of [
    ['mapCanvas', '.run-map', '.run-map .maplibregl-canvas', 'end'],
    ['chart', '#streams-title', '.streams .recharts-line-curve', 'start'],
  ]) {
    const initiallyMounted = !!(await page.$(ready));
    const started = await page.evaluate(
      ({ target, block }) => {
        window.kmRevealTasks = [];
        document
          .querySelector(target)
          .scrollIntoView({ behavior: 'instant', block });
        return performance.now();
      },
      { target, block },
    );
    await page.waitForSelector(ready);
    observations[name] = {
      initiallyMounted,
      ...(await page.evaluate(async (started) => {
        await new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        );
        return {
          elapsedMs: performance.now() - started,
          longTasks: window.kmRevealTasks,
        };
      }, started)),
    };
  }
  assert.deepEqual(errors, []);
  assert.equal(
    await page.evaluate(
      async () => (await (await fetch('/api/profile')).json()).id,
    ),
    identity,
  );
  const report = {
    kind: 'Single emulated post-navigation sample, not INP or tile readiness',
    viewport,
    commands,
    observations,
    hydrationErrors: errors,
  };
  writeFileSync(out + '/reveal.json', JSON.stringify(report, null, 2) + '\n', {
    mode: 0o600,
  });
  console.log(JSON.stringify(report));
} finally {
  await browser.close();
}
