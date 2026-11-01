import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

test('nonce CSP permits hydration/theme and blocks untrusted scripts', async ({
  page,
}) => {
  const response = await page.goto('/');
  const csp = response!.headers()['content-security-policy'];
  expect(csp).toContain("'strict-dynamic'");
  if (process.env.PW_PRODUCTION === '1')
    expect(csp).not.toContain('unsafe-eval');
  const nonce = await page
    .locator('script[nonce]')
    .first()
    .evaluate((el) => (el as HTMLScriptElement).nonce);
  expect(nonce.length).toBeGreaterThan(10);
  await page.getByRole('link', { name: 'Start your running story' }).click();
  await expect(
    page.getByRole('heading', { name: 'Find your stride.' }),
  ).toBeVisible();
  await page.route('**/csp-attack', (r) =>
    r.fulfill({
      contentType: 'text/html',
      headers: { 'Content-Security-Policy': csp },
      body: `<html><head><script>window.__untrustedRan=true</script><script nonce="${nonce}">document.documentElement.dataset.trusted='yes';</script></head><body>Probe</body></html>`,
    }),
  );
  await page.goto('/csp-attack');
  await expect(page.locator('html')).toHaveAttribute('data-trusted', 'yes');
  expect(await page.evaluate(() => '__untrustedRan' in window)).toBe(false);
});

test('MapLibre module and actual worker operate under the application CSP', async ({
  page,
}) => {
  const response = await page.goto('/');
  const csp = response!.headers()['content-security-policy'];
  const nonce = await page
    .locator('script[nonce]')
    .first()
    .evaluate((el) => (el as HTMLScriptElement).nonce);
  const dist = resolve(process.cwd(), '../../node_modules/maplibre-gl/dist');
  await page.route('**/probe/maplibre-gl.mjs', (r) =>
    r.fulfill({
      contentType: 'text/javascript',
      body: readFileSync(resolve(dist, 'maplibre-gl.mjs')),
    }),
  );
  await page.route('**/probe/maplibre-gl-shared.mjs', (r) =>
    r.fulfill({
      contentType: 'text/javascript',
      body: readFileSync(resolve(dist, 'maplibre-gl-shared.mjs')),
    }),
  );
  await page.route('**/csp-map-probe', (r) =>
    r.fulfill({
      headers: { 'Content-Security-Policy': csp },
      contentType: 'text/html',
      body: `<div id="map" style="width:300px;height:300px"></div><script type="module" nonce="${nonce}">import * as m from '/probe/maplibre-gl.mjs';m.setWorkerUrl('/maplibre-gl-worker.mjs');window.violations=[];document.addEventListener('securitypolicyviolation',e=>window.violations.push(e.effectiveDirective));const map=new m.Map({container:'map',style:{version:8,sources:{route:{type:'geojson',data:{type:'Feature',properties:{},geometry:{type:'LineString',coordinates:[[-114.07,51.05],[-114.08,51.06]]}}}},layers:[{id:'route',type:'line',source:'route',paint:{'line-color':'#00ff00'}}]},center:[-114.07,51.05],zoom:10});map.on('idle',()=>{window.mapReady=map.isSourceLoaded('route');});</script>`,
    }),
  );
  await page.goto('/csp-map-probe');
  await expect
    .poll(
      () =>
        page.evaluate(() =>
          Boolean((window as unknown as { mapReady: boolean }).mapReady),
        ),
      { timeout: 20000 },
    )
    .toBe(true);
  expect(
    await page.evaluate(
      () => (window as unknown as { violations: string[] }).violations,
    ),
  ).toEqual([]);
});
