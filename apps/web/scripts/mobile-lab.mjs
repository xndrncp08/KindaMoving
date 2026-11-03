/** Authenticated cold-client lab. Run only with an existing synthetic account's
 * private Playwright state; no credentials or state are written into reports.
 * Lighthouse is pinned so protocol instrumentation is a reproducible assertion.
 */
import lighthouse from 'lighthouse';
import puppeteer from 'puppeteer-core';
import { chromium } from '@playwright/test';
import { ProtocolSession } from 'lighthouse/core/gather/session.js';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

const base = process.env.KM_LAB_URL ?? 'http://127.0.0.1:3000';
const state = JSON.parse(readFileSync(process.env.KM_E2E_STATE, 'utf8'));
const run = process.env.KM_LAB_RUN;
if (!run || !state.cookies?.length)
  throw new Error('Provide synthetic KM_LAB_RUN and KM_E2E_STATE');
const out = resolve(process.env.KM_LAB_OUT ?? 'output/phase5/lab');
mkdirSync(out, { recursive: true, mode: 0o700 });
const results = [];
let commands = [];
const send = ProtocolSession.prototype.sendCommand;
ProtocolSession.prototype.sendCommand = function (method, ...args) {
  if (
    [
      'Emulation.setCPUThrottlingRate',
      'Network.emulateNetworkConditions',
    ].includes(method)
  )
    commands.push({ method, params: args[0] });
  return send.call(this, method, ...args);
};
const cases = {
  'home-first': ['/app', false],
  'home-remembered': ['/app', true],
  analyze: ['/app/activities/' + run, true],
};
for (const key of (
  process.env.KM_LAB_PAGES ?? Object.keys(cases).join(',')
).split(',')) {
  for (let i = 0; i < Number(process.env.KM_LAB_RUNS ?? 3); i++) {
    const [path, remembered] = cases[key];
    const browser = await puppeteer.launch({
      executablePath: chromium.executablePath(),
      headless: true,
      args: ['--no-sandbox', '--enable-unsafe-swiftshader'],
    });
    try {
      const context = browser.defaultBrowserContext();
      await context.setCookie(
        ...state.cookies.filter(
          (c) => c.name !== 'km-tz' && c.name !== 'km-locale',
        ),
      );
      if (remembered)
        await context.setCookie(
          ...[
            ['km-tz', 'America/Edmonton'],
            ['km-locale', 'en-CA'],
          ].map(([name, value]) => ({
            name,
            value: encodeURIComponent(value),
            url: base,
          })),
        );
      const page = await browser.newPage();
      const probe = await page.goto(base + '/api/profile');
      if (probe.headers()['content-security-policy']?.includes("'unsafe-eval'"))
        throw new Error('Development server rejected before measurement');
      const identity = await page.evaluate(
        () => JSON.parse(document.body.innerText).id,
      );
      if (!identity)
        throw new Error('Synthetic session failed before navigation');
      const session = await page.target().createCDPSession();
      await session.send('Network.clearBrowserCache');
      await session.send('Network.setCacheDisabled', { cacheDisabled: true });
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      commands = [];
      const result = await lighthouse(
        base + path,
        {
          logLevel: 'error',
          output: 'json',
          onlyCategories: ['performance', 'accessibility'],
          throttlingMethod: 'devtools',
          disableStorageReset: true,
          formFactor: 'mobile',
          throttling: {
            cpuSlowdownMultiplier: 4,
            requestLatencyMs: 150,
            downloadThroughputKbps: 1638.4,
            uploadThroughputKbps: 675,
          },
          screenEmulation: {
            mobile: true,
            width: 393,
            height: 852,
            deviceScaleFactor: 1,
            disabled: false,
          },
        },
        undefined,
        page,
      );
      const { lhr, artifacts } = result;
      if (
        (lhr.audits['network-requests']?.details?.items ?? []).some((r) =>
          /next-devtools|_development_|webpack-hmr/.test(r.url),
        )
      )
        throw new Error('Development server: measurement rejected');
      if (
        lhr.runtimeError ||
        new URL(lhr.finalDisplayedUrl).pathname !== path ||
        errors.length
      )
        throw new Error(
          'Invalid navigation/hydration: ' +
            JSON.stringify({ runtime: lhr.runtimeError, errors }),
        );
      if (
        !commands.some(
          (c) =>
            c.method === 'Emulation.setCPUThrottlingRate' &&
            c.params.rate === 4,
        ) ||
        !commands.some(
          (c) =>
            c.method === 'Network.emulateNetworkConditions' &&
            c.params.latency > 0 &&
            c.params.downloadThroughput > 0,
        )
      )
        throw new Error('Applied throttling was not observed');
      const authenticated = await page.evaluate(
        async () => (await (await fetch('/api/profile')).json()).id,
      );
      if (authenticated !== identity)
        throw new Error('Authentication changed during measurement');
      const a = lhr.audits;
      const summary = {
        page: key,
        trial: i + 1,
        commit: execFileSync('git', ['rev-parse', 'HEAD'], {
          encoding: 'utf8',
        }).trim(),
        lighthouse: lhr.lighthouseVersion,
        browser: lhr.environment.hostUserAgent,
        performance: lhr.categories.performance.score,
        accessibility: lhr.categories.accessibility.score,
        lcpMs: a['largest-contentful-paint'].numericValue,
        tbtMs: a['total-blocking-time'].numericValue,
        cls: a['cumulative-layout-shift'].numericValue,
        fcpMs: a['first-contentful-paint'].numericValue,
        ttfbMs: a['server-response-time'].numericValue,
        throttling: lhr.configSettings.throttling,
        appliedCommands: commands,
        hydrationErrors: errors,
        mainThread: a['mainthread-work-breakdown'].details?.items,
        bootup: a['bootup-time'].details?.items?.map((x) => ({
          url: new URL(x.url, base).pathname,
          total: x.total,
          scripting: x.scripting,
          scriptParseCompile: x.scriptParseCompile,
        })),
        longTasks: a['long-tasks'].details?.items?.map((x) => ({
          url: x.url,
          startTime: x.startTime,
          duration: x.duration,
        })),
      };
      // Raw traces/logs can contain session headers. Keep them private/ignored.
      writeFileSync(
        `${out}/${key}-${i + 1}.trace.json`,
        JSON.stringify(artifacts.Trace),
        { mode: 0o600 },
      );
      writeFileSync(`${out}/${key}-${i + 1}.lhr.json`, JSON.stringify(lhr), {
        mode: 0o600,
      });
      writeFileSync(
        `${out}/${key}-${i + 1}.json`,
        JSON.stringify(summary, null, 2),
        { mode: 0o600 },
      );
      results.push(summary);
      console.log(
        JSON.stringify({
          page: key,
          trial: i + 1,
          lcpMs: summary.lcpMs,
          tbtMs: summary.tbtMs,
          performance: summary.performance,
          accessibility: summary.accessibility,
        }),
      );
    } finally {
      await browser.close();
    }
  }
}
writeFileSync(`${out}/summary.json`, JSON.stringify(results, null, 2), {
  mode: 0o600,
});
